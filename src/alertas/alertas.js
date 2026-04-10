'use strict';
/**
 * alertas.js — Frontend del módulo de Alertas y Recordatorios
 * Texpro RSProyecto
 */

// ── Token y usuario desde sessionStorage ─────────────────────────
const TOKEN   = sessionStorage.getItem('token');
const USUARIO = JSON.parse(sessionStorage.getItem('usuario') || 'null');

if (!TOKEN || !USUARIO) {
  location.href = '/src/login/index.html';
}

const API = '/api/alertas';
const headers = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` });

// ── Estado local ──────────────────────────────────────────────────
let _alertas     = [];
let _usuarios    = [];
let _filtroActual = 'todas';
let _editandoId   = null;

// ── Referencias DOM ───────────────────────────────────────────────
const grid              = document.getElementById('alertasGrid');
const modalOverlay      = document.getElementById('modalAlertaOverlay');
const formAlerta        = document.getElementById('formAlerta');
const fTitulo           = document.getElementById('fTitulo');
const fDescripcion      = document.getElementById('fDescripcion');
const fTipo             = document.getElementById('fTipo');
const fFechaVence       = document.getElementById('fFechaVence');
const seccionDest       = document.getElementById('seccionDestinatarios');
const listaDest         = document.getElementById('listaDestinatarios');
const btnNueva          = document.getElementById('btnNuevaAlerta');
const btnCerrar         = document.getElementById('btnCerrarModal');
const btnCancelar       = document.getElementById('btnCancelarModal');
const modalTitulo       = document.getElementById('modalAlertaTitulo');
const recordatorioOv    = document.getElementById('recordatorioOverlay');
const recordatorioLista = document.getElementById('recordatorioLista');
const btnCerrarRec      = document.getElementById('btnCerrarRecordatorio');
const btnIrAlertas      = document.getElementById('btnIrAlertas');

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initHeader();
  await Promise.all([
    cargarAlertas(),
    cargarUsuarios(),
  ]);
  mostrarRecordatorioLogin();
  initFiltros();
  initModal();
});

// ──────────────────────────────────────────────────────────────────
// SIDEBAR / HEADER (reutiliza patrón del dashboard)
// ──────────────────────────────────────────────────────────────────
function initSidebar() {
  const nav = document.getElementById('sidebarNav');
  if (!nav || !USUARIO) return;

  const links = [
    { label: 'Dashboard',   href: '/src/dashboard/index.html', icon: '📊' },
    { label: 'Ventas',      href: '/src/ventas/index.html',    icon: '💼' },
    { label: 'Alertas',     href: '/src/alertas/index.html',   icon: '🔔', active: true },
  ];
  nav.innerHTML = links.map(l =>
    `<a class="nav-item${l.active ? ' active' : ''}" href="${l.href}">
       <span>${l.icon}</span><span class="nav-label">${l.label}</span>
     </a>`
  ).join('');

  const ua = document.getElementById('userAvatar');
  const un = document.getElementById('userName');
  const uu = document.getElementById('userArea');
  const ca = document.getElementById('chipAvatar');
  const cn = document.getElementById('chipName');
  const ini = (USUARIO.nombre || '?').charAt(0).toUpperCase();
  if (ua) ua.textContent = ini;
  if (ca) ca.textContent = ini;
  if (un) un.textContent = USUARIO.nombre || '';
  if (uu) uu.textContent = USUARIO.area   || '';
  if (cn) cn.textContent = USUARIO.nombre || '';

  document.getElementById('btnLogout')?.addEventListener('click', () => {
    sessionStorage.clear(); location.href = '/src/login/index.html';
  });
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar--collapsed');
    document.getElementById('mainWrapper').classList.toggle('main-wrapper--expanded');
  });
}

function initHeader() {
  const el = document.getElementById('headerDate');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('es-CL', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

// ──────────────────────────────────────────────────────────────────
// CARGAR ALERTAS
// ──────────────────────────────────────────────────────────────────
async function cargarAlertas() {
  try {
    const r = await fetch(API, { headers: headers() });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    _alertas = j.data;
    renderAlertas();
  } catch (e) {
    grid.innerHTML = `<div class="alertas-empty"><div class="alertas-empty-icon">⚠️</div><p class="alertas-empty-txt">Error al cargar alertas: ${e.message}</p></div>`;
  }
}

async function cargarUsuarios() {
  try {
    const r = await fetch(`${API}/usuarios`, { headers: headers() });
    const j = await r.json();
    if (j.ok) _usuarios = j.data.filter(u => u.id !== USUARIO.id);
  } catch {}
}

// ──────────────────────────────────────────────────────────────────
// RENDER GRID
// ──────────────────────────────────────────────────────────────────
function renderAlertas() {
  const filtradas = filtrarAlertas(_alertas, _filtroActual);

  if (!filtradas.length) {
    grid.innerHTML = `
      <div class="alertas-empty">
        <div class="alertas-empty-icon">🔔</div>
        <p class="alertas-empty-txt">No hay alertas en este filtro.<br>¡Crea una nueva!</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtradas.map(a => cardHTML(a)).join('');

  // Eventos de botones de cada card
  grid.querySelectorAll('[data-accion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const accion = btn.dataset.accion;
      if (accion === 'editar')     abrirEditar(id);
      if (accion === 'completar')  accionAlerta(id, 'completar');
      if (accion === 'desactivar') accionAlerta(id, 'desactivar');
      if (accion === 'eliminar')   eliminarAlerta(id);
    });
  });
}

function filtrarAlertas(lista, filtro) {
  switch (filtro) {
    case 'activas':     return lista.filter(a => a.activa && !a.completada);
    case 'proximas':    return lista.filter(a => a.activa && !a.completada && a.dias_restantes <= 7);
    case 'completadas': return lista.filter(a => a.completada);
    case 'grupales':    return lista.filter(a => a.tipo === 'grupal');
    default:            return lista;
  }
}

function urgencia(dias, completada) {
  if (completada) return 'completada';
  if (dias < 0)   return 'vencida';
  if (dias <= 2)  return 'critica';
  if (dias <= 7)  return 'urgente';
  return 'normal';
}

function labelDias(dias, completada) {
  if (completada)   return '✅ Completada';
  if (dias < 0)     return `Venció hace ${Math.abs(dias)} día${Math.abs(dias)!==1?'s':''}`;
  if (dias === 0)   return '⚠️ Vence HOY';
  if (dias === 1)   return '⚠️ Vence mañana';
  return `${dias} días restantes`;
}

function cardHTML(a) {
  const u   = urgencia(a.dias_restantes, !!a.completada);
  const esMio = a.id_creador === USUARIO.id;
  const fecha = new Date(a.fecha_vence).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });

  const botonesAccion = a.completada
    ? `<button class="btn-accion btn-accion--eliminar" data-accion="eliminar" data-id="${a.id}">🗑 Eliminar</button>`
    : `
      ${esMio ? `<button class="btn-accion btn-accion--completar" data-accion="completar" data-id="${a.id}">✅ Completar</button>` : ''}
      ${esMio ? `<button class="btn-accion btn-accion--editar"    data-accion="editar"    data-id="${a.id}">✏️ Editar</button>` : ''}
      ${a.activa && esMio ? `<button class="btn-accion btn-accion--desactivar" data-accion="desactivar" data-id="${a.id}">🔕 Desactivar</button>` : ''}
      ${esMio ? `<button class="btn-accion btn-accion--eliminar"  data-accion="eliminar"  data-id="${a.id}">🗑 Eliminar</button>` : ''}
    `;

  return `
    <div class="alerta-card alerta-card--${u} ${a.completada ? 'alerta-card--completada' : ''} ${!a.activa && !a.completada ? 'alerta-card--desactivada' : ''}">
      <div class="alerta-card-body">
        <div class="alerta-card-top">
          <div class="alerta-titulo-wrap">
            <div class="alerta-titulo-card" title="${escHtml(a.titulo)}">${escHtml(a.titulo)}</div>
            <span class="alerta-tipo-badge alerta-tipo-badge--${a.tipo}">${a.tipo === 'grupal' ? '👥 Grupal' : '🔒 Personal'}</span>
          </div>
          <span class="alerta-dias-badge dias--${u}">${labelDias(a.dias_restantes, !!a.completada)}</span>
        </div>
        ${a.descripcion ? `<p class="alerta-desc">${escHtml(a.descripcion)}</p>` : ''}
        <div class="alerta-meta">
          <span>📅 Vence: <strong>${fecha}</strong></span>
          <span>👤 ${escHtml(a.nombre_creador)}</span>
        </div>
        ${a.tipo === 'grupal' && a.destinatarios_nombres ? `<div class="alerta-destinatarios">👥 ${escHtml(a.destinatarios_nombres)}</div>` : ''}
      </div>
      <div class="alerta-card-acciones">${botonesAccion}</div>
    </div>`;
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ──────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────
function initFiltros() {
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('filtro-btn--active'));
      btn.classList.add('filtro-btn--active');
      _filtroActual = btn.dataset.filtro;
      renderAlertas();
    });
  });
}

// ──────────────────────────────────────────────────────────────────
// MODAL CREAR / EDITAR
// ──────────────────────────────────────────────────────────────────
function initModal() {
  btnNueva.addEventListener('click', abrirCrear);
  btnCerrar.addEventListener('click', cerrarModal);
  btnCancelar.addEventListener('click', cerrarModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) cerrarModal(); });
  fTipo.addEventListener('change', () => toggleDestinatarios());
  formAlerta.addEventListener('submit', guardarAlerta);
}

function abrirCrear() {
  _editandoId = null;
  formAlerta.reset();
  document.getElementById('editandoId').value = '';
  modalTitulo.textContent = 'Nueva Alerta';
  // Fecha mínima = hoy
  fFechaVence.min = new Date().toISOString().slice(0,10);
  toggleDestinatarios();
  abrirModal();
}

function abrirEditar(id) {
  const a = _alertas.find(x => x.id === id);
  if (!a) return;
  _editandoId = id;
  modalTitulo.textContent = 'Editar Alerta';
  document.getElementById('editandoId').value = id;
  fTitulo.value       = a.titulo;
  fDescripcion.value  = a.descripcion || '';
  fTipo.value         = a.tipo;
  fFechaVence.value   = a.fecha_vence?.slice(0,10) || '';
  fFechaVence.min     = '';
  toggleDestinatarios(a.destinatarios_ids || []);
  abrirModal();
}

function abrirModal() {
  modalOverlay.classList.add('alerta-modal-overlay--visible');
  modalOverlay.setAttribute('aria-hidden','false');
  fTitulo.focus();
}

function cerrarModal() {
  modalOverlay.classList.remove('alerta-modal-overlay--visible');
  modalOverlay.setAttribute('aria-hidden','true');
}

function toggleDestinatarios(seleccionados = []) {
  const esGrupal = fTipo.value === 'grupal';
  seccionDest.style.display = esGrupal ? 'flex' : 'none';
  if (!esGrupal) return;
  if (!_usuarios.length) {
    listaDest.innerHTML = '<span class="dest-loading">No hay otros usuarios disponibles.</span>';
    return;
  }
  listaDest.innerHTML = _usuarios.map(u =>
    `<label class="dest-item">
       <input type="checkbox" name="dest" value="${u.id}" ${seleccionados.includes(u.id) ? 'checked' : ''} />
       <span>${escHtml(u.nombre)}${u.area ? ` <em style="color:#9CA3AF;font-size:.73rem">(${escHtml(u.area)})</em>` : ''}</span>
     </label>`
  ).join('');
}

async function guardarAlerta(e) {
  e.preventDefault();
  const btn = document.getElementById('btnGuardarAlerta');
  btn.disabled = true; btn.textContent = 'Guardando...';

  const destinatarios = [...document.querySelectorAll('input[name=dest]:checked')].map(i => Number(i.value));
  const body = {
    titulo:       fTitulo.value.trim(),
    descripcion:  fDescripcion.value.trim(),
    tipo:         fTipo.value,
    fecha_vence:  fFechaVence.value,
    destinatarios,
  };

  try {
    const url    = _editandoId ? `${API}/${_editandoId}` : API;
    const method = _editandoId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    cerrarModal();
    await cargarAlertas();
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar Alerta';
  }
}

// ──────────────────────────────────────────────────────────────────
// ACCIONES (completar, desactivar)
// ──────────────────────────────────────────────────────────────────
async function accionAlerta(id, accion) {
  const msgs = { completar: '¿Marcar esta alerta como completada?', desactivar: '¿Desactivar esta alerta? Se ocultará pero no se eliminará.' };
  if (!confirm(msgs[accion] || '¿Confirmar?')) return;
  try {
    const r = await fetch(`${API}/${id}/${accion}`, { method: 'PATCH', headers: headers() });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    await cargarAlertas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function eliminarAlerta(id) {
  if (!confirm('¿Eliminar esta alerta permanentemente? Esta acción no se puede deshacer.')) return;
  try {
    const r = await fetch(`${API}/${id}`, { method: 'DELETE', headers: headers() });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    await cargarAlertas();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

// ──────────────────────────────────────────────────────────────────
// POPUP RECORDATORIO AL LOGIN
// Muestra alertas pendientes que vencen en <= 7 días
// No se muestra si ya fue descartada hoy (en BD) o cerrada en sesión
// ──────────────────────────────────────────────────────────────────
async function mostrarRecordatorioLogin() {
  // Solo mostrar una vez por sesión (sessionStorage)
  if (sessionStorage.getItem('rec_mostrado')) return;

  try {
    const r = await fetch(`${API}/pendientes`, { headers: headers() });
    const j = await r.json();
    if (!j.ok || !j.data.length) return;

    sessionStorage.setItem('rec_mostrado', '1');

    recordatorioLista.innerHTML = j.data.map(a => {
      const u     = urgencia(a.dias_restantes, false);
      const fecha = new Date(a.fecha_vence).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
      return `
        <li class="rec-item rec-item--${u}" id="rec-${a.id}">
          <div class="rec-item-top">
            <span class="rec-titulo">${escHtml(a.titulo)}</span>
            <span class="rec-dias rec-dias--${u}">${labelDias(a.dias_restantes, false)}</span>
          </div>
          ${a.descripcion ? `<p class="rec-desc">${escHtml(a.descripcion)}</p>` : ''}
          <span class="rec-fecha">📅 Vence: ${fecha}</span>
          <button class="btn-no-mostrar" data-id="${a.id}">No mostrar más hoy</button>
        </li>`;
    }).join('');

    // Evento "No mostrar más hoy" por alerta
    recordatorioLista.querySelectorAll('.btn-no-mostrar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        await fetch(`${API}/${id}/descartar`, { method: 'PATCH', headers: headers() });
        const li = document.getElementById(`rec-${id}`);
        if (li) { li.style.opacity = '0'; li.style.transition = '.3s'; setTimeout(() => li.remove(), 300); }
        // Si no quedan items, cerrar panel
        if (!recordatorioLista.children.length) cerrarRecordatorio();
      });
    });

    recordatorioOv.classList.add('recordatorio-overlay--visible');
    recordatorioOv.setAttribute('aria-hidden', 'false');
  } catch {}
}

function cerrarRecordatorio() {
  recordatorioOv.classList.remove('recordatorio-overlay--visible');
  recordatorioOv.setAttribute('aria-hidden', 'true');
}

btnCerrarRec?.addEventListener('click', cerrarRecordatorio);
btnIrAlertas?.addEventListener('click', () => {
  cerrarRecordatorio();
  // ya estamos en alertas, solo cerrar
});
