'use strict';

const express      = require('express');
const router       = express.Router();
const { requireAuth } = require('../middlewares/requireAuth');
const requireAdmin    = require('../middlewares/requireAdmin');
const db              = require('../config/db');

// Todos los endpoints de admin requieren autenticación + rol admin
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/usuarios
 * Lista todos los usuarios del sistema
 */
router.get('/usuarios', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, email, tipo_vendedor, cod_vendedor,
              is_admin, activo, created_at
       FROM usuario
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error('[ADMIN] Error al obtener usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

/**
 * GET /api/admin/usuarios/:id
 * Detalle de un usuario
 */
router.get('/usuarios/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, email, tipo_vendedor, cod_vendedor, is_admin, activo
       FROM usuario WHERE id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[ADMIN] Error al obtener usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al obtener usuario' });
  }
});

/**
 * PUT /api/admin/usuarios/:id
 * Actualiza datos de un usuario (activo, tipo_vendedor, is_admin)
 */
router.put('/usuarios/:id', async (req, res) => {
  const { activo, tipo_vendedor, is_admin, cod_vendedor } = req.body;
  const { id } = req.params;

  // Evitar que el admin se desadministre a sí mismo
  if (parseInt(id) === req.usuario.sub && is_admin === false) {
    return res.status(400).json({
      ok: false,
      error: 'No puedes quitarte permisos de administrador a ti mismo'
    });
  }

  try {
    await db.query(
      `UPDATE usuario
       SET activo = ?, tipo_vendedor = ?, is_admin = ?, cod_vendedor = ?
       WHERE id = ?`,
      [activo, tipo_vendedor, is_admin ? 1 : 0, cod_vendedor, id]
    );
    res.json({ ok: true, mensaje: 'Usuario actualizado correctamente' });
  } catch (err) {
    console.error('[ADMIN] Error al actualizar usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al actualizar usuario' });
  }
});

/**
 * POST /api/admin/usuarios/:id/toggle-activo
 * Activa o desactiva un usuario
 */
router.post('/usuarios/:id/toggle-activo', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT activo FROM usuario WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    const nuevoEstado = rows[0].activo ? 0 : 1;
    await db.query(
      'UPDATE usuario SET activo = ? WHERE id = ?',
      [nuevoEstado, req.params.id]
    );
    res.json({ ok: true, activo: nuevoEstado === 1 });
  } catch (err) {
    console.error('[ADMIN] Error al toggle usuario:', err);
    res.status(500).json({ ok: false, error: 'Error al cambiar estado del usuario' });
  }
});

module.exports = router;
