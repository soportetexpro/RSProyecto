'use strict';

const { pool } = require('../config/db');
const { hashPasswordDjango } = require('../utils/pbkdf2Django');


async function findByEmail(email) {
  const [rows] = await pool.execute(
    'SELECT * FROM usuarios WHERE email = ? LIMIT 1',
    [email]
  );
  return rows[0] ?? null;
}

async function findById(id) {
  const [rows] = await pool.execute(
    'SELECT id, nombre, email, area, codigo, tema, is_active, is_admin, last_login, fecha_creacion FROM usuarios WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ?? null;
}

async function updateLastLogin(id) {
  const [result] = await pool.execute(
    'UPDATE usuarios SET last_login = NOW() WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

async function updatePassword(email, nuevaPassword) {
  const hash = hashPasswordDjango(nuevaPassword);
  const [result] = await pool.execute(
    'UPDATE usuarios SET password = ? WHERE email = ? AND is_active = 1',
    [hash, email]
  );
  return result.affectedRows > 0;
}

async function getVendedoresByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    'SELECT * FROM usuario_vendedores WHERE usuario_id = ?',
    [usuarioId]
  );
  return rows;
}

async function getPermisosByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    'SELECT * FROM usuario_permisos WHERE usuario_id = ?',
    [usuarioId]
  );
  return rows;
}

async function getMetasByUsuarioId(usuarioId) {
  const [rows] = await pool.execute(
    'SELECT * FROM usuario_metas WHERE usuario_id = ? ORDER BY fecha DESC',
    [usuarioId]
  );
  return rows;
}

async function getTasasDescuentos() {
  const [rows] = await pool.execute(
    'SELECT * FROM tasas_descuentos ORDER BY anio DESC, orden ASC'
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
