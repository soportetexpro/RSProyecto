'use strict';


/**
 * dashboard.js — RSProyecto Texpro
 *
 * Responsabilidades:
 *   1. Guard de sesión — redirige a login si no hay sesión activa
 *   2. Carga datos del usuario desde sessionStorage
 *   3. Renderiza sidebar con módulos según área del usuario
 *   4. Renderiza tarjetas de módulos disponibles
 *   5. Cierre de sesión
 */

(function () {

  // ── 1. GUARD DE SESIÓN ────────────────────────────────────────
  const raw = sessionStorage.getItem('texpro_user');
  if (!raw) {
    window.location.replace('../login/index.html');
    return;
  }

  let user;
  try {
    user = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem('texpro_user');
    window.location.replace('../login/index.html');
    return;
  }

  // ── 2. DEFINICIÓN DE MÓDULOS ──────────────────────────────────
  // areas: ['all'] = acceso universal, ['admin'] = solo admins
  const MODULOS = [
    {
      id:     'ventas',
      nombre: 'Ventas',
      desc:   'Seguimiento de ventas y metas por vendedor',
      icon:   '📊',
      color:  '#E8F5E9',
      areas:  ['ventas', 'gerencia'],
      url:    '../ventas/index.html',
      estado: 'dev'
    },
    {
      id:     'facturacion',
      nombre: 'Facturación',
      desc:   'Gestión de facturas y documentos tributarios',
      icon:   '🧾',
      color:  '#E3F2FD',
      areas:  ['facturacion', 'contabilidad', 'gerencia'],
      url:    '../facturacion/index.html',
      estado: 'planned'
    },
    {
      id:     'bodega',
      nombre: 'Bodega',
      desc:   'Control de inventario y stock',
      icon:   '🏭',
      color:  '#FFF3E0',
      areas:  ['bodega', 'produccion', 'gerencia'],
      url:    '../bodega/index.html',
      estado: 'planned'
    },
    {
      id:     'produccion',
      nombre: 'Producción',
      desc:   'Órdenes de producción y planificación',
      icon:   '⚙️',
      color:  '#F3E5F5',
      areas:  ['produccion', 'gerencia'],
      url:    '../produccion/index.html',
      estado: 'planned'
    },
    {
      id:     'laboratorio',
      nombre: 'Laboratorio',
      desc:   'Control de calidad y análisis',
      icon:   '🧪',
      color:  '#E0F7FA',
      areas:  ['laboratorio', 'gerencia'],
      url:    '../laboratorio/index.html',
      estado: 'planned'
    },
    {
      id:     'cobranza',
      nombre: 'Cobranza',
      desc:   'Seguimiento de cuentas por cobrar',
      icon:   '💰',
      color:  '#FFF8E1',
      areas:  ['cobranza', 'contabilidad', 'gerencia'],
      url:    '../cobranza/index.html',
      estado: 'planned'
    },
    {
      id:     'rrhh',
      nombre: 'RRHH',
      desc:   'Recursos humanos y personal',
      icon:   '👥',
      color:  '#FCE4EC',
      areas:  ['rrhh', 'gerencia'],
      url:    '../rrhh/index.html',
      estado: 'planned'
    },
    {
      id:     'contabilidad',
      nombre: 'Contabilidad',
      desc:   'Estados financieros y reportes',
      icon:   '📜',
      color:  '#E8EAF6',
      areas:  ['contabilidad', 'gerencia'],
      url:    '../contabilidad/index.html',
      estado: 'planned'
    },
    {
      id:     'admin',
      nombre: 'Administración',
      desc:   'Gestión de usuarios y configuración del sistema',
      icon:   '🔧',
      color:  '#ECEFF1',
      areas:  ['admin'],
      url:    '../admin/index.html',
      estado: 'planned'
    }
  ];

  // ── Filtrar módulos según área y permisos ────────────────────────
  function getModulosVisibles(u) {
    return MODULOS.filter(m => {
      if (m.areas.includes('admin')) return u.is_admin === true;
      return u.is_admin === true || m.areas.includes(u.area);
    });
  }

  // ── 3. INICIALIZAR UI ────────────────────────────────────────
  function initUI() {
    const iniciales = getIniciales(user.nombre);
    const areaNombre = capitalize(user.area || 'sistema');

    // Header
    document.getElementById('headerTitle').textContent = 'Dashboard';
    document.getElementById('headerDate').textContent  = getFechaHoy();
    document.getElementById('chipAvatar').textContent  = iniciales;
    document.getElementById('chipName').textContent    = user.nombre.split(' ')[0];

    // Sidebar usuario
    document.getElementById('userName').textContent    = user.nombre;
    document.getElementById('userArea').textContent    = areaNombre;
    document.getElementById('userAvatar').textContent  = iniciales;

    // Welcome
    document.getElementById('welcomeTitle').textContent    = `Hola, ${user.nombre.split(' ')[0]} 👋`;
    document.getElementById('welcomeSubtitle').textContent = `Área: ${areaNombre} — Sistema de Gestión Interna Texpro`;
    document.getElementById('welcomeBadge').textContent    = getAreaEmoji(user.area);

    // Sidebar nav
    renderSidebarNav();

    // Módulos
    renderModulos();

    // Eventos
    bindEvents();
  }

  // ── Sidebar nav ───────────────────────────────────────────────
  function renderSidebarNav() {
    const nav = document.getElementById('sidebarNav');
    const modulos = getModulosVisibles(user);

    const items = [
      { label: 'Dashboard', icon: iconHome(), url: '#', active: true }
    ];

    modulos.forEach(m => {
      items.push({ label: m.nombre, icon: `<span style="font-size:1rem">${m.icon}</span>`, url: m.url, active: false });
    });

    nav.innerHTML = [
      `<span class="nav-section-title">NAVEGACIÓN</span>`,
      ...items.map(item => `
        <a class="nav-item${item.active ? ' active' : ''}" href="${item.url}">
          ${item.icon}
          <span class="nav-label">${item.label}</span>
        </a>
      `)
    ].join('');
  }

  // ── Tarjetas de módulos ────────────────────────────────────────
  function renderModulos() {
    const grid = document.getElementById('modulesGrid');
    const modulos = getModulosVisibles(user);

    if (!modulos.length) {
      grid.innerHTML = `<p style="color:var(--color-gray-dark);font-size:var(--text-sm)">No hay módulos asignados a tu área. Contacta al administrador.</p>`;
      return;
    }

    const badgeLabels = { ready: 'Disponible', dev: 'En desarrollo', planned: 'Próximamente' };
    const badgeClasses = { ready: 'badge-ready', dev: 'badge-dev', planned: 'badge-planned' };

    grid.innerHTML = modulos.map(m => `
      <a class="module-card${m.estado !== 'ready' ? ' disabled' : ''}" href="${m.estado === 'ready' ? m.url : '#'}" title="${m.nombre}">
        <div class="module-icon" style="background:${m.color}">${m.icon}</div>
        <span class="module-name">${m.nombre}</span>
        <span class="module-desc">${m.desc}</span>
        <span class="module-badge ${badgeClasses[m.estado]}">${badgeLabels[m.estado]}</span>
      </a>
    `).join('');
  }

  // ── Eventos ──────────────────────────────────────────────────
  function bindEvents() {
    // Colapsar sidebar
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const wrapper = document.getElementById('mainWrapper');
      sidebar.classList.toggle('collapsed');
      wrapper.classList.toggle('sidebar-collapsed');
    });

    // Menú móvil
    document.getElementById('headerMenuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    // Cerrar sesión
    document.getElementById('btnLogout').addEventListener('click', () => {
      sessionStorage.removeItem('texpro_user');
      window.location.replace('../login/index.html');
    });
  }

  // ── Helpers ────────────────────────────────────────────────
  function getIniciales(nombre) {
    return (nombre || 'U').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function getFechaHoy() {
    return new Date().toLocaleDateString('es-CL', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function getAreaEmoji(area) {
    const map = {
      ventas:       '📊',
      facturacion:  '🧾',
      bodega:       '🏭',
      produccion:   '⚙️',
      laboratorio:  '🧪',
      cobranza:     '💰',
      rrhh:         '👥',
      contabilidad: '📜',
      gerencia:     '🏆'
    };
    return map[area] || '🏢';
  }

  function iconHome() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
  }

  // ── ARRANQUE ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

})();
