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
$user = require_auth($mysqli);
if(!$user){
  http_response_code(401);
  echo json_encode(['error' => 'unauthorized']);
  exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if(!is_array($payload)){
  $payload = [];
}

$subject = trim((string)($payload['subject'] ?? ''));
$message = trim((string)($payload['message'] ?? ''));
$category = trim((string)($payload['category'] ?? 'ทั่วไป'));
$priority = trim((string)($payload['priority'] ?? 'normal'));

$allowedPriorities = ['low','normal','high','urgent'];
if(!in_array($priority, $allowedPriorities, true)){
  $priority = 'normal';
}

if($subject === '' || $message === ''){
  http_response_code(422);
  echo json_encode(['error' => 'กรุณากรอกหัวข้อและรายละเอียดปัญหา']);
  exit;
}

$subject = function_exists('mb_substr') ? mb_substr($subject, 0, 255) : substr($subject, 0, 255);
$category = function_exists('mb_substr') ? mb_substr($category, 0, 100) : substr($category, 0, 100);

$reporterName = $user['name'] ?? '';
if($reporterName === ''){
  $reporterName = $user['email'] ?? 'ผู้ใช้งาน';
}
$reporterEmail = $user['email'] ?? null;
$reporterRole = $user['role'] ?? null;

// Inspect existing columns to stay compatible with older database schemas.
$columns = [];
$columnsResult = @$mysqli->query('SHOW COLUMNS FROM issues');
if(!$columnsResult){
  $errno = (int)$mysqli->errno;
  error_log('issues/create describe failed: ' . $mysqli->error);
  http_response_code(500);
  if($errno === 1146){
    echo json_encode([
      'error' => 'schema_missing',
      'message' => 'ไม่พบตาราง issues กรุณารันสคริปต์ schema/issues.sql เพื่อสร้างตาราง',
    ], JSON_UNESCAPED_UNICODE);
  } else {
    echo json_encode(['error' => 'ไม่สามารถบันทึกข้อมูลได้']);
  }
  exit;
}
while($row = $columnsResult->fetch_assoc()){
  $columns[strtolower($row['Field'])] = true;
}
$columnsResult->free();

if(!isset($columns['subject']) || !isset($columns['message'])){
  http_response_code(500);
  echo json_encode([
    'error' => 'schema_outdated',
    'message' => 'โครงสร้างตาราง issues ไม่รองรับการบันทึก กรุณาอัปเดตฐานข้อมูลด้วยไฟล์ schema/issues.sql',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$fields = [];
$placeholders = [];
$types = '';
$bindParams = [];

$userIdParam = (int)$user['id'];
$reporterNameParam = $reporterName;
$reporterEmailParam = $reporterEmail ?? '';
$reporterRoleParam = $reporterRole ?? '';
$subjectParam = $subject;
$categoryParam = $category;
$priorityParam = $priority;
$messageParam = $message;

$appendField = function ($column, $type, &$value) use (&$fields, &$placeholders, &$types, &$bindParams) {
  $fields[] = $column;
  $placeholders[] = '?';
  $types .= $type;
  $bindParams[] = &$value;
};

if(isset($columns['user_id'])){
  $appendField('user_id', 'i', $userIdParam);
}
if(isset($columns['reporter_name'])){
  $appendField('reporter_name', 's', $reporterNameParam);
}
if(isset($columns['reporter_email'])){
  $appendField('reporter_email', 's', $reporterEmailParam);
}
if(isset($columns['reporter_role'])){
  $appendField('reporter_role', 's', $reporterRoleParam);
}
if(isset($columns['subject'])){
  $appendField('subject', 's', $subjectParam);
}
if(isset($columns['category'])){
  $appendField('category', 's', $categoryParam);
}
if(isset($columns['priority'])){
  $appendField('priority', 's', $priorityParam);
}
if(isset($columns['message'])){
  $appendField('message', 's', $messageParam);
}

if(empty($fields)){
  http_response_code(500);
  echo json_encode([
    'error' => 'schema_outdated',
    'message' => 'ไม่สามารถบันทึกข้อมูลได้เนื่องจากคอลัมน์ในตาราง issues ไม่ตรงกับที่ระบบรองรับ',
  ], JSON_UNESCAPED_UNICODE);
  exit;
}

$sql = 'INSERT INTO issues (' . implode(', ', $fields) . ') VALUES (' . implode(', ', $placeholders) . ')';
$stmt = $mysqli->prepare($sql);
if(!$stmt){
  error_log('issues/create prepare failed: ' . $mysqli->error);
  http_response_code(500);
  echo json_encode(['error' => 'ไม่สามารถบันทึกข้อมูลได้']);
  exit;
}

$bindArgs = [];
$bindArgs[] = &$types;
foreach($bindParams as &$ref){
  $bindArgs[] = &$ref;
}
unset($ref);

if(!call_user_func_array([$stmt, 'bind_param'], $bindArgs)){
  error_log('issues/create bind_param failed: ' . $stmt->error);
  http_response_code(500);
  echo json_encode(['error' => 'ไม่สามารถบันทึกข้อมูลได้']);
  $stmt->close();
  exit;
}

if(!$stmt->execute()){
  error_log('issues/create execute failed: ' . $stmt->error);
  http_response_code(500);
  echo json_encode(['error' => 'ไม่สามารถบันทึกข้อมูลได้']);
  $stmt->close();
  exit;
}

$newId = $stmt->insert_id;
$stmt->close();

echo json_encode([
  'success' => true,
  'issue_id' => (int)$newId
]);
