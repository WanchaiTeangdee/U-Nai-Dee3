<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';
require_once __DIR__ . '/../listing_helpers.php';

do {
    if($_SERVER['REQUEST_METHOD'] !== 'POST'){
        http_response_code(405);
        echo json_encode(['error' => 'method_not_allowed']);
        break;
    }

    $mysqli = db_connect();
    $auth = require_admin($mysqli);
    if(!$auth){
        http_response_code(403);
        echo json_encode(['error' => 'forbidden']);
        break;
    }

    $rawInput = file_get_contents('php://input');
    $payload = json_decode($rawInput, true);
    if(!is_array($payload)){
        $payload = $_POST;
    }

    $listingId = isset($payload['listing_id']) ? (int)$payload['listing_id'] : 0;
    $status = isset($payload['status']) ? trim((string)$payload['status']) : '';
    $allowedStatuses = ['pending', 'active', 'inactive'];

    if($listingId <= 0 || !in_array($status, $allowedStatuses, true)){
        http_response_code(422);
        echo json_encode(['error' => 'validation_failed']);
        break;
    }

    $stmt = $mysqli->prepare('UPDATE listings SET status = ?, updated_at = NOW() WHERE id = ?');
    if(!$stmt){
        error_log('admin/update_listing_status prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'prepare_failed']);
        break;
    }

    $stmt->bind_param('si', $status, $listingId);
    if(!$stmt->execute()){
        error_log('admin/update_listing_status execute failed: ' . $stmt->error);
        $stmt->close();
        http_response_code(500);
        echo json_encode(['error' => 'update_failed']);
        break;
    }
    $stmt->close();

    $detail = $mysqli->prepare('SELECT id, status, updated_at FROM listings WHERE id = ? LIMIT 1');
    if(!$detail){
        error_log('admin/update_listing_status detail prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'detail_failed']);
        break;
    }

    $detail->bind_param('i', $listingId);
    $detail->execute();
    $result = $detail->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $detail->close();

    if(!$row){
        http_response_code(404);
        echo json_encode(['error' => 'not_found']);
        break;
    }

    $listing = [
        'id' => (int)$row['id'],
        'status' => $row['status'],
        'updated_at' => $row['updated_at'] ?? null,
    ];

    record_listing_status_log(
        $mysqli,
        (int)$listingId,
        $listing['status'],
        $auth['id'] ?? null,
        $auth['role'] ?? null,
        'admin_status_update'
    );

    echo json_encode(['success' => true, 'listing' => $listing], JSON_UNESCAPED_UNICODE);
} while(false);
