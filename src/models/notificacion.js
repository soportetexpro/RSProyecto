'use strict';

/**
 * models/notificacion.js
 * CRUD básico sobre la tabla `notificaciones` (MySQL/bdtexpro)
 */

const db = require('../config/db');

// ── Mensajes motivacionales ──────────────────────────────────────────
const MENSAJES_META = [
  '¡Lo lograste! Alcanzaste tu meta del mes. ¡Sigue así, eres increíble! 🎯',
  '¡Meta cumplida! Tu esfuerzo y dedicación dieron frutos. ¡Felicitaciones! 🏆',
  '¡Excelente trabajo! Cruzaste la línea de meta. El equipo está orgulloso de ti. 💪',
  '¡Lo conseguiste! Mes a mes demuestras que eres un crack en ventas. ¡Enhorabuena! 🌟',
];

const MENSAJES_META_SUPERADA = [
  '¡Increíble! No solo cumpliste tu meta, ¡la superaste! Eso es hambre de éxito. 🚀',
  '¡Eres imparable! Superaste la meta del mes. ¡El cielo es el límite! ⭐',
  '¡Vendedor del mes! Rompiste la meta y pusiste el listón más alto. ¡Felicitaciones! 🎉',
  '¡Fuera de serie! Superaste tu objetivo mensual. El equipo te aplaude. 👏',
];

function mensajeAleatorio(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Crear notificación genérica ──────────────────────────────────────
async function crearNotificacion({ usuarioId, tipo, titulo, mensaje, folio = null, mes = null, anio = null }) {
  await db.pool.query(
    `INSERT INTO notificaciones
       (usuario_id, tipo, titulo, mensaje, folio, mes, anio)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [usuarioId, tipo, titulo, mensaje, folio, mes, anio]
  );
}

// ── Notificación: folio compartido al vendedor receptor ──────────────
async function notificarFolioRecibido({ usuarioIdReceptor, folio, cliente, monto, porcentaje, nombreCoordinador, mes, anio }) {
  const titulo  = `📥 Folio #${folio} asignado a ti`;
  const mensaje = `El coordinador ${nombreCoordinador} te asignó el folio #${folio} (${cliente}) ` +
                  `por $${Number(monto).toLocaleString('es-CL')} con un ${porcentaje}% de participación.`;
  await crearNotificacion({ usuarioId: usuarioIdReceptor, tipo: 'folio_recibido', titulo, mensaje, folio, mes, anio });
}

// ── Notificación: confirmación al coordinador que compartió ──────────
async function notificarFolioAsignado({ usuarioIdCoordinador, folio, cliente, nombreVendedor, porcentaje, mes, anio }) {
  const titulo  = `✅ Folio #${folio} compartido con ${nombreVendedor}`;
  const mensaje = `El folio #${folio} (${cliente}) fue asignado a ${nombreVendedor} ` +
                  `con un ${porcentaje}% de participación.`;
  await crearNotificacion({ usuarioId: usuarioIdCoordinador, tipo: 'folio_asignado', titulo, mensaje, folio, mes, anio });
}

// ── Notificación: meta cumplida (exactamente 100 %) ──────────────────
async function notificarMetaCumplida({ usuarioId, mes, anio }) {
  // Verificar que no se haya enviado antes este mes
  const [existing] = await db.pool.query(
    `SELECT id FROM notificaciones
     WHERE usuario_id = ? AND tipo = 'meta_cumplida' AND mes = ? AND anio = ?
     LIMIT 1`,
    [usuarioId, mes, anio]
  );
  if (existing.length) return; // ya se notificó

  const titulo  = '🎯 ¡Meta del mes cumplida!';
  const mensaje = mensajeAleatorio(MENSAJES_META);
  await crearNotificacion({ usuarioId, tipo: 'meta_cumplida', titulo, mensaje, mes, anio });
}

// ── Notificación: meta superada (> 100 %) ────────────────────────────
async function notificarMetaSuperada({ usuarioId, mes, anio, progreso }) {
  // Verificar que no se haya enviado antes este mes
  const [existing] = await db.pool.query(
    `SELECT id FROM notificaciones
     WHERE usuario_id = ? AND tipo = 'meta_superada' AND mes = ? AND anio = ?
     LIMIT 1`,
    [usuarioId, mes, anio]
  );
  if (existing.length) return; // ya se notificó

  const titulo  = `🚀 ¡Superaste tu meta con un ${progreso}%!`;
  const mensaje = mensajeAleatorio(MENSAJES_META_SUPERADA);
  await crearNotificacion({ usuarioId, tipo: 'meta_superada', titulo, mensaje, mes, anio });
}

// ── Obtener notificaciones de un usuario ─────────────────────────────
async function obtenerNotificaciones(usuarioId, { soloNoLeidas = false, limit = 30 } = {}) {
  const where = soloNoLeidas ? 'AND leida = 0' : '';
  const [rows] = await db.pool.query(
    `SELECT id, tipo, titulo, mensaje, leida, folio, mes, anio, fecha_creacion
     FROM notificaciones
     WHERE usuario_id = ? ${where}
     ORDER BY fecha_creacion DESC
     LIMIT ?`,
    [usuarioId, limit]
  );
  return rows;
}

// ── Contar no leídas ─────────────────────────────────────────────────
async function contarNoLeidas(usuarioId) {
  const [[{ total }]] = await db.pool.query(
    `SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida = 0`,
    [usuarioId]
  );
  return Number(total);
}

// ── Marcar como leída ─────────────────────────────────────────────────
async function marcarLeida(id, usuarioId) {
  await db.pool.query(
    `UPDATE notificaciones SET leida = 1 WHERE id = ? AND usuario_id = ?`,
    [id, usuarioId]
  );
}

// ── Marcar todas como leídas ──────────────────────────────────────────
async function marcarTodasLeidas(usuarioId) {
  await db.pool.query(
    `UPDATE notificaciones SET leida = 1 WHERE usuario_id = ? AND leida = 0`,
    [usuarioId]
  );
}

// ── Obtener usuario_id a partir de un cod_vendedor ────────────────────
async function usuarioIdDesdeCodVendedor(codVendedor) {
  const [rows] = await db.pool.query(
    `SELECT usuario_id FROM usuario_vendedor WHERE cod_vendedor = ? LIMIT 1`,
    [codVendedor]
  );
  return rows.length ? rows[0].usuario_id : null;
}

module.exports = {
  crearNotificacion,
  notificarFolioRecibido,
  notificarFolioAsignado,
  notificarMetaCumplida,
  notificarMetaSuperada,
  obtenerNotificaciones,
  contarNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
  usuarioIdDesdeCodVendedor,
};
