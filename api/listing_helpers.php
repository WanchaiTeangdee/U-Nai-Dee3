<?php
function record_listing_status_log(mysqli $mysqli, int $listingId, string $status, ?int $userId = null, ?string $role = null, ?string $context = null): void
{
    $status = trim($status);
    if($status === ''){
        return;
    }
    $role = $role !== null ? trim($role) : null;
    if($role !== null && $role === ''){
        $role = null;
    }
    $context = $context !== null ? trim($context) : null;
    if($context !== null && $context === ''){
        $context = null;
    }

    $stmt = $mysqli->prepare('INSERT INTO listing_status_logs (listing_id, status, changed_by, changed_by_role, context) VALUES (?, ?, ?, ?, ?)');
    if(!$stmt){
        error_log('record_listing_status_log prepare failed: ' . $mysqli->error);
        return;
    }

    $changedBy = $userId !== null ? (int)$userId : null;
    $roleParam = $role !== null ? mb_substr($role, 0, 40, 'UTF-8') : null;
    $contextParam = $context !== null ? mb_substr($context, 0, 120, 'UTF-8') : null;

    $stmt->bind_param('isiss', $listingId, $status, $changedBy, $roleParam, $contextParam);
    if(!$stmt->execute()){
        error_log('record_listing_status_log execute failed: ' . $stmt->error);
    }
    $stmt->close();
}
