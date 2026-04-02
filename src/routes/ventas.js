'use strict';

/**
 * routes/ventas.js — API REST módulo de ventas
 *
 * Propósito:
 *   Exponer datos comerciales para dashboards y tablas del frontend.
 *
 * Fuentes de datos:
 *   - SQL Server Softland (ventas, clientes, folios, detalle)
 *   - MySQL bdtexpro (meta anual por usuario vendedor)
 *
 * Regla de seguridad:
 *   Todos los endpoints usan requireAuth y filtran por los códigos
 *   de vendedor asociados al usuario autenticado.
 *
 * GET /api/ventas                    — lista de folios del mes
 * GET /api/ventas/total              — total ventas del mes
 * GET /api/ventas/resumen            — resumen por vendedor
 * GET /api/ventas/resumen-vendedores — ventas agrupadas por cod_vendedor
 * GET /api/ventas/evolucion          — ventas mes a mes del año (gráfico)
 * GET /api/ventas/meta               — meta anual/mensual desde bdtexpro
 * GET /api/ventas/clientes           — clientes por vendedor
 * GET /api/ventas/folio/:folio       — monto de un folio
 * GET /api/ventas/detalle/:folio     — detalle líneas de un folio
 * GET /api/ventas/descuentos         — descuentos por vendedor
 */

const express = require('express');
const router  = express.Router();
const sql     = require('mssql');

const { getDescuentosVendedor } = require('../models/venta');
const { requireAuth }           = require('../middlewares/requireAuth');
const db                        = require('../config/db');
const { getSoftlandPool }       = require('../config/db.softland');
const {
  getTotalVentas,
  getResumenPorVendedor,
  getClientesPorVendedor,
  getVentas,
  getMontoFolio,
  getDetalleFolio,
} = require('../models/venta');
const { validarMesAnio } = require('../utils/stringHelpers');

// ── Helpers ────────────────────────────────────────────────────────────────────────────────
function getCodigos(req) {
  return (req.usuario?.vendedores ?? []).map(v => v.cod_vendedor).filter(Boolean);
}

// ── GET /api/ventas ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, ventas: [] });
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const ventas = await getVentas({ codigos, mes, anio });
    res.json({ ok: true, ventas });
  } catch (err) {
    console.error('[GET /api/ventas]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});

// ── GET /api/ventas/total ──────────────────────────────────────────────────────────────────────────────
router.get('/total', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, total_ventas: 0 });
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const total = await getTotalVentas({ codigos, mes, anio });
    res.json({ ok: true, total_ventas: total });
  } catch (err) {
    console.error('[GET /api/ventas/total]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener total de ventas' });
  }
});

// ── GET /api/ventas/meta ──────────────────────────────────────────────────────────────────────────────
router.get('/meta', requireAuth, async (req, res) => {
  try {
    let anio;
    try {
      ({ anio } = validarMesAnio(req.query.mes ?? '1', req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const usuarioId = req.usuario?.id;
    const [rows] = await db.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuarioId, anio]
    );
    const metaAnual = rows.length ? Number(rows[0].meta) : 0;
    const metaMes   = metaAnual > 0 ? Math.round(metaAnual / 12) : 0;
    res.json({ ok: true, metaAnual, metaMes });
  } catch (err) {
    console.error('[GET /api/ventas/meta]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener meta' });
  }
});

// ── GET /api/ventas/resumen-vendedores ────────────────────────────────────────────────────────────────────────────
//
// Lógica de cálculo (misma base que getDetalleFolio en models/venta.js):
//
//   El campo h.TotDesc de iw_gsaen viene en 0 para la mayoría de folios
//   en Softland y NO refleja el descuento real por línea.
//
//   Descuento real = diferencia entre precio lista (iw_tprod.PrecioVta)
//                   y precio cobrado (iw_gmovi.TotLinea / CantFacturada)
//
//   totalVentas    = SUM(m.TotLinea)              → lo que pagó el cliente
//   ventaReal      = SUM(t.PrecioVta * m.CantFacturada) → precio lista sin descuento
//   totalDescuento = ventaReal - totalVentas      → diferencia real en pesos
//
router.get('/resumen-vendedores', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, vendedores: [] });
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const pool   = await getSoftlandPool();
    const result = await pool.request()
      .input('mes',  sql.Int, mes)
      .input('anio', sql.Int, anio)
      .query(`
        SELECT
          h.CodVendedor                                              AS codVendedor,
          ISNULL(v.NomVendedor, h.CodVendedor)                       AS nomVendedor,
          COUNT(DISTINCT h.Folio)                                    AS totalFolios,
          ROUND(SUM(m.TotLinea), 0)                                  AS totalVentas,
          ROUND(SUM(t.PrecioVta * m.CantFacturada), 0)               AS ventaReal,
          ROUND(SUM(t.PrecioVta * m.CantFacturada) - SUM(m.TotLinea), 0) AS totalDescuento
        FROM [PRODIN].[softland].[iw_gsaen] h
        INNER JOIN [PRODIN].[softland].[iw_gmovi] m
          ON m.NroInt = h.NroInt AND m.Tipo = h.Tipo
        INNER JOIN [PRODIN].[softland].[iw_tprod] t
          ON t.CodProd = m.CodProd
        LEFT JOIN [PRODIN].[softland].[iw_gmaes] v
          ON v.CodVendedor = h.CodVendedor
        WHERE h.CodVendedor IN (${codigos.map(c => `'${c}'`).join(',')})
          AND MONTH(h.Fecha) = @mes
          AND YEAR(h.Fecha)  = @anio
          AND h.Tipo IN ('F','N','D')
          AND h.Estado <> 'A'
        GROUP BY h.CodVendedor, v.NomVendedor
        ORDER BY totalVentas DESC
      `);
    res.json({ ok: true, vendedores: result.recordset });
  } catch (err) {
    console.error('[GET /api/ventas/resumen-vendedores]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen vendedores' });
  }
});

// ── GET /api/ventas/evolucion ────────────────────────────────────────────────────────────────────────────────
router.get('/evolucion', requireAuth, async (req, res) => {
  try {
    let anio;
    try {
      ({ anio } = validarMesAnio(req.query.mes ?? '1', req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const codigos   = getCodigos(req);
    const usuarioId = req.usuario?.id;

    const [metaRows] = await db.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuarioId, anio]
    );
    const metaAnual = metaRows.length ? Number(metaRows[0].meta) : 0;
    const metaMes   = metaAnual > 0 ? Math.round(metaAnual / 12) : 0;

    if (!codigos.length) {
      const meses = Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ventas: 0, meta: metaMes }));
      return res.json({ ok: true, evolucion: meses });
    }

    const pool   = await getSoftlandPool();
    const result = await pool.request()
      .input('anio', sql.Int, anio)
      .query(`
        SELECT
          MONTH(h.Fecha) AS mes,
          SUM(h.SubTotal) AS ventas
        FROM [PRODIN].[softland].[iw_gsaen] h
        WHERE h.CodVendedor IN (${codigos.map(c => `'${c}'`).join(',')})
          AND YEAR(h.Fecha) = @anio
          AND h.Tipo IN ('F','N','D')
        GROUP BY MONTH(h.Fecha)
        ORDER BY mes
      `);

    const ventasPorMes = {};
    result.recordset.forEach(r => { ventasPorMes[r.mes] = Number(r.ventas) || 0; });

    const evolucion = Array.from({ length: 12 }, (_, i) => ({
      mes:    i + 1,
      ventas: ventasPorMes[i + 1] || 0,
      meta:   metaMes,
    }));

    res.json({ ok: true, evolucion });
  } catch (err) {
    console.error('[GET /api/ventas/evolucion]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener evolución' });
  }
});

// ── GET /api/ventas/resumen ────────────────────────────────────────────────────────────────────────────────
router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, resumen: [] });
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const resumen = await getResumenPorVendedor({ codigos, mes, anio });
    res.json({ ok: true, resumen });
  } catch (err) {
    console.error('[GET /api/ventas/resumen]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen por vendedor' });
  }
});

// ── GET /api/ventas/clientes ───────────────────────────────────────────────────────────────────────────────
router.get('/clientes', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, clientes: [] });
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const clientes = await getClientesPorVendedor({ codigos, mes, anio });
    res.json({ ok: true, clientes });
  } catch (err) {
    console.error('[GET /api/ventas/clientes]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener clientes' });
  }
});

// ── GET /api/ventas/folio/:folio ──────────────────────────────────────────────────────────────────────────────
router.get('/folio/:folio', requireAuth, async (req, res) => {
  try {
    const folio = req.params.folio;
    let anio;
    try {
      ({ anio } = validarMesAnio('1', req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const data = await getMontoFolio({ folio, anio });
    if (!data) return res.status(404).json({ ok: false, error: 'Folio no encontrado' });
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[GET /api/ventas/folio]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener folio' });
  }
});

// ── GET /api/ventas/detalle/:folio ────────────────────────────────────────────────────────────────────────────
router.get('/detalle/:folio', requireAuth, async (req, res) => {
  try {
    const folio = req.params.folio;
    let anio;
    try {
      ({ anio } = validarMesAnio('1', req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const detalle = await getDetalleFolio({ folio, anio });
    res.json({ ok: true, detalle });
  } catch (err) {
    console.error('[GET /api/ventas/detalle]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener detalle del folio' });
  }
});

// ── GET /api/ventas/descuentos ───────────────────────────────────────────────────────────────────────────────
router.get('/descuentos', requireAuth, async (req, res) => {
  try {
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    const codigos = getCodigos(req);
    const data = await getDescuentosVendedor({ codigos, mes, anio });
    res.json({ ok: true, data });
  } catch (err) {
    console.error('[GET /api/ventas/descuentos]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
