<?php
/**
 * GET /api/download.php?session=XXX&scene=N
 * GET /api/download.php?session=XXX&final=1
 *
 * Descarga MP4 de una escena específica o del video final concatenado
 */

require_once __DIR__ . '/config.php';

$session = $_GET['session'] ?? '';
$final = isset($_GET['final']);

if ($final) {
    if (!$session) { http_response_code(400); exit('session requerido'); }
    $path = STORAGE_PATH . '/' . $session . '/final.mp4';
    if (!file_exists($path)) { http_response_code(404); exit('final no encontrado'); }
    header('Content-Type: video/mp4');
    header('Content-Length: ' . filesize($path));
    header('Content-Disposition: attachment; filename="' . $session . '_final.mp4"');
    header('Cache-Control: public, max-age=86400');
    readfile($path);
    exit;
}

$numero = (int)($_GET['scene'] ?? 0);
if (!$session || !$numero) {
    http_response_code(400);
    exit('parámetros requeridos: session, scene');
}

$path = STORAGE_PATH . '/' . $session . '/escena_' . str_pad($numero, 3, '0', STR_PAD_LEFT) . '/output.mp4';

if (!file_exists($path)) {
    http_response_code(404);
    exit('output no encontrado');
}

header('Content-Type: video/mp4');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: attachment; filename="' . $session . '_scene_' . $numero . '.mp4"');
header('Cache-Control: public, max-age=86400');
readfile($path);
