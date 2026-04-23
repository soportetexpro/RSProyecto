-- =============================================================================
-- Script para aplicar en BD existente (si alertas ya tiene datos)
-- Agrega los campos nuevos sin perder datos existentes
-- Ejecutar UNA sola vez
-- =============================================================================

-- Agrega frecuencia_recordatorio a tabla alertas (si no existe)
ALTER TABLE `alertas`
  ADD COLUMN IF NOT EXISTS `frecuencia_recordatorio`
    ENUM('diaria','semanal','quincenal','manual') NOT NULL DEFAULT 'semanal'
    COMMENT 'Cada cuánto tiempo se muestra el recordatorio'
    AFTER `fecha_vence`;

-- Agrega ultimo_recordatorio a alerta_destinatarios (si no existe)
ALTER TABLE `alerta_destinatarios`
  ADD COLUMN IF NOT EXISTS `ultimo_recordatorio`
    DATETIME DEFAULT NULL
    COMMENT 'Última vez que el sistema mostró el recordatorio a este usuario'
    AFTER `descartada_hoy`;

-- Valores por defecto para filas existentes
UPDATE `alertas`
  SET `frecuencia_recordatorio` = 'semanal'
  WHERE `frecuencia_recordatorio` IS NULL;

-- Confirmar cambios
-- SELECT id, titulo, frecuencia_recordatorio FROM alertas LIMIT 10;
-- SELECT id_alerta, id_usuario, ultimo_recordatorio FROM alerta_destinatarios LIMIT 10;
