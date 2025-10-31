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

$sql = "SELECT id, tenant_name, listing_title, period_text, status, created_at FROM bookings ORDER BY created_at DESC LIMIT 500";
$result = $mysqli->query($sql);
$bookings = [];
if($result){
  while($row = $result->fetch_assoc()){
    $bookings[] = [
      'id' => (int)$row['id'],
      'tenant' => $row['tenant_name'] ?? '-',
      'listing' => $row['listing_title'] ?? '-',
      'period' => $row['period_text'] ?? '-',
      'status' => $row['status'] ?? '-',
      'created_at' => $row['created_at'] ?? '-',
    ];
  }
} else {
  error_log('admin/bookings query failed: ' . $mysqli->error);
}

$counts = [
  'new_bookings_today' => 0,
];
$statRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM bookings WHERE DATE(created_at) = CURDATE()");
if($statRes){
  $row = $statRes->fetch_assoc();
  $counts['new_bookings_today'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/bookings count query failed: ' . $mysqli->error);
}

echo json_encode(['bookings' => $bookings, 'counts' => $counts]);
