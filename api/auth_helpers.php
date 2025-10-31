<?php
require_once __DIR__ . '/config.php';

function get_bearer_token(){
    $headers = [];
    if(function_exists('apache_request_headers')){
        $headers = apache_request_headers();
    }
    $header = $headers['Authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if(!$header) return null;
    if(stripos($header, 'Bearer ') === 0){
        return substr($header, 7);
    }
    return null;
}

function get_user_from_token($mysqli, $token){
    if(!$token) return null;
    $stmt = $mysqli->prepare('SELECT u.id, u.email, u.name, u.role FROM tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ? AND t.expires_at > NOW()');
    $stmt->bind_param('s', $token);
    $stmt->execute();
    $res = $stmt->get_result();
    $user = $res->fetch_assoc();
    $stmt->close();
    return $user ?: null;
}

function require_auth($mysqli = null){
    if(!$mysqli){
        $mysqli = db_connect();
    }
    $token = get_bearer_token();
    if(!$token) return null;
    $user = get_user_from_token($mysqli, $token);
    if(!$user) return null;
    $user['id'] = (int)$user['id'];
    return $user;
}

function require_admin($mysqli = null){
    $user = require_auth($mysqli);
    if(!$user || $user['role'] !== 'admin') return null;
    return $user;
}

function require_landlord_or_admin($mysqli = null){
    $user = require_auth($mysqli);
    if(!$user) return null;
    if($user['role'] === 'landlord' || $user['role'] === 'host' || $user['role'] === 'admin'){
        return $user;
    }
    return null;
}
