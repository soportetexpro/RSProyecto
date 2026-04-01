'use strict';

/**
 * recuperar.js — Rutas de recuperación de contraseña
 *
 * Propósito:
 *   Implementar el flujo seguro de restablecimiento de contraseña sin
 *   requerir sesión activa.
 *
 * Fuentes de información:
 *   - MySQL tabla `usuario` (findByEmail, updatePassword)
 *   - MySQL tabla `otp_tokens` (crearOtp, verificarOtp)
 *   - Microsoft Graph API (enviarOtp por correo)
 *   - JWT temporal para autorizar cambio de contraseña
 *
 * Principios de seguridad aplicados:
 *   - No revelar si el correo existe en el sistema
 *   - OTP de un solo uso con expiración
 *   - Token de reset con propósito explícito y TTL corto
 *
 * POST /api/auth/recuperar        — Paso 1: envía OTP al correo
 * POST /api/auth/verificar-otp    — Paso 2: valida el código OTP
 * POST /api/auth/nueva-password   — Paso 3: actualiza la contraseña
 *
 * Flujo de seguridad:
 *   1. El cliente solicita OTP para un email
 *   2. Si el email existe en BD, se genera OTP (15 min) y se envía por correo
 *      (Si el email NO existe, se responde igual — no revelar si existe)
 *   3. El cliente envía el OTP recibido — se valida contra la BD
 *      Si es correcto se emite un token temporal de reset (JWT, 15 min)
 *   4. El cliente envía nueva contraseña + token temporal
 *      Se verifica el token y se actualiza la contraseña en BD
 */

const express         = require('express');
const { findByEmail, updatePassword } = require('../models/usuario');
const { crearOtp, verificarOtp }      = require('../utils/otpStore');
const { enviarOtp }                   = require('../utils/mailer');
const jwt                             = require('jsonwebtoken');

const router = express.Router();

// Tiempo de vida del token de reset que autoriza cambiar contraseña.
const RESET_TOKEN_TTL = '15m';

function generarResetToken(email) {
  // Token acotado a propósito de recuperación para evitar reutilización
  // en otros contextos del sistema.
  return jwt.sign(
    { email, purpose: 'password_reset' },
    process.env.JWT_SECRET,
    { expiresIn: RESET_TOKEN_TTL }
  );
}

function verificarResetToken(token) {
  // Verifica firma/expiración y además controla que el payload pertenezca
  // al flujo de password reset.
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (payload.purpose !== 'password_reset') throw new Error('Token no es de reset');
  return payload;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/recuperar
// Body: { email: string }
// ─────────────────────────────────────────────────────────────────
router.post('/recuperar', async (req, res) => {
  try {
    // Normalización básica del correo ingresado por el cliente.
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email inválido.' });
    }

    // Siempre responde OK para no revelar si el email existe.
    // Si existe y está activo: genera OTP y dispara envío por correo.
    // Si no existe: responde igual para evitar enumeración de cuentas.
    const usuario = await findByEmail(email);
    if (usuario && usuario.is_active) {
      const codigo = await crearOtp(email);
      await enviarOtp(email, codigo);
    }

    return res.status(200).json({
      ok:      true,
      message: 'Si el correo está registrado, recibirás el código en breve.'
    });
  } catch (err) {
    console.error('[recuperar/enviar-otp]', err);
    return res.status(500).json({ ok: false, error: 'Error al enviar el código.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/verificar-otp
// Body: { email: string, otp: string }
// ─────────────────────────────────────────────────────────────────
router.post('/verificar-otp', async (req, res) => {
  try {
    // Se normaliza email y OTP para validación uniforme.
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp   = String(req.body.otp   || '').trim();

    if (!email || !otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ ok: false, error: 'Email y código de 6 dígitos son requeridos.' });
    }

    // Verifica OTP contra BD (debe existir, no usado y no expirado).
    const valido = await verificarOtp(email, otp);

    if (!valido) {
      return res.status(401).json({ ok: false, error: 'Código incorrecto o expirado.' });
    }

    // Si OTP es válido, se emite token temporal de reset (15 min).
    const resetToken = generarResetToken(email);

    return res.status(200).json({
      ok:         true,
      message:    'Código verificado correctamente.',
      resetToken
    });
  } catch (err) {
    console.error('[recuperar/verificar-otp]', err);
    return res.status(500).json({ ok: false, error: 'Error al verificar el código.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/nueva-password
// Body: { resetToken: string, password: string }
// ─────────────────────────────────────────────────────────────────
router.post('/nueva-password', async (req, res) => {
  try {
    // Datos esperados desde frontend luego de verificar OTP.
    const { resetToken, password } = req.body;

    if (!resetToken || !password) {
      return res.status(400).json({ ok: false, error: 'Token y contraseña son requeridos.' });
    }

    // Política mínima de complejidad del lado servidor.
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener mínimo 8 caracteres.' });
    }

    // El token debe ser válido, vigente y con purpose=password_reset.
    let payload;
    try {
      payload = verificarResetToken(resetToken);
    } catch {
      return res.status(401).json({ ok: false, error: 'Token de restablecimiento inválido o expirado.' });
    }

    // Persistencia final: updatePassword aplica hash compatible con Django.
    const actualizado = await updatePassword(payload.email, password);

    if (!actualizado) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado o inactivo.' });
    }

    return res.status(200).json({
      ok:      true,
      message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.'
    });
  } catch (err) {
    console.error('[recuperar/nueva-password]', err);
    return res.status(500).json({ ok: false, error: 'Error al actualizar la contraseña.' });
  }
});

module.exports = router;
