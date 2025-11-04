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

$email = trim((string)($user['email'] ?? ''));
if($email === ''){
    echo json_encode(['requests' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $mysqli->prepare(
    'SELECT r.id,
            r.listing_id,
            r.owner_id,
            r.requester_name,
            r.requester_email,
            r.requester_phone,
            r.message,
            r.status,
            r.created_at,
            l.title AS listing_title,
            l.price AS listing_price,
            l.province AS listing_province
     FROM listing_booking_requests r
     JOIN listings l ON l.id = r.listing_id
     WHERE r.requester_email = ?
     ORDER BY r.created_at DESC
     LIMIT 200'
);

if(!$stmt){
    error_log('user/my_booking_requests prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'prepare_failed']);
    exit;
}

$stmt->bind_param('s', $email);
if(!$stmt->execute()){
    $stmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'query_failed']);
    exit;
}

$result = $stmt->get_result();
$requests = [];
while($row = $result->fetch_assoc()){
    $requests[] = [
        'id' => (int)$row['id'],
        'listing_id' => (int)$row['listing_id'],
        'listing_title' => $row['listing_title'] ?? null,
        'listing_price' => $row['listing_price'] !== null ? (float)$row['listing_price'] : null,
        'listing_province' => $row['listing_province'] ?? null,
        'status' => $row['status'] ?? 'pending',
        'message' => $row['message'] ?? null,
        'created_at' => $row['created_at'] ?? null,
        'requester_phone' => $row['requester_phone'] ?? null,
    ];
}
$stmt->close();

echo json_encode(['requests' => $requests], JSON_UNESCAPED_UNICODE);
