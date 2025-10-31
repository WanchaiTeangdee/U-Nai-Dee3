<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$auth = require_landlord_or_admin($mysqli);
if(!$auth){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$targetUserId = (int)$auth['id'];
if($auth['role'] === 'admin' && isset($_GET['user_id'])){
    $targetUserId = (int)$_GET['user_id'];
}

$stmt = $mysqli->prepare('SELECT id, title, property_type, price, province, address, description, contact, latitude, longitude, amenities, status, updated_at FROM listings WHERE user_id = ? ORDER BY updated_at DESC');
if(!$stmt){
    error_log('landlord/my_listings prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'prepare_failed']);
    exit;
}

$stmt->bind_param('i', $targetUserId);
$stmt->execute();
$result = $stmt->get_result();
$listings = [];
while($row = $result->fetch_assoc()){
    $amenities = [];
    if(!empty($row['amenities'])){
        $decoded = json_decode($row['amenities'], true);
        if(is_array($decoded)){
            $amenities = array_values(array_filter($decoded, 'strlen'));
        }
    }

    $contacts = [];
    if(!empty($row['contact'])){
        $decodedContacts = json_decode($row['contact'], true);
        if(is_array($decodedContacts)){
            foreach($decodedContacts as $entry){
                if(!is_array($entry)) continue;
                $type = $entry['type'] ?? '';
                $value = $entry['value'] ?? '';
                if($type !== '' && $value !== ''){
                    $contacts[] = ['type' => $type, 'value' => $value];
                }
            }
        }
    }

    $listings[] = [
        'id' => (int)$row['id'],
        'title' => $row['title'],
        'property_type' => $row['property_type'],
        'price' => (float)$row['price'],
        'province' => $row['province'],
        'address' => $row['address'],
        'description' => $row['description'],
        'contact' => $row['contact'],
        'contact_methods' => $contacts,
        'latitude' => $row['latitude'] !== null ? (float)$row['latitude'] : null,
        'longitude' => $row['longitude'] !== null ? (float)$row['longitude'] : null,
        'amenities' => $amenities,
        'status' => $row['status'],
        'updated_at' => $row['updated_at'],
        'images' => [],
        'image_count' => 0,
    ];
}
$stmt->close();

if($listings){
    $ids = array_column($listings, 'id');
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $imgSql = "SELECT listing_id, file_path FROM listing_images WHERE listing_id IN ($placeholders) ORDER BY id ASC";
    $imgStmt = $mysqli->prepare($imgSql);
    if($imgStmt){
        $imgStmt->bind_param($types, ...$ids);
        $imgStmt->execute();
        $imgRes = $imgStmt->get_result();
        $imagesMap = [];
        while($imgRow = $imgRes->fetch_assoc()){
            $lid = (int)$imgRow['listing_id'];
            $imagesMap[$lid][] = $imgRow['file_path'];
        }
        $imgStmt->close();

        foreach($listings as &$listing){
            $imgs = $imagesMap[$listing['id']] ?? [];
            $listing['images'] = $imgs;
            $listing['image_count'] = count($imgs);
        }
        unset($listing);
    }
}

echo json_encode(['listings' => $listings], JSON_UNESCAPED_UNICODE);
