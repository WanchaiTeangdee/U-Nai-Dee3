<?php
header('Content-Type: application/json; charset=utf-8');
require 'config.php';
$input = json_decode(file_get_contents('php://input'), true);
$token = $input['token'] ?? null;
if(!$token){ http_response_code(400); echo json_encode(['error'=>'token required']); exit; }
$mysqli = db_connect();
$stmt = $mysqli->prepare('DELETE FROM tokens WHERE token = ?');
$stmt->bind_param('s', $token);
$stmt->execute();
$stmt->close();

echo json_encode(['ok'=>true]);
?>