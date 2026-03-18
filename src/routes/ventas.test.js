"use strict";

/**
 * ventas.test.js — Tests unitarios para rutas de ventas
 * Cubre: GET /api/ventas, /total, /resumen, /clientes, /folio/:folio, /detalle/:folio
 */

const request = require('supertest');
const app     = require('../../src/server');

// ── Mock JWT middleware ──────────────────────────────────────────────────────
jest.mock('../middlewares/requireAuth', () => ({
  requireAuth: (req, _res, next) => {
    req.usuario = {
      sub:       1,
      email:     'test@texpro.cl',
      is_admin:  false,
      vendedores: [{ cod_vendedor: '001' }]
    };
    next();
  }
}));

// ── Mock modelo venta ────────────────────────────────────────────────────────
jest.mock('../models/venta', () => ({
  getTotalVentas:        jest.fn().mockResolvedValue(1000000),
  getResumenPorVendedor: jest.fn().mockResolvedValue([{ cod_vendedor: '001', total: 1000000 }]),
  getClientesPorVendedor:jest.fn().mockResolvedValue([{ cliente: 'Cliente A', total: 500000 }]),
  getVentas:             jest.fn().mockResolvedValue([{ folio: '1001', monto: 100000 }]),
  getMontoFolio:         jest.fn().mockResolvedValue({ folio: '1001', monto_neto: 100000 }),
  getDetalleFolio:       jest.fn().mockResolvedValue([{ producto: 'Producto A', cantidad: 2 }])
}));

describe('GET /api/ventas', () => {
  it('retorna lista de ventas con ok:true', async () => {
    const res = await request(app).get('/api/ventas');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.ventas)).toBe(true);
  });
});

describe('GET /api/ventas/total', () => {
  it('retorna total de ventas del mes', async () => {
    const res = await request(app).get('/api/ventas/total');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.total_ventas).toBe('number');
  });
});

describe('GET /api/ventas/resumen', () => {
  it('retorna resumen por vendedor', async () => {
    const res = await request(app).get('/api/ventas/resumen');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.resumen)).toBe(true);
  });
});

describe('GET /api/ventas/clientes', () => {
  it('retorna clientes por vendedor', async () => {
    const res = await request(app).get('/api/ventas/clientes');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.clientes)).toBe(true);
  });
});

describe('GET /api/ventas/folio/:folio', () => {
  it('retorna monto de un folio existente', async () => {
    const res = await request(app).get('/api/ventas/folio/1001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retorna 404 si folio no existe', async () => {
    const { getMontoFolio } = require('../models/venta');
    getMontoFolio.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/ventas/folio/9999');
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describe('GET /api/ventas/detalle/:folio', () => {
  it('retorna detalle de lineas de un folio', async () => {
    const res = await request(app).get('/api/ventas/detalle/1001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.detalle)).toBe(true);
  });
});

describe('Ventas sin vendedores asignados', () => {
  it('GET /api/ventas retorna array vacio si no hay vendedores', async () => {
    const { requireAuth } = require('../middlewares/requireAuth');
    requireAuth.mockImplementationOnce((req, _res, next) => {
      req.usuario = { sub: 2, email: 'novend@texpro.cl', vendedores: [] };
      next();
    });
    const res = await request(app).get('/api/ventas');
    expect(res.status).toBe(200);
    expect(res.body.ventas).toEqual([]);
  });
});

afterAll(() => jest.clearAllMocks());

