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

$statusCounts = [
	'new' => 0,
	'in_progress' => 0,
	'resolved' => 0,
	'closed' => 0
];

$countSql = "SELECT status, COUNT(*) AS total FROM issues GROUP BY status";
if($countRes = $mysqli->query($countSql)){
	while($row = $countRes->fetch_assoc()){
		$statusKey = $row['status'] ?? '';
		$total = (int)($row['total'] ?? 0);
		if(isset($statusCounts[$statusKey])){
			$statusCounts[$statusKey] = $total;
		}
	}
	$countRes->free();
}

$issues = [];
$sql = "
	SELECT
		i.id,
		i.subject,
		i.category,
		i.priority,
		i.status,
		i.message,
		i.created_at,
		i.updated_at,
		i.reporter_name,
		i.reporter_email,
		i.reporter_role,
		COALESCE(u.name, i.reporter_name) AS display_name,
		COALESCE(u.email, i.reporter_email) AS display_email,
		COALESCE(u.role, i.reporter_role) AS display_role,
		COALESCE(r.last_reply_at, i.created_at) AS last_activity_at
	FROM issues i
	LEFT JOIN users u ON i.user_id = u.id
	LEFT JOIN (
		SELECT issue_id, MAX(created_at) AS last_reply_at
		FROM issue_replies
		GROUP BY issue_id
	) r ON r.issue_id = i.id
	ORDER BY last_activity_at DESC, i.id DESC
	LIMIT 500
";

if($result = $mysqli->query($sql)){
	while($row = $result->fetch_assoc()){
			$message = $row['message'] ?? '';
			if(function_exists('mb_substr')){
				$preview = trim(mb_substr($message, 0, 160));
				if(mb_strlen($message) > 160){
					$preview .= '…';
				}
			}else{
				$preview = trim(substr($message, 0, 160));
				if(strlen($message) > 160){
					$preview .= '…';
				}
			}
		$issues[] = [
			'id' => (int)$row['id'],
			'subject' => $row['subject'] ?? '-',
			'category' => $row['category'] ?? '-',
			'priority' => $row['priority'] ?? 'normal',
			'status' => $row['status'] ?? 'new',
			'message_preview' => $preview,
			'reporter' => $row['display_name'] ?? ($row['reporter_name'] ?? '-'),
			'reporter_email' => $row['display_email'] ?? ($row['reporter_email'] ?? ''),
			'reporter_role' => $row['display_role'] ?? ($row['reporter_role'] ?? ''),
			'created_at' => $row['created_at'] ?? null,
			'updated_at' => $row['updated_at'] ?? null,
			'last_activity_at' => $row['last_activity_at'] ?? $row['created_at'] ?? null
		];
	}
	$result->free();
}else{
	error_log('admin/issues query failed: ' . $mysqli->error);
}

$totalIssues = array_sum($statusCounts);

echo json_encode([
	'issues' => $issues,
	'counts' => [
		'total' => $totalIssues,
		'by_status' => $statusCounts
	]
]);
