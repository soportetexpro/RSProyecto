/**
 * @jest-environment node
 *
 * Test de integración: verifica conectividad real con la base de datos MySQL.
 * Requiere que las variables DB_* en .env apunten a un servidor accesible.
 */

'use strict';

const pool = require('./db');

afterAll(async () => {
  await pool.end();
});

describe('Conexión a la base de datos', () => {
  test('el pool responde a un ping (SELECT 1)', async () => {
    const [rows] = await pool.query('SELECT 1 AS ping');
    expect(rows[0].ping).toBe(1);
  });

  test('la base de datos configurada existe y es accesible', async () => {
    const [rows] = await pool.query('SELECT DATABASE() AS db');
    expect(rows[0].db).toBe(process.env.DB_NAME);
  });
});
