"use strict";

/**
 * routes/dashboard.js
 * Endpoints para el dashboard principal
 * GET /api/dashboard/resumen  — 4 KPIs + meta del mes
 * GET /api/dashboard/evolucion — últimos 6 meses ventas vs meta
 * GET /api/dashboard/vendedores — ventas por cod vendedor (mes actual)
 * GET /api/dashboard/ventas-mes — folios del mes
 * GET /api/dashboard/detalle/:folio — líneas de un folio
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/requireAuth');
const db = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');


router.use(requireAuth);

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
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  try {
    const [metaRows] = await db.pool.query(
      `SELECT meta FROM vendedor_meta
       WHERE usuario_id = ? AND YEAR(fecha) = ?
       LIMIT 1`,
      [usuario.sub, anio]
    );
    const metaMes = metaRows.length ? Number(metaRows[0].meta) : 0;

    if (!codigos.length) {
      return res.json({ ok: true, totalVentas: 0, meta: metaMes, progreso: 0, totalDescuento: 0 });
    }

    const pool   = await getSoftlandPool();
const result = await pool.request().query(`
  SELECT
    SUM(
      CASE
        WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
        ELSE ROUND(h.SubTotal * 1.10, 0)
      END
    ) AS totalVentas,
    ROUND(
      SUM(
        CASE
          WHEN m.PreUniMB > 0 AND m.CantFacturada > 0
          THEN (m.PreUniMB - (m.TotLinea / m.CantFacturada)) / m.PreUniMB * 100
          ELSE 0
        END
      ) / NULLIF(COUNT(m.Linea), 0)
    , 2) AS pctDescuentoGlobal
  FROM [PRODIN].[softland].[iw_gsaen] h
  LEFT JOIN [PRODIN].[softland].[iw_gmovi] m
    ON m.NroInt = h.NroInt AND m.Tipo = h.Tipo
  WHERE h.CodVendedor IN (${mssqlIn(codigos)})
    AND MONTH(h.Fecha) = ${mes}
    AND YEAR(h.Fecha)  = ${anio}
    AND h.Tipo IN ('F','N','D')
    AND h.Estado <> 'A'
`);

const row = result.recordset[0] || {};
const totalVentas        = Number(row.totalVentas)        || 0;
const pctDescuentoGlobal = Number(row.pctDescuentoGlobal) || 0;
const progreso = metaMes > 0 ? Math.min(Math.round((totalVentas / metaMes) * 100), 999) : 0;

res.json({ ok: true, totalVentas, meta: metaMes, progreso, pctDescuentoGlobal });


  } catch (err) {
    console.error('[GET /api/dashboard/resumen]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen' });
  }
});

// ── GET /api/dashboard/evolucion ─────────────────────────────────────────────
router.get('/evolucion', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy  = new Date();
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  try {
    const [metaRows] = await db.pool.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuario.sub, anio]
    );
    const metaMes = metaRows.length ? Number(metaRows[0].meta) : 0;

    if (!codigos.length) {
      const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ventas: 0, meta: metaMes }));
      return res.json({ ok: true, evolucion: meses });
    }

    const pool   = await getSoftlandPool();
const result = await pool.request().query(`
  SELECT
    MONTH(Fecha) AS mes,
    SUM(
      CASE
        WHEN RTRIM(CanCod) = '300' THEN SubTotal
        ELSE ROUND(SubTotal * 1.10, 0)
      END
    ) AS ventas
  FROM [PRODIN].[softland].[iw_gsaen]
  WHERE CodVendedor IN (${mssqlIn(codigos)})
    AND YEAR(Fecha) = ${anio}
    AND Tipo IN ('F','N','D')
    AND Estado <> 'A'
  GROUP BY MONTH(Fecha)
  ORDER BY mes
`);


    const ventasPorMes = {};
    result.recordset.forEach(r => { ventasPorMes[r.mes] = Number(r.ventas) || 0; });
    const evolucion = Array.from({ length: 12 }, (_, i) => ({
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
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigos.length) return res.json({ ok: true, vendedores: [] });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        CodVendedor AS codVendedor,
        COUNT(Folio) AS folios,
        SUM(SubTotal) AS totalVentas
      FROM [PRODIN].[softland].[iw_gsaen]
      WHERE CodVendedor IN (${mssqlIn(codigos)})
        AND MONTH(Fecha) = ${mes}
        AND YEAR(Fecha)  = ${anio}
        AND Tipo IN ('F','N','D')
        AND Estado <> 'A'
      GROUP BY CodVendedor
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
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigos.length) return res.json({ ok: true, ventas: [] });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
  SELECT TOP 100
    h.Folio,
    CONVERT(varchar, h.Fecha, 103)   AS fecha_formato,
    c.NomAux                         AS cliente,
    h.CodVendedor,
    -- Regla 1: recargo regional por CanCod
    CASE 
      WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
      ELSE ROUND(h.SubTotal * 1.10, 0)
    END                              AS monto,
    -- Regla 2: descuento % promedio por líneas
    ROUND(
      SUM(
        CASE
          WHEN m.PreUniMB > 0 AND m.CantFacturada > 0
          THEN (m.PreUniMB - (m.TotLinea / m.CantFacturada)) / m.PreUniMB * 100
          ELSE 0
        END
      ) / NULLIF(COUNT(m.Linea), 0)
    , 2)                             AS pct_descuento
  FROM [PRODIN].[softland].[iw_gsaen] h
  LEFT JOIN [PRODIN].[softland].[cwtauxi] c  ON c.CodAux = h.CodAux
  LEFT JOIN [PRODIN].[softland].[iw_gmovi] m ON m.NroInt = h.NroInt AND m.Tipo = h.Tipo
  WHERE h.CodVendedor IN (${mssqlIn(codigos)})
    AND MONTH(h.Fecha) = ${mes}
    AND YEAR(h.Fecha)  = ${anio}
    AND h.Tipo IN ('F','N','D')
    AND h.Estado <> 'A'
  GROUP BY h.Folio, h.Fecha, c.NomAux, h.CodVendedor, h.SubTotal, h.NroInt, h.CanCod
  ORDER BY h.Fecha DESC
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
  if (!folio) return res.status(400).json({ ok: false, error: 'Folio inválido' });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        d.CodProd,
        d.DesProd,
        d.CantFac   AS CantFacturada,
        d.PrcVtaUni AS PrecioUnitario,
        d.LinTot    AS Total
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
