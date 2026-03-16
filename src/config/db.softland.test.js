'use strict';

/**
 * db.softland.test.js — Test de integración Softland Cloud (SQL Server)
 *
 * ⚠️  EXCLUIDO del CI automático — requiere .env con credenciales Softland.
 *     Ejecutar manualmente: npm run test:softland
 *
 * Verifica:
 *   1. Conectividad básica (SELECT 1)
 *   2. Base de datos correcta
 *   3. Versión SQL Server
 *   4. Solo lectura (INSERT debe fallar)
 *   5. Tablas clave accesibles
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
describe('[Softland] Solo lectura', () => {

  test('INSERT falla — confirma permisos de solo lectura', async () => {
    const pool = await getSoftlandPool();
    await expect(
      pool.request().query(`INSERT INTO _test_rsproyecto_permisos (col) VALUES ('test')`)
    ).rejects.toThrow();
  });

});

// ───────────────────────────────────────────────────────────────
describe('[Softland] Tablas clave accesibles', () => {

  /**
   * Nombres típicos Softland ERP Chile — confirmar con DBA antes de ejecutar.
   */
  const TABLAS_SOFTLAND = [
    'gxBodegaDocCab',
    'gxBodegaDocDet',
    'gxClientesMaestro',
    'gxProductosMaestro',
    'gxVentasDocCab',
    'gxVentasDocDet'
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
