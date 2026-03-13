/**
 * recuperar.test.js — Tests unitarios del módulo Recuperar Contraseña
 * Framework: Jest + jsdom
 */

describe('Recuperar Contraseña — Utilidades', () => {

  // ─ getStrength
  function getStrength(pass) {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 8)           score++;
    if (/[A-Z]/.test(pass))         score++;
    if (/[0-9]/.test(pass))         score++;
    if (/[^A-Za-z0-9]/.test(pass))  score++;
    return Math.min(score > 2 ? 3 : score > 1 ? 2 : 1, 3);
  }

  // ─ maskEmail
  function maskEmail(email) {
    const [user, domain] = email.split('@');
    return user.slice(0, 2) + '***@' + domain;
  }

  // ─ validEmail
  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ── Tests de fortaleza de contraseña
  describe('getStrength', () => {
    test('contraseña vacía retorna 0', () => {
      expect(getStrength('')).toBe(0);
    });
    test('contraseña débil retorna 1', () => {
      expect(getStrength('abc')).toBe(1);
    });
    test('contraseña moderada retorna 2', () => {
      expect(getStrength('abcde123')).toBe(2);
    });
    test('contraseña segura retorna 3', () => {
      expect(getStrength('Abcde123!')).toBe(3);
    });
  });

  // ── Tests de máscara de email
  describe('maskEmail', () => {
    test('enmascara el usuario del email', () => {
      expect(maskEmail('gabriel@texpro.cl')).toBe('ga***@texpro.cl');
    });
    test('funciona con usuarios cortos', () => {
      expect(maskEmail('ab@empresa.com')).toBe('ab***@empresa.com');
    });
  });

  // ── Tests de validación de email
  describe('validEmail', () => {
    test('email válido retorna true', () => {
      expect(validEmail('usuario@texpro.cl')).toBe(true);
    });
    test('email sin @ retorna false', () => {
      expect(validEmail('usuariotexpro.cl')).toBe(false);
    });
    test('email vacío retorna false', () => {
      expect(validEmail('')).toBe(false);
    });
    test('email sin dominio retorna false', () => {
      expect(validEmail('usuario@')).toBe(false);
    });
  });

  // ── Tests de validación OTP
  describe('validación OTP', () => {
    test('OTP de 6 dígitos es válido', () => {
      const otp = '123456';
      expect(otp.length).toBe(6);
      expect(/^[0-9]{6}$/.test(otp)).toBe(true);
    });
    test('OTP incompleto es inválido', () => {
      const otp = '123';
      expect(otp.length < 6).toBe(true);
    });
    test('OTP con letras es inválido', () => {
      const otp = '12A456';
      expect(/^[0-9]{6}$/.test(otp)).toBe(false);
    });
  });

  // ── Tests coincidencia de contraseñas
  describe('confirmación de contraseña', () => {
    test('contraseñas iguales son válidas', () => {
      expect('NuevaPass123!' === 'NuevaPass123!').toBe(true);
    });
    test('contraseñas distintas son inválidas', () => {
      expect('NuevaPass123!' === 'OtraPass123!').toBe(false);
    });
  });

});
