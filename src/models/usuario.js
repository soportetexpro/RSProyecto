'use strict';

/**
 * usuario.js — Modelo principal
 * Mapea ventas_usuario y sus tablas relacionadas:
 *   - usuario_vendedor
 *   - usuario_permiso
 *   - vendedor_meta
 *   - factura_compartida
 *   - tasas_descuentos (auxiliar)
 */

const { pool } = require('../config/db');

// ─────────────────────────────────────────────────────────────────
// ventas_usuario
// ─────────────────────────────────────────────────────────────────

async function findByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT id, password, last_login, nombre, email, area,
            codigo, tema, is_active, is_admin, fecha_creacion
     FROM ventas_usuario
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, password, last_login, nombre, email, area,
            codigo, tema, is_active, is_admin, fecha_creacion
     FROM ventas_usuario
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function updateLastLogin(usuarioId) {
  const [result] = await pool.execute(
    'UPDATE ventas_usuario SET last_login = NOW(6) WHERE id = ?',
    [usuarioId]
  );
  return result.affectedRows > 0;
}

// ─────────────────────────────────────────────────────────────────
// usuario_vendedor  (tipo: P = Principal, C = Compartido)
// ─────────────────────────────────────────────────────────────────

async function getVendedoresByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, cod_vendedor, tipo, usuario_id
     FROM usuario_vendedor
     WHERE usuario_id = ?
     ORDER BY tipo DESC, cod_vendedor ASC`,
    [usuarioId]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// usuario_permiso
// ─────────────────────────────────────────────────────────────────

async function getPermisosByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, permiso, usuario_id
     FROM usuario_permiso
     WHERE usuario_id = ?
     ORDER BY permiso ASC`,
    [usuarioId]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// vendedor_meta
// ─────────────────────────────────────────────────────────────────

async function getMetasByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, fecha, meta, usuario_id
     FROM vendedor_meta
     WHERE usuario_id = ?
     ORDER BY fecha DESC`,
    [usuarioId]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// factura_compartida
// NOTA: usuario_id puede ser NULL en registros actuales del dump.
// La consulta por cod_vendedor se maneja desde el módulo Ventas.
// ─────────────────────────────────────────────────────────────────

async function getFacturasCompartidasByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, folio, anio, mes, fecha, cliente,
            monto_neto, monto_asignado, porcentaje, rol,
            cod_vendedor_principal, cod_vendedor_compartido,
            nombre_vendedor_compartido, fecha_registro, usuario_id
     FROM factura_compartida
     WHERE usuario_id = ?
     ORDER BY fecha DESC, id DESC`,
    [usuarioId]
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// tasas_descuentos  (auxiliar — no usa usuario_id)
// ─────────────────────────────────────────────────────────────────

async function getTasasDescuentos() {
  const [rows] = await pool.execute(
    `SELECT id, anio, fecha_corte, porcentaje, orden
     FROM tasas_descuentos
     ORDER BY anio DESC`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// Carga completa del usuario para la sesión
// ─────────────────────────────────────────────────────────────────

async function getUsuarioCompletoByEmail(email) {
  const usuario = await findByEmail(email);
  if (!usuario) return null;

  const [vendedores, permisos, metas, facturasCompartidas] = await Promise.all([
    getVendedoresByUsuarioId(usuario.id),
    getPermisosByUsuarioId(usuario.id),
    getMetasByUsuarioId(usuario.id),
    getFacturasCompartidasByUsuarioId(usuario.id)
  ]);

  return { ...usuario, vendedores, permisos, metas, facturasCompartidas };
}

module.exports = {
  findByEmail,
  findById,
  updateLastLogin,
  getVendedoresByUsuarioId,
  getPermisosByUsuarioId,
  getMetasByUsuarioId,
  getFacturasCompartidasByUsuarioId,
  getTasasDescuentos,
  getUsuarioCompletoByEmail
};
