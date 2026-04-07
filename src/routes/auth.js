'use strict';

/**
 * routes/auth.js
 *
 * Endpoints de autenticación:
 *   POST /api/auth/login        — Inicio de sesión (email + password)
 *   GET  /api/auth/me           — Perfil del usuario autenticado
 *   POST /api/auth/logout       — Cierre de sesión (client-side)
 *   POST /api/auth/refresh      — Renovación silenciosa de token JWT (T-02)
 *
 * El endpoint /refresh verifica el token expirado (sin lanzar error por expiración),
 * valida que el usuario siga activo en BD y emite un nuevo token con la misma
 * duración configurada en JWT_EXPIRES_IN.
 */

const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const db         = require('../config/db');
const { requireAuth } = require('../middlewares/requireAuth');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '8h';

// ── POST /api/auth/login ────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { usuario: email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });
  }

  try {
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.password_hash, u.area, u.is_admin, u.is_active
       FROM usuario u
       WHERE u.email = ?
       LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    // Cargar vendedores asociados
    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );

    const payload = {
      sub:       user.id,
      email:     user.email,
      nombre:    user.nombre,
      area:      user.area,
      is_admin:  user.is_admin,
      vendedores,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
      ok: true,
      token,
      user: { ...payload },
    });

  } catch (err) {
    console.error('[POST /api/auth/login]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.area, u.is_admin, u.is_active
       FROM usuario u WHERE u.id = ? LIMIT 1`,
      [req.usuario.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Sesión no válida' });
    }
    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );
    res.json({ ok: true, user: { ...user, vendedores } });
  } catch (err) {
    console.error('[GET /api/auth/me]', err.message);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ── POST /api/auth/logout ───────────────────────────────────────────
// El token JWT es stateless; el logout se gestiona en el cliente borrando
// el token del localStorage. Este endpoint confirma la acción al frontend.
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Sesión cerrada' });
});

// ── POST /api/auth/refresh ──────────────────────────────────────────
/**
 * Renovación silenciosa de token JWT (T-02).
 *
 * Flujo:
 *   1. Recibe el token actual en el header Authorization: Bearer <token>
 *   2. Verifica la firma ignorando si está expirado (ignoreExpiration: true)
 *   3. Valida que el usuario siga activo en BD
 *   4. Emite un nuevo token con el mismo payload + nueva expiración
 *
 * El cliente llama a este endpoint automáticamente cuando detecta un 401.
 * Si el refresh también falla, redirige al login.
 *
 * Seguridad:
 *   - La firma JWT sigue siendo verificada — solo se ignora la fecha de expiración.
 *     Un token con firma inválida es rechazado con 401.
 *   - Se verifica is_active en BD en cada refresh para revocar accesos.
 */
router.post('/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  const token = authHeader.slice(7);

  let decoded;
  try {
    // ignoreExpiration: true — acepta tokens expirados para renovarlos
    decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
  } catch (_err) {
    // Firma inválida o token malformado — rechazar
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }

  // Ventana de renovación: solo renovar si el token expiró hace menos de 24h
  // Esto evita que tokens muy viejos (robados/olvidados) sean renovados indefinidamente.
  const ahora       = Math.floor(Date.now() / 1000);
  const expiracion  = decoded.exp || 0;
  const VENTANA_SEG = 24 * 60 * 60; // 24 horas

  if (ahora - expiracion > VENTANA_SEG) {
    return res.status(401).json({ ok: false, error: 'Token demasiado antiguo para renovar. Inicia sesión nuevamente.' });
  }

  try {
    // Verificar que el usuario siga activo en BD
    const [rows] = await db.pool.query(
      `SELECT u.id, u.email, u.nombre, u.area, u.is_admin, u.is_active
       FROM usuario u WHERE u.id = ? LIMIT 1`,
      [decoded.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo o no encontrado' });
    }

    const [vendedores] = await db.pool.query(
      `SELECT cod_vendedor, tipo FROM usuario_vendedor WHERE usuario_id = ?`,
      [user.id]
    );

    // Emitir nuevo token
    const nuevoPayload = {
      sub:       user.id,
      email:     user.email,
      nombre:    user.nombre,
      area:      user.area,
      is_admin:  user.is_admin,
      vendedores,
    };
    const nuevoToken = jwt.sign(nuevoPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({ ok: true, token: nuevoToken });

  } catch (err) {
    console.error('[POST /api/auth/refresh]', err.message);
    res.status(500).json({ ok: false, error: 'Error al renovar sesión' });
  }
});

module.exports = router;
