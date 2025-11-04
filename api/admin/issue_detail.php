<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$issueId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if($issueId <= 0){
  http_response_code(400);
  echo json_encode(['error' => 'invalid_issue']);
  exit;
}

$mysqli = db_connect();
$auth = require_admin($mysqli);
if(!$auth){
  http_response_code(403);
  echo json_encode(['error' => 'forbidden']);
  exit;
}

$stmt = $mysqli->prepare('
  SELECT i.id, i.subject, i.category, i.priority, i.status, i.message, i.created_at, i.updated_at,
         i.reporter_name, i.reporter_email, i.reporter_role,
         u.name AS user_name, u.email AS user_email, u.role AS user_role
  FROM issues i
  LEFT JOIN users u ON i.user_id = u.id
  WHERE i.id = ?
');

if(!$stmt){
  error_log('issue_detail prepare failed: ' . $mysqli->error);
  http_response_code(500);
  echo json_encode(['error' => 'internal_error']);
  exit;
}

$stmt->bind_param('i', $issueId);
$stmt->execute();
$result = $stmt->get_result();
$issue = $result->fetch_assoc();
$stmt->close();

if(!$issue){
  http_response_code(404);
  echo json_encode(['error' => 'not_found']);
  exit;
}

$issueData = [
  'id' => (int)$issue['id'],
  'subject' => $issue['subject'] ?? '-',
  'category' => $issue['category'] ?? '-',
  'priority' => $issue['priority'] ?? 'normal',
  'status' => $issue['status'] ?? 'new',
  'message' => $issue['message'] ?? '',
  'created_at' => $issue['created_at'] ?? null,
  'updated_at' => $issue['updated_at'] ?? null,
  'reporter' => $issue['user_name'] ?? $issue['reporter_name'] ?? '-',
  'reporter_email' => $issue['user_email'] ?? $issue['reporter_email'] ?? null,
  'reporter_role' => $issue['user_role'] ?? $issue['reporter_role'] ?? null
];

$replyStmt = $mysqli->prepare('
  SELECT ir.id, ir.issue_id, ir.message, ir.created_at, ir.responder_id, ir.responder_name,
         u.name AS user_name
  FROM issue_replies ir
  LEFT JOIN users u ON ir.responder_id = u.id
  WHERE ir.issue_id = ?
  ORDER BY ir.created_at ASC
');

$replies = [];
if($replyStmt){
  $replyStmt->bind_param('i', $issueId);
  $replyStmt->execute();
  $res = $replyStmt->get_result();
  while($row = $res->fetch_assoc()){
    $replies[] = [
      'id' => (int)$row['id'],
      'message' => $row['message'] ?? '',
      'created_at' => $row['created_at'] ?? null,
      'responder_id' => isset($row['responder_id']) ? (int)$row['responder_id'] : null,
      'responder_name' => $row['user_name'] ?? $row['responder_name'] ?? 'ทีมงาน'
    ];
  }
  $replyStmt->close();
}

$issueData['replies'] = $replies;

echo json_encode(['issue' => $issueData]);
