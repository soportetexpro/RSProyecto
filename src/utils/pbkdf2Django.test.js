'use strict';

/**
 * pbkdf2Django.test.js — Tests unitarios
 * Verifica parseDjangoHash y verifyPasswordDjango
 * sin dependencia de BD ni red.
 *
 * NOTA sobre iteraciones:
 *   TEST_ITERATIONS = 1000 (en lugar de 600000 de producción).
 *   Los tests unitarios verifican la corrección del algoritmo,
 *   no la resistencia criptográfica. Las 600k iteraciones reales
 *   se validan en tests de integración con BD activa.
 */

const crypto = require('crypto');
const { parseDjangoHash, verifyPasswordDjango } = require('./pbkdf2Django');

// ── Hash de prueba — iteraciones reducidas para velocidad en CI ──
const TEST_PASSWORD   = 'TestPassword123!';
const TEST_SALT       = 'testSaltParaTexpro2026';
const TEST_ITERATIONS = 1000; // producción usa 600000 — aquí se prueba la lógica, no la resistencia

const derivedKey    = crypto.pbkdf2Sync(TEST_PASSWORD, TEST_SALT, TEST_ITERATIONS, 32, 'sha256');
const TEST_HASH     = derivedKey.toString('base64');
const VALID_ENCODED = `pbkdf2_sha256$${TEST_ITERATIONS}$${TEST_SALT}$${TEST_HASH}`;

// ───────────────────────────────────────────────────────────────
describe('parseDjangoHash', () => {

  test('parsea correctamente un hash válido', () => {
    const result = parseDjangoHash(VALID_ENCODED);
    expect(result.algorithm).toBe('pbkdf2_sha256');
    expect(result.iterations).toBe(TEST_ITERATIONS);
    expect(result.salt).toBe(TEST_SALT);
    expect(result.hash).toBe(TEST_HASH);
  });

  test('lanza error si el hash es null', () => {
    expect(() => parseDjangoHash(null)).toThrow('Hash inválido');
  });

  test('lanza error si el hash es un string vacío', () => {
    expect(() => parseDjangoHash('')).toThrow('Hash inválido');
  });

  test('lanza error si el hash no es string', () => {
    expect(() => parseDjangoHash(12345)).toThrow('Hash inválido');
  });

  test('lanza error si el formato no tiene 4 partes', () => {
    expect(() => parseDjangoHash('pbkdf2_sha256$600000$salt')).toThrow('Formato de hash Django inválido');
  });

  test('lanza error si las iteraciones no son un número válido', () => {
    expect(() => parseDjangoHash('pbkdf2_sha256$abc$salt$hash')).toThrow('Número de iteraciones inválido');
  });

  test('lanza error si las iteraciones son 0', () => {
    expect(() => parseDjangoHash('pbkdf2_sha256$0$salt$hash')).toThrow('Número de iteraciones inválido');
  });

  test('lanza error si las iteraciones son negativas', () => {
    expect(() => parseDjangoHash('pbkdf2_sha256$-1$salt$hash')).toThrow('Número de iteraciones inválido');
  });

});

// ───────────────────────────────────────────────────────────────
describe('verifyPasswordDjango', () => {

  test('retorna true para contraseña correcta', () => {
    expect(verifyPasswordDjango(TEST_PASSWORD, VALID_ENCODED)).toBe(true);
  });

  test('retorna false para contraseña incorrecta', () => {
    expect(verifyPasswordDjango('WrongPassword!', VALID_ENCODED)).toBe(false);
  });

  test('retorna false para contraseña vacía', () => {
    expect(verifyPasswordDjango('', VALID_ENCODED)).toBe(false);
  });

  test('distingue mayúsculas y minúsculas', () => {
    expect(verifyPasswordDjango(TEST_PASSWORD.toLowerCase(), VALID_ENCODED)).toBe(false);
  });

  test('lanza error si el algoritmo no es pbkdf2_sha256', () => {
    const encoded = `bcrypt$600000$${TEST_SALT}$${TEST_HASH}`;
    expect(() => verifyPasswordDjango(TEST_PASSWORD, encoded)).toThrow('Algoritmo no soportado');
  });

  test('retorna false si el hash almacenado tiene longitud distinta', () => {
    const encodedShort = `pbkdf2_sha256$${TEST_ITERATIONS}$${TEST_SALT}$hashcorto`;
    expect(verifyPasswordDjango(TEST_PASSWORD, encodedShort)).toBe(false);
  });

  test('verifica correctamente con iteraciones distintas (10000)', () => {
    const iters      = 10000;
    const dk         = crypto.pbkdf2Sync(TEST_PASSWORD, TEST_SALT, iters, 32, 'sha256');
    const hash10k    = dk.toString('base64');
    const encoded10k = `pbkdf2_sha256$${iters}$${TEST_SALT}$${hash10k}`;
    expect(verifyPasswordDjango(TEST_PASSWORD, encoded10k)).toBe(true);
  });

});
