'use strict';

/**
 * venta.js — Modelo de Ventas
 * Consulta datos desde Softland (SQL Server via mssql)
 */

const { getSoftlandPool } = require('../config/db.softland');

/**
 * Obtiene ventas filtradas por vendedor y rango de fechas.
 * @param {object} filtros
 * @param {string} [filtros.vendedor]   — código vendedor
 * @param {string} [filtros.desde]      — fecha ISO (YYYY-MM-DD)
 * @param {string} [filtros.hasta]      — fecha ISO (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
async function getVentas({ vendedor, desde, hasta } = {}) {
  const pool = await getSoftlandPool();

  let where  = 'WHERE 1=1';
  const params = [];
  let idx = 1;

  if (vendedor) { where += ` AND v.CodVendedor = @p${idx}`; params.push({ name: `p${idx}`, value: vendedor }); idx++; }
  if (desde)    { where += ` AND v.FechaDoc >= @p${idx}`;   params.push({ name: `p${idx}`, value: new Date(desde) }); idx++; }
  if (hasta)    { where += ` AND v.FechaDoc <= @p${idx}`;   params.push({ name: `p${idx}`, value: new Date(hasta + 'T23:59:59') }); idx++; }

  const query = `
    SELECT
      v.NumeroDoc          AS folio,
      v.FechaDoc           AS fecha,
      c.NombreCliente      AS cliente,
      v.CodVendedor        AS vendedor,
      v.MontoNetoDoc       AS neto,
      v.EstadoDocumento    AS estado
    FROM VTA_DocumentosVenta v
    LEFT JOIN GEN_Clientes c ON c.CodCliente = v.CodCliente
    ${where}
    ORDER BY v.FechaDoc DESC
  `;

  const request = pool.request();
  params.forEach(p => request.input(p.name, p.value));

  const result = await request.query(query);
  return result.recordset;
}

/**
 * Obtiene el total de ventas agrupado por vendedor en un rango de fechas.
 * @param {string} desde  — YYYY-MM-DD
 * @param {string} hasta  — YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function getVentasPorVendedor(desde, hasta) {
  const pool    = await getSoftlandPool();
  const request = pool.request();
  request.input('desde', new Date(desde));
  request.input('hasta', new Date(hasta + 'T23:59:59'));

  const result = await request.query(`
    SELECT
      v.CodVendedor              AS vendedor,
      COUNT(*)                   AS cantidad,
      SUM(v.MontoNetoDoc)        AS total_neto
    FROM VTA_DocumentosVenta v
    WHERE v.FechaDoc BETWEEN @desde AND @hasta
    GROUP BY v.CodVendedor
    ORDER BY total_neto DESC
  `);
  return result.recordset;
}

module.exports = { getVentas, getVentasPorVendedor };
