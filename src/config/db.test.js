'use strict';

/**
 * db.test.js — Test de integración MySQL (bdtexpro)
 *
 * ⚠️  EXCLUIDO del CI automático — requiere BD activa y .env configurado.
 *     Ejecutar manualmente: npm run test:mysql
 *
 * Esquema fuente de verdad: database/bdtexpro.sql
 *
 * Tablas reales de bdtexpro:
 *   - ventas_usuario       (usuarios del sistema)
 *   - usuario_vendedor     (códigos vendedor por usuario)
 *   - vendedor_meta        (metas anuales por usuario)
 *   - usuario_permiso      (permisos adicionales)
 *   - factura_compartida   (facturas compartidas entre vendedores)
 *   - tasas_descuentos     (tasas de descuento por año)
 */

const { pool } = require('./db');

afterAll(async () => {
  await pool.end();
});

// ───────────────────────────────────────────────────────────────
describe('[MySQL] Conectividad básica', () => {

  test('pool responde a SELECT 1 (ping)', async () => {
    const [rows] = await pool.query('SELECT 1 AS ping');
    expect(rows[0].ping).toBe(1);
  });

  test('base de datos activa es bdtexpro', async () => {
    const [rows] = await pool.query('SELECT DATABASE() AS db');
    expect(rows[0].db).toBe(process.env.DB_NAME);
  });

  test('versión de MariaDB/MySQL accesible', async () => {
    const [rows] = await pool.query('SELECT VERSION() AS version');
    expect(typeof rows[0].version).toBe('string');
    expect(rows[0].version.length).toBeGreaterThan(0);
  });

});

// ───────────────────────────────────────────────────────────────
describe('[MySQL] Tablas requeridas', () => {

  // Nombres reales según database/bdtexpro.sql
  const TABLAS_REQUERIDAS = [
    'ventas_usuario',
    'usuario_vendedor',
    'vendedor_meta',
    'usuario_permiso',
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

// ───────────────────────────────────────────────────────────────
describe('[MySQL] Estructura de tablas críticas', () => {

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

  test('ventas_usuario tiene columnas requeridas', async () => {
    const cols = await getColumnas('ventas_usuario');
    ['id', 'email', 'password', 'nombre', 'area', 'codigo', 'tema', 'is_active', 'is_admin', 'fecha_creacion'].forEach(col => {
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

  test('factura_compartida tiene columnas requeridas', async () => {
    const cols = await getColumnas('factura_compartida');
    ['id', 'folio', 'anio', 'mes', 'fecha', 'cliente', 'monto_neto', 'monto_asignado', 'porcentaje', 'rol',
     'cod_vendedor_principal', 'cod_vendedor_compartido', 'nombre_vendedor_compartido', 'fecha_registro', 'usuario_id'
    ].forEach(col => {
      expect(cols).toContain(col);
    });
  });

  test('tasas_descuentos tiene columnas requeridas', async () => {
    const cols = await getColumnas('tasas_descuentos');
    ['id', 'anio', 'fecha_corte', 'porcentaje', 'orden'].forEach(col => {
      expect(cols).toContain(col);
    });
  });

});

// ───────────────────────────────────────────────────────────────
describe('[MySQL] Datos iniciales', () => {

  test('existe al menos 1 usuario activo en ventas_usuario', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM ventas_usuario WHERE is_active = 1'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('existe al menos 1 registro en usuario_vendedor', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuario_vendedor'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('existe al menos 1 meta en vendedor_meta', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM vendedor_meta'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('existe al menos 1 tasa en tasas_descuentos', async () => {
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS total FROM tasas_descuentos'
    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });

  test('FK usuario_id en usuario_vendedor sin huérfanos', async () => {
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS huerfanos
      FROM usuario_vendedor v
      LEFT JOIN ventas_usuario u ON v.usuario_id = u.id
      WHERE u.id IS NULL
    `);
    expect(rows[0].huerfanos).toBe(0);
  });

  test('FK usuario_id en vendedor_meta sin huérfanos', async () => {
    const [rows] = await pool.query(`
      SELECT COUNT(*) AS huerfanos
      FROM vendedor_meta m
      LEFT JOIN ventas_usuario u ON m.usuario_id = u.id
      WHERE u.id IS NULL
    `);
    expect(rows[0].huerfanos).toBe(0);
  });

});
