'use strict';

/**
 * routes/ventas.js — API REST del módulo de ventas
 * Todas las rutas requieren JWT válido.
 *
 * GET /api/ventas              — lista de ventas con filtros
 * GET /api/ventas/por-vendedor — totales agrupados por vendedor
 */

const express  = require('express');
const router   = express.Router();
const { requireAuth } = require('../middlewares/requireAuth');
const { getVentas, getVentasPorVendedor } = require('../models/venta');

// ── GET /api/ventas ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { vendedor, desde, hasta } = req.query;
    const ventas = await getVentas({ vendedor, desde, hasta });
    res.json({ ok: true, ventas });
  } catch (err) {
    console.error('[GET /api/ventas]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener ventas' });
  }
});

// ── GET /api/ventas/por-vendedor ───────────────────────────────────────────────
router.get('/por-vendedor', requireAuth, async (req, res) => {
  try {
    const hoy    = new Date().toISOString().slice(0, 10);
    const inicio = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const desde  = req.query.desde || inicio;
    const hasta  = req.query.hasta || hoy;
    const datos  = await getVentasPorVendedor(desde, hasta);
    res.json({ ok: true, datos });
  } catch (err) {
    console.error('[GET /api/ventas/por-vendedor]', err.message);
    res.status(500).json({ ok: false, error: 'Error al agrupar ventas por vendedor' });
  }
});

module.exports = router;
