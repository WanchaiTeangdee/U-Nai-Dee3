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

$sql = "SELECT l.id, l.title, l.status, l.updated_at, l.contact, COALESCE(u.name, u.email) AS owner_name FROM listings l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.updated_at DESC LIMIT 500";
$listings = [];
$result = $mysqli->query($sql);
if($result){
  while($row = $result->fetch_assoc()){
    $listings[] = [
      'id' => (int)$row['id'],
      'title' => $row['title'],
  'owner' => $row['owner_name'] ?? '-',
  'contact' => $row['contact'] ?? '-',
  'status' => $row['status'] ?? '-',
  'updated_at' => $row['updated_at'] ?? '-',
    ];
  }
} else {
  error_log('admin/listings query failed: ' . $mysqli->error);
}

echo json_encode(['listings' => $listings]);
