'use strict';

/**
 * verifyToken.js — Middleware de autenticación JWT
 *
 * Uso en rutas protegidas:
 *   const { verifyToken } = require('../utils/verifyToken');
 *   router.get('/ruta-protegida', verifyToken, handler);
 *
 * El token debe venir en el header:
 *   Authorization: Bearer <token>
 *
 * Si es válido, agrega req.user con el payload del token.
 */

const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      ok:    false,
      error: 'Token no proporcionado'
    });
  }

  const token      = authHeader.slice(7); // quitar 'Bearer '
  const JWT_SECRET = process.env.JWT_SECRET; // leer en runtime

  if (!JWT_SECRET) {
    console.error('[verifyToken] JWT_SECRET no definido en .env');
    return res.status(500).json({ ok: false, error: 'Error de configuración del servidor' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, error: 'Sesión expirada. Vuelve a iniciar sesión.' });
    }
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

module.exports = { verifyToken };
