'use strict';

/**
 * auth.test.js — Tests unitarios de autenticación con JWT
 *
 * Cubre:
 *   POST /api/auth/login
 *     - Credenciales faltantes
 *     - Usuario no encontrado
 *     - Cuenta inactiva
 *     - Contraseña incorrecta
 *     - Login exitoso → devuelve token + user
 *     - Token generado es válido y contiene el payload correcto
 *
 *   GET /api/auth/me
 *     - Sin token → 401
 *     - Token inválido → 401
 *     - Token válido → 200 con datos del usuario
 *
 *   POST /api/auth/logout
 *     - Sin token → 401
 *     - Con token válido → 200
 */

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../server');

// ───── Mocks ───────────────────────────────────────────────────────────
jest.mock('../models/usuario');
jest.mock('../utils/pbkdf2Django');

const { findByEmail, findById, updateLastLogin } = require('../models/usuario');
const { verifyPasswordDjango } = require('../utils/pbkdf2Django');

const MOCK_USUARIO = {
  id:                 7,
  nombre:             'CIDALIA SOTO',
  email:              'csoto@texpro.cl',
  password:           'pbkdf2_sha256$600000$salt$hash',
  area:               'ventas',
  codigo:             '194',
  tema:               'claro',
  is_active:          1,
  is_admin:           0,
  last_login:         null,
  fecha_creacion:     '2026-03-11T18:57:11.000Z',
  vendedores:         [{ id: 15, cod_vendedor: '194', tipo: 'P', usuario_id: 7 }],
  permisos:           [],
  metas:              [{ id: 22, fecha: '2023-01-01', meta: '8072983.97', usuario_id: 7 }],
  facturasCompartidas: []
};

// JWT_SECRET para tests
process.env.JWT_SECRET     = 'test-secret-rsproyecto';
process.env.JWT_EXPIRES_IN = '8h';

// ───────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {

  beforeEach(() => jest.clearAllMocks());

  test('400 si faltan email y password', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('400 si falta solo el password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'csoto@texpro.cl' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  test('401 si el usuario no existe', async () => {
    findByEmail.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/login').send({ email: 'noexiste@texpro.cl', password: '1234' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  test('403 si la cuenta está inactiva', async () => {
    findByEmail.mockResolvedValue({ ...MOCK_USUARIO, is_active: 0 });
    verifyPasswordDjango.mockReturnValue(true);
    const res = await request(app).post('/api/auth/login').send({ email: 'csoto@texpro.cl', password: 'pass' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/inactiva/i);
  });

  test('401 si la contraseña es incorrecta', async () => {
    findByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(false);
    const res = await request(app).post('/api/auth/login').send({ email: 'csoto@texpro.cl', password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  test('200 login exitoso — devuelve token y user sin password', async () => {
    findByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'csoto@texpro.cl', password: 'correctpass' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.password).toBeUndefined(); // nunca exponer password
    expect(res.body.user.email).toBe('csoto@texpro.cl');
  });

  test('token generado contiene payload correcto', async () => {
    findByEmail.mockResolvedValue(MOCK_USUARIO);
    verifyPasswordDjango.mockReturnValue(true);
    updateLastLogin.mockResolvedValue(true);

    const res = await request(app).post('/api/auth/login').send({ email: 'csoto@texpro.cl', password: 'pass' });
    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET);

    expect(payload.id).toBe(MOCK_USUARIO.id);
    expect(payload.email).toBe(MOCK_USUARIO.email);
    expect(payload.is_admin).toBe(false);
    expect(payload.iss).toBe('rsproyecto-texpro');
  });

});

// ───────────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {

  let validToken;

  beforeEach(() => {
    jest.clearAllMocks();
    validToken = jwt.sign(
      { id: 7, email: 'csoto@texpro.cl', nombre: 'CIDALIA SOTO', area: 'ventas', codigo: '194', is_admin: false },
      process.env.JWT_SECRET,
      { expiresIn: '8h', issuer: 'rsproyecto-texpro' }
    );
  });

  test('401 sin Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token no proporcionado');
  });

  test('401 con token inválido', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer tokeninvalido');
    expect(res.status).toBe(401);
  });

  test('200 con token válido — devuelve usuario sin password', async () => {
    findById.mockResolvedValue(MOCK_USUARIO);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.user.id).toBe(7);
    expect(res.body.user.password).toBeUndefined();
  });

  test('401 si el usuario está inactivo (BD)', async () => {
    findById.mockResolvedValue({ ...MOCK_USUARIO, is_active: 0 });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(401);
  });

});

// ───────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {

  let validToken;

  beforeEach(() => {
    jest.clearAllMocks();
    validToken = jwt.sign(
      { id: 7, email: 'csoto@texpro.cl', nombre: 'CIDALIA SOTO', area: 'ventas', codigo: '194', is_admin: false },
      process.env.JWT_SECRET,
      { expiresIn: '8h', issuer: 'rsproyecto-texpro' }
    );
  });

  test('401 sin token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  test('200 logout exitoso con token válido', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

});
