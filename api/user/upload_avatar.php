<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once '../config.php';
require_once '../auth_helpers.php';

// Check authentication
$user = require_auth();
if (!$user) {
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized', 'message' => 'Authentication required']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed', 'message' => 'Only POST method is allowed']);
    exit;
}

// Check if file was uploaded
if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'no_file', 'message' => 'No avatar file uploaded']);
    exit;
}

$file = $_FILES['avatar'];

// Validate file type
$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!in_array($file['type'], $allowedTypes)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid_type', 'message' => 'Only JPEG, PNG, GIF, and WebP images are allowed']);
    exit;
}

// Validate file size (max 5MB)
$maxSize = 5 * 1024 * 1024; // 5MB
if ($file['size'] > $maxSize) {
    http_response_code(400);
    echo json_encode(['error' => 'file_too_large', 'message' => 'File size must not exceed 5MB']);
    exit;
}

// Create uploads/avatars directory if it doesn't exist
$uploadDir = __DIR__ . '/../../uploads/avatars/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Generate unique filename
$extension = pathinfo($file['name'], PATHINFO_EXTENSION);
$filename = 'avatar_' . $user['id'] . '_' . time() . '.' . $extension;
$filepath = $uploadDir . $filename;

// Move uploaded file
if (!move_uploaded_file($file['tmp_name'], $filepath)) {
    http_response_code(500);
    echo json_encode(['error' => 'upload_failed', 'message' => 'Failed to save avatar file']);
    exit;
}

// Update user avatar in database
try {
    $stmt = $pdo->prepare("UPDATE users SET avatar = ? WHERE id = ?");
    $avatarUrl = '/uploads/avatars/' . $filename;
    $stmt->execute([$avatarUrl, $user['id']]);

    echo json_encode([
        'success' => true,
        'avatar_url' => $avatarUrl,
        'message' => 'Avatar uploaded successfully'
    ]);

} catch (Exception $e) {
    // Remove uploaded file if database update fails
    if (file_exists($filepath)) {
        unlink($filepath);
    }

    error_log('Avatar upload database error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'database_error', 'message' => 'Failed to update avatar in database']);
}
?>
