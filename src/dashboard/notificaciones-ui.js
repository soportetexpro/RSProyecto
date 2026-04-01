'use strict';

/**
 * notificaciones-ui.js — Módulo de campana 🔔 para el dashboard Texpro
 *
 * Responsabilidades:
 *   - Consultar notificaciones del usuario por polling
 *   - Renderizar dropdown de campana y badge de no leídas
 *   - Permitir marcar una/todas como leídas
 *   - Mostrar toasts para eventos de meta
 *
 * Fuente de datos:
 *   API backend /api/notificaciones (requiere JWT en Authorization).
 *
 * Polling cada 30 s, dropdown, toasts motivacionales, marcar leída/todas
 */

(function () {

  /* ── Helpers ───────────────────────────────────────────── */
  const API = '/api/notificaciones';
  const token = () => localStorage.getItem('token') || sessionStorage.getItem('token') || '';

  const headers = () => ({
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token()
  });

  function tiempoRelativo(fechaStr) {
    const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 1000);
    if (diff < 60)   return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff/60)} min`;
    if (diff < 86400)return `Hace ${Math.floor(diff/3600)} h`;
    return `Hace ${Math.floor(diff/86400)} d`;
  }

  function iconoTipo(tipo) {
    const m = {
      folio_recibido: { cls:'notif-icono--folio',    emoji:'📥' },
      folio_asignado: { cls:'notif-icono--asignado',  emoji:'📤' },
      meta_cumplida:  { cls:'notif-icono--meta',      emoji:'🎯' },
      meta_superada:  { cls:'notif-icono--superada',  emoji:'🚀' },
    };
    return m[tipo] || { cls:'notif-icono--folio', emoji:'🔔' };
  }

  /* ── DOM refs ──────────────────────────────────────────── */
  const btn      = document.getElementById('notifBtn');
  const badge    = document.getElementById('notifBadge');
  const panel    = document.getElementById('notifPanel');
  const lista    = document.getElementById('notifLista');
  const leerTodo = document.getElementById('notifLeerTodo');
  const toastCnt = document.getElementById('notifToastContainer');

  if (!btn) return; // seguridad si el HTML no cargó

  /* ── Estado ─────────────────────────────────────────────── */
  let panelAbierto = false;
  let notificaciones = [];
  let toastsVistos = new Set(); // IDs ya mostrados en toast esta sesión

  /* ── Toggle panel ───────────────────────────────────────── */
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panelAbierto = !panelAbierto;
    panel.classList.toggle('notif-panel--open', panelAbierto);
    btn.classList.toggle('notif-btn--active', panelAbierto);
    btn.setAttribute('aria-expanded', panelAbierto);
    if (panelAbierto) renderLista();
  });

  document.addEventListener('click', (e) => {
    if (panelAbierto && !document.getElementById('notifWrapper').contains(e.target)) {
      cerrarPanel();
    }
  });

  function cerrarPanel() {
    panelAbierto = false;
    panel.classList.remove('notif-panel--open');
    btn.classList.remove('notif-btn--active');
    btn.setAttribute('aria-expanded', 'false');
  }

  /* ── Render lista ───────────────────────────────────────── */
  function renderLista() {
    if (!notificaciones.length) {
      lista.innerHTML = '<li class="notif-empty">Sin notificaciones nuevas</li>';
      return;
    }
    lista.innerHTML = notificaciones.map(n => {
      const ico = iconoTipo(n.tipo);
      return `
        <li class="notif-item ${n.leida ? 'notif-item--leida' : ''}"
            data-id="${n.id}" role="menuitem" tabindex="0"
            title="${n.leida ? 'Leída' : 'Marcar como leída'}">
          <div class="notif-icono ${ico.cls}">${ico.emoji}</div>
          <div class="notif-content">
            <div class="notif-titulo">${n.titulo}</div>
            <div class="notif-msg">${n.mensaje}</div>
            <div class="notif-fecha">${tiempoRelativo(n.fecha_creacion)}</div>
          </div>
          <span class="notif-dot"></span>
        </li>`;
    }).join('');

    lista.querySelectorAll('.notif-item:not(.notif-item--leida)').forEach(el => {
      el.addEventListener('click', () => marcarLeida(+el.dataset.id, el));
      el.addEventListener('keydown', e => { if (e.key==='Enter') marcarLeida(+el.dataset.id, el); });
    });
  }

  /* ── Badge ──────────────────────────────────────────────── */
  function actualizarBadge(total) {
    if (total > 0) {
      badge.textContent = total > 99 ? '99+' : total;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ── Marcar una como leída ──────────────────────────────── */
  function marcarLeida(id, el) {
    fetch(`${API}/${id}/leer`, { method:'PATCH', headers: headers() })
      .then(r => r.json())
      .then(() => {
        const n = notificaciones.find(x => x.id === id);
        if (n) n.leida = 1;
        if (el) el.classList.add('notif-item--leida');
        const noLeidas = notificaciones.filter(x => !x.leida).length;
        actualizarBadge(noLeidas);
      })
      .catch(console.error);
  }

  /* ── Marcar todas como leídas ───────────────────────────── */
  leerTodo.addEventListener('click', () => {
    fetch(`${API}/leer-todo`, { method:'PATCH', headers: headers() })
      .then(r => r.json())
      .then(() => {
        notificaciones.forEach(n => n.leida = 1);
        actualizarBadge(0);
        renderLista();
      })
      .catch(console.error);
  });

  /* ── Toast motivacional ─────────────────────────────────── */
  function mostrarToast(n) {
    if (toastsVistos.has(n.id)) return;
    toastsVistos.add(n.id);

    const esSuperada = n.tipo === 'meta_superada';
    const toast = document.createElement('div');
    toast.className = `notif-toast${esSuperada ? ' notif-toast--superada' : ''}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast-emoji">${esSuperada ? '🚀' : '🎯'}</span>
      <div class="toast-body">
        <div class="toast-titulo">${n.titulo}</div>
        <div class="toast-msg">${n.mensaje}</div>
      </div>
      <button class="toast-cerrar" aria-label="Cerrar notificación">✕</button>`;

    toast.querySelector('.toast-cerrar').addEventListener('click', () => quitarToast(toast, n.id));
    toastCnt.appendChild(toast);

    // Auto-cierre 7 s
    setTimeout(() => quitarToast(toast, n.id), 7000);
  }

  function quitarToast(toast, id) {
    if (!toast.parentNode) return;
    toast.classList.add('notif-toast--saliendo');
    setTimeout(() => toast.remove(), 280);
    marcarLeida(id, null);
  }

  /* ── Fetch principal ────────────────────────────────────── */
  function fetchNotificaciones() {
    fetch(`${API}?limit=30`, { headers: headers() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !data.ok) return;
        notificaciones = data.notificaciones || [];
        const noLeidas = notificaciones.filter(x => !x.leida).length;
        actualizarBadge(noLeidas);
        if (panelAbierto) renderLista();

        // Mostrar toasts para meta_cumplida / meta_superada no leídas
        notificaciones
          .filter(n => !n.leida && (n.tipo === 'meta_cumplida' || n.tipo === 'meta_superada'))
          .forEach(mostrarToast);
      })
      .catch(() => {}); // silencioso si no hay conexión
  }

  /* ── Polling ────────────────────────────────────────────── */
  fetchNotificaciones();
  setInterval(fetchNotificaciones, 30_000);

})();
