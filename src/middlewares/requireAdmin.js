'use strict';

/**
 * requireAdmin — Middleware que exige is_admin = true
 * Debe usarse DESPUÉS de requireAuth en la cadena de middlewares.
 *
 * Uso:
 *   router.use(requireAuth, requireAdmin);
 *   router.get('/ruta', requireAuth, requireAdmin, handler);
 */
function requireAdmin(req, res, next) {
  if (!req.usuario?.is_admin) {
    return res.status(403).json({
      ok:    false,
      error: 'Acceso restringido a administradores.'
    });
  }
  next();
}

module.exports = requireAdmin;
