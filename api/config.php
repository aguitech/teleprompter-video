<?php
/**
 * Configuración — Teleprompter Video Backend
 *
 * BanCoppel · Afore Coppel
 * Procesa video WebM grabado con chroma key y produce MP4 final
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('STORAGE_PATH', __DIR__ . '/../storage/sessions');
define('MAX_VIDEO_SIZE', 200 * 1024 * 1024);  // 200 MB
define('FFMPEG_BIN', '/usr/bin/ffmpeg');      // Ajustar si está en otra ruta
define('FFPROBE_BIN', '/usr/bin/ffprobe');
define('DEFAULT_TOLERANCE', 80);              // Tolerancia chroma por defecto (más permisiva)

function json_response($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error($msg, $code = 400, $extra = []) {
    json_response(array_merge(['ok' => false, 'error' => $msg], $extra), $code);
}

function json_ok($data = [], $code = 200) {
    json_response(array_merge(['ok' => true], $data), $code);
}

function gen_id() {
    return 'sess_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4));
}

/**
 * Convierte hex color a RGB array
 */
function hex_to_rgb($hex) {
    $hex = ltrim($hex, '#');
    return [
        'r' => hexdec(substr($hex, 0, 2)),
        'g' => hexdec(substr($hex, 2, 2)),
        'b' => hexdec(substr($hex, 4, 2))
    ];
}
