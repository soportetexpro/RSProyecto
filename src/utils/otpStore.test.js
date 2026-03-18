'use strict';

/**
 * otpStore.test.js — Tests unitarios para crearOtp y verificarOtp
 */

// ── Mock del pool MySQL ──────────────────────────────────────────────────────
const mockExecute = jest.fn();
jest.mock('../config/db', () => ({
  pool: { execute: mockExecute }
}));

const { crearOtp, verificarOtp } = require('./otpStore');

describe('crearOtp', () => {
  beforeEach(() => mockExecute.mockReset());

  it('invalida OTPs previos e inserta uno nuevo, retorna string de 6 digitos', async () => {
    mockExecute
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // UPDATE usado=1
      .mockResolvedValueOnce([{ insertId: 1 }]);    // INSERT nuevo OTP

    const codigo = await crearOtp('user@texpro.cl');
    expect(typeof codigo).toBe('string');
    expect(codigo).toHaveLength(6);
    expect(/^\d{6}$/.test(codigo)).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe('verificarOtp', () => {
  beforeEach(() => mockExecute.mockReset());

  it('retorna true y marca como usado si OTP es valido', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 10 }]])        // SELECT id
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE usado=1

    const resultado = await verificarOtp('user@texpro.cl', '123456');
    expect(resultado).toBe(true);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it('retorna false si OTP no existe, esta usado o expirado', async () => {
    mockExecute.mockResolvedValueOnce([[]]); // SELECT retorna vacio
    const resultado = await verificarOtp('user@texpro.cl', '000000');
    expect(resultado).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => jest.clearAllMocks());
