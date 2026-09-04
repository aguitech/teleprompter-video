<?php
/**
 * GET /api/list.php — DEPRECATED: usa /api/sessions.php
 *
 * Por compatibilidad con frontend viejo
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_error('solo GET', 405);
}

$pdo = db();
$stmt = $pdo->query("SELECT * FROM sesiones ORDER BY created_at DESC");
$sessions = $stmt->fetchAll();

// Enriquecer con scene count
foreach ($sessions as &$s) {
    $s['scenes_count'] = (int)$s['scenes_count'];
    $s['frames'] = (int)$s['frames'];
    $s['duration'] = (float)$s['duration'];
}

json_ok(['sessions' => $sessions]);
