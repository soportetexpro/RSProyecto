'use strict';

/**
 * tests/utils/validators.test.js
 *
 * Pruebas unitarias para src/utils/validators.js
 * Cubre: validateFolio, validateCodVendedor, validatePorcentaje, validateId
 *
 * NOTA: no duplica los tests de validarMesAnio/rtrim que ya existen
 * en tests/dashboard.test.js (esos pertenecen a stringHelpers.js).
 */

const {
  validateFolio,
  validateCodVendedor,
  validatePorcentaje,
  validateId
} = require('../../src/utils/validators');

// ─────────────────────────────────────────────────────────────────
describe('validateFolio', () => {

  test('retorna el número entero para un folio válido', () => {
    expect(validateFolio('12345')).toBe(12345);
    expect(validateFolio(12345)).toBe(12345);
  });

  test('acepta el folio mínimo (1)', () => {
    expect(validateFolio('1')).toBe(1);
  });

  test('acepta el folio máximo (9999999)', () => {
    expect(validateFolio('9999999')).toBe(9999999);
  });

  test('lanza Error con folio 0', () => {
    expect(() => validateFolio('0')).toThrow();
  });

  test('lanza Error con folio negativo', () => {
    expect(() => validateFolio('-1')).toThrow();
  });

  test('lanza Error con folio que supera 9999999', () => {
    expect(() => validateFolio('10000000')).toThrow();
  });

  test('lanza Error con string no numérico', () => {
    expect(() => validateFolio('abc')).toThrow();
  });

  test('lanza Error con inyección SQL', () => {
    expect(() => validateFolio('1; DROP TABLE DTE_Ventas--')).toThrow();
  });

  test('lanza Error con null', () => {
    expect(() => validateFolio(null)).toThrow();
  });

  test('lanza Error con undefined', () => {
    expect(() => validateFolio(undefined)).toThrow();
  });

  test('lanza Error con número decimal', () => {
    // parseInt('3.7') === 3, es válido; pero '3.7x' → NaN → lanza
    expect(() => validateFolio('0.5')).toThrow(); // 0.5 → parseInt = 0 → inválido
  });
});

// ─────────────────────────────────────────────────────────────────
describe('validateCodVendedor', () => {

  test('retorna el código válido como string limpio', () => {
    expect(validateCodVendedor('V001')).toBe('V001');
    expect(validateCodVendedor('VEND-01')).toBe('VEND-01');
    expect(validateCodVendedor('ABC123')).toBe('ABC123');
  });

  test('acepta código de 1 carácter alfanumérico', () => {
    expect(validateCodVendedor('A')).toBe('A');
    expect(validateCodVendedor('9')).toBe('9');
  });

  test('acepta código de exactamente 20 caracteres', () => {
    expect(validateCodVendedor('ABCDEFGHIJ1234567890')).toBe('ABCDEFGHIJ1234567890');
  });

  test('elimina espacios al inicio y final antes de validar', () => {
    expect(validateCodVendedor('  V001  ')).toBe('V001');
  });

  test('lanza Error con código de 21 caracteres', () => {
    expect(() => validateCodVendedor('ABCDEFGHIJ12345678901')).toThrow();
  });

  test('lanza Error con string vacío', () => {
    expect(() => validateCodVendedor('')).toThrow();
  });

  test('lanza Error con null', () => {
    expect(() => validateCodVendedor(null)).toThrow();
  });

  test('lanza Error con caracteres especiales no permitidos (punto)', () => {
    expect(() => validateCodVendedor('V.001')).toThrow();
  });

  test('lanza Error con inyección SQL (espacio + comilla)', () => {
    expect(() => validateCodVendedor("V001'; DROP--")).toThrow();
  });

  test('lanza Error con barra diagonal', () => {
    expect(() => validateCodVendedor('V001/A')).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('validatePorcentaje', () => {

  test('retorna el valor entero redondeado para porcentaje válido', () => {
    expect(validatePorcentaje('50')).toBe(50);
    expect(validatePorcentaje(50)).toBe(50);
  });

  test('acepta el mínimo (1)', () => {
    expect(validatePorcentaje('1')).toBe(1);
  });

  test('acepta el máximo (100)', () => {
    expect(validatePorcentaje('100')).toBe(100);
  });

  test('redondea el valor al entero más cercano', () => {
    expect(validatePorcentaje('49.6')).toBe(50);
    expect(validatePorcentaje('49.4')).toBe(49);
  });

  test('lanza Error con 0', () => {
    expect(() => validatePorcentaje('0')).toThrow();
  });

  test('lanza Error con 101', () => {
    expect(() => validatePorcentaje('101')).toThrow();
  });

  test('lanza Error con valor negativo', () => {
    expect(() => validatePorcentaje('-10')).toThrow();
  });

  test('lanza Error con string no numérico', () => {
    expect(() => validatePorcentaje('cincuenta')).toThrow();
  });

  test('lanza Error con null', () => {
    expect(() => validatePorcentaje(null)).toThrow();
  });

  test('lanza Error con undefined', () => {
    expect(() => validatePorcentaje(undefined)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
describe('validateId', () => {

  test('retorna el entero para un ID válido', () => {
    expect(validateId('1')).toBe(1);
    expect(validateId(999)).toBe(999);
  });

  test('acepta ID mínimo (1)', () => {
    expect(validateId('1')).toBe(1);
  });

  test('acepta ID grande', () => {
    expect(validateId('2147483647')).toBe(2147483647);
  });

  test('lanza Error con ID 0', () => {
    expect(() => validateId('0')).toThrow();
  });

  test('lanza Error con ID negativo', () => {
    expect(() => validateId('-1')).toThrow();
  });

  test('lanza Error con string no numérico', () => {
    expect(() => validateId('abc')).toThrow();
  });

  test('lanza Error con null', () => {
    expect(() => validateId(null)).toThrow();
  });

  test('lanza Error con undefined', () => {
    expect(() => validateId(undefined)).toThrow();
  });

  test('lanza Error con inyección SQL', () => {
    expect(() => validateId('1 OR 1=1')).toThrow();
  });
});
