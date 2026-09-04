<?php
/**
 * POST /api/process.php
 *
 * Recibe video WebM del frontend, lo guarda, extrae frames,
 * aplica chroma key pixel por pixel, recompone en MP4.
 *
 * Form fields:
 *   video: File (WebM)
 *   title: string
 *   brand: bancoppel | afore | ambas
 *   chroma_color: hex (#00ff00)
 *   tolerance: 0-120
 *   bg_mode: transparent | bancoppel | afore | custom | none
 *   bg_color: hex (opcional)
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_error('solo POST', 405);
}

if (!isset($_FILES['video']) || $_FILES['video']['error'] !== UPLOAD_ERR_OK) {
    json_error('no se recibió video válido', 400);
}

if ($_FILES['video']['size'] > MAX_VIDEO_SIZE) {
    json_error('video excede ' . (MAX_VIDEO_SIZE / 1024 / 1024) . ' MB', 413);
}

// ============== PARAMS ==============
$title = trim($_POST['title'] ?? 'Sin título');
$brand = trim($_POST['brand'] ?? 'bancoppel');
$chroma_color = trim($_POST['chroma_color'] ?? '#00ff00');
$tolerance = max(10, min(180, (int)($_POST['tolerance'] ?? DEFAULT_TOLERANCE)));
$bg_mode = trim($_POST['bg_mode'] ?? 'transparent');
$bg_color = trim($_POST['bg_color'] ?? '#003D7A');

// ============== SESSION ==============
$session_id = gen_id();
$session_dir = STORAGE_PATH . '/' . $session_id;
if (!mkdir($session_dir, 0755, true) && !is_dir($session_dir)) {
    json_error('no se pudo crear directorio de sesión', 500);
}

$input_path = $session_dir . '/input.webm';
$frames_dir = $session_dir . '/frames';
$processed_dir = $session_dir . '/processed';
$output_path = $session_dir . '/output.mp4';

if (!mkdir($frames_dir, 0755, true)) {
    json_error('no se pudo crear directorio de frames', 500);
}
if (!mkdir($processed_dir, 0755, true)) {
    json_error('no se pudo crear directorio processed', 500);
}

// ============== MOVER VIDEO ==============
if (!move_uploaded_file($_FILES['video']['tmp_name'], $input_path)) {
    json_error('no se pudo guardar el video', 500);
}

// ============== METADATA ==============
$log = [];
$log[] = "session_id: $session_id";
$log[] = "title: $title";
$log[] = "brand: $brand";
$log[] = "chroma: $chroma_color ±$tolerance";
$log[] = "bg_mode: $bg_mode";

// ============== FFMPEG: EXTRAER FRAMES ==============
if (!file_exists(FFMPEG_BIN)) {
    json_error('FFmpeg no instalado en ' . FFMPEG_BIN . '. Para usar local: apt-get install ffmpeg php-gd', 500);
}

// Si vamos a generar transparentes, extraer como PNG para preservar alpha
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
    // Cargar según extensión
    $ext = strtolower(pathinfo($frame_path, PATHINFO_EXTENSION));
    $img = $ext === 'png' ? @imagecreatefrompng($frame_path) : @imagecreatefromjpeg($frame_path);
    if (!$img) continue;

    $w = imagesx($img);
    $h = imagesy($img);

    // Crear imagen destino
    $dest = imagecreatetruecolor($w, $h);

    // Preservar alpha si el source es PNG
    if ($ext === 'png') {
        imagealphablending($img, false);
        imagesavealpha($img, true);
    }

    if ($bg_mode === 'transparent') {
        // Con alpha
        imagealphablending($dest, false);
        imagesavealpha($dest, true);
        $transparent_color = imagecolorallocatealpha($dest, 0, 0, 0, 127);
        imagefilledrectangle($dest, 0, 0, $w, $h, $transparent_color);
    } elseif ($bg_rgb) {
        // Con fondo de color
        $bg_color_id = imagecolorallocate($dest, $bg_rgb['r'], $bg_rgb['g'], $bg_rgb['b']);
        imagefilledrectangle($dest, 0, 0, $w, $h, $bg_color_id);
    } else {
        // Sin reemplazar: copiar imagen original
        imagecopy($dest, $img, 0, 0, 0, 0, $w, $h);
    }

    // Aplicar chroma key pixel por pixel sobre la imagen ORIGINAL
    // Si el pixel original es verde → pintar fondo
    // Si no → copiar pixel original a destino
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
                // Es verde → dejar fondo (ya está pintado)
                $chroma_hits++;
                // No copiamos pixel, el fondo queda
            } else {
                // NO es verde → copiar pixel original
                imagesetpixel($dest, $x, $y, $rgb);
            }
        }
    }

    $output_frame = $processed_dir . '/' . basename($frame_path);
    // Si el destino es transparente, guardar como PNG para preservar alpha
    if ($bg_mode === 'transparent') {
        $output_frame = $processed_dir . '/' . str_replace('.jpg', '.png', basename($frame_path));
        imagepng($dest, $output_frame, 6);
    } else {
        imagejpeg($dest, $output_frame, 90);
    }
    imagedestroy($img);
    imagedestroy($dest);
    $processed_count++;
}

$log[] = "frames procesados: $processed_count";
$log[] = "chroma hits: $chroma_hits pixels removidos";

// ============== FFMPEG: RECOMPONER EN MP4 ==============
// Si los frames son PNG, usar esos; si son JPG, usar esos
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

// ============== PERSISTIR METADATA ==============
$meta = [
    'session_id' => $session_id,
    'title' => $title,
    'brand' => $brand,
    'chroma_color' => $chroma_color,
    'tolerance' => $tolerance,
    'bg_mode' => $bg_mode,
    'bg_color' => $bg_mode === 'custom' ? $bg_color : null,
    'frames' => $processed_count,
    'duration' => $duration,
    'output_size' => filesize($output_path),
    'input_size' => filesize($input_path),
    'created_at' => date('Y-m-d H:i:s'),
    'log' => $log,
];
file_put_contents($session_dir . '/meta.json', json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// ============== RESPONSE ==============
json_ok([
    'session_id' => $session_id,
    'frames' => $processed_count,
    'duration' => round($duration, 2),
    'output_size' => filesize($output_path),
    'output_url' => "https://api.aguitech.com.mx/teleprompter-video/api/download.php?id={$session_id}",
    'gallery_url' => "https://aguitech.github.io/teleprompter-video/#gallery",
    'log' => $log,
]);
