-- ============================================================
-- Migración: tabla notificaciones
-- Ejecutar una sola vez contra la BD MySQL (bdtexpro)
-- ============================================================

CREATE TABLE IF NOT EXISTS notificaciones (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED    NOT NULL,           -- destinatario (FK a usuario.id)
  tipo            ENUM(
    'folio_recibido',      -- vendedor recibe folio compartido
    'folio_asignado',      -- coordinador confirmación de que asignó
    'meta_cumplida',       -- vendedor alcanzó 100 % de meta
    'meta_superada'        -- vendedor superó la meta del mes
  )                       NOT NULL,
  titulo          VARCHAR(120)    NOT NULL,
  mensaje         TEXT            NOT NULL,
  leida           TINYINT(1)      NOT NULL DEFAULT 0,
  folio           INT UNSIGNED    NULL,               -- folio relacionado (opcional)
  mes             TINYINT UNSIGNED NULL,
  anio            SMALLINT UNSIGNED NULL,
  fecha_creacion  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_usuario_leida (usuario_id, leida),
  INDEX idx_usuario_tipo_mes (usuario_id, tipo, mes, anio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
