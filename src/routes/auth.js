'use strict';

/**
 * auth.js — Rutas de autenticación
 *
 * POST /api/auth/login   — login con email + password, retorna JWT
 * GET  /api/auth/me      — datos del usuario autenticado (requiere JWT)
 * POST /api/auth/logout  — logout (el cliente descarta el token)
 *
 * El login SOLO verifica credenciales y retorna datos básicos del usuario.
 * Las relaciones (vendedores, metas, permisos) se cargan en cada módulo.
 */

const express = require('express');
const { findByEmail, updateLastLogin, findById } = require('../models/usuario');
const { verifyPasswordDjango } = require('../utils/pbkdf2Django');
const { generarToken }         = require('../utils/jwt');
const { requireAuth }          = require('../middlewares/requireAuth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email: string, password: string }
// Respuesta: { ok, token, expiresIn, user: { datos básicos sin password } }
// ─────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const email    = String(req.body.email    || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!email || !password) {
      return res.status(400).json({
        ok:    false,
        error: 'Email y contraseña son requeridos'
      });
    }

    const usuario = await findByEmail(email);

    if (!usuario) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    if (!usuario.is_active) {
      return res.status(403).json({ ok: false, error: 'Cuenta inactiva. Contacta a soporte.' });
    }

    let isValid = false;
    try {
      isValid = verifyPasswordDjango(password, usuario.password);
    } catch {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    await updateLastLogin(usuario.id);

    const token = generarToken({
      id:       usuario.id,
      email:    usuario.email,
      is_admin: usuario.is_admin
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
        fecha_creacion: usuario.fecha_creacion
      }
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/auth/me   — ruta protegida
// Header: Authorization: Bearer <token>
// Retorna datos básicos actualizados del usuario autenticado
// ─────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const usuario = await findById(req.usuario.sub);
    if (!usuario || !usuario.is_active) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
    }
    return res.status(200).json({ ok: true, user: usuario });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuario.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/logout   — ruta protegida
// El JWT es stateless: el cliente descarta el token.
// ─────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  return res.status(200).json({ ok: true, message: 'Sesión cerrada correctamente.' });
});

module.exports = router;
