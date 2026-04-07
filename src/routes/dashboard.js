'use strict';

/**
 * routes/dashboard.js
 *
 * API del dashboard principal de ventas.
 *
 * Responsabilidades:
 *   - Calcular KPIs de ventas/meta/progreso/descuento
 *   - Entregar evolución mensual
 *   - Administrar flujo de facturas compartidas (coordinadores)
 *   - Disparar notificaciones de meta cumplida/superada
 *
 * Origen de información:
 *   - MySQL: vendedor_meta, factura_compartida, usuario, usuario_vendedor
 *   - SQL Server Softland: documentos comerciales y detalle de líneas
 *
 * Seguridad:
 *   router.use(requireAuth) para requerir JWT en todos los endpoints.
 *   T-01: validateFolio, validateCodVendedor, validatePorcentaje aplicados
 *         en endpoints que reciben parámetros de req.params / req.body.
 */

const express             = require('express');
const router              = express.Router();
const { requireAuth }     = require('../middlewares/requireAuth');
const db                  = require('../config/db');
const { getSoftlandPool } = require('../config/db.softland');
const notificacionModel   = require('../models/notificacion');
const {
  validateFolio,
  validateCodVendedor,
  validatePorcentaje,
  validateId,
} = require('../utils/validators');

router.use(requireAuth);

// ── helpers ───────────────────────────────────────────────────────────────────

function RTRIM(s) { return s ? s.toString().trimEnd() : ''; }

function getCodigos(usuario) {
  return (usuario.vendedores || []).map(v => v.cod_vendedor);
}

function getCodigosCoordinador(usuario) {
  return (usuario.vendedores || [])
    .filter(v => v.tipo === 'C')
    .map(v => v.cod_vendedor);
}

/**
 * mssqlIn(arr) — construye lista SQL segura para IN (...).
 * Los códigos de vendedor ya pasaron por validateCodVendedor() al ser cargados
 * desde la BD en el token JWT (login), por lo que son alfanuméricos seguros.
 * El parámetro adicional cod_vendedor_compartido del body se valida en cada
 * endpoint con validateCodVendedor() antes de llegar aquí.
 */
function mssqlIn(arr) {
  return arr.map(v => `'${v}'`).join(',');
}

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
      `SELECT u.nombre FROM usuario_vendedor uv
       INNER JOIN usuario u ON u.id = uv.usuario_id
       WHERE uv.cod_vendedor = ? LIMIT 1`,
      [codVendedor]
    );
    return rows.length ? rows[0].nombre : codVendedor;
  } catch { return codVendedor; }
}

// ── GET /api/dashboard/resumen ─────────────────────────────────────────
router.get('/resumen', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy  = new Date();
  const { validarMesAnio } = require('../utils/stringHelpers');
  let mes, anio;
  try {
    ({ mes, anio } = validarMesAnio(req.query.mes ?? (hoy.getMonth() + 1), req.query.anio ?? hoy.getFullYear()));
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  try {
    const [metaRows] = await db.pool.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id = ? AND YEAR(fecha) = ? LIMIT 1`,
      [usuario.sub, anio]
    );
    const metaMes = metaRows.length ? Number(metaRows[0].meta) : 0;

    if (!codigos.length) {
      return res.json({ ok: true, totalVentas: 0, meta: metaMes, progreso: 0, pctDescuentoGlobal: 0 });
    }

    const foliosCompPct  = await getFoliosCompartidosConPct(codigos, mes, anio);
    const foliosCompNums = foliosCompPct.map(r => r.folio);
    const pool = await getSoftlandPool();

    const resultPropias = await pool.request().query(`
      SELECT h.Folio,
        CASE WHEN RTRIM(h.CanCod)='300' THEN h.SubTotal
             ELSE ROUND(h.SubTotal*1.10,0) END AS monto
      FROM [PRODIN].[softland].[iw_gsaen] h
      WHERE h.CodVendedor IN (${mssqlIn(codigos)})
        ${foliosCompNums.length ? `AND h.Folio NOT IN (${foliosCompNums.join(',')})` : ''}
        AND MONTH(h.Fecha)=${mes} AND YEAR(h.Fecha)=${anio}
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
    `);

    let totalVentas = resultPropias.recordset.reduce((s,r)=>s+(Number(r.monto)||0), 0);

    if (foliosCompPct.length) {
      const resultComp = await pool.request().query(`
        SELECT h.Folio,
          CASE WHEN RTRIM(h.CanCod)='300' THEN h.SubTotal
               ELSE ROUND(h.SubTotal*1.10,0) END AS monto
        FROM [PRODIN].[softland].[iw_gsaen] h
        WHERE h.Folio IN (${foliosCompNums.join(',')})
          AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
      `);
      for (const row of resultComp.recordset) {
        const pctInfo = foliosCompPct.find(r=>r.folio===Number(row.Folio));
        if (pctInfo) totalVentas += Math.round(Number(row.monto)*pctInfo.porcentaje/100);
      }
    }

    const extraFoliosDesc = foliosCompNums.length ? `OR h.Folio IN (${foliosCompNums.join(',')})` : '';
    const resultDesc = await pool.request().query(`
      SELECT ROUND(AVG(
        CASE WHEN m.PreUniMB>0 AND m.CantFacturada>0
             THEN (m.PreUniMB-(m.TotLinea/m.CantFacturada))/m.PreUniMB*100
             ELSE 0 END),2) AS pctDescuentoGlobal
      FROM [PRODIN].[softland].[iw_gsaen] h
      INNER JOIN [PRODIN].[softland].[iw_gmovi] m ON m.NroInt=h.NroInt AND m.Tipo=h.Tipo
      WHERE (h.CodVendedor IN (${mssqlIn(codigos)}) ${extraFoliosDesc})
        AND MONTH(h.Fecha)=${mes} AND YEAR(h.Fecha)=${anio}
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
    `);

    const pctDescuentoGlobal = Number(resultDesc.recordset[0]?.pctDescuentoGlobal)||0;
    const progreso = metaMes>0 ? Math.min(Math.round((totalVentas/metaMes)*100),999) : 0;

    const mesActual=hoy.getMonth()+1, anioActual=hoy.getFullYear();
    if (mes===mesActual && anio===anioActual && metaMes>0) {
      if (progreso>=110) notificacionModel.notificarMetaSuperada({usuarioId:usuario.sub,mes,anio,progreso}).catch(e=>console.error('[notif]',e.message));
      else if (progreso>=100) notificacionModel.notificarMetaCumplida({usuarioId:usuario.sub,mes,anio}).catch(e=>console.error('[notif]',e.message));
    }

    res.json({ ok:true, totalVentas, meta:metaMes, progreso, pctDescuentoGlobal });
  } catch (err) {
    console.error('[GET /api/dashboard/resumen]', err.message);
    res.status(500).json({ ok:false, error:'Error al obtener resumen' });
  }
});

// ── GET /api/dashboard/evolucion ────────────────────────────────────────
router.get('/evolucion', async (req, res) => {
  const usuario = req.usuario;
  const codigos = getCodigos(usuario);
  const hoy  = new Date();
  const { validarMesAnio } = require('../utils/stringHelpers');
  let anio;
  try {
    ({ anio } = validarMesAnio(1, req.query.anio ?? hoy.getFullYear()));
  } catch (err) { return res.status(400).json({ ok:false, error:err.message }); }

  try {
    const [metaRows] = await db.pool.query(
      `SELECT meta FROM vendedor_meta WHERE usuario_id=? AND YEAR(fecha)=? LIMIT 1`,
      [usuario.sub, anio]
    );
    const metaMes = metaRows.length ? Number(metaRows[0].meta) : 0;
    if (!codigos.length) {
      return res.json({ ok:true, evolucion:Array.from({length:12},(_,i)=>({mes:i+1,ventas:0,meta:metaMes})) });
    }

    const placeholders = codigos.map(()=>'?').join(',');
    const [compRows] = await db.pool.query(
      `SELECT folio,mes,porcentaje FROM factura_compartida
       WHERE cod_vendedor_compartido IN (${placeholders}) AND anio=? AND rol='compartido'`,
      [...codigos, anio]
    );
    const compPorMes = {};
    compRows.forEach(r=>{ const m=Number(r.mes); if(!compPorMes[m])compPorMes[m]=[]; compPorMes[m].push({folio:Number(r.folio),porcentaje:Number(r.porcentaje)}); });
    const todosLosCompFolios=[...new Set(compRows.map(r=>Number(r.folio)))];
    const pool=await getSoftlandPool();
    const excludeComp=todosLosCompFolios.length?`AND Folio NOT IN (${todosLosCompFolios.join(',')})` : '';

    const resultPropias=await pool.request().query(`
      SELECT MONTH(Fecha) AS mes,
        SUM(CASE WHEN RTRIM(CanCod)='300' THEN SubTotal ELSE ROUND(SubTotal*1.10,0) END) AS ventas
      FROM [PRODIN].[softland].[iw_gsaen]
      WHERE CodVendedor IN (${mssqlIn(codigos)}) AND YEAR(Fecha)=${anio}
        AND Tipo IN ('F','N','D') AND Estado<>'A' ${excludeComp}
      GROUP BY MONTH(Fecha) ORDER BY mes
    `);
    const ventasPorMes={};
    resultPropias.recordset.forEach(r=>{ventasPorMes[r.mes]=Number(r.ventas)||0;});

    if (todosLosCompFolios.length) {
      const resultComp=await pool.request().query(`
        SELECT MONTH(Fecha) AS mes,Folio,
          CASE WHEN RTRIM(CanCod)='300' THEN SubTotal ELSE ROUND(SubTotal*1.10,0) END AS monto
        FROM [PRODIN].[softland].[iw_gsaen]
        WHERE Folio IN (${todosLosCompFolios.join(',')}) AND YEAR(Fecha)=${anio}
          AND Tipo IN ('F','N','D') AND Estado<>'A'
      `);
      for (const row of resultComp.recordset) {
        const mesNum=Number(row.mes);
        const pctInfo=(compPorMes[mesNum]||[]).find(r=>r.folio===Number(row.Folio));
        if (pctInfo) ventasPorMes[mesNum]=(ventasPorMes[mesNum]||0)+Math.round(Number(row.monto)*pctInfo.porcentaje/100);
      }
    }
    res.json({ ok:true, evolucion:Array.from({length:12},(_,i)=>({mes:i+1,ventas:ventasPorMes[i+1]||0,meta:metaMes})) });
  } catch (err) {
    console.error('[GET /api/dashboard/evolucion]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener evolución'});
  }
});

// ── GET /api/dashboard/vendedores ──────────────────────────────────────
router.get('/vendedores', async (req, res) => {
  const usuario=req.usuario, codigos=getCodigos(usuario), hoy=new Date();
  const { validarMesAnio }=require('../utils/stringHelpers');
  let mes,anio;
  try { ({mes,anio}=validarMesAnio(req.query.mes??(hoy.getMonth()+1),req.query.anio??hoy.getFullYear())); }
  catch(err){return res.status(400).json({ok:false,error:err.message});}
  if(!codigos.length) return res.json({ok:true,vendedores:[]});
  try {
    const foliosComp=await getFoliosCompartidos(codigos,mes,anio);
    const extraFolios=foliosComp.length?`OR h.Folio IN (${foliosComp.join(',')})` : '';
    const pool=await getSoftlandPool();
    const result=await pool.request().query(`
      SELECT h.CodVendedor AS codVendedor,v.VenDes AS nombreVendedor,COUNT(h.Folio) AS folios,
        SUM(CASE WHEN RTRIM(h.CanCod)='300' THEN h.SubTotal ELSE ROUND(h.SubTotal*1.10,0) END) AS totalVentas
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtvend] v ON v.VenCod=h.CodVendedor
      WHERE (h.CodVendedor IN (${mssqlIn(codigos)}) ${extraFolios})
        AND MONTH(h.Fecha)=${mes} AND YEAR(h.Fecha)=${anio}
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
      GROUP BY h.CodVendedor,v.VenDes ORDER BY totalVentas DESC
    `);
    const prom=result.recordset.map(async v=>({...v,totalDescuento:0}));
    res.json({ok:true,vendedores:await Promise.all(prom)});
  } catch(err){
    console.error('[GET /api/dashboard/vendedores]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener vendedores'});
  }
});

// ── GET /api/dashboard/vendedores-todos ───────────────────────────────
router.get('/vendedores-todos', async (req,res) => {
  try {
    const [rows]=await db.pool.query(`
      SELECT u.codigo AS cod,u.nombre AS nombre FROM usuario u
      INNER JOIN usuario_vendedor uv ON uv.usuario_id=u.id AND uv.cod_vendedor=u.codigo
      WHERE uv.tipo<>'C' AND u.is_active=1 ORDER BY u.nombre
    `);
    res.json({ok:true,vendedores:rows});
  } catch(err){
    console.error('[GET /api/dashboard/vendedores-todos]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener vendedores'});
  }
});

// ── GET /api/dashboard/ventas-mes ──────────────────────────────────────
router.get('/ventas-mes', async (req,res) => {
  const usuario=req.usuario, codigos=getCodigos(usuario), hoy=new Date();
  const { validarMesAnio }=require('../utils/stringHelpers');
  let mes,anio;
  try { ({mes,anio}=validarMesAnio(req.query.mes??(hoy.getMonth()+1),req.query.anio??hoy.getFullYear())); }
  catch(err){return res.status(400).json({ok:false,error:err.message});}
  if(!codigos.length) return res.json({ok:true,ventas:[]});
  try {
    const foliosCompPct=await getFoliosCompartidosConPct(codigos,mes,anio);
    const foliosComp=foliosCompPct.map(r=>r.folio);
    const extraFolios=foliosComp.length?`OR h.Folio IN (${foliosComp.join(',')})` : '';
    const foliosCompSet=foliosComp.length?`h.Folio IN (${foliosComp.join(',')})`:`1=0`;
    const pool=await getSoftlandPool();
    const result=await pool.request().query(`
      SELECT TOP 100 h.Folio,CONVERT(varchar,h.Fecha,103) AS fecha_formato,
        c.NomAux AS cliente,h.CodVendedor,
        CASE WHEN RTRIM(h.CanCod)='300' THEN h.SubTotal ELSE ROUND(h.SubTotal*1.10,0) END AS monto,
        ROUND(SUM(CASE WHEN m.PreUniMB>0 AND m.CantFacturada>0
          THEN (m.PreUniMB-(m.TotLinea/m.CantFacturada))/m.PreUniMB*100 ELSE 0 END)
          /NULLIF(COUNT(m.Linea),0),2) AS pct_descuento,
        CASE WHEN ${foliosCompSet} THEN 1 ELSE 0 END AS es_compartido
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux=h.CodAux
      LEFT JOIN [PRODIN].[softland].[iw_gmovi] m ON m.NroInt=h.NroInt AND m.Tipo=h.Tipo
      WHERE (h.CodVendedor IN (${mssqlIn(codigos)}) ${extraFolios})
        AND MONTH(h.Fecha)=${mes} AND YEAR(h.Fecha)=${anio}
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
      GROUP BY h.Folio,h.Fecha,c.NomAux,h.CodVendedor,h.SubTotal,h.NroInt,h.CanCod
      ORDER BY h.Fecha DESC
    `);
    const ventas=result.recordset.map(v=>{
      if(v.es_compartido){const pctInfo=foliosCompPct.find(r=>r.folio===Number(v.Folio));if(pctInfo)return{...v,monto_asignado:Math.round(Number(v.monto)*pctInfo.porcentaje/100),porcentaje_asignado:pctInfo.porcentaje};}
      return v;
    });
    res.json({ok:true,ventas});
  } catch(err){
    console.error('[GET /api/dashboard/ventas-mes]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener ventas del mes'});
  }
});

// ── GET /api/dashboard/detalle/:folio — T-01 validateFolio ──────────────
router.get('/detalle/:folio', async (req,res) => {
  let folio;
  try { folio=validateFolio(req.params.folio); }
  catch(err){ return res.status(400).json({ok:false,error:err.message}); }

  try {
    const pool=await getSoftlandPool();
    const result=await pool.request().query(`
      WITH base AS (
        SELECT gsaen.Folio,gsaen.Fecha,gsaen.CodVendedor,gsaen.CanCod,
          cwtauxi.nomAux AS Cliente,gmovi.CodProd,tprod.DesProd,gmovi.CantFacturada,
          gmovi.TotLinea,tprod.PrecioVta,
          CASE WHEN gsaen.Fecha<'2023-03-01' THEN(1.07*1.07*1.05*1.17)
               WHEN gsaen.Fecha<'2024-03-01' THEN(1.07*1.07*1.05)
               WHEN gsaen.Fecha<'2025-03-01' THEN(1.07*1.07)
               WHEN gsaen.Fecha<'2026-03-01' THEN(1.07)
               ELSE 1.0 END AS divisor_historico,
          CASE WHEN gsaen.CanCod<>'300' THEN 1.10 ELSE 1.0 END AS factor_canal
        FROM [PRODIN].[softland].[iw_gmovi] gmovi
        INNER JOIN [PRODIN].[softland].[iw_gsaen] gsaen ON gsaen.NroInt=gmovi.NroInt AND gsaen.Tipo=gmovi.Tipo
        INNER JOIN [PRODIN].[softland].[iw_tprod] tprod ON tprod.CodProd=gmovi.CodProd
        INNER JOIN [PRODIN].[softland].[cwtauxi] cwtauxi ON cwtauxi.CodAux=gsaen.CodAux
        WHERE gsaen.Tipo IN ('F','N','D') AND gsaen.Folio=${folio}
      ),
      calc AS (
        SELECT *,
          ROUND(TotLinea/NULLIF(CantFacturada,0),4) AS precio_unitario_cobrado,
          ROUND((TotLinea/NULLIF(CantFacturada,0))/divisor_historico,4) AS precio_unitario_cobrado_hist,
          ROUND(PrecioVta/divisor_historico,4) AS precio_historico_base,
          ROUND((PrecioVta/divisor_historico)*factor_canal,4) AS precio_historico_ajustado
        FROM base
      )
      SELECT Folio,CONVERT(VARCHAR(10),Fecha,103) AS Fecha,CodVendedor,CanCod,Cliente,
        CodProd,DesProd,CantFacturada,TotLinea,precio_unitario_cobrado,precio_historico_ajustado,
        ROUND((precio_historico_ajustado-precio_unitario_cobrado_hist)/NULLIF(precio_historico_ajustado,0)*100,2) AS pct_descuento,
        ROUND((precio_historico_ajustado-precio_unitario_cobrado_hist)*CantFacturada,0) AS descuento_total_pesos
      FROM calc ORDER BY CodProd
    `);
    res.json({ok:true,folio,detalle:result.recordset});
  } catch(err){
    console.error('[GET /api/dashboard/detalle]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener detalle del folio'});
  }
});

// ── GET /api/dashboard/compartir/lista ─────────────────────────────────
router.get('/compartir/lista', async (req,res) => {
  const usuario=req.usuario, codigosCoord=getCodigosCoordinador(usuario), hoy=new Date();
  const { validarMesAnio }=require('../utils/stringHelpers');
  let mes,anio;
  try { ({mes,anio}=validarMesAnio(req.query.mes??(hoy.getMonth()+1),req.query.anio??hoy.getFullYear())); }
  catch(err){return res.status(400).json({ok:false,error:err.message});}
  if(!codigosCoord.length) return res.json({ok:false,error:'No autorizado para compartir'});
  try {
    const foliosYaAsignados=await getFoliosYaAsignados(codigosCoord,mes,anio);
    const excludeClause=foliosYaAsignados.length?`AND h.Folio NOT IN (${foliosYaAsignados.join(',')})` : '';
    const pool=await getSoftlandPool();
    const result=await pool.request().query(`
      SELECT TOP 200 h.Folio,CONVERT(varchar,h.Fecha,103) AS fecha_formato,c.NomAux AS cliente,
        CASE WHEN RTRIM(h.CanCod)='300' THEN h.SubTotal ELSE ROUND(h.SubTotal*1.10,0) END AS monto,
        h.CodVendedor
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux=h.CodAux
      WHERE h.CodVendedor IN (${mssqlIn(codigosCoord)})
        AND MONTH(h.Fecha)=${mes} AND YEAR(h.Fecha)=${anio}
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A' ${excludeClause}
      ORDER BY h.Fecha DESC
    `);
    res.json({ok:true,folios:result.recordset});
  } catch(err){
    console.error('[GET /dashboard/compartir/lista]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener folios'});
  }
});

// ── POST /api/dashboard/compartir — T-01 validateCodVendedor + validatePorcentaje
router.post('/compartir', async (req,res) => {
  const usuario=req.usuario, codigosCoord=getCodigosCoordinador(usuario);
  let folio, cod_vendedor_compartido, porcentaje;
  try {
    folio                  = validateFolio(req.body.folio);
    cod_vendedor_compartido = validateCodVendedor(req.body.cod_vendedor_compartido);
    porcentaje             = validatePorcentaje(req.body.porcentaje);
  } catch(err){ return res.status(400).json({ok:false,error:err.message}); }
  if(!codigosCoord.length) return res.status(403).json({ok:false,error:'No autorizado'});
  try {
    const pool=await getSoftlandPool();
    const resultFolio=await pool.request().query(`
      SELECT TOP 1 h.Folio,h.Fecha,h.CodVendedor,c.NomAux AS cliente,h.SubTotal,h.CanCod
      FROM [PRODIN].[softland].[iw_gsaen] h
      LEFT JOIN [PRODIN].[softland].[cwtauxi] c ON c.CodAux=h.CodAux
      WHERE h.Folio=${folio} AND h.CodVendedor IN (${mssqlIn(codigosCoord)})
        AND h.Tipo IN ('F','N','D') AND h.Estado<>'A'
    `);
    if(!resultFolio.recordset.length) return res.status(404).json({ok:false,error:'Folio no encontrado o no autorizado'});
    const f=resultFolio.recordset[0];
    const montoBase=RTRIM(f.CanCod)==='300'?Number(f.SubTotal):Math.round(Number(f.SubTotal)*1.10);
    const montoAsignado=Math.round(montoBase*porcentaje/100);
    const fechaFolio=new Date(f.Fecha);
    const mesF=fechaFolio.getMonth()+1, anioF=fechaFolio.getFullYear();
    const nombreVendedorComp=await getNombreVendedor(cod_vendedor_compartido);
    const nombreCoordinador=usuario.nombre||`Coordinador (${f.CodVendedor})`;
    await db.pool.query(
      `INSERT INTO factura_compartida(folio,anio,mes,fecha,cliente,monto_neto,monto_asignado,porcentaje,rol,
        cod_vendedor_principal,cod_vendedor_compartido,nombre_vendedor_compartido,fecha_registro,usuario_id)
       VALUES(?,?,?,?,?,?,?,?,'compartido',?,?,?,NOW(),?)`,
      [String(f.Folio),anioF,mesF,fechaFolio.toISOString().slice(0,10),f.cliente||'',
       montoBase,montoAsignado,porcentaje,f.CodVendedor,cod_vendedor_compartido,nombreVendedorComp,usuario.sub]
    );
    const usuarioIdReceptor=await notificacionModel.usuarioIdDesdeCodVendedor(cod_vendedor_compartido);
    if(usuarioIdReceptor){
      notificacionModel.notificarFolioRecibido({usuarioIdReceptor,folio:Number(f.Folio),cliente:f.cliente||'',monto:montoAsignado,porcentaje,nombreCoordinador,mes:mesF,anio:anioF}).catch(e=>console.error('[notif]',e.message));
    }
    notificacionModel.notificarFolioAsignado({usuarioIdCoordinador:usuario.sub,folio:Number(f.Folio),cliente:f.cliente||'',nombreVendedor:nombreVendedorComp,porcentaje,mes:mesF,anio:anioF}).catch(e=>console.error('[notif]',e.message));
    res.json({ok:true,message:'Folio compartido correctamente'});
  } catch(err){
    console.error('[POST /dashboard/compartir]',err.message);
    res.status(500).json({ok:false,error:err.message});
  }
});

// ── PUT /api/dashboard/compartir/:id — T-01 validateId + validateCodVendedor
router.put('/compartir/:id', async (req,res) => {
  const usuario=req.usuario, codigosCoord=getCodigosCoordinador(usuario);
  let id, cod_vendedor_compartido, porcentaje;
  try {
    id                     = validateId(req.params.id);
    cod_vendedor_compartido = validateCodVendedor(req.body.cod_vendedor_compartido);
    porcentaje             = validatePorcentaje(req.body.porcentaje);
  } catch(err){ return res.status(400).json({ok:false,error:err.message}); }
  if(!codigosCoord.length) return res.status(403).json({ok:false,error:'No autorizado'});
  try {
    const [rows]=await db.pool.query(
      `SELECT id,monto_neto,folio,cliente,mes,anio FROM factura_compartida
       WHERE id=? AND cod_vendedor_principal IN (${codigosCoord.map(()=>'?').join(',')}) LIMIT 1`,
      [id,...codigosCoord]
    );
    if(!rows.length) return res.status(404).json({ok:false,error:'Asignación no encontrada'});
    const reg=rows[0];
    const montoAsignado=Math.round(Number(reg.monto_neto)*porcentaje/100);
    const nombreVendedorComp=await getNombreVendedor(cod_vendedor_compartido);
    await db.pool.query(
      `UPDATE factura_compartida SET cod_vendedor_compartido=?,nombre_vendedor_compartido=?,porcentaje=?,monto_asignado=? WHERE id=?`,
      [cod_vendedor_compartido,nombreVendedorComp,porcentaje,montoAsignado,id]
    );
    const usuarioIdReceptor=await notificacionModel.usuarioIdDesdeCodVendedor(cod_vendedor_compartido);
    if(usuarioIdReceptor){
      notificacionModel.notificarFolioRecibido({usuarioIdReceptor,folio:Number(reg.folio),cliente:reg.cliente||'',monto:montoAsignado,porcentaje,nombreCoordinador:usuario.nombre||'Coordinador',mes:Number(reg.mes),anio:Number(reg.anio)}).catch(e=>console.error('[notif]',e.message));
    }
    notificacionModel.notificarFolioAsignado({usuarioIdCoordinador:usuario.sub,folio:Number(reg.folio),cliente:reg.cliente||'',nombreVendedor:nombreVendedorComp,porcentaje,mes:Number(reg.mes),anio:Number(reg.anio)}).catch(e=>console.error('[notif]',e.message));
    res.json({ok:true,message:'Asignación actualizada'});
  } catch(err){
    console.error('[PUT /dashboard/compartir/:id]',err.message);
    res.status(500).json({ok:false,error:err.message});
  }
});

// ── DELETE /api/dashboard/compartir/:id ──────────────────────────────────
router.delete('/compartir/:id', async (req,res) => {
  const usuario=req.usuario, codigosCoord=getCodigosCoordinador(usuario);
  let id;
  try { id=validateId(req.params.id); }
  catch(err){ return res.status(400).json({ok:false,error:err.message}); }
  if(!codigosCoord.length) return res.status(403).json({ok:false,error:'No autorizado'});
  try {
    const [rows]=await db.pool.query(
      `SELECT id FROM factura_compartida WHERE id=? AND cod_vendedor_principal IN (${codigosCoord.map(()=>'?').join(',')}) LIMIT 1`,
      [id,...codigosCoord]
    );
    if(!rows.length) return res.status(404).json({ok:false,error:'Asignación no encontrada o sin permiso'});
    await db.pool.query('DELETE FROM factura_compartida WHERE id=?',[id]);
    res.json({ok:true,message:'Asignación eliminada. El folio está disponible nuevamente.'});
  } catch(err){
    console.error('[DELETE /dashboard/compartir/:id]',err.message);
    res.status(500).json({ok:false,error:err.message});
  }
});

// ── GET /api/dashboard/compartidos ───────────────────────────────────────
router.get('/compartidos', async (req,res) => {
  const usuario=req.usuario, codigos=getCodigos(usuario), hoy=new Date();
  const { validarMesAnio }=require('../utils/stringHelpers');
  let mes,anio;
  try { ({mes,anio}=validarMesAnio(req.query.mes??(hoy.getMonth()+1),req.query.anio??hoy.getFullYear())); }
  catch(err){return res.status(400).json({ok:false,error:err.message});}
  if(!codigos.length) return res.json({ok:true,compartidos:[]});
  try {
    const ph=codigos.map(()=>'?').join(',');
    const [rows]=await db.pool.query(`
      SELECT fc.id,fc.folio,fc.fecha,fc.cliente,fc.monto_neto,fc.monto_asignado,fc.porcentaje,
        fc.cod_vendedor_principal,fc.cod_vendedor_compartido,fc.nombre_vendedor_compartido,
        fc.monto_asignado AS monto,COALESCE(u.nombre,fc.cod_vendedor_principal) AS coordinador
      FROM factura_compartida fc
      LEFT JOIN usuario_vendedor uv ON uv.cod_vendedor=fc.cod_vendedor_principal
      LEFT JOIN usuario u ON u.id=uv.usuario_id
      WHERE fc.cod_vendedor_compartido IN (${ph}) AND fc.mes=? AND fc.anio=? AND fc.rol='compartido'
      ORDER BY fc.fecha DESC
    `,[...codigos,mes,anio]);
    res.json({ok:true,compartidos:rows});
  } catch(err){
    console.error('[GET /dashboard/compartidos]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener compartidos'});
  }
});

// ── GET /api/dashboard/asignados ─────────────────────────────────────────
router.get('/asignados', async (req,res) => {
  const usuario=req.usuario, codigosCoord=getCodigosCoordinador(usuario), hoy=new Date();
  const { validarMesAnio }=require('../utils/stringHelpers');
  let mes,anio;
  try { ({mes,anio}=validarMesAnio(req.query.mes??(hoy.getMonth()+1),req.query.anio??hoy.getFullYear())); }
  catch(err){return res.status(400).json({ok:false,error:err.message});}
  if(!codigosCoord.length) return res.json({ok:true,asignados:[]});
  try {
    const ph=codigosCoord.map(()=>'?').join(',');
    const [rows]=await db.pool.query(`
      SELECT fc.id,fc.folio,fc.fecha,fc.cliente,fc.monto_neto,fc.monto_asignado,fc.porcentaje,
        fc.cod_vendedor_principal,fc.cod_vendedor_compartido,fc.nombre_vendedor_compartido
      FROM factura_compartida fc
      WHERE fc.cod_vendedor_principal IN (${ph}) AND fc.mes=? AND fc.anio=? AND fc.rol='compartido'
      ORDER BY fc.fecha DESC
    `,[...codigosCoord,mes,anio]);
    res.json({ok:true,asignados:rows});
  } catch(err){
    console.error('[GET /dashboard/asignados]',err.message);
    res.status(500).json({ok:false,error:'Error al obtener asignados'});
  }
});

module.exports = router;
