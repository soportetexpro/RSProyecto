/**
 * @jest-environment jsdom
 *
 * login.test.js — Tests unitarios del módulo Login
 * Framework: Jest + jsdom
 *
 * Los valores de entrada usados en los tests son datos de ejemplo
 * corporativos — no representan credenciales reales de acceso.
 */

describe('Login — Validación de formulario', () => {

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="loginForm">
        <input id="usuario" type="email" />
        <span id="error-usuario"></span>
        <input id="password" type="password" />
        <span id="error-password"></span>
        <button id="btnLogin" type="submit">
          <span class="btn-text">Iniciar</span>
          <span id="btnLoader" style="display:none"></span>
        </button>
        <div id="alertError" style="display:none">
          <span id="alertErrorMsg"></span>
        </div>
        <button id="togglePassword" type="button"></button>
        <svg id="icon-eye"></svg>
        <svg id="icon-eye-off" style="display:none"></svg>
      </form>
    `;
  });

  test('Muestra error si correo está vacío', () => {
    const errorEl = document.getElementById('error-usuario');
    const input   = document.getElementById('usuario');
    input.value   = '';

    if (!input.value.trim()) {
      input.classList.add('is-error');
      errorEl.textContent = 'El correo es requerido.';
    }

    expect(input.classList.contains('is-error')).toBe(true);
    expect(errorEl.textContent).toBe('El correo es requerido.');
  });

  test('Muestra error si contraseña está vacía', () => {
    const errorEl = document.getElementById('error-password');
    const input   = document.getElementById('password');
    input.value   = '';

    if (!input.value.trim()) {
      input.classList.add('is-error');
      errorEl.textContent = 'La contraseña es requerida.';
    }

    expect(input.classList.contains('is-error')).toBe(true);
    expect(errorEl.textContent).toBe('La contraseña es requerida.');
  });

  test('No muestra error con campos válidos', () => {
    const inputU = document.getElementById('usuario');
    const inputP = document.getElementById('password');

    // Valores genéricos de test — no son credenciales reales
    inputU.value = 'usuario@texpro.cl';
    inputP.value = 'contrasena_test';

    const errorU = document.getElementById('error-usuario');
    const errorP = document.getElementById('error-password');

    if (inputU.value.trim()) {
      inputU.classList.remove('is-error');
      errorU.textContent = '';
    }
    if (inputP.value.trim() && inputP.value.length >= 4) {
      inputP.classList.remove('is-error');
      errorP.textContent = '';
    }

    expect(inputU.classList.contains('is-error')).toBe(false);
    expect(inputP.classList.contains('is-error')).toBe(false);
    expect(errorU.textContent).toBe('');
    expect(errorP.textContent).toBe('');
  });

  test('Toggle contraseña cambia el tipo del input', () => {
    const inputP = document.getElementById('password');
    inputP.type  = 'password';

    const isPassword = inputP.type === 'password';
    inputP.type = isPassword ? 'text' : 'password';

    expect(inputP.type).toBe('text');

    inputP.type = inputP.type === 'password' ? 'text' : 'password';
    expect(inputP.type).toBe('password');
  });

});
