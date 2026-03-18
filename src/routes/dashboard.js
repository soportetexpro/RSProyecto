'use strict';

/**
 * routes/dashboard.js
 * Endpoints para el dashboard principal
 * GET /api/dashboard/resumen  — 4 KPIs + meta del mes
 * GET /api/dashboard/evolucion — últimos 6 meses ventas vs meta
 * GET /api/dashboard/vendedores — ventas por cod vendedor (mes actual)
 * GET /api/dashboard/ventas-mes — folios del mes
 * GET /api/dashboard/detalle/:folio — líneas de un folio
 */

const express    = require('express');
const router     = express.Router();
const { verificarToken } = require('../middleware/auth');
const db         = require('../models/db');        // bdtexpro (MySQL)
const { getSoftlandPool } = require('../models/softland'); // Softland (MSSQL)  

router.use(verificarToken);

// ── helpers ───────────────────────────────────────────────────────────────── 
function getCodigos(usuario) {
  return (usuario.vendedores || []).map(v => v.cod_vendedor);
}

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

// ── GET /api/dashboard/resumen ───────────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy     = new Date();
  const mes     = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio    = parseInt(req.query.anio) || hoy.getFullYear();

  try {
    // 1. Meta anual del usuario (bdtexpro)
    const [metaRows] = await db.query(
      `SELECT meta FROM vendedor_meta
       WHERE usuario_id = ? AND YEAR(fecha) = ?
       LIMIT 1`,
      [usuario.id, anio]
    );
    const metaAnual = metaRows.length ? Number(metaRows[0].meta) : 0;
    const metaMes   = metaAnual > 0 ? Math.round(metaAnual / 12) : 0;

    if (!codigos.length) {
      return res.json({ ok: true, totalVentas: 0, meta: metaMes, progreso: 0, totalDescuento: 0 });
    }

    // 2. Total ventas + descuento del mes (Softland)
    const pool = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        SUM(h.SubTotal)  AS totalVentas,
        SUM(h.SubTotal * ISNULL(h.PorDesc,0) / 100) AS totalDescuento
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE h.CanCod IN (${mssqlIn(codigos)})
        AND MONTH(h.FchEmi) = ${mes}
        AND YEAR(h.FchEmi)  = ${anio}
        AND h.TipMov IN ('FT','BT')
        AND h.EstDoc <> 'A'
    `);

    const row           = result.recordset[0] || {};
    const totalVentas   = Number(row.totalVentas)   || 0;
    const totalDescuento= Number(row.totalDescuento) || 0;
    const progreso = metaMes > 0 ? Math.min(Math.round((totalVentas / metaMes) * 100), 999) : 0;
    res.json({ ok: true, totalVentas, meta: metaMes, progreso, totalDescuento });
  } catch (err) {
    console.error('[GET /api/dashboard/resumen]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen' });     
  }
});

// ── GET /api/dashboard/evolucion ─────────────────────────────────────────────
router.get('/evolucion', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy     = new Date();
  const anio    = parseInt(req.query.anio) || hoy.getFullYear();

  try {
    // Meta anual (bdtexpro)
    const [metaRows] = await db.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuario.id, anio]
    );
    const metaAnual = metaRows.length ? Number(metaRows[0].meta) : 0;
    const metaMes   = metaAnual > 0 ? Math.round(metaAnual / 12) : 0;

    if (!codigos.length) {
      const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ventas: 0, meta: metaMes }));
      return res.json({ ok: true, evolucion: meses });
    }

    // Ventas por mes del año (Softland)
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        MONTH(h.FchEmi) AS mes,
        SUM(h.SubTotal) AS ventas
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE h.CanCod IN (${mssqlIn(codigos)})
        AND YEAR(h.FchEmi) = ${anio}
        AND h.TipMov IN ('FT','BT')
        AND h.EstDoc <> 'A'
      GROUP BY MONTH(h.FchEmi)
      ORDER BY mes
    `);

    // Construir array 12 meses
    const ventasPorMes = {};
    result.recordset.forEach(r => { ventasPorMes[r.mes] = Number(r.ventas) || 0;
 });                                                                            
    const evolucion = Array.from({length:12}, (_, i) => ({
      mes:    i + 1,
      ventas: ventasPorMes[i + 1] || 0,
      meta:   metaMes
    }));

    res.json({ ok: true, evolucion });
  } catch (err) {
    console.error('[GET /api/dashboard/evolucion]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener evolución' });   
  }
});

// ── GET /api/dashboard/vendedores ────────────────────────────────────────────
router.get('/vendedores', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy     = new Date();
  const mes     = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio    = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigos.length) return res.json({ ok: true, vendedores: [] });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        h.CanCod        AS codVendedor,
        COUNT(h.Folio)  AS folios,
        SUM(h.SubTotal) AS totalVentas
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE h.CanCod IN (${mssqlIn(codigos)})
        AND MONTH(h.FchEmi) = ${mes}
        AND YEAR(h.FchEmi)  = ${anio}
        AND h.TipMov IN ('FT','BT')
        AND h.EstDoc <> 'A'
      GROUP BY h.CanCod
      ORDER BY totalVentas DESC
    `);
    res.json({ ok: true, vendedores: result.recordset });
  } catch (err) {
    console.error('[GET /api/dashboard/vendedores]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener vendedores' });  
  }
});

// ── GET /api/dashboard/ventas-mes ────────────────────────────────────────────
router.get('/ventas-mes', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy     = new Date();
  const mes     = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio    = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigos.length) return res.json({ ok: true, ventas: [] });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT TOP 100
        h.Folio,
        CONVERT(varchar,h.FchEmi,103) AS fecha_formato,
        c.RznSoc                      AS cliente,
        h.CanCod                      AS CodVendedor,
        h.SubTotal                    AS monto,
        ISNULL(h.SubTotal * h.PorDesc / 100, 0) AS descuento
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[iw_mclpr] c ON c.CanCod = h.CodCli
      WHERE h.CanCod IN (${mssqlIn(codigos)})
        AND MONTH(h.FchEmi) = ${mes}
        AND YEAR(h.FchEmi)  = ${anio}
        AND h.TipMov IN ('FT','BT')
        AND h.EstDoc <> 'A'
      ORDER BY h.FchEmi DESC
    `);
    res.json({ ok: true, ventas: result.recordset });
  } catch (err) {
    console.error('[GET /api/dashboard/ventas-mes]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas del mes' });
  }
});

// ── GET /api/dashboard/detalle/:folio ─────────────────────────────────────── 
router.get('/detalle/:folio', async (req, res) => {
  const folio = parseInt(req.params.folio);
  if (!folio) return res.status(400).json({ ok: false, error: 'Folio inválido' }
);                                                                              
  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        d.CodProd,
        d.DesProd,
        d.CantFac  AS CantFacturada,
        d.PrcVtaUni AS PrecioUnitario,
        d.LinTot   AS Total
      FROM [PRODIN].[softland].[iw_gmovi] d
      WHERE d.Folio = ${folio}
      ORDER BY d.LinNum
    `);
    res.json({ ok: true, folio, detalle: result.recordset });
  } catch (err) {
    console.error('[GET /api/dashboard/detalle]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener detalle del folio' });
  }
});

module.exports = router;
