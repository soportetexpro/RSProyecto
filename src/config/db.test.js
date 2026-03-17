'use strict';

// db.test.js - Test de integracion MySQL (bdtexpro)
// EXCLUIDO del CI automatico - requiere BD activa y .env configurado.
// Ejecutar manualmente: npm run test:mysql

const { pool } = require('./db');

afterAll(async () => {
  await pool.end();
});

// ------------------------------------------------------------------
describe('[MySQL] Conectividad basica', () => {

  test('pool responde a SELECT 1 (ping)', async () => {
    const [rows] = await pool.query('SELECT 1 AS ping');
    expect(rows[0].ping).toBe(1);
  });

  test('base de datos activa es bdtexpro', async () => {
    const [rows] = await pool.query('SELECT DATABASE() AS db');
    expect(rows[0].db).toBe(process.env.DB_NAME);
  });

  test('version de MySQL accesible', async () => {
    const [rows] = await pool.query('SELECT VERSION() AS version');
    expect(typeof rows[0].version).toBe('string');
    expect(rows[0].version.length).toBeGreaterThan(0);
  });

});

// ------------------------------------------------------------------
describe('[MySQL] Tablas requeridas', () => {

  const TABLAS_REQUERIDAS = [
    'usuario',           // renombrada desde ventas_usuario
    'usuario_vendedor',
    'usuario_permiso',
    'vendedor_meta',
    'factura_compartida',
    'tasas_descuentos'
  ];

  test.each(TABLAS_REQUERIDAS)('tabla %s existe en bdtexpro', async (tabla) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS existe
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [process.env.DB_NAME, tabla]
    );
    expect(rows[0].existe).toBe(1);
  });

});

// ------------------------------------------------------------------
describe('[MySQL] Estructura de tablas criticas', () => {

  async function getColumnas(tabla) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ORDINAL_POSITION`,
      [process.env.DB_NAME, tabla]
    );
    return rows.map(r => r.COLUMN_NAME);
  }

  test('usuario tiene columnas requeridas', async () => {
    const cols = await getColumnas('usuario');
    ['id', 'nombre', 'email', 'password', 'area', 'codigo', 'is_active', 'is_admin'].forEach(col => {
      expect(cols).toContain(col);
    });
  });

  test('usuario_vendedor tiene columnas requeridas', async () => {
    const cols = await getColumnas('usuario_vendedor');
    ['id', 'cod_vendedor', 'tipo', 'usuario_id'].forEach(col => {
      expect(cols).toContain(col);
    });
  });

  test('vendedor_meta tiene columnas requeridas', async () => {
    const cols = await getColumnas('vendedor_meta');
    ['id', 'fecha', 'meta', 'usuario_id'].forEach(col => {
      expect(cols).toContain(col);
    });
  });

});

// ------------------------------------------------------------------
describe('[MySQL] Datos iniciales', () => {

  test('existe al menos 1 usuario activo en usuario', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuario WHERE is_active = 1'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('existe al menos 1 registro en usuario_vendedor', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuario_vendedor'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('no hay vendedores huerfanos en usuario_vendedor', async () => {
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS huerfanos
      FROM usuario_vendedor v
      LEFT JOIN usuario u ON v.usuario_id = u.id
      WHERE u.id IS NULL
    `);
    expect(rows[0].huerfanos).toBe(0);
  });

});
