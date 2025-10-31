<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../listing_helpers.php';

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if(!is_array($input)){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_payload']);
    exit;
}

$listId = isset($input['listing_id']) ? (int)$input['listing_id'] : 0;
$name = isset($input['name']) ? trim($input['name']) : '';
$email = isset($input['email']) ? trim($input['email']) : '';
$phone = isset($input['phone']) ? trim($input['phone']) : '';
$message = isset($input['message']) ? trim($input['message']) : '';

if($listId <= 0 || $name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)){
    http_response_code(422);
    echo json_encode(['error' => 'validation_failed']);
    exit;
}

$mysqli = db_connect();
if($mysqli->connect_errno){
    http_response_code(500);
    echo json_encode(['error' => 'database_unavailable']);
    exit;
}

$listingStmt = $mysqli->prepare('SELECT l.id, l.user_id, l.status, l.title FROM listings l WHERE l.id = ? LIMIT 1');
if(!$listingStmt){
    error_log('booking lookup prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'listing_lookup_failed']);
    exit;
}

$listingStmt->bind_param('i', $listId);
$listingStmt->execute();
$result = $listingStmt->get_result();
$listing = $result->fetch_assoc();
$listingStmt->close();

if(!$listing || $listing['status'] !== 'active'){
    http_response_code(404);
    echo json_encode(['error' => 'listing_not_available']);
    exit;
}

$ownerId = (int)$listing['user_id'];

$insert = $mysqli->prepare('INSERT INTO listing_booking_requests (listing_id, owner_id, requester_name, requester_email, requester_phone, message) VALUES (?, ?, ?, ?, ?, ?)');
if(!$insert){
    error_log('booking insert prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'insert_prepare_failed']);
    exit;
}

$phoneValue = $phone !== '' ? $phone : null;
$messageValue = $message !== '' ? $message : null;

$insert->bind_param(
    'iissss',
    $listId,
    $ownerId,
    $name,
    $email,
    $phoneValue,
    $messageValue
);

if(!$insert->execute()){
    error_log('booking insert execute failed: ' . $insert->error);
    http_response_code(500);
    echo json_encode(['error' => 'insert_failed']);
    $insert->close();
    exit;
}

$insert->close();

$bookingId = $mysqli->insert_id;

// Optional email notification (best-effort, ignore failure for now)
try {
    $ownerEmailStmt = $mysqli->prepare('SELECT email FROM users WHERE id = ? LIMIT 1');
    if($ownerEmailStmt){
        $ownerEmailStmt->bind_param('i', $ownerId);
        $ownerEmailStmt->execute();
        $ownerResult = $ownerEmailStmt->get_result();
        $ownerRow = $ownerResult->fetch_assoc();
        $ownerEmailStmt->close();
        if($ownerRow && isset($ownerRow['email'])){
            $subject = 'มีคำขอจองใหม่สำหรับประกาศของคุณ';
            $body = "สวัสดีค่ะ/ครับ\n\nมีคำขอจองใหม่สำหรับประกาศ: {$listing['title']}\n\nชื่อผู้ติดต่อ: {$name}\nอีเมล: {$email}\nโทรศัพท์: {$phone}\nข้อความ: {$message}\n\nกรุณาเข้าสู่ระบบเพื่อจัดการคำขอนี้.\n";
            @mail($ownerRow['email'], $subject, $body);
        }
    }
}catch(Throwable $e){
    error_log('booking email notify failed: ' . $e->getMessage());
}

echo json_encode(['success' => true, 'booking_id' => (int)$bookingId], JSON_UNESCAPED_UNICODE);
