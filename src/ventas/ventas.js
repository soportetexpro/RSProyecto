'use strict';

/**
 * ventas.js — Módulo de Ventas Texpro
 * 4 KPIs | 1 Gráfico líneas | 3 Tablas | Modal detalle
 */



(function () {

  const API        = '/api/ventas';
  const POR_PAGINA = 20;
  const token      = () => localStorage.getItem('token');

  let grafico    = null;
  let ventasMes  = [];

  const estado = {
    ventas:          [],
    ventasFiltradas: [],
    paginaActual:    1,
    sortCol:         'fecha_formato',
    sortDir:         'desc',
    usuario:         null,
  };

  // ── Formato CLP ─────────────────────────────────────────────────────────────
  function formatCLP(v) {
    if (v == null || v === '') return '—';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0
    }).format(Number(v));
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────
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
  const MODULOS = [
    { nombre:'Ventas',        icon:'📊', url:'../ventas/index.html',       area:['ventas','gerencia'] },
    { nombre:'Facturación',   icon:'🧾', url:'../facturacion/index.html',  area:['facturacion','contabilidad','gerencia'] },
    { nombre:'Bodega',        icon:'🏭', url:'../bodega/index.html',       area:['bodega','produccion','gerencia'] },
    { nombre:'Producción',    icon:'⚙️', url:'../produccion/index.html',   area:['produccion','gerencia'] },
    { nombre:'Laboratorio',   icon:'🧪', url:'../laboratorio/index.html',  area:['laboratorio','gerencia'] },
    { nombre:'Cobranza',      icon:'💰', url:'../cobranza/index.html',     area:['cobranza','contabilidad','gerencia'] },
    { nombre:'RRHH',          icon:'👥', url:'../rrhh/index.html',         area:['rrhh','gerencia'] },
    { nombre:'Contabilidad',  icon:'📜', url:'../contabilidad/index.html', area:['contabilidad','gerencia'] },
    { nombre:'Administración',icon:'🔧', url:'../admin/index.html',        area:['admin'] },
  ];

  function cargarSidebar(usuario) {
    const ini = (usuario.nombre || 'U').split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
    document.getElementById('userName').textContent   = usuario.nombre  || usuario.email;
    document.getElementById('userArea').textContent   = usuario.area    || '';
    document.getElementById('userAvatar').textContent = ini;
    document.getElementById('chipAvatar').textContent = ini;
    document.getElementById('chipName').textContent   = (usuario.nombre || usuario.email).split(' ')[0];
    document.getElementById('headerDate').textContent = new Date().toLocaleDateString('es-CL',
      { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const nav      = document.getElementById('sidebarNav');
    const visibles = MODULOS.filter(m =>
      usuario.is_admin ? true : m.area.includes(usuario.area)
    );
    nav.innerHTML = `<span class="nav-section-title">NAVEGACIÓN</span>
      <a class="nav-item active" href="#">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="nav-label">Ventas</span>
      </a>
      ${visibles.map(m => `<a class="nav-item" href="${m.url}"><span style="font-size:1rem">${m.icon}</span><span class="nav-label">${m.nombre}</span></a>`).join('')}`;

    document.getElementById('btnLogout').addEventListener('click', () => {
      localStorage.removeItem('token'); localStorage.removeItem('user');
      window.location.href = '../login/index.html';
    });
    document.getElementById('sidebarToggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('sidebar--collapsed');
      document.getElementById('mainWrapper').classList.toggle('main-wrapper--expanded');
    });
    document.getElementById('headerMenuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('mobile-open');
    });
  }

  // ── Selectores mes/año ───────────────────────────────────────────────────────
  function initFiltros(usuario) {
    const hoy   = new Date();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const selMes = document.getElementById('filtroMes');
    meses.forEach((m, i) => {
      const o = document.createElement('option');
      o.value = i + 1; o.textContent = m;
      if (i + 1 === hoy.getMonth() + 1) o.selected = true;
      selMes.appendChild(o);
    });

    const selAnio = document.getElementById('filtroAnio');
    for (let y = hoy.getFullYear(); y >= 2022; y--) {
      const o = document.createElement('option');
      o.value = y; o.textContent = y;
      if (y === hoy.getFullYear()) o.selected = true;
      selAnio.appendChild(o);
    }

    const selVend = document.getElementById('filtroVendedor');
    (usuario.vendedores || []).forEach(v => {
      const o = document.createElement('option');
      o.value = v.cod_vendedor; o.textContent = v.cod_vendedor;
      selVend.appendChild(o);
    });
  }

  function getParams() {
    return {
      mes:  document.getElementById('filtroMes').value,
      anio: document.getElementById('filtroAnio').value,
    };
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  function renderKpis(totalVentas, metaMes, totalDescuento) {
    const progreso = metaMes > 0 ? Math.min(Math.round((totalVentas / metaMes) * 100), 999) : 0;
    const pct      = Math.min(progreso, 100);

    document.getElementById('kpiTotalVentas').textContent  = formatCLP(totalVentas);
    document.getElementById('kpiMeta').textContent         = formatCLP(metaMes);
    document.getElementById('kpiDescuento').textContent    = formatCLP(totalDescuento);
    document.getElementById('kpiProgresoPct').textContent  = `${progreso}%`;

    const fill = document.getElementById('progresoFill');
    fill.style.width      = `${pct}%`;
    fill.style.background = progreso >= 100 ? 'var(--color-primary)'
                          : progreso >= 70  ? '#F5A623'
                          : 'var(--color-danger)';
  }

  // ── Gráfico de líneas ────────────────────────────────────────────────────────
  const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  async function cargarGrafico() {
    try {
      const res  = await fetch(`${API}/evolucion?${new URLSearchParams({ anio: getParams().anio })}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) return;

      const labels = data.evolucion.map(e => MESES_LABEL[e.mes - 1]);
      const ventas = data.evolucion.map(e => e.ventas);
      const meta   = data.evolucion.map(e => e.meta);

      const ctx = document.getElementById('graficoVentas').getContext('2d');
      if (grafico) grafico.destroy();

      grafico = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Ventas',
              data: ventas,
              borderColor: '#00E2A7',
              backgroundColor: 'rgba(0,226,167,0.08)',
              tension: 0.4,
              fill: true,
              pointRadius: 5,
              pointHoverRadius: 7,
              borderWidth: 2.5,
            },
            {
              label: 'Meta',
              data: meta,
              borderColor: '#F5A623',
              backgroundColor: 'transparent',
              borderDash: [6, 4],
              tension: 0,
              fill: false,
              pointRadius: 0,
              borderWidth: 2,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { family: 'Montserrat', size: 12 }, usePointStyle: true }
            },
            tooltip: {
              callbacks: {
                label: ctx2 => {
                  const v = ctx2.parsed.y;
                  return ` ${ctx2.dataset.label}: ${new Intl.NumberFormat('es-CL',
                    { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(v)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: { family: 'Open Sans', size: 11 },
                callback: v => new Intl.NumberFormat('es-CL', {
                  notation: 'compact', compactDisplay: 'short'
                }).format(v)
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: {
              ticks: { font: { family: 'Open Sans', size: 11 } },
              grid: { display: false }
            }
          }
        }
      });
    } catch (err) {
      console.error('[cargarGrafico]', err);
    }
  }

  // ── Tabla 1: resumen por vendedor ────────────────────────────────────────────
  async function cargarResumenVendedores() {
    try {
      const res  = await fetch(`${API}/resumen-vendedores?${new URLSearchParams(getParams())}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      const tbody = document.getElementById('tbodyVendedores');
      if (!data.ok || !data.vendedores.length) {
        tbody.innerHTML = '<tr class="tabla-empty"><td colspan="4">Sin datos</td></tr>'; return;
      }
      tbody.innerHTML = data.vendedores.map(v => `
        <tr>
          <td><strong>${v.codVendedor}</strong></td>
          <td style="text-align:center">${v.totalFolios}</td>
          <td style="text-align:right">${formatCLP(v.totalVentas)}</td>
          <td style="text-align:right">${formatCLP(v.totalDescuento)}</td>
        </tr>
      `).join('');
    } catch (err) { console.error('[cargarResumenVendedores]', err); }
  }

  // ── Tabla 2: ventas del mes (paginada) ───────────────────────────────────────
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
      renderPaginacion(0); return;
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

    tbody.querySelectorAll('.btn-detalle').forEach(btn =>
      btn.addEventListener('click', () => abrirDetalle(btn.dataset.folio))
    );
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
        document.querySelectorAll('.ventas-tabla th').forEach(t =>
          t.classList.remove('sorted-asc', 'sorted-desc'));
        th.classList.add(`sorted-${estado.sortDir}`);
        estado.paginaActual = 1;
        renderTabla();
      });
    });
  }

  // ── Tabla 3: Modal detalle folio ─────────────────────────────────────────────
  async function abrirDetalle(folio) {
    const overlay = document.getElementById('modalOverlay');
    const tbody   = document.getElementById('modalTbody');
    const totalEl = document.getElementById('modalTotalValor');

    const venta = ventasMes.find(v => String(v.Folio) === String(folio));
    document.getElementById('modalTitulo').textContent   = `Folio N° ${folio}`;
    document.getElementById('modalSubtitulo').textContent = venta
      ? `${venta.cliente || ''} • ${venta.fecha_formato || ''}` : '';
    document.getElementById('modalResumen').innerHTML = venta ? `
      <div class="modal-chip"><span>Vendedor</span><strong>${venta.CodVendedor || '—'}</strong></div>
      <div class="modal-chip"><span>Monto</span><strong>${formatCLP(venta.monto)}</strong></div>
      <div class="modal-chip"><span>Descuento</span><strong>${formatCLP(venta.descuento)}</strong></div>
    ` : '';

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem">Cargando...</td></tr>';
    totalEl.textContent = '—';
    overlay.classList.add('modal-overlay--visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    try {
      const res  = await fetch(`${API}/detalle/${folio}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const data = await res.json();

      if (!data.ok || !data.detalle?.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--color-gray-mid)">Sin líneas de detalle</td></tr>';
        return;
      }

      const total = data.detalle.reduce((s, l) => s + (Number(l.Total) || 0), 0);
      tbody.innerHTML = data.detalle.map(l => `
        <tr>
          <td><code>${l.CodProd || '—'}</code></td>
          <td>${l.DesProd || '—'}</td>
          <td style="text-align:center">${l.CantFacturada ?? '—'}</td>
          <td style="text-align:right">${formatCLP(l.PrecioUnitario)}</td>
          <td style="text-align:right">${formatCLP(l.PrecioHoy)}</td>
          <td style="text-align:right"><strong>${formatCLP(l.Total)}</strong></td>
        </tr>
      `).join('');
      totalEl.textContent = formatCLP(total);
    } catch (err) {
      console.error('[abrirDetalle]', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-danger)">⚠️ Error al cargar detalle</td></tr>';
    }
  }

  function cerrarModal() {
    document.getElementById('modalOverlay').classList.remove('modal-overlay--visible');
    document.getElementById('modalOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ── Exportar CSV ─────────────────────────────────────────────────────────────
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
      href: url, download: `ventas_${new Date().toISOString().slice(0,10)}.csv`
    });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── Carga principal ──────────────────────────────────────────────────────────
  async function buscar() {
    const params = getParams();

    // Skeleton tabla 2
    document.getElementById('ventasTbody').innerHTML =
      Array(5).fill('<tr>' + Array(7).fill(
        '<td><div class="skeleton" style="height:14px;width:80%"></div></td>'
      ).join('') + '</tr>').join('');

    try {
      // Paralelo: meta + ventas + resumen-vendedores + gráfico
      const [resMeta, resVentas, resVend] = await Promise.all([
        fetch(`${API}/meta?${new URLSearchParams({ anio: params.anio })}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}?${new URLSearchParams(params)}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}/resumen-vendedores?${new URLSearchParams(params)}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
      ]);

      const [dataMeta, dataVentas, dataVend] = await Promise.all([
        resMeta.json(), resVentas.json(), resVend.json()
      ]);

      // Meta
      const metaMes = dataMeta.ok ? dataMeta.metaMes : 0;

      // Ventas del mes
      ventasMes              = dataVentas.ok ? dataVentas.ventas || [] : [];
      estado.ventas          = ventasMes;
      estado.ventasFiltradas = ventasMes;
      estado.paginaActual    = 1;

      // KPIs desde datos del mes
      const totalVentas   = ventasMes.reduce((s, v) => s + (Number(v.monto)     || 0), 0);
      const totalDescuento= ventasMes.reduce((s, v) => s + (Number(v.descuento) || 0), 0);
      renderKpis(totalVentas, metaMes, totalDescuento);

      // Tabla 1
      if (dataVend.ok) {
        const tbody = document.getElementById('tbodyVendedores');
        if (!dataVend.vendedores.length) {
          tbody.innerHTML = '<tr class="tabla-empty"><td colspan="4">Sin datos</td></tr>';
        } else {
          tbody.innerHTML = dataVend.vendedores.map(v => `
            <tr>
              <td><strong>${v.codVendedor}</strong></td>
              <td style="text-align:center">${v.totalFolios}</td>
              <td style="text-align:right">${formatCLP(v.totalVentas)}</td>
              <td style="text-align:right">${formatCLP(v.totalDescuento)}</td>
            </tr>
          `).join('');
        }
      }

      // Tabla 2
      renderTabla();

      // Gráfico (independiente)
      cargarGrafico();

    } catch (err) {
      console.error('[buscar]', err);
      document.getElementById('ventasTbody').innerHTML =
        '<tr class="tabla-empty"><td colspan="7">⚠️ Error al cargar ventas.</td></tr>';
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;
    estado.usuario = usuario;

    cargarSidebar(usuario);
    initFiltros(usuario);
    initSort();

    document.getElementById('btnBuscar').addEventListener('click', buscar);
    document.getElementById('btnLimpiar').addEventListener('click', () => {
      document.getElementById('filtroVendedor').value = '';
      ventasMes = estado.ventas = estado.ventasFiltradas = [];
      estado.paginaActual = 1;
      renderKpis(0, 0, 0);
      document.getElementById('ventasTbody').innerHTML =
        '<tr class="tabla-empty"><td colspan="7">Aplica los filtros para ver las ventas</td></tr>';
      document.getElementById('tbodyVendedores').innerHTML =
        '<tr class="tabla-empty"><td colspan="4">—</td></tr>';
      renderPaginacion(0);
    });
    document.getElementById('btnExportar').addEventListener('click', exportarCSV);
    document.getElementById('tablaBusqueda').addEventListener('input', () => {
      estado.paginaActual = 1; renderTabla();
    });

    document.getElementById('modalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) cerrarModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });

    buscar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
