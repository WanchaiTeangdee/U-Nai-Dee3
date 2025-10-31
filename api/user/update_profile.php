<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

if(strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
if(!is_array($payload)){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_payload']);
    exit;
}

$name = isset($payload['name']) ? trim((string)$payload['name']) : null;
$email = isset($payload['email']) ? trim((string)$payload['email']) : null;
$currentPassword = isset($payload['current_password']) ? (string)$payload['current_password'] : '';
$newPassword = isset($payload['new_password']) ? (string)$payload['new_password'] : '';
$confirmPassword = isset($payload['confirm_password']) ? (string)$payload['confirm_password'] : '';

if($email !== null && $email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)){
    http_response_code(422);
    echo json_encode(['error' => 'invalid_email']);
    exit;
}
if($name !== null && $name !== '' && mb_strlen($name, 'UTF-8') > 120){
    http_response_code(422);
    echo json_encode(['error' => 'name_too_long']);
    exit;
}

$changePassword = $newPassword !== '';
if($changePassword){
    if(strlen($newPassword) < 8){
        http_response_code(422);
        echo json_encode(['error' => 'password_too_short']);
        exit;
    }
    if($confirmPassword !== '' && $confirmPassword !== $newPassword){
        http_response_code(422);
        echo json_encode(['error' => 'password_mismatch']);
        exit;
    }
    if($currentPassword === ''){
        http_response_code(422);
        echo json_encode(['error' => 'current_password_required']);
        exit;
    }
}

$mysqli = db_connect();
$user = require_auth($mysqli);
if(!$user){
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

$userId = (int)$user['id'];

$profileStmt = $mysqli->prepare('SELECT email, name, password_hash FROM users WHERE id = ? LIMIT 1');
if(!$profileStmt){
    http_response_code(500);
    echo json_encode(['error' => 'profile_lookup_failed']);
    exit;
}
$profileStmt->bind_param('i', $userId);
$profileStmt->execute();
$profileRes = $profileStmt->get_result();
$current = $profileRes->fetch_assoc();
$profileStmt->close();

if(!$current){
    http_response_code(404);
    echo json_encode(['error' => 'profile_not_found']);
    exit;
}

$updates = [];
$params = [];
$types = '';

if($name !== null && $name !== '' && $name !== $current['name']){
    $updates['name'] = $name;
}

if($email !== null && $email !== '' && $email !== $current['email']){
    $checkStmt = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1');
    if(!$checkStmt){
        http_response_code(500);
        echo json_encode(['error' => 'email_check_failed']);
        exit;
    }
    $checkStmt->bind_param('si', $email, $userId);
    $checkStmt->execute();
    $checkStmt->store_result();
    if($checkStmt->num_rows > 0){
        $checkStmt->close();
        http_response_code(409);
        echo json_encode(['error' => 'email_exists']);
        exit;
    }
    $checkStmt->close();
    $updates['email'] = $email;
}

if($changePassword){
    if(!password_verify($currentPassword, $current['password_hash'] ?? '')){
        http_response_code(403);
        echo json_encode(['error' => 'current_password_invalid']);
        exit;
    }
    $newHash = password_hash($newPassword, PASSWORD_BCRYPT);
    $updates['password_hash'] = $newHash;
}

if(empty($updates)){
    echo json_encode([
        'success' => true,
        'user' => [
            'id' => $userId,
            'email' => $current['email'],
            'name' => $current['name'],
            'role' => $user['role']
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$setParts = [];
foreach($updates as $column => $value){
    $setParts[] = $column . ' = ?';
    if($column === 'password_hash'){
        $types .= 's';
        $params[] = $value;
    } else {
        $types .= 's';
        $params[] = $value;
    }
}
$types .= 'i';
$params[] = $userId;

$sql = 'UPDATE users SET ' . implode(', ', $setParts) . ' WHERE id = ? LIMIT 1';
$updateStmt = $mysqli->prepare($sql);
if(!$updateStmt){
    http_response_code(500);
    echo json_encode(['error' => 'update_prepare_failed']);
    exit;
}

$bindParams = [];
foreach($params as $index => $value){
    $bindParams[$index] = &$params[$index];
}
array_unshift($bindParams, $types);
call_user_func_array([$updateStmt, 'bind_param'], $bindParams);

if(!$updateStmt->execute()){
    $updateStmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'update_failed']);
    exit;
}
$updateStmt->close();

$newEmail = $updates['email'] ?? $current['email'];
$newName = $updates['name'] ?? $current['name'];

$response = [
    'success' => true,
    'user' => [
        'id' => $userId,
        'email' => $newEmail,
        'name' => $newName,
        'role' => $user['role']
    ]
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
