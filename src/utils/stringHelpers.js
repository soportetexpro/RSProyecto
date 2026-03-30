'use strict';

/**
 * Elimina espacios al final del string (equivalente a RTRIM de SQL)
 * Softland devuelve strings con padding de espacios
 */
const rtrim = (str) => (str ? str.trimEnd() : '');

/**
 * Valida y parsea parámetros mes/anio de req.query.
 * Si mes o anio son undefined/null/vacío, usa el mes y año actuales como default.
 * Lanza Error si los valores provistos son inválidos o potencialmente maliciosos.
 *
 * @param {string|undefined} mes  - Mes como string (1-12). Opcional.
 * @param {string|undefined} anio - Año como string (2000-2100). Opcional.
 * @returns {{ mes: number, anio: number }}
 */
const validarMesAnio = (mes, anio) => {
  const ahora = new Date();

  // Usar valores actuales como default cuando el parámetro no viene
  const mStr = (mes  === undefined || mes  === null || mes  === '') ? String(ahora.getMonth() + 1) : mes;
  const aStr = (anio === undefined || anio === null || anio === '') ? String(ahora.getFullYear())  : anio;

  const m = parseInt(mStr, 10);
  const a = parseInt(aStr, 10);

  if (isNaN(m) || isNaN(a)) {
    throw new Error('Parámetros mes/anio deben ser números enteros');
  }
  if (m < 1 || m > 12) {
    throw new Error(`Mes inválido: ${mStr}. Debe estar entre 1 y 12`);
  }
  if (a < 2000 || a > 2100) {
    throw new Error(`Año inválido: ${aStr}. Debe estar entre 2000 y 2100`);
  }

  return { mes: m, anio: a };
};

module.exports = { rtrim, validarMesAnio };
