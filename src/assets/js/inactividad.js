'use strict';

/**
 * inactividad.js — Módulo de cierre automático de sesión por inactividad
 * Texpro RSProyecto
 *
 * Uso en cualquier página HTML (antes del cierre de </body>):
 *   <script src="../assets/js/inactividad.js"></script>
 *
 * Configuración opcional (antes de cargar el script):
 *   window.INACTIVIDAD_CONFIG = {
 *     tiempoInactividad: 15,   // minutos sin actividad → aviso (default: 15)
 *     tiempoAviso: 60,         // segundos de aviso antes de cerrar (default: 60)
 *     loginUrl: '../login/index.html'  // URL de redirección
 *   };
 *
 * Eventos que reinician el timer:
 *   mousemove, mousedown, keydown, scroll, touchstart, click
 *
 * El módulo es auto-contenido: inyecta su propio overlay CSS.
 * No depende de ninguna librería externa.
 */

(function () {

  // ─── Configuración ────────────────────────────────────────────────────────
  const CFG = Object.assign({
    tiempoInactividad : 15,                       // minutos
    tiempoAviso       : 60,                       // segundos
    loginUrl          : '../login/index.html'
  }, window.INACTIVIDAD_CONFIG || {});

  const MS_INACTIVIDAD  = CFG.tiempoInactividad * 60 * 1000;
  const SEG_AVISO       = CFG.tiempoAviso;

  // ─── Estado ───────────────────────────────────────────────────────────────
  let timerInactividad  = null;   // setTimeout principal
  let timerCuenta       = null;   // setInterval cuenta regresiva
  let cuentaRestante    = SEG_AVISO;
  let avisando          = false;

  // ─── Inyección de estilos ─────────────────────────────────────────────────
  const ESTILOS = `
    #inac-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      align-items: center;
      justify-content: center;
      font-family: 'Montserrat', 'Open Sans', sans-serif;
    }
    #inac-overlay.inac-visible {
      display: flex;
    }
    #inac-modal {
      background: #fff;
      border-radius: 16px;
      padding: 2.5rem 2rem 2rem;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
      text-align: center;
      animation: inacEntrada 0.3s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes inacEntrada {
      from { opacity: 0; transform: scale(0.92) translateY(12px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    #inac-icono {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #FFF3E0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 1.25rem;
    }
    #inac-titulo {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 0.5rem;
    }
    #inac-desc {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    #inac-cuenta {
      font-size: 2.5rem;
      font-weight: 800;
      color: #E65100;
      margin-bottom: 1.5rem;
      font-variant-numeric: tabular-nums;
      transition: color 0.4s;
    }
    #inac-cuenta.inac-urgente {
      color: #C62828;
      animation: inacPulso 0.8s ease-in-out infinite;
    }
    @keyframes inacPulso {
      0%, 100% { transform: scale(1); }
      50%       { transform: scale(1.06); }
    }
    #inac-barra-bg {
      width: 100%;
      height: 6px;
      background: #eee;
      border-radius: 99px;
      margin-bottom: 2rem;
      overflow: hidden;
    }
    #inac-barra-fill {
      height: 100%;
      border-radius: 99px;
      background: #E65100;
      transition: width 1s linear, background 0.5s;
      width: 100%;
    }
    #inac-acciones {
      display: flex;
      gap: 0.75rem;
      justify-content: center;
    }
    .inac-btn {
      padding: 0.65rem 1.5rem;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      font-family: inherit;
      transition: opacity 0.15s, transform 0.15s;
    }
    .inac-btn:hover { opacity: 0.88; transform: translateY(-1px); }
    .inac-btn:active { transform: translateY(0); }
    .inac-btn--continuar {
      background: #016b6f;
      color: #fff;
    }
    .inac-btn--salir {
      background: #f0f0f0;
      color: #333;
    }
  `;

  function inyectarEstilos() {
    if (document.getElementById('inac-style')) return;
    const style = document.createElement('style');
    style.id = 'inac-style';
    style.textContent = ESTILOS;
    document.head.appendChild(style);
  }

  // ─── Construcción del overlay ─────────────────────────────────────────────
  function crearOverlay() {
    if (document.getElementById('inac-overlay')) return;

    const div = document.createElement('div');
    div.id = 'inac-overlay';
    div.setAttribute('role', 'alertdialog');
    div.setAttribute('aria-modal', 'true');
    div.setAttribute('aria-labelledby', 'inac-titulo');
    div.setAttribute('aria-describedby', 'inac-desc');

    div.innerHTML = `
      <div id="inac-modal">
        <div id="inac-icono">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
               stroke="#E65100" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p id="inac-titulo">¿Sigues ahí?</p>
        <p id="inac-desc">
          Por seguridad, tu sesión se cerrará automáticamente<br>
          en <strong>por inactividad</strong>.
        </p>
        <div id="inac-cuenta">${SEG_AVISO}</div>
        <div id="inac-barra-bg">
          <div id="inac-barra-fill"></div>
        </div>
        <div id="inac-acciones">
          <button class="inac-btn inac-btn--continuar" id="inac-btn-continuar">
            ✓ Seguir conectado
          </button>
          <button class="inac-btn inac-btn--salir" id="inac-btn-salir">
            Cerrar sesión
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(div);

    document.getElementById('inac-btn-continuar').addEventListener('click', extenderSesion);
    document.getElementById('inac-btn-salir').addEventListener('click', cerrarSesion);
  }

  // ─── Mostrar aviso ────────────────────────────────────────────────────────
  function mostrarAviso() {
    if (avisando) return;
    avisando = true;
    cuentaRestante = SEG_AVISO;

    const overlay = document.getElementById('inac-overlay');
    if (overlay) overlay.classList.add('inac-visible');

    actualizarCuenta();

    timerCuenta = setInterval(() => {
      cuentaRestante--;
      actualizarCuenta();
      if (cuentaRestante <= 0) {
        clearInterval(timerCuenta);
        cerrarSesion();
      }
    }, 1000);
  }

  function actualizarCuenta() {
    const el    = document.getElementById('inac-cuenta');
    const barra = document.getElementById('inac-barra-fill');
    if (!el || !barra) return;

    el.textContent = cuentaRestante;

    const pct = (cuentaRestante / SEG_AVISO) * 100;
    barra.style.width      = pct + '%';
    barra.style.background = cuentaRestante <= 10 ? '#C62828' : '#E65100';

    if (cuentaRestante <= 10) {
      el.classList.add('inac-urgente');
    } else {
      el.classList.remove('inac-urgente');
    }
  }

  // ─── Extender sesión ──────────────────────────────────────────────────────
  function extenderSesion() {
    if (!avisando) return;
    clearInterval(timerCuenta);
    avisando = false;

    const overlay = document.getElementById('inac-overlay');
    if (overlay) overlay.classList.remove('inac-visible');

    reiniciarTimer();
  }

  // ─── Cerrar sesión ────────────────────────────────────────────────────────
  function cerrarSesion() {
    clearTimeout(timerInactividad);
    clearInterval(timerCuenta);

    localStorage.removeItem('token');
    localStorage.removeItem('user');

    window.location.href = CFG.loginUrl + '?razon=inactividad';
  }

  // ─── Timer de inactividad ─────────────────────────────────────────────────
  function reiniciarTimer() {
    clearTimeout(timerInactividad);
    if (avisando) return;   // si el aviso está activo, el usuario decidirá

    timerInactividad = setTimeout(mostrarAviso, MS_INACTIVIDAD);
  }

  // ─── Listeners de actividad ───────────────────────────────────────────────
  const EVENTOS_ACTIVIDAD = [
    'mousemove', 'mousedown', 'keydown',
    'scroll',    'touchstart', 'click'
  ];

  function registrarActividad() {
    if (avisando) return;   // ignorar actividad mientras el aviso está visible
    reiniciarTimer();
  }

  function iniciar() {
    // Solo actuar si hay token (usuario logueado)
    if (!localStorage.getItem('token')) return;

    inyectarEstilos();
    crearOverlay();

    EVENTOS_ACTIVIDAD.forEach(evento =>
      document.addEventListener(evento, registrarActividad, { passive: true })
    );

    reiniciarTimer();   // arrancar el timer inicial

    // Re-verificar si la pestaña vuelve a estar activa (visibilitychange)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Si no hay token ya (otra pestaña cerró sesión), redirigir
        if (!localStorage.getItem('token')) {
          window.location.href = CFG.loginUrl + '?razon=inactividad';
        }
      }
    });
  }

  // ─── Mostrar mensaje en login si viene de cierre automático ───────────────
  function mostrarMensajeLogin() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('razon') !== 'inactividad') return;

    // Espera a que la página de login cargue su formulario
    const mostrar = () => {
      const contenedor = document.querySelector('.login-form, .card, main, body');
      if (!contenedor) return;

      const aviso = document.createElement('div');
      aviso.style.cssText = [
        'background:#FFF3E0', 'color:#E65100', 'border:1px solid #FFCC80',
        'border-radius:8px',  'padding:0.75rem 1rem', 'margin-bottom:1rem',
        'font-size:0.875rem', 'font-family:Montserrat,sans-serif',
        'display:flex',       'align-items:center',  'gap:0.5rem'
      ].join(';');
      aviso.innerHTML = '⏱️ <span>Sesión cerrada automáticamente por <strong>inactividad</strong>.</span>';

      const form = contenedor.querySelector('form') || contenedor.firstElementChild;
      if (form) contenedor.insertBefore(aviso, form);
      else contenedor.prepend(aviso);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrar);
    else mostrar();
  }

  // ─── Punto de entrada ─────────────────────────────────────────────────────
  mostrarMensajeLogin();   // ejecutar siempre (para la página de login)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

})();
