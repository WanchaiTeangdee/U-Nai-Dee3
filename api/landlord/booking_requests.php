<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$auth = require_landlord_or_admin($mysqli);
if(!$auth){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$ownerId = (int)$auth['id'];
if($auth['role'] === 'admin' && isset($_GET['owner_id'])){
    $ownerId = (int)$_GET['owner_id'];
}

$sql = 'SELECT r.id, r.listing_id, r.owner_id, r.requester_name, r.requester_email, r.requester_phone, r.message, r.status, r.created_at, l.title AS listing_title '
     . 'FROM listing_booking_requests r '
     . 'JOIN listings l ON r.listing_id = l.id '
     . 'WHERE r.owner_id = ? '
     . 'ORDER BY r.created_at DESC '
     . 'LIMIT 500';

$stmt = $mysqli->prepare($sql);
if(!$stmt){
    error_log('landlord/booking_requests prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'prepare_failed']);
    exit;
}

$stmt->bind_param('i', $ownerId);
$stmt->execute();
$result = $stmt->get_result();
$requests = [];
while($row = $result->fetch_assoc()){
    $requests[] = [
        'id' => (int)$row['id'],
        'listing_id' => (int)$row['listing_id'],
        'listing_title' => $row['listing_title'] ?? null,
        'requester_name' => $row['requester_name'] ?? null,
        'requester_email' => $row['requester_email'] ?? null,
        'requester_phone' => $row['requester_phone'] ?? null,
        'message' => $row['message'] ?? null,
        'status' => $row['status'] ?? 'pending',
        'created_at' => $row['created_at'] ?? null,
    ];
}
$stmt->close();

echo json_encode(['requests' => $requests], JSON_UNESCAPED_UNICODE);
