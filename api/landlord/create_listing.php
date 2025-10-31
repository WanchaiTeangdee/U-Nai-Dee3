<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';
require_once __DIR__ . '/../listing_helpers.php';

$mysqli = db_connect();
$auth = require_landlord_or_admin($mysqli);
if(!$auth){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$sanitize_string = static function($value, $maxLen = 255) {
    $value = is_string($value) ? trim($value) : '';
    return mb_substr($value, 0, $maxLen, 'UTF-8');
};

$title = $sanitize_string($_POST['title'] ?? '', 255);
$propertyType = trim($_POST['property_type'] ?? '');
$priceInput = $_POST['price'] ?? null;
$price = is_numeric($priceInput) ? (float)$priceInput : null;
$province = $sanitize_string($_POST['province'] ?? '', 120);
$address = $sanitize_string($_POST['address'] ?? '', 255);
$description = isset($_POST['description']) ? mb_substr(trim($_POST['description']), 0, 2000, 'UTF-8') : '';
$contactLegacy = isset($_POST['contact']) ? $sanitize_string($_POST['contact'], 255) : null;
$contactMethods = [];
if(isset($_POST['contact_methods'])){
    $decodedContacts = json_decode($_POST['contact_methods'], true);
    if(is_array($decodedContacts)){
        foreach($decodedContacts as $entry){
            if(!is_array($entry)) continue;
            $type = $sanitize_string($entry['type'] ?? '', 60);
            $value = $sanitize_string($entry['value'] ?? '', 255);
            if($type !== '' && $value !== ''){
                $contactMethods[] = ['type' => $type, 'value' => $value];
            }
        }
    }
}
if(!$contactMethods && $contactLegacy){
    $contactMethods[] = ['type' => 'ติดต่อ', 'value' => $contactLegacy];
}
$contactJson = $contactMethods ? json_encode($contactMethods, JSON_UNESCAPED_UNICODE) : null;

$latitude = isset($_POST['latitude']) && $_POST['latitude'] !== '' ? trim($_POST['latitude']) : null;
$longitude = isset($_POST['longitude']) && $_POST['longitude'] !== '' ? trim($_POST['longitude']) : null;

$amenitiesJson = null;
if(isset($_POST['amenities'])){
    $decoded = json_decode($_POST['amenities'], true);
    if(is_array($decoded)){
        $amenitiesClean = [];
        foreach($decoded as $item){
            if(!is_string($item)) continue;
            $item = trim($item);
            if($item === '') continue;
            $amenitiesClean[] = mb_substr($item, 0, 120, 'UTF-8');
        }
        if($amenitiesClean){
            $amenitiesJson = json_encode($amenitiesClean, JSON_UNESCAPED_UNICODE);
        }
    }
}

$allowedTypes = ['condo', 'house', 'other'];
if($title === '' || !in_array($propertyType, $allowedTypes, true) || $price === null || $price < 0){
    http_response_code(422);
    echo json_encode(['error' => 'validation_failed']);
    exit;
}
if(!$contactMethods){
    http_response_code(422);
    echo json_encode(['error' => 'contact_required']);
    exit;
}

if($latitude !== null){
    $latFloat = (float)$latitude;
    if($latFloat < -90 || $latFloat > 90){
        http_response_code(422);
        echo json_encode(['error' => 'invalid_latitude']);
        exit;
    }
    $latitude = number_format($latFloat, 6, '.', '');
}
if($longitude !== null){
    $lngFloat = (float)$longitude;
    if($lngFloat < -180 || $lngFloat > 180){
        http_response_code(422);
        echo json_encode(['error' => 'invalid_longitude']);
        exit;
    }
    $longitude = number_format($lngFloat, 6, '.', '');
}

$status = 'pending';
$stmt = $mysqli->prepare('INSERT INTO listings (user_id, title, property_type, price, province, address, description, contact, latitude, longitude, amenities, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
if(!$stmt){
    error_log('landlord/create_listing prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'prepare_failed']);
    exit;
}

$stmt->bind_param(
    'issdssssssss',
    $auth['id'],
    $title,
    $propertyType,
    $price,
    $province,
    $address,
    $description,
    $contactJson,
    $latitude,
    $longitude,
    $amenitiesJson,
    $status
);

if(!$stmt->execute()){
    error_log('landlord/create_listing execute failed: ' . $stmt->error);
    http_response_code(500);
    echo json_encode(['error' => 'insert_failed']);
    $stmt->close();
    exit;
}

$newId = $stmt->insert_id;
$stmt->close();

$uploadedFiles = [];
$files = $_FILES['images'] ?? null;
if($files && isset($files['name']) && is_array($files['name'])){
    $uploadDir = dirname(__DIR__, 2) . '/uploads/listings';
    if(!is_dir($uploadDir)){
        @mkdir($uploadDir, 0775, true);
    }

    $allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    $maxFiles = 5;
    $total = min(count($files['name']), $maxFiles);
    for($i = 0; $i < $total; $i++){
        $error = $files['error'][$i] ?? UPLOAD_ERR_NO_FILE;
        if($error !== UPLOAD_ERR_OK) continue;
        $tmpPath = $files['tmp_name'][$i] ?? null;
        if(!$tmpPath || !is_uploaded_file($tmpPath)) continue;
        $size = (int)($files['size'][$i] ?? 0);
        if($size <= 0 || $size > (5 * 1024 * 1024)) continue; // 5MB limit

        $originalName = $files['name'][$i] ?? 'image';
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if(!in_array($ext, $allowedExtensions, true)) continue;

        $newName = uniqid('listing_' . $newId . '_', true) . '.' . $ext;
        $destination = $uploadDir . '/' . $newName;
        if(move_uploaded_file($tmpPath, $destination)){
            $relativePath = 'uploads/listings/' . $newName;
            $uploadedFiles[] = $relativePath;
        }
    }

    if($uploadedFiles){
        $imgStmt = $mysqli->prepare('INSERT INTO listing_images (listing_id, file_path) VALUES (?, ?)');
        if($imgStmt){
            foreach($uploadedFiles as $path){
                $imgStmt->bind_param('is', $newId, $path);
                $imgStmt->execute();
                $imgStmt->reset();
            }
            $imgStmt->close();
        }
    }
}

$detail = $mysqli->prepare('SELECT l.id, l.title, l.property_type, l.price, l.province, l.address, l.description, l.contact, l.latitude, l.longitude, l.amenities, l.status, l.created_at, l.updated_at FROM listings l WHERE l.id = ?');
$listing = null;
if($detail){
    $detail->bind_param('i', $newId);
    $detail->execute();
    $res = $detail->get_result();
    $row = $res->fetch_assoc();
    $detail->close();
    if($row){
        $amenitiesDecoded = [];
        if(!empty($row['amenities'])){
            $decoded = json_decode($row['amenities'], true);
            if(is_array($decoded)){
                $amenitiesDecoded = array_values(array_filter($decoded, 'strlen'));
            }
        }
        $listing = [
            'id' => (int)$row['id'],
            'title' => $row['title'],
            'property_type' => $row['property_type'],
            'price' => (float)$row['price'],
            'province' => $row['province'],
            'address' => $row['address'],
            'description' => $row['description'],
            'contact' => $row['contact'],
            'latitude' => $row['latitude'] !== null ? (float)$row['latitude'] : null,
            'longitude' => $row['longitude'] !== null ? (float)$row['longitude'] : null,
            'amenities' => $amenitiesDecoded,
            'status' => $row['status'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
        if(!empty($row['contact'])){
            $contactData = json_decode($row['contact'], true);
            if(is_array($contactData)){
                $listing['contact_methods'] = $contactData;
            }
        }
    }
}

if($listing === null){
    $listing = ['id' => (int)$newId];
}

if(!$listing){
    $listing = ['id' => (int)$newId];
}

if($uploadedFiles){
    $listing['images'] = $uploadedFiles;
    $listing['image_count'] = count($uploadedFiles);
}

if(!isset($listing['images'])){
    $listing['images'] = [];
}
if(!isset($listing['image_count'])){
    $listing['image_count'] = count($listing['images']);
}
if(!isset($listing['contact_methods'])){
    $listing['contact_methods'] = $contactMethods;
}

record_listing_status_log($mysqli, (int)$newId, $status, $auth['id'] ?? null, $auth['role'] ?? null, 'create_listing');

echo json_encode(['success' => true, 'listing' => $listing], JSON_UNESCAPED_UNICODE);
