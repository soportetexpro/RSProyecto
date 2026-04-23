-- =============================================================================
-- Migración: crear tablas del módulo de Alertas y Recordatorios
-- Base de datos: bdtexpro (MariaDB / MySQL)
-- Ejecutar UNA sola vez en el servidor de base de datos
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla principal de alertas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas (
  id                       INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  titulo                   VARCHAR(160)   NOT NULL,
  descripcion              TEXT           DEFAULT NULL,
  tipo                     ENUM('personal','grupal') NOT NULL DEFAULT 'personal'
                             COMMENT 'personal = solo el creador la ve | grupal = compartida con destinatarios',
  fecha_vence              DATE           NOT NULL
                             COMMENT 'Fecha límite de la alerta',
  frecuencia_recordatorio  ENUM('siempre','diaria','semanal','quincenal') NOT NULL DEFAULT 'siempre'
                             COMMENT 'Con qué frecuencia se muestra el recordatorio al usuario creador',
  id_creador               INT UNSIGNED   NOT NULL
                             COMMENT 'FK -> usuarios.id',
  activa                   TINYINT(1)     NOT NULL DEFAULT 1
                             COMMENT '1 = activa, 0 = desactivada por el creador',
  completada               TINYINT(1)     NOT NULL DEFAULT 0
                             COMMENT '1 = marcada como completada',
  created_at               DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_creador          (id_creador),
  KEY idx_vence_activa     (fecha_vence, activa, completada),
  KEY idx_tipo             (tipo)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Alertas y recordatorios del sistema RSProyecto — Texpro';


-- ----------------------------------------------------------------------------
-- 2. Tabla de destinatarios y preferencias por usuario
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerta_destinatarios (
  id_alerta           INT UNSIGNED   NOT NULL
                        COMMENT 'FK -> alertas.id',
  id_usuario          INT UNSIGNED   NOT NULL
                        COMMENT 'FK -> usuarios.id  (incluye al creador)',
  silenciada          TINYINT(1)     NOT NULL DEFAULT 0
                        COMMENT '1 = el usuario silencia esta alerta para siempre',
  descartada_hoy      DATE           DEFAULT NULL
                        COMMENT 'Fecha en que el usuario descartó el popup por hoy',
  ultimo_recordatorio DATE           DEFAULT NULL
                        COMMENT 'Última vez que se mostró el popup al usuario (para respetar frecuencia)',

  PRIMARY KEY (id_alerta, id_usuario),
  KEY idx_usuario     (id_usuario)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Destinatarios y preferencias individuales por alerta';


-- ----------------------------------------------------------------------------
-- 3. ALTER TABLE de seguridad — agrega columnas si la tabla ya existía
--    (ignorar errores si las columnas ya existen)
-- ----------------------------------------------------------------------------

-- frecuencia_recordatorio en alertas
ALTER TABLE alertas
  ADD COLUMN IF NOT EXISTS frecuencia_recordatorio
    ENUM('siempre','diaria','semanal','quincenal')
    NOT NULL DEFAULT 'siempre'
    COMMENT 'Con qué frecuencia se muestra el recordatorio al usuario'
    AFTER fecha_vence;

-- ultimo_recordatorio en alerta_destinatarios
ALTER TABLE alerta_destinatarios
  ADD COLUMN IF NOT EXISTS ultimo_recordatorio
    DATE DEFAULT NULL
    COMMENT 'Última vez que se mostró el recordatorio a este usuario'
    AFTER descartada_hoy;


-- ----------------------------------------------------------------------------
-- 4. Verificación
-- ----------------------------------------------------------------------------
-- SHOW TABLES LIKE 'alerta%';
-- DESCRIBE alertas;
-- DESCRIBE alerta_destinatarios;
