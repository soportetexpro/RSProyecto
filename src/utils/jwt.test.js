'use strict';

/**
 * jwt.test.js — Tests unitarios de generarToken / verificarToken
 */

const { generarToken, verificarToken } = require('./jwt');

beforeAll(() => {
  process.env.JWT_SECRET     = 'test_secret_texpro_32chars_xyzabc';
  process.env.JWT_EXPIRES_IN = '1h';
});

describe('[JWT] generarToken', () => {

  test('genera un string con 3 partes (header.payload.firma)', () => {
    const token = generarToken({ id: 1, email: 'test@texpro.cl', is_admin: false });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  test('payload contiene sub, email e is_admin', () => {
    const token   = generarToken({ id: 7, email: 'csoto@texpro.cl', is_admin: false });
    const payload = verificarToken(token);
    expect(payload.sub).toBe(7);
    expect(payload.email).toBe('csoto@texpro.cl');
    expect(payload.is_admin).toBe(false);
  });

  test('is_admin se convierte a boolean', () => {
    const token   = generarToken({ id: 31, email: 'admin@texpro.cl', is_admin: 1 });
    const payload = verificarToken(token);
    expect(payload.is_admin).toBe(true);
  });

  test('lanza error si JWT_SECRET no está definido', () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    expect(() => generarToken({ id: 1, email: 'x@x.cl', is_admin: false })).toThrow();
    process.env.JWT_SECRET = originalSecret;
  });

});

describe('[JWT] verificarToken', () => {

  test('verifica y devuelve payload correcto', () => {
    const token   = generarToken({ id: 5, email: 'test@texpro.cl', is_admin: false });
    const payload = verificarToken(token);
    expect(payload.sub).toBe(5);
  });

  test('lanza JsonWebTokenError con token inválido', () => {
    expect(() => verificarToken('tokenfalso')).toThrow();
  });

  test('lanza TokenExpiredError con token expirado', async () => {
    const jwt   = require('jsonwebtoken');
    const token = jwt.sign(
      { sub: 1, email: 'x@x.cl', is_admin: false },
      process.env.JWT_SECRET,
      { expiresIn: '1ms' }
    );
    await new Promise(r => setTimeout(r, 10));
    expect(() => verificarToken(token)).toThrow(/jwt expired/i);
  });

});
