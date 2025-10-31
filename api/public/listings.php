<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';

$mysqli = db_connect();
if($mysqli->connect_errno){
    http_response_code(500);
    echo json_encode(['error' => 'database_unavailable']);
    exit;
}

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
if($limit <= 0) $limit = 50;
if($limit > 200) $limit = 200;

$allowedTypes = ['condo', 'house', 'other'];
$type = isset($_GET['type']) && in_array($_GET['type'], $allowedTypes, true) ? $_GET['type'] : null;
$q = isset($_GET['q']) ? trim($_GET['q']) : '';
$priceRange = isset($_GET['priceRange']) ? trim($_GET['priceRange']) : '';

$minPrice = null;
$maxPrice = null;
if($priceRange !== ''){
    if(preg_match('/^(\d+)-(\d+)$/', $priceRange, $m)){
        $minPrice = (float)$m[1];
        $maxPrice = (float)$m[2];
    } elseif(preg_match('/^(\d+)\+$/', $priceRange, $m)){
        $minPrice = (float)$m[1];
    }
}

$sql = 'SELECT l.id, l.title, l.property_type, l.price, l.province, l.address, l.description, l.latitude, l.longitude, l.amenities, l.status, l.updated_at FROM listings l WHERE l.status = ?';
$params = ['active'];
$types = 's';

if($type){
    $sql .= ' AND l.property_type = ?';
    $params[] = $type;
    $types .= 's';
}
if($q !== ''){
    $like = '%' . $q . '%';
    $sql .= ' AND (l.title LIKE ? OR l.province LIKE ? OR l.address LIKE ? OR l.description LIKE ?)';
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $types .= 'ssss';
}
if($minPrice !== null){
    $sql .= ' AND l.price >= ?';
    $params[] = $minPrice;
    $types .= 'd';
}
if($maxPrice !== null){
    $sql .= ' AND l.price <= ?';
    $params[] = $maxPrice;
    $types .= 'd';
}

$sql .= ' ORDER BY l.updated_at DESC LIMIT ?';
$params[] = $limit;
$types .= 'i';

$stmt = $mysqli->prepare($sql);
if(!$stmt){
    error_log('public/listings prepare failed: ' . $mysqli->error);
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}

$stmt->bind_param($types, ...$params);
if(!$stmt->execute()){
    error_log('public/listings execute failed: ' . $stmt->error);
    http_response_code(500);
    echo json_encode(['error' => 'query_failed']);
    $stmt->close();
    exit;
}

$result = $stmt->get_result();
$listings = [];
$ids = [];
while($row = $result->fetch_assoc()){
    $listingId = (int)$row['id'];
    $ids[] = $listingId;

    $amenities = [];
    if(!empty($row['amenities'])){
        $decodedAmenities = json_decode($row['amenities'], true);
        if(is_array($decodedAmenities)){
            foreach($decodedAmenities as $item){
                if(is_string($item)){
                    $trimmed = trim($item);
                    if($trimmed !== ''){
                        $amenities[] = mb_substr($trimmed, 0, 120, 'UTF-8');
                    }
                }
            }
        }
    }

    $listings[$listingId] = [
        'id' => $listingId,
        'title' => $row['title'],
        'property_type' => $row['property_type'],
        'price' => $row['price'] !== null ? (float)$row['price'] : null,
        'province' => $row['province'],
        'address' => $row['address'],
        'description' => $row['description'],
        'latitude' => $row['latitude'] !== null ? (float)$row['latitude'] : null,
        'longitude' => $row['longitude'] !== null ? (float)$row['longitude'] : null,
        'amenities' => $amenities,
        'status' => $row['status'],
        'updated_at' => $row['updated_at'],
        'image_urls' => [],
        'thumbnail_url' => null,
    ];
}
$stmt->close();

if($listings){
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $imageSql = "SELECT listing_id, file_path FROM listing_images WHERE listing_id IN ($placeholders) ORDER BY id ASC";
    $imageStmt = $mysqli->prepare($imageSql);
    if($imageStmt){
        $imageTypes = str_repeat('i', count($ids));
        $imageStmt->bind_param($imageTypes, ...$ids);
        if($imageStmt->execute()){
            $imageRes = $imageStmt->get_result();
            while($imgRow = $imageRes->fetch_assoc()){
                $listingId = (int)$imgRow['listing_id'];
                $path = $imgRow['file_path'];
                if(!isset($listings[$listingId])) continue;
                $publicPath = '/' . ltrim($path, '/');
                $listings[$listingId]['image_urls'][] = $publicPath;
                if($listings[$listingId]['thumbnail_url'] === null){
                    $listings[$listingId]['thumbnail_url'] = $publicPath;
                }
            }
        }
        $imageStmt->close();
    }
}

$data = array_values($listings);

echo json_encode(['listings' => $data], JSON_UNESCAPED_UNICODE);