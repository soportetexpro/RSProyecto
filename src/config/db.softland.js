'use strict';

/**
 * db.softland.js — Conexión a Softland Cloud (SQL Server)
 *
 * Tipo de conexión: SQL Server directo (réplica de lectura)
 * Driver: mssql
 * Puerto: 1433 por defecto
 *
 * Variables de entorno requeridas en .env:
 *   SOFTLAND_DB_HOST
 *   SOFTLAND_DB_PORT         (default: 1433)
 *   SOFTLAND_DB_USER
 *   SOFTLAND_DB_PASSWORD
 *   SOFTLAND_DB_NAME
 *   SOFTLAND_DB_ENCRYPT      (default: false — true en Azure/producción)
 *   SOFTLAND_DB_TRUST_CERT   (default: false — true solo en dev con cert autofirmado)
 */

const sql  = require('mssql');
require('dotenv').config();

const config = {
  server:   process.env.SOFTLAND_DB_HOST,
  port:     Number(process.env.SOFTLAND_DB_PORT || 1433),
  user:     process.env.SOFTLAND_DB_USER,
  password: process.env.SOFTLAND_DB_PASSWORD,
  database: process.env.SOFTLAND_DB_NAME,
  options: {
    encrypt:                process.env.SOFTLAND_DB_ENCRYPT      === 'true',
    trustServerCertificate: process.env.SOFTLAND_DB_TRUST_CERT   === 'true',
    connectTimeout:         15000,
    requestTimeout:         30000
  },
  pool: {
    idleTimeoutMillis: 30000
  }
};

let _pool = null;

async function getSoftlandPool() {
  if (_pool && _pool.connected) return _pool;
  _pool = await sql.connect(config);
  return _pool;
}

async function closeSoftlandPool() {
  if (_pool) {
    await _pool.close();
    _pool = null;
  }
}

module.exports = { getSoftlandPool, closeSoftlandPool, sql };
