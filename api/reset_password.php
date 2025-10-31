<?php
header('Content-Type: application/json; charset=utf-8');
require 'config.php';

$input = json_decode(file_get_contents('php://input'), true);
$token = isset($input['token']) ? trim($input['token']) : null;
$password = isset($input['password']) ? $input['password'] : null;
if(!$token || !$password){ http_response_code(400); echo json_encode(['error'=>'token and password required']); exit; }
if(strlen($password) < 8){ http_response_code(400); echo json_encode(['error'=>'password must be at least 8 chars']); exit; }

$mysqli = db_connect();
$stmt = $mysqli->prepare('SELECT id, user_id, expires_at FROM password_resets WHERE token = ?');
$stmt->bind_param('s', $token); $stmt->execute(); $stmt->bind_result($rid, $uid, $expires_at); $found = $stmt->fetch(); $stmt->close();
if(!$found){ http_response_code(400); echo json_encode(['error'=>'invalid token']); exit; }
if(strtotime($expires_at) < time()){ http_response_code(400); echo json_encode(['error'=>'token expired']); exit; }

$hash = password_hash($password, PASSWORD_BCRYPT);
$stmt = $mysqli->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
$stmt->bind_param('si', $hash, $uid); $stmt->execute(); $stmt->close();

// delete all password reset tokens for this user
$stmt = $mysqli->prepare('DELETE FROM password_resets WHERE user_id = ?');
$stmt->bind_param('i', $uid); $stmt->execute(); $stmt->close();

echo json_encode(['ok'=>true]);
?>
