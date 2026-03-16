'use strict';

/**
 * auth.js — Rutas de autenticación
 * POST /api/auth/login
 *
 * Autentica contra ventas_usuario usando hash PBKDF2-SHA256 de Django.
 * No expone el campo password en la respuesta.
 */

const express                 = require('express');
const { getUsuarioCompletoByEmail, updateLastLogin } = require('../models/usuario');
const { verifyPasswordDjango }                       = require('../utils/pbkdf2Django');

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

    // 2. Si no existe → respuesta genérica (no revelar si el email es válido)
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

    // 6. Construir respuesta sin exponer password
    const responseUser = {
      id:                   usuario.id,
      nombre:               usuario.nombre,
      email:                usuario.email,
      area:                 usuario.area,
      codigo:               usuario.codigo,
      tema:                 usuario.tema,
      is_admin:             Boolean(usuario.is_admin),
      is_active:            Boolean(usuario.is_active),
      last_login:           usuario.last_login,
      fecha_creacion:       usuario.fecha_creacion,
      vendedores:           usuario.vendedores,
      permisos:             usuario.permisos,
      metas:                usuario.metas,
      facturasCompartidas:  usuario.facturasCompartidas
    };

    return res.status(200).json({
      ok:      true,
      message: 'Login correcto',
      user:    responseUser
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});

module.exports = router;
