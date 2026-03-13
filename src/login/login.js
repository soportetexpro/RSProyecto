/**
 * login.js — RSProyecto Texpro
 * Manejo del formulario de login (frontend)
 * La validación real contra servidor se integrará con el backend.
 */

(function () {
  'use strict';

  // ── Referencias DOM ──────────────────────────────
  const form         = document.getElementById('loginForm');
  const inputUsuario = document.getElementById('usuario');
  const inputPass    = document.getElementById('password');
  const btnLogin     = document.getElementById('btnLogin');
  const btnText      = btnLogin.querySelector('.btn-text');
  const btnLoader    = document.getElementById('btnLoader');
  const alertError   = document.getElementById('alertError');
  const alertMsg     = document.getElementById('alertErrorMsg');
  const togglePass   = document.getElementById('togglePassword');
  const iconEye      = document.getElementById('icon-eye');
  const iconEyeOff   = document.getElementById('icon-eye-off');

  // ── Toggle mostrar/ocultar contraseña ────────────
  togglePass.addEventListener('click', () => {
    const isPassword = inputPass.type === 'password';
    inputPass.type = isPassword ? 'text' : 'password';
    iconEye.style.display    = isPassword ? 'none'  : 'block';
    iconEyeOff.style.display = isPassword ? 'block' : 'none';
    togglePass.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  // ── Limpiar errores al escribir ───────────────────
  inputUsuario.addEventListener('input', () => clearFieldError('usuario'));
  inputPass.addEventListener('input',    () => clearFieldError('password'));

  // ── Validación de campos ──────────────────────────
  function validateFields() {
    let valid = true;

    if (!inputUsuario.value.trim()) {
      setFieldError('usuario', 'El usuario es requerido.');
      valid = false;
    }

    if (!inputPass.value.trim()) {
      setFieldError('password', 'La contraseña es requerida.');
      valid = false;
    } else if (inputPass.value.length < 4) {
      setFieldError('password', 'Mínimo 4 caracteres.');
      valid = false;
    }

    return valid;
  }

  function setFieldError(field, msg) {
    const input = document.getElementById(field);
    const error = document.getElementById('error-' + field);
    input.classList.add('is-error');
    if (error) error.textContent = msg;
  }

  function clearFieldError(field) {
    const input = document.getElementById(field);
    const error = document.getElementById('error-' + field);
    input.classList.remove('is-error');
    if (error) error.textContent = '';
    alertError.style.display = 'none';
  }

  // ── Estado de carga ───────────────────────────────
  function setLoading(state) {
    btnLogin.disabled     = state;
    btnText.style.display  = state ? 'none'  : 'flex';
    btnLoader.style.display = state ? 'flex' : 'none';
  }

  // ── Submit del formulario ─────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertError.style.display = 'none';

    if (!validateFields()) return;

    setLoading(true);

    try {
      /**
       * TODO: reemplazar con llamada real al backend
       * Ejemplo:
       *   const res = await fetch('/api/auth/login', {
       *     method: 'POST',
       *     headers: { 'Content-Type': 'application/json' },
       *     body: JSON.stringify({
       *       usuario: inputUsuario.value.trim(),
       *       password: inputPass.value
       *     })
       *   });
       *   const data = await res.json();
       *   if (!res.ok) throw new Error(data.message || 'Error de autenticación');
       *   window.location.href = '/dashboard';
       */

      // Simulación temporal (2 segundos) — REMOVER al integrar backend
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulación: usuario demo
      const usuario = inputUsuario.value.trim().toLowerCase();
      if (usuario === 'admin' && inputPass.value === '1234') {
        // Redirigir al dashboard (módulo principal)
        window.location.href = '../dashboard/index.html';
      } else {
        throw new Error('Usuario o contraseña incorrectos.');
      }

    } catch (err) {
      alertMsg.textContent = err.message;
      alertError.style.display = 'flex';
    } finally {
      setLoading(false);
    }
  });

  // ── Enter en campo usuario pasa al password ───────
  inputUsuario.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputPass.focus();
    }
  });

})();
