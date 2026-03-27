'use strict';

/**
 * routes/dashboard.js
 */

const express             = require('express');
const router              = express.Router();
const { requireAuth }     = require('../middlewares/requireAuth');
const db                  = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');

router.use(requireAuth);

// ── helpers ──────────────────────────────────────────────────────────────────

function getCodigos(usuario) {
  return (usuario.vendedores || []).map(v => v.cod_vendedor);
}

function getCodigosCoordinador(usuario) {
  return (usuario.vendedores || [])
    .filter(v => v.tipo === 'C')
    .map(v => v.cod_vendedor);
}

function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

/**
 * Folios que fueron compartidos AL usuario (como destinatario).
 * Retorna: [{ folio: Number, porcentaje: Number }]
 */
async function getFoliosCompartidosConPct(codigos, mes, anio) {
  if (!codigos.length) return [];
  const placeholders = codigos.map(() => '?').join(',');
  const [rows] = await db.pool.query(
    `SELECT folio, porcentaje
     FROM factura_compartida
     WHERE cod_vendedor_compartido IN (${placeholders})
       AND mes  = ?
       AND anio = ?
       AND rol  = 'compartido'`,
    [...codigos, mes, anio]
  );
  return rows.map(r => ({ folio: Number(r.folio), porcentaje: Number(r.porcentaje) }));
}

/** Solo numeros de folio (compatibilidad con otras funciones) */
async function getFoliosCompartidos(codigos, mes, anio) {
  const lista = await getFoliosCompartidosConPct(codigos, mes, anio);
  return lista.map(r => r.folio);
}

async function getFoliosYaAsignados(codigosCoord, mes, anio) {
  if (!codigosCoord.length) return [];
  const placeholders = codigosCoord.map(() => '?').join(',');
  const [rows] = await db.pool.query(
    `SELECT DISTINCT folio
     FROM factura_compartida
     WHERE cod_vendedor_principal IN (${placeholders})
       AND mes  = ?
       AND anio = ?
       AND rol  = 'compartido'`,
    [...codigosCoord, mes, anio]
  );
  return rows.map(r => Number(r.folio));
}

async function getNombreVendedor(codVendedor) {
  try {
    const [rows] = await db.pool.query(
      `SELECT u.nombre
       FROM usuario_vendedor uv
       INNER JOIN usuario u ON u.id = uv.usuario_id
       WHERE uv.cod_vendedor = ?
       LIMIT 1`,
      [codVendedor]
    );
    return rows.length ? rows[0].nombre : codVendedor;
  } catch {
    return codVendedor;
  }
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

    // Folios compartidos con porcentaje asignado
    const foliosCompPct = await getFoliosCompartidosConPct(codigos, mes, anio);
    const foliosCompNums = foliosCompPct.map(r => r.folio);

    const pool = await getSoftlandPool();

    // Ventas propias (CODIGOs del usuario, EXCLUYE folios compartidos para no sumar doble)
    const resultPropias = await pool.request().query(`
      SELECT
        h.Folio,
        CASE
          WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
          ELSE ROUND(h.SubTotal * 1.10, 0)
        END AS monto
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE h.CodVendedor IN (${mssqlIn(codigos)})
        ${foliosCompNums.length ? `AND h.Folio NOT IN (${foliosCompNums.join(',')})` : ''}
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
    `);

    // Sumar ventas propias
    let totalVentas = resultPropias.recordset.reduce((s, r) => s + (Number(r.monto) || 0), 0);

    // Sumar solo el monto proporcional de cada folio compartido
    if (foliosCompPct.length) {
      const resultComp = await pool.request().query(`
        SELECT
          h.Folio,
          CASE
            WHEN RTRIM(h.CanCod) = '300' THEN h.SubTotal
            ELSE ROUND(h.SubTotal * 1.10, 0)
          END AS monto
        FROM [PRODIN].[softland].[iw_gsaen] h
        WHERE h.Folio IN (${foliosCompNums.join(',')})
          AND h.Tipo IN ('F','N','D')
          AND h.Estado <> 'A'
      `);
      for (const row of resultComp.recordset) {
        const pctInfo = foliosCompPct.find(r => r.folio === Number(row.Folio));
        if (pctInfo) {
          totalVentas += Math.round(Number(row.monto) * pctInfo.porcentaje / 100);
        }
      }
    }

    // Descuento global solo sobre ventas propias
    const codigosForDesc = codigos;
    const extraFoliosDesc = foliosCompNums.length
      ? `OR h.Folio IN (${foliosCompNums.join(',')})`
      : '';
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
        h.CodVendedor IN (${mssqlIn(codigosForDesc)})
        ${extraFoliosDesc}
      )
        AND MONTH(h.Fecha) = ${mes}
        AND YEAR(h.Fecha)  = ${anio}
        AND h.Tipo IN ('F','N','D')
        AND h.Estado <> 'A'
    `);

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
    const foliosCompPct = await getFoliosCompartidosConPct(codigos, mes, anio);
    const foliosComp    = foliosCompPct.map(r => r.folio);
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

    // Inyectar monto_asignado proporcional para folios compartidos
    const ventas = result.recordset.map(v => {
      if (v.es_compartido) {
        const pctInfo = foliosCompPct.find(r => r.folio === Number(v.Folio));
        if (pctInfo) {
          return {
            ...v,
            monto_asignado: Math.round(Number(v.monto) * pctInfo.porcentaje / 100),
            porcentaje_asignado: pctInfo.porcentaje
          };
        }
      }
      return v;
    });

    res.json({ ok: true, ventas });

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
router.get('/compartir/lista', async (req, res) => {
  const usuario      = req.usuario;
  const codigosCoord = getCodigosCoordinador(usuario);
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigosCoord.length) {
    return res.json({ ok: false, error: 'No autorizado para compartir' });
  }

  try {
    const foliosYaAsignados = await getFoliosYaAsignados(codigosCoord, mes, anio);
    const excludeClause = foliosYaAsignados.length
      ? `AND h.Folio NOT IN (${foliosYaAsignados.join(',')})`
      : '';

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
        ${excludeClause}
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
  const codigosCoord = getCodigosCoordinador(usuario);
  const { folio, cod_vendedor_compartido, porcentaje } = req.body;

  if (!folio || !cod_vendedor_compartido || !porcentaje) {
    return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' });
  }
  if (!codigosCoord.length) {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const pool = await getSoftlandPool();
    const resultFolio = await pool.request().query(`
      SELECT TOP 1
        h.Folio,
        h.Fecha,
        h.CodVendedor,
        c.NomAux  AS cliente,
        h.SubTotal,
        h.CanCod
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

    const f         = resultFolio.recordset[0];
    const montoBase = RTRIM(f.CanCod) === '300'
      ? Number(f.SubTotal)
      : Math.round(Number(f.SubTotal) * 1.10);
    const montoNeto     = montoBase;
    const montoAsignado = Math.round(montoNeto * Number(porcentaje) / 100);
    const fechaFolio    = new Date(f.Fecha);

    const nombreVendedorComp = await getNombreVendedor(cod_vendedor_compartido);

    await db.pool.query(
      `INSERT INTO factura_compartida
       (folio, anio, mes, fecha, cliente, monto_neto, monto_asignado, porcentaje, rol,
        cod_vendedor_principal, cod_vendedor_compartido, nombre_vendedor_compartido,
        fecha_registro, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'compartido', ?, ?, ?, NOW(), ?)`,
      [
        String(f.Folio),
        fechaFolio.getFullYear(),
        fechaFolio.getMonth() + 1,
        fechaFolio.toISOString().slice(0, 10),
        f.cliente || '',
        montoNeto,
        montoAsignado,
        Number(porcentaje),
        f.CodVendedor,
        cod_vendedor_compartido,
        nombreVendedorComp,
        usuario.sub
      ]
    );

    res.json({ ok: true, message: 'Folio compartido correctamente' });
  } catch (err) {
    console.error('[POST /dashboard/compartir]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/dashboard/compartidos ───────────────────────────────────────────
// Retorna folios asignados AL usuario (destinatario: cod_vendedor_compartido)
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
        fc.id,
        fc.folio,
        fc.fecha,
        fc.cliente,
        fc.monto_neto,
        fc.monto_asignado,
        fc.porcentaje,
        fc.cod_vendedor_principal,
        fc.cod_vendedor_compartido,
        fc.nombre_vendedor_compartido,
        fc.monto_asignado                              AS monto,
        COALESCE(u.nombre, fc.cod_vendedor_principal)  AS coordinador
      FROM factura_compartida fc
      LEFT JOIN usuario_vendedor uv ON uv.cod_vendedor = fc.cod_vendedor_principal
      LEFT JOIN usuario u            ON u.id = uv.usuario_id
      WHERE fc.cod_vendedor_compartido IN (${placeholders})
        AND fc.mes  = ?
        AND fc.anio = ?
        AND fc.rol  = 'compartido'
      ORDER BY fc.fecha DESC
    `, [...codigos, mes, anio]);

    res.json({ ok: true, compartidos: rows });
  } catch (err) {
    console.error('[GET /dashboard/compartidos]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener compartidos' });
  }
});

// ── GET /api/dashboard/asignados ─────────────────────────────────────────────
// NUEVO: folios que el COORDINADOR asignó a otros (historial de asignaciones enviadas)
router.get('/asignados', async (req, res) => {
  const usuario      = req.usuario;
  const codigosCoord = getCodigosCoordinador(usuario);
  const hoy  = new Date();
  const mes  = parseInt(req.query.mes)  || hoy.getMonth() + 1;
  const anio = parseInt(req.query.anio) || hoy.getFullYear();

  if (!codigosCoord.length) {
    return res.json({ ok: true, asignados: [] });
  }

  try {
    const placeholders = codigosCoord.map(() => '?').join(',');
    const [rows] = await db.pool.query(`
      SELECT
        fc.id,
        fc.folio,
        fc.fecha,
        fc.cliente,
        fc.monto_neto,
        fc.monto_asignado,
        fc.porcentaje,
        fc.cod_vendedor_principal,
        fc.cod_vendedor_compartido,
        fc.nombre_vendedor_compartido
      FROM factura_compartida fc
      WHERE fc.cod_vendedor_principal IN (${placeholders})
        AND fc.mes  = ?
        AND fc.anio = ?
        AND fc.rol  = 'compartido'
      ORDER BY fc.fecha DESC
    `, [...codigosCoord, mes, anio]);

    res.json({ ok: true, asignados: rows });
  } catch (err) {
    console.error('[GET /dashboard/asignados]', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener asignados' });
  }
});

module.exports = router;

function RTRIM(s) { return s ? s.toString().trimEnd() : ''; }
