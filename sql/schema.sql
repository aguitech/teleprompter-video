-- ====================================================================
-- Teleprompter Video Multi-Escena — Schema SQL (referencia)
-- ====================================================================
-- El backend usa SQLite por default (zero-config).
-- Si quieres migrar a MySQL, ejecuta este schema y ajusta el código PHP.
--
-- SQLite auto-crea el schema en api/config.php (db() function).
-- Este archivo es solo para referencia + import en phpMyAdmin si usas MySQL.
-- ====================================================================

CREATE TABLE IF NOT EXISTS `sesiones` (
  `id` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `brand` VARCHAR(32) NOT NULL DEFAULT 'bancoppel' COMMENT 'bancoppel | afore | ambas',
  `chroma_color` VARCHAR(7) DEFAULT '#00ff00',
  `tolerance` INT DEFAULT 80 COMMENT '0-180',
  `bg_mode` VARCHAR(32) DEFAULT 'transparent' COMMENT 'transparent | bancoppel | afore | custom | none',
  `bg_color` VARCHAR(7) DEFAULT '#003D7A',
  `scenes_count` INT DEFAULT 0,
  `duration` DECIMAL(10,2) DEFAULT 0 COMMENT 'segundos totales',
  `output_final` VARCHAR(500) DEFAULT NULL COMMENT 'path al MP4 concatenado',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `escenas` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `session_id` VARCHAR(64) NOT NULL,
  `numero` INT NOT NULL COMMENT '1..N, posición en la sesión',
  `texto` TEXT COMMENT 'texto del teleprompter',
  `video_path` VARCHAR(500) DEFAULT NULL COMMENT 'WebM grabado',
  `output_path` VARCHAR(500) DEFAULT NULL COMMENT 'MP4 procesado con chroma',
  `frames` INT DEFAULT 0,
  `duration` DECIMAL(10,2) DEFAULT 0 COMMENT 'segundos',
  `output_size` INT DEFAULT 0 COMMENT 'bytes del MP4',
  `status` VARCHAR(32) DEFAULT 'draft' COMMENT 'draft | recording | recorded | processing | processed | error',
  `error_msg` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `processed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_session_numero` (`session_id`, `numero`),
  KEY `idx_session` (`session_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_escena_session`
    FOREIGN KEY (`session_id`) REFERENCES `sesiones` (`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================================================================
-- Consultas de ejemplo
-- ====================================================================

-- Sesiones con conteo de escenas procesadas:
-- SELECT s.id, s.title, s.brand, s.created_at,
--        COUNT(e.id) AS total_escenas,
--        SUM(CASE WHEN e.status='processed' THEN 1 ELSE 0 END) AS procesadas,
--        s.duration
-- FROM sesiones s
-- LEFT JOIN escenas e ON e.session_id = s.id
-- GROUP BY s.id
-- ORDER BY s.created_at DESC;

-- Detalle de una sesión con sus escenas:
-- SELECT * FROM escenas WHERE session_id = 'sess_xxx' ORDER BY numero;

-- Tasa de éxito global:
-- SELECT
--   COUNT(*) AS total,
--   SUM(CASE WHEN status='processed' THEN 1 ELSE 0 END) AS ok,
--   SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS error
-- FROM escenas;
