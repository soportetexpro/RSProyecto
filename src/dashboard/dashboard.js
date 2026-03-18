'use strict';


/**
 * dashboard.js — RSProyecto Texpro
 * 4 KPIs reales + gráfico líneas ventas vs meta + 3 tablas + modal detalle
 */

(function () {

  const API  = '/api/dashboard';
  const token = () => localStorage.getItem('token');

  let graficoEvolucion = null;
  let ventasMes        = [];

  // ── Formato CLP ───────────────────────────────────────────────
  function formatCLP(v) {
    if (v == null || v === '') return '—';
    return new Intl.NumberFormat('es-CL', {
      style: 'currency', currency: 'CLP', maximumFractionDigits: 0
    }).format(Number(v));
  }

  // ── Auth ──────────────────────────────────────────────────────
  async function verificarSesion() {
    if (!token()) { window.location.href = '../login/index.html'; return null; }
    try {
      const res  = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) { window.location.href = '../login/index.html'; return null; }
      return data.user;
    } catch { window.location.href = '../login/index.html'; return null; }
  }

  // ── Sidebar ───────────────────────────────────────────────────
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
    const ini = (usuario.nombre||'U').split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase();
    document.getElementById('userName').textContent  = usuario.nombre  || usuario.email;
    document.getElementById('userArea').textContent   = usuario.area    || '';
    document.getElementById('userAvatar').textContent = ini;
    document.getElementById('chipAvatar').textContent = ini;
    document.getElementById('chipName').textContent   = (usuario.nombre||usuario.email).split(' ')[0];
    document.getElementById('headerDate').textContent = new Date().toLocaleDateString('es-CL',
      { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    document.getElementById('welcomeTitle').textContent    = `Hola, ${(usuario.nombre||usuario.email).split(' ')[0]} 👋`;
    document.getElementById('welcomeSubtitle').textContent = `Área: ${usuario.area||'Sistema'} — Texpro`;

    // Nav
    const nav     = document.getElementById('sidebarNav');
    const visibles = MODULOS.filter(m =>
      usuario.is_admin || m.area.includes('admin') ? usuario.is_admin : m.area.includes(usuario.area)
    );
    nav.innerHTML = `<span class="nav-section-title">NAVEGACIÓN</span>
      <a class="nav-item active" href="#">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="nav-label">Dashboard</span>
      </a>
      ${visibles.map(m=>`<a class="nav-item" href="${m.url}"><span style="font-size:1rem">${m.icon}</span><span class="nav-label">${m.nombre}</span></a>`).join('')}`;

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

  // ── Selectores mes/año ────────────────────────────────────────
  function initSelectores() {
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
  }

  function getParams() {
    return {
      mes:  document.getElementById('filtroMes').value,
      anio: document.getElementById('filtroAnio').value,
    };
  }

  // ── KPIs ──────────────────────────────────────────────────────
  async function cargarResumen() {
    try {
      const res  = await fetch(`${API}/resumen?${new URLSearchParams(getParams())}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const { totalVentas, meta, progreso, totalDescuento } = data;
      document.getElementById('kpiTotalVentas').textContent = formatCLP(totalVentas);
      document.getElementById('kpiMeta').textContent        = formatCLP(meta);
      document.getElementById('kpiDescuento').textContent   = formatCLP(totalDescuento);

      const pct = Math.min(progreso, 100);
      document.getElementById('kpiProgresoPct').textContent = `${progreso}%`;
      const fill = document.getElementById('progresoFill');
      fill.style.width = `${pct}%`;
      fill.style.background = progreso >= 100 ? 'var(--color-primary)'
                            : progreso >= 70  ? 'var(--color-accent)'
                            : 'var(--color-danger)';
    } catch (err) {
      console.error('[cargarResumen]', err);
    }
  }

  // ── Gráfico de líneas ─────────────────────────────────────────
  const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  async function cargarGrafico() {
    try {
      const res  = await fetch(`${API}/evolucion?${new URLSearchParams({ anio: getParams().anio })}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const labels  = data.evolucion.map(e => MESES_LABEL[e.mes - 1]);
      const ventas  = data.evolucion.map(e => e.ventas);
      const meta    = data.evolucion.map(e => e.meta);

      const ctx = document.getElementById('graficoEvolucion').getContext('2d');

      if (graficoEvolucion) graficoEvolucion.destroy();

      graficoEvolucion = new Chart(ctx, {
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
            legend: { position: 'top', labels: { font: { family:'Montserrat', size:12 }, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const v = ctx.parsed.y;
                  return ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                font: { family:'Open Sans', size:11 },
                callback: v => new Intl.NumberFormat('es-CL',{notation:'compact',compactDisplay:'short'}).format(v)
              },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: {
              ticks: { font: { family:'Open Sans', size:11 } },
              grid: { display: false }
            }
          }
        }
      });
    } catch (err) {
      console.error('[cargarGrafico]', err);
    }
  }

  // ── Tabla 1: vendedores ───────────────────────────────────────
  async function cargarVendedores() {
    try {
      const res  = await fetch(`${API}/vendedores?${new URLSearchParams(getParams())}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      const tbody = document.getElementById('tbodyVendedores');
      if (!data.ok || !data.vendedores.length) {
        tbody.innerHTML = '<tr class="tabla-empty"><td colspan="3">Sin datos</td></tr>'; return;
      }
      tbody.innerHTML = data.vendedores.map(v => `
        <tr>
          <td><strong>${v.codVendedor}</strong></td>
          <td>${v.folios}</td>
          <td style="text-align:right">${formatCLP(v.totalVentas)}</td>
        </tr>
      `).join('');
    } catch (err) { console.error('[cargarVendedores]', err); }
  }

  // ── Tabla 2: ventas del mes ───────────────────────────────────
  async function cargarVentasMes() {
    try {
      const res  = await fetch(`${API}/ventas-mes?${new URLSearchParams(getParams())}`,
        { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      ventasMes = data.ventas || [];
      renderVentasMes(ventasMes);
    } catch (err) { console.error('[cargarVentasMes]', err); }
  }

  function renderVentasMes(lista) {
    const tbody = document.getElementById('tbodyVentasMes');
    document.getElementById('totalVentasMes').textContent = `${lista.length.toLocaleString('es-CL')} registros`;
    if (!lista.length) {
      tbody.innerHTML = '<tr class="tabla-empty"><td colspan="7">Sin registros</td></tr>'; return;
    }
    tbody.innerHTML = lista.map(v => `
      <tr>
        <td><strong>${v.Folio||'—'}</strong></td>
        <td>${v.fecha_formato||'—'}</td>
        <td>${v.cliente||'—'}</td>
        <td>${v.CodVendedor||'—'}</td>
        <td style="text-align:right">${formatCLP(v.monto)}</td>
        <td style="text-align:right">${formatCLP(v.descuento)}</td>
        <td style="text-align:center">
          <button class="btn-detalle" data-folio="${v.Folio}" title="Ver detalle">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
    tbody.querySelectorAll('.btn-detalle').forEach(btn =>
      btn.addEventListener('click', () => abrirDetalle(btn.dataset.folio))
    );
  }

  // ── Modal detalle ─────────────────────────────────────────────
  async function abrirDetalle(folio) {
    const overlay = document.getElementById('modalOverlay');
    const tbody   = document.getElementById('modalTbody');
    document.getElementById('modalTitulo').textContent = `Folio N° ${folio}`;
    const venta = ventasMes.find(v => String(v.Folio) === String(folio));
    document.getElementById('modalSubtitulo').textContent = venta ? `${venta.cliente||''} • ${venta.fecha_formato||''}` : '';
    document.getElementById('modalTotalValor').textContent = '—';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem">Cargando...</td></tr>';
    overlay.classList.add('modal-overlay--visible');
    overlay.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';

    try {
      const res  = await fetch(`${API}/detalle/${folio}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok || !data.detalle?.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--color-gray-mid)">Sin líneas de detalle</td></tr>';
        return;
      }
      const total = data.detalle.reduce((s,l)=>s+(Number(l.Total)||0),0);
      tbody.innerHTML = data.detalle.map(l=>`
        <tr>
          <td><code>${l.CodProd||'—'}</code></td>
          <td>${l.DesProd||'—'}</td>
          <td style="text-align:center">${l.CantFacturada??'—'}</td>
          <td style="text-align:right">${formatCLP(l.PrecioUnitario)}</td>
          <td style="text-align:right"><strong>${formatCLP(l.Total)}</strong></td>
        </tr>
      `).join('');
      document.getElementById('modalTotalValor').textContent = formatCLP(total);
    } catch(err) {
      console.error('[abrirDetalle]', err);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger)">⚠️ Error al cargar</td></tr>';
    }
  }

  function cerrarModal() {
    document.getElementById('modalOverlay').classList.remove('modal-overlay--visible');
    document.getElementById('modalOverlay').setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // ── Cargar todo ───────────────────────────────────────────────
  async function cargarTodo() {
    await Promise.all([ cargarResumen(), cargarGrafico(), cargarVendedores(), cargarVentasMes() ]);
  }

  // ── Init ──────────────────────────────────────────────────────
  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;

    cargarSidebar(usuario);
    initSelectores();

    // Busqueda en tabla ventas mes
    document.getElementById('busquedaVentas').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderVentasMes(ventasMes.filter(v =>
        String(v.Folio||'').toLowerCase().includes(q) ||
        String(v.cliente||'').toLowerCase().includes(q)
      ));
    });

    // Modal
    document.getElementById('modalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('modalOverlay').addEventListener('click', e => {
      if (e.target === e.currentTarget) cerrarModal();
    });
    document.addEventListener('keydown', e => { if (e.key==='Escape') cerrarModal(); });

    // Actualizar
    document.getElementById('btnActualizar').addEventListener('click', cargarTodo);

    // Carga inicial
    cargarTodo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
