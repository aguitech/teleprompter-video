<?php
/**
 * POST /api/concat.php
 *
 * Une todas las escenas procesadas de una sesión en un solo MP4 final.
 *
 * Body JSON:
 *   { "session_id": "sess_xxx" }
 *
 * Response:
 *   { ok, final_url, duration, scenes_count }
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('solo POST', 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$session_id = trim($input['session_id'] ?? '');
if (!$session_id) json_error('session_id requerido', 400);

$pdo = db();
$stmt = $pdo->prepare("SELECT * FROM sesiones WHERE id = ?");
$stmt->execute([$session_id]);
$session = $stmt->fetch();
if (!$session) json_error('sesión no encontrada', 404);

// Get processed scenes ordered
$stmt = $pdo->prepare("SELECT * FROM escenas WHERE session_id = ? AND status = 'processed' ORDER BY numero ASC");
$stmt->execute([$session_id]);
$scenes = $stmt->fetchAll();

if (count($scenes) < 1) json_error('no hay escenas procesadas', 400);

// Build concat list file
$list_file = STORAGE_PATH . '/' . $session_id . '/concat_list.txt';
$lines = [];
foreach ($scenes as $s) {
    $abs = STORAGE_PATH . '/' . $session_id . '/escena_' . str_pad($s['numero'], 3, '0', STR_PAD_LEFT) . '/output.mp4';
    if (!file_exists($abs)) continue;
    $lines[] = "file '" . addslashes($abs) . "'";
}
file_put_contents($list_file, implode("\n", $lines));

// Concat
$output_path = STORAGE_PATH . '/' . $session_id . '/final.mp4';
$cmd = sprintf(
    '%s -y -f concat -safe 0 -i %s -c copy %s 2>&1',
    escapeshellarg(FFMPEG_BIN),
    escapeshellarg($list_file),
    escapeshellarg($output_path)
);
exec($cmd, $concat_output, $concat_code);

if (!file_exists($output_path)) {
    json_error('falló la concatenación', 500, ['log' => $concat_output]);
}

// Update sesión
$stmt = $pdo->prepare("UPDATE sesiones SET output_final = ? WHERE id = ?");
$stmt->execute([$output_path, $session_id]);

$duration = 0;
if (file_exists(FFPROBE_BIN)) {
    $probe_cmd = sprintf(
        '%s -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s 2>&1',
        escapeshellarg(FFPROBE_BIN),
        escapeshellarg($output_path)
    );
    $duration = (float)trim(shell_exec($probe_cmd) ?: '0');
}

json_ok([
    'final_url' => "https://api.aguitech.com.mx/teleprompter-video/api/download.php?session={$session_id}&final=1",
    'duration' => round($duration, 2),
    'scenes_count' => count($scenes),
    'size' => filesize($output_path),
]);
