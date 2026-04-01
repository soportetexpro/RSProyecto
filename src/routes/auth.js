'use strict';

/**
 * auth.js — Rutas de autenticación
 *
 * Propósito:
 *   Resolver el ciclo de sesión del usuario (login, sesión actual y logout).
 *
 * Fuente de datos principal:
 *   - MySQL tabla `usuario` y tablas relacionadas vía src/models/usuario.js
 *
 * Dependencias críticas:
 *   - verifyPasswordDjango: valida password hash heredado de Django
 *   - generarToken: firma JWT para autorización en rutas protegidas
 *   - requireAuth: valida token y carga req.usuario
 *
 * POST /api/auth/login   — login con email + password, retorna JWT
 * GET  /api/auth/me      — datos del usuario autenticado (requiere JWT)
 * POST /api/auth/logout  — logout (el cliente descarta el token)
 */

const express = require('express');
const {
  findByEmail,
  updateLastLogin,
  findById,
  getVendedoresByUsuarioId,
  getMetasByUsuarioId
} = require('../models/usuario');
const { verifyPasswordDjango } = require('../utils/pbkdf2Django');
const { generarToken }         = require('../utils/jwt');
const { requireAuth }          = require('../middlewares/requireAuth');

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    // Normalización de credenciales entrantes.
    // email: trim + lowercase para evitar duplicidades por formato.
    const email    = String(req.body.email    || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email y contraseña son requeridos' });
    }

    // Consulta a MySQL para obtener usuario por email.
    const usuario = await findByEmail(email);
    if (!usuario) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    if (!usuario.is_active) return res.status(403).json({ ok: false, error: 'Cuenta inactiva. Contacta a soporte.' });

    // Verificación criptográfica del password en formato Django PBKDF2.
    let isValid = false;
    try { isValid = verifyPasswordDjango(password, usuario.password); }
    catch { return res.status(401).json({ ok: false, error: 'Credenciales inválidas' }); }
    if (!isValid) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    // Carga datos de negocio asociados al usuario en paralelo para
    // reducir latencia total del login.
    const [vendedores, metas] = await Promise.all([
      getVendedoresByUsuarioId(usuario.id),
      getMetasByUsuarioId(usuario.id),
      updateLastLogin(usuario.id)
    ]);

    // Emisión de JWT que el frontend usará en Authorization: Bearer.
    const token = generarToken({
      sub:       usuario.id,
      email:     usuario.email,
      is_admin:  usuario.is_admin,
      vendedores,
      area:      usuario.area
    });

    return res.status(200).json({
      ok:        true,
      message:   'Login correcto',
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      user: {
        id:             usuario.id,
        nombre:         usuario.nombre,
        email:          usuario.email,
        area:           usuario.area,
        codigo:         usuario.codigo,
        tema:           usuario.tema,
        is_admin:       Boolean(usuario.is_admin),
        is_active:      Boolean(usuario.is_active),
        last_login:     usuario.last_login,
        fecha_creacion: usuario.fecha_creacion,
        vendedores,
        metas
      }
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Reconstruye vendedores desde MySQL para tener tipo actualizado en cada request
router.get('/me', requireAuth, async (req, res) => {
  try {
    // req.usuario.sub viene desde JWT validado por requireAuth.
    const usuario = await findById(req.usuario.sub);
    if (!usuario || !usuario.is_active) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
    }

    // Reconsulta para asegurar datos actualizados en cada request.
    const vendedores = await getVendedoresByUsuarioId(usuario.id);
    return res.status(200).json({
      ok: true,
      user: { ...usuario, vendedores }
    });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuario.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  return res.status(200).json({ ok: true, message: 'Sesión cerrada correctamente.' });
});

module.exports = router;
