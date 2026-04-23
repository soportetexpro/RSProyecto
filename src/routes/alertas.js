'use strict';
/**
 * routes/alertas.js
 * CRUD completo para el módulo de Alertas y Recordatorios.
 * v2 — Agrega: frecuencia_recordatorio, lógica de cooldown, endpoint badge global
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

/**
 * Determina si el recordatorio debe mostrarse según la frecuencia configurada.
 * Retorna true si corresponde mostrar.
 */
function debeMotrarRecordatorio(frecuencia, ultimoRecordatorio) {
  if (!ultimoRecordatorio) return true;  // nunca se mostró
  const ahora    = new Date();
  const ultimo   = new Date(ultimoRecordatorio);
  const diffMs   = ahora - ultimo;
  const diffDias = diffMs / 86400000;

  switch (frecuencia) {
    case 'diaria':    return diffDias >= 1;
    case 'semanal':   return diffDias >= 7;
    case 'quincenal': return diffDias >= 15;
    case 'manual':    return false;  // solo se muestra si el usuario lo pide
    default:          return diffDias >= 7;
  }
}

// ── GET /api/alertas ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [rows] = await db.query(`
      SELECT
        a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.frecuencia_recordatorio,
        a.id_creador, a.activa, a.completada, a.created_at,
        COALESCE(u.nombre, '') AS nombre_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        COALESCE(ad.ultimo_recordatorio, NULL) AS ultimo_recordatorio,
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
      es_propia:         r.id_creador === uid,
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
// Respeta frecuencia_recordatorio para no molestar al usuario más de lo configurado
router.get('/pendientes', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [rows] = await db.query(`
      SELECT
        a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.frecuencia_recordatorio,
        a.id_creador,
        COALESCE(u.nombre, '') AS nombre_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        COALESCE(ad.ultimo_recordatorio, NULL) AS ultimo_recordatorio
      FROM alertas a
      LEFT JOIN usuarios u ON u.id = a.id_creador
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE
        a.activa = 1
        AND a.completada = 0
        AND a.fecha_vence >= CURDATE()
        AND DATEDIFF(a.fecha_vence, CURDATE()) <= 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (
          a.id_creador = ?
          OR EXISTS (
            SELECT 1 FROM alerta_destinatarios adx
            WHERE adx.id_alerta = a.id AND adx.id_usuario = ?
          )
        )
      ORDER BY a.fecha_vence ASC
    `, [uid, uid, uid]);

    // Filtrar según frecuencia_recordatorio y ultimo_recordatorio
    const data = rows
      .filter(r => r.frecuencia_recordatorio !== 'manual')
      .filter(r => debeMotrarRecordatorio(r.frecuencia_recordatorio, r.ultimo_recordatorio))
      .map(r => ({
        ...r,
        dias_restantes: diasRestantes(r.fecha_vence),
        es_propia: r.id_creador === uid,
      }));

    res.json({ ok: true, data });
  } catch (_e) {
    console.error('[alertas pendientes]', _e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas pendientes' });
  }
});

// ── GET /api/alertas/badge ────────────────────────────────────────
// Contador global para el badge del sidebar (se llama desde cualquier página)
router.get('/badge', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM alertas a
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE
        a.activa = 1
        AND a.completada = 0
        AND a.fecha_vence >= CURDATE()
        AND DATEDIFF(a.fecha_vence, CURDATE()) <= 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (
          a.id_creador = ?
          OR EXISTS (
            SELECT 1 FROM alerta_destinatarios adx
            WHERE adx.id_alerta = a.id AND adx.id_usuario = ?
          )
        )
    `, [uid, uid, uid]);
    res.json({ ok: true, total: Number(total) });
  } catch (_e) {
    res.status(500).json({ ok: false, total: 0 });
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
  const { titulo, descripcion, tipo, fecha_vence, frecuencia_recordatorio = 'semanal', destinatarios = [] } = req.body;

  if (!titulo || !fecha_vence) {
    return res.status(400).json({ ok: false, error: 'Título y fecha de vencimiento son obligatorios' });
  }
  if (!['personal', 'grupal'].includes(tipo)) {
    return res.status(400).json({ ok: false, error: 'Tipo inválido' });
  }
  if (!['diaria', 'semanal', 'quincenal', 'manual'].includes(frecuencia_recordatorio)) {
    return res.status(400).json({ ok: false, error: 'Frecuencia inválida' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [ins] = await conn.query(
      `INSERT INTO alertas (titulo, descripcion, tipo, fecha_vence, frecuencia_recordatorio, id_creador)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, descripcion || null, tipo, fecha_vence, frecuencia_recordatorio, uid]
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
  const { titulo, descripcion, tipo, fecha_vence, frecuencia_recordatorio = 'semanal', destinatarios = [] } = req.body;

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
      `UPDATE alertas SET titulo=?, descripcion=?, tipo=?, fecha_vence=?, frecuencia_recordatorio=? WHERE id=?`,
      [titulo, descripcion || null, tipo, fecha_vence, frecuencia_recordatorio, id]
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
// Descarta el popup HOY y registra el ultimo_recordatorio para respetar la frecuencia
router.patch('/:id/descartar', async (req, res) => {
  const uid  = req.usuario.id;
  const id   = Number(req.params.id);
  const hoy  = new Date().toISOString().slice(0, 10);
  const ahora = new Date().toISOString().slice(0, 19).replace('T', ' ');
  try {
    await db.query(`
      INSERT INTO alerta_destinatarios (id_alerta, id_usuario, descartada_hoy, ultimo_recordatorio)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE descartada_hoy = ?, ultimo_recordatorio = ?
    `, [id, uid, hoy, ahora, hoy, ahora]);
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
