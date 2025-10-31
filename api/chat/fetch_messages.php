<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$user = require_auth($mysqli);
if(!$user){
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

$conversationId = isset($_GET['conversation_id']) ? (int)$_GET['conversation_id'] : 0;
if($conversationId <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_conversation']);
    exit;
}

$conversationStmt = $mysqli->prepare('SELECT id, listing_id, customer_id, landlord_id FROM listing_conversations WHERE id = ? LIMIT 1');
if(!$conversationStmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$conversationStmt->bind_param('i', $conversationId);
$conversationStmt->execute();
$conversationRes = $conversationStmt->get_result();
$conversation = $conversationRes->fetch_assoc();
$conversationStmt->close();

if(!$conversation){
    http_response_code(404);
    echo json_encode(['error' => 'conversation_not_found']);
    exit;
}

$participantIds = [(int)$conversation['customer_id'], (int)$conversation['landlord_id']];
if(!in_array((int)$user['id'], $participantIds, true) && $user['role'] !== 'admin'){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$viewerId = (int)$user['id'];
if($viewerId === (int)$conversation['customer_id'] || $viewerId === (int)$conversation['landlord_id']){
    $markStmt = $mysqli->prepare('UPDATE listing_messages SET read_at = NOW() WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL');
    if($markStmt){
        $markStmt->bind_param('ii', $conversationId, $viewerId);
        $markStmt->execute();
        $markStmt->close();
    }
}

$afterId = isset($_GET['after_id']) ? (int)$_GET['after_id'] : 0;
$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
if($limit <= 0){
    $limit = 50;
}
if($limit > 200){
    $limit = 200;
}

$messageStmt = $mysqli->prepare('SELECT m.id, m.sender_id, m.message, m.created_at, u.name AS sender_name, u.email AS sender_email FROM listing_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT ?');
if(!$messageStmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$messageStmt->bind_param('iii', $conversationId, $afterId, $limit);
$messageStmt->execute();
$messageRes = $messageStmt->get_result();
$messages = [];
while($row = $messageRes->fetch_assoc()){
    $parsed = parse_stored_message($row['message']);
    $messages[] = [
        'id' => (int)$row['id'],
        'sender_id' => (int)$row['sender_id'],
        'sender_name' => $row['sender_name'] ?? null,
        'sender_email' => $row['sender_email'] ?? null,
        'message' => $parsed['text'],
        'message_type' => $parsed['type'],
        'attachment_url' => $parsed['attachment_url'],
        'created_at' => $row['created_at'],
        'is_sender' => ((int)$row['sender_id'] === (int)$user['id'])
    ];
}
$messageStmt->close();

$response = [
    'conversation' => [
        'id' => (int)$conversation['id'],
        'listing_id' => (int)$conversation['listing_id'],
        'customer_id' => (int)$conversation['customer_id'],
        'landlord_id' => (int)$conversation['landlord_id'],
    ],
    'messages' => $messages,
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);

function parse_stored_message(string $stored){
    $type = 'text';
    $text = $stored;
    $attachment = null;
    if(strpos($stored, 'image::') === 0){
        $payload = substr($stored, 7);
        $caption = '';
        $path = $payload;
        if(strpos($payload, '|') !== false){
            [$path, $encodedCaption] = explode('|', $payload, 2);
            $decoded = base64_decode($encodedCaption, true);
            if($decoded !== false){
                $caption = $decoded;
            }
        }
        $type = 'image';
        $attachment = resolve_attachment_public_path($path);
        $text = $caption;
    }
    return [
        'type' => $type,
        'text' => $text,
        'attachment_url' => $attachment
    ];
}

function resolve_attachment_public_path(string $path){
    $trimmed = trim($path);
    if($trimmed === ''){
        return null;
    }
    if(preg_match('#^https?://#i', $trimmed)){
        return $trimmed;
    }
    $normalized = ltrim($trimmed, '/');
    if($normalized === ''){
        return null;
    }
    $projectRoot = realpath(__DIR__ . '/../..');
    if($projectRoot !== false){
        $normalizedFs = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $normalized);
        $candidate = $projectRoot . DIRECTORY_SEPARATOR . $normalizedFs;
        if(file_exists($candidate)){
            return '/' . $normalized;
        }
        $apiCandidate = $projectRoot . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . $normalizedFs;
        if(file_exists($apiCandidate)){
            return '/api/' . $normalized;
        }
    }
    return '/' . $normalized;
}
