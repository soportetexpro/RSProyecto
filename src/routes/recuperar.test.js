"use strict";

/**
 * recuperar.test.js — Tests para flujo OTP de recuperación de contraseña
 * Cubre: POST /api/auth/recuperar, /verificar-otp, /nueva-password
 */

const request = require('supertest');
const app     = require('../../src/server');

// ── Mocks ────────────────────────────────────────────────────────────────────
jest.mock('../models/usuario', () => ({
  findByEmail:    jest.fn(),
  updatePassword: jest.fn().mockResolvedValue(true)
}));

jest.mock('../utils/otpStore', () => ({
  crearOtp:     jest.fn().mockResolvedValue('123456'),
  verificarOtp: jest.fn()
}));

jest.mock('../utils/mailer', () => ({
  enviarOtp: jest.fn().mockResolvedValue()
}));

const { findByEmail }    = require('../models/usuario');
const { verificarOtp }   = require('../utils/otpStore');

// ── POST /api/auth/recuperar ─────────────────────────────────────────────────
describe('POST /api/auth/recuperar', () => {
  it('responde ok:true aunque email no exista (anti-enumeracion)', async () => {
    findByEmail.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/recuperar')
      .send({ email: 'noexiste@texpro.cl' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('responde ok:true cuando email existe y es activo', async () => {
    findByEmail.mockResolvedValueOnce({ id: 1, email: 'user@texpro.cl', is_active: 1 });
    const res = await request(app)
      .post('/api/auth/recuperar')
      .send({ email: 'user@texpro.cl' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('retorna 400 con email invalido', async () => {
    const res = await request(app)
      .post('/api/auth/recuperar')
      .send({ email: 'no-es-email' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});

// ── POST /api/auth/verificar-otp ─────────────────────────────────────────────
describe('POST /api/auth/verificar-otp', () => {
  it('retorna resetToken si OTP es correcto', async () => {
    process.env.JWT_SECRET = 'test_secret_32_chars_minimo_aaaa';
    verificarOtp.mockResolvedValueOnce(true);
    const res = await request(app)
      .post('/api/auth/verificar-otp')
      .send({ email: 'user@texpro.cl', otp: '123456' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resetToken).toBeDefined();
  });

  it('retorna 401 si OTP es incorrecto o expirado', async () => {
    verificarOtp.mockResolvedValueOnce(false);
    const res = await request(app)
      .post('/api/auth/verificar-otp')
      .send({ email: 'user@texpro.cl', otp: '000000' });
    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  it('retorna 400 si OTP no tiene 6 digitos', async () => {
    const res = await request(app)
      .post('/api/auth/verificar-otp')
      .send({ email: 'user@texpro.cl', otp: '12' });
    expect(res.status).toBe(400);
  });
});

// ── POST /api/auth/nueva-password ────────────────────────────────────────────
describe('POST /api/auth/nueva-password', () => {
  it('retorna 400 si password tiene menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/auth/nueva-password')
      .send({ resetToken: 'cualquier', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('retorna 400 si faltan campos requeridos', async () => {
    const res = await request(app)
      .post('/api/auth/nueva-password')
      .send({});
    expect(res.status).toBe(400);
  });
});

afterAll(() => jest.clearAllMocks());
>>>>>>> origin/main
