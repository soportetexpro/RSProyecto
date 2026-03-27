'use strict';

/**
 * requireAuth.js — Middleware de autenticación JWT
 *
 * Decodifica el token y luego enriquece req.usuario con los vendedores
 * frescos desde MySQL, de modo que cambios en usuario_vendedor (tipo, cod_vendedor)
 * se reflejen sin necesidad de que el usuario vuelva a hacer login.
 */

const { verificarToken }             = require('../utils/jwt');
const { getVendedoresByUsuarioId }   = require('../models/usuario');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return res.status(401).json({
        ok:    false,
        error: 'Token requerido. Incluye Authorization: Bearer <token>'
      });
    }

    const payload = verificarToken(token);

    // Recargar vendedores frescos desde MySQL para que
    // cambios en usuario_vendedor (tipo C, nuevos códigos, etc.)
    // sean visibles sin necesidad de re-login.
    const vendedores = await getVendedoresByUsuarioId(payload.sub);

    req.usuario = {
      ...payload,
      vendedores,          // sobreescribe los del JWT con los de la BD
    };

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
