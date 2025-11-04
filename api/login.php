<?php
header('Content-Type: application/json; charset=utf-8');
require 'config.php';

$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : null;
$password = isset($input['password']) ? $input['password'] : null;

if(!$email || !$password){ http_response_code(400); echo json_encode(['error'=>'email and password required']); exit; }

// basic input validation
if(!filter_var($email, FILTER_VALIDATE_EMAIL)){ http_response_code(400); echo json_encode(['error'=>'invalid email']); exit; }
if(strlen($password) < 6){ http_response_code(400); echo json_encode(['error'=>'password too short']); exit; }

// simple IP-based rate limiting using tmp files (works on XAMPP)
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$limitDir = __DIR__ . '/../tmp';
if(!is_dir($limitDir)) @mkdir($limitDir, 0700, true);
$key = 'login_' . preg_replace('/[^a-z0-9_\-\.]/i', '_', $ip);
$fp = $limitDir . '/' . $key . '.json';
$data = ['count'=>0,'first'=>time()];
if(file_exists($fp)){
	$raw = @file_get_contents($fp);
	$data = $raw ? json_decode($raw, true) : $data;
}
$window = 300; // 5 minutes
$max = 10; // max attempts per window
if(time() - ($data['first'] ?? 0) < $window){
	if(($data['count'] ?? 0) >= $max){ http_response_code(429); echo json_encode(['error'=>'too many attempts, try again later']); exit; }
} else {
	$data = ['count'=>0,'first'=>time()];
}

$mysqli = db_connect();
$stmt = $mysqli->prepare('SELECT id, password_hash, name, role, phone, last_login, email_verified, email_verified_at FROM users WHERE email = ?');
$stmt->bind_param('s', $email);
$stmt->execute();
$stmt->bind_result($id, $hash, $name, $role, $phone, $lastLogin, $emailVerified, $emailVerifiedAt);
$found = $stmt->fetch();
$stmt->close();

if(!$found || !password_verify($password, $hash)){
	// increment counter
	$data['count'] = ($data['count'] ?? 0) + 1;
	file_put_contents($fp, json_encode($data));
	http_response_code(401); echo json_encode(['error'=>'invalid credentials']); exit;
}

// successful login -> reset counter file
@unlink($fp);

// capture the previous last_login before updating
$previousLastLogin = $lastLogin ?: null;
$now = date('Y-m-d H:i:s');
$updateStmt = $mysqli->prepare('UPDATE users SET last_login = ? WHERE id = ? LIMIT 1');
if($updateStmt){
	$updateStmt->bind_param('si', $now, $id);
	$updateStmt->execute();
	$updateStmt->close();
} else {
	error_log('Failed to prepare last_login update for user ' . $id . ': ' . $mysqli->error);
}

// create simple token
$token = bin2hex(random_bytes(24));
$expires = date('Y-m-d H:i:s', strtotime('+7 days'));
// if client requested 'remember', extend expiry to 90 days
$remember = isset($input['remember']) && $input['remember'] ? true : false;
if($remember){ $expires = date('Y-m-d H:i:s', strtotime('+90 days')); }
$stmt = $mysqli->prepare('INSERT INTO tokens (user_id, token, expires_at) VALUES (?, ?, ?)');
$stmt->bind_param('iss', $id, $token, $expires);
$stmt->execute();
$stmt->close();

echo json_encode([
	'token' => $token,
	'user' => [
		'id' => $id,
		'email' => $email,
		'name' => $name,
		'role' => $role,
		'phone' => $phone,
		'email_verified' => (int)($emailVerified ?? 0),
		'email_verified_at' => $emailVerifiedAt,
		'last_login' => $now,
		'last_login_previous' => $previousLastLogin
	]
]);

?>
