<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';
require_once __DIR__ . '/../listing_helpers.php';

if($_SERVER['REQUEST_METHOD'] !== 'POST'){
    http_response_code(405);
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

$mysqli = db_connect();
$auth = require_landlord_or_admin($mysqli);
if(!$auth){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$listingId = isset($_POST['listing_id']) ? (int)$_POST['listing_id'] : 0;
if($listingId <= 0){
    http_response_code(422);
    echo json_encode(['error' => 'invalid_listing']);
    exit;
}

$lookup = $mysqli->prepare('SELECT user_id FROM listings WHERE id = ? LIMIT 1');
if(!$lookup){
    error_log('landlord/update_listing lookup prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'lookup_failed']);
    exit;
}
$lookup->bind_param('i', $listingId);
$lookup->execute();
$result = $lookup->get_result();
$ownerRow = $result ? $result->fetch_assoc() : null;
$lookup->close();

if(!$ownerRow){
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}

$ownerId = (int)$ownerRow['user_id'];
if($auth['role'] !== 'admin' && $ownerId !== (int)$auth['id']){
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

$currentImages = [];
$imgLookup = $mysqli->prepare('SELECT file_path FROM listing_images WHERE listing_id = ? ORDER BY id ASC');
if($imgLookup){
    $imgLookup->bind_param('i', $listingId);
    $imgLookup->execute();
    $imgRes = $imgLookup->get_result();
    while($imgRow = $imgRes->fetch_assoc()){
        $path = isset($imgRow['file_path']) ? trim((string)$imgRow['file_path']) : '';
        if($path !== ''){
            $currentImages[] = $path;
        }
    }
    $imgLookup->close();
}

$removeImagesInput = $_POST['remove_images'] ?? null;
$imagesToRemove = [];
if($removeImagesInput !== null){
    $decodedRemove = json_decode($removeImagesInput, true);
    if(is_array($decodedRemove)){
        foreach($decodedRemove as $path){
            if(!is_string($path)) continue;
            $normalized = trim($path);
            if($normalized === '') continue;
            if(in_array($normalized, $currentImages, true)){
                $imagesToRemove[] = $normalized;
            }
        }
    }
}
if($imagesToRemove){
    $imagesToRemove = array_values(array_unique($imagesToRemove));
}
$remainingImagesAfterRemoval = $imagesToRemove
    ? array_values(array_filter($currentImages, static function($path) use ($imagesToRemove){
        return !in_array($path, $imagesToRemove, true);
    }))
    : $currentImages;

$sanitize_string = static function($value, $maxLen = 255){
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
$contactLegacy = isset($_POST['contact']) ? $sanitize_string($_POST['contact'], 255) : null;
if(!$contactMethods && $contactLegacy){
    $contactMethods[] = ['type' => 'ติดต่อ', 'value' => $contactLegacy];
}
if(!$contactMethods){
    http_response_code(422);
    echo json_encode(['error' => 'contact_required']);
    exit;
}
$contactJson = json_encode($contactMethods, JSON_UNESCAPED_UNICODE);

$latitude = isset($_POST['latitude']) && $_POST['latitude'] !== '' ? trim($_POST['latitude']) : null;
$longitude = isset($_POST['longitude']) && $_POST['longitude'] !== '' ? trim($_POST['longitude']) : null;

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

$statusAfterUpdate = 'pending';

$updateSql = 'UPDATE listings SET title = ?, property_type = ?, price = ?, province = ?, address = ?, description = ?, contact = ?, latitude = ?, longitude = ?, amenities = ?, status = ?, updated_at = NOW() WHERE id = ?';

if($auth['role'] === 'admin'){
    $updateStmt = $mysqli->prepare($updateSql);
    if(!$updateStmt){
        error_log('landlord/update_listing prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'prepare_failed']);
        exit;
    }
    $updateStmt->bind_param(
        'ssdssssssssi',
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
        $statusAfterUpdate,
        $listingId
    );
} else {
    $updateStmt = $mysqli->prepare($updateSql . ' AND user_id = ?');
    if(!$updateStmt){
        error_log('landlord/update_listing prepare failed: ' . $mysqli->error);
        http_response_code(500);
        echo json_encode(['error' => 'prepare_failed']);
        exit;
    }
    $userId = (int)$auth['id'];
    $updateStmt->bind_param(
        'ssdssssssssii',
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
        $statusAfterUpdate,
        $listingId,
        $userId
    );
}
if(!$updateStmt->execute()){
    error_log('landlord/update_listing execute failed: ' . $updateStmt->error);
    $updateStmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'update_failed']);
    exit;
}
$updateStmt->close();

// Apply requested removals before handling new uploads
if($imagesToRemove){
    $deleteStmt = $mysqli->prepare('DELETE FROM listing_images WHERE listing_id = ? AND file_path = ?');
    if($deleteStmt){
        $pathParam = null;
        $deleteStmt->bind_param('is', $listingId, $pathParam);
        foreach($imagesToRemove as $path){
            $pathParam = $path;
            $deleteStmt->execute();
            $fileAbsolute = dirname(__DIR__, 2) . '/' . $path;
            if(is_file($fileAbsolute)){
                @unlink($fileAbsolute);
            }
        }
        $deleteStmt->close();
    }
}

$currentImages = $remainingImagesAfterRemoval;

$MAX_IMAGES = 5;
$MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
$allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

$files = $_FILES['images'] ?? null;
if($files && isset($files['name']) && is_array($files['name'])){
    $remainingSlots = max(0, $MAX_IMAGES - count($currentImages));
    if($remainingSlots > 0){
        $uploadDir = dirname(__DIR__, 2) . '/uploads/listings';
        if(!is_dir($uploadDir)){
            @mkdir($uploadDir, 0775, true);
        }
        $total = min(count($files['name']), $remainingSlots);
        $imgStmt = $mysqli->prepare('INSERT INTO listing_images (listing_id, file_path) VALUES (?, ?)');
        if($imgStmt){
            $filePathParam = '';
            $imgStmt->bind_param('is', $listingId, $filePathParam);
            for($i = 0; $i < $total; $i++){
                $error = $files['error'][$i] ?? UPLOAD_ERR_NO_FILE;
                if($error !== UPLOAD_ERR_OK) continue;
                $tmpPath = $files['tmp_name'][$i] ?? null;
                if(!$tmpPath || !is_uploaded_file($tmpPath)) continue;
                $size = (int)($files['size'][$i] ?? 0);
                if($size <= 0 || $size > $MAX_IMAGE_SIZE) continue;
                $originalName = $files['name'][$i] ?? 'image';
                $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
                if(!in_array($ext, $allowedExtensions, true)) continue;
                $newName = uniqid('listing_' . $listingId . '_', true) . '.' . $ext;
                $destination = $uploadDir . '/' . $newName;
                if(move_uploaded_file($tmpPath, $destination)){
                    $filePathParam = 'uploads/listings/' . $newName;
                    $imgStmt->execute();
                    $currentImages[] = $filePathParam;
                }
            }
            $imgStmt->close();
        }
    }
}

$detail = $mysqli->prepare('SELECT id, title, property_type, price, province, address, description, contact, latitude, longitude, amenities, status, created_at, updated_at FROM listings WHERE id = ? LIMIT 1');
if(!$detail){
    error_log('landlord/update_listing detail prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'detail_failed']);
    exit;
}
$detail->bind_param('i', $listingId);
$detail->execute();
$detailRes = $detail->get_result();
$row = $detailRes ? $detailRes->fetch_assoc() : null;
$detail->close();

if(!$row){
    http_response_code(404);
    echo json_encode(['error' => 'not_found']);
    exit;
}

$amenitiesDecoded = [];
if(!empty($row['amenities'])){
    $decoded = json_decode($row['amenities'], true);
    if(is_array($decoded)){
        $amenitiesDecoded = array_values(array_filter($decoded, 'strlen'));
    }
}

$contactDecoded = [];
if(!empty($row['contact'])){
    $decodedContacts = json_decode($row['contact'], true);
    if(is_array($decodedContacts)){
        foreach($decodedContacts as $entry){
            if(!is_array($entry)) continue;
            $type = $entry['type'] ?? '';
            $value = $entry['value'] ?? '';
            if($type !== '' && $value !== ''){
                $contactDecoded[] = ['type' => $type, 'value' => $value];
            }
        }
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
    'contact_methods' => $contactDecoded,
    'latitude' => $row['latitude'] !== null ? (float)$row['latitude'] : null,
    'longitude' => $row['longitude'] !== null ? (float)$row['longitude'] : null,
    'amenities' => $amenitiesDecoded,
    'status' => $row['status'],
    'created_at' => $row['created_at'],
    'updated_at' => $row['updated_at'],
    'images' => $currentImages,
    'image_count' => count($currentImages)
];

record_listing_status_log(
    $mysqli,
    (int)$listingId,
    $statusAfterUpdate,
    $auth['id'] ?? null,
    $auth['role'] ?? null,
    $auth['role'] === 'admin' ? 'admin_update_listing' : 'landlord_update_listing'
);

echo json_encode(['success' => true, 'listing' => $listing], JSON_UNESCAPED_UNICODE);
