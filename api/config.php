<?php
// Edit these settings to match your XAMPP MySQL credentials
$DB_HOST = '127.0.0.1';
$DB_USER = 'root';
$DB_PASS = ''; // default XAMPP root has no password
$DB_NAME = 'rental_app';

function db_connect(){
    global $DB_HOST, $DB_USER, $DB_PASS, $DB_NAME;
    $mysqli = new mysqli($DB_HOST, $DB_USER, $DB_PASS, $DB_NAME);
    if($mysqli->connect_errno){
        http_response_code(500);
        echo json_encode(['error' => 'DB connection failed: ' . $mysqli->connect_error]);
        exit;
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

?>