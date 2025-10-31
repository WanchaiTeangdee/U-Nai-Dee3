<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';

$mysqli = db_connect();
if($mysqli->connect_errno){
    http_response_code(500);
    echo json_encode(['error' => 'database_unavailable']);
    exit;
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if($id <= 0){
    http_response_code(400);
    echo json_encode(['error' => 'invalid_id']);
    exit;
}

$sql = 'SELECT l.id, l.user_id, l.title, l.property_type, l.price, l.province, l.address, l.description, l.contact, l.latitude, l.longitude, l.amenities, l.status, l.created_at, l.updated_at, COALESCE(u.name, u.email) AS owner_name FROM listings l LEFT JOIN users u ON l.user_id = u.id WHERE l.id = ? LIMIT 1';
$stmt = $mysqli->prepare($sql);
if(!$stmt){
    error_log('public/listing prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}

$stmt->bind_param('i', $id);
if(!$stmt->execute()){
    error_log('public/listing execute failed: ' . $stmt->error);
    http_response_code(500);
    echo json_encode(['error' => 'query_failed']);
    $stmt->close();
    exit;
}

$result = $stmt->get_result();
$row = $result->fetch_assoc();
$stmt->close();

if(!$row || $row['status'] !== 'active'){
    http_response_code(404);
    echo json_encode(['error' => 'listing_not_found']);
    exit;
}

$amenities = [];
if(!empty($row['amenities'])){
    $decoded = json_decode($row['amenities'], true);
    if(is_array($decoded)){
        foreach($decoded as $item){
            if(is_string($item)){
                $trimmed = trim($item);
                if($trimmed !== ''){
                    $amenities[] = mb_substr($trimmed, 0, 120, 'UTF-8');
                }
            }
        }
    }
}

$contacts = [];
if(!empty($row['contact'])){
    $decodedContacts = json_decode($row['contact'], true);
    if(is_array($decodedContacts)){
        foreach($decodedContacts as $entry){
            if(!is_array($entry)) continue;
            $type = isset($entry['type']) ? trim((string)$entry['type']) : '';
            $value = isset($entry['value']) ? trim((string)$entry['value']) : '';
            if($type !== '' && $value !== ''){
                $contacts[] = [
                    'type' => mb_substr($type, 0, 80, 'UTF-8'),
                    'value' => mb_substr($value, 0, 255, 'UTF-8'),
                ];
            }
        }
    }
}

$imageSql = 'SELECT file_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC';
$imageStmt = $mysqli->prepare($imageSql);
$images = [];
if($imageStmt){
    $imageStmt->bind_param('i', $id);
    if($imageStmt->execute()){
        $imgRes = $imageStmt->get_result();
        while($imgRow = $imgRes->fetch_assoc()){
            $path = $imgRow['file_path'];
            if(is_string($path) && $path !== ''){
                $images[] = '/' . ltrim($path, '/');
            }
        }
    }
    $imageStmt->close();
}

$listing = [
    'id' => (int)$row['id'],
    'title' => $row['title'],
    'owner_id' => (int)$row['user_id'],
    'property_type' => $row['property_type'],
    'price' => $row['price'] !== null ? (float)$row['price'] : null,
    'province' => $row['province'],
    'address' => $row['address'],
    'description' => $row['description'],
    'latitude' => $row['latitude'] !== null ? (float)$row['latitude'] : null,
    'longitude' => $row['longitude'] !== null ? (float)$row['longitude'] : null,
    'amenities' => $amenities,
    'contact_methods' => $contacts,
    'images' => $images,
    'created_at' => $row['created_at'],
    'updated_at' => $row['updated_at'],
    'owner_name' => $row['owner_name'],
];

$listing['thumbnail_url'] = $images[0] ?? null;

if($listing['thumbnail_url'] === null){
    $listing['thumbnail_url'] = null;
}

$listing['image_urls'] = $images;

echo json_encode(['listing' => $listing], JSON_UNESCAPED_UNICODE);
