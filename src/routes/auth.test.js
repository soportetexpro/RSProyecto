'use strict';

/**
 * auth.test.js — Tests unitarios de POST /api/auth/login
 * Usa mocks de jest para aislar BD y verificador de password.
 * No requiere conexión real a MySQL.
 */

const request = require('supertest');

// ── Mocks ANTES de importar app ──
jest.mock('../models/usuario');
jest.mock('../utils/pbkdf2Django');

const { getUsuarioCompletoByEmail, updateLastLogin } = require('../models/usuario');
const { verifyPasswordDjango }                       = require('../utils/pbkdf2Django');
const app                                            = require('../server');

// ── Usuario base de prueba (espejo de ventas_usuario) ──
const MOCK_USUARIO = {
  id:             7,
  password:       'pbkdf2_sha256$600000$fakeSalt$fakeHash=',
  last_login:     null,
  nombre:         'CIDALIA SOTO',
  email:          'csoto@texpro.cl',
  area:           'ventas',
  codigo:         '194',
  tema:           'claro',
  is_active:      1,
  is_admin:       0,
  fecha_creacion: '2026-03-11T18:57:11.000Z',
  vendedores:     [{ id: 15, cod_vendedor: '194', tipo: 'P', usuario_id: 7 }],
  permisos:       [],
  metas:          [{ id: 24, fecha: '2026-01-01', meta: '7475000.00', usuario_id: 7 }],
  facturasCompartidas: []
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ───────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {

  // ─ 400: campos faltantes
  test('400 — retorna error si falta email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'algo' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/requeridos/i);
  });

  test('400 — retorna error si falta password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/requeridos/i);
  });

  test('400 — retorna error si body está vacío', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  // ─ 401: usuario no existe
  test('401 — retorna error genérico si el email no existe (no revela información)', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'noexiste@texpro.cl', password: 'cualquiera' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  // ─ 403: cuenta inactiva
  test('403 — retorna error si is_active = 0', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue({ ...MOCK_USUARIO, is_active: 0 });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'cualquiera' });

    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/inactiva/i);
  });

  // ─ 401: password incorrecto
  test('401 — retorna error si password es incorrecto', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'WrongPass' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  // ─ 401: verifyPasswordDjango lanza excepción
  test('401 — maneja excepción de verifyPasswordDjango', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockImplementation(() => { throw new Error('Hash inválido'); });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'algo' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  // ─ 200: login exitoso
  test('200 — login exitoso retorna datos del usuario sin password', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'PasswordCorrecto123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toBe('Login correcto');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('csoto@texpro.cl');
    expect(res.body.user.nombre).toBe('CIDALIA SOTO');
    expect(res.body.user.is_admin).toBe(false);
    expect(res.body.user.is_active).toBe(true);
  });

  // ─ 200: el campo password NO aparece en respuesta
  test('200 — la respuesta NO expone el campo password', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'PasswordCorrecto123' });

    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
  });

  // ─ 200: admin login
  test('200 — admin retorna is_admin = true', async () => {
    const adminMock = { ...MOCK_USUARIO, id: 31, is_admin: 1, nombre: 'admin', email: 'soporte.informatica@texpro.cl' };
    getUsuarioCompletoByEmail.mockResolvedValue(adminMock);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'soporte.informatica@texpro.cl', password: 'AdminPass123' });

    expect(res.status).toBe(200);
    expect(res.body.user.is_admin).toBe(true);
  });

  // ─ 200: datos relacionados incluidos
  test('200 — respuesta incluye vendedores, permisos, metas y facturasCompartidas', async () => {
    getUsuarioCompletoByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'PasswordCorrecto123' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.user.vendedores)).toBe(true);
    expect(Array.isArray(res.body.user.permisos)).toBe(true);
    expect(Array.isArray(res.body.user.metas)).toBe(true);
    expect(Array.isArray(res.body.user.facturasCompartidas)).toBe(true);
  });

  // ─ 500: error inesperado de BD
  test('500 — maneja error inesperado de BD', async () => {
    getUsuarioCompletoByEmail.mockRejectedValue(new Error('DB connection lost'));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'csoto@texpro.cl', password: 'algo' });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/procesar/i);
  });

});

// ───────────────────────────────────────────────────────────────
describe('GET /api/health', () => {

  test('404 — ruta inexistente devuelve JSON con ok: false', async () => {
    const res = await request(app)
      .get('/api/ruta-que-no-existe');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/no encontrada/i);
  });

});
