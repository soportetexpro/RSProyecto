-- ============================================================
-- Tabla: otp_tokens
-- Almacena los códigos OTP de recuperación de contraseña.
-- Ejecutar una sola vez en bdtexpro.
-- ============================================================

CREATE TABLE IF NOT EXISTS `otp_tokens` (
  `id`         BIGINT       NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(254) NOT NULL,
  `codigo`     VARCHAR(6)   NOT NULL,
  `expira_en`  DATETIME(6)  NOT NULL,
  `usado`      TINYINT(1)   NOT NULL DEFAULT 0,
  `creado_en`  DATETIME(6)  NOT NULL DEFAULT NOW(6),
  PRIMARY KEY (`id`),
  INDEX `idx_otp_email` (`email`),
  INDEX `idx_otp_expira` (`expira_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Códigos OTP de recuperación de contraseña (TTL 15 min)';
