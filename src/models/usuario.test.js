'use strict';

const mockExecute = jest.fn();
jest.mock('../config/db', () => ({
  pool: { execute: mockExecute }
}));

const {
  findByEmail,
  findById,
  updateLastLogin,
  updatePassword,
  getVendedoresByUsuarioId,
  getPermisosByUsuarioId,
  getMetasByUsuarioId,
  getTasasDescuentos
} = require('./usuario');

const MOCK_USUARIO = {
  id: 7, nombre: 'CIDALIA SOTO', email: 'csoto@texpro.cl',
  area: 'ventas', codigo: '194', tema: 'claro',
  is_active: 1, is_admin: 0, last_login: null,
  fecha_creacion: '2026-03-11T18:57:11.000Z'
};

beforeEach(() => mockExecute.mockReset());

describe('findByEmail', () => {
  it('retorna usuario si existe', async () => {
    mockExecute.mockResolvedValueOnce([[MOCK_USUARIO]]);
    const result = await findByEmail('csoto@texpro.cl');
    expect(result).toEqual(MOCK_USUARIO);
  });
  it('retorna null si no existe', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const result = await findByEmail('noexiste@texpro.cl');
    expect(result).toBeNull();
  });
});

describe('findById', () => {
  it('retorna usuario sin password si existe', async () => {
    mockExecute.mockResolvedValueOnce([[MOCK_USUARIO]]);
    const result = await findById(7);
    expect(result).toEqual(MOCK_USUARIO);
    expect(result.password).toBeUndefined();
  });
  it('retorna null si no existe', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const result = await findById(999);
    expect(result).toBeNull();
  });
});

describe('updateLastLogin', () => {
  it('retorna true si se actualizó', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await updateLastLogin(7);
    expect(result).toBe(true);
  });
  it('retorna false si no afectó filas', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const result = await updateLastLogin(999);
    expect(result).toBe(false);
  });
});

describe('updatePassword', () => {
  it('retorna true si actualizó contraseña', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const result = await updatePassword('csoto@texpro.cl', 'NuevaPass123');
    expect(result).toBe(true);
    const callArgs = mockExecute.mock.calls[0];
    expect(callArgs[1][0]).toMatch(/^pbkdf2_sha256\$600000\$/);
  });
  it('retorna false si el usuario no existe o está inactivo', async () => {
    mockExecute.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const result = await updatePassword('noexiste@texpro.cl', 'Pass1234');
    expect(result).toBe(false);
  });
});

describe('getVendedoresByUsuarioId', () => {
  it('retorna lista de vendedores del usuario', async () => {
    const mockVend = [{ id: 15, cod_vendedor: '194', tipo: 'P' }];
    mockExecute.mockResolvedValueOnce([mockVend]);
    const result = await getVendedoresByUsuarioId(7);
    expect(result).toEqual(mockVend);
  });
  it('retorna array vacío si no tiene vendedores', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const result = await getVendedoresByUsuarioId(7);
    expect(result).toEqual([]);
  });
});

describe('getPermisosByUsuarioId', () => {
  it('retorna lista de permisos', async () => {
    const mockPermisos = [{ id: 1, permiso: 'ver_descuentos' }];
    mockExecute.mockResolvedValueOnce([mockPermisos]);
    const result = await getPermisosByUsuarioId(7);
    expect(result).toEqual(mockPermisos);
  });
});

describe('getMetasByUsuarioId', () => {
  it('retorna metas del usuario ordenadas por fecha desc', async () => {
    const mockMetas = [{ id: 22, fecha: '2026-01-01', meta: '8000000.00' }];
    mockExecute.mockResolvedValueOnce([mockMetas]);
    const result = await getMetasByUsuarioId(7);
    expect(result).toEqual(mockMetas);
  });
});

describe('getTasasDescuentos', () => {
  it('retorna todas las tasas de descuento', async () => {
    const mockTasas = [{ id: 1, anio: 2026, fecha_corte: '2026-03-01', porcentaje: '5.00', orden: 1 }];
    mockExecute.mockResolvedValueOnce([mockTasas]);
    const result = await getTasasDescuentos();
    expect(result).toEqual(mockTasas);
  });
  it('retorna array vacío si no hay tasas', async () => {
    mockExecute.mockResolvedValueOnce([[]]);
    const result = await getTasasDescuentos();
    expect(result).toEqual([]);
  });
});
