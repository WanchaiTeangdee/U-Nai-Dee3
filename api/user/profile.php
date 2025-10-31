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

$userStmt = $mysqli->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ? LIMIT 1');
if(!$userStmt){
    http_response_code(500);
    echo json_encode(['error' => 'profile_query_failed']);
    exit;
}
$userStmt->bind_param('i', $userId);
$userStmt->execute();
$userRes = $userStmt->get_result();
$userRow = $userRes->fetch_assoc();
$userStmt->close();

if(!$userRow){
    http_response_code(404);
    echo json_encode(['error' => 'profile_not_found']);
    exit;
}

$stats = [
    'listings_total' => 0,
    'listings_active' => 0,
    'booking_requests_total' => 0,
    'booking_requests_pending' => 0,
    'conversations_total' => 0,
    'messages_unread' => 0,
    'bookings_sent' => 0
];

if($role === 'landlord' || $role === 'host' || $role === 'admin'){
    // Listings owned by this landlord (or all listings if admin)
    $listingsSql = $role === 'admin'
        ? 'SELECT COUNT(*) AS total, SUM(status = "active") AS active FROM listings'
        : 'SELECT COUNT(*) AS total, SUM(status = "active") AS active FROM listings WHERE user_id = ?';
    $listingsStmt = $mysqli->prepare($listingsSql);
    if($listingsStmt){
        if($role !== 'admin'){
            $listingsStmt->bind_param('i', $userId);
        }
        if($listingsStmt->execute()){
            $listingsRes = $listingsStmt->get_result();
            if($row = $listingsRes->fetch_assoc()){
                $stats['listings_total'] = (int)($row['total'] ?? 0);
                $stats['listings_active'] = (int)($row['active'] ?? 0);
            }
        }
        $listingsStmt->close();
    }

    // Booking requests addressed to this landlord (or all for admin)
    $bookingSql = $role === 'admin'
        ? 'SELECT COUNT(*) AS total, SUM(status = "pending") AS pending FROM listing_booking_requests'
        : 'SELECT COUNT(*) AS total, SUM(status = "pending") AS pending FROM listing_booking_requests WHERE owner_id = ?';
    $bookingStmt = $mysqli->prepare($bookingSql);
    if($bookingStmt){
        if($role !== 'admin'){
            $bookingStmt->bind_param('i', $userId);
        }
        if($bookingStmt->execute()){
            $bookingRes = $bookingStmt->get_result();
            if($row = $bookingRes->fetch_assoc()){
                $stats['booking_requests_total'] = (int)($row['total'] ?? 0);
                $stats['booking_requests_pending'] = (int)($row['pending'] ?? 0);
            }
        }
        $bookingStmt->close();
    }

    // Conversations for landlord
    $convSql = $role === 'admin'
        ? 'SELECT COUNT(*) AS cnt FROM listing_conversations'
        : 'SELECT COUNT(*) AS cnt FROM listing_conversations WHERE landlord_id = ?';
    $convStmt = $mysqli->prepare($convSql);
    if($convStmt){
        if($role !== 'admin'){
            $convStmt->bind_param('i', $userId);
        }
        if($convStmt->execute()){
            $convRes = $convStmt->get_result();
            if($row = $convRes->fetch_assoc()){
                $stats['conversations_total'] = (int)($row['cnt'] ?? 0);
            }
        }
        $convStmt->close();
    }

    // Unread messages for landlord/admin
    $unreadSql = $role === 'admin'
        ? 'SELECT COUNT(*) AS cnt FROM listing_messages m JOIN listing_conversations c ON c.id = m.conversation_id WHERE m.read_at IS NULL'
        : 'SELECT COUNT(*) AS cnt FROM listing_messages m JOIN listing_conversations c ON c.id = m.conversation_id WHERE m.read_at IS NULL AND c.landlord_id = ? AND m.sender_id <> ?';
    $unreadStmt = $mysqli->prepare($unreadSql);
    if($unreadStmt){
        if($role !== 'admin'){
            $unreadStmt->bind_param('ii', $userId, $userId);
        }
        if($unreadStmt->execute()){
            $unreadRes = $unreadStmt->get_result();
            if($row = $unreadRes->fetch_assoc()){
                $stats['messages_unread'] = (int)($row['cnt'] ?? 0);
            }
        }
        $unreadStmt->close();
    }
} else {
    // Customer-centric stats
    $convStmt = $mysqli->prepare('SELECT COUNT(*) AS cnt FROM listing_conversations WHERE customer_id = ?');
    if($convStmt){
        $convStmt->bind_param('i', $userId);
        if($convStmt->execute()){
            $convRes = $convStmt->get_result();
            if($row = $convRes->fetch_assoc()){
                $stats['conversations_total'] = (int)($row['cnt'] ?? 0);
            }
        }
        $convStmt->close();
    }

    $unreadStmt = $mysqli->prepare('SELECT COUNT(*) AS cnt FROM listing_messages m JOIN listing_conversations c ON c.id = m.conversation_id WHERE m.read_at IS NULL AND c.customer_id = ? AND m.sender_id <> ?');
    if($unreadStmt){
        $unreadStmt->bind_param('ii', $userId, $userId);
        if($unreadStmt->execute()){
            $unreadRes = $unreadStmt->get_result();
            if($row = $unreadRes->fetch_assoc()){
                $stats['messages_unread'] = (int)($row['cnt'] ?? 0);
            }
        }
        $unreadStmt->close();
    }
}

$response = [
    'user' => [
        'id' => (int)$userRow['id'],
        'email' => $userRow['email'],
        'name' => $userRow['name'],
        'role' => $userRow['role'],
        'created_at' => $userRow['created_at'],
        'last_login' => null
    ],
    'stats' => $stats
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
