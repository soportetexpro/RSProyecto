'use strict';

/**
 * routes/notificaciones.js
 *
 * GET  /api/notificaciones            — lista (query: ?soloNoLeidas=1&limit=30)
 * GET  /api/notificaciones/contador   — { ok, total } no leídas
 * PATCH /api/notificaciones/:id/leer  — marca una como leída
 * PATCH /api/notificaciones/leer-todo — marca todas como leídas
 */

const express          = require('express');
const router           = express.Router();
const { requireAuth }  = require('../middlewares/requireAuth');
const notificacionModel = require('../models/notificacion');

router.use(requireAuth);

// ── GET /api/notificaciones ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const usuarioId    = req.usuario.sub;
    const soloNoLeidas = req.query.soloNoLeidas === '1';
    const limit        = Math.min(Number(req.query.limit) || 30, 100);
    const notis = await notificacionModel.obtenerNotificaciones(usuarioId, { soloNoLeidas, limit });
    res.json({ ok: true, notificaciones: notis });
  } catch (err) {
    console.error('[GET /api/notificaciones]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener notificaciones' });
  }
});

// ── GET /api/notificaciones/contador ────────────────────────────────
router.get('/contador', async (req, res) => {
  try {
    const total = await notificacionModel.contarNoLeidas(req.usuario.sub);
    res.json({ ok: true, total });
  } catch (err) {
    console.error('[GET /api/notificaciones/contador]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener contador' });
  }
});

// ── PATCH /api/notificaciones/:id/leer ──────────────────────────────
router.patch('/:id/leer', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });
    await notificacionModel.marcarLeida(id, req.usuario.sub);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notificaciones/:id/leer]', err.message);
    res.status(500).json({ ok: false, error: 'Error al marcar notificación' });
  }
});

// ── PATCH /api/notificaciones/leer-todo ─────────────────────────────
router.patch('/leer-todo', async (req, res) => {
  try {
    await notificacionModel.marcarTodasLeidas(req.usuario.sub);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notificaciones/leer-todo]', err.message);
    res.status(500).json({ ok: false, error: 'Error al marcar notificaciones' });
  }
});

module.exports = router;
