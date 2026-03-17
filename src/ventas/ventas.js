'use strict';

/**
 * ventas.js — Módulo de Ventas
 * Conecta con /api/ventas (datos reales de Softland)
 */

const API        = '/api/ventas';
const POR_PAGINA = 20;

let estado = {
  ventas:          [],
  ventasFiltradas: [],
  paginaActual:    1,
  sortCol:         'fecha_formato',
  sortDir:         'desc',
  usuario:         null,
};

// ── Utilidades ────────────────────────────────────────────────────────────────
const token = () => localStorage.getItem('token');

function formatCLP(v) {
  if (v == null || v === '') return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(v));
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function verificarSesion() {
  if (!token()) { window.location.href = '../login/index.html'; return null; }
  try {
    const res  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();
    if (!res.ok || !data.ok) { window.location.href = '../login/index.html'; return null; }
    return data.user;
  } catch { window.location.href = '../login/index.html'; return null; }
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function cargarSidebar(usuario) {
  document.getElementById('userName').textContent  = usuario.nombre || usuario.email;
  document.getElementById('userArea').textContent   = usuario.area   || '';
  document.getElementById('userAvatar').textContent = (usuario.nombre || 'U')[0].toUpperCase();
  document.getElementById('chipName').textContent   = (usuario.nombre || usuario.email).split(' ')[0];
  document.getElementById('chipAvatar').textContent = (usuario.nombre || 'U')[0].toUpperCase();
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString('es-CL',
    { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('token'); localStorage.removeItem('user');
    window.location.href = '../login/index.html';
  });
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('sidebar--collapsed');
    document.getElementById('mainWrapper').classList.toggle('main-wrapper--expanded');
  });
}

// ── Selectores mes / año ────────────────────────────────────────────────────────
function initFiltros(usuario) {
  const hoy   = new Date();
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const selMes = document.getElementById('filtroMes');
  meses.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = i + 1;
    opt.textContent = m;
    if (i + 1 === hoy.getMonth() + 1) opt.selected = true;
    selMes.appendChild(opt);
  });

  const selAnio = document.getElementById('filtroAnio');
  for (let y = hoy.getFullYear(); y >= 2022; y--) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === hoy.getFullYear()) opt.selected = true;
    selAnio.appendChild(opt);
  }

  const selVend = document.getElementById('filtroVendedor');
  (usuario.vendedores || []).forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.cod_vendedor;
    opt.textContent = v.cod_vendedor;
    selVend.appendChild(opt);
  });
}

// ── KPIs ────────────────────────────────────────────────────────────────────
function renderKpis(ventas) {
  const total     = ventas.reduce((s, v) => s + (Number(v.monto)     || 0), 0);
  const descuento = ventas.reduce((s, v) => s + (Number(v.descuento) || 0), 0);
  const ticket    = ventas.length > 0 ? total / ventas.length : 0;

  document.getElementById('kpiValorTotal').textContent     = formatCLP(total);
  document.getElementById('kpiValorPedidos').textContent   = ventas.length.toLocaleString('es-CL');
  document.getElementById('kpiValorTicket').textContent    = formatCLP(ticket);
  document.getElementById('kpiValorDescuento').textContent = formatCLP(descuento);
}

// ── Tabla ────────────────────────────────────────────────────────────────────
function sortVentas(arr) {
  return [...arr].sort((a, b) => {
    let va = a[estado.sortCol] ?? '';
    let vb = b[estado.sortCol] ?? '';
    if (!isNaN(Number(va)) && !isNaN(Number(vb))) { va = Number(va); vb = Number(vb); }
    if (va < vb) return estado.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return estado.sortDir === 'asc' ?  1 : -1;
    return 0;
  });
}

function renderTabla() {
  const tbody    = document.getElementById('ventasTbody');
  const busqueda = document.getElementById('tablaBusqueda').value.toLowerCase();

  let datos = estado.ventasFiltradas.filter(v =>
    !busqueda ||
    String(v.Folio   || '').toLowerCase().includes(busqueda) ||
    String(v.cliente || '').toLowerCase().includes(busqueda)
  );

  datos = sortVentas(datos);
  const total  = datos.length;
  const inicio = (estado.paginaActual - 1) * POR_PAGINA;
  const pagina = datos.slice(inicio, inicio + POR_PAGINA);

  document.getElementById('tablaTotal').textContent = `${total.toLocaleString('es-CL')} registros`;

  if (!pagina.length) {
    tbody.innerHTML = '<tr class="tabla-empty"><td colspan="7">Sin resultados</td></tr>';
    renderPaginacion(0);
    return;
  }

  tbody.innerHTML = pagina.map(v => `
    <tr>
      <td><strong>${v.Folio || '—'}</strong></td>
      <td>${v.fecha_formato || '—'}</td>
      <td>${v.cliente       || '—'}</td>
      <td>${v.CodVendedor   || '—'}</td>
      <td style="text-align:right">${formatCLP(v.monto)}</td>
      <td style="text-align:right">${formatCLP(v.descuento)}</td>
      <td style="text-align:center">
        <button class="btn-detalle" data-folio="${v.Folio}" title="Ver detalle">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
    </tr>
  `).join('');

  // Click en botón detalle
  tbody.querySelectorAll('.btn-detalle').forEach(btn => {
    btn.addEventListener('click', () => abrirDetalle(btn.dataset.folio));
  });

  renderPaginacion(total);
}

function renderPaginacion(total) {
  const paginacion = document.getElementById('paginacion');
  const totalPags  = Math.ceil(total / POR_PAGINA);
  if (totalPags <= 1) { paginacion.innerHTML = ''; return; }

  let html = `<button ${estado.paginaActual === 1 ? 'disabled' : ''} data-pag="prev">&lsaquo;</button>`;
  for (let i = 1; i <= totalPags; i++)
    html += `<button class="${i === estado.paginaActual ? 'active' : ''}" data-pag="${i}">${i}</button>`;
  html += `<button ${estado.paginaActual === totalPags ? 'disabled' : ''} data-pag="next">&rsaquo;</button>`;
  paginacion.innerHTML = html;

  paginacion.querySelectorAll('button').forEach(btn =>
    btn.addEventListener('click', () => {
      const p = btn.dataset.pag;
      if (p === 'prev') estado.paginaActual--;
      else if (p === 'next') estado.paginaActual++;
      else estado.paginaActual = Number(p);
      renderTabla();
    })
  );
}

function initSort() {
  document.querySelectorAll('.ventas-tabla th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      estado.sortDir = estado.sortCol === col && estado.sortDir === 'asc' ? 'desc' : 'asc';
      estado.sortCol = col;
      document.querySelectorAll('.ventas-tabla th').forEach(t => t.classList.remove('sorted-asc','sorted-desc'));
      th.classList.add(`sorted-${estado.sortDir}`);
      estado.paginaActual = 1;
      renderTabla();
    });
  });
}

// ── Modal detalle folio ─────────────────────────────────────────────────────────
async function abrirDetalle(folio) {
  const overlay = document.getElementById('modalOverlay');
  const tbody   = document.getElementById('modalTbody');
  const titulo  = document.getElementById('modalTitulo');
  const subtit  = document.getElementById('modalSubtitulo');
  const resumen = document.getElementById('modalResumen');
  const totalEl = document.getElementById('modalTotalValor');

  // Buscar datos de la fila en estado para el resumen
  const venta = estado.ventas.find(v => String(v.Folio) === String(folio));

  titulo.textContent = `Folio Nº ${folio}`;
  subtit.textContent = venta ? `${venta.cliente || ''} • ${venta.fecha_formato || ''}` : '';
  resumen.innerHTML  = venta ? `
    <div class="modal-chip"><span>Vendedor</span><strong>${venta.CodVendedor || '—'}</strong></div>
    <div class="modal-chip"><span>Monto</span><strong>${formatCLP(venta.monto)}</strong></div>
    <div class="modal-chip"><span>Descuento</span><strong>${formatCLP(venta.descuento)}</strong></div>
  ` : '';

  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem"><div class="skeleton" style="height:14px;width:60%;margin:auto"></div></td></tr>';
  totalEl.textContent = '—';
  overlay.classList.add('modal-overlay--visible');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  try {
    const res  = await fetch(`${API}/detalle/${folio}`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();

    if (!data.ok || !data.detalle?.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-gray-mid)">Sin líneas de detalle</td></tr>';
      return;
    }

    const lineas = data.detalle;
    const totalFolio = lineas.reduce((s, l) => s + (Number(l.Total) || 0), 0);

    tbody.innerHTML = lineas.map(l => `
      <tr>
        <td><code>${l.CodProd || '—'}</code></td>
        <td>${l.DesProd || '—'}</td>
        <td style="text-align:center">${l.CantFacturada ?? '—'}</td>
        <td style="text-align:right">${formatCLP(l.PrecioUnitario)}</td>
        <td style="text-align:right">${formatCLP(l.PrecioHoy)}</td>
        <td style="text-align:right"><strong>${formatCLP(l.Total)}</strong></td>
      </tr>
    `).join('');

    totalEl.textContent = formatCLP(totalFolio);

  } catch (err) {
    console.error('[abrirDetalle]', err);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-danger)">⚠️ Error al cargar detalle</td></tr>';
  }
}

function cerrarModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('modal-overlay--visible');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

// ── Exportar CSV ──────────────────────────────────────────────────────────────
function exportarCSV() {
  const headers = ['Folio','Fecha','Cliente','Vendedor','Monto','Descuento'];
  const filas   = estado.ventasFiltradas.map(v => [
    v.Folio || '',
    v.fecha_formato || '',
    `"${(v.cliente     || '').replace(/"/g,'""')}"`,
    v.CodVendedor || '',
    v.monto       || 0,
    v.descuento   || 0,
  ].join(','));
  const csv  = [headers.join(','), ...filas].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url,
    download: `ventas_${new Date().toISOString().slice(0,10)}.csv`
  });
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── Buscar ──────────────────────────────────────────────────────────────────────
async function buscar() {
  const mes      = document.getElementById('filtroMes').value;
  const anio     = document.getElementById('filtroAnio').value;
  const vendedor = document.getElementById('filtroVendedor').value;

  const params = { mes, anio };
  // Si filtra por vendedor específico se pasa como query param adicional
  // El backend ya filtra por los vendedores del JWT; este parámetro es informativo por ahora
  if (vendedor) params.vendedor = vendedor;

  document.getElementById('ventasTbody').innerHTML =
    Array(5).fill('<tr>' + Array(7).fill('<td><div class="skeleton" style="height:14px;width:80%"></div></td>').join('') + '</tr>').join('');

  try {
    const res  = await fetch(`${API}?${new URLSearchParams(params)}`,
      { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error);

    estado.ventas          = data.ventas || [];
    estado.ventasFiltradas = estado.ventas;
    estado.paginaActual    = 1;

    renderKpis(estado.ventas);
    renderTabla();
  } catch (err) {
    console.error('[buscar]', err);
    document.getElementById('ventasTbody').innerHTML =
      '<tr class="tabla-empty"><td colspan="7">⚠️ Error al cargar ventas. Intenta nuevamente.</td></tr>';
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  const usuario = await verificarSesion();
  if (!usuario) return;
  estado.usuario = usuario;

  cargarSidebar(usuario);
  initFiltros(usuario);
  initSort();

  // Eventos filtros
  document.getElementById('btnBuscar').addEventListener('click', buscar);
  document.getElementById('btnLimpiar').addEventListener('click', () => {
    document.getElementById('filtroVendedor').value = '';
    estado.ventas = estado.ventasFiltradas = [];
    estado.paginaActual = 1;
    document.getElementById('ventasTbody').innerHTML =
      '<tr class="tabla-empty"><td colspan="7">Aplica los filtros para ver las ventas</td></tr>';
    renderKpis([]);
    renderPaginacion(0);
  });
  document.getElementById('btnExportar').addEventListener('click', exportarCSV);
  document.getElementById('tablaBusqueda').addEventListener('input', () => { estado.paginaActual = 1; renderTabla(); });

  // Eventos modal
  document.getElementById('modalCerrar').addEventListener('click', cerrarModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

  // Carga inicial automática con mes actual
  buscar();
}

document.addEventListener('DOMContentLoaded', init);
