<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../auth_helpers.php';

$mysqli = db_connect();
$auth = require_admin($mysqli);
if(!$auth){
  http_response_code(403);
  echo json_encode(['error' => 'forbidden']);
  exit;
}

$data = [
  'visitors_today' => 0,
  'total_users' => 0,
  'units_available' => 0,
  'bookings_this_month' => 0,
  'revenue' => 0,
  'pending_payments' => 0,
  'new_users_today' => 0,
  'new_bookings_today' => 0,
];

$visRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM analytics WHERE DATE(visited_at) = CURDATE()");
if($visRes){
  $row = $visRes->fetch_assoc();
  $data['visitors_today'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats visitors query failed: ' . $mysqli->error);
}

$userRes = $mysqli->query('SELECT COUNT(*) AS cnt FROM users');
if($userRes){
  $row = $userRes->fetch_assoc();
  $data['total_users'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats total users query failed: ' . $mysqli->error);
}

// Units Available: active listings
$unitsRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM listings WHERE status = 'active'");
if($unitsRes){
  $row = $unitsRes->fetch_assoc();
  $data['units_available'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats units available query failed: ' . $mysqli->error);
}

// Bookings This Month
$bookingsRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM listing_booking_requests WHERE MONTH(created_at) = MONTH(CURRENT_DATE) AND YEAR(created_at) = YEAR(CURRENT_DATE)");
if($bookingsRes){
  $row = $bookingsRes->fetch_assoc();
  $data['bookings_this_month'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats bookings this month query failed: ' . $mysqli->error);
}

// Revenue: sum of prices from active listings (as approximation)
$revenueRes = $mysqli->query("SELECT SUM(price) AS total FROM listings WHERE status = 'active'");
if($revenueRes){
  $row = $revenueRes->fetch_assoc();
  $data['revenue'] = (float)($row['total'] ?? 0);
} else {
  error_log('admin/stats revenue query failed: ' . $mysqli->error);
}

// Pending Payments: booking requests with pending status (assuming these represent pending payments)
$pendingRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM listing_booking_requests WHERE status = 'pending'");
if($pendingRes){
  $row = $pendingRes->fetch_assoc();
  $data['pending_payments'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats pending payments query failed: ' . $mysqli->error);
}

// New Users Today
$newUsersRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM users WHERE DATE(created_at) = CURDATE()");
if($newUsersRes){
  $row = $newUsersRes->fetch_assoc();
  $data['new_users_today'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats new users today query failed: ' . $mysqli->error);
}

// New Bookings Today
$newBookingsRes = $mysqli->query("SELECT COUNT(*) AS cnt FROM listing_booking_requests WHERE DATE(created_at) = CURDATE()");
if($newBookingsRes){
  $row = $newBookingsRes->fetch_assoc();
  $data['new_bookings_today'] = (int)($row['cnt'] ?? 0);
} else {
  error_log('admin/stats new bookings today query failed: ' . $mysqli->error);
}

echo json_encode($data);
