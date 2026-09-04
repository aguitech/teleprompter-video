<?php
/**
 * /api/sessions.php
 *
 * POST: crea o actualiza una sesión con N escenas
 * GET:  lista todas las sesiones o una específica con sus escenas
 * DELETE: elimina una sesión completa
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
$pdo = db();

// ============ POST: crear/actualizar ============
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) json_error('JSON inválido', 400);

    $id = trim($input['id'] ?? '');
    $title = trim($input['title'] ?? 'Sin título');
    $brand = trim($input['brand'] ?? 'bancoppel');
    $chroma_color = trim($input['chroma_color'] ?? '#00ff00');
    $tolerance = max(10, min(180, (int)($input['tolerance'] ?? DEFAULT_TOLERANCE)));
    $bg_mode = trim($input['bg_mode'] ?? 'transparent');
    $bg_color = trim($input['bg_color'] ?? '#003D7A');
    $scenes = $input['scenes'] ?? [];

    if (!is_array($scenes)) json_error('scenes debe ser array', 400);
    $scenes_count = count($scenes);

    // Generar ID si no viene
    if (!$id) $id = gen_id('sess');

    // Crear directorio
    $session_dir = STORAGE_PATH . '/' . $id;
    if (!is_dir($session_dir)) mkdir($session_dir, 0755, true);

    // UPSERT sesión
    $stmt = $pdo->prepare("
        INSERT INTO sesiones (id, title, brand, chroma_color, tolerance, bg_mode, bg_color, scenes_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            brand = excluded.brand,
            chroma_color = excluded.chroma_color,
            tolerance = excluded.tolerance,
            bg_mode = excluded.bg_mode,
            bg_color = excluded.bg_color,
            scenes_count = excluded.scenes_count,
            updated_at = CURRENT_TIMESTAMP
    ");
    $stmt->execute([$id, $title, $brand, $chroma_color, $tolerance, $bg_mode, $bg_color, $scenes_count]);

    // UPSERT cada escena (solo texto, no procesa video)
    $stmt_scene = $pdo->prepare("
        INSERT INTO escenas (session_id, numero, texto)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id, numero) DO UPDATE SET
            texto = excluded.texto
    ");
    foreach ($scenes as $scene) {
        $numero = (int)($scene['numero'] ?? 0);
        if (!$numero) continue;
        $texto = (string)($scene['texto'] ?? '');
        $stmt_scene->execute([$id, $numero, $texto]);
    }

    // Crear directorio para cada escena
    foreach ($scenes as $scene) {
        $numero = (int)($scene['numero'] ?? 0);
        if (!$numero) continue;
        $scene_dir = $session_dir . '/escena_' . str_pad($numero, 3, '0', STR_PAD_LEFT);
        if (!is_dir($scene_dir)) mkdir($scene_dir, 0755, true);
    }

    // Devolver sesión completa
    $stmt = $pdo->prepare("SELECT * FROM sesiones WHERE id = ?");
    $stmt->execute([$id]);
    $session = $stmt->fetch();

    json_ok(['session' => $session]);
}

// ============ GET: listar / detalle ============
if ($method === 'GET') {
    $id = $_GET['id'] ?? '';

    if ($id) {
        // Sesión específica con escenas
        $stmt = $pdo->prepare("SELECT * FROM sesiones WHERE id = ?");
        $stmt->execute([$id]);
        $session = $stmt->fetch();
        if (!$session) json_error('sesión no encontrada', 404);

        $stmt = $pdo->prepare("SELECT * FROM escenas WHERE session_id = ? ORDER BY numero ASC");
        $stmt->execute([$id]);
        $scenes = $stmt->fetchAll();

        // Enriquecer con output_url
        foreach ($scenes as &$sc) {
            $sc['output_url'] = $sc['output_path']
                ? "https://api.aguitech.com.mx/teleprompter-video/api/download.php?session={$id}&scene={$sc['numero']}"
                : null;
        }
        $session['scenes'] = $scenes;
        $session['scenes_processed'] = count(array_filter($scenes, fn($s) => $s['status'] === 'processed'));

        json_ok(['session' => $session]);
    }

    // Lista de todas las sesiones
    $stmt = $pdo->query("
        SELECT s.*,
               (SELECT COUNT(*) FROM escenas WHERE session_id = s.id AND status = 'processed') as scenes_processed
        FROM sesiones s
        ORDER BY s.created_at DESC
    ");
    $sessions = $stmt->fetchAll();
    foreach ($sessions as &$s) {
        $s['scenes_count'] = (int)$s['scenes_count'];
        $s['scenes_processed'] = (int)$s['scenes_processed'];
        $s['duration'] = (float)$s['duration'];
    }
    json_ok(['sessions' => $sessions]);
}

// ============ DELETE: eliminar sesión ============
if ($method === 'DELETE') {
    $id = $_GET['id'] ?? '';
    if (!$id) json_error('id requerido', 400);

    $stmt = $pdo->prepare("DELETE FROM escenas WHERE session_id = ?");
    $stmt->execute([$id]);
    $stmt = $pdo->prepare("DELETE FROM sesiones WHERE id = ?");
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) json_error('sesión no encontrada', 404);

    // Eliminar archivos
    $session_dir = STORAGE_PATH . '/' . $id;
    if (is_dir($session_dir)) {
        foreach (glob($session_dir . '/*') as $f) {
            if (is_dir($f)) {
                foreach (glob($f . '/*') as $ff) @unlink($ff);
                @rmdir($f);
            } else {
                @unlink($f);
            }
        }
        @rmdir($session_dir);
    }

    json_ok(['message' => 'sesión eliminada']);
}

json_error('método no soportado', 405);
