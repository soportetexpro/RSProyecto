'use strict';
/**
 * routes/alertas.js
 * CRUD completo para el mÃ³dulo de Alertas y Recordatorios.
 * Incluye: frecuencia_recordatorio, cooldown en /pendientes, contador para sidebar.
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
 * Determina si hay que mostrar el recordatorio segÃºn frecuencia.
 * @param {string|null} ultimoRec  â€” fecha ISO 'YYYY-MM-DD' o null
 * @param {string} frecuencia      â€” 'siempre'|'diaria'|'semanal'|'quincenal'
 * @returns {boolean}
 */
function debeRecordar(ultimoRec, frecuencia) {
  if (!ultimoRec || frecuencia === 'siempre') return true;
  const hoy     = new Date(); hoy.setHours(0, 0, 0, 0);
  const ultimo  = new Date(ultimoRec); ultimo.setHours(0, 0, 0, 0);
  const diffDias = Math.floor((hoy - ultimo) / 86400000);
  if (frecuencia === 'diaria')    return diffDias >= 1;
  if (frecuencia === 'semanal')   return diffDias >= 7;
  if (frecuencia === 'quincenal') return diffDias >= 15;
  return true;
}

// â”€â”€ GET /api/alertas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  } catch (e) {
    console.error('[alertas GET]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas' });
  }
});

// â”€â”€ GET /api/alertas/contador â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/contador', async (req, res) => {
  const uid = req.usuario.id;
  try {
    const [[{ total }]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM alertas a
      LEFT JOIN alerta_destinatarios ad ON ad.id_alerta = a.id AND ad.id_usuario = ?
      WHERE
        a.activa = 1
        AND a.completada = 0
        AND DATEDIFF(a.fecha_vence, CURDATE()) BETWEEN 0 AND 7
        AND COALESCE(ad.silenciada, 0) = 0
        AND (
          a.id_creador = ?
          OR EXISTS (
            SELECT 1 FROM alerta_destinatarios adx
            WHERE adx.id_alerta = a.id AND adx.id_usuario = ?
          )
        )
    `, [uid, uid, uid]);
    res.json({ ok: true, total });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al obtener contador' });
  }
});

// â”€â”€ GET /api/alertas/pendientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/pendientes', async (req, res) => {
  const uid = req.usuario.id;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    const [rows] = await db.query(`
      SELECT
        a.id, a.titulo, a.descripcion, a.tipo, a.fecha_vence,
        a.frecuencia_recordatorio,
        a.id_creador,
        COALESCE(ad.silenciada, 0) AS silenciada,
        COALESCE(ad.descartada_hoy, NULL) AS descartada_hoy,
        COALESCE(ad.ultimo_recordatorio, NULL) AS ultimo_recordatorio
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

    // Filtrar por frecuencia_recordatorio usando lÃ³gica JS
    const data = rows
      .filter(r => debeRecordar(r.ultimo_recordatorio, r.frecuencia_recordatorio))
      .map(r => ({
        ...r,
        dias_restantes: diasRestantes(r.fecha_vence),
      }));

    res.json({ ok: true, data });
  } catch (e) {
    console.error('[alertas pendientes]', e);
    res.status(500).json({ ok: false, error: 'Error al obtener alertas pendientes' });
  }
});

// â”€â”€ GET /api/alertas/usuarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/usuarios', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, area FROM usuarios WHERE activo = 1 ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: rows });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
  }
});

// â”€â”€ POST /api/alertas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/', async (req, res) => {
  const uid = req.usuario.id;
  const {
    titulo, descripcion, tipo, fecha_vence,
    frecuencia_recordatorio = 'siempre',
    destinatarios = []
  } = req.body;

  if (!titulo || !fecha_vence)
    return res.status(400).json({ ok: false, error: 'TÃ­tulo y fecha de vencimiento son obligatorios' });
  if (!['personal', 'grupal'].includes(tipo))
    return res.status(400).json({ ok: false, error: 'Tipo invÃ¡lido' });
  if (!['siempre','diaria','semanal','quincenal'].includes(frecuencia_recordatorio))
    return res.status(400).json({ ok: false, error: 'Frecuencia invÃ¡lida' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO alertas (titulo, descripcion, tipo, fecha_vence, frecuencia_recordatorio, id_creador)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, descripcion || null, tipo, fecha_vence, frecuencia_recordatorio, uid]
    );
    const idAlerta = ins.insertId;
    const destSet  = new Set([uid, ...destinatarios.map(Number)]);
    for (const did of destSet) {
      await conn.query(
        `INSERT IGNORE INTO alerta_destinatarios (id_alerta, id_usuario) VALUES (?, ?)`,
        [idAlerta, did]
      );
    }
    await conn.commit();
    res.json({ ok: true, id: idAlerta });
  } catch (e) {
    await conn.rollback();
    console.error('[alertas POST]', e);
    res.status(500).json({ ok: false, error: 'Error al crear alerta' });
  } finally {
    conn.release();
  }
});

// â”€â”€ PUT /api/alertas/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.put('/:id', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  const {
    titulo, descripcion, tipo, fecha_vence,
    frecuencia_recordatorio = 'siempre',
    destinatarios = []
  } = req.body;

  const conn = await db.getConnection();
  try {
    const [[alerta]] = await conn.query(
      `SELECT id_creador FROM alertas WHERE id = ?`, [id]
    );
    if (!alerta)
      return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    if (alerta.id_creador !== uid && !req.usuario.is_admin)
      return res.status(403).json({ ok: false, error: 'Sin permisos para editar esta alerta' });

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
  } catch (e) {
    await conn.rollback();
    console.error('[alertas PUT]', e);
    res.status(500).json({ ok: false, error: 'Error al editar alerta' });
  } finally {
    conn.release();
  }
});

// â”€â”€ PATCH /api/alertas/:id/completar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/:id/completar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin)
      return res.status(403).json({ ok: false, error: 'Sin permisos' });
    await db.query(`UPDATE alertas SET completada=1, activa=0 WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al completar alerta' });
  }
});

// â”€â”€ PATCH /api/alertas/:id/desactivar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/:id/desactivar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin)
      return res.status(403).json({ ok: false, error: 'Sin permisos' });
    await db.query(`UPDATE alertas SET activa=0 WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al desactivar alerta' });
  }
});

// â”€â”€ PATCH /api/alertas/:id/descartar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.patch('/:id/descartar', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    await db.query(`
      INSERT INTO alerta_destinatarios (id_alerta, id_usuario, descartada_hoy, ultimo_recordatorio)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        descartada_hoy      = VALUES(descartada_hoy),
        ultimo_recordatorio = VALUES(ultimo_recordatorio)
    `, [id, uid, hoy, hoy]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al descartar alerta' });
  }
});

// â”€â”€ PATCH /api/alertas/:id/silenciar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  } catch {
    res.status(500).json({ ok: false, error: 'Error al silenciar alerta' });
  }
});

// â”€â”€ DELETE /api/alertas/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.delete('/:id', async (req, res) => {
  const uid = req.usuario.id;
  const id  = Number(req.params.id);
  try {
    const [[a]] = await db.query(`SELECT id_creador FROM alertas WHERE id=?`, [id]);
    if (!a) return res.status(404).json({ ok: false, error: 'No encontrada' });
    if (a.id_creador !== uid && !req.usuario.is_admin)
      return res.status(403).json({ ok: false, error: 'Sin permisos para eliminar' });
    await db.query(`DELETE FROM alertas WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, error: 'Error al eliminar alerta' });
  }
});

module.exports = router;
