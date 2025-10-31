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

$sql = "SELECT id, category, reporter_name, title, status, created_at FROM reports ORDER BY created_at DESC LIMIT 500";
$result = $mysqli->query($sql);
$issues = [];
if($result){
  while($row = $result->fetch_assoc()){
    $issues[] = [
      'id' => (int)$row['id'],
      'type' => $row['category'] ?? '-',
      'reporter' => $row['reporter_name'] ?? '-',
      'title' => $row['title'] ?? '-',
      'status' => $row['status'] ?? '-',
      'created_at' => $row['created_at'] ?? '-',
    ];
  }
} else {
  error_log('admin/issues query failed: ' . $mysqli->error);
}

echo json_encode(['issues' => $issues]);
