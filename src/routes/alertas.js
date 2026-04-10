'use strict';
/**
 * routes/alertas.js
 * CRUD completo para el módulo de Alertas y Recordatorios.
 */

const express  = require('express');
const router   = express.Router();
const db       = require('../config/db');
const { requireAuth } = require('../middlewares/requireAuth');

router.use(requireAuth);

function diasRestantes(fechaVence) {
  const hoy   = new Date(); hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaVence); vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence - hoy) / 86400000);
}

// ── GET /api/alertas ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [rows] = await db.query(`
      SELECT
        a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.id_creador, a.activa, a.completada, a.created_at,
        COALESCE(u.nombre, '') AS nombre_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        (
          SELECT GROUP_CONCAT(du.nombre ORDER BY du.nombre SEPARATOR ', ')
          FROM alerta_destinatarios adc
          JOIN usuarios du ON du.id = adc.id_usuario
          WHERE adc.id_alerta = a.id
        ) AS destinatarios_nombres,
        (
          SELECT GROUP_CONCAT(adc2.id_usuario ORDER BY adc2.id_usuario SEPARATOR ',')
          FROM alerta_destinatarios adc2
          WHERE adc2.id_alerta = a.id
        ) AS destinatarios_ids
      FROM alertas a
      LEFT JOIN usuarios u ON u.id = a.id_creador
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE
        a.id_creador = ?
        OR EXISTS (
          SELECT 1 FROM alerta_destinatarios adx
          WHERE adx.id_alerta = a.id AND adx.id_usuario = ?
        )
      ORDER BY a.activa DESC, a.completada ASC, a.fecha_vence ASC
    `, [uid, uid, uid]);

    const data = rows.map(r => ({
      ...r,
      dias_restantes:    diasRestantes(r.fecha_vence),
      destinatarios_ids: r.destinatarios_ids
        ? r.destinatarios_ids.split(',').map(Number)
        : [],
    }));

    res.json({ ok: true, data });
  } catch (_e) {
    console.error('[alertas GET]', _e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas' });
  }
});

// ── GET /api/alertas/pendientes ───────────────────────────────────
router.get('/pendientes', async (req, res) => {
  const uid = req.usuario.id;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const [rows] = await db.query(`
      SELECT
        a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.id_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy
      FROM alertas a
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE
        a.activa = 1
        AND a.completada = 0
        AND a.fecha_vence >= CURDATE()
        AND DATEDIFF(a.fecha_vence, CURDATE()) <= 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (ad.descartada_hoy IS NULL OR ad.descartada_hoy != ?)
        AND (
          a.id_creador = ?
          OR EXISTS (
            SELECT 1 FROM alerta_destinatarios adx
            WHERE adx.id_alerta = a.id AND adx.id_usuario = ?
          )
        )
      ORDER BY a.fecha_vence ASC
    `, [uid, hoy, uid, uid]);

    const data = rows.map(r => ({
      ...r,
      dias_restantes: diasRestantes(r.fecha_vence),
    }));

    res.json({ ok: true, data });
  } catch (_e) {
    console.error('[alertas pendientes]', _e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas pendientes' });
  }
});

// ── GET /api/alertas/usuarios ─────────────────────────────────────
router.get('/usuarios', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, area FROM usuarios WHERE activo = 1 ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

// ── POST /api/alertas ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const uid = req.usuario.id;
  const { titulo, descripcion, tipo, fecha_vence, destinatarios = [] } = req.body;

  if (!titulo || !fecha_vence) {
    return res.status(400).json({ ok: false, error: 'Título y fecha de vencimiento son obligatorios' });
  }
  if (!['personal', 'grupal'].includes(tipo)) {
    return res.status(400).json({ ok: false, error: 'Tipo inválido' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO alertas (titulo, descripcion, tipo, fecha_vence, id_creador)
       VALUES (?, ?, ?, ?, ?)`,
      [titulo, descripcion || null, tipo, fecha_vence, uid]
    );
    const idAlerta = ins.insertId;

    const destSet = new Set([uid, ...destinatarios.map(Number)]);
    for (const did of destSet) {
      await conn.query(
        `INSERT IGNORE INTO alerta_destinatarios (id_alerta, id_usuario) VALUES (?, ?)`,
        [idAlerta, did]
      );
    }

    await conn.commit();
    res.json({ ok: true, id: idAlerta });
  } catch (_e) {
    await conn.rollback();
    console.error('[alertas POST]', _e);
    res.status(500).json({ ok: false, error: 'Error al crear alerta' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/alertas/:id ──────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  const { titulo, descripcion, tipo, fecha_vence, destinatarios = [] } = req.body;

  const conn = await db.getConnection();
  try {
    const [[alerta]] = await conn.query(
      `SELECT id_creador FROM alertas WHERE id = ?`, [id]
    );
    if (!alerta) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    if (alerta.id_creador !== uid && !req.usuario.is_admin) {
      return res.status(403).json({ ok: false, error: 'Sin permisos para editar esta alerta' });
    }

    await conn.beginTransaction();
    await conn.query(
      `UPDATE alertas SET titulo=?, descripcion=?, tipo=?, fecha_vence=? WHERE id=?`,
      [titulo, descripcion || null, tipo, fecha_vence, id]
    );

    await conn.query(`DELETE FROM alerta_destinatarios WHERE id_alerta = ?`, [id]);
    const destSet = new Set([uid, ...destinatarios.map(Number)]);
    for (const did of destSet) {
      await conn.query(
        `INSERT IGNORE INTO alerta_destinatarios (id_alerta, id_usuario) VALUES (?, ?)`,
        [id, did]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (_e) {
    await conn.rollback();
    console.error('[alertas PUT]', _e);
    res.status(500).json({ ok: false, error: 'Error al editar alerta' });
  } finally {
    conn.release();
  }
});

// ── PATCH /api/alertas/:id/completar ─────────────────────────────
router.patch('/:id/completar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin) {
      return res.status(403).json({ ok: false, error: 'Sin permisos' });
    }
    await db.query(`UPDATE alertas SET completada=1, activa=0 WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al completar alerta' });
  }
});

// ── PATCH /api/alertas/:id/desactivar ────────────────────────────
router.patch('/:id/desactivar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin) {
      return res.status(403).json({ ok: false, error: 'Sin permisos' });
    }
    await db.query(`UPDATE alertas SET activa=0 WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al desactivar alerta' });
  }
});

// ── PATCH /api/alertas/:id/descartar ─────────────────────────────
router.patch('/:id/descartar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    await db.query(`
      INSERT INTO alerta_destinatarios (id_alerta, id_usuario, descartada_hoy)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE descartada_hoy = ?
    `, [id, uid, hoy, hoy]);
    res.json({ ok: true });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al descartar alerta' });
  }
});

// ── PATCH /api/alertas/:id/silenciar ─────────────────────────────
router.patch('/:id/silenciar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    await db.query(`
      INSERT INTO alerta_destinatarios (id_alerta, id_usuario, silenciada)
      VALUES (?, ?, 1)
      ON DUPLICATE KEY UPDATE silenciada = 1
    `, [id, uid]);
    res.json({ ok: true });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al silenciar alerta' });
  }
});

// ── DELETE /api/alertas/:id ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin) {
      return res.status(403).json({ ok: false, error: 'Sin permisos para eliminar' });
    }
    await db.query(`DELETE FROM alertas WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (_e) {
    res.status(500).json({ ok: false, error: 'Error al eliminar alerta' });
  }
});

module.exports = router;
