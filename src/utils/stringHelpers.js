/**
 * Elimina espacios al final del string (equivalente a RTRIM de SQL)
 * Softland devuelve strings con padding de espacios
 */
const rtrim = (str) => (str ? str.trimEnd() : '');

/**
 * Valida y parsea parámetros mes/anio de req.query
 * Lanza Error si los valores son inválidos o potencialmente maliciosos
 * @param {string} mes - Mes como string (1-12)
 * @param {string} anio - Año como string (2000-2100)
 * @returns {{ mes: number, anio: number }}
 */
const validarMesAnio = (mes, anio) => {
  const m = parseInt(mes, 10);
  const a = parseInt(anio, 10);
  if (isNaN(m) || isNaN(a)) {
    throw new Error('Parámetros mes/anio deben ser números enteros');
  }
  if (m < 1 || m > 12) {
    throw new Error(`Mes inválido: ${mes}. Debe estar entre 1 y 12`);
  }
  if (a < 2000 || a > 2100) {
    throw new Error(`Año inválido: ${anio}. Debe estar entre 2000 y 2100`);
  }
  return { mes: m, anio: a };
};

module.exports = { rtrim, validarMesAnio };
