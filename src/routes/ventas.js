'use strict';

/**
 * routes/ventas.js — API REST módulo de ventas
 *
 * Propósito:
 *   Exponer datos comerciales para dashboards y tablas del frontend.
 *
 * Fuentes de datos:
 *   - SQL Server Softland (ventas, clientes, folios, detalle)
 *   - MySQL bdtexpro (meta anual por usuario vendedor, tasas_descuentos)
 *
 * Regla de seguridad:
 *   Todos los endpoints usan requireAuth y filtran por los códigos
 *   de vendedor asociados al usuario autenticado.
 *
 * Reglas de negocio aplicadas:
 *   - Precio histórico dinámico desde tasas_descuentos (acumulado multiplicativo)
 *   - Productos NC% usan TotLinea/CantFacturada como precio real
 *   - Canal 301: precio de lista × 1.1
 *   - Estado <> 'A': excluye documentos anulados
 *
 * GET /api/ventas                    — lista de folios del mes
 * GET /api/ventas/kpis               — KPIs card: totalVentas, metaMes, totalDescuento
 * GET /api/ventas/total              — total ventas del mes
 * GET /api/ventas/resumen            — resumen por vendedor
 * GET /api/ventas/resumen-vendedores — ventas agrupadas por cod_vendedor (con filtro mes/año)
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

const { requireAuth }           = require('../middlewares/requireAuth');
const db                        = require('../config/db');
const { getSoftlandPool }       = require('../config/db.softland');
const { buildPrecioListaRealCASE } = require('../utils/precioHistorico');
const {
  getTotalVentas,
  getResumenPorVendedor,
  getClientesPorVendedor,
  getVentas,
  getMontoFolio,
  getDetalleFolio,
  getDescuentosVendedor,
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

// ── GET /api/ventas/kpis ──────────────────────────────────────────────────────────────────────────────
//
// KPIs para las cards del dashboard de ventas.
//   totalVentas    = SUM(TotLinea) cobrado real
//   metaMes        = meta mensual desde MySQL bdtexpro
//   totalDescuento = diferencia entre ventaListaReal y totalVentas (calculado real)
//
router.get('/kpis', requireAuth, async (req, res) => {
  try {
    const codigos = getCodigos(req);
    let mes, anio;
    try {
      ({ mes, anio } = validarMesAnio(req.query.mes, req.query.anio));
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }

    // ─ Meta mensual desde MySQL ─────────────────────────────────────────────
    const usuarioId = req.usuario?.id;
    const [metaRows] = await db.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuarioId, anio]
    );
    const metaAnual = metaRows.length ? Number(metaRows[0].meta) : 0;
    const metaMes   = metaAnual > 0 ? Math.round(metaAnual / 12) : 0;

    if (!codigos.length) {
      return res.json({ ok: true, totalVentas: 0, metaMes, totalDescuento: 0 });
    }

    const codigosIn = codigos.map(c => `'${c}'`).join(',');

    // CASE de precio lista real dinámico
    const precioListaRealCASE = await buildPrecioListaRealCASE(db, {
      campoFecha:     'enc.Fecha',
      campoCodProd:   'm.CodProd',
      campoTotLinea:  'm.TotLinea',
      campoCant:      'm.CantFacturada',
      campoPrecioVta: 't.PrecioVta',
      campoCodCan:    'cvl.CodCan',
    });

    const pool   = await getSoftlandPool();
    const result = await pool.request()
      .input('mes',  sql.Int, mes)
      .input('anio', sql.Int, anio)
      .query(`
        SELECT
          SUM(m.TotLinea)                                          AS totalVentasCobrado,
          SUM(m.CantFacturada * (${precioListaRealCASE}))          AS totalVentasLista,
          SUM(SUM(m.TotLinea)) OVER ()                             AS totalVentasMes
        FROM [PRODIN].[softland].[iw_gsaen] enc
        INNER JOIN [PRODIN].[softland].[iw_gmovi] m
          ON m.NroInt = enc.NroInt
         AND m.Tipo   = enc.Tipo
        INNER JOIN [PRODIN].[softland].[iw_tprod] t
          ON t.CodProd = m.CodProd
        LEFT JOIN [PRODIN].[softland].[cwtcvcl] cvl
          ON cvl.CodAux = enc.CodAux
        WHERE enc.Tipo         IN ('F', 'N', 'D')
          AND enc.Estado       <>  'A'
          AND enc.CodVendedor  IN (${codigosIn})
          AND MONTH(enc.Fecha) =   @mes
          AND YEAR(enc.Fecha)  =   @anio
        GROUP BY enc.CodVendedor
      `);

    const rows           = result.recordset;
    const totalVentas    = rows.length ? Number(rows[0].totalVentasMes)    : 0;
    const totalLista     = rows.reduce((acc, r) => acc + Number(r.totalVentasLista    || 0), 0);
    const totalCobrado   = rows.reduce((acc, r) => acc + Number(r.totalVentasCobrado  || 0), 0);
    const totalDescuento = Math.round(totalLista - totalCobrado);

    res.json({ ok: true, totalVentas, metaMes, totalDescuento });
  } catch (err) {
    console.error('[GET /api/ventas/kpis]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener KPIs' });
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
// Retorna ventas agrupadas por vendedor con precio lista real dinámico.
// Aplica: histórico acumulado + canal 301 (+10%) + NC% (precio = cobrado)
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

    const codigosIn = codigos.map(c => `'${c}'`).join(',');

    const precioListaRealCASE = await buildPrecioListaRealCASE(db, {
      campoFecha:     'enc.Fecha',
      campoCodProd:   'm.CodProd',
      campoTotLinea:  'm.TotLinea',
      campoCant:      'm.CantFacturada',
      campoPrecioVta: 't.PrecioVta',
      campoCodCan:    'cvl.CodCan',
    });

    const pool   = await getSoftlandPool();
    const result = await pool.request()
      .input('mes',  sql.Int, mes)
      .input('anio', sql.Int, anio)
      .query(`
        SELECT
          enc.CodVendedor                                                AS codVendedor,
          MIN(enc.NomAux)                                                AS nombreVendedor,
          COUNT(DISTINCT enc.Folio)                                      AS totalFolios,
          ROUND(tot.totalVentasCobrado, 0)                               AS totalVentasCobrado,
          ROUND(SUM(m.CantFacturada * (${precioListaRealCASE})), 0)      AS ventaRealLista,
          CASE
            WHEN SUM(m.CantFacturada * (${precioListaRealCASE})) > 0
            THEN ROUND(
              (1 - (tot.totalVentasCobrado
                  / NULLIF(SUM(m.CantFacturada * (${precioListaRealCASE})), 0))
              ) * 100
            , 2)
            ELSE 0
          END                                                            AS pctDescuento
        FROM [PRODIN].[softland].[iw_gsaen] enc
        INNER JOIN (
          SELECT CodVendedor, SUM(SubTotal) AS totalVentasCobrado
          FROM [PRODIN].[softland].[iw_gsaen]
          WHERE CodVendedor IN (${codigosIn})
            AND Tipo    IN ('F','N','D')
            AND Estado <>  'A'
            AND MONTH(Fecha) = @mes
            AND YEAR(Fecha)  = @anio
          GROUP BY CodVendedor
        ) tot ON tot.CodVendedor = enc.CodVendedor
        INNER JOIN [PRODIN].[softland].[iw_gmovi] m
          ON m.NroInt = enc.NroInt
         AND m.Tipo   = enc.Tipo
        INNER JOIN [PRODIN].[softland].[iw_tprod] t
          ON t.CodProd = m.CodProd
        LEFT JOIN [PRODIN].[softland].[cwtcvcl] cvl
          ON cvl.CodAux = enc.CodAux
        WHERE enc.CodVendedor IN (${codigosIn})
          AND enc.Tipo    IN ('F','N','D')
          AND enc.Estado <>  'A'
          AND MONTH(enc.Fecha) = @mes
          AND YEAR(enc.Fecha)  = @anio
        GROUP BY enc.CodVendedor, tot.totalVentasCobrado
        ORDER BY tot.totalVentasCobrado DESC
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
          MONTH(enc.Fecha)   AS mes,
          SUM(m.TotLinea)    AS ventas
        FROM [PRODIN].[softland].[iw_gsaen] enc
        INNER JOIN [PRODIN].[softland].[iw_gmovi] m
          ON m.NroInt = enc.NroInt
         AND m.Tipo   = enc.Tipo
        WHERE enc.CodVendedor IN (${codigos.map(c => `'${c}'`).join(',')})
          AND YEAR(enc.Fecha)  = @anio
          AND enc.Tipo   IN ('F','N','D')
          AND enc.Estado <>  'A'
        GROUP BY MONTH(enc.Fecha)
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
    const detalle = await getDetalleFolio({ folio });
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
