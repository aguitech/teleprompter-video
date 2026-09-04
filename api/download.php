<?php
/**
 * GET /api/download.php?id=<session_id>
 *
 * Descarga el MP4 procesado de una sesión
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
header('Content-Disposition: attachment; filename="' . $id . '.mp4"');
header('Cache-Control: public, max-age=86400');
readfile($path);
