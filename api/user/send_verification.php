<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

if(strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'){
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

$userId = (int)$user['id'];

// Email verification has been disabled/auto-verified in this deployment.
// Return successful response indicating the account is already verified.
echo json_encode([
    'success' => true,
    'already_verified' => true
], JSON_UNESCAPED_UNICODE);
