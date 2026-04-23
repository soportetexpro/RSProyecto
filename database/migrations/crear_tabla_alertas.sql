-- =============================================================================
-- Migración: crear tablas alertas y alerta_destinatarios
-- Base de datos: bdtexpro (MariaDB 10.4+)
-- Ejecutar UNA sola vez en el servidor de base de datos
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla principal de alertas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas (
  id                      INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  titulo                  VARCHAR(160)    NOT NULL,
  descripcion             TEXT            DEFAULT NULL,
  tipo                    ENUM('personal','grupal') NOT NULL DEFAULT 'personal',
  fecha_vence             DATE            NOT NULL,
  frecuencia_recordatorio ENUM('diaria','semanal','quincenal','manual') NOT NULL DEFAULT 'semanal'
                            COMMENT 'Cada cuánto tiempo se muestra el popup recordatorio al usuario',
  activa                  TINYINT(1)      NOT NULL DEFAULT 1,
  completada              TINYINT(1)      NOT NULL DEFAULT 0,
  id_creador              INT UNSIGNED    NOT NULL,
  created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_creador         (id_creador),
  KEY idx_fecha_vence     (fecha_vence),
  KEY idx_activa_vence    (activa, completada, fecha_vence)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Alertas y recordatorios de Texpro RSProyecto';

-- ----------------------------------------------------------------------------
-- 2. Tabla de relación alerta ↔ destinatario (incluye estado por usuario)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerta_destinatarios (
  id_alerta               INT UNSIGNED    NOT NULL,
  id_usuario              INT UNSIGNED    NOT NULL,
  silenciada              TINYINT(1)      NOT NULL DEFAULT 0
                            COMMENT 'El usuario silencia la alerta para siempre',
  descartada_hoy          DATE            DEFAULT NULL
                            COMMENT 'Fecha en que el usuario descartó el popup hoy',
  ultimo_recordatorio     DATETIME        DEFAULT NULL
                            COMMENT 'Última vez que se mostró el recordatorio a este usuario (para respetar frecuencia)',

  PRIMARY KEY (id_alerta, id_usuario),
  KEY idx_usuario_alerta  (id_usuario, id_alerta)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Estado individual de cada usuario sobre una alerta compartida';

-- ----------------------------------------------------------------------------
-- 3. Agregar columna frecuencia_recordatorio si la tabla ya existe
--    (para entornos donde alertas ya fue creada sin ese campo)
-- ----------------------------------------------------------------------------
ALTER TABLE alertas
  ADD COLUMN IF NOT EXISTS frecuencia_recordatorio
    ENUM('diaria','semanal','quincenal','manual') NOT NULL DEFAULT 'semanal'
    COMMENT 'Cada cuánto tiempo se muestra el popup recordatorio'
    AFTER fecha_vence;

-- Agregar columna ultimo_recordatorio si alerta_destinatarios ya existe
ALTER TABLE alerta_destinatarios
  ADD COLUMN IF NOT EXISTS ultimo_recordatorio
    DATETIME DEFAULT NULL
    COMMENT 'Última vez que se mostró el recordatorio a este usuario'
    AFTER descartada_hoy;

-- ----------------------------------------------------------------------------
-- VERIFICACIÓN (descomentar para revisar)
-- DESCRIBE alertas;
-- DESCRIBE alerta_destinatarios;
-- ----------------------------------------------------------------------------
