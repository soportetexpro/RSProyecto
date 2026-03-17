'use strict';

/**
 * usuario.js — Modelo de la tabla `usuario`
 *
 * LOGIN: solo findByEmail + updateLastLogin (email + password)
 * Las relaciones (vendedores, metas, permisos, facturas) se cargan
 * en cada módulo que las necesite, no en el login.
 *
 * Tablas:
 *   usuario           — usuarios del sistema (autenticación)
 *   usuario_vendedor  — códigos de vendedor por usuario
 *   usuario_permiso   — permisos adicionales
 *   vendedor_meta     — metas anuales
 *   tasas_descuentos  — tasas de descuento (auxiliar)
 */

const { pool } = require('../config/db');

// ───────────────────────────────────────────────────────────────
// Tabla: usuario
// ───────────────────────────────────────────────────────────────

/**
 * Busca un usuario por email (incluye password para verificación).
 * Solo para uso interno del login — nunca exponer en respuesta HTTP.
 */
async function findByEmail(email) {
  const [rows] = await pool.execute(
    `SELECT id, password, last_login, nombre, email, area,
            codigo, tema, is_active, is_admin, fecha_creacion
     FROM usuario
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

/**
 * Busca un usuario por ID (sin password).
 * Usado en GET /api/auth/me para refrescar datos de sesión.
 */
async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, last_login, nombre, email, area,
            codigo, tema, is_active, is_admin, fecha_creacion
     FROM usuario
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Actualiza el campo last_login al momento del login exitoso.
 */
async function updateLastLogin(usuarioId) {
  const [result] = await pool.execute(
    'UPDATE usuario SET last_login = NOW(6) WHERE id = ?',
    [usuarioId]
  );
  return result.affectedRows > 0;
}

// ───────────────────────────────────────────────────────────────
// Relaciones — disponibles para módulos, NO usadas en login
// ───────────────────────────────────────────────────────────────

/** Retorna los códigos de vendedor de un usuario (tipo P=Principal, C=Compartido) */
async function getVendedoresByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, cod_vendedor, tipo
     FROM usuario_vendedor
     WHERE usuario_id = ?
     ORDER BY tipo DESC, cod_vendedor ASC`,
    [usuarioId]
  );
  return rows;
}

/** Retorna los permisos adicionales de un usuario */
async function getPermisosByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, permiso
     FROM usuario_permiso
     WHERE usuario_id = ?
     ORDER BY permiso ASC`,
    [usuarioId]
  );
  return rows;
}

/** Retorna las metas anuales de un usuario, ordenadas de más reciente a más antigua */
async function getMetasByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    `SELECT id, fecha, meta
     FROM vendedor_meta
     WHERE usuario_id = ?
     ORDER BY fecha DESC`,
    [usuarioId]
  );
  return rows;
}

/** Retorna todas las tasas de descuento (auxiliar, sin filtro por usuario) */
async function getTasasDescuentos() {
  const [rows] = await pool.execute(
    `SELECT id, anio, fecha_corte, porcentaje, orden
     FROM tasas_descuentos
     ORDER BY anio DESC`
  );
  return rows;
}

module.exports = {
  findByEmail,
  findById,
  updateLastLogin,
  getVendedoresByUsuarioId,
  getPermisosByUsuarioId,
  getMetasByUsuarioId,
  getTasasDescuentos
};
