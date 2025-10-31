<?php
header('Content-Type: application/json; charset=utf-8');
require 'config.php';

$input = json_decode(file_get_contents('php://input'), true);
$email = isset($input['email']) ? trim($input['email']) : null;
if(!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)){ http_response_code(400); echo json_encode(['error'=>'invalid email']); exit; }

$mysqli = db_connect();
$stmt = $mysqli->prepare('SELECT id FROM users WHERE email = ?');
$stmt->bind_param('s', $email); $stmt->execute(); $stmt->bind_result($uid); $found = $stmt->fetch(); $stmt->close();
if(!$found){ // do not reveal whether email exists for security; return 200
  echo json_encode(['ok'=>true]); exit;
}

$token = bin2hex(random_bytes(24));
$expires = date('Y-m-d H:i:s', strtotime('+2 hours'));
$stmt = $mysqli->prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)');
$stmt->bind_param('iss', $uid, $token, $expires); $stmt->execute(); $stmt->close();

// Normally you would email a reset link. For local/dev we return a debug link so testing is easy.
$reset_link = sprintf('%s/reset_password.php?token=%s', (isset($_SERVER['HTTP_HOST'])?('http://'.$_SERVER['HTTP_HOST']):''), $token);

echo json_encode(['ok'=>true, 'debug_link'=>$reset_link]);
?>
