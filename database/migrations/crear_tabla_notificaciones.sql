-- =============================================================================
-- Migración: crear tabla notificaciones
-- Base de datos: bdtexpro (MySQL)
-- Ejecutar UNA sola vez en el servidor de base de datos
-- =============================================================================

CREATE TABLE IF NOT EXISTS notificaciones (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED    NOT NULL,
  tipo           VARCHAR(40)     NOT NULL
                   COMMENT 'folio_recibido | folio_asignado | meta_cumplida | meta_superada',
  titulo         VARCHAR(200)    NOT NULL,
  mensaje        TEXT            NOT NULL,
  leida          TINYINT(1)      NOT NULL DEFAULT 0,
  folio          INT             DEFAULT NULL,
  mes            TINYINT         DEFAULT NULL
                   COMMENT '1-12',
  anio           SMALLINT        DEFAULT NULL,
  fecha_creacion DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  -- Consulta principal: notificaciones de un usuario (campana)
  KEY idx_usuario_leida       (usuario_id, leida),

  -- Evitar duplicados de meta (chequeo en notificarMetaCumplida / notificarMetaSuperada)
  KEY idx_usuario_tipo_mes    (usuario_id, tipo, mes, anio)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Notificaciones internas del sistema RSProyecto';

-- Verificar estructura creada
-- DESCRIBE notificaciones;
