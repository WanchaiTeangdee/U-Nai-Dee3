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

if(strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
$listingId = isset($payload['listing_id']) ? (int)$payload['listing_id'] : 0;
if($listingId <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_listing']);
    exit;
}

$listingStmt = $mysqli->prepare('SELECT id, user_id, status, title FROM listings WHERE id = ? LIMIT 1');
if(!$listingStmt){
    error_log('chat/get_or_create_thread listing prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$listingStmt->bind_param('i', $listingId);
$listingStmt->execute();
$listingResult = $listingStmt->get_result();
$listing = $listingResult->fetch_assoc();
$listingStmt->close();

if(!$listing){
    http_response_code(404);
    echo json_encode(['error' => 'listing_not_found']);
    exit;
}

$landlordId = isset($listing['user_id']) ? (int)$listing['user_id'] : 0;
if($landlordId <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_landlord']);
    exit;
}

if($user['id'] === $landlordId){
    http_response_code(400);
    echo json_encode(['error' => 'owner_cannot_initiate']);
    exit;
}

$role = strtolower(trim((string)($user['role'] ?? '')));
if($role === 'landlord' || $role === 'host' || $role === 'admin'){
    http_response_code(403);
    echo json_encode(['error' => 'customer_only']);
    exit;
}

$customerId = (int)$user['id'];

$conversationStmt = $mysqli->prepare('SELECT id FROM listing_conversations WHERE listing_id = ? AND customer_id = ? LIMIT 1');
if(!$conversationStmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$conversationStmt->bind_param('ii', $listingId, $customerId);
$conversationStmt->execute();
$result = $conversationStmt->get_result();
$row = $result->fetch_assoc();
$conversationStmt->close();

if($row){
    echo json_encode([
        'conversation' => [
            'id' => (int)$row['id'],
            'listing_id' => $listingId,
            'listing_title' => $listing['title'],
            'customer_id' => $customerId,
            'landlord_id' => $landlordId,
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$createStmt = $mysqli->prepare('INSERT INTO listing_conversations (listing_id, customer_id, landlord_id) VALUES (?, ?, ?)');
if(!$createStmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}
$createStmt->bind_param('iii', $listingId, $customerId, $landlordId);
if(!$createStmt->execute()){
    if($mysqli->errno === 1062){
        // duplicate, fetch again
        $createStmt->close();
        $conversationStmt = $mysqli->prepare('SELECT id FROM listing_conversations WHERE listing_id = ? AND customer_id = ? LIMIT 1');
        if($conversationStmt){
            $conversationStmt->bind_param('ii', $listingId, $customerId);
            $conversationStmt->execute();
            $retry = $conversationStmt->get_result()->fetch_assoc();
            $conversationStmt->close();
            if($retry){
                echo json_encode([
                    'conversation' => [
                        'id' => (int)$retry['id'],
                        'listing_id' => $listingId,
                        'listing_title' => $listing['title'],
                        'customer_id' => $customerId,
                        'landlord_id' => $landlordId,
                    ]
                ], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }
    http_response_code(500);
    echo json_encode(['error' => 'conversation_create_failed']);
    exit;
}
$conversationId = $createStmt->insert_id;
$createStmt->close();

echo json_encode([
    'conversation' => [
        'id' => (int)$conversationId,
        'listing_id' => $listingId,
        'listing_title' => $listing['title'],
        'customer_id' => $customerId,
        'landlord_id' => $landlordId,
    ]
], JSON_UNESCAPED_UNICODE);
