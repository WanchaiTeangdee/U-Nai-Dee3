<?php
header('Content-Type: text/html; charset=utf-8');
require_once __DIR__ . '/config.php';

$token = isset($_GET['token']) ? trim((string)$_GET['token']) : '';
$mysqli = db_connect();

$status = 'error';
$message = 'ไม่พบบันทึกการยืนยันอีเมล';
$details = '';

if($token === ''){
    $message = 'ลิงก์ยืนยันไม่ถูกต้อง';
} else {
    $stmt = $mysqli->prepare('SELECT ev.user_id, ev.expires_at, u.email, u.email_verified FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE ev.token = ? LIMIT 1');
    if($stmt){
        $stmt->bind_param('s', $token);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();

        if($row){
            $expiresAt = $row['expires_at'];
            if($expiresAt && strtotime($expiresAt) < time()){
                $status = 'expired';
                $message = 'ลิงก์ยืนยันหมดอายุแล้ว';
                $details = 'กรุณาขอรับลิงก์ใหม่จากหน้าจัดการโปรไฟล์ของคุณ';
            } else {
                $userId = (int)$row['user_id'];
                if((int)$row['email_verified'] === 1){
                    $status = 'already';
                    $message = 'อีเมลนี้ยืนยันเรียบร้อยแล้ว';
                    $details = 'คุณสามารถเข้าสู่ระบบและใช้งานระบบได้ทันที';
                } else {
                    $verifyStmt = $mysqli->prepare('UPDATE users SET email_verified = 1, email_verified_at = NOW() WHERE id = ? LIMIT 1');
                    if($verifyStmt){
                        $verifyStmt->bind_param('i', $userId);
                        $verifyStmt->execute();
                        $verifyStmt->close();
                        $status = 'success';
                        $message = 'ยืนยันอีเมลสำเร็จ';
                        $details = 'ขอบคุณที่ยืนยันอีเมล คุณสามารถปิดหน้านี้แล้วกลับไปใช้งานระบบได้เลย';
                    } else {
                        $status = 'error';
                        $message = 'ไม่สามารถอัปเดตสถานะอีเมลได้';
                    }
                }

                // ลบ token หลังใช้งาน/หมดอายุ เพื่อป้องกันการใช้งานซ้ำ
                $deleteStmt = $mysqli->prepare('DELETE FROM email_verifications WHERE user_id = ?');
                if($deleteStmt){
                    $deleteStmt->bind_param('i', $userId);
                    $deleteStmt->execute();
                    $deleteStmt->close();
                }
            }
        }
    } else {
        $message = 'ไม่สามารถตรวจสอบลิงก์ยืนยันได้';
    }
}

$styles = 'body{font-family:"Kanit","Sarabun",Tahoma,sans-serif;background:#f4f6fb;margin:0;padding:0;} .wrap{max-width:480px;margin:60px auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 12px 24px rgba(15,23,42,.12);} h1{margin:0 0 12px;font-size:28px;color:#0f172a;} p{margin:0 0 16px;color:#334155;line-height:1.6;} .status-success{color:#059669;} .status-error{color:#dc2626;} .status-expired{color:#d97706;} .details{background:#f1f5f9;border-radius:12px;padding:16px;font-size:14px;color:#475569;} a.btn{display:inline-block;margin-top:20px;padding:10px 18px;background:#2563eb;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;}';

$statusClass = 'status-error';
if($status === 'success'){
    $statusClass = 'status-success';
} elseif($status === 'expired'){
    $statusClass = 'status-expired';
}

?>
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>สถานะการยืนยันอีเมล</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style><?= $styles ?></style>
</head>
<body>
  <div class="wrap">
    <h1 class="<?= $statusClass ?>"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></h1>
    <?php if($details): ?>
      <p class="details"><?= htmlspecialchars($details, ENT_QUOTES, 'UTF-8') ?></p>
    <?php endif; ?>
    <a class="btn" href="/frontend/index.html">กลับสู่หน้าหลัก</a>
  </div>
</body>
</html>
