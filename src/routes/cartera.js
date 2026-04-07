'use strict';

/**
 * routes/cartera.js
 *
 * Endpoint de cartera de clientes segmentada por estado:
 *   - activos:     compraron en los últimos 90 días
 *   - inactivos:   última compra entre 90 y 365 días
 *   - recuperados: estuvieron inactivos y volvieron a comprar
 *
 * Seguridad:
 *   - requireAuth: JWT obligatorio
 *   - El VenCod se obtiene desde usuario_vendedor (MySQL) haciendo
 *     match con los cod_vendedor del usuario logueado, evitando
 *     datos basura o de vendedores ajenos.
 *
 fix/cartera-columnas-contacto
 * Columnas devueltas (desde cwtauxi):
 *   CodAux, NomAux, FonAux1, FonAux2, EMail

 * Columnas devueltas:
 *   activos:     CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, UltimaFactura
 *   inactivos:   CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, DiasInactivo
 *   recuperados: CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, UltimaFactura, DiasRecuperado
 main
 */

const express             = require('express');
const router              = express.Router();
const { requireAuth }     = require('../middlewares/requireAuth');
const db                  = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');

router.use(requireAuth);

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

/**
 * Obtiene los cod_vendedor del usuario logueado haciendo match
 * con la tabla usuario_vendedor de MySQL.
 * Retorna array de strings (códigos de Softland).
 */
async function getCodigosVendedor(usuarioId) {
  const [rows] = await db.pool.query(
    `SELECT cod_vendedor FROM usuario_vendedor WHERE usuario_id = ?`,
    [usuarioId]
  );
  return rows.map(r => r.cod_vendedor).filter(Boolean);
}

// ── GET /api/cartera ──────────────────────────────────────────────────────────
// Retorna: { ok, activos: [], inactivos: [], recuperados: [] }
router.get('/', async (req, res) => {
  const usuario = req.usuario;

  try {
    // 1. Obtener códigos de vendedor propios del usuario logueado
    const codigos = await getCodigosVendedor(usuario.sub);
    if (!codigos.length) {
      return res.json({ ok: true, activos: [], inactivos: [], recuperados: [] });
    }

    const pool = await getSoftlandPool();
    const inClause = mssqlIn(codigos);
    const hoy = new Date();
    const anioActual = hoy.getFullYear();

    // ── ACTIVOS: compraron en los últimos 90 días ─────────────────────────────
 fix/cartera-columnas-contacto
    // Columnas: CodAux, NomAux, FonAux1, FonAux2, EMail

    // Columnas: CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, UltimaFactura
 main
    const resActivos = await pool.request().query(`
      SELECT
        h.CodAux                                  AS CodAux,
        MAX(RTRIM(c.NomAux))                      AS NomAux,
 fix/cartera-columnas-contacto
        MAX(RTRIM(ISNULL(c.FonAux1, '')))         AS FonAux1,
        MAX(RTRIM(ISNULL(c.FonAux2, '')))         AS FonAux2,
        MAX(RTRIM(ISNULL(c.EMail,   '')))         AS EMail

        MAX(RTRIM(c.FONAUX1))                     AS FONAUX1,
        MAX(RTRIM(c.FonAux2))                     AS FonAux2,
        MAX(RTRIM(c.EMail))                       AS EMail,
        COUNT(DISTINCT h.Folio)                   AS TotalCompras,
        MAX(h.Fecha)                              AS UltimaFactura
 main
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.CodVendedor IN (${inClause})
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
        AND h.Fecha >= DATEADD(DAY, -90, GETDATE())
      GROUP BY h.CodAux
      ORDER BY MAX(h.Fecha) DESC
    `);

    // ── INACTIVOS: última compra entre 90 y 365 días ──────────────────────────
 fix/cartera-columnas-contacto
    // Columnas: CodAux, NomAux, FonAux1, FonAux2, EMail

    // Columnas: CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, DiasInactivo
 main
    const resInactivos = await pool.request().query(`
      SELECT
        h.CodAux                                            AS CodAux,
        MAX(RTRIM(c.NomAux))                                AS NomAux,
 fix/cartera-columnas-contacto
        MAX(RTRIM(ISNULL(c.FonAux1, '')))                   AS FonAux1,
        MAX(RTRIM(ISNULL(c.FonAux2, '')))                   AS FonAux2,
        MAX(RTRIM(ISNULL(c.EMail,   '')))                   AS EMail

        MAX(RTRIM(c.FONAUX1))                               AS FONAUX1,
        MAX(RTRIM(c.FonAux2))                               AS FonAux2,
        MAX(RTRIM(c.EMail))                                 AS EMail,
        COUNT(DISTINCT h.Folio)                             AS TotalCompras,
        DATEDIFF(DAY, MAX(h.Fecha), GETDATE())              AS DiasInactivo
 main
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.CodVendedor IN (${inClause})
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
      GROUP BY h.CodAux
      HAVING
        MAX(h.Fecha) >= DATEADD(DAY, -365, GETDATE())
        AND MAX(h.Fecha) < DATEADD(DAY, -90, GETDATE())
        AND h.CodAux NOT IN (
          SELECT CodAux FROM [PRODIN].[softland].[iw_gsaen]
          WHERE CodVendedor IN (${inClause})
            AND Tipo IN ('F','N','D') AND Estado <> 'A'
            AND Fecha >= DATEADD(DAY, -90, GETDATE())
        )
      ORDER BY DATEDIFF(DAY, MAX(h.Fecha), GETDATE()) ASC
    `);

    // ── RECUPERADOS: estuvieron +90 días sin comprar y volvieron este año ─────
 fix/cartera-columnas-contacto
    // Columnas: CodAux, NomAux, FonAux1, FonAux2, EMail

    // Columnas: CodAux, NomAux, FONAUX1, FonAux2, EMail, TotalCompras, UltimaFactura, DiasRecuperado
 main
    const resRecuperados = await pool.request().query(`
      WITH ultima AS (
        SELECT
          h.CodAux,
          MAX(h.Fecha)  AS UltimaFecha
        FROM [PRODIN].[softland].[iw_gsaen] h
        WHERE h.CodVendedor IN (${inClause})
          AND h.Tipo IN ('F','N','D')
          AND h.Estado <> 'A'
        GROUP BY h.CodAux
      ),
      penultima AS (
        SELECT
          h.CodAux,
          MAX(h.Fecha) AS PenultimaFecha
        FROM [PRODIN].[softland].[iw_gsaen] h
        INNER JOIN ultima u ON u.CodAux = h.CodAux
        WHERE h.CodVendedor IN (${inClause})
          AND h.Tipo IN ('F','N','D')
          AND h.Estado <> 'A'
          AND h.Fecha < u.UltimaFecha
        GROUP BY h.CodAux
      )
      SELECT
        u.CodAux                                                  AS CodAux,
        MAX(RTRIM(c.NomAux))                                      AS NomAux,
 fix/cartera-columnas-contacto
        MAX(RTRIM(ISNULL(c.FonAux1, '')))                         AS FonAux1,
        MAX(RTRIM(ISNULL(c.FonAux2, '')))                         AS FonAux2,
        MAX(RTRIM(ISNULL(c.EMail,   '')))                         AS EMail

        MAX(RTRIM(c.FONAUX1))                                     AS FONAUX1,
        MAX(RTRIM(c.FonAux2))                                     AS FonAux2,
        MAX(RTRIM(c.EMail))                                       AS EMail,
        COUNT(DISTINCT h.Folio)                                   AS TotalCompras,
        u.UltimaFecha                                             AS UltimaFactura,
        DATEDIFF(DAY, p.PenultimaFecha, u.UltimaFecha)           AS DiasRecuperado
 main
      FROM ultima u
      INNER JOIN penultima p ON p.CodAux = u.CodAux
      INNER JOIN [PRODIN].[softland].[iw_gsaen] h ON h.CodAux = u.CodAux
      INNER JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = u.CodAux
      WHERE
        YEAR(u.UltimaFecha) = ${anioActual}
        AND DATEDIFF(DAY, p.PenultimaFecha, u.UltimaFecha) > 90
        AND h.CodVendedor IN (${inClause})
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
      GROUP BY u.CodAux, u.UltimaFecha, p.PenultimaFecha
      ORDER BY DATEDIFF(DAY, p.PenultimaFecha, u.UltimaFecha) DESC
    `);

    res.json({
      ok: true,
      activos:     resActivos.recordset,
      inactivos:   resInactivos.recordset,
      recuperados: resRecuperados.recordset
    });

  } catch (err) {
    console.error('[GET /api/cartera]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener cartera' });
  }
});

module.exports = router;
