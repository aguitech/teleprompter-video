<?php
/**
 * GET /api/frames.php?session=XXX&scene=N
 *
 * Lista frames PNG/JPG procesados de una escena (para debug/preview)
 */

require_once __DIR__ . '/config.php';

$session = $_GET['session'] ?? '';
$numero = (int)($_GET['scene'] ?? 0);

if (!$session || !$numero) {
    json_error('parámetros requeridos: session, scene', 400);
}

$dir = STORAGE_PATH . '/' . $session . '/escena_' . str_pad($numero, 3, '0', STR_PAD_LEFT) . '/processed';

if (!is_dir($dir)) {
    json_error('directorio no encontrado', 404);
}

$files = glob($dir . '/frame_*.{jpg,png}', GLOB_BRACE);
sort($files);

$base_url = "https://api.aguitech.com.mx/teleprompter-video/storage/sessions/{$session}/escena_" . str_pad($numero, 3, '0', STR_PAD_LEFT) . "/processed";

json_ok([
    'count' => count($files),
    'frames' => array_map(fn($f) => [
        'name' => basename($f),
        'size' => filesize($f),
        'url' => $base_url . '/' . basename($f),
    ], $files),
]);
