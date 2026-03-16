'use strict';

/**
 * db.test.js — Test de integración MySQL (bdtexpro)
 *
 * ⚠️  EXCLUIDO del CI automático — requiere BD activa y .env configurado.

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


    const [rows] = await pool.query('SELECT VERSION() AS version');
    expect(typeof rows[0].version).toBe('string');
    expect(rows[0].version.length).toBeGreaterThan(0);
  });

});

// ───────────────────────────────────────────────────────────────
describe('[MySQL] Tablas requeridas', () => {


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

      expect(cols).toContain(col);
    });
  });


    ['id', 'cod_vendedor', 'tipo', 'usuario_id'].forEach(col => {
      expect(cols).toContain(col);
    });
  });


    ['id', 'fecha', 'meta', 'usuario_id'].forEach(col => {
      expect(cols).toContain(col);
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


    );
    expect(rows[0].total).toBeGreaterThanOrEqual(1);
  });


      LEFT JOIN ventas_usuario u ON v.usuario_id = u.id
      WHERE u.id IS NULL
    `);
    expect(rows[0].huerfanos).toBe(0);
  });


});
