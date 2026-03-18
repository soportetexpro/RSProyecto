'use strict';

/**
 * requireAuth.js — Middleware de autenticación JWT
 *
 * Uso:
 *   router.get('/ruta-protegida', requireAuth, (req, res) => {
 *     const usuario = req.usuario; // payload del token
 *   });
 *
 * El token debe enviarse en el header Authorization:
 *   Authorization: Bearer <token>
 */

const { verificarToken } = require('../utils/jwt');

function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({
        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ok:    false,
        error: 'Token requerido. Incluye Authorization: Bearer <token>'
      });
    }

    const payload  = verificarToken(token);
    req.usuario    = payload; // { sub, email, is_admin, iat, exp }
    next();

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Token expirado. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ ok: false, error: 'Token inválido.' });
  }
}

/**
 * requireAdmin — Middleware que exige is_admin = true
 * Debe usarse DESPUÉS de requireAuth.
 */
function requireAdmin(req, res, next) {
  if (!req.usuario?.is_admin) {
    return res.status(403).json({ ok: false, error: 'Acceso restringido a administradores.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
