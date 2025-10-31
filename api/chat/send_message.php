<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

if(strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$mysqli = db_connect();
$user = require_auth($mysqli);
if(!$user){
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

$rawInput = file_get_contents('php://input');
$contentType = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
$isJson = stripos($contentType, 'application/json') !== false;

if($isJson){
    $payload = json_decode($rawInput ?: '[]', true);
    if(!is_array($payload)){
        http_response_code(400);
        echo json_encode(['error' => 'invalid_payload']);
        exit;
    }
    $conversationId = isset($payload['conversation_id']) ? (int)$payload['conversation_id'] : 0;
    $messageInput = isset($payload['message']) ? trim((string)$payload['message']) : '';
    $uploadedFile = null;
} else {
    $payload = $_POST;
    $conversationId = isset($payload['conversation_id']) ? (int)$payload['conversation_id'] : 0;
    $messageInput = isset($payload['message']) ? trim((string)$payload['message']) : '';
    $uploadedFile = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
}

if($conversationId <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_conversation']);
    exit;
}
if($messageInput === '' && empty($uploadedFile)){
    http_response_code(400);
    echo json_encode(['error' => 'message_required']);
    exit;
}
$messageTemp = mb_substr($messageInput, 0, 2000, 'UTF-8');
$storedMessage = $messageTemp;
$messageType = 'text';
$attachmentPath = null;

if($uploadedFile && $uploadedFile['error'] !== UPLOAD_ERR_NO_FILE){
    if($uploadedFile['error'] !== UPLOAD_ERR_OK){
        http_response_code(400);
        echo json_encode(['error' => 'upload_failed']);
        exit;
    }
    if($uploadedFile['size'] > 5 * 1024 * 1024){
        http_response_code(400);
        echo json_encode(['error' => 'file_too_large']);
        exit;
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($uploadedFile['tmp_name']);
    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/gif' => 'gif',
        'image/webp' => 'webp'
    ];
    if(!isset($allowed[$mime])){
        http_response_code(400);
        echo json_encode(['error' => 'unsupported_file_type']);
        exit;
    }
    $extension = $allowed[$mime];
    $baseDir = realpath(__DIR__ . '/../');
    $uploadDir = $baseDir . '/uploads/chat/' . date('Y/m');
    if(!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true)){
        http_response_code(500);
        echo json_encode(['error' => 'upload_directory_failed']);
        exit;
    }
    $fileName = bin2hex(random_bytes(8)) . '.' . $extension;
    $targetPath = $uploadDir . '/' . $fileName;
    if(!move_uploaded_file($uploadedFile['tmp_name'], $targetPath)){
        http_response_code(500);
        echo json_encode(['error' => 'upload_move_failed']);
        exit;
    }
    $relativePath = 'api/uploads/chat/' . date('Y/m') . '/' . $fileName;
    $attachmentPath = resolve_attachment_public_path($relativePath);
    $encodedCaption = $messageTemp !== '' ? base64_encode($messageTemp) : '';
    $storedMessage = 'image::' . $relativePath;
    if($encodedCaption !== ''){
        $storedMessage .= '|' . $encodedCaption;
    }
    $messageType = 'image';
    $messageTemp = $messageTemp; // keep caption for response
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

$customerId = (int)$conversation['customer_id'];
$landlordId = (int)$conversation['landlord_id'];
$senderId = (int)$user['id'];
if($senderId !== $customerId && $senderId !== $landlordId && $user['role'] !== 'admin'){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$messageStmt = $mysqli->prepare('INSERT INTO listing_messages (conversation_id, sender_id, message) VALUES (?, ?, ?)');
if(!$messageStmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$messageStmt->bind_param('iis', $conversationId, $senderId, $storedMessage);
if(!$messageStmt->execute()){
    $messageStmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'message_send_failed']);
    exit;
}
$messageId = $messageStmt->insert_id;
$messageStmt->close();

$updateStmt = $mysqli->prepare('UPDATE listing_conversations SET updated_at = NOW() WHERE id = ?');
if($updateStmt){
    $updateStmt->bind_param('i', $conversationId);
    $updateStmt->execute();
    $updateStmt->close();
}

$createdAt = date(DATE_ATOM);

echo json_encode([
    'success' => true,
    'message' => format_message_payload([
        'id' => (int)$messageId,
        'conversation_id' => $conversationId,
        'sender_id' => $senderId,
        'message' => $storedMessage,
        'created_at' => $createdAt
    ], $senderId === (int)$user['id'], $user)
], JSON_UNESCAPED_UNICODE);

function format_message_payload(array $row, bool $isOwn, array $sender = null){
    $parsed = parse_stored_message($row['message']);
    return [
        'id' => (int)$row['id'],
        'conversation_id' => (int)$row['conversation_id'],
        'sender_id' => (int)$row['sender_id'],
        'sender_name' => $sender['name'] ?? ($sender['email'] ?? null),
        'sender_email' => $sender['email'] ?? null,
        'message' => $parsed['text'],
        'message_type' => $parsed['type'],
        'attachment_url' => $parsed['attachment_url'],
        'created_at' => $row['created_at'],
        'is_sender' => $isOwn
    ];
}

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
