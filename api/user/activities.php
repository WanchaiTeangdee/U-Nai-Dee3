<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$user = require_auth($mysqli);
if(!$user){
    http_response_code(401);
    echo json_encode(['error' => 'unauthorized']);
    exit;
}

$userId = (int)$user['id'];
$role = strtolower((string)($user['role'] ?? ''));

// Get recent activities (last 30 days, limit 20 items)
$activities = [];
$limit = 20;

// 1. Recent messages sent/received
$messageQuery = "
    SELECT
        'message' as type,
        c.created_at as timestamp,
        CASE
            WHEN c.sender_id = ? THEN CONCAT('ส่งข้อความถึง ', COALESCE(u.name, u.email))
            ELSE CONCAT('ได้รับข้อความจาก ', COALESCE(u.name, u.email))
        END as description,
        c.id as reference_id,
        NULL as metadata
    FROM conversations c
    JOIN users u ON (CASE WHEN c.sender_id = ? THEN c.receiver_id ELSE c.sender_id END) = u.id
    WHERE (c.sender_id = ? OR c.receiver_id = ?) AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    ORDER BY c.created_at DESC
    LIMIT ?
";

$messageStmt = $mysqli->prepare($messageQuery);
if($messageStmt){
    $messageStmt->bind_param('iiiii', $userId, $userId, $userId, $userId, $limit);
    if($messageStmt->execute()){
        if(method_exists($messageStmt, 'get_result')){
            $messageResult = $messageStmt->get_result();
            if($messageResult instanceof mysqli_result){
                while($row = $messageResult->fetch_assoc()){
                    $activities[] = $row;
                }
            }
        } else {
            $messageStmt->bind_result($type, $timestamp, $description, $referenceId, $metadata);
            while($messageStmt->fetch()){
                $activities[] = [
                    'type' => $type,
                    'timestamp' => $timestamp,
                    'description' => $description,
                    'reference_id' => $referenceId,
                    'metadata' => $metadata
                ];
            }
        }
    }
    $messageStmt->close();
}

// 2. Recent booking requests (as requester or owner)
$bookingQuery = "
    SELECT
        CASE
            WHEN br.requester_id = ? THEN 'booking_sent'
            ELSE 'booking_received'
        END AS type,
        br.created_at AS timestamp,
        CASE
            WHEN br.requester_id = ? THEN CONCAT('ส่งคำขอจอง: ', COALESCE(l.title, 'ที่พัก'))
            ELSE CONCAT('ได้รับคำขอจอง: ', COALESCE(l.title, 'ที่พัก'))
        END AS description,
        br.id AS reference_id,
        br.status AS booking_status,
        l.title AS listing_title
    FROM listing_booking_requests br
    LEFT JOIN listings l ON br.listing_id = l.id
    WHERE (br.requester_id = ? OR l.user_id = ?) AND br.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    ORDER BY br.created_at DESC
    LIMIT ?
";

$bookingStmt = $mysqli->prepare($bookingQuery);
if($bookingStmt){
    $bookingStmt->bind_param('iiiii', $userId, $userId, $userId, $userId, $limit);
    if($bookingStmt->execute()){
        if(method_exists($bookingStmt, 'get_result')){
            $bookingResult = $bookingStmt->get_result();
            if($bookingResult instanceof mysqli_result){
                while($row = $bookingResult->fetch_assoc()){
                    $metadata = [
                        'status' => $row['booking_status'] ?? null,
                        'listing_title' => $row['listing_title'] ?? null
                    ];
                    unset($row['booking_status'], $row['listing_title']);
                    $row['metadata'] = $metadata;
                    $activities[] = $row;
                }
            }
        } else {
            $bookingStmt->bind_result($type, $timestamp, $description, $referenceId, $bookingStatus, $listingTitle);
            while($bookingStmt->fetch()){
                $activities[] = [
                    'type' => $type,
                    'timestamp' => $timestamp,
                    'description' => $description,
                    'reference_id' => $referenceId,
                    'metadata' => [
                        'status' => $bookingStatus,
                        'listing_title' => $listingTitle
                    ]
                ];
            }
        }
    }
    $bookingStmt->close();
}

// 3. Profile updates (mock data for now - in real app, you'd log these)
$profileActivities = [
    [
        'type' => 'profile_update',
        'timestamp' => date('Y-m-d H:i:s', strtotime('-2 days')),
        'description' => 'อัปเดตข้อมูลส่วนตัว',
        'reference_id' => null,
        'metadata' => null
    ],
    [
        'type' => 'avatar_upload',
        'timestamp' => date('Y-m-d H:i:s', strtotime('-5 days')),
        'description' => 'อัปโหลดรูปโปรไฟล์ใหม่',
        'reference_id' => null,
        'metadata' => null
    ]
];

// Combine and sort all activities by timestamp (newest first)
$allActivities = array_merge($activities, $profileActivities);
usort($allActivities, function($a, $b) {
    return strtotime($b['timestamp']) - strtotime($a['timestamp']);
});

// Limit to 20 items and format timestamps
$formattedActivities = array_slice($allActivities, 0, $limit);
foreach($formattedActivities as &$activity) {
    $activity['timestamp_formatted'] = date('d/m/Y H:i', strtotime($activity['timestamp']));
    $activity['time_ago'] = getTimeAgo($activity['timestamp']);
}

function getTimeAgo($timestamp) {
    $time = strtotime($timestamp);
    $now = time();
    $diff = $now - $time;

    if ($diff < 60) {
        return 'เมื่อสักครู่';
    } elseif ($diff < 3600) {
        $minutes = floor($diff / 60);
        return $minutes . ' นาทีที่แล้ว';
    } elseif ($diff < 86400) {
        $hours = floor($diff / 3600);
        return $hours . ' ชั่วโมงที่แล้ว';
    } elseif ($diff < 604800) {
        $days = floor($diff / 86400);
        return $days . ' วันที่แล้ว';
    } else {
        return date('d/m/Y', $time);
    }
}

echo json_encode([
    'success' => true,
    'activities' => $formattedActivities
], JSON_UNESCAPED_UNICODE);
?>
