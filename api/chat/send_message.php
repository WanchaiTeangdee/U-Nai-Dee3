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

$payload = json_decode(file_get_contents('php://input'), true);
$conversationId = isset($payload['conversation_id']) ? (int)$payload['conversation_id'] : 0;
$messageInput = isset($payload['message']) ? trim((string)$payload['message']) : '';

if($conversationId <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_conversation']);
    exit;
}
if($messageInput === ''){
    http_response_code(400);
    echo json_encode(['error' => 'message_required']);
    exit;
}
$message = mb_substr($messageInput, 0, 2000, 'UTF-8');

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
$messageStmt->bind_param('iis', $conversationId, $senderId, $message);
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
    'message' => [
        'id' => (int)$messageId,
        'conversation_id' => $conversationId,
        'sender_id' => $senderId,
        // use `body` to align with client-side shape; keep legacy `message` for compatibility
        'body' => $message,
        'message' => $message,
        'created_at' => $createdAt,
        'is_own' => true
    ]
], JSON_UNESCAPED_UNICODE);
