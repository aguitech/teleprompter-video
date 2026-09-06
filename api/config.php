<?php
/**
 * Configuración — Teleprompter Video Backend Multi-Escena
 *
 * BanCoppel · Afore Coppel
 * SQLite + filesystem para sesiones y escenas
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

define('STORAGE_PATH', __DIR__ . '/../storage/sessions');
define('DB_PATH', __DIR__ . '/../storage/db/teleprompter.sqlite');
define('MAX_VIDEO_SIZE', 200 * 1024 * 1024);
define('FFMPEG_BIN', '/usr/bin/ffmpeg');
define('FFPROBE_BIN', '/usr/bin/ffprobe');
define('DEFAULT_TOLERANCE', 80);

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

function gen_id($prefix = 'sess') {
    return $prefix . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4));
}

function hex_to_rgb($hex) {
    $hex = ltrim($hex, '#');
    return [
        'r' => hexdec(substr($hex, 0, 2)),
        'g' => hexdec(substr($hex, 2, 2)),
        'b' => hexdec(substr($hex, 4, 2))
    ];
}

/**
 * Conecta a SQLite e inicializa schema si no existe
 */
function db() {
    static $pdo = null;
    if ($pdo === null) {
        $dir = dirname(DB_PATH);
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

        // Schema auto-init
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS sesiones (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                brand TEXT NOT NULL DEFAULT 'bancoppel',
                chroma_color TEXT DEFAULT '#00ff00',
                tolerance INTEGER DEFAULT 80,
                bg_mode TEXT DEFAULT 'transparent',
                bg_color TEXT DEFAULT '#003D7A',
                scenes_count INTEGER DEFAULT 0,
                duration REAL DEFAULT 0,
                output_final TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS escenas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                numero INTEGER NOT NULL,
                texto TEXT,
                video_path TEXT,
                output_path TEXT,
                frames INTEGER DEFAULT 0,
                duration REAL DEFAULT 0,
                output_size INTEGER DEFAULT 0,
                chroma_hits INTEGER DEFAULT 0,
                bg_replaced INTEGER DEFAULT 0,
                status TEXT DEFAULT 'draft',
                error_msg TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                processed_at TEXT,
                UNIQUE(session_id, numero),
                FOREIGN KEY(session_id) REFERENCES sesiones(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_escenas_session ON escenas(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_created ON sesiones(created_at DESC);
        ");
    }
    return $pdo;
}
