'use strict';

/**
 * tools/db-check.js
 *
 * Script de diagnóstico rápido para validar conectividad a MySQL.
 *
 * Flujo:
 *   1) Carga variables de entorno
 *   2) Ejecuta testConnection()
 *   3) Ejecuta SELECT 1 AS ping
 *   4) Cierra el pool y termina con código de salida
 *
 * Uso recomendado:
 *   ejecutar manualmente durante puesta en marcha o troubleshooting.
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/db');

(async () => {
  try {
    console.log('Iniciando diagnóstico de conexión a BD...');
    const ok = await testConnection();
    console.log('testConnection():', ok);

    console.log('Ejecutando SELECT 1...');
    const [rows] = await pool.query('SELECT 1 AS ping');
    console.log('Resultado SELECT 1:', rows && rows[0] ? rows[0] : rows);

    await pool.end();
    console.log('Pool finalizado correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR de conexión a BD:');
    console.error(err && err.message ? err.message : err);
    if (err && err.code) console.error('Código SQL/error:', err.code);
    if (err && err.sqlMessage) console.error('sqlMessage:', err.sqlMessage);
    try { await pool.end(); } catch { /* ignorar error al cerrar pool */ }
    process.exit(2);
  }
})();
