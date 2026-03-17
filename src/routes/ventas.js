'use strict';

/**
 * routes/ventas.js — API REST módulo de ventas
 * Todas las rutas requieren JWT válido.
 *
 * GET /api/ventas                  — lista de folios (query 6)
 * GET /api/ventas/total            — total ventas del mes (query 1)
 * GET /api/ventas/resumen          — resumen por vendedor (query 2)
 * GET /api/ventas/clientes         — clientes por vendedor (query 3)
 * GET /api/ventas/folio/:folio     — monto de un folio (query 7)
 * GET /api/ventas/detalle/:folio   — detalle líneas de un folio (query 10)
 */

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middlewares/requireAuth');
const {
  getTotalVentas,
  getResumenPorVendedor,
  getClientesPorVendedor,
  getVentas,
  getMontoFolio,
  getDetalleFolio,
} = require('../models/venta');

// ─── Helper: extrae codigos de vendedor del token ─────────────────────────────
function getCodigos(req) {
  // req.usuario viene del middleware requireAuth (JWT payload)
  // vendedores es un array [{ cod_vendedor: '194', ... }]
  const vendedores = req.usuario?.vendedores ?? [];
  return vendedores.map(v => v.cod_vendedor).filter(Boolean);
}

// ─── Helper: mes/año actuales por defecto ────────────────────────────────────
function getMesAnio(query) {
  const hoy  = new Date();
  const mes  = Number(query.mes  ?? hoy.getMonth() + 1);
  const anio = Number(query.anio ?? hoy.getFullYear());
  return { mes, anio };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas — lista de folios del mes
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    if (!codigos.length) return res.json({ ok: true, ventas: [] });
    const { mes, anio } = getMesAnio(req.query);
    const ventas = await getVentas({ codigos, mes, anio });
    res.json({ ok: true, ventas });
  } catch (err) {
    console.error('[GET /api/ventas]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/total
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/resumen
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/clientes
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/folio/:folio — monto total de un folio
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/detalle/:folio — líneas de detalle de un folio
// ─────────────────────────────────────────────────────────────────────────────
router.get('/detalle/:folio', requireAuth, async (req, res) => {
  try {
    const folio  = req.params.folio;
    const detalle = await getDetalleFolio({ folio });
    res.json({ ok: true, folio, detalle });
  } catch (err) {
    console.error('[GET /api/ventas/detalle]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener detalle del folio' });
  }
});

module.exports = router;
