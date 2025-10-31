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

$limitInput = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
$limit = $limitInput > 0 ? $limitInput : 50;
if($limit > 200){
    $limit = 200;
}

$userId = (int)$user['id'];
$role = strtolower((string)($user['role'] ?? ''));
$targetLandlord = 0;
$conditions = [];
$params = [];
$types = '';

switch($role){
    case 'landlord':
    case 'host':
        $conditions[] = 'c.landlord_id = ?';
        $types .= 'i';
        $params[] = $userId;
        break;
    case 'customer':
        $conditions[] = 'c.customer_id = ?';
        $types .= 'i';
        $params[] = $userId;
        break;
    case 'admin':
        $targetLandlord = isset($_GET['landlord_id']) ? (int)$_GET['landlord_id'] : 0;
        if($targetLandlord > 0){
            $conditions[] = 'c.landlord_id = ?';
            $types .= 'i';
            $params[] = $targetLandlord;
        }
        break;
    default:
        // fall back to participant filter below
        break;
}

if(empty($conditions)){
    $conditions[] = '(c.landlord_id = ? OR c.customer_id = ?)';
    $types .= 'ii';
    $params[] = $userId;
    $params[] = $userId;
}

$whereClause = implode(' AND ', $conditions);
$query = "SELECT
    c.id,
    c.listing_id,
    c.customer_id,
    c.landlord_id,
    c.updated_at,
    l.title AS listing_title,
    cu.name AS customer_name,
    cu.email AS customer_email,
    la.name AS landlord_name,
    lm.id AS last_message_id,
    lm.sender_id AS last_sender_id,
    lm.message AS last_message,
    lm.created_at AS last_message_at
FROM listing_conversations c
LEFT JOIN listings l ON l.id = c.listing_id
LEFT JOIN users cu ON cu.id = c.customer_id
LEFT JOIN users la ON la.id = c.landlord_id
LEFT JOIN (
    SELECT m1.conversation_id, m1.id, m1.sender_id, m1.message, m1.created_at
    FROM listing_messages m1
    INNER JOIN (
        SELECT conversation_id, MAX(id) AS max_id
        FROM listing_messages
        GROUP BY conversation_id
    ) latest ON latest.conversation_id = m1.conversation_id AND latest.max_id = m1.id
) lm ON lm.conversation_id = c.id
WHERE {$whereClause}
ORDER BY c.updated_at DESC, c.id DESC
LIMIT {$limit}";

$stmt = $mysqli->prepare($query);
if(!$stmt){
    http_response_code(500);
    echo json_encode(['error' => 'query_prepare_failed']);
    exit;
}

if($types !== ''){
    $bindParams = [];
    foreach($params as $key => $value){
        $bindParams[$key] = &$params[$key];
    }
    array_unshift($bindParams, $types);
    call_user_func_array([$stmt, 'bind_param'], $bindParams);
}

if(!$stmt->execute()){
    $stmt->close();
    http_response_code(500);
    echo json_encode(['error' => 'query_execute_failed']);
    exit;
}

$result = $stmt->get_result();
$conversations = [];
$conversationIds = [];
while($row = $result->fetch_assoc()){
    $id = (int)$row['id'];
    $conversationIds[] = $id;
    $conversations[$id] = [
        'id' => $id,
        'listing_id' => isset($row['listing_id']) ? (int)$row['listing_id'] : null,
        'listing_title' => $row['listing_title'] ?? null,
        'customer_id' => isset($row['customer_id']) ? (int)$row['customer_id'] : null,
        'customer_name' => $row['customer_name'] ?? null,
        'customer_email' => $row['customer_email'] ?? null,
        'landlord_id' => isset($row['landlord_id']) ? (int)$row['landlord_id'] : null,
        'landlord_name' => $row['landlord_name'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'last_message_id' => $row['last_message_id'] !== null ? (int)$row['last_message_id'] : null,
        'last_message' => $row['last_message'] ?? null,
        'last_sender_id' => $row['last_sender_id'] !== null ? (int)$row['last_sender_id'] : null,
        'last_message_at' => $row['last_message_at'] ?? null,
        'unread_count' => 0
    ];
}
$stmt->close();

$viewerId = $role === 'admin' && isset($targetLandlord) && $targetLandlord > 0 ? $targetLandlord : $userId;

if(count($conversationIds) > 0){
    $placeholders = implode(',', array_fill(0, count($conversationIds), '?'));
    $unreadTypes = str_repeat('i', count($conversationIds)) . 'i';
    $unreadParams = $conversationIds;
    $unreadParams[] = $viewerId;
    $unreadSql = "SELECT conversation_id, COUNT(*) AS unread_total
        FROM listing_messages
        WHERE conversation_id IN ({$placeholders}) AND sender_id <> ? AND read_at IS NULL
        GROUP BY conversation_id";
    $unreadStmt = $mysqli->prepare($unreadSql);
    if($unreadStmt){
        $bindUnread = [];
        foreach($unreadParams as $key => $value){
            $bindUnread[$key] = &$unreadParams[$key];
        }
        array_unshift($bindUnread, $unreadTypes);
        call_user_func_array([$unreadStmt, 'bind_param'], $bindUnread);
        if($unreadStmt->execute()){
            $unreadRes = $unreadStmt->get_result();
            while($row = $unreadRes->fetch_assoc()){
                $cid = (int)$row['conversation_id'];
                if(isset($conversations[$cid])){
                    $conversations[$cid]['unread_count'] = (int)$row['unread_total'];
                }
            }
        }
        $unreadStmt->close();
    }
}

$response = [
    'conversations' => array_values($conversations)
];

echo json_encode($response, JSON_UNESCAPED_UNICODE);
