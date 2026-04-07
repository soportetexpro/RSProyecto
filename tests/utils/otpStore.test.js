'use strict';

/**
 * tests/utils/otpStore.test.js
 *
 * Pruebas unitarias para src/utils/otpStore.js
 * Cubre: crearOtp y verificarOtp
 *
 * Estrategia de aislamiento:
 *   - Se mockea '../config/db' para que pool.execute devuelva respuestas
 *     controladas sin necesitar conexión MySQL real.
 *   - Se verifica que las queries SQL se llamen con los parámetros correctos.
 */

// ── Mock de pool.execute antes de importar otpStore ───────────────
const mockExecute = jest.fn();
jest.mock('../../src/config/db', () => ({
  pool: { execute: mockExecute }
}));

const { crearOtp, verificarOtp } = require('../../src/utils/otpStore');

// ─────────────────────────────────────────────────────────────────
describe('crearOtp', () => {

  beforeEach(() => {
    mockExecute.mockReset();
    // Por defecto ambas queries (UPDATE + INSERT) resuelven OK
    mockExecute.mockResolvedValue([{ affectedRows: 1 }]);
  });

  test('es una función', () => {
    expect(typeof crearOtp).toBe('function');
  });

  test('retorna un string de exactamente 6 dígitos numéricos', async () => {
    const codigo = await crearOtp('test@texpro.cl');
    expect(typeof codigo).toBe('string');
    expect(codigo).toHaveLength(6);
    expect(/^\d{6}$/.test(codigo)).toBe(true);
  });

  test('el código generado está entre 100000 y 999999', async () => {
    // Llamar múltiples veces para reducir falso negativo
    for (let i = 0; i < 10; i++) {
      const cod = await crearOtp('a@b.cl');
      expect(Number(cod)).toBeGreaterThanOrEqual(100000);
      expect(Number(cod)).toBeLessThanOrEqual(999999);
    }
  });

  test('llama pool.execute exactamente 2 veces (UPDATE + INSERT)', async () => {
    await crearOtp('x@texpro.cl');
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  test('primer execute invalida OTPs anteriores del mismo email (UPDATE usado=1)', async () => {
    await crearOtp('x@texpro.cl');
    const [primeraQuery, primerParams] = mockExecute.mock.calls[0];
    expect(primeraQuery).toMatch(/UPDATE otp_tokens/i);
    expect(primeraQuery).toMatch(/usado\s*=\s*1/i);
    expect(primerParams[0]).toBe('x@texpro.cl');
  });

  test('segundo execute inserta el nuevo OTP con el email correcto', async () => {
    await crearOtp('x@texpro.cl');
    const [segundaQuery, segundosParams] = mockExecute.mock.calls[1];
    expect(segundaQuery).toMatch(/INSERT INTO otp_tokens/i);
    expect(segundosParams[0]).toBe('x@texpro.cl');
  });

  test('propaga error si pool.execute falla', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB error'));
    await expect(crearOtp('err@texpro.cl')).rejects.toThrow('DB error');
  });
});

// ─────────────────────────────────────────────────────────────────
describe('verificarOtp', () => {

  beforeEach(() => {
    mockExecute.mockReset();
  });

  test('es una función', () => {
    expect(typeof verificarOtp).toBe('function');
  });

  test('retorna true cuando el OTP existe y es válido', async () => {
    // SELECT retorna 1 fila → OTP válido
    mockExecute
      .mockResolvedValueOnce([[{ id: 101 }]])  // SELECT
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE usado=1
    const resultado = await verificarOtp('ok@texpro.cl', '123456');
    expect(resultado).toBe(true);
  });

  test('retorna false cuando el OTP no existe o está expirado', async () => {
    // SELECT retorna 0 filas → OTP inválido o expirado
    mockExecute.mockResolvedValueOnce([[]]);
    const resultado = await verificarOtp('no@texpro.cl', '000000');
    expect(resultado).toBe(false);
  });

  test('marca el OTP como usado (UPDATE usado=1) cuando es válido', async () => {
    mockExecute
      .mockResolvedValueOnce([[{ id: 202 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await verificarOtp('ok@texpro.cl', '654321');
    expect(mockExecute).toHaveBeenCalledTimes(2);
    const [updateQuery, updateParams] = mockExecute.mock.calls[1];
    expect(updateQuery).toMatch(/UPDATE otp_tokens/i);
    expect(updateQuery).toMatch(/usado\s*=\s*1/i);
    expect(updateParams[0]).toBe(202);
  });

  test('NO llama al segundo execute cuando el OTP es inválido', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    await verificarOtp('no@texpro.cl', '000000');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('propaga error si pool.execute falla', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB error'));
    await expect(verificarOtp('e@b.cl', '111111')).rejects.toThrow('DB error');
  });
});
