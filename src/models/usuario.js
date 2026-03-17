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

const crypto   = require('crypto');
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

/**
 * Genera un hash PBKDF2-SHA256 en formato Django y actualiza la
 * contraseña del usuario en la tabla `usuario`.
 *
 * Formato: pbkdf2_sha256$<iter>$<salt>$<hash_b64>
 * Iteraciones: 600000 (mismo que Django 4.x)
 *
 * @param {string} email      — email del usuario
 * @param {string} nuevaPass  — contraseña en texto plano
 * @returns {Promise<boolean>} true si se actualizó, false si no existe
 */
async function updatePassword(email, nuevaPass) {
  const ITERATIONS = 600000;
  const KEYLEN     = 32;
  const DIGEST     = 'sha256';
  const salt       = crypto.randomBytes(12).toString('base64url').slice(0, 22);

  const derived = crypto.pbkdf2Sync(
    Buffer.from(nuevaPass, 'utf8'),
    Buffer.from(salt, 'utf8'),
    ITERATIONS,
    KEYLEN,
    DIGEST
  ).toString('base64');

  const hash = `pbkdf2_sha256$${ITERATIONS}$${salt}$${derived}`;

  const [result] = await pool.execute(
    'UPDATE usuario SET password = ? WHERE email = ? AND is_active = 1',
    [hash, email]
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
  updatePassword,
  getVendedoresByUsuarioId,
  getPermisosByUsuarioId,
  getMetasByUsuarioId,
  getTasasDescuentos
};
