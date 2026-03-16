'use strict';

// db.softland.test.js - Test de integracion Softland Cloud (SQL Server)
// EXCLUIDO del CI automatico - requiere .env con credenciales Softland.
// Ejecutar manualmente: npm run test:softland

const { getSoftlandPool, closeSoftlandPool } = require('./db.softland');

afterAll(async () => {
  await closeSoftlandPool();
});

// ------------------------------------------------------------------
describe('[Softland] Conectividad basica', () => {

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

  test('version de SQL Server accesible', async () => {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query('SELECT @@VERSION AS version');
    expect(typeof result.recordset[0].version).toBe('string');
    expect(result.recordset[0].version).toMatch(/Microsoft SQL Server/i);
  });

});

// ------------------------------------------------------------------
describe('[Softland] Solo lectura', () => {

  test('intento de INSERT lanza error (solo lectura)', async () => {
    const pool = await getSoftlandPool();
    await expect(
      pool.request().query('INSERT INTO _test_no_existe (x) VALUES (1)')
    ).rejects.toThrow();
  });

});

// ------------------------------------------------------------------
describe('[Softland] Tablas clave accesibles', () => {

  const TABLAS_SOFTLAND = [
    'GEN_Empresa',
    'VEN_Documento',
    'VEN_DocumentoDetalle',
    'CLI_Cliente'
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
