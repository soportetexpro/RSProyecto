'use strict';

/**
 * routes/ventas.js — API REST módulo de ventas
 * GET /api/ventas                    — lista de folios del mes
 * GET /api/ventas/total              — total ventas del mes
 * GET /api/ventas/resumen            — resumen por vendedor
 * GET /api/ventas/resumen-vendedores — ventas agrupadas por cod_vendedor
 * GET /api/ventas/evolucion          — ventas mes a mes del año (gráfico)
 * GET /api/ventas/meta               — meta anual/mensual desde bdtexpro
 * GET /api/ventas/clientes           — clientes por vendedor
 * GET /api/ventas/folio/:folio       — monto de un folio
 * GET /api/ventas/detalle/:folio     — detalle líneas de un folio
 */

const express = require('express');
const router  = express.Router();
const { requireAuth }      = require('../middlewares/requireAuth');
const db                   = require('../config/db');
const { getSoftlandPool }  = require('../config/db.softland');
const { getFactorDescuento } = require('../models/usuario');
const {
  getTotalVentas,
  getResumenPorVendedor,
  getClientesPorVendedor,
  getVentas,
  getMontoFolio,
  getDetalleFolio,
} = require('../models/venta');


// ── Helpers ───────────────────────────────────────────────────────────────────
function getCodigos(req) {
  return (req.usuario?.vendedores ?? []).map(v => v.cod_vendedor).filter(Boolean);
}

function getMesAnio(query) {
  const hoy  = new Date();
  const mes  = Number(query.mes  ?? hoy.getMonth() + 1);
  const anio = Number(query.anio ?? hoy.getFullYear());
  return { mes, anio };
}

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

// ── GET /api/ventas ───────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, ventas: [] });

    const { mes, anio } = getMesAnio(req.query);

    // ← NUEVO: verificar si existe tasa en MySQL para ese año/mes
    const fechaConsulta = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const factor = await getFactorDescuento(anio, fechaConsulta);

    const ventas = await getVentas({ codigos, mes, anio, factor });
    res.json({ ok: true, ventas });
  } catch (err) {
    console.error('[GET /api/ventas]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});


// ── GET /api/ventas/total ─────────────────────────────────────────────────────
router.get('/total', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, total_ventas: 0 });
    const { mes, anio } = getMesAnio(req.query);
    const total = await getTotalVentas({ codigos, mes, anio });
    res.json({ ok: true, total_ventas: total });
  } catch (err) {
    console.error('[GET /api/ventas/total]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener total de ventas' });
  }
});

// ── GET /api/ventas/meta ──────────────────────────────────────────────────────
router.get('/meta', requireAuth, async (req, res) => {
  try {
    const { anio }  = getMesAnio(req.query);
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

// ── GET /api/ventas/resumen-vendedores ────────────────────────────────────────
router.get('/resumen-vendedores', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, vendedores: [] });
    const { mes, anio } = getMesAnio(req.query);
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        h.CanCod                  AS codVendedor,
        COUNT(DISTINCT h.Folio)   AS totalFolios,
        SUM(h.SubTotal)           AS totalVentas,
        SUM(ISNULL(h.SubTotal * h.PorDesc / 100, 0)) AS totalDescuento
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
    console.error('[GET /api/ventas/resumen-vendedores]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen vendedores' });
  }
});

// ── GET /api/ventas/evolucion ─────────────────────────────────────────────────
router.get('/evolucion', requireAuth, async (req, res) => {
  try {
    const codigos   = getCodigos(req);
    const { anio }  = getMesAnio(req.query);
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

// ── GET /api/ventas/resumen ───────────────────────────────────────────────────
router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, resumen: [] });
    const { mes, anio } = getMesAnio(req.query);
    const resumen = await getResumenPorVendedor({ codigos, mes, anio });
    res.json({ ok: true, resumen });
  } catch (err) {
    console.error('[GET /api/ventas/resumen]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener resumen por vendedor' });
  }
});

// ── GET /api/ventas/clientes ──────────────────────────────────────────────────
router.get('/clientes', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, clientes: [] });
    const { mes, anio } = getMesAnio(req.query);
    const clientes = await getClientesPorVendedor({ codigos, mes, anio });
    res.json({ ok: true, clientes });
  } catch (err) {
    console.error('[GET /api/ventas/clientes]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener clientes' });
  }
});

// ── GET /api/ventas/folio/:folio ──────────────────────────────────────────────
router.get('/folio/:folio', requireAuth, async (req, res) => {
  try {
    const folio = req.params.folio;
    const anio  = Number(req.query.anio ?? new Date().getFullYear());
    const data  = await getMontoFolio({ folio, anio });
    if (!data) return res.status(404).json({ ok: false, error: 'Folio no encontrado' });
    res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[GET /api/ventas/folio]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener folio' });
  }
});

// ── GET /api/ventas/detalle/:folio ────────────────────────────────────────────
router.get('/detalle/:folio', requireAuth, async (req, res) => {
  try {
    const folio = req.params.folio;
    const anio  = Number(req.query.anio ?? new Date().getFullYear());

    // ← NUEVO: verificar tasa para el año del folio
    const factor = await getFactorDescuento(anio, `${anio}-12-31`);

    const detalle = await getDetalleFolio({ folio, factor });
    res.json({ ok: true, folio, detalle });
  } catch (err) {
    console.error('[GET /api/ventas/detalle]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener detalle del folio' });
  }
});


module.exports = router;
