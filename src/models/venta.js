'use strict';

/**
 * venta.js — Modelo de Ventas
 * Todas las queries apuntan a [PRODIN].[softland].*
 * Conexión via mssql (getSoftlandPool)
 */

const { getSoftlandPool, sql } = require('../config/db.softland');

// ─────────────────────────────────────────────────────────────────────────────
// Helper: construye IN ($p1,$p2,...) para arrays de códigos de vendedor
// ─────────────────────────────────────────────────────────────────────────────
function buildInParams(request, codigos, prefijo = 'cod') {
  const names = codigos.map((c, i) => {
    const name = `${prefijo}${i}`;
    request.input(name, sql.VarChar(20), String(c));
    return `@${name}`;
  });
  return names.join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Total Ventas del mes para uno o varios vendedores
// ─────────────────────────────────────────────────────────────────────────────
async function getTotalVentas({ codigos, mes, anio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('mes',  sql.Int, Number(mes));
  request.input('anio', sql.Int, Number(anio));
  const inCods = buildInParams(request, codigos);

  const result = await request.query(`
    SELECT SUM(iw_gsaen.SubTotal) AS total_ventas
    FROM [PRODIN].[softland].[iw_gsaen]
    WHERE iw_gsaen.Tipo IN ('F','N','D')
      AND MONTH(iw_gsaen.fecha) = @mes
      AND YEAR(iw_gsaen.fecha)  = @anio
      AND iw_gsaen.CodVendedor  IN (${inCods})
  `);

  return result.recordset[0]?.total_ventas ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Resumen ventas agrupado por vendedor
// ─────────────────────────────────────────────────────────────────────────────
async function getResumenPorVendedor({ codigos, mes, anio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('mes',  sql.Int, Number(mes));
  request.input('anio', sql.Int, Number(anio));
  const inCods = buildInParams(request, codigos);

  const result = await request.query(`
    SELECT
      gsaen.CodVendedor              AS codigo_vendedor,
      cwtvend.VenDes                 AS nombre_vendedor,
      ROUND(SUM(tprod.PrecioVta), 0) AS precio_vta,
      ROUND(SUM(gmovi.TotLinea), 0)  AS total_ventas
    FROM [PRODIN].[softland].[iw_gmovi] gmovi
    INNER JOIN [PRODIN].[softland].[iw_gsaen] gsaen
      ON gsaen.Tipo    = gmovi.Tipo
      AND gsaen.NroInt = gmovi.NroInt
    INNER JOIN [PRODIN].[softland].[cwtvend] cwtvend
      ON cwtvend.VenCod = gsaen.CodVendedor
    INNER JOIN [PRODIN].[softland].[iw_tprod] tprod
      ON tprod.CodProd = gmovi.CodProd
    WHERE gsaen.Tipo IN ('F','N','D')
      AND MONTH(gsaen.Fecha) = @mes
      AND YEAR(gsaen.Fecha)  = @anio
      AND gsaen.CodVendedor  IN (${inCods})
    GROUP BY gsaen.CodVendedor, cwtvend.VenDes
    ORDER BY gsaen.CodVendedor
  `);

  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Clientes asociados al usuario (agrupado por vendedor + cliente + fecha)
// ─────────────────────────────────────────────────────────────────────────────
async function getClientesPorVendedor({ codigos, mes, anio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('mes',  sql.Int, Number(mes));
  request.input('anio', sql.Int, Number(anio));
  const inCods = buildInParams(request, codigos);

  const result = await request.query(`
    SELECT
      iw_gsaen.CodVendedor                          AS codigo_vendedor,
      cwtauxi.nomAux                                AS nombre_cliente,
      SUM(iw_gsaen.SubTotal)                        AS total_ventas,
      CONVERT(VARCHAR(10), iw_gsaen.Fecha, 103)     AS fecha
    FROM [PRODIN].[softland].[iw_gsaen]
    INNER JOIN [PRODIN].[softland].[cwtauxi] cwtauxi
      ON cwtauxi.codaux = iw_gsaen.codaux
    INNER JOIN [PRODIN].[softland].[cwtvend] cwtvend
      ON cwtvend.VenCod = iw_gsaen.CodVendedor
    WHERE iw_gsaen.Tipo IN ('F','N','D')
      AND MONTH(iw_gsaen.fecha) = @mes
      AND YEAR(iw_gsaen.fecha)  = @anio
      AND iw_gsaen.CodVendedor  IN (${inCods})
    GROUP BY
      iw_gsaen.CodVendedor,
      cwtauxi.nomAux,
      CONVERT(VARCHAR(10), iw_gsaen.Fecha, 103)
    ORDER BY
      iw_gsaen.CodVendedor,
      CONVERT(VARCHAR(10), iw_gsaen.Fecha, 103)
  `);

  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Ventas Softland — lista de folios para uno o varios códigos de vendedor
// ─────────────────────────────────────────────────────────────────────────────
async function getVentas({ codigos, mes, anio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('mes',  sql.Int, Number(mes));
  request.input('anio', sql.Int, Number(anio));
  const inCods = buildInParams(request, codigos);

  const result = await request.query(`
    SELECT
      gsaen.Folio,
      CONVERT(VARCHAR(10), gsaen.Fecha, 103) AS fecha_formato,
      gsaen.SubTotal                         AS monto,
      gsaen.CodVendedor,
      cwtauxi.nomAux                         AS cliente,
      COALESCE(gsaen.TotDesc, 0)             AS descuento
    FROM [PRODIN].[softland].[iw_gsaen] gsaen
    INNER JOIN [PRODIN].[softland].[cwtauxi] cwtauxi
      ON cwtauxi.codaux = gsaen.codaux
    WHERE gsaen.CodVendedor IN (${inCods})
      AND MONTH(gsaen.Fecha) = @mes
      AND YEAR(gsaen.Fecha)  = @anio
      AND gsaen.Tipo IN ('F','N','D')
    ORDER BY gsaen.Fecha DESC
  `);

  return result.recordset;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Monto total de un folio específico
// ─────────────────────────────────────────────────────────────────────────────
async function getMontoFolio({ folio, anio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('folio', sql.Int, Number(folio));
  request.input('anio',  sql.Int,         Number(anio));

  const result = await request.query(`
    SELECT
      SubTotal,
      COALESCE(TotDesc, 0) AS descuento
    FROM [PRODIN].[softland].[iw_gsaen]
    WHERE Folio = @folio
      AND YEAR(Fecha) = @anio
      AND Tipo IN ('F','N','D')
  `);

  return result.recordset[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Descuentos por vendedor filtrado por mes/año con precio histórico
// ─────────────────────────────────────────────────────────────────────────────
async function getDetalleFolio({ folio }) {
  const pool    = await getSoftlandPool();
  const request = pool.request();

  request.input('folio', sql.Int, Number(folio));

  const result = await request.query(`
  WITH base AS (
    SELECT
      gsaen.Folio,
      gsaen.Fecha,
      gsaen.CodVendedor,
      gsaen.CanCod,
      cwtauxi.nomAux                                          AS Cliente,
      gmovi.CodProd,
      tprod.DesProd,
      gmovi.CantFacturada,
      gmovi.TotLinea,
      tprod.PrecioVta,
      CASE
        WHEN gsaen.Fecha < '2023-03-01' THEN (1.07 * 1.07 * 1.05 * 1.17)
        WHEN gsaen.Fecha < '2024-03-01' THEN (1.07 * 1.07 * 1.05)
        WHEN gsaen.Fecha < '2025-03-01' THEN (1.07 * 1.07)
        WHEN gsaen.Fecha < '2026-03-01' THEN (1.07)
        ELSE 1.0
      END                                                     AS divisor_historico,
      CASE WHEN gsaen.CanCod <> '300' THEN 1.10 ELSE 1.0 END AS factor_canal
    FROM [PRODIN].[softland].[iw_gmovi] gmovi
    INNER JOIN [PRODIN].[softland].[iw_gsaen] gsaen
      ON gsaen.NroInt = gmovi.NroInt
      AND gsaen.Tipo  = gmovi.Tipo
    INNER JOIN [PRODIN].[softland].[iw_tprod] tprod
      ON tprod.CodProd = gmovi.CodProd
    INNER JOIN [PRODIN].[softland].[cwtauxi] cwtauxi
      ON cwtauxi.CodAux = gsaen.CodAux
    WHERE gsaen.Tipo IN ('F','N','D')
      AND gsaen.Folio = @folio
  ),
  calc AS (
    SELECT *,
      ROUND(TotLinea / NULLIF(CantFacturada, 0), 4)                        AS precio_unitario_cobrado,
      ROUND((TotLinea / NULLIF(CantFacturada, 0)) / divisor_historico, 4)  AS precio_unitario_cobrado_hist,
      ROUND(PrecioVta / divisor_historico, 4)                              AS precio_historico_base,
      ROUND((PrecioVta / divisor_historico) * factor_canal, 4)             AS precio_historico_ajustado
    FROM base
  )
  SELECT
    Folio,
    CONVERT(VARCHAR(10), Fecha, 103)                          AS Fecha,
    CodVendedor,
    CanCod,
    Cliente,
    CodProd,
    DesProd,
    CantFacturada,
    TotLinea,
    precio_unitario_cobrado,
    precio_unitario_cobrado_hist,
    precio_historico_base,
    precio_historico_ajustado,
    ROUND(precio_historico_ajustado - precio_unitario_cobrado_hist, 4)      AS descuento_unitario_pesos,
    ROUND(
      (precio_historico_ajustado - precio_unitario_cobrado_hist)
      / NULLIF(precio_historico_ajustado, 0) * 100
    , 2)                                                                    AS pct_descuento,
    ROUND(
      (precio_historico_ajustado - precio_unitario_cobrado_hist) * CantFacturada
    , 0)                                                                    AS descuento_total_pesos
  FROM calc
  ORDER BY CodProd
`);

}



module.exports = {
  getTotalVentas,
  getResumenPorVendedor,
  getClientesPorVendedor,
  getVentas,
  getMontoFolio,
  getDetalleFolio,
};
