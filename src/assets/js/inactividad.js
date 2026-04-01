'use strict';

/**
 * inactividad.js — Cierre automático de sesión por inactividad GLOBAL
 * Texpro RSProyecto
 *
 * Este script se ejecuta en cliente y comparte estado entre pestañas
 * mediante localStorage. La actividad se persiste en la clave global
 * `inac_ultimo_act`, permitiendo que el timeout sea transversal a páginas.
 *
 * REGLA: es una regla del USUARIO, no de la página.
 * El timer se guarda en localStorage (clave: inac_ultimo_act).
 * Navegar entre páginas NO reinicia el contador.
 * Si el usuario lleva 10 min sin tocar nada en CUALQUIER página → aviso → cierre.
 *
 * Incluir en TODAS las páginas protegidas (antes de </body>):
 *   <script src="../assets/js/inactividad.js"></script>
 *
 * Sin configuración adicional necesaria. Valores fijos:
 *   - 10 minutos de inactividad → aviso
 *   - 60 segundos de cuenta regresiva → cierre
 */

(function () {

  // ── Constantes globales ───────────────────────────────────────
  const MINUTOS_INACTIVIDAD = 10;
  const SEGUNDOS_AVISO      = 60;
  const MS_INACTIVIDAD      = MINUTOS_INACTIVIDAD * 60 * 1000;
  const KEY_ULTIMO_ACT      = 'inac_ultimo_act';   // clave en localStorage
  const LOGIN_URL           = '/login/index.html'; // ruta absoluta desde raíz (siempre usar esta)

  // ── Estado local de esta pestaña ──────────────────────────────────
  let timerChequeo   = null;   // setInterval que chequea el localStorage
  let timerCuenta    = null;   // setInterval cuenta regresiva del aviso
  let cuentaRestante = SEGUNDOS_AVISO;
  let avisando       = false;

  // ── Helpers localStorage ───────────────────────────────────────────
  function leerUltimaActividad() {
    const val = localStorage.getItem(KEY_ULTIMO_ACT);
    return val ? parseInt(val, 10) : null;
  }

  function escribirActividad() {
    localStorage.setItem(KEY_ULTIMO_ACT, Date.now().toString());
  }

  function tiempoInactivo() {
    const ultima = leerUltimaActividad();
    if (!ultima) return MS_INACTIVIDAD + 1; // si no existe, tratar como expirado
    return Date.now() - ultima;
  }

  // ── Estilos del aviso (auto-inyectados) ─────────────────────────────
  function inyectarEstilos() {
    if (document.getElementById('inac-style')) return;
    const s = document.createElement('style');
    s.id = 'inac-style';
    s.textContent = `
      #inac-overlay {
        display:none; position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,0.6);
        backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px);
        align-items:center; justify-content:center;
        font-family:'Montserrat','Open Sans',sans-serif;
      }
      #inac-overlay.inac-visible { display:flex; }
      #inac-modal {
        background:#fff; border-radius:18px;
        padding:2.5rem 2rem 2rem; max-width:420px; width:92%;
        box-shadow:0 24px 64px rgba(0,0,0,0.28);
        text-align:center;
        animation:inacEntra 0.3s cubic-bezier(0.16,1,0.3,1);
      }
      @keyframes inacEntra {
        from{opacity:0;transform:scale(0.9) translateY(16px)}
        to  {opacity:1;transform:scale(1)   translateY(0)}
      }
      #inac-icono {
        width:68px; height:68px; border-radius:50%;
        background:#FFF3E0;
        display:flex; align-items:center; justify-content:center;
        margin:0 auto 1.25rem;
      }
      #inac-titulo  { font-size:1.3rem; font-weight:700; color:#111; margin-bottom:.5rem; }
      #inac-desc    { font-size:.88rem; color:#666; line-height:1.65; margin-bottom:1.5rem; }
      #inac-cuenta  {
        font-size:3rem; font-weight:800; color:#E65100;
        margin-bottom:1.25rem; font-variant-numeric:tabular-nums;
      }
      #inac-cuenta.inac-urgente {
        color:#C62828;
        animation:inacPulso .75s ease-in-out infinite;
      }
      @keyframes inacPulso {
        0%,100%{transform:scale(1)} 50%{transform:scale(1.07)}
      }
      #inac-barra-bg {
        width:100%; height:7px; background:#eee;
        border-radius:99px; margin-bottom:2rem; overflow:hidden;
      }
      #inac-barra-fill {
        height:100%; border-radius:99px; background:#E65100;
        transition:width 1s linear, background .4s;
        width:100%;
      }
      #inac-acciones { display:flex; gap:.75rem; justify-content:center; }
      .inac-btn {
        padding:.7rem 1.6rem; border-radius:9px; border:none;
        cursor:pointer; font-size:.9rem; font-weight:600;
        font-family:inherit;
        transition:opacity .15s, transform .15s;
      }
      .inac-btn:hover  { opacity:.87; transform:translateY(-1px); }
      .inac-btn:active { transform:translateY(0); }
      .inac-btn--continuar { background:#016b6f; color:#fff; }
      .inac-btn--salir     { background:#f0f0f0; color:#444; }
    `;
    document.head.appendChild(s);
  }

  // ── Overlay del aviso ───────────────────────────────────────────────
  function crearOverlay() {
    if (document.getElementById('inac-overlay')) return;
    const d = document.createElement('div');
    d.id = 'inac-overlay';
    d.setAttribute('role', 'alertdialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'inac-titulo');
    d.innerHTML = `
      <div id="inac-modal">
        <div id="inac-icono">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
               stroke="#E65100" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8"  x2="12"    y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p id="inac-titulo">¿Sigues ahí?</p>
        <p id="inac-desc">
          Tu sesión se cerrará automáticamente por <strong>inactividad</strong>.<br>
          Si sigues trabajando, haz clic en <em>Seguir conectado</em>.
        </p>
        <div id="inac-cuenta">${SEGUNDOS_AVISO}</div>
        <div id="inac-barra-bg"><div id="inac-barra-fill"></div></div>
        <div id="inac-acciones">
          <button class="inac-btn inac-btn--continuar" id="inac-btn-continuar">✓ Seguir conectado</button>
          <button class="inac-btn inac-btn--salir"     id="inac-btn-salir">Cerrar sesión</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    document.getElementById('inac-btn-continuar').addEventListener('click', extenderSesion);
    document.getElementById('inac-btn-salir').addEventListener('click', cerrarSesion);
  }

  // ── Aviso visual ─────────────────────────────────────────────────────
  function mostrarAviso() {
    if (avisando) return;
    avisando = true;
    cuentaRestante = SEGUNDOS_AVISO;

    document.getElementById('inac-overlay')?.classList.add('inac-visible');
    actualizarCuenta();

    timerCuenta = setInterval(() => {
      cuentaRestante--;
      actualizarCuenta();
      if (cuentaRestante <= 0) { clearInterval(timerCuenta); cerrarSesion(); }
    }, 1000);
  }

  function actualizarCuenta() {
    const el    = document.getElementById('inac-cuenta');
    const barra = document.getElementById('inac-barra-fill');
    if (!el || !barra) return;
    el.textContent = cuentaRestante;
    const pct = (cuentaRestante / SEGUNDOS_AVISO) * 100;
    barra.style.width      = pct + '%';
    barra.style.background = cuentaRestante <= 10 ? '#C62828' : '#E65100';
    el.classList.toggle('inac-urgente', cuentaRestante <= 10);
  }

  // ── Extender / cerrar sesión ───────────────────────────────────────────
  function extenderSesion() {
    clearInterval(timerCuenta);
    avisando = false;
    document.getElementById('inac-overlay')?.classList.remove('inac-visible');
    escribirActividad();   // reinicia el reloj global en localStorage
  }

  function cerrarSesion() {
    clearInterval(timerChequeo);
    clearInterval(timerCuenta);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(KEY_ULTIMO_ACT);
    // Siempre usar la URL absoluta LOGIN_URL para garantizar redirección correcta
    // sin importar desde qué módulo o ruta se dispare el cierre de sesión
    window.location.href = LOGIN_URL + '?razon=inactividad';
  }

  // ── Registro de actividad del usuario ─────────────────────────────────────
  const EVENTOS = ['mousemove','mousedown','keydown','scroll','touchstart','click'];

  function onActividad() {
    if (avisando) return;   // mientras el aviso está, ignorar
    escribirActividad();
  }

  // ── Chequeo periódico (cada 5 s) ───────────────────────────────────────
  // En vez de un setTimeout que se reinicia, chequeamos el valor real del
  // localStorage cada 5 segundos. Así si el usuario navegó a otra página
  // y el timer ya expiró, esta página también lo detecta.
  function chequear() {
    if (!localStorage.getItem('token')) {
      // Token eliminado (otra pestaña cerró sesión) — ir siempre al login absoluto
      window.location.href = LOGIN_URL + '?razon=inactividad';
      return;
    }
    const inactivo = tiempoInactivo();
    if (!avisando && inactivo >= MS_INACTIVIDAD) {
      mostrarAviso();
    }
  }

  // ── Inicialización ──────────────────────────────────────────────────────────────
  function iniciar() {
    if (!localStorage.getItem('token')) return;   // no logueado, nada que hacer

    inyectarEstilos();
    crearOverlay();

    // Registrar actividad en todos los eventos
    EVENTOS.forEach(ev => document.addEventListener(ev, onActividad, { passive: true }));

    // Marcar actividad inicial si no hay registro previo
    if (!leerUltimaActividad()) escribirActividad();

    // Chequear cada 5 segundos
    timerChequeo = setInterval(chequear, 5000);

    // También chequear al volver a la pestaña
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') chequear();
    });
  }

  // ── Aviso en login cuando viene de cierre automático ─────────────────────
  function mostrarMensajeLogin() {
    if (new URLSearchParams(window.location.search).get('razon') !== 'inactividad') return;
    const mostrar = () => {
      const wrapper = document.querySelector('form, .login-form, .card, main');
      if (!wrapper) return;
      const div = document.createElement('div');
      div.style.cssText = 'background:#FFF3E0;color:#E65100;border:1px solid #FFCC80;' +
        'border-radius:9px;padding:.75rem 1rem;margin-bottom:1rem;' +
        'font-size:.875rem;font-family:Montserrat,sans-serif;' +
        'display:flex;align-items:center;gap:.5rem;';
      div.innerHTML = '⏱️ <span>Sesión cerrada automáticamente por <strong>inactividad</strong>.</span>';
      wrapper.insertBefore(div, wrapper.firstElementChild);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrar);
    else mostrar();
  }

  // ── Punto de entrada ──────────────────────────────────────────────────────────
  mostrarMensajeLogin();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();

})();
