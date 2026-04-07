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
 *   SOFTLAND_DB_ENCRYPT      (default: true — cifrado obligatorio)
 *   SOFTLAND_DB_TRUST_SERVER_CERT  (default: FALSE — solo true en dev con cert autofirmado)
 *
 * SEGURIDAD:
 *   - En producción SOFTLAND_DB_TRUST_SERVER_CERT debe ser false (valor por defecto).
 *     Dejarlo en true permite ataques MITM contra la réplica Softland.
 *   - En desarrollo local con certificado autofirmado puede ponerse true.
 */

const sql  = require('mssql');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const config = {
  server:   process.env.SOFTLAND_DB_HOST,
  port:     Number(process.env.SOFTLAND_DB_PORT || 1433),
  user:     process.env.SOFTLAND_DB_USER,
  password: process.env.SOFTLAND_DB_PASSWORD,
  database: process.env.SOFTLAND_DB_NAME,
  options: {
    // encrypt: siempre true salvo override explícito en .env
    encrypt: (typeof process.env.SOFTLAND_DB_ENCRYPT !== 'undefined')
      ? process.env.SOFTLAND_DB_ENCRYPT === 'true'
      : true,

    // trustServerCertificate:
    //   - Producción → FALSE por defecto (seguro, previene MITM)
    //   - Desarrollo  → puede ser true si el servidor usa cert autofirmado
    //   Override con SOFTLAND_DB_TRUST_SERVER_CERT=true solo en dev.
    trustServerCertificate: (function () {
      // Prioridad: SOFTLAND_DB_TRUST_SERVER_CERT > SOFTLAND_DB_TRUST_CERT > default
      const envVal =
        process.env.SOFTLAND_DB_TRUST_SERVER_CERT ??
        process.env.SOFTLAND_DB_TRUST_CERT;

      if (typeof envVal !== 'undefined') {
        return envVal === 'true';
      }

      // Default seguro: false en producción, true en desarrollo
      return !isProd;
    })(),

    connectTimeout: 15000,
    requestTimeout: 30000,
  },
  pool: {
    idleTimeoutMillis: 30000,
  },
};

let _pool = null;

/**
 * Retorna el pool activo. Si no existe o la conexión cayó, crea uno nuevo.
 * Implementa reconexión básica ante caídas de Softland.
 */
async function getSoftlandPool() {
  if (_pool && _pool.connected) return _pool;

  // Si el pool existe pero no está conectado, cerrarlo limpiamente antes de reconectar
  if (_pool) {
    try { await _pool.close(); } catch { /* ignorar error al cerrar pool roto */ }
    _pool = null;
  }

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
