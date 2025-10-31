<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$auth = require_admin($mysqli);
if(!$auth){
  http_response_code(403);
  echo json_encode(['error' => 'forbidden']);
  exit;
}

$data = [
  'visitors_today' => 0,
  'total_users' => 0,
];

$visRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM analytics WHERE DATE(visited_at) = CURDATE()");
if($visRes){
  $row = $visRes->fetch_assoc();
  $data['visitors_today'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats visitors query failed: ' . $mysqli->error);
}

$userRes = $mysqli->query('SELECT COUNT(*) AS cnt FROM users');
if($userRes){
  $row = $userRes->fetch_assoc();
  $data['total_users'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats total users query failed: ' . $mysqli->error);
}

echo json_encode($data);
