'use strict';

/**
 * dashboard.js — RSProyecto Texpro
 * Cambios:
 * - Layout: tabla vendedores encima de ventas mes (una sola columna)
 * - coordVendedor: ahora es <select> con lista de todos los vendedores
 * - Tabla asignados: CRUD inline (editar vendedor+%, guardar, cancelar, eliminar)
 * - Al eliminar asignacion: el folio vuelve a aparecer en coordFolio
 */

(function () {

  const API   = '/api/dashboard';
  const token = () => localStorage.getItem('token');

  let graficoEvolucion  = null;
  let ventasMes         = [];
  let todosVendedores   = [];  // [{ cod, nombre }]

  function formatCLP(v) {
    if (v == null || v === '') return '—';
    return new Intl.NumberFormat('es-CL', { style:'currency', currency:'CLP', maximumFractionDigits:0 }).format(Number(v));
  }

  async function verificarSesion() {
    if (!token()) { window.location.href = '../login/index.html'; return null; }
    try {
      const res  = await fetch('/api/auth/me', { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) { window.location.href = '../login/index.html'; return null; }
      return data.user;
    } catch { window.location.href = '../login/index.html'; return null; }
  }

  function esCoordinador(usuario) {
    return (usuario.vendedores || []).some(v => v.tipo === 'C');
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────
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

    const nav      = document.getElementById('sidebarNav');
    const visibles = MODULOS.filter(m =>
      usuario.is_admin
        ? m.area.includes('admin') || true
        : m.area.includes(usuario.area)
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

  // ── Selectores mes/año ──────────────────────────────────────────────────────
  function initSelectores() {
    const hoy   = new Date();
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
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
    return { mes: document.getElementById('filtroMes').value, anio: document.getElementById('filtroAnio').value };
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  async function cargarResumen() {
    try {
      const res  = await fetch(`${API}/resumen?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const { totalVentas, meta, progreso, pctDescuentoGlobal } = data;
      document.getElementById('kpiTotalVentas').textContent = formatCLP(totalVentas);
      document.getElementById('kpiMeta').textContent        = formatCLP(meta);
      document.getElementById('kpiDescuento').textContent   = pctDescuentoGlobal > 0 ? `${pctDescuentoGlobal}%` : '0%';
      const pct  = Math.min(progreso, 100);
      document.getElementById('kpiProgresoPct').textContent = `${progreso}%`;
      const fill = document.getElementById('progresoFill');
      fill.style.width      = `${pct}%`;
      fill.style.background = progreso >= 100 ? 'var(--color-primary)' : progreso >= 70 ? 'var(--color-accent)' : 'var(--color-danger)';
    } catch (err) { console.error('[cargarResumen]', err); }
  }

  // ── Gráfico ──────────────────────────────────────────────────────────────
  const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  async function cargarGrafico() {
    try {
      const res  = await fetch(`${API}/evolucion?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const labels = data.evolucion.map(e => MESES_LABEL[e.mes - 1]);
      const ventas = data.evolucion.map(e => e.ventas);
      const meta   = data.evolucion.map(e => e.meta);
      const ctx = document.getElementById('graficoEvolucion').getContext('2d');
      if (graficoEvolucion) graficoEvolucion.destroy();
      graficoEvolucion = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[
          { label:'Ventas', data:ventas, borderColor:'#00E2A7', backgroundColor:'rgba(0,226,167,0.08)', tension:0.4, fill:true, pointRadius:5, pointHoverRadius:7, borderWidth:2.5 },
          { label:'Meta',   data:meta,   borderColor:'#F5A623', backgroundColor:'transparent', borderDash:[6,4], tension:0, fill:false, pointRadius:0, borderWidth:2 }
        ]},
        options:{
          responsive:true, maintainAspectRatio:false,
          interaction:{ mode:'index', intersect:false },
          plugins:{
            legend:{ position:'top', labels:{ font:{ family:'Montserrat', size:12 }, usePointStyle:true } },
            tooltip:{ callbacks:{ label:ctx => ` ${ctx.dataset.label}: ${new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(ctx.parsed.y)}` } }
          },
          scales:{
            y:{ beginAtZero:true, ticks:{ font:{family:'Open Sans',size:11}, callback: v => new Intl.NumberFormat('es-CL',{notation:'compact',compactDisplay:'short'}).format(v) }, grid:{color:'rgba(0,0,0,0.05)'} },
            x:{ ticks:{font:{family:'Open Sans',size:11}}, grid:{display:false} }
          }
        }
      });
    } catch (err) { console.error('[cargarGrafico]', err); }
  }

  // ── Tabla vendedores (ancho completo) ─────────────────────────────────────────
  async function cargarVendedores() {
    try {
      const res  = await fetch(`${API}/vendedores?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      const tbody = document.getElementById('tbodyVendedores');
      if (!data.ok || !data.vendedores.length) {
        tbody.innerHTML = '<tr class="tabla-empty"><td colspan="4">Sin datos</td></tr>'; return;
      }
      tbody.innerHTML = data.vendedores.map(v => `
        <tr>
          <td><strong>${v.codVendedor}</strong></td>
          <td>${v.nombreVendedor || '—'}</td>
          <td>${v.folios}</td>
          <td style="text-align:right">${formatCLP(v.totalVentas)}</td>
        </tr>`).join('');
    } catch (err) { console.error('[cargarVendedores]', err); }
  }

  // ── Tabla ventas del mes ───────────────────────────────────────────────────
  async function cargarVentasMes() {
    try {
      const res  = await fetch(`${API}/ventas-mes?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      ventasMes = data.ventas || [];
      renderVentasMes(ventasMes);
    } catch (err) { console.error('[cargarVentasMes]', err); }
  }

  function renderVentasMes(lista) {
    const tbody = document.getElementById('tbodyVentasMes');
    document.getElementById('totalVentasMes').textContent = `${lista.length.toLocaleString('es-CL')} registros`;
    if (!lista.length) { tbody.innerHTML = '<tr class="tabla-empty"><td colspan="7">Sin registros</td></tr>'; return; }
    tbody.innerHTML = lista.map(v => {
      const pctDesc      = v.pct_descuento > 0 ? `${v.pct_descuento}%` : '—';
      const montoMostrar = v.es_compartido && v.monto_asignado != null ? v.monto_asignado : v.monto;
      const badgeComp    = v.es_compartido
        ? `<span style="font-size:.7rem;background:#00E2A7;color:#000;border-radius:4px;padding:1px 5px;margin-left:4px">Compartido ${v.porcentaje_asignado?v.porcentaje_asignado+'%':''}</span>`
        : '';
      return `<tr>
        <td><strong>${v.Folio||'—'}</strong>${badgeComp}</td>
        <td>${v.fecha_formato||'—'}</td>
        <td>${v.cliente||'—'}</td>
        <td>${v.CodVendedor||'—'}</td>
        <td style="text-align:right">${formatCLP(montoMostrar)}</td>
        <td style="text-align:right">${pctDesc}</td>
        <td style="text-align:center">
          <button class="btn-detalle" data-folio="${v.Folio}" title="Ver detalle">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.btn-detalle').forEach(btn =>
      btn.addEventListener('click', () => abrirDetalle(btn.dataset.folio))
    );
  }

  // ── Modal detalle ─────────────────────────────────────────────────────────
  async function abrirDetalle(folio) {
    const overlay = document.getElementById('modalOverlay');
    const tbody   = document.getElementById('modalTbody');
    document.getElementById('modalTitulo').textContent    = `Folio N° ${folio}`;
    const venta = ventasMes.find(v => String(v.Folio) === String(folio));
    document.getElementById('modalSubtitulo').textContent = venta ? `${venta.cliente||''} • ${venta.fecha_formato||''}` : '';
    document.getElementById('modalTotalValor').textContent = '—';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem">Cargando...</td></tr>';
    overlay.classList.add('modal-overlay--visible');
    overlay.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    try {
      const res  = await fetch(`${API}/detalle/${folio}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!res.ok || !data.ok) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger)">⚠️ Error</td></tr>'; return; }
      if (!data.detalle?.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Sin líneas</td></tr>'; return; }
      const total = data.detalle.reduce((s,l)=>s+(Number(l.TotLinea)||0),0);
      tbody.innerHTML = data.detalle.map(l=>`
        <tr>
          <td><code>${l.CodProd||'—'}</code></td>
          <td>${l.DesProd||'—'}</td>
          <td style="text-align:center">${l.CantFacturada??'—'}</td>
          <td style="text-align:right">${formatCLP(l.precio_unitario_cobrado)}</td>
          <td style="text-align:right"><strong>${formatCLP(l.TotLinea)}</strong></td>
        </tr>`).join('');
      document.getElementById('modalTotalValor').textContent = formatCLP(total);
    } catch(err) { console.error('[abrirDetalle]',err); tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--color-danger)">⚠️ Error</td></tr>'; }
  }

  function cerrarModal() {
    document.getElementById('modalOverlay').classList.remove('modal-overlay--visible');
    document.getElementById('modalOverlay').setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  // ══ PANEL COORDINADOR (tipo C) ═══════════════════════════════════════════

  /** Carga lista de todos los vendedores y puebla el <select> coordVendedor */
  async function cargarListaVendedores() {
    try {
      const res  = await fetch(`${API}/vendedores-todos`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      if (!data.ok || !data.vendedores?.length) return;
      todosVendedores = data.vendedores; // [{ cod, nombre }]
      const sel = document.getElementById('coordVendedor');
      sel.innerHTML = '<option value="">— Selecciona vendedor —</option>' +
        data.vendedores.map(v =>
          `<option value="${v.cod}">${v.cod} — ${v.nombre||'Sin nombre'}</option>`
        ).join('');
    } catch(err) { console.error('[cargarListaVendedores]', err); }
  }

  async function iniciarPanelCoordinador() {
    document.getElementById('panelCoordinador').style.display = 'block';
    document.getElementById('panelCompartidos').style.display = 'none';
    await Promise.all([ cargarListaVendedores(), cargarFoliosParaCompartir(), cargarFoliosAsignados() ]);

    document.getElementById('btnCompartir').addEventListener('click', async () => {
      const folio      = document.getElementById('coordFolio').value;
      const vendedor   = document.getElementById('coordVendedor').value;
      const porcentaje = document.getElementById('coordPorcentaje').value;
      const msgEl      = document.getElementById('coordMensaje');
      if (!folio || !vendedor || !porcentaje) {
        msgEl.textContent = '⚠️ Completa todos los campos'; msgEl.style.color = 'var(--color-danger)'; return;
      }
      try {
        msgEl.textContent = 'Enviando...'; msgEl.style.color = 'var(--color-gray-mid)';
        const res  = await fetch(`${API}/compartir`, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token()}` },
          body: JSON.stringify({ folio:Number(folio), cod_vendedor_compartido:vendedor, porcentaje:Number(porcentaje) })
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        msgEl.textContent = '✅ Folio asignado correctamente'; msgEl.style.color = 'var(--color-primary)';
        document.getElementById('coordVendedor').value   = '';
        document.getElementById('coordPorcentaje').value = '100';
        await Promise.all([ cargarFoliosParaCompartir(), cargarFoliosAsignados(), cargarResumen(), cargarVentasMes() ]);
      } catch(err) { msgEl.textContent = `❌ ${err.message}`; msgEl.style.color = 'var(--color-danger)'; }
    });
  }

  async function cargarFoliosParaCompartir() {
    try {
      const res  = await fetch(`${API}/compartir/lista?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      const sel  = document.getElementById('coordFolio');
      if (!data.ok || !data.folios?.length) {
        sel.innerHTML = '<option value="">— Sin folios disponibles —</option>'; return;
      }
      sel.innerHTML = '<option value="">— Selecciona un folio —</option>' +
        data.folios.map(f =>
          `<option value="${f.Folio}">${f.Folio} — ${f.cliente||'?'} — ${formatCLP(f.monto)}</option>`
        ).join('');
    } catch(err) { console.error('[cargarFoliosParaCompartir]',err); }
  }

  // ─── CRUD asignaciones coordinador ───────────────────────────────────────────────

  function opcionesVendedores(seleccionado) {
    return todosVendedores.map(v =>
      `<option value="${v.cod}" ${v.cod === seleccionado ? 'selected' : ''}>${v.cod} — ${v.nombre||'Sin nombre'}</option>`
    ).join('');
  }

  function filaAsignadoVista(c) {
    return `
      <td><strong>${c.folio}</strong></td>
      <td>${c.fecha ? new Date(c.fecha).toLocaleDateString('es-CL') : '—'}</td>
      <td>${c.cliente||'—'}</td>
      <td>${c.nombre_vendedor_compartido||c.cod_vendedor_compartido||'—'}</td>
      <td style="text-align:right">${c.porcentaje}%</td>
      <td style="text-align:right">${formatCLP(c.monto_asignado)}</td>
      <td>
        <div class="crud-acciones">
          <button class="btn-crud btn-crud--edit" title="Editar" data-id="${c.id}">&#9998;</button>
          <button class="btn-crud btn-crud--del"  title="Eliminar" data-id="${c.id}" data-folio="${c.folio}">&times;</button>
        </div>
      </td>`;
  }

  function filaAsignadoEdicion(c) {
    return `
      <td><strong>${c.folio}</strong></td>
      <td>${c.fecha ? new Date(c.fecha).toLocaleDateString('es-CL') : '—'}</td>
      <td>${c.cliente||'—'}</td>
      <td>
        <select class="crud-input-select" id="editVend_${c.id}">
          <option value="">— Selecciona —</option>
          ${opcionesVendedores(c.cod_vendedor_compartido)}
        </select>
      </td>
      <td style="text-align:right">
        <input class="crud-input-pct" type="number" id="editPct_${c.id}" min="1" max="100" value="${c.porcentaje}" />
      </td>
      <td style="text-align:right">${formatCLP(c.monto_asignado)}</td>
      <td>
        <div class="crud-acciones">
          <button class="btn-crud btn-crud--save"   title="Guardar" data-id="${c.id}" data-folio="${c.folio}">✓</button>
          <button class="btn-crud btn-crud--cancel" title="Cancelar" data-id="${c.id}">✕</button>
        </div>
      </td>`;
  }

  async function cargarFoliosAsignados() {
    try {
      const res  = await fetch(`${API}/asignados?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      const tbody = document.getElementById('tbodyAsignados');
      document.getElementById('totalAsignados').textContent = `${(data.asignados||[]).length} registros`;
      if (!data.ok || !data.asignados?.length) {
        tbody.innerHTML = '<tr class="tabla-empty"><td colspan="7">Sin folios asignados este mes</td></tr>'; return;
      }
      tbody.innerHTML = data.asignados.map(c => `<tr data-id="${c.id}">${filaAsignadoVista(c)}</tr>`).join('');
      bindCrudEvents(tbody, data.asignados);
    } catch(err) { console.error('[cargarFoliosAsignados]',err); }
  }

  function bindCrudEvents(tbody, asignados) {
    // Botones EDITAR
    tbody.querySelectorAll('.btn-crud--edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = btn.dataset.id;
        const c   = asignados.find(a => String(a.id) === String(id));
        const tr  = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!c || !tr) return;
        tr.innerHTML = filaAsignadoEdicion(c);
        bindCrudEvents(tbody, asignados); // rebind para save/cancel
      });
    });

    // Botones GUARDAR
    tbody.querySelectorAll('.btn-crud--save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id      = btn.dataset.id;
        const vendSel = document.getElementById(`editVend_${id}`)?.value;
        const pctSel  = document.getElementById(`editPct_${id}`)?.value;
        if (!vendSel || !pctSel) {
          alert('Selecciona vendedor y porcentaje'); return;
        }
        try {
          const res  = await fetch(`${API}/compartir/${id}`, {
            method:'PUT',
            headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token()}` },
            body: JSON.stringify({ cod_vendedor_compartido: vendSel, porcentaje: Number(pctSel) })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error);
          await cargarFoliosAsignados();
        } catch(err) { alert(`Error al guardar: ${err.message}`); }
      });
    });

    // Botones CANCELAR
    tbody.querySelectorAll('.btn-crud--cancel').forEach(btn => {
      btn.addEventListener('click', async () => { await cargarFoliosAsignados(); });
    });

    // Botones ELIMINAR
    tbody.querySelectorAll('.btn-crud--del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id    = btn.dataset.id;
        const folio = btn.dataset.folio;
        if (!confirm(`¿Eliminar asignación del folio ${folio}? El folio volverá a estar disponible.`)) return;
        try {
          const res  = await fetch(`${API}/compartir/${id}`, {
            method:'DELETE',
            headers:{ Authorization:`Bearer ${token()}` }
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error);
          // Recargar lista folios + asignados
          await Promise.all([ cargarFoliosParaCompartir(), cargarFoliosAsignados(), cargarResumen(), cargarVentasMes() ]);
        } catch(err) { alert(`Error al eliminar: ${err.message}`); }
      });
    });
  }

  // ══ PANEL FOLIOS RECIBIDOS (tipo P) ═════════════════════════════════════

  async function iniciarPanelCompartidos() {
    document.getElementById('panelCompartidos').style.display = 'block';
    document.getElementById('panelCoordinador').style.display = 'none';
    await cargarFoliosCompartidos();
  }

  async function cargarFoliosCompartidos() {
    try {
      const res  = await fetch(`${API}/compartidos?${new URLSearchParams(getParams())}`, { headers:{ Authorization:`Bearer ${token()}` } });
      const data = await res.json();
      const tbody = document.getElementById('tbodyCompartidos');
      document.getElementById('totalCompartidos').textContent = `${(data.compartidos||[]).length} registros`;
      if (!data.ok || !data.compartidos?.length) {
        tbody.innerHTML = '<tr class="tabla-empty"><td colspan="6">Sin folios asignados este mes</td></tr>'; return;
      }
      tbody.innerHTML = data.compartidos.map(c => `
        <tr>
          <td><strong>${c.folio}</strong></td>
          <td>${c.fecha ? new Date(c.fecha).toLocaleDateString('es-CL') : '—'}</td>
          <td>${c.cliente||'—'}</td>
          <td>${c.coordinador||c.cod_vendedor_principal||'—'}</td>
          <td style="text-align:right">${c.porcentaje}%</td>
          <td style="text-align:right">${formatCLP(c.monto_asignado)}</td>
        </tr>`).join('');
    } catch(err) { console.error('[cargarFoliosCompartidos]',err); }
  }

  // ── Cargar todo ────────────────────────────────────────────────────────────
  async function cargarTodo(usuario) {
    const tareas = [ cargarResumen(), cargarGrafico(), cargarVendedores(), cargarVentasMes() ];
    if (esCoordinador(usuario)) tareas.push(cargarFoliosParaCompartir(), cargarFoliosAsignados());
    else tareas.push(cargarFoliosCompartidos());
    await Promise.all(tareas);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const usuario = await verificarSesion();
    if (!usuario) return;
    cargarSidebar(usuario);
    initSelectores();

    if (esCoordinador(usuario)) await iniciarPanelCoordinador();
    else                        await iniciarPanelCompartidos();

    document.getElementById('busquedaVentas').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderVentasMes(ventasMes.filter(v =>
        String(v.Folio||'').toLowerCase().includes(q) ||
        String(v.cliente||'').toLowerCase().includes(q)
      ));
    });

    document.getElementById('modalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target===e.currentTarget) cerrarModal(); });
    document.addEventListener('keydown', e => { if (e.key==='Escape') cerrarModal(); });
    document.getElementById('btnActualizar').addEventListener('click', () => cargarTodo(usuario));

    cargarTodo(usuario);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
