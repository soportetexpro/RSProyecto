-- ══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo de Alertas y Recordatorios
-- Texpro RSProyecto — MySQL
-- ══════════════════════════════════════════════════════════════════

-- Tabla principal de alertas
CREATE TABLE IF NOT EXISTS alertas (
  id              INT           NOT NULL AUTO_INCREMENT,
  titulo          VARCHAR(160)  NOT NULL,
  descripcion     TEXT,
  tipo            ENUM('personal','grupal') NOT NULL DEFAULT 'personal',
  fecha_vence     DATE          NOT NULL,
  id_creador      INT           NOT NULL,          -- FK → usuarios.id
  activa          TINYINT(1)    NOT NULL DEFAULT 1, -- 1=activa, 0=desactivada
  completada      TINYINT(1)    NOT NULL DEFAULT 0, -- 1=completada/hecha
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_creador   (id_creador),
  INDEX idx_activa    (activa),
  INDEX idx_vence     (fecha_vence)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de destinatarios (para alertas grupales)
-- Una fila por usuario destinatario. El creador también se incluye si quiere.
CREATE TABLE IF NOT EXISTS alerta_destinatarios (
  id              INT        NOT NULL AUTO_INCREMENT,
  id_alerta       INT        NOT NULL,
  id_usuario      INT        NOT NULL,
  descartada_hoy  DATE       DEFAULT NULL,  -- fecha en que el usuario presionó "No mostrar más hoy"
  silenciada      TINYINT(1) NOT NULL DEFAULT 0, -- silencio permanente para este usuario
  PRIMARY KEY (id),
  UNIQUE KEY uq_alerta_usuario (id_alerta, id_usuario),
  INDEX idx_alerta    (id_alerta),
  INDEX idx_usuario   (id_usuario),
  CONSTRAINT fk_dest_alerta   FOREIGN KEY (id_alerta)  REFERENCES alertas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
