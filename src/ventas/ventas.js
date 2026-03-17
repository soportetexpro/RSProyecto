'use strict';

/**
 * ventas.js — Módulo de Ventas
 * Conecta con /api/ventas para obtener datos de Softland
 */

// ── Config ─────────────────────────────────────────────────────────────
const API = '/api/ventas';
const POR_PAGINA = 20;

// ── Estado ─────────────────────────────────────────────────────────────
let estado = {
  ventas:        [],
  ventasFiltradas: [],
  paginaActual:  1,
  sortCol:       'fecha',
  sortDir:       'desc',
  usuario:       null,
};

// ── Utilidades ──────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');

function formatCLP(valor) {
  if (valor == null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(valor);
}

function formatFecha(str) {
  if (!str) return '—';
  const d = new Date(str);
  return isNaN(d) ? str : d.toLocaleDateString('es-CL');
}

function badgeEstado(estado) {
  const mapa = {
    'FACTURADO':  'badge--facturado',
    'PENDIENTE':  'badge--pendiente',
    'ANULADO':    'badge--anulado',
    'COTIZACION': 'badge--cotizacion',
  };
  const cls = mapa[String(estado).toUpperCase()] || 'badge--pendiente';
  return `<span class="badge ${cls}">${estado}</span>`;
}

// ── Auth ───────────────────────────────────────────────────────────────
async function verificarSesion() {
  if (!token()) { window.location.href = '../login/index.html'; return null; }
  try {
    const res  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    if (!res.ok || !data.ok) { window.location.href = '../login/index.html'; return null; }
    return data.user;
  } catch {
    window.location.href = '../login/index.html';
    return null;
  }
}

// ── Sidebar (mismo patrón que dashboard) ─────────────────────────────
function cargarSidebar(usuario) {
  document.getElementById('userName').textContent  = usuario.nombre || usuario.email;
  document.getElementById('userArea').textContent   = usuario.area   || '';
  document.getElementById('userAvatar').textContent = (usuario.nombre || 'U')[0].toUpperCase();
  document.getElementById('chipName').textContent   = (usuario.nombre || usuario.email).split(' ')[0];
  document.getElementById('chipAvatar').textContent = (usuario.nombre || 'U')[0].toUpperCase();

  const fecha = new Date();
  document.getElementById('headerDate').textContent =
    fecha.toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '../login/index.html';
  });

  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar--collapsed');
    document.getElementById('mainWrapper').classList.toggle('main-wrapper--expanded');
  });
}

// ── API Ventas ───────────────────────────────────────────────────────────
async function fetchVentas(params = {}) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(`${API}?${qs}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error(`Error API ventas: ${res.status}`);
  return res.json();
}

// ── KPIs ────────────────────────────────────────────────────────────────
function renderKpis(ventas, meta) {
  const total   = ventas.reduce((s, v) => s + (Number(v.neto) || 0), 0);
  const pedidos = ventas.length;
  const ticket  = pedidos > 0 ? total / pedidos : 0;
  const cumpl   = meta > 0 ? Math.round((total / meta) * 100) : null;

  document.getElementById('kpiValorTotal').textContent   = formatCLP(total);
  document.getElementById('kpiValorPedidos').textContent = pedidos.toLocaleString('es-CL');
  document.getElementById('kpiValorTicket').textContent  = formatCLP(ticket);
  document.getElementById('kpiValorMeta').textContent    = cumpl !== null ? `${cumpl}%` : '—';
}

// ── Tabla ─────────────────────────────────────────────────────────────────
function sortVentas(ventas) {
  return [...ventas].sort((a, b) => {
    let va = a[estado.sortCol] ?? '';
    let vb = b[estado.sortCol] ?? '';
    if (!isNaN(Number(va)) && !isNaN(Number(vb))) { va = Number(va); vb = Number(vb); }
    if (va < vb) return estado.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return estado.sortDir === 'asc' ? 1 : -1;
    return 0;
  });
}

function renderTabla() {
  const tbody    = document.getElementById('ventasTbody');
  const busqueda = document.getElementById('tablaBusqueda').value.toLowerCase();

  let datos = estado.ventasFiltradas.filter(v =>
    !busqueda ||
    String(v.folio   || '').toLowerCase().includes(busqueda) ||
    String(v.cliente || '').toLowerCase().includes(busqueda)
  );

  datos = sortVentas(datos);

  const total   = datos.length;
  const inicio  = (estado.paginaActual - 1) * POR_PAGINA;
  const pagina  = datos.slice(inicio, inicio + POR_PAGINA);

  document.getElementById('tablaTotal').textContent = `${total.toLocaleString('es-CL')} registros`;

  if (!pagina.length) {
    tbody.innerHTML = '<tr class="tabla-empty"><td colspan="6">Sin resultados</td></tr>';
    renderPaginacion(0);
    return;
  }

  tbody.innerHTML = pagina.map(v => `
    <tr>
      <td>${v.folio   || '—'}</td>
      <td>${formatFecha(v.fecha)}</td>
      <td>${v.cliente || '—'}</td>
      <td>${v.vendedor || '—'}</td>
      <td style="text-align:right">${formatCLP(v.neto)}</td>
      <td>${badgeEstado(v.estado || 'PENDIENTE')}</td>
    </tr>
  `).join('');

  renderPaginacion(total);
}

function renderPaginacion(total) {
  const paginacion = document.getElementById('paginacion');
  const totalPags  = Math.ceil(total / POR_PAGINA);
  if (totalPags <= 1) { paginacion.innerHTML = ''; return; }

  let html = `<button ${estado.paginaActual === 1 ? 'disabled' : ''} data-pag="prev">&lsaquo;</button>`;
  for (let i = 1; i <= totalPags; i++) {
    html += `<button class="${i === estado.paginaActual ? 'active' : ''}" data-pag="${i}">${i}</button>`;
  }
  html += `<button ${estado.paginaActual === totalPags ? 'disabled' : ''} data-pag="next">&rsaquo;</button>`;
  paginacion.innerHTML = html;

  paginacion.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.pag;
      if (p === 'prev') estado.paginaActual--;
      else if (p === 'next') estado.paginaActual++;
      else estado.paginaActual = Number(p);
      renderTabla();
    });
  });
}

// ── Ordenamiento por columna ────────────────────────────────────────
function initSort() {
  document.querySelectorAll('.ventas-tabla th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      if (estado.sortCol === col) {
        estado.sortDir = estado.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        estado.sortCol = col;
        estado.sortDir = 'asc';
      }
      document.querySelectorAll('.ventas-tabla th').forEach(t => t.classList.remove('sorted-asc', 'sorted-desc'));
      th.classList.add(`sorted-${estado.sortDir}`);
      estado.paginaActual = 1;
      renderTabla();
    });
  });
}

// ── Exportar CSV ──────────────────────────────────────────────────────────
function exportarCSV() {
  const headers = ['Folio','Fecha','Cliente','Vendedor','Neto','Estado'];
  const filas   = estado.ventasFiltradas.map(v => [
    v.folio || '',
    v.fecha || '',
    `"${(v.cliente  || '').replace(/"/g, '""')}"`,
    `"${(v.vendedor || '').replace(/"/g, '""')}"`,
    v.neto  || 0,
    v.estado || ''
  ].join(','));

  const csv  = [headers.join(','), ...filas].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `ventas_${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Buscar (filtros) ────────────────────────────────────────────────────────
async function buscar() {
  const vendedor = document.getElementById('filtroVendedor').value;
  const desde    = document.getElementById('filtroFechaDesde').value;
  const hasta    = document.getElementById('filtroFechaHasta').value;

  const params = {};
  if (vendedor) params.vendedor  = vendedor;
  if (desde)    params.desde     = desde;
  if (hasta)    params.hasta     = hasta;

  // Skeleton mientras carga
  document.getElementById('ventasTbody').innerHTML =
    Array(5).fill('<tr>' + Array(6).fill('<td><div class="skeleton" style="height:16px;width:80%"></div></td>').join('') + '</tr>').join('');

  try {
    const data = await fetchVentas(params);
    estado.ventas          = data.ventas  || [];
    estado.ventasFiltradas = estado.ventas;
    estado.paginaActual    = 1;

    const meta = estado.usuario?.metas?.[0]?.meta ? Number(estado.usuario.metas[0].meta) : 0;
    renderKpis(estado.ventas, meta);
    renderTabla();
  } catch (err) {
    console.error(err);
    document.getElementById('ventasTbody').innerHTML =
      '<tr class="tabla-empty"><td colspan="6">⚠️ Error al cargar ventas. Intenta nuevamente.</td></tr>';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  const usuario = await verificarSesion();
  if (!usuario) return;
  estado.usuario = usuario;

  cargarSidebar(usuario);
  initSort();

  // Fechas por defecto: mes actual
  const hoy    = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  document.getElementById('filtroFechaDesde').value = inicio.toISOString().slice(0, 10);
  document.getElementById('filtroFechaHasta').value = hoy.toISOString().slice(0, 10);

  // Eventos
  document.getElementById('btnBuscar').addEventListener('click',    buscar);
  document.getElementById('btnLimpiar').addEventListener('click', () => {
    document.getElementById('filtroVendedor').value  = '';
    document.getElementById('filtroFechaDesde').value = '';
    document.getElementById('filtroFechaHasta').value = '';
    estado.ventas = estado.ventasFiltradas = [];
    estado.paginaActual = 1;
    document.getElementById('ventasTbody').innerHTML =
      '<tr class="tabla-empty"><td colspan="6">Aplica los filtros para ver las ventas</td></tr>';
    renderKpis([], 0);
    renderPaginacion(0);
  });
  document.getElementById('btnExportar').addEventListener('click', exportarCSV);
  document.getElementById('tablaBusqueda').addEventListener('input', () => { estado.paginaActual = 1; renderTabla(); });

  // Cargar vendedores en el selector
  if (usuario.vendedores?.length) {
    const sel = document.getElementById('filtroVendedor');
    usuario.vendedores.forEach(v => {
      const opt = document.createElement('option');
      opt.value       = v.cod_vendedor;
      opt.textContent = v.cod_vendedor;
      sel.appendChild(opt);
    });
  }

  // Carga inicial automática
  buscar();
}

document.addEventListener('DOMContentLoaded', init);
