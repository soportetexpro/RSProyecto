-- ══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Alertas y Recordatorios
-- Texpro RSProyecto — MySQL
-- v2: agrega frecuencia_recordatorio en alertas
--     agrega ultimo_recordatorio en alerta_destinatarios
-- ══════════════════════════════════════════════════════════════════

-- Tabla principal de alertas
CREATE TABLE IF NOT EXISTS alertas (
  id                      INT           NOT NULL AUTO_INCREMENT,
  titulo                  VARCHAR(160)  NOT NULL,
  descripcion             TEXT,
  tipo                    ENUM('personal','grupal') NOT NULL DEFAULT 'personal',
  fecha_vence             DATE          NOT NULL,
  frecuencia_recordatorio ENUM('siempre','diaria','semanal','quincenal') NOT NULL DEFAULT 'semanal',
  id_creador              INT           NOT NULL,
  activa                  TINYINT(1)    NOT NULL DEFAULT 1,
  completada              TINYINT(1)    NOT NULL DEFAULT 0,
  created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_creador   (id_creador),
  INDEX idx_activa    (activa),
  INDEX idx_vence     (fecha_vence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de destinatarios (para alertas grupales y seguimiento por usuario)
CREATE TABLE IF NOT EXISTS alerta_destinatarios (
  id                  INT        NOT NULL AUTO_INCREMENT,
  id_alerta           INT        NOT NULL,
  id_usuario          INT        NOT NULL,
  descartada_hoy      DATE       DEFAULT NULL,
  silenciada          TINYINT(1) NOT NULL DEFAULT 0,
  ultimo_recordatorio DATE       DEFAULT NULL,  -- última vez que se mostró el recordatorio
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerta_usuario (id_alerta, id_usuario),
  INDEX idx_alerta    (id_alerta),
  INDEX idx_usuario   (id_usuario),
  CONSTRAINT fk_dest_alerta FOREIGN KEY (id_alerta) REFERENCES alertas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Scripts ALTER para bases de datos existentes ─────────────────
-- Ejecutar solo si la tabla ya existe sin estas columnas:

-- ALTER TABLE alertas
--   ADD COLUMN IF NOT EXISTS frecuencia_recordatorio
--     ENUM('siempre','diaria','semanal','quincenal') NOT NULL DEFAULT 'semanal'
--     AFTER fecha_vence;

-- ALTER TABLE alerta_destinatarios
--   ADD COLUMN IF NOT EXISTS ultimo_recordatorio DATE DEFAULT NULL
--     AFTER silenciada;
