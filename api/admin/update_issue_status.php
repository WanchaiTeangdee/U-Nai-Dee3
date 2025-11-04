<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
  http_response_code(405);
  echo json_encode(['error' => 'method_not_allowed']);
  exit;
}

$mysqli = db_connect();
$auth = require_admin($mysqli);
if(!$auth){
  http_response_code(403);
  echo json_encode(['error' => 'forbidden']);
  exit;
}

$body = json_decode(file_get_contents('php://input'), true);
if(!is_array($body)) $body = [];

$issueId = isset($body['issue_id']) ? (int)$body['issue_id'] : 0;
$status = isset($body['status']) ? trim((string)$body['status']) : '';
$note = isset($body['note']) ? trim((string)$body['note']) : '';

if($issueId <= 0){
  http_response_code(422);
  echo json_encode(['error' => 'invalid_issue']);
  exit;
}

$allowedStatuses = ['new', 'in_progress', 'resolved', 'closed'];
if(!in_array($status, $allowedStatuses, true)){
  http_response_code(422);
  echo json_encode(['error' => 'invalid_status']);
  exit;
}

$stmt = $mysqli->prepare('UPDATE issues SET status = ?, last_admin_note = ?, updated_at = NOW() WHERE id = ?');
if(!$stmt){
  error_log('update_issue_status prepare failed: ' . $mysqli->error);
  http_response_code(500);
  echo json_encode(['error' => 'internal_error']);
  exit;
}

$stmt->bind_param('ssi', $status, $note, $issueId);
if(!$stmt->execute()){
  error_log('update_issue_status execute failed: ' . $stmt->error);
  http_response_code(500);
  echo json_encode(['error' => 'update_failed']);
  $stmt->close();
  exit;
}

$rows = $stmt->affected_rows;
$stmt->close();

echo json_encode([
  'success' => $rows > 0
]);
