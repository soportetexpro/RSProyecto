'use strict';

/**
 * routes/dashboard.js
 * GET /api/dashboard/resumen
 * GET /api/dashboard/evolucion
 * GET /api/dashboard/vendedores
 * GET /api/dashboard/ventas-mes
 * GET /api/dashboard/detalle/:folio
 * GET /api/dashboard/compartir/lista
 * POST /api/dashboard/compartir
 * GET /api/dashboard/compartidos
 */

const express             = require('express');
const router              = express.Router();
const { requireAuth }     = require('../middlewares/requireAuth');
const db                  = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');

router.use(requireAuth);

// ── helpers ──────────────────────────────────────────────────────────────────

/** Todos los códigos del usuario (tipo P y C) — para ver sus propias ventas */
function getCodigos(usuario) {
  return (usuario.vendedores || []).map(v => v.cod_vendedor);
}

/** Solo los códigos con tipo = 'C' — para compartir folios como coordinador */
function getCodigosCoordinador(usuario) {
  return (usuario.vendedores || [])
    .filter(v => v.tipo === 'C')
    .map(v => v.cod_vendedor);
}

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

async function getFoliosCompartidos(codigos, mes, anio) {
  if (!codigos.length) return [];
  const placeholders = codigos.map(() => '?').join(',');
  const [rows] = await db.pool.query(
    `SELECT DISTINCT folio
     FROM factura_compartida
     WHERE cod_vendedor_compartido IN (${placeholders})
       AND mes  = ?
       AND anio = ?
       AND rol  = 'compartido'`,
    [...codigos, mes, anio]
  );
  return rows.map(r => Number(r.folio));
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
      return res.json({ ok: true, totalVentas: 0, meta: metaMes, progreso: 0, pctDescuentoGlobal: 0 });
    }

    const foliosComp  = await getFoliosCompartidos(codigos, mes, anio);
    const extraFolios = foliosComp.length ? `OR h.Folio IN (${foliosComp.join(',')})` : '';

    const pool = await getSoftlandPool();

    const resultVentas = await pool.request().query(`
      SELECT
        SUM(
          CASE
            WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
            ELSE ROUND(h.SubTotal * 1.10, 0)
          END
        ) AS totalVentas
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE (
        h.CodVendedor IN (${mssqlIn(codigos)})
        ${extraFolios}
      )
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
    `);

    const resultDesc = await pool.request().query(`
      SELECT
        ROUND(
          AVG(
            CASE
              WHEN m.PreUniMB > 0 AND m.CantFacturada > 0
              THEN (m.PreUniMB - (m.TotLinea / m.CantFacturada)) / m.PreUniMB * 100
              ELSE 0
            END
          )
        , 2) AS pctDescuentoGlobal
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[iw_gmovi] m
        ON m.NroInt = h.NroInt AND m.Tipo = h.Tipo
      WHERE (
        h.CodVendedor IN (${mssqlIn(codigos)})
        ${extraFolios}
      )
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
    `);

    const totalVentas        = Number(resultVentas.recordset[0]?.totalVentas)      || 0;
    const pctDescuentoGlobal = Number(resultDesc.recordset[0]?.pctDescuentoGlobal) || 0;
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
    const foliosComp  = await getFoliosCompartidos(codigos, mes, anio);
    const extraFolios = foliosComp.length ? `OR h.Folio IN (${foliosComp.join(',')})` : '';

    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT
        h.CodVendedor                         AS codVendedor,
        v.VenDes                              AS nombreVendedor,
        COUNT(h.Folio)                        AS folios,
        SUM(
          CASE
            WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
            ELSE ROUND(h.SubTotal * 1.10, 0)
          END
        )                                     AS totalVentas
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtvend] v
        ON v.VenCod = h.CodVendedor
      WHERE (
        h.CodVendedor IN (${mssqlIn(codigos)})
        ${extraFolios}
      )
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
      GROUP BY h.CodVendedor, v.VenDes
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
    const foliosComp    = await getFoliosCompartidos(codigos, mes, anio);
    const extraFolios   = foliosComp.length ? `OR h.Folio IN (${foliosComp.join(',')})` : '';
    const foliosCompSet = foliosComp.length ? `h.Folio IN (${foliosComp.join(',')})` : `1 = 0`;

    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT TOP 100
        h.Folio,
        CONVERT(varchar, h.Fecha, 103)   AS fecha_formato,
        c.NomAux                         AS cliente,
        h.CodVendedor,
        CASE
          WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
          ELSE ROUND(h.SubTotal * 1.10, 0)
        END                              AS monto,
        ROUND(
          SUM(
            CASE
              WHEN m.PreUniMB > 0 AND m.CantFacturada > 0
              THEN (m.PreUniMB - (m.TotLinea / m.CantFacturada)) / m.PreUniMB * 100
              ELSE 0
            END
          ) / NULLIF(COUNT(m.Linea), 0)
        , 2)                             AS pct_descuento,
        CASE WHEN ${foliosCompSet} THEN 1 ELSE 0 END AS es_compartido
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c  ON c.CodAux = h.CodAux
      LEFT JOIN [PRODIN].[softland].[iw_gmovi] m ON m.NroInt = h.NroInt AND m.Tipo = h.Tipo
      WHERE (
        h.CodVendedor IN (${mssqlIn(codigos)})
        ${extraFolios}
      )
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

// ── GET /api/dashboard/detalle/:folio ────────────────────────────────────────
router.get('/detalle/:folio', async (req, res) => {
  const folio = parseInt(req.params.folio);
  if (!folio) return res.status(400).json({ ok: false, error: 'Folio inválido' });

  try {
    const pool   = await getSoftlandPool();
    const result = await pool.request().query(`
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
          AND gsaen.Folio = ${folio}
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
        precio_historico_ajustado,
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
    res.json({ ok: true, folio, detalle: result.recordset });

  } catch (err) {
    console.error('[GET /api/dashboard/detalle]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener detalle del folio' });
  }
});

// ── GET /api/dashboard/compartir/lista ───────────────────────────────────────
// Solo trae folios de los códigos con tipo = 'C' en usuario_vendedor
router.get('/compartir/lista', async (req, res) => {
  const usuario         = req.usuario;
  const codigosCoord    = getCodigosCoordinador(usuario); // solo tipo C
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  // Si no tiene ningún código tipo C, no es coordinador
  if (!codigosCoord.length) {
    return res.json({ ok: false, error: 'No autorizado para compartir' });
  }

  try {
    const pool = await getSoftlandPool();
    const result = await pool.request().query(`
      SELECT TOP 200
        h.Folio,
        CONVERT(varchar, h.Fecha, 103)  AS fecha_formato,
        c.NomAux                        AS cliente,
        CASE
          WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
          ELSE ROUND(h.SubTotal * 1.10, 0)
        END                             AS monto,
        h.CodVendedor
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.CodVendedor IN (${mssqlIn(codigosCoord)})
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
      ORDER BY h.Fecha DESC
    `);
    res.json({ ok: true, folios: result.recordset });
  } catch (err) {
    console.error('[GET /dashboard/compartir/lista]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener folios' });
  }
});

// ── POST /api/dashboard/compartir ────────────────────────────────────────────
router.post('/compartir', async (req, res) => {
  const usuario      = req.usuario;
  const codigosCoord = getCodigosCoordinador(usuario); // solo tipo C
  const { folio, cod_vendedor_compartido, porcentaje } = req.body;

  if (!folio || !cod_vendedor_compartido || !porcentaje) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' });
  }

  // Validar que tiene al menos un código tipo C
  if (!codigosCoord.length) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const pool = await getSoftlandPool();
    // Verificar que el folio pertenece a uno de sus códigos tipo C
    const resultFolio = await pool.request().query(`
      SELECT TOP 1
        h.Folio,
        h.Fecha,
        c.NomAux  AS cliente,
        h.SubTotal,
        h.CanCod,
        CASE
          WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
          ELSE ROUND(h.SubTotal * 1.10, 0)
        END AS monto_con_iva
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux = h.CodAux
      WHERE h.Folio = ${parseInt(folio)}
        AND h.CodVendedor IN (${mssqlIn(codigosCoord)})
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
    `);

    if (!resultFolio.recordset.length) {
      return res.status(404).json({ ok: false, error: 'Folio no encontrado o no autorizado' });
    }

    const f             = resultFolio.recordset[0];
    const montoNeto     = Number(f.SubTotal);
    const montoAsignado = Math.round(montoNeto * Number(porcentaje) / 100);
    const fechaFolio    = new Date(f.Fecha);

    const [uvRows] = await db.pool.query(
      `SELECT nombre_vendedor FROM usuario_vendedor WHERE cod_vendedor = ? LIMIT 1`,
      [cod_vendedor_compartido]
    );
    const nombreVendedorComp = uvRows.length ? uvRows[0].nombre_vendedor : cod_vendedor_compartido;

    const [rows] = await db.pool.query(
      `INSERT INTO factura_compartida
       (folio, anio, mes, fecha, cliente, monto_neto, monto_asignado, porcentaje, rol,
        cod_vendedor_principal, cod_vendedor_compartido, nombre_vendedor_compartido,
        fecha_registro, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'compartido', ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         monto_asignado = VALUES(monto_asignado),
         porcentaje     = VALUES(porcentaje),
         fecha_registro = NOW()`,
      [
        f.Folio,
        fechaFolio.getFullYear(),
        fechaFolio.getMonth() + 1,
        fechaFolio,
        f.cliente,
        montoNeto,
        montoAsignado,
        Number(porcentaje),
        f.CanCod,
        cod_vendedor_compartido,
        nombreVendedorComp,
        usuario.sub
      ]
    );

    res.json({ ok: true, id: rows.insertId, message: 'Folio compartido correctamente' });
  } catch (err) {
    console.error('[POST /dashboard/compartir]', err.message);
    res.status(500).json({ ok: false, error: 'Error al compartir folio' });
  }
});

// ── GET /api/dashboard/compartidos ───────────────────────────────────────────
router.get('/compartidos', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigos.length) return res.json({ ok: true, compartidos: [] });

  try {
    const placeholders = codigos.map(() => '?').join(',');
    const [rows] = await db.pool.query(`
      SELECT
        fc.*,
        fc.monto_asignado                    AS monto,
        COALESCE(uv.nombre_vendedor, fc.cod_vendedor_principal) AS coordinador
      FROM factura_compartida fc
      LEFT JOIN usuario_vendedor uv ON uv.cod_vendedor = fc.cod_vendedor_principal
      WHERE fc.cod_vendedor_compartido IN (${placeholders})
        AND fc.anio = ?
        AND fc.mes  = ?
        AND fc.rol  = 'compartido'
      ORDER BY fc.fecha DESC
    `, [...codigos, anio, mes]);

    res.json({ ok: true, compartidos: rows });
  } catch (err) {
    console.error('[GET /dashboard/compartidos]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener compartidos' });
  }
});

module.exports = router;
