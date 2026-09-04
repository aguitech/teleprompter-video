<?php
/**
 * POST /api/process.php
 *
 * Procesa UNA escena de una sesión:
 *   - Recibe WebM
 *   - Guarda en storage/sessions/{session_id}/escena_{numero}/input.webm
 *   - Extrae frames con FFmpeg
 *   - Aplica chroma key pixel-by-pixel con GD
 *   - Recompone MP4
 *   - Actualiza registro en BD
 *
 * Form fields:
 *   session_id:     string
 *   numero_escena:  int (1..N)
 *   video:          File WebM
 *   chroma_color:   hex
 *   tolerance:      int
 *   bg_mode:        string
 *   bg_color:       hex
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('solo POST', 405);
}

$session_id = trim($_POST['session_id'] ?? '');
$numero = max(1, (int)($_POST['numero_escena'] ?? 0));
$chroma_color = trim($_POST['chroma_color'] ?? '#00ff00');
$tolerance = max(10, min(180, (int)($_POST['tolerance'] ?? DEFAULT_TOLERANCE)));
$bg_mode = trim($_POST['bg_mode'] ?? 'transparent');
$bg_color = trim($_POST['bg_color'] ?? '#003D7A');

if (!$session_id) json_error('session_id requerido', 400);
if (!$numero) json_error('numero_escena requerido', 400);
if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
    json_error('no se recibió video válido', 400);
}
if ($_FILES['video']['size'] > MAX_VIDEO_SIZE) {
    json_error('video excede ' . (MAX_VIDEO_SIZE / 1024 / 1024) . ' MB', 413);
}

// ============== VERIFICAR SESIÓN ==============
$pdo = db();
$stmt = $pdo->prepare("SELECT * FROM sesiones WHERE id = ?");
$stmt->execute([$session_id]);
$session = $stmt->fetch();
if (!$session) json_error('sesión no encontrada', 404);

// ============== CREAR DIRECTORIO ==============
$scene_dir = STORAGE_PATH . '/' . $session_id . '/escena_' . str_pad($numero, 3, '0', STR_PAD_LEFT);
if (!is_dir($scene_dir) && !mkdir($scene_dir, 0755, true)) {
    json_error('no se pudo crear directorio de escena', 500);
}
$frames_dir = $scene_dir . '/frames';
$processed_dir = $scene_dir . '/processed';
if (!is_dir($frames_dir)) mkdir($frames_dir, 0755, true);
if (!is_dir($processed_dir)) mkdir($processed_dir, 0755, true);

$input_path = $scene_dir . '/input.webm';
$output_path = $scene_dir . '/output.mp4';

// ============== MOVER VIDEO ==============
if (!move_uploaded_file($_FILES['video']['tmp_name'], $input_path)) {
    json_error('no se pudo guardar el video', 500);
}

// ============== UPSERT ESCENA ==============
$stmt = $pdo->prepare("
    INSERT INTO escenas (session_id, numero, texto, video_path, status)
    VALUES (?, ?, ?, ?, 'processing')
    ON CONFLICT(session_id, numero) DO UPDATE SET
        video_path = excluded.video_path,
        status = 'processing',
        error_msg = NULL
");
$stmt->execute([$session_id, $numero, '', $input_path]);

$log = [];
$log[] = "session: $session_id";
$log[] = "escena: $numero";
$log[] = "chroma: $chroma_color ±$tolerance";
$log[] = "bg_mode: $bg_mode";

// ============== FFMPEG: EXTRAER FRAMES ==============
if (!file_exists(FFMPEG_BIN)) {
    $pdo->prepare("UPDATE escenas SET status='error', error_msg='FFmpeg no instalado' WHERE session_id=? AND numero=?")
        ->execute([$session_id, $numero]);
    json_error('FFmpeg no instalado en ' . FFMPEG_BIN, 500);
}

$extract_ext = $bg_mode === 'transparent' ? 'png' : 'jpg';
$extract_cmd = sprintf(
    '%s -i %s -vf fps=24 %s/frame_%%05d.%s 2>&1',
    escapeshellarg(FFMPEG_BIN),
    escapeshellarg($input_path),
    escapeshellarg($frames_dir),
    $extract_ext
);
exec($extract_cmd, $extract_output, $extract_code);
$log[] = "extract exit: $extract_code";

$frames = glob($frames_dir . '/frame_*.' . $extract_ext);
if (!$frames) {
    $pdo->prepare("UPDATE escenas SET status='error', error_msg='No se pudieron extraer frames' WHERE session_id=? AND numero=?")
        ->execute([$session_id, $numero]);
    json_error('no se pudieron extraer frames del video', 500, ['log' => $log, 'ffmpeg_out' => $extract_output]);
}
sort($frames);
$frame_count = count($frames);
$log[] = "frames extraídos: $frame_count ($extract_ext)";

// ============== CHROMA KEY PIXEL A PIXEL ==============
$chroma_rgb = hex_to_rgb($chroma_color);
$bg_rgb = null;
if ($bg_mode === 'bancoppel') $bg_rgb = ['r' => 0, 'g' => 61, 'b' => 122];
elseif ($bg_mode === 'afore') $bg_rgb = ['r' => 0, 'g' => 166, 'b' => 81];
elseif ($bg_mode === 'custom') $bg_rgb = hex_to_rgb($bg_color);

$processed_count = 0;
$chroma_hits = 0;

foreach ($frames as $frame_path) {
    $ext = strtolower(pathinfo($frame_path, PATHINFO_EXTENSION));
    $img = $ext === 'png' ? @imagecreatefrompng($frame_path) : @imagecreatefromjpeg($frame_path);
    if (!$img) continue;

    $w = imagesx($img);
    $h = imagesy($img);

    $dest = imagecreatetruecolor($w, $h);
    if ($ext === 'png') {
        imagealphablending($img, false);
        imagesavealpha($img, true);
    }

    if ($bg_mode === 'transparent') {
        imagealphablending($dest, false);
        imagesavealpha($dest, true);
        $transparent_color = imagecolorallocatealpha($dest, 0, 0, 0, 127);
        imagefilledrectangle($dest, 0, 0, $w, $h, $transparent_color);
    } elseif ($bg_rgb) {
        $bg_color_id = imagecolorallocate($dest, $bg_rgb['r'], $bg_rgb['g'], $bg_rgb['b']);
        imagefilledrectangle($dest, 0, 0, $w, $h, $bg_color_id);
    } else {
        imagecopy($dest, $img, 0, 0, 0, 0, $w, $h);
    }

    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            $rgb = imagecolorat($img, $x, $y);
            $r = ($rgb >> 16) & 0xFF;
            $g = ($rgb >> 8) & 0xFF;
            $b = $rgb & 0xFF;

            $dr = $r - $chroma_rgb['r'];
            $dg = $g - $chroma_rgb['g'];
            $db = $b - $chroma_rgb['b'];
            $dist = sqrt($dr * $dr + $dg * $dg + $db * $db);

            if ($dist < $tolerance) {
                $chroma_hits++;
            } else {
                imagesetpixel($dest, $x, $y, $rgb);
            }
        }
    }

    if ($bg_mode === 'transparent') {
        $output_frame = $processed_dir . '/' . str_replace('.jpg', '.png', basename($frame_path));
        imagepng($dest, $output_frame, 6);
    } else {
        $output_frame = $processed_dir . '/' . basename($frame_path);
        imagejpeg($dest, $output_frame, 90);
    }
    imagedestroy($img);
    imagedestroy($dest);
    $processed_count++;
}

$log[] = "frames procesados: $processed_count";
$log[] = "chroma hits: $chroma_hits";

// ============== FFMPEG: RECOMPONER MP4 ==============
$frame_pattern = $bg_mode === 'transparent' ? 'frame_%05d.png' : 'frame_%05d.jpg';
$recomp_cmd = sprintf(
    '%s -y -framerate 24 -i %s/%s -i %s -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest %s 2>&1',
    escapeshellarg(FFMPEG_BIN),
    escapeshellarg($processed_dir),
    $frame_pattern,
    escapeshellarg($input_path),
    escapeshellarg($output_path)
);
exec($recomp_cmd, $recomp_output, $recomp_code);
$log[] = "recomp exit: $recomp_code";

if (!file_exists($output_path) || filesize($output_path) < 100) {
    $pdo->prepare("UPDATE escenas SET status='error', error_msg='Falló recompilación MP4' WHERE session_id=? AND numero=?")
        ->execute([$session_id, $numero]);
    json_error('no se pudo recompilar el video MP4', 500, ['log' => $log, 'ffmpeg_out' => $recomp_output]);
}

// ============== DURACIÓN ==============
$duration = 0;
if (file_exists(FFPROBE_BIN)) {
    $probe_cmd = sprintf(
        '%s -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 %s 2>&1',
        escapeshellarg(FFPROBE_BIN),
        escapeshellarg($input_path)
    );
    $duration = (float)trim(shell_exec($probe_cmd) ?: '0');
}

$output_size = filesize($output_path);
$relative_output = 'storage/sessions/' . $session_id . '/escena_' . str_pad($numero, 3, '0', STR_PAD_LEFT) . '/output.mp4';

// ============== UPDATE BD ==============
$stmt = $pdo->prepare("
    UPDATE escenas
    SET output_path = ?, frames = ?, duration = ?, output_size = ?, status = 'processed', processed_at = CURRENT_TIMESTAMP
    WHERE session_id = ? AND numero = ?
");
$stmt->execute([$relative_output, $processed_count, $duration, $output_size, $session_id, $numero]);

// Update sesión duration total
$pdo->prepare("
    UPDATE sesiones
    SET duration = (SELECT COALESCE(SUM(duration), 0) FROM escenas WHERE session_id = ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
")->execute([$session_id, $session_id]);

// ============== OBTENER scene_id ==============
$stmt = $pdo->prepare("SELECT id FROM escenas WHERE session_id = ? AND numero = ?");
$stmt->execute([$session_id, $numero]);
$scene_id = (int)$stmt->fetchColumn();

// ============== OPS EN STORAGE (cleanup frames raw) ==============
// Mantenemos frames por si se quieren descargar, pero podría limpiarse.
// Por ahora los dejamos para la página "view frames".

json_ok([
    'scene_id' => $scene_id,
    'session_id' => $session_id,
    'numero_escena' => $numero,
    'frames' => $processed_count,
    'duration' => round($duration, 2),
    'output_size' => $output_size,
    'chroma_hits' => $chroma_hits,
    'output_url' => "https://api.aguitech.com.mx/teleprompter-video/api/download.php?session={$session_id}&scene={$numero}",
    'log' => $log,
]);
