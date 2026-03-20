'use strict';

/**
 * mailer.test.js — Tests unitarios para envío de correo OTP
 */

const https = require('https');

jest.mock('https');

// Limpiar variables de entorno antes de cada test
beforeEach(() => {
  jest.resetAllMocks();
  process.env.MAIL_TENANT_ID     = 'tenant-id-test';
  process.env.MAIL_CLIENT_ID     = 'client-id-test';
  process.env.MAIL_CLIENT_SECRET = 'client-secret-test';
  process.env.MAIL_FROM_ADDRESS  = 'soporte@texpro.cl';
  process.env.MAIL_FROM_NAME     = 'TEXPRO';
});

const { enviarOtp } = require('./mailer');

// ── Helper para simular https.request ───────────────────────────
function mockHttpsRequest(tokenStatus, tokenBody, sendStatus) {
  https.request.mockImplementation((options, callback) => {
    const mockRes = {
      statusCode: options.hostname === 'login.microsoftonline.com' ? tokenStatus : sendStatus,
      on: jest.fn((event, handler) => {
        if (event === 'data') handler(JSON.stringify(tokenBody));
        if (event === 'end') handler();
      })
    };
    callback(mockRes);
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });
}

// ── exports ──────────────────────────────────────────────────────
describe('mailer exports', () => {
  it('exporta la función enviarOtp', () => {
    expect(typeof enviarOtp).toBe('function');
  });
});

// ── enviarOtp ─────────────────────────────────────────────────────
describe('enviarOtp', () => {
  it('resuelve correctamente cuando Graph API retorna 202', async () => {
    mockHttpsRequest(200, { access_token: 'mock-token' }, 202);
    await expect(enviarOtp('destino@texpro.cl', '123456')).resolves.toBeUndefined();
  });

  it('lanza error si faltan variables de entorno MAIL_TENANT_ID', async () => {
    delete process.env.MAIL_TENANT_ID;
    await expect(enviarOtp('destino@texpro.cl', '123456'))
      .rejects.toThrow(/MAIL_TENANT_ID/);
  });

  it('lanza error si falta MAIL_FROM_ADDRESS', async () => {
    delete process.env.MAIL_FROM_ADDRESS;
    await expect(enviarOtp('destino@texpro.cl', '123456'))
      .rejects.toThrow(/MAIL_FROM_ADDRESS/);
  });

  it('lanza error si Graph API no retorna token', async () => {
    mockHttpsRequest(400, { error_description: 'Invalid client' }, null);
    await expect(enviarOtp('destino@texpro.cl', '123456'))
      .rejects.toThrow(/Error obteniendo token/);
  });
});
