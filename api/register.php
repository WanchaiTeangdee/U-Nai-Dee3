<?php
header('Content-Type: application/json; charset=utf-8');
require 'config.php';

$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : null;
$password = isset($input['password']) ? $input['password'] : null;
$name = isset($input['name']) ? trim($input['name']) : null;
$role = isset($input['role']) ? trim($input['role']) : 'customer';
$phone = isset($input['phone']) ? trim($input['phone']) : null;
if($role === 'host'){
	$role = 'landlord';
}

if(!$email || !$password){ http_response_code(400); echo json_encode(['error'=>'email and password required']); exit; }

if(!filter_var($email, FILTER_VALIDATE_EMAIL)){ http_response_code(400); echo json_encode(['error'=>'invalid email']); exit; }
if(strlen($password) < 8){ http_response_code(400); echo json_encode(['error'=>'password must be at least 8 chars']); exit; }

if($phone !== null && $phone !== ''){
	if(!preg_match('/^[0-9+\-()\s]{7,20}$/', $phone)){
		http_response_code(422);
		echo json_encode(['error' => 'invalid phone']);
		exit;
	}
} else {
	$phone = null;
}

$allowedRoles = ['customer','landlord','admin'];
if(!in_array($role, $allowedRoles, true)){
	$role = 'customer';
}
// Prevent public signup with admin role for safety
if($role === 'admin'){
	$role = 'customer';
}

// rate limit by IP for registrations
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$limitDir = __DIR__ . '/../tmp';
if(!is_dir($limitDir)) @mkdir($limitDir, 0700, true);
$key = 'register_' . preg_replace('/[^a-z0-9_\-\.]/i', '_', $ip);
$fp = $limitDir . '/' . $key . '.json';
$data = ['count'=>0,'first'=>time()];
if(file_exists($fp)){
	$raw = @file_get_contents($fp);
	$data = $raw ? json_decode($raw, true) : $data;
}
$window = 3600; // 1 hour
$max = 5; // max registrations per IP per window
if(time() - ($data['first'] ?? 0) < $window){
	if(($data['count'] ?? 0) >= $max){ http_response_code(429); echo json_encode(['error'=>'too many registration attempts, try later']); exit; }
} else {
	$data = ['count'=>0,'first'=>time()];
}

$mysqli = db_connect();

// check existing
$stmt = $mysqli->prepare('SELECT id FROM users WHERE email = ?');
$stmt->bind_param('s', $email);
$stmt->execute();
$stmt->store_result();
if($stmt->num_rows > 0){ http_response_code(409); echo json_encode(['error'=>'email already exists']); exit; }
$stmt->close();

$hash = password_hash($password, PASSWORD_BCRYPT);
$verifiedAt = date('Y-m-d H:i:s');
$stmt = $mysqli->prepare('INSERT INTO users (email, password_hash, name, role, phone, email_verified, email_verified_at) VALUES (?, ?, ?, ?, ?, 1, ?)');
$stmt->bind_param('ssssss', $email, $hash, $name, $role, $phone, $verifiedAt);
$ok = $stmt->execute();
if(!$ok){ http_response_code(500); echo json_encode(['error'=>'failed to create user']); exit; }
$uid = $stmt->insert_id;
$stmt->close();

// increment registration counter for IP
$data['count'] = ($data['count'] ?? 0) + 1;
file_put_contents($fp, json_encode($data));

// return basic user details
echo json_encode([
	'success' => true,
	'user' => [
		'id' => $uid,
		'email' => $email,
		'name' => $name,
		'role' => $role,
		'phone' => $phone,
		'email_verified' => 1,
		'email_verified_at' => $verifiedAt
	]
]);

?>