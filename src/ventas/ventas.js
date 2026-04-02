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
 *   Definiciones (backend — iw_gsaen + iw_gmovi + iw_tprod, SIN filtro mes/año):
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

  // ── Tabla 1: Ventas por Vendedor (histórico, sin filtro mes/año) ─────────────────────────
  //
  // Campos del response (resumen-vendedores):
  //   v.codVendedor        — código del vendedor
  //   v.nombreVendedor     — MIN(h.NomAux) desde iw_gsaen
  //   v.totalFolios        — COUNT(DISTINCT h.Folio)
  //   v.totalVentasCobrado — ROUND(SUM(m.TotLinea), 0)         → lo cobrado al cliente
  //   v.ventaRealLista     — ROUND(SUM(t.PrecioVta * Cant), 0) → precio lista sin desc.
  //   v.pctDescuento       — % descuento real otorgado
  //   descuentoAbsoluto    — ventaRealLista - totalVentasCobrado (calculado en frontend)
  //
  // Diseño tabla:
  //   - Barra de progreso horizontal en columna «Total Cobrado» relativa al máximo del set
  //   - Badge de color semafórico en «% Descuento»:
  //       verde  (<=5%)  → desempeño óptimo
  //       amarillo (>5% y <=15%) → alerta moderada
  //       rojo (>15%)   → descuento elevado
  //   - Tooltip en «% Descuento» con descuento absoluto en CLP
  //
  function renderTablaVendedores(vendedores) {
    const tbody = document.getElementById('tbodyVendedores');

    if (!vendedores || !vendedores.length) {
      tbody.innerHTML = '<tr class="tabla-empty"><td colspan="6">Sin datos para el período seleccionado</td></tr>';
      return;
    }

    // Máximo para escalar la barra de progreso
    const maxCobrado = Math.max(...vendedores.map(v => Number(v.totalVentasCobrado) || 0), 1);

    tbody.innerHTML = vendedores.map(v => {
      const cobrado    = Number(v.totalVentasCobrado) || 0;
      const lista      = Number(v.ventaRealLista)     || 0;
      const pct        = Number(v.pctDescuento)       || 0;
      const descAbs    = lista - cobrado;
      const barPct     = Math.round((cobrado / maxCobrado) * 100);

      // Colores semafóricos para el badge de descuento
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
              border-radius:6px;
              letter-spacing:0.04em;
            ">${v.codVendedor || '—'}</span>
          </td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
              title="${(v.nombreVendedor || '').replace(/"/g,'&quot;')}">
            ${v.nombreVendedor || '—'}
          </td>
          <td style="text-align:center;font-variant-numeric:tabular-nums">
            ${v.totalFolios ?? '—'}
          </td>
          <td style="text-align:right">
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
              <span style="font-variant-numeric:tabular-nums;font-weight:600">${formatCLP(cobrado)}</span>
              <div style="width:100%;max-width:120px;height:4px;background:var(--color-border,#e2e8f0);border-radius:999px;overflow:hidden">
                <div style="height:4px;width:${barPct}%;background:var(--color-primary,#00E2A7);border-radius:999px;transition:width .4s ease"></div>
              </div>
            </div>
          </td>
          <td style="text-align:right;font-variant-numeric:tabular-nums">
            ${formatCLP(lista)}
          </td>
          <td style="text-align:right">
            <span
              title="Descuento absoluto: ${formatCLP(descAbs)}"
              style="
                display:inline-block;
                padding:3px 10px;
                border-radius:999px;
                font-size:0.82rem;
                font-weight:700;
                background:${badgeBg};
                color:${badgeColor};
                border:1px solid ${badgeBorder};
                cursor:default;
              ">${formatPct(pct)}</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ── Tabla 3: Modal detalle folio ────────────────────────────────────────────────────────────
  async function abrirDetalle(folio) {
    const overlay = document.getElementById('modalOverlay');
    const tbody   = document.getElementById('modalTbody');
    const totalEl = document.getElementById('modalTotalValor');

    const venta = ventasMes.find(v => String(v.Folio) === String(folio));
    document.getElementById('modalTitulo').textContent    = `Folio N° ${folio}`;
    document.getElementById('modalSubtitulo').textContent = venta
      ? `${venta.cliente || ''} • ${venta.fecha_formato || ''}` : '';
    document.getElementById('modalResumen').innerHTML = venta ? `
      <div class="modal-chip"><span>Vendedor</span><strong>${venta.CodVendedor || '—'}</strong></div>
      <div class="modal-chip"><span>Monto</span><strong>${formatCLP(venta.monto)}</strong></div>
      <div class="modal-chip"><span>Descuento</span><strong>${formatCLP(venta.descuento)}</strong></div>
    ` : '';

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem">Cargando...</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--color-gray-mid)">Sin líneas de detalle</td></tr>';
        return;
      }

      const total = data.detalle.reduce((s, l) => s + (Number(l.TotLinea) || 0), 0);
      tbody.innerHTML = data.detalle.map(l => `
        <tr>
          <td><code>${l.CodProd || '—'}</code></td>
          <td>${l.DesProd || '—'}</td>
          <td style="text-align:center">${l.CantFacturada ?? '—'}</td>
          <td style="text-align:right">${formatCLP(l.precio_unitario_cobrado)}</td>
          <td style="text-align:right">${formatCLP(l.precio_historico_ajustado)}</td>
          <td style="text-align:right">${l.pct_descuento != null ? l.pct_descuento + '%' : '—'}</td>
          <td style="text-align:right"><strong>${formatCLP(l.TotLinea)}</strong></td>
        </tr>
      `).join('');
      totalEl.textContent = formatCLP(total);

    } catch (err) {
      console.error('[abrirDetalle]', err);
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--color-danger)">⚠️ Error al cargar detalle</td></tr>';
    }
  }

  function cerrarModal() {
    document.getElementById('modalOverlay').classList.remove('modal-overlay--visible');
    document.getElementById('modalOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // ── Exportar CSV ─────────────────────────────────────────────────────────────────────────
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

  // ── buildLayout: construye todo el HTML del mainContent ──────────────────────────────────
  function buildLayout() {
    document.getElementById('pageLoader').style.display = 'none';
    document.getElementById('mainContent').innerHTML = `

      <!-- Filtros -->
      <section class="filtros-bar">
        <div class="filtros-group">
          <label for="filtroMes">Mes</label>
          <select id="filtroMes" class="filtro-select"></select>
        </div>
        <div class="filtros-group">
          <label for="filtroAnio">Año</label>
          <select id="filtroAnio" class="filtro-select"></select>
        </div>
        <div class="filtros-group">
          <label for="filtroVendedor">Vendedor</label>
          <select id="filtroVendedor" class="filtro-select">
            <option value="">Todos</option>
          </select>
        </div>
        <div class="filtros-actions">
          <button id="btnBuscar" class="btn btn-primary">Buscar</button>
          <button id="btnLimpiar" class="btn btn-ghost">Limpiar</button>
          <button id="btnExportar" class="btn btn-ghost">Exportar CSV</button>
        </div>
      </section>

      <!-- KPIs -->
      <section class="kpis-grid">
        <div class="kpi-card">
          <span class="kpi-label">Total Ventas</span>
          <span class="kpi-valor" id="kpiTotalVentas">—</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Meta del Mes</span>
          <span class="kpi-valor" id="kpiMeta">—</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Descuentos</span>
          <span class="kpi-valor" id="kpiDescuento">—</span>
        </div>
        <div class="kpi-card kpi-card--progress">
          <span class="kpi-label">Progreso Meta</span>
          <span class="kpi-valor" id="kpiProgresoPct">—</span>
          <div class="progreso-bar"><div id="progresoFill" class="progreso-fill"></div></div>
        </div>
      </section>

      <!-- Gráfico -->
      <section class="grafico-section">
        <h2 class="section-title">Evolución de Ventas</h2>
        <div class="grafico-wrapper">
          <canvas id="graficoVentas"></canvas>
        </div>
      </section>

      <!-- Tabla Vendedores: 6 columnas (histórico sin filtro mes/año) -->
      <section class="tabla-section">
        <div class="tabla-header">
          <div>
            <h2 class="section-title">Ventas por Vendedor</h2>
            <p style="font-size:0.8rem;color:var(--color-gray-mid,#888);margin-top:2px;margin-bottom:0">
              Histórico completo · Los filtros de mes/año no aplican a esta tabla
            </p>
          </div>
        </div>
        <div class="tabla-scroll">
          <table class="ventas-tabla tabla-vendedores">
            <thead>
              <tr>
                <th style="width:110px">Cód. Vendedor</th>
                <th>Nombre Vendedor</th>
                <th style="text-align:center;width:80px">Folios</th>
                <th style="text-align:right">Total Cobrado</th>
                <th style="text-align:right">Venta Real (Lista)</th>
                <th style="text-align:right;width:130px">% Descuento</th>
              </tr>
            </thead>
            <tbody id="tbodyVendedores">
              <tr class="tabla-empty"><td colspan="6">Aplica los filtros para ver los datos</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Tabla Ventas del Mes -->
      <section class="tabla-section">
        <div class="tabla-header">
          <h2 class="section-title">Ventas del Mes</h2>
          <div class="tabla-controles">
            <input type="text" id="tablaBusqueda" class="tabla-busqueda" placeholder="Buscar folio o cliente…" />
            <span class="tabla-total" id="tablaTotal"></span>
          </div>
        </div>
        <div class="tabla-scroll">
          <table class="ventas-tabla">
            <thead>
              <tr>
                <th data-col="Folio">Folio</th>
                <th data-col="fecha_formato">Fecha</th>
                <th data-col="cliente">Cliente</th>
                <th data-col="CodVendedor">Vendedor</th>
                <th data-col="monto">Monto</th>
                <th data-col="descuento">Descuento</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody id="ventasTbody">
              <tr class="tabla-empty"><td colspan="7">Aplica los filtros para ver las ventas</td></tr>
            </tbody>
          </table>
        </div>
        <div class="paginacion" id="paginacion"></div>
      </section>

      <!-- Modal detalle folio -->
      <div class="modal-overlay" id="modalOverlay" aria-hidden="true" role="dialog" aria-modal="true">
        <div class="modal-panel">
          <div class="modal-header">
            <div>
              <h3 class="modal-titulo" id="modalTitulo">Detalle Folio</h3>
              <p class="modal-subtitulo" id="modalSubtitulo"></p>
            </div>
            <button class="modal-cerrar" id="modalCerrar" aria-label="Cerrar modal">✕</button>
          </div>
          <div class="modal-resumen" id="modalResumen"></div>
          <div class="tabla-scroll">
            <table class="ventas-tabla modal-tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Precio Cobrado</th>
                  <th>Precio Histórico</th>
                  <th>% Desc.</th>
                  <th>Total Línea</th>
                </tr>
              </thead>
              <tbody id="modalTbody"></tbody>
            </table>
          </div>
          <div class="modal-footer">
            <span>Total Folio</span>
            <strong id="modalTotalValor">—</strong>
          </div>
        </div>
      </div>
    `;
  }

  // ── Carga principal ────────────────────────────────────────────────────────────────────────
  async function buscar() {
    const params = getParams();

    // Skeleton en tabla ventas del mes
    document.getElementById('ventasTbody').innerHTML =
      Array(5).fill('<tr>' + Array(7).fill(
        '<td><div class="skeleton" style="height:14px;width:80%"></div></td>'
      ).join('') + '</tr>').join('');

    // Skeleton en tabla vendedores
    document.getElementById('tbodyVendedores').innerHTML =
      Array(3).fill('<tr>' + Array(6).fill(
        '<td><div class="skeleton" style="height:14px;width:70%"></div></td>'
      ).join('') + '</tr>').join('');

    try {
      // resumen-vendedores NO recibe mes/anio (histórico total)
      const [resMeta, resVentas, resVend] = await Promise.all([
        fetch(`${API}/meta?${new URLSearchParams({ anio: params.anio })}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}?${new URLSearchParams(params)}`,
          { headers: { Authorization: `Bearer ${token()}` } }),
        fetch(`${API}/resumen-vendedores`,
          { headers: { Authorization: `Bearer ${token()}` } }),
      ]);

      const [dataMeta, dataVentas, dataVend] = await Promise.all([
        resMeta.json(), resVentas.json(), resVend.json()
      ]);

      const metaMes = dataMeta.ok ? dataMeta.metaMes : 0;

      ventasMes              = dataVentas.ok ? dataVentas.ventas || [] : [];
      estado.ventas          = ventasMes;
      estado.ventasFiltradas = ventasMes;
      estado.paginaActual    = 1;

      const totalVentas    = ventasMes.reduce((s, v) => s + (Number(v.monto)     || 0), 0);
      const totalDescuento = ventasMes.reduce((s, v) => s + (Number(v.descuento) || 0), 0);
      renderKpis(totalVentas, metaMes, totalDescuento);

      // Renderizar tabla vendedores con nueva función
      if (dataVend.ok) {
        renderTablaVendedores(dataVend.vendedores);
      }

      renderTabla();
      cargarGrafico();

    } catch (err) {
      console.error('[buscar]', err);
      document.getElementById('ventasTbody').innerHTML =
        '<tr class="tabla-empty"><td colspan="7">⚠️ Error al cargar ventas.</td></tr>';
      document.getElementById('tbodyVendedores').innerHTML =
        '<tr class="tabla-empty"><td colspan="6">⚠️ Error al cargar vendedores.</td></tr>';
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────────────────
  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;
    estado.usuario = usuario;

    buildLayout();
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
        '<tr class="tabla-empty"><td colspan="6">—</td></tr>';
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
