<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$user = require_auth($mysqli);
if(!$user){
  http_response_code(401);
  echo json_encode(['error' => 'unauthorized']);
  exit;
}

$issues = [];
$issueIds = [];

$sql = "
  SELECT id, subject, category, priority, status, message, created_at, updated_at
  FROM issues
  WHERE user_id = ?
  ORDER BY created_at DESC
  LIMIT 200
";

if($stmt = $mysqli->prepare($sql)){
  $stmt->bind_param('i', $user['id']);
  $stmt->execute();
  $result = $stmt->get_result();
  while($row = $result->fetch_assoc()){
    $issueId = (int)$row['id'];
    $issueIds[] = $issueId;
    $issues[$issueId] = [
      'id' => $issueId,
      'subject' => $row['subject'] ?? '-',
      'category' => $row['category'] ?? '-',
      'priority' => $row['priority'] ?? 'normal',
      'status' => $row['status'] ?? 'new',
      'message' => $row['message'] ?? '',
      'created_at' => $row['created_at'] ?? null,
      'updated_at' => $row['updated_at'] ?? null,
      'replies' => []
    ];
  }
  $stmt->close();
}

if(!empty($issueIds)){
  $placeholders = implode(',', array_fill(0, count($issueIds), '?'));
  $types = str_repeat('i', count($issueIds));
  $replySql = "
    SELECT ir.id, ir.issue_id, ir.message, ir.created_at, ir.responder_id, ir.responder_name,
           COALESCE(u.name, ir.responder_name) AS display_name
    FROM issue_replies ir
    LEFT JOIN users u ON ir.responder_id = u.id
    WHERE ir.issue_id IN ($placeholders)
    ORDER BY ir.created_at ASC
  ";

  $stmt = $mysqli->prepare($replySql);
  if($stmt){
    $stmt->bind_param($types, ...$issueIds);
    $stmt->execute();
    $res = $stmt->get_result();
    while($row = $res->fetch_assoc()){
      $issueId = (int)$row['issue_id'];
      if(!isset($issues[$issueId])) continue;
      $issues[$issueId]['replies'][] = [
        'id' => (int)$row['id'],
        'message' => $row['message'] ?? '',
        'created_at' => $row['created_at'] ?? null,
        'responder_id' => isset($row['responder_id']) ? (int)$row['responder_id'] : null,
        'responder_name' => $row['display_name'] ?? ($row['responder_name'] ?? 'ทีมงาน')
      ];
    }
    $stmt->close();
  }
}

echo json_encode([
  'issues' => array_values($issues)
]);
