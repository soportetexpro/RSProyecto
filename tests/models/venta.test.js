// tests/models/venta.test.js
// Tests para el modelo de ventas (src/models/venta.js)

const { getTotalVentas, getResumenPorVendedor, getClientesPorVendedor, getVentas, getMontoFolio, getDetalleFolio } = require('../../src/models/venta');

describe('Modelo de ventas (Softland)', () => {
  test('getTotalVentas existe y es función', () => {
    expect(typeof getTotalVentas).toBe('function');
  });

  test('getResumenPorVendedor existe y es función', () => {
    expect(typeof getResumenPorVendedor).toBe('function');
  });

  test('getClientesPorVendedor existe y es función', () => {
    expect(typeof getClientesPorVendedor).toBe('function');
  });

  test('getVentas existe y es función', () => {
    expect(typeof getVentas).toBe('function');
  });

  test('getMontoFolio existe y es función', () => {
    expect(typeof getMontoFolio).toBe('function');
  });

  test('getDetalleFolio existe y es función', () => {
    expect(typeof getDetalleFolio).toBe('function');
  });

  // Aquí puedes agregar mocks y tests de integración reales según tu entorno
});
