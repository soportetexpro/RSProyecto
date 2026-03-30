/**
 * Middleware que verifica que el usuario autenticado sea administrador.
 * Debe usarse DESPUÉS de requireAuth.
 */
const requireAdmin = (req, res, next) => {
  if (!req.usuario) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (!req.usuario.is_admin) {
    return res.status(403).json({
      error: 'Acceso denegado. Se requieren permisos de administrador.'
    });
  }
  next();
};

module.exports = requireAdmin;
