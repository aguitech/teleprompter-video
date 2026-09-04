<?php
/**
 * GET /api/stream.php?id=<session_id>
 *
 * Reproduce (stream) el MP4 procesado sin forzar descarga
 */

require_once __DIR__ . '/config.php';

$id = $_GET['id'] ?? '';
if (!$id || !preg_match('/^sess_[a-zA-Z0-9_]+$/', $id)) {
    http_response_code(400);
    exit('id inválido');
}

$path = STORAGE_PATH . '/' . $id . '/output.mp4';
if (!file_exists($path)) {
    http_response_code(404);
    exit('output no encontrado');
}

header('Content-Type: video/mp4');
header('Content-Length: ' . filesize($path));
header('Accept-Ranges: bytes');
header('Cache-Control: public, max-age=86400');

$range = $_SERVER['HTTP_RANGE'] ?? '';
if ($range) {
    // Soporte para seek/scrub en <video>
    if (preg_match('/bytes=(\d+)-(\d*)/', $range, $m)) {
        $start = (int)$m[1];
        $end = $m[2] !== '' ? (int)$m[2] : filesize($path) - 1;
        $length = $end - $start + 1;
        http_response_code(206);
        header("Content-Range: bytes $start-$end/" . filesize($path));
        header("Content-Length: $length");
        $fp = fopen($path, 'rb');
        fseek($fp, $start);
        echo fread($fp, $length);
        fclose($fp);
        exit;
    }
}

readfile($path);
