<?php
/**
 * GET /api/list.php
 *
 * Lista todas las sesiones procesadas con sus metadatos
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('solo GET', 405);
}

if (!is_dir(STORAGE_PATH)) {
    json_ok(['sessions' => []]);
}

$sessions = [];
$dirs = glob(STORAGE_PATH . '/sess_*', GLOB_ONLYDIR);
foreach ($dirs as $dir) {
    $meta_path = $dir . '/meta.json';
    if (file_exists($meta_path)) {
        $meta = json_decode(file_get_contents($meta_path), true);
        if ($meta) {
            $meta['has_output'] = file_exists($dir . '/output.mp4');
            $sessions[] = $meta;
        }
    }
}

// Ordenar por fecha, más reciente primero
usort($sessions, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));

json_ok(['sessions' => $sessions]);
