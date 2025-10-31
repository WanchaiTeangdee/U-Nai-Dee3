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

$method = $_SERVER['REQUEST_METHOD'];
$input = json_decode(file_get_contents('php://input'), true);

switch($method){
  case 'GET':
    // Existing GET logic
    $sql = "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT 500";
    $result = $mysqli->query($sql);
    $users = [];
    while($row = $result->fetch_assoc()){
      $users[] = [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'created_at' => $row['created_at'],
      ];
    }

    $counts = [
      'total_users' => (int)$mysqli->query('SELECT COUNT(*) AS cnt FROM users')->fetch_assoc()['cnt'],
      'new_users_today' => (int)$mysqli->query("SELECT COUNT(*) AS cnt FROM users WHERE DATE(created_at) = CURDATE()")->fetch_assoc()['cnt'],
    ];

    echo json_encode(['users' => $users, 'counts' => $counts]);
    break;

  case 'POST':
    // Create new user
    $name = trim($input['name'] ?? '');
    $email = trim($input['email'] ?? '');
    $role = $input['role'] ?? 'customer';
    $password = $input['password'] ?? '';

    if(empty($name) || empty($email) || empty($password)){
      http_response_code(400);
      echo json_encode(['error' => 'Name, email, and password are required']);
      exit;
    }

    if(!filter_var($email, FILTER_VALIDATE_EMAIL)){
      http_response_code(400);
      echo json_encode(['error' => 'Invalid email format']);
      exit;
    }

    if(!in_array($role, ['customer', 'landlord', 'admin'])){
      http_response_code(400);
      echo json_encode(['error' => 'Invalid role']);
      exit;
    }

    // Check if email already exists
    $checkStmt = $mysqli->prepare("SELECT id FROM users WHERE email = ?");
    $checkStmt->bind_param('s', $email);
    $checkStmt->execute();
    if($checkStmt->get_result()->num_rows > 0){
      http_response_code(400);
      echo json_encode(['error' => 'Email already exists']);
      exit;
    }

    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $mysqli->prepare("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('ssss', $name, $email, $hashedPassword, $role);
    
    if($stmt->execute()){
      echo json_encode([
        'success' => true,
        'user' => [
          'id' => (int)$mysqli->insert_id,
          'name' => $name,
          'email' => $email,
          'role' => $role,
          'created_at' => date('Y-m-d H:i:s'),
        ]
      ]);
    } else {
      http_response_code(500);
      echo json_encode(['error' => 'Failed to create user']);
    }
    break;

  case 'PUT':
    // Update user
    $id = (int)($input['id'] ?? 0);
    $name = trim($input['name'] ?? '');
    $email = trim($input['email'] ?? '');
    $role = $input['role'] ?? '';
    $password = trim($input['password'] ?? '');

    if(!$id || empty($name) || empty($email)){
      http_response_code(400);
      echo json_encode(['error' => 'ID, name, and email are required']);
      exit;
    }

    if(!filter_var($email, FILTER_VALIDATE_EMAIL)){
      http_response_code(400);
      echo json_encode(['error' => 'Invalid email format']);
      exit;
    }

    if(!in_array($role, ['customer', 'landlord', 'admin'])){
      http_response_code(400);
      echo json_encode(['error' => 'Invalid role']);
      exit;
    }

    // Check if email exists for another user
    $checkStmt = $mysqli->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
    $checkStmt->bind_param('si', $email, $id);
    $checkStmt->execute();
    if($checkStmt->get_result()->num_rows > 0){
      http_response_code(400);
      echo json_encode(['error' => 'Email already exists']);
      exit;
    }

    if(!empty($password)){
      $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
      $stmt = $mysqli->prepare("UPDATE users SET name = ?, email = ?, role = ?, password = ? WHERE id = ?");
      $stmt->bind_param('ssssi', $name, $email, $role, $hashedPassword, $id);
    } else {
      $stmt = $mysqli->prepare("UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?");
      $stmt->bind_param('sssi', $name, $email, $role, $id);
    }
    
    if($stmt->execute()){
      echo json_encode([
        'success' => true,
        'user' => [
          'id' => $id,
          'name' => $name,
          'email' => $email,
          'role' => $role,
        ]
      ]);
    } else {
      http_response_code(500);
      echo json_encode(['error' => 'Failed to update user']);
    }
    break;

  case 'DELETE':
    // Delete user
    $id = (int)($input['id'] ?? 0);
    
    if(!$id){
      http_response_code(400);
      echo json_encode(['error' => 'ID is required']);
      exit;
    }

    if($id === (int)$auth['id']){
      http_response_code(400);
      echo json_encode(['error' => 'You cannot delete your own admin account']);
      exit;
    }

    $stmt = $mysqli->prepare("DELETE FROM users WHERE id = ?");
    $stmt->bind_param('i', $id);
    
    if($stmt->execute()){
      echo json_encode(['success' => true]);
    } else {
      http_response_code(500);
      echo json_encode(['error' => 'Failed to delete user']);
    }
    break;

  default:
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    break;
}
