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

$data = json_decode(file_get_contents('php://input'), true);
if(!is_array($data)) $data = [];

$issueId = isset($data['issue_id']) ? (int)$data['issue_id'] : 0;
$message = isset($data['message']) ? trim((string)$data['message']) : '';

if($issueId <= 0 || $message === ''){
  http_response_code(422);
  echo json_encode(['error' => 'invalid_input']);
  exit;
}

$message = function_exists('mb_substr') ? mb_substr($message, 0, 4000) : substr($message, 0, 4000);

$stmt = $mysqli->prepare('INSERT INTO issue_replies (issue_id, responder_id, responder_name, message) VALUES (?, ?, ?, ?)');
if(!$stmt){
  error_log('reply_issue prepare failed: ' . $mysqli->error);
  http_response_code(500);
  echo json_encode(['error' => 'internal_error']);
  exit;
}

$responderName = $auth['name'] ?? $auth['email'] ?? 'Admin';
$stmt->bind_param('iiss', $issueId, $auth['id'], $responderName, $message);

if(!$stmt->execute()){
  error_log('reply_issue execute failed: ' . $stmt->error);
  http_response_code(500);
  echo json_encode(['error' => 'save_failed']);
  $stmt->close();
  exit;
}

$stmt->close();

// Ensure status moves to in_progress if still new
$updateStmt = $mysqli->prepare("UPDATE issues SET status = CASE WHEN status = 'new' THEN 'in_progress' ELSE status END, updated_at = NOW() WHERE id = ?");
if($updateStmt){
  $updateStmt->bind_param('i', $issueId);
  $updateStmt->execute();
  $updateStmt->close();
}

echo json_encode(['success' => true]);
