<?php
require_once __DIR__ . '/config.php';

function get_bearer_token(){
    $headers = [];
    if(function_exists('apache_request_headers')){
        $headers = apache_request_headers();
    }

    $candidates = [
        $headers['Authorization'] ?? null,
        $_SERVER['HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        $_SERVER['Authorization'] ?? null,
        $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null,
    ];

    foreach($candidates as $raw){
        if(!$raw) continue;
        if(stripos($raw, 'Bearer ') === 0){
            return substr($raw, 7);
        }
        if(preg_match('/^[A-Fa-f0-9]{20,}$/', $raw)){
            return $raw;
        }
    }

    return null;
}

function get_user_from_token($mysqli, $token){
    if(!$token) return null;
    $stmt = $mysqli->prepare('SELECT u.id, u.email, u.name, u.role, u.phone, u.email_verified, u.email_verified_at, u.last_login FROM tokens t JOIN users u ON t.user_id = u.id WHERE t.token = ? AND t.expires_at > NOW()');
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
    if(isset($user['email_verified'])){
        $user['email_verified'] = (int)$user['email_verified'];
    }
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
