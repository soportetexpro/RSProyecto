'use strict';

/**
 * ventas.js — Módulo de Ventas Texpro
 *
 * Controlador frontend de la vista de ventas.
 *
 * Responsabilidades:
 *   - Verificar sesión y construir contexto de navegación
 *   - Consultar KPIs, evolución y tablas desde /api/ventas
 *   - Gestionar paginación, búsqueda y ordenamiento client-side
 *   - Mostrar modal de detalle por folio
 *
 * Fuente de datos:
 *   Endpoints protegidos de /api/ventas y /api/auth/me.
 *
 * 4 KPIs | 1 Gráfico líneas | 3 Tablas | Modal detalle
 *
 * Tabla Vendedores — 6 columnas:
 *   Cód. Vendedor | Nombre Vendedor | Folios | Total Cobrado | Venta Real (Lista) | % Descuento
 *
 *   Definiciones (backend — iw_gsaen + iw_gmovi + iw_tprod, filtrado por mes/año):
 *     Total Cobrado      = ROUND(SUM(m.TotLinea), 0)                        → lo que pagó el cliente
 *     Venta Real (Lista) = ROUND(SUM(t.PrecioVta * m.CantFacturada), 0)     → precio lista sin descuento
 *     % Descuento        = (1 - Total Cobrado / Venta Real Lista) * 100      → descuento real otorgado
 *     Descuento $        = Venta Real Lista - Total Cobrado                  → diferencia absoluta
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

  // ── Formato CLP ────────────────────────────────────────────────────────────────────────
  function formatCLP(v) {
    if (v == null || v === '') return '—';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0
    }).format(Number(v));
  }

  // ── Formato % ─────────────────────────────────────────────────────────────────────────
  function formatPct(v) {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (isNaN(n)) return '—';
    return n.toFixed(2) + '%';
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────────────────
  async function verificarSesion() {
    if (!token()) { window.location.href = '../login/index.html'; return null; }
    try {
      const res  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) { window.location.href = '../login/index.html'; return null; }
      return data.user;
    } catch { window.location.href = '../login/index.html'; return null; }
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────────────────────
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

  // ── Selectores mes/año ────────────────────────────────────────────────────────────────────────
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

  // ── KPIs ─────────────────────────────────────────────────────────────────────────────────
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

  // ── Gráfico de líneas ──────────────────────────────────────────────────────────────────────
  const MESES_LABEL  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  /**
   * Garantiza que el card del gráfico exista en el DOM.
   * Si el contenedor #graficoCard no está presente lo crea e inserta
   * antes de la sección de tablas (o al final de mainContent como fallback).
   */
  function asegurarCardGrafico() {
    if (document.getElementById('graficoCard')) return;

    const card = document.createElement('div');
    card.id        = 'graficoCard';
    card.className = 'card';
    card.style.cssText = 'margin-bottom:1.5rem;padding:1.25rem 1.5rem;';
    card.innerHTML = `
      <h2 id="graficoTitulo" style="font-size:0.95rem;font-weight:600;margin-bottom:1rem;color:var(--color-text);">
        Evolución Mensual — Ventas vs Meta
      </h2>
      <div style="position:relative;height:260px;">
        <canvas id="graficoEvolucion"></canvas>
      </div>`;

    // Insertar antes de la primera sección de tablas, o al final de mainContent
    const ancla = document.querySelector('.ventas-section, .tablas-section, #tablaVendedores, #ventasSection')
                || document.getElementById('mainContent');
    if (ancla && ancla.parentNode && ancla !== document.getElementById('mainContent')) {
      ancla.parentNode.insertBefore(card, ancla);
    } else {
      (document.getElementById('mainContent') || document.body).appendChild(card);
    }
  }

  async function cargarGrafico() {
    try {
      const { mes, anio } = getParams();
      const nombreMes     = MESES_NOMBRE[Number(mes) - 1] || '';
      const tituloGrafico = `Evolución Mensual — ${nombreMes} ${anio}`;

      const res  = await fetch(`${API}/evolucion?${new URLSearchParams({ anio })}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) return;

      const labels = data.evolucion.map(e => MESES_LABEL[e.mes - 1]);
      const ventas = data.evolucion.map(e => e.ventas);
      const meta   = data.evolucion.map(e => e.meta);

      // Asegurar que el card exista antes de buscar sus elementos
      asegurarCardGrafico();

      document.getElementById('graficoTitulo').textContent = tituloGrafico;

      const ctx = document.getElementById('graficoEvolucion').getContext('2d');
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
            title: { display: false },
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

  // ── Tabla 2: ventas del mes (paginada) ─────────────────────────────────────────────────────
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

  // ── Tabla 1: Ventas por Vendedor ──────────────────────────────────────────────────────────
  function renderTablaVendedores(vendedores) {
    const tbody = document.getElementById('tbodyVendedores');

    if (!vendedores || !vendedores.length) {
      tbody.innerHTML = '<tr class="tabla-empty"><td colspan="6">Sin datos para el período seleccionado</td></tr>';
      return;
    }

    const maxCobrado = Math.max(...vendedores.map(v => Number(v.totalVentasCobrado) || 0), 1);

    tbody.innerHTML = vendedores.map(v => {
      const cobrado    = Number(v.totalVentasCobrado) || 0;
      const lista      = Number(v.ventaRealLista)     || 0;
      const pct        = Number(v.pctDescuento)       || 0;
      const descAbs    = lista - cobrado;
      const barPct     = Math.round((cobrado / maxCobrado) * 100);

      const badgeBg    = pct > 15 ? 'rgba(220,53,69,0.12)'  : pct > 5 ? 'rgba(245,166,35,0.12)'  : 'rgba(0,200,140,0.12)';
      const badgeColor = pct > 15 ? '#dc3545'               : pct > 5 ? '#b07000'                : '#00885a';
      const badgeBorder= pct > 15 ? 'rgba(220,53,69,0.35)'  : pct > 5 ? 'rgba(245,166,35,0.35)' : 'rgba(0,200,140,0.35)';

      return `
        <tr>
          <td>
            <span style="
              display:inline-block;
              background:var(--color-bg-offset,#f3f4f6);
              color:var(--color-text,#1a1a2e);
              font-weight:700;
              font-size:0.8rem;
              padding:2px 9px;
              border-radius:4px;
              letter-spacing:0.04em;
            ">${v.codVendedor || '—'}</span>
          </td>
          <td>${v.nombreVendedor || '—'}</td>
          <td style="text-align:center">${v.totalFolios || 0}</td>
          <td style="text-align:right">
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
              <span>${formatCLP(cobrado)}</span>
              <div style="width:100%;max-width:90px;height:4px;background:rgba(0,0,0,0.08);border-radius:2px;overflow:hidden">
                <div style="width:${barPct}%;height:100%;background:var(--color-primary,#00E2A7);border-radius:2px"></div>
              </div>
            </div>
          </td>
          <td style="text-align:right">${formatCLP(lista)}</td>
          <td style="text-align:right">
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">
              <span style="
                display:inline-block;
                background:${badgeBg};
                color:${badgeColor};
                border:1px solid ${badgeBorder};
                font-weight:600;
                font-size:0.78rem;
                padding:2px 8px;
                border-radius:20px;
              ">${formatPct(pct)}</span>
              <span style="font-size:0.72rem;color:var(--color-text-muted,#6b7280)">${formatCLP(descAbs)}</span>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  // ── Modal detalle folio ───────────────────────────────────────────────────────────────────
  async function abrirDetalle(folio) {
    try {
      const res  = await fetch(`${API}/detalle/${folio}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) return;

      const modal   = document.getElementById('modalDetalle');
      const titulo  = document.getElementById('modalTitulo');
      const cuerpo  = document.getElementById('modalCuerpo');

      titulo.textContent = `Detalle Folio #${folio}`;

      if (!data.detalle || !data.detalle.length) {
        cuerpo.innerHTML = '<p style="text-align:center;color:var(--color-text-muted)">Sin líneas de detalle.</p>';
      } else {
        const cabecera = data.detalle[0];
        cuerpo.innerHTML = `
          <div class="modal-info-grid">
            <div class="modal-info-item"><span class="modal-info-label">Cliente</span><span class="modal-info-val">${cabecera.cliente || '—'}</span></div>
            <div class="modal-info-item"><span class="modal-info-label">Vendedor</span><span class="modal-info-val">${cabecera.CodVendedor || '—'}</span></div>
            <div class="modal-info-item"><span class="modal-info-label">Fecha</span><span class="modal-info-val">${cabecera.fecha_formato || '—'}</span></div>
            <div class="modal-info-item"><span class="modal-info-label">Total Folio</span><span class="modal-info-val">${formatCLP(cabecera.monto)}</span></div>
          </div>
          <table class="modal-tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Descripción</th>
                <th style="text-align:right">Cant.</th>
                <th style="text-align:right">P. Lista</th>
                <th style="text-align:right">P. Cobrado</th>
                <th style="text-align:right">Desc. %</th>
                <th style="text-align:right">Total Línea</th>
              </tr>
            </thead>
            <tbody>
              ${data.detalle.map(d => `
                <tr>
                  <td>${d.CodProducto  || '—'}</td>
                  <td>${d.descripcion  || '—'}</td>
                  <td style="text-align:right">${d.CantFacturada ?? '—'}</td>
                  <td style="text-align:right">${formatCLP(d.precioLista)}</td>
                  <td style="text-align:right">${formatCLP(d.PrecioUnitario)}</td>
                  <td style="text-align:right">${formatPct(d.pctDescLinea)}</td>
                  <td style="text-align:right">${formatCLP(d.TotLinea)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`;
      }

      modal.classList.add('modal--open');
    } catch (err) {
      console.error('[abrirDetalle]', err);
    }
  }

  function cerrarModal() {
    document.getElementById('modalDetalle').classList.remove('modal--open');
  }

  // ── Exportar CSV ─────────────────────────────────────────────────────────────────────────
  function exportarCSV() {
    const datos = estado.ventasFiltradas;
    if (!datos.length) return;

    const cabecera = ['Folio','Fecha','Cliente','Vendedor','Monto','Descuento'];
    const filas = datos.map(v => [
      v.Folio, v.fecha_formato, v.cliente, v.CodVendedor,
      v.monto, v.descuento
    ].map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));

    const csv  = [cabecera.join(','), ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `ventas_${getParams().mes}_${getParams().anio}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Búsqueda ─────────────────────────────────────────────────────────────────────────────
  function buscar() {
    estado.paginaActual = 1;
    renderTabla();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────────────────
  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;
    estado.usuario = usuario;

    cargarSidebar(usuario);
    initFiltros(usuario);
    initSort();

    document.getElementById('btnBuscar')?.addEventListener('click', buscar);
    document.getElementById('tablaBusqueda')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') buscar();
    });
    document.getElementById('btnExportarCSV')?.addEventListener('click', exportarCSV);
    document.getElementById('modalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('modalOverlay')?.addEventListener('click', cerrarModal);

    async function cargarTodo() {
      const { mes, anio } = getParams();

      const [resKpi, resVend, resVentas] = await Promise.all([
        fetch(`${API}/kpis?${new URLSearchParams({ mes, anio })}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}/resumen-vendedores?${new URLSearchParams({ mes, anio })}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}/ventas-mes?${new URLSearchParams({ mes, anio })}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
      ]);

      const [dataKpi, dataVend, dataVentas] = await Promise.all([
        resKpi.json(), resVend.json(), resVentas.json()
      ]);

      if (dataKpi.ok)    renderKpis(dataKpi.totalVentas, dataKpi.metaMes, dataKpi.totalDescuento);
      if (dataVend.ok)   renderTablaVendedores(dataVend.vendedores);
      if (dataVentas.ok) {
        estado.ventas          = dataVentas.ventas || [];
        estado.ventasFiltradas = estado.ventas;
        estado.paginaActual    = 1;
        renderTabla();
      }

      await cargarGrafico();
    }

    await cargarTodo();

    document.getElementById('filtroMes')?.addEventListener('change', cargarTodo);
    document.getElementById('filtroAnio')?.addEventListener('change', cargarTodo);
    document.getElementById('filtroVendedor')?.addEventListener('change', () => {
      const cod = document.getElementById('filtroVendedor').value;
      estado.ventasFiltradas = cod
        ? estado.ventas.filter(v => String(v.CodVendedor) === String(cod))
        : estado.ventas;
      estado.paginaActual = 1;
      renderTabla();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

})();
