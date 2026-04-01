'use strict';

/**
 * routes/notificaciones.js
 *
 * Rol del archivo:
 *   Expone endpoints HTTP para que el frontend lea y actualice el estado de
 *   las notificaciones del usuario autenticado.
 *
 * Fuente principal de datos:
 *   Tabla MySQL `notificaciones` (accedida indirectamente mediante
 *   src/models/notificacion.js).
 *
 * Flujo general:
 *   1) El cliente envía request con Authorization: Bearer <token>
 *   2) requireAuth valida JWT y carga req.usuario
 *   3) Esta ruta toma req.usuario.sub como usuario_id
 *   4) Llama al modelo para consultar/actualizar BD
 *   5) Responde JSON uniforme { ok: boolean, ... }
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

// Todas las rutas definidas en este router exigen sesión válida.
// requireAuth deja disponible req.usuario con el payload del usuario.
router.use(requireAuth);

// ── GET /api/notificaciones ──────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    // usuarioId viene del token JWT ya validado por requireAuth.
    // `sub` representa el id del usuario en la base de datos.
    const usuarioId    = req.usuario.sub;

    // Filtro opcional: solo no leídas cuando la query viene como "1".
    // Ejemplo: /api/notificaciones?soloNoLeidas=1
    const soloNoLeidas = req.query.soloNoLeidas === '1';

    // Límite defensivo para evitar cargas excesivas.
    // Default = 30, máximo permitido = 100.
    const limit        = Math.min(Number(req.query.limit) || 30, 100);

    // Lectura en BD mediante el modelo (capa de acceso a datos).
    // Origen real: tabla `notificaciones` en MySQL.
    const notis = await notificacionModel.obtenerNotificaciones(usuarioId, { soloNoLeidas, limit });

    // Contrato de salida consistente para frontend.
    res.json({ ok: true, notificaciones: notis });
  } catch (err) {
    // Se registra error interno, pero al cliente se envía mensaje genérico.
    console.error('[GET /api/notificaciones]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener notificaciones' });
  }
});

// ── GET /api/notificaciones/contador ────────────────────────────────
router.get('/contador', async (req, res) => {
  try {
    // Cuenta solo las notificaciones leídas = 0 del usuario autenticado.
    // Método de modelo: contarNoLeidas(usuarioId).
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
    // id de notificación llega por parámetro de URL.
    // parseInt transforma string -> number.
    const id = parseInt(req.params.id);

    // Validación mínima: evita NaN, 0 u otros valores falsy.
    if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });

    // Seguridad de ownership: el modelo actualiza solo si el registro
    // pertenece al usuario autenticado (WHERE id = ? AND usuario_id = ?).
    await notificacionModel.marcarLeida(id, req.usuario.sub);

    // No retorna la notificación, solo confirmación de operación.
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notificaciones/:id/leer]', err.message);
    res.status(500).json({ ok: false, error: 'Error al marcar notificación' });
  }
});

// ── PATCH /api/notificaciones/leer-todo ─────────────────────────────
router.patch('/leer-todo', async (req, res) => {
  try {
    // Marca como leídas todas las notificaciones pendientes del usuario.
    // Esta operación no afecta notificaciones de otros usuarios.
    await notificacionModel.marcarTodasLeidas(req.usuario.sub);
    res.json({ ok: true });
  } catch (err) {
    console.error('[PATCH /api/notificaciones/leer-todo]', err.message);
    res.status(500).json({ ok: false, error: 'Error al marcar notificaciones' });
  }
});

module.exports = router;
