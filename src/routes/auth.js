'use strict';

/**
 * auth.js — Rutas de autenticación
 *
 * POST /api/auth/login   — autentica y retorna JWT
 * GET  /api/auth/me      — retorna datos del usuario autenticado (requiere JWT)
 * POST /api/auth/logout  — logout (el cliente descarta el token)
 */

const express = require('express');
const { getUsuarioCompletoByEmail, updateLastLogin, findById } = require('../models/usuario');
const { verifyPasswordDjango } = require('../utils/pbkdf2Django');
const { generarToken }         = require('../utils/jwt');
const { requireAuth }          = require('../middlewares/requireAuth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email: string, password: string }
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

    // 1. Buscar usuario con todos sus datos relacionados
    const usuario = await getUsuarioCompletoByEmail(email);

    // 2. No revelar si el email existe o no
    if (!usuario) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    // 3. Verificar cuenta activa
    if (!usuario.is_active) {
      return res.status(403).json({ ok: false, error: 'Cuenta inactiva. Contacta a soporte.' });
    }

    // 4. Verificar contraseña contra hash Django PBKDF2-SHA256
    let isValid = false;
    try {
      isValid = verifyPasswordDjango(password, usuario.password);
    } catch {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    if (!isValid) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    // 5. Actualizar last_login
    await updateLastLogin(usuario.id);

    // 6. Generar JWT
    const token = generarToken({
      id:       usuario.id,
      email:    usuario.email,
      is_admin: usuario.is_admin
    });

    // 7. Construir respuesta sin exponer password
    const { password: _, ...usuarioSinPassword } = usuario;
    const responseUser = {
      ...usuarioSinPassword,
      is_admin:  Boolean(usuario.is_admin),
      is_active: Boolean(usuario.is_active)
    };

    return res.status(200).json({
      ok:        true,
      message:   'Login correcto',
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      user:      responseUser
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/auth/me   — ruta protegida
// Header: Authorization: Bearer <token>
// ─────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const usuario = await findById(req.usuario.sub);
    if (!usuario || !usuario.is_active) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
    }
    const { password: _, ...usuarioSinPassword } = usuario;
    return res.status(200).json({ ok: true, user: usuarioSinPassword });
  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuario.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// El JWT es stateless: el cliente simplemente descarta el token.
// ─────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  return res.status(200).json({ ok: true, message: 'Sesión cerrada correctamente.' });
});

module.exports = router;
