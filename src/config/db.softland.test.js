'use strict';

/**
 * db.softland.test.js — Test de integración Softland Cloud (SQL Server)
 *
 * ⚠️  EXCLUIDO del CI automático — requiere .env con credenciales Softland.

 *
 * Verifica:
 *   1. Conectividad básica (SELECT 1)
 *   2. Base de datos correcta

 */

const { getSoftlandPool, closeSoftlandPool } = require('./db.softland');

afterAll(async () => {
  await closeSoftlandPool();
});

// ───────────────────────────────────────────────────────────────
describe('[Softland] Conectividad básica', () => {

  test('pool conecta y responde a SELECT 1', async () => {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query('SELECT 1 AS ping');
    expect(result.recordset[0].ping).toBe(1);
  });

  test('base de datos activa coincide con SOFTLAND_DB_NAME', async () => {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query('SELECT DB_NAME() AS db');
    expect(result.recordset[0].db).toBe(process.env.SOFTLAND_DB_NAME);
  });

  test('versión de SQL Server accesible', async () => {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query('SELECT @@VERSION AS version');
    expect(typeof result.recordset[0].version).toBe('string');
    expect(result.recordset[0].version).toMatch(/Microsoft SQL Server/i);
  });

});

// ───────────────────────────────────────────────────────────────

    ).rejects.toThrow();
  });

});

// ───────────────────────────────────────────────────────────────
describe('[Softland] Tablas clave accesibles', () => {

  /**

  ];

  test.each(TABLAS_SOFTLAND)('tabla %s existe en Softland', async (tabla) => {
    const pool   = await getSoftlandPool();
    const result = await pool.request()
      .input('tabla', tabla)
      .query(`
        SELECT COUNT(*) AS existe
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = @tabla
      `);
    expect(result.recordset[0].existe).toBe(1);
  });

});
