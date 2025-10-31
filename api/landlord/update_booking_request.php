<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if(!is_array($body)){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_payload']);
    exit;
}

$requestId = isset($body['request_id']) ? (int)$body['request_id'] : 0;
$status = isset($body['status']) ? strtolower(trim($body['status'])) : '';

$allowedStatuses = ['pending', 'contacted', 'closed'];
if($requestId <= 0 || !in_array($status, $allowedStatuses, true)){
    http_response_code(422);
    echo json_encode(['error' => 'validation_failed']);
    exit;
}

$mysqli = db_connect();
$auth = require_landlord_or_admin($mysqli);
if(!$auth){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$updateStmt = null;
if($auth['role'] === 'admin'){
    $updateStmt = $mysqli->prepare('UPDATE listing_booking_requests SET status = ? WHERE id = ?');
    if(!$updateStmt){
        error_log('landlord/update_booking_request prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'prepare_failed']);
        exit;
    }
    $updateStmt->bind_param('si', $status, $requestId);
} else {
    $ownerId = (int)$auth['id'];
    $updateStmt = $mysqli->prepare('UPDATE listing_booking_requests SET status = ? WHERE id = ? AND owner_id = ?');
    if(!$updateStmt){
        error_log('landlord/update_booking_request prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'prepare_failed']);
        exit;
    }
    $updateStmt->bind_param('sii', $status, $requestId, $ownerId);
}

if(!$updateStmt->execute()){
    error_log('landlord/update_booking_request execute failed: ' . $updateStmt->error);
    $updateStmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'update_failed']);
    exit;
}

if($updateStmt->affected_rows === 0){
    $updateStmt->close();
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}
$updateStmt->close();

$selectSql = 'SELECT r.id, r.listing_id, r.owner_id, r.requester_name, r.requester_email, r.requester_phone, r.message, r.status, r.created_at, l.title AS listing_title '
    . 'FROM listing_booking_requests r '
    . 'JOIN listings l ON r.listing_id = l.id '
    . 'WHERE r.id = ?';

if($auth['role'] !== 'admin'){
    $selectSql .= ' AND r.owner_id = ?';
}

$selectStmt = $mysqli->prepare($selectSql);
if(!$selectStmt){
    error_log('landlord/update_booking_request select prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'select_prepare_failed']);
    exit;
}

if($auth['role'] === 'admin'){
    $selectStmt->bind_param('i', $requestId);
} else {
    $ownerId = (int)$auth['id'];
    $selectStmt->bind_param('ii', $requestId, $ownerId);
}

$selectStmt->execute();
$result = $selectStmt->get_result();
$updatedRow = $result->fetch_assoc();
$selectStmt->close();

if(!$updatedRow){
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}

$response = [
    'id' => (int)$updatedRow['id'],
    'listing_id' => (int)$updatedRow['listing_id'],
    'listing_title' => $updatedRow['listing_title'] ?? null,
    'requester_name' => $updatedRow['requester_name'] ?? null,
    'requester_email' => $updatedRow['requester_email'] ?? null,
    'requester_phone' => $updatedRow['requester_phone'] ?? null,
    'message' => $updatedRow['message'] ?? null,
    'status' => $updatedRow['status'] ?? 'pending',
    'created_at' => $updatedRow['created_at'] ?? null,
];

echo json_encode(['success' => true, 'request' => $response], JSON_UNESCAPED_UNICODE);
