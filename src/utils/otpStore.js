'use strict';

/**
 * otpStore.js — CRUD de OTP en tabla `otp_tokens` (MySQL)
 *
 * Cada OTP:
 *   - Es de 6 dígitos numéricos
 *   - Expira en 15 minutos
 *   - Solo puede usarse una vez (campo `usado`)
 *   - Al pedir nuevo OTP se invalidan los anteriores del mismo email
 */

const crypto    = require('crypto');
const { pool }  = require('../config/db');

const TTL_MINUTOS = 15;

/**
 * Genera y persiste un OTP para el email dado.
 * Invalida todos los OTP anteriores del mismo email.
 * @param {string} email
 * @returns {Promise<string>} el código de 6 dígitos
 */
async function crearOtp(email) {
  const codigo = String(Math.floor(100000 + crypto.randomInt(900000))).padStart(6, '0');

  // Invalida OTPs previos
  await pool.execute(
    'UPDATE otp_tokens SET usado = 1 WHERE email = ? AND usado = 0',
    [email]
  );

  // Inserta nuevo OTP
  await pool.execute(
    `INSERT INTO otp_tokens (email, codigo, expira_en)
     VALUES (?, ?, DATE_ADD(NOW(6), INTERVAL ? MINUTE))`,
    [email, codigo, TTL_MINUTOS]
  );

  return codigo;
}

/**
 * Verifica que el OTP sea válido para el email dado.
 * Lo marca como usado si es correcto.
 * @param {string} email
 * @param {string} codigo
 * @returns {Promise<boolean>}
 */
async function verificarOtp(email, codigo) {
  const [rows] = await pool.execute(
    `SELECT id FROM otp_tokens
     WHERE email = ?
       AND codigo = ?
       AND usado = 0
       AND expira_en > NOW(6)
     ORDER BY creado_en DESC
     LIMIT 1`,
    [email, codigo]
  );

  if (!rows.length) return false;

  await pool.execute(
    'UPDATE otp_tokens SET usado = 1 WHERE id = ?',
    [rows[0].id]
  );

  return true;
}

module.exports = { crearOtp, verificarOtp };
