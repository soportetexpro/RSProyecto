'use strict';

/**
 * auth.js — Rutas de autenticación
 *
 * POST /api/auth/login   — Valida credenciales y devuelve JWT
 * GET  /api/auth/me      — Devuelve datos del usuario autenticado (requiere JWT)
 * POST /api/auth/logout  — Logout simbólico (el cliente elimina el token)
 *
 * Flujo JWT:
 *   1. Login exitoso → genera token firmado con JWT_SECRET (expira en JWT_EXPIRES_IN)
 *   2. El cliente guarda el token (localStorage o cookie httpOnly)
 *   3. Cada request protegido envía: Authorization: Bearer <token>
 *   4. verifyToken middleware valida y decodifica el token
 *   5. /me permite al frontend rehidratar la sesión al recargar la página
 */

const express  = require('express');
const jwt      = require('jsonwebtoken');
const { getUsuarioCompletoByEmail, findById, updateLastLogin } = require('../models/usuario');
const { verifyPasswordDjango }  = require('../utils/pbkdf2Django');
const { verifyToken }           = require('../utils/verifyToken');

const router = express.Router();

const JWT_SECRET     = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// ───────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { email: string, password: string }
// ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      console.error('[auth/login] JWT_SECRET no definido en .env');
      return res.status(500).json({ ok: false, error: 'Error de configuración del servidor' });
    }

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

    // 2. Usuario no existe → respuesta genérica (no revelar si el email es válido)
    if (!usuario) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    // 3. Cuenta inactiva
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

    // 6. Generar JWT — payload mínimo (no incluir datos sensibles)
    const payload = {
      id:       usuario.id,
      email:    usuario.email,
      nombre:   usuario.nombre,
      area:     usuario.area,
      codigo:   usuario.codigo,
      is_admin: Boolean(usuario.is_admin)
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer:    'rsproyecto-texpro'
    });

    // 7. Construir respuesta sin exponer password
    const responseUser = {
      id:                  usuario.id,
      nombre:              usuario.nombre,
      email:               usuario.email,
      area:                usuario.area,
      codigo:              usuario.codigo,
      tema:                usuario.tema,
      is_admin:            Boolean(usuario.is_admin),
      is_active:           Boolean(usuario.is_active),
      last_login:          usuario.last_login,
      fecha_creacion:      usuario.fecha_creacion,
      vendedores:          usuario.vendedores,
      permisos:            usuario.permisos,
      metas:               usuario.metas,
      facturasCompartidas: usuario.facturasCompartidas
    };

    return res.status(200).json({
      ok:      true,
      message: 'Login correcto',
      token,
      user:    responseUser
    });

  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ ok: false, error: 'No se pudo procesar el login' });
  }
});

// ───────────────────────────────────────────────────────────────
// GET /api/auth/me
// Header: Authorization: Bearer <token>
// Rehidrata la sesión al recargar la página (datos frescos desde BD)
// ───────────────────────────────────────────────────────────────
router.get('/me', verifyToken, async (req, res) => {
  try {
    const usuario = await findById(req.user.id);

    if (!usuario || !usuario.is_active) {
      return res.status(401).json({ ok: false, error: 'Usuario no encontrado o inactivo' });
    }

    const { password: _pw, ...usuarioSinPassword } = usuario;

    return res.status(200).json({
      ok:   true,
      user: usuarioSinPassword
    });

  } catch (err) {
    console.error('[auth/me]', err);
    return res.status(500).json({ ok: false, error: 'Error al obtener usuario' });
  }
});

// ───────────────────────────────────────────────────────────────
// POST /api/auth/logout
// Logout simbólico: el servidor no guarda lista negra de tokens.
// El cliente es responsable de eliminar el token.
// ───────────────────────────────────────────────────────────────
router.post('/logout', verifyToken, (_req, res) => {
  return res.status(200).json({
    ok:      true,
    message: 'Sesión cerrada. Elimina el token del cliente.'
  });
});

module.exports = router;
