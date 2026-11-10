(() => {
'use strict';
const D = window.MOTORES, A = window.ANALISIS;
const ESTADOS = [
  {k:'En servicio', c:'var(--ok)'}, {k:'Taller', c:'var(--taller)'},
  {k:'Repuesto', c:'var(--spare)'}, {k:'Reservado', c:'#c9930a'}, {k:'En transporte', c:'#8a5cf0'}, {k:'De baja', c:'var(--baja)'}];
const COL = Object.fromEntries(ESTADOS.map(e => [e.k, e.c]));
const CRIT = {A: {c: '#d23c3c', t: 'Crítico'}, B: {c: '#c9930a', t: 'Importante'}, C: {c: '#7b8696', t: 'Normal'}};
const FAENAS = ['Planta Magnetita', 'Los Colorados', 'Pleito', 'Cerro Negro Norte', 'Romeral', 'Guayacán', 'Puerto Guacolda', 'Planta de Pellets', 'Puerto Punta Totoralillo'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (n, d = 0) => n == null ? '—' : n.toLocaleString('es-CL', {maximumFractionDigits: d});
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const state = {view:'resumen', q:'', estado:new Set(), area:'', volt:'', kwMin:'', cal:'', cols:{}, masOpen:true, sort:'numero', dir:1, limit:80};
const canEdit = () => window.MV.user.rol !== 'consulta';
const critPill = c => c && CRIT[c] ? `<span class="crit" style="--c:${CRIT[c].c}" title="Criticidad ${c}: ${CRIT[c].t}">${c}</span>` : '<span class="muted">—</span>';

/* Íconos: motor según su montaje y tipo de faena */
const iconoMotor = mont => mont === 'vertical'
  ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="9" height="12" rx="2"/><path d="M11.500 15v5.500M7 7h9M7 11h9M16 8h3v3h-3"/></svg>'
  : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="8" width="12" height="9" rx="2"/><path d="M6 12.500H2.500M9 8v9M12 8v9M15 8v9M10 5h4v3h-4"/></svg>';
const iconoFaena = n => /^Puerto/.test(n)
  ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 18c2 0 2 1.500 4 1.500s2-1.500 4-1.500 2 1.500 4 1.500 2-1.500 4-1.500 2 1.500 4 1.500M5 15V6h4v9M9 10h9v5"/></svg>'
  : /^Planta/.test(n)
    ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V9l6 4V9l6 4V4h3v16z"/></svg>'
    : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 19 9 7l4 7 3-4 6 9z"/></svg>';

/* Columnas de la planilla, con sus mismos encabezados: grupo (t) y subcolumnas (c).
   Cada subcolumna: [clave, subtítulo, filtro]. El filtro es un desplegable con los valores reales
   y "(vacías)" ('sel') o una búsqueda por texto ('txt'), como el autofiltro de Excel. */
const GRUPOS = [
  {t: 'N° Motor', c: [['numero', 'N°']]},
  {t: 'Estado', c: [['estado', 'Estado']]},
  {t: 'Criticidad', c: [['criticidad', 'Crit.', 'sel']]},
  {t: 'Área', c: [['area', 'Área']]},
  {t: 'Potencia', c: [['hp', 'HP', 'sel'], ['kw', 'kW', 'sel']]},
  {t: 'Corriente', c: [['amp', 'Amp.', 'sel']]},
  {t: 'Voltaje Aplic.', c: [['voltTxt', 'Volt', 'sel']]},
  {t: 'Velocidad', c: [['rpm', '(rpm)', 'sel']]},
  {t: 'Montaje', c: [['montaje', 'Montaje', 'sel']]},
  {t: 'Frame', c: [['frame', 'Frame', 'sel']]},
  {t: 'Rodamientos', c: [['rodLibre', 'Lado Libre', 'sel'], ['rodCarga', 'Lado Carga', 'sel']]},
  {t: 'coseno fi', c: [['cosFi', 'teórico', 'sel']]},
  {t: 'Ubicación Actual', c: [['tag', 'Tag', 'txt']]},
  {t: 'Descripción', c: [['descripcion', 'Descripción', 'txt']]},
  {t: 'Observaciones', c: [['observaciones', 'Observaciones', 'txt']], soloFiltro: true},
];
const TIPO_COL = Object.fromEntries(GRUPOS.flatMap(g => g.c).filter(c => c[2]).map(c => [c[0], c[2]]));
const VACIO = '__vacio__';
const vacio = x => x == null || x === '';
const cmpVal = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', {numeric: true});
const valoresDe = k => [...new Set(D.map(m => m[k]).filter(x => !vacio(x)))].sort(cmpVal);
const etiquetaCol = (k, v) => typeof v === 'number' ? fmt(v, k === 'cosFi' ? 2 : 1) : v;
const coincideTexto = (x, v) => { const t = norm(v).trim(); return norm(x).includes(t) || (!!A.compacto(t) && A.compacto(x).includes(A.compacto(t))); };
const coincideCol = (m, k, v) => TIPO_COL[k] === 'txt' ? coincideTexto(m[k], v) : v === VACIO ? vacio(m[k]) : String(m[k]) === v;
const colsActivas = () => Object.values(state.cols).filter(Boolean).length;

/* ---------- filtros ---------- */
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const index = m => { const x = A.indiceBusqueda(m); m._s = x.s; m._c = x.c; };   // el buscador mira todas las columnas
D.forEach(index);
const voltBand = m => m.volt == null ? 'S/D' : m.volt >= 3000 ? 'Media tensión (4 kV)' : m.volt >= 600 ? 'Otro' : 'Baja tensión';
const problemaCal = () => state.cal ? A.calidad(D).find(p => p.k === state.cal) : null;
function filtered() {
  const pc = problemaCal(), ids = pc ? new Set(pc.ids) : null;
  return D.filter(m =>
    (!state.estado.size || state.estado.has(m.estado)) &&
    (!state.area || m.area === state.area) &&
    (!state.volt || voltBand(m) === state.volt) &&
    (!state.kwMin || (m.kw ?? 0) >= +state.kwMin) &&
    (!ids || ids.has(m.id)) &&
    Object.entries(state.cols).every(([k, v]) => !v || coincideCol(m, k, v)) &&
    A.coincideBusqueda(m, state.q));
}

/* ---------- utilidades de gráficos ---------- */
const tip = $('#tip');
function bindTip(root) {
  $$('[data-tip]', root).forEach(el => {
    el.addEventListener('mousemove', e => { tip.textContent = el.dataset.tip; tip.style.opacity = 1; tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; });
    el.addEventListener('mouseleave', () => tip.style.opacity = 0);
  });
}
function donut(data, total) {
  let a = -Math.PI / 2, R = 92, r = 62, p = '';
  data.forEach(d => {
    if (!d.v) return; const f = d.v / total * Math.PI * 2 - (data.filter(x => x.v).length > 1 ? .03 : 0), b = a + f;
    const big = f > Math.PI ? 1 : 0, P = (rad, ang) => [100 + rad * Math.cos(ang), 100 + rad * Math.sin(ang)];
    const [x1,y1] = P(R,a), [x2,y2] = P(R,b), [x3,y3] = P(r,b), [x4,y4] = P(r,a);
    p += `<path data-estado="${d.k}" data-tip="${d.k}: ${d.v} (${fmt(d.v/total*100,1)}%)" fill="${d.c}" d="M${x1} ${y1}A${R} ${R} 0 ${big} 1 ${x2} ${y2}L${x3} ${y3}A${r} ${r} 0 ${big} 0 ${x4} ${y4}Z"/>`;
    a += d.v / total * Math.PI * 2;
  });
  return `<svg class="donut" viewBox="0 0 200 200">${p}<text class="c1" x="100" y="104" text-anchor="middle">${total}</text><text class="c2" x="100" y="124" text-anchor="middle">motores</text></svg>`;
}
function hist(items, id, filterAttr) {
  const max = Math.max(...items.map(i => i.v), 1);
  return `<div class="hist">${items.map(i => `<div data-${filterAttr}="${esc(i.k)}" data-tip="${esc(i.k)}: ${i.v} motores"><b>${i.v}</b><em style="height:${i.v / max * 100}%"></em><small>${esc(i.k)}</small></div>`).join('')}</div>`;
}

/* ---------- vista Resumen ---------- */
const ic = {
  all:'<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  ok:'<svg viewBox="0 0 24 24"><path d="m9 16.200-3.500-3.500L4 14.100l5 5 11-11-1.400-1.400z"/></svg>',
  tool:'<svg viewBox="0 0 24 24"><path d="m22.700 19-9.100-9.100c.9-2.300.4-5-1.500-6.900-2-2-5-2.400-7.400-1.300L9 6 6 9 1.600 4.700C.4 7.100.9 10.100 2.900 12.100c1.900 1.900 4.600 2.400 6.900 1.500l9.100 9.100c.4.400 1 .4 1.400 0l2.300-2.300c.5-.4.500-1.100.1-1.400z"/></svg>',
  box:'<svg viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5zm-9 11.700-7-3.900V9.700l7 3.900zm0-8.100L5.500 8 12 4.300 18.500 8z"/></svg>',
  warn:'<svg viewBox="0 0 24 24"><path d="M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z"/></svg>',
  mw:'<svg viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-4h2v12H7zm4-6h2v18h-2zm4 8h2v10h-2zm4-4h2v14h-2z"/></svg>'};
function tarjetasFaena() {
  const extra = [...new Set(D.map(m => m.faena))].filter(f => !FAENAS.includes(f));
  return `<div class="faenas-g">${[...FAENAS, ...extra].map(f => {
    const ms = D.filter(m => m.faena === f);
    if (!ms.length) return `<div class="card fcard off">${iconoFaena(f)}<h4>${esc(f)}</h4><small>Pendiente de carga</small></div>`;
    const c = count(ms, m => m.estado);
    return `<button class="card fcard" data-faena="${esc(f)}">${iconoFaena(f)}<h4>${esc(f)}</h4><div class="fn">${ms.length}<small> motores</small></div>
      <div class="fbar">${ESTADOS.map(e => `<span style="width:${(c[e.k] || 0) / ms.length * 100}%;background:${e.c}" data-tip="${e.k}: ${c[e.k] || 0}"></span>`).join('')}</div>
      <div class="fleg">${ESTADOS.filter(e => c[e.k]).map(e => `<span><i style="background:${e.c}"></i>${c[e.k]} ${e.k.toLowerCase()}</span>`).join('')}</div></button>`;
  }).join('')}</div>`;
}
function renderResumen() {
  const n = D.length, by = count(D, m => m.estado), mw = D.reduce((s, m) => s + (m.kw || 0), 0) / 1000;
  const act = D.filter(m => m.estado === 'En servicio');
  const kpi = (icon, col, v, u, l, pct, go) => `<div class="card kpi" style="--c:${col}" data-go='${go}'><div class="ic" style="background:${col}">${icon}</div>${pct ? `<span class="p">${pct}</span>` : ''}<div class="v">${v}<small>${u}</small></div><div class="l">${l}</div></div>`;
  const areas = Object.entries(count(D, m => m.area)).sort((a, b) => b[1] - a[1]);
  const maxA = areas[0][1];
  const bandas = [['≤1', -1, 1], ['1–5', 1, 5], ['5–15', 5, 15], ['15–37', 15, 37], ['37–75', 37, 75], ['75–200', 75, 200], ['>200', 200, 1e9]];
  const kwH = bandas.map(([k, lo, hi]) => ({k: k + ' kW', v: D.filter(m => m.kw != null && m.kw > lo && m.kw <= hi).length}));
  const vb = Object.entries(count(D, m => m.volt == null ? 'S/D' : m.volt >= 3000 ? '4 kV' : m.volt >= 600 ? '>600 V' : (m.volt <= 240 ? '≤240 V' : '380–460 V'))).map(([k, v]) => ({k, v}));
  const kwDesc = [...D].filter(m => m.kw).sort((a, b) => b.kw - a.kw).slice(0, 6);
  const sinResp = A.cobertura(D).filter(x => x.sinRespaldo).length;
  const crit = A.criticosPorArea(D);
  $('#v-resumen').innerHTML = `
  <h3 class="seccion">Faenas</h3>${tarjetasFaena()}
  <div class="grid kpis">
    ${kpi(ic.all, 'var(--accent)', n, '', 'Motores registrados', esc([...new Set(D.map(m => m.faena))].join(' · ')), '{}')}
    ${kpi(ic.ok, 'var(--ok)', by['En servicio'] || 0, '', 'En servicio', fmt((by['En servicio']||0)/n*100) + '%', '{"estado":"En servicio"}')}
    ${kpi(ic.tool, 'var(--taller)', by['Taller'] || 0, '', 'En taller / reparación', fmt((by['Taller']||0)/n*100) + '%', '{"estado":"Taller"}')}
    ${kpi(ic.box, 'var(--spare)', by['Repuesto'] || 0, '', 'Repuestos disponibles', 'Bodega', '{"estado":"Repuesto"}')}
    ${kpi(ic.warn, sinResp ? '#d23c3c' : 'var(--ok)', sinResp, '', 'Tipos de motor sin repuesto', 'ver cobertura', '{"view":"disponibilidad"}')}
    ${kpi(ic.mw, '#7c5cd6', fmt(mw, 2), 'MW', 'Potencia instalada total', fmt(act.reduce((s,m)=>s+(m.kw||0),0)/1000,2) + ' MW activos', '{}')}
  </div>
  <div class="grid row2">
    <div class="card"><h3>Estado de la flota</h3><div class="sub">Distribución por disponibilidad</div>
      <div class="donutwrap">${donut(ESTADOS.map(e => ({...e, v: by[e.k] || 0})), n)}
      <div class="legend">${ESTADOS.map(e => `<button data-estado="${e.k}"><i style="background:${e.c}"></i>${e.k}<b>${by[e.k] || 0}</b><span>${fmt((by[e.k]||0)/n*100,1)}%</span></button>`).join('')}</div></div></div>
    <div class="card"><h3>Motores por área</h3><div class="sub">Ubicación actual · color según estado</div>
      <div class="legend2">${ESTADOS.map(e => `<span><i style="background:${e.c}"></i>${e.k}</span>`).join('')}</div>
      <div class="bars">${areas.map(([a, t]) => { const c = count(D.filter(m => m.area === a), m => m.estado);
        return `<div class="bar" data-area="${esc(a)}"><div class="n">${esc(a)}</div><div class="t" style="width:${t / maxA * 100}%">${ESTADOS.map(e => `<span data-tip="${esc(a)} · ${e.k}: ${c[e.k] || 0}" style="width:${(c[e.k] || 0) / t * 100}%;background:${e.c}"></span>`).join('')}</div><div class="q">${t}</div></div>`; }).join('')}</div></div>
  </div>
  <div class="grid row3">
    <div class="card"><h3>Distribución por potencia</h3><div class="sub">Cantidad de motores por rango (kW)</div>${hist(kwH, 'kw', 'kw')}</div>
    <div class="card"><h3>Nivel de tensión</h3><div class="sub">Voltaje de operación</div>${hist(vb, 'v', 'v')}</div>
    <div class="card"><h3>Motores críticos por área</h3><div class="sub">Criticidad A · cuántos están fuera de servicio</div>${crit.length
      ? `<div class="crits">${crit.map(x => `<button data-critarea="${esc(x.area)}"><span>${esc(x.area)}</span><b>${x.total}</b><span class="pill" style="--c:${x.fuera ? '#d23c3c' : 'var(--ok)'}">${x.fuera ? x.fuera + ' fuera de servicio' : 'Todos en servicio'}</span></button>`).join('')}</div>`
      : '<p class="note">Aún no hay motores con criticidad A. Asígnala desde la ficha de cada motor.</p>'}</div>
    <div class="card"><h3>Mayores motores</h3><div class="sub">Top 6 por potencia</div><div class="rep">${kwDesc.map(m => `<button data-id="${m.id}"><div><b style="color:var(--accent)">${fmt(m.kw)} kW</b></div><div>N° ${m.numero}<small>${esc(m.descripcion || m.tag || m.area)} · ${esc(m.area)}</small></div><span class="pill" style="--c:${COL[m.estado]};margin-left:auto">${m.estado}</span></button>`).join('')}</div></div>
  </div>`;
  const root = $('#v-resumen'); bindTip(root);
  $$('.kpi', root).forEach(k => k.onclick = () => { const g = JSON.parse(k.dataset.go); g.view ? go(g.view) : go('inventario', g); });
  $$('[data-faena]', root).forEach(e => e.onclick = () => go('inventario', {}));
  $$('[data-critarea]', root).forEach(e => e.onclick = () => go('inventario', {area: e.dataset.critarea, cols: {criticidad: 'A'}}));
  $$('[data-estado]', root).forEach(e => e.onclick = () => go('inventario', {estado: e.dataset.estado}));
  $$('.bar', root).forEach(e => e.onclick = () => go('inventario', {area: e.dataset.area}));
  $$('[data-id]', root).forEach(e => e.onclick = () => openDrawer(+e.dataset.id));
  $$('[data-v]', root).forEach(e => e.onclick = () => go('inventario', {volt: {'4 kV': 'Media tensión (4 kV)', '≤240 V': 'Baja tensión', '380–460 V': 'Baja tensión'}[e.dataset.v] || ''}));
  $$('[data-kw]', root).forEach(e => e.onclick = () => go('inventario', {kwMin: (bandas.find(b => b[0] + ' kW' === e.dataset.kw)[1] > 0 ? bandas.find(b => b[0] + ' kW' === e.dataset.kw)[1] : '')}));
}

/* ---------- vista Inventario ---------- */
// Cabecera y filtros con la misma estructura de la planilla: grupo (fila 1) y subcolumnas (fila 2).
// Cada columna: [clave, subtítulo, tipo de filtro ('sel' desplegable | 'txt' texto)]. Sin tipo = sin filtro propio.
const ORDEN = GRUPOS.filter(g => !g.soloFiltro).flatMap(g => g.c.map(c => c[0]));
const sk = k => k === 'voltTxt' ? 'volt' : k;                 // el voltaje se ordena por su valor numérico
const CELDA = {
  numero: m => `<td><b>${m.numero ?? '—'}</b></td>`,
  estado: m => `<td><span class="pill" style="--c:${COL[m.estado]}">${m.estado}</span></td>`,
  criticidad: m => `<td>${critPill(m.criticidad)}</td>`,
  area: m => `<td>${esc(m.area)}</td>`,
  hp: m => `<td class="num">${fmt(m.hp, 1)}</td>`,
  kw: m => `<td class="num">${fmt(m.kw, 1)}</td>`,
  amp: m => `<td class="num">${fmt(m.amp, 1)}</td>`,
  voltTxt: m => `<td class="num">${esc(m.voltTxt) || '—'}</td>`,
  rpm: m => `<td class="num">${fmt(m.rpm)}</td>`,
  montaje: m => `<td><span class="mic">${m.montaje ? iconoMotor(m.montaje) : ''}</span>${esc(m.montaje) || '—'}</td>`,
  frame: m => `<td>${esc(m.frame) || '—'}</td>`,
  rodLibre: m => `<td>${esc(m.rodLibre) || '—'}</td>`,
  rodCarga: m => `<td>${esc(m.rodCarga) || '—'}</td>`,
  cosFi: m => `<td class="num">${fmt(m.cosFi, 2)}</td>`,
  tag: m => `<td><span class="tag">${esc(m.tag) || '—'}</span></td>`,
  descripcion: m => `<td class="desc" title="${esc(m.descripcion)}">${esc(m.descripcion) || '—'}</td>`,
};
function renderInventario() {
  const areas = [...new Set(D.map(m => m.area))].sort();
  const v = $('#v-inventario'), n = colsActivas(), pc = problemaCal();
  const filtroCol = (g, [k, l, t]) => {
    const pref = g.c.length > 1 ? `${g.t} ${l}` : g.t, on = state.cols[k] ? 'on' : '';
    if (t === 'txt') return `<input class="chip ${on}" data-col="${k}" placeholder="${l}" value="${esc(state.cols[k] || '')}" aria-label="${esc(pref)}">`;
    return `<select class="chip ${on}" data-col="${k}" aria-label="${esc(pref)}"><option value="">${l}</option>${D.some(m => vacio(m[k])) ? `<option value="${VACIO}" ${state.cols[k] === VACIO ? 'selected' : ''}>${pref}: (vacías)</option>` : ''}${valoresDe(k).map(x => `<option value="${esc(String(x))}" ${String(x) === state.cols[k] ? 'selected' : ''}>${esc(pref + ': ' + etiquetaCol(k, x))}</option>`).join('')}</select>`;
  };
  const tg = GRUPOS.filter(g => !g.soloFiltro);
  const th = (k, txt, extra = '') => `<th data-k="${sk(k)}" ${extra} class="${state.sort === sk(k) ? 's' + (state.dir < 0 ? ' d' : '') : ''}">${txt}</th>`;
  const fila1 = tg.map(g => g.c.length > 1 ? `<th colspan="${g.c.length}" class="grp">${g.t}</th>` : th(g.c[0][0], g.t, 'rowspan="2"')).join('');
  const fila2 = tg.filter(g => g.c.length > 1).map(g => g.c.map(([k, l]) => th(k, l)).join('')).join('');
  v.innerHTML = `
  <div class="tools">
    ${ESTADOS.map(e => `<button class="chip ${state.estado.has(e.k) ? 'on' : ''}" data-e="${e.k}"><i style="background:${e.c}"></i>${e.k}</button>`).join('')}
    <select class="chip ${state.area ? 'on' : ''}" id="fArea"><option value="">Todas las áreas</option>${areas.map(a => `<option ${a === state.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    ${pc ? `<button class="chip on" data-quit="cal">Calidad: ${esc(pc.t)} ✕</button>` : ''}
    ${state.kwMin ? `<button class="chip on" data-quit="kwMin">Potencia ≥ ${esc(state.kwMin)} kW ✕</button>` : ''}
    ${state.volt ? `<button class="chip on" data-quit="volt">${esc(state.volt)} ✕</button>` : ''}
    <button class="chip ${n ? 'on' : ''}" id="fMas">Filtros por columna${n ? ' (' + n + ')' : ''} ▾</button>
    <button class="clear" id="clr">Limpiar</button><span class="count" id="cnt"></span>
    <button class="btn sec" id="csv">Exportar CSV</button>
  </div>
  <div class="tools cols" id="colsPanel" ${state.masOpen ? '' : 'hidden'}>${GRUPOS.filter(g => g.c.some(c => c[2])).map(g => `<fieldset class="fg"><legend>${g.t}</legend>${g.c.filter(c => c[2]).map(c => filtroCol(g, c)).join('')}</fieldset>`).join('')}</div>
  <div class="card tablewrap"><table><thead><tr>${fila1}</tr>${fila2 ? `<tr>${fila2}</tr>` : ''}</thead><tbody id="tb"></tbody></table><div id="mr"></div></div>`;
  $$('[data-e]', v).forEach(b => b.onclick = () => { const k = b.dataset.e; state.estado.has(k) ? state.estado.delete(k) : state.estado.add(k); state.limit = 80; renderInventario(); });
  $$('[data-quit]', v).forEach(b => b.onclick = () => { state[b.dataset.quit] = ''; state.limit = 80; renderInventario(); });
  $('#fMas').onclick = () => { state.masOpen = !state.masOpen; renderInventario(); };
  $$('[data-col]', v).forEach(el => {
    const k = el.dataset.col;
    if (el.tagName === 'INPUT') el.oninput = e => { state.cols[k] = e.target.value; state.limit = 80; e.target.classList.toggle('on', !!e.target.value); fillRows(); };
    else el.onchange = e => { state.cols[k] = e.target.value; state.limit = 80; renderInventario(); };
  });
  $('#fArea').onchange = e => { state.area = e.target.value; state.limit = 80; renderInventario(); };
  $('#clr').onclick = () => { Object.assign(state, {q:'', estado:new Set(), area:'', volt:'', kwMin:'', cal:'', cols:{}}); $('#gsearch').value = ''; renderInventario(); };
  $('#csv').onclick = exportCSV;
  $$('th[data-k]', v).forEach(th => th.onclick = () => { const k = th.dataset.k; state.dir = state.sort === k ? -state.dir : 1; state.sort = k; renderInventario(); });
  fillRows();
}
function fillRows() {
  const rows = filtered(), k = state.sort;
  rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es', {numeric: true})) * state.dir; });
  $('#cnt').textContent = `${rows.length} de ${D.length} motores`;
  const tb = $('#tb');
  tb.innerHTML = rows.length ? rows.slice(0, state.limit).map(m => `<tr data-id="${m.id}">${ORDEN.map(c => CELDA[c](m)).join('')}</tr>`).join('') : `<tr><td colspan="${ORDEN.length}" class="empty">Sin resultados con estos filtros</td></tr>`;
  $$('tr[data-id]', tb).forEach(r => r.onclick = () => openDrawer(+r.dataset.id));
  $('#mr').innerHTML = rows.length > state.limit ? `<button class="btn sec more" id="more">Mostrar más (${rows.length - state.limit} restantes)</button>` : '';
  const mb = $('#more'); if (mb) mb.onclick = () => { state.limit += 120; fillRows(); };
}
function exportCSV() {
  const rows = filtered(), keys = ['numero','faena','area','estado','criticidad','tag','descripcion','kw','hp','volt','amp','rpm','montaje','frame','rodLibre','rodCarga','cosFi','observaciones'];
  const csv = [keys.join(';'), ...rows.map(m => keys.map(k => `"${String(m[k] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'})), download: 'motores_cmp.csv'}); a.click();
}

/* ---------- vista Calidad de datos ---------- */
function renderCalidad() {
  const cal = A.calidad(D), vivos = cal[0].de, defectos = new Set();
  cal.filter(p => p.k !== 'sinCrit').forEach(p => p.ids.forEach(i => defectos.add(i)));
  const limpios = vivos - defectos.size, pct = vivos ? limpios / vivos * 100 : 100, r = 52, circ = 2 * Math.PI * r;
  $('#v-calidad').innerHTML = `
  <div class="grid row2c">
    <div class="card qhead"><svg viewBox="0 0 130 130" class="ring"><circle cx="65" cy="65" r="${r}" class="rb"/><circle cx="65" cy="65" r="${r}" class="rf" stroke-dasharray="${circ * pct / 100} ${circ}" transform="rotate(-90 65 65)"/><text x="65" y="63" text-anchor="middle" class="c1">${fmt(pct)}%</text><text x="65" y="82" text-anchor="middle" class="c2">completos</text></svg>
      <div><h3>${limpios} de ${vivos} motores sin problemas</h3><p class="sub" style="margin:0">Se revisan los motores que no están dados de baja. La criticidad no cuenta como defecto: es una asignación pendiente.</p></div></div>
    <div class="card"><h3>Cómo usar este panel</h3><p class="sub" style="margin:0">Abre una tarjeta para ver los motores con ese problema. Corrige desde la ficha lo que se pueda (ubicación, criticidad). Lo demás —TAG, datos de placa, números repetidos— se completa en terreno o en la planilla de origen.</p></div>
  </div>
  <div class="grid qgrid">${cal.map(p => `<div class="card qcard ${p.n ? '' : 'ok'}">
    <h4>${esc(p.t)}</h4><div class="qn">${p.n}<small> de ${p.de}</small></div>
    <div class="qbar"><span style="width:${p.de ? p.n / p.de * 100 : 0}%"></span></div>
    <p>${esc(p.ayuda)}</p><p class="como"><b>Cómo se corrige:</b> ${esc(p.corrige)}</p>
    ${p.n ? `<button class="btn sec" data-cal="${p.k}">Ver los ${p.n} motores</button>` : '<span class="pill" style="--c:var(--ok)">Sin problemas</span>'}</div>`).join('')}</div>`;
  $$('[data-cal]', $('#v-calidad')).forEach(b => b.onclick = () => go('inventario', {cal: b.dataset.cal}));
}

/* ---------- vista Disponibilidad ---------- */
function renderDisp() {
  const sp = D.filter(m => m.estado === 'Repuesto'), tl = D.filter(m => m.estado === 'Taller'), rs = D.filter(m => m.estado === 'Reservado'), tr = D.filter(m => m.estado === 'En transporte');
  const card = m => `<div class="card sp" data-id="${m.id}"><div class="kw">${fmt(m.kw, 1)}<small> kW · ${fmt(m.hp, 1)} HP</small></div><div class="m"><b>N° ${m.numero ?? '—'}</b> ${m.tag ? '· ' + esc(m.tag) : ''}<br>${m.volt ? fmt(m.volt) + ' V' : 's/d'} · ${m.rpm ? fmt(m.rpm) + ' rpm' : 's/d'} · <span class="mic">${m.montaje ? iconoMotor(m.montaje) : ''}</span>${m.montaje || 'montaje s/d'}<br>${esc(m.descripcion || '')}${m.observaciones ? '<br><i>' + esc(m.observaciones) + '</i>' : ''}</div></div>`;
  const sec = (t, a) => `<h3 style="margin:28px 0 12px">${t} · ${a.length}</h3>` + (a.length ? `<div class="disp">${a.sort((x, y) => (y.kw || 0) - (x.kw || 0)).map(card).join('')}</div>` : '<p class="note">Ningún motor en este estado.</p>');
  const cov = A.cobertura(D), sin = cov.filter(x => x.sinRespaldo), expuestos = sin.reduce((s, x) => s + x.servicio, 0);
  const tipo = x => `${fmt(x.kw, 1)} kW · ${x.voltTxt ? esc(x.voltTxt) + ' V' : 's/d'} · ${x.polos ? x.polos + ' polos' : 's/d'}`;
  $('#v-disponibilidad').innerHTML = `
    <div class="card" style="margin-bottom:18px"><h3>Cobertura de repuestos</h3>
      <div class="sub">${sin.length ? `<b>${sin.length} de ${cov.length}</b> tipos de motor no tienen repuesto disponible y dejan <b>${expuestos}</b> motores en servicio sin respaldo.` : 'Todos los tipos de motor en servicio tienen al menos un repuesto disponible.'} Un tipo agrupa motores de igual potencia, voltaje y número de polos.</div>
      <div class="covwrap"><table class="cov"><thead><tr><th>Tipo de motor</th><th class="num">En servicio</th><th class="num">Críticos (A)</th><th class="num">Repuesto</th><th class="num">Reservado</th><th class="num">En transporte</th><th class="num">En taller</th><th>Respaldo</th></tr></thead><tbody>
      ${cov.map((x, i) => `<tr data-cov="${i}"><td><b>${tipo(x)}</b></td><td class="num">${x.servicio}</td><td class="num">${x.criticos || '—'}</td><td class="num">${x.repuesto}</td><td class="num">${x.reservado || '—'}</td><td class="num">${x.transporte || '—'}</td><td class="num">${x.taller || '—'}</td>
        <td>${x.sinRespaldo ? '<span class="pill" style="--c:#d23c3c">Sin respaldo</span>' : `<span class="pill" style="--c:var(--ok)">1 repuesto por cada ${Math.ceil(x.servicio / x.repuesto)}</span>`}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card" style="margin-bottom:18px"><h3>Cómo usar esta vista</h3><div class="sub" style="margin:0">Aquí ves los motores listos para reemplazo. Abre cualquier motor del inventario y el sistema te sugiere repuestos compatibles (misma potencia, tensión y velocidad similar).</div></div>
    <h3 style="margin:8px 0 12px">Repuestos en bodega · ${sp.length}</h3><div class="disp">${sp.sort((a, b) => (b.kw || 0) - (a.kw || 0)).map(card).join('')}</div>
    ${sec('En taller / reparación', tl)}${sec('Reservados', rs)}${sec('En transporte', tr)}`;
  const root = $('#v-disponibilidad');
  $$('[data-id]', root).forEach(e => e.onclick = () => openDrawer(+e.dataset.id));
  $$('[data-cov]', root).forEach(e => e.onclick = () => { const x = cov[+e.dataset.cov]; go('inventario', {cols: {kw: String(x.kw), ...(x.voltTxt ? {voltTxt: x.voltTxt} : {})}}); });
}

/* ---------- ficha de motor ---------- */
const dr = $('#drawer'), scrim = $('#scrim');
function compat(m) {
  if (!m.kw) return [];
  return D.filter(x => x.estado === 'Repuesto' && x.id !== m.id && x.kw && Math.abs(x.kw - m.kw) / m.kw <= .1 && (!m.volt || !x.volt || x.volt === m.volt) && (!m.rpm || !x.rpm || Math.abs(x.rpm - m.rpm) / m.rpm <= .08));
}
const fechaCorta = f => /^\d{4}-\d{2}-\d{2}$/.test(f) ? new Date(f + 'T12:00:00').toLocaleDateString('es-CL') : '—';
function openDrawer(id) {
  const m = D.find(x => x.id === id); if (!m) return;
  const kv = (l, v) => `<div><span>${l}</span><b>${v == null || v === '' ? '—' : esc(v)}</b></div>`;
  const cs = m.estado === 'En servicio' || m.estado === 'Taller' ? compat(m) : [];
  const hoy = new Date().toISOString().slice(0, 10);
  dr.innerHTML = `
  <div class="dh"><button class="x" id="dx">✕</button><small>${esc(m.faena)}</small><h2>Motor N° ${m.numero ?? '—'}</h2><p>${esc(m.descripcion || m.tag || 'Sin descripción')}</p><span class="pill" style="--c:${COL[m.estado]}">${m.estado}</span> ${m.criticidad ? `<span class="pill" style="--c:${CRIT[m.criticidad].c}">Criticidad ${m.criticidad}</span>` : ''}</div>
  <div class="big"><div><b>${fmt(m.kw, 1)}</b><span>kW</span></div><div><b>${m.voltTxt ? esc(m.voltTxt) : '—'}</b><span>Voltios</span></div><div><b>${fmt(m.rpm)}</b><span>RPM</span></div></div>
  <div class="sec"><h4>Ubicación y estado</h4><div class="kv">${kv('Ubicación', m.area)}${kv('TAG', m.tag)}${kv('Estado', m.estado)}${kv('Faena', m.faena)}${kv('Criticidad', m.criticidad ? m.criticidad + ' · ' + CRIT[m.criticidad].t : null)}</div>${m.observaciones ? `<p class="note">${esc(m.observaciones)}</p>` : ''}
    ${m.actualizadoPor ? `<p class="upd">Última actualización: ${esc(m.actualizadoPor)} · ${new Date(m.actualizadoEn).toLocaleString('es-CL')}</p>` : ''}</div>
  ${canEdit() ? `<form class="sec eform" id="ef"><h4>Actualizar motor</h4>
    <label>Estado<select name="estado">${ESTADOS.map(e => `<option ${e.k === m.estado ? 'selected' : ''}>${e.k}</option>`).join('')}</select></label>
    <label>Ubicación<input name="area" list="areas" value="${esc(m.area)}" maxlength="60" required></label>
    <datalist id="areas">${[...new Set(D.map(x => x.area))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label>Criticidad<select name="crit"><option value="">Sin asignar</option>${Object.entries(CRIT).map(([k, c]) => `<option value="${k}" ${k === m.criticidad ? 'selected' : ''}>${k} · ${c.t}</option>`).join('')}</select></label>
    <label>Observaciones<textarea name="obs" rows="2" maxlength="500">${esc(m.observaciones)}</textarea></label>
    <label>Motivo del cambio (queda en el historial)<input name="com" maxlength="300"></label>
    <div class="erow"><button class="btn" type="submit">Guardar cambios</button><span id="emsg"></span></div></form>` : ''}
  <div class="sec"><h4>Características técnicas</h4><div class="kv">${kv('Potencia', `${fmt(m.hp, 1)} HP / ${fmt(m.kw, 1)} kW`)}${kv('Corriente', m.amp != null ? fmt(m.amp, 1) + ' A' : null)}<div><span>Montaje</span><b>${m.montaje ? `<span class="mic">${iconoMotor(m.montaje)}</span>${esc(m.montaje)}` : '—'}</b></div>${kv('Frame', m.frame)}${kv('Cos φ', m.cosFi != null ? fmt(m.cosFi, 2) : null)}${kv('Rodam. lado libre', m.rodLibre)}${kv('Rodam. lado carga', m.rodCarga)}</div></div>
  ${m.hojaVida ? `<div class="sec"><h4>Hoja de vida</h4><p class="note" style="margin:0;word-break:break-all">${esc(m.hojaVida)}</p></div>` : ''}
  <div class="sec"><h4>Reparaciones y rebobinados <span id="repN" class="muted"></span></h4>
    ${canEdit() ? `<button class="btn sec" id="repAdd" type="button">+ Registrar reparación</button>
    <form class="eform repform" id="repForm" hidden>
      <label>Tipo<select name="tipo">${window.MV.tiposReparacion.map(t => `<option>${t}</option>`).join('')}</select></label>
      <label>Fecha<input type="date" name="fecha" value="${hoy}" max="${hoy}" required></label>
      <label>Taller o responsable<input name="taller" maxlength="100"></label>
      <label>Trabajo realizado<textarea name="desc" rows="2" maxlength="500"></textarea></label>
      <label>Resultado: pruebas, garantía<input name="res" maxlength="300"></label>
      <div class="erow"><button class="btn" type="submit">Guardar reparación</button><span id="repMsg"></span></div></form>` : ''}
    <div id="repList" class="histl">Cargando…</div></div>
  ${cs.length ? `<div class="sec"><h4>Repuestos compatibles (${cs.length})</h4><div class="rep">${cs.slice(0, 6).map(x => `<button data-id="${x.id}"><b>N° ${x.numero ?? '—'}</b><div>${fmt(x.kw, 1)} kW · ${x.volt ? fmt(x.volt) + ' V' : 's/d'} · ${x.rpm ? fmt(x.rpm) + ' rpm' : 's/d'}<small>${esc(x.tag || x.descripcion || 'Bodega')}</small></div></button>`).join('')}</div></div>` : (m.estado === 'En servicio' ? `<div class="sec"><h4>Repuestos compatibles</h4><p class="note">No hay repuestos en bodega con potencia, tensión y velocidad similares.</p></div>` : '')}
  <div class="sec"><h4>Historial de cambios</h4><div id="hist" class="histl">Cargando…</div></div>`;
  dr.dataset.id = m.id;
  $$('[data-id]', dr).forEach(b => b.onclick = () => openDrawer(+b.dataset.id));
  const ef = $('#ef', dr);
  if (ef) ef.onsubmit = async e => {
    e.preventDefault(); const msg = $('#emsg'); msg.className = ''; msg.textContent = 'Guardando…';
    const f = ef.elements, cambios = {estado: f.estado.value, area: f.area.value, observaciones: f.obs.value, comentario: f.com.value};
    if (f.crit.value !== (m.criticidad || '')) cambios.criticidad = f.crit.value;      // solo si cambió
    try {
      Object.assign(m, await window.MV.guardar(m.id, cambios));
      index(m); refresh(); openDrawer(m.id);
    } catch (err) { msg.className = 'bad'; msg.textContent = err.message; }
  };
  const CAMPO = {estado: 'Estado', area: 'Ubicación', observaciones: 'Observaciones', criticidad: 'Criticidad'};
  window.MV.historial(m.id).then(h => {
    const el = $('#hist'); if (!el || dr.dataset.id != m.id) return;
    el.innerHTML = h.length ? h.map(x => `<div class="hi"><b>${CAMPO[x.campo] || x.campo}</b>: ${esc(x.anterior ?? '—')} → <b>${esc(x.nuevo ?? '—')}</b><small>${esc(x.usuario)} · ${new Date(x.fecha).toLocaleString('es-CL')}${x.comentario ? ' · “' + esc(x.comentario) + '”' : ''}</small></div>`).join('') : '<p class="note" style="margin:0">Sin cambios registrados desde la importación del Excel.</p>';
  }).catch(() => {});
  const cargarRep = () => window.MV.reparaciones(m.id).then(lista => {
    const el = $('#repList'); if (!el || dr.dataset.id != m.id) return;
    const reb = lista.filter(x => x.tipo === 'Rebobinado').length;
    $('#repN').textContent = lista.length ? `· ${lista.length} registro${lista.length > 1 ? 's' : ''}${reb ? `, ${reb} rebobinado${reb > 1 ? 's' : ''}` : ''}` : '';
    el.innerHTML = lista.length ? lista.map(x => `<div class="hi"><b>${esc(x.tipo)}</b> · ${fechaCorta(x.fecha)}${x.taller ? ' · ' + esc(x.taller) : ''}${x.descripcion ? `<br>${esc(x.descripcion)}` : ''}${x.resultado ? `<br><i>${esc(x.resultado)}</i>` : ''}<small>Registrado por ${esc(x.registrado_por || '—')}</small></div>`).join('') : '<p class="note" style="margin:0">Sin reparaciones registradas.</p>';
  }).catch(err => { const el = $('#repList'); if (el && dr.dataset.id == m.id) el.innerHTML = `<p class="note bad" style="margin:0">${esc(err.message)}</p>`; });
  cargarRep();
  const rf = $('#repForm', dr);
  if (rf) {
    $('#repAdd', dr).onclick = () => { rf.hidden = !rf.hidden; };
    rf.onsubmit = async e => {
      e.preventDefault(); const msg = $('#repMsg'); msg.className = ''; msg.textContent = 'Guardando…';
      const f = rf.elements;
      try {
        await window.MV.registrarReparacion(m.id, {tipo: f.tipo.value, fecha: f.fecha.value, taller: f.taller.value, descripcion: f.desc.value, resultado: f.res.value});
        rf.reset(); rf.hidden = true; msg.textContent = ''; await cargarRep();
      } catch (err) { msg.className = 'bad'; msg.textContent = err.message; }
    };
  }
  $('#dx').onclick = closeDrawer; dr.classList.add('on'); scrim.classList.add('on'); dr.scrollTop = 0;
}
const VISTAS = {resumen: renderResumen, inventario: renderInventario, disponibilidad: renderDisp, calidad: renderCalidad};
const refresh = () => VISTAS[state.view]();
function closeDrawer() { dr.classList.remove('on'); scrim.classList.remove('on'); }
scrim.onclick = closeDrawer;

/* ---------- navegación ---------- */
const META = {resumen: ['Resumen', 'Panorama general de motores eléctricos de la faena'], inventario: ['Inventario', 'Busca, filtra y revisa la ficha técnica de cada motor'], disponibilidad: ['Disponibilidad', 'Cobertura de repuestos, reservados, en transporte y en reparación'], calidad: ['Calidad de datos', 'Qué falta o está mal en la planilla, para corregirlo con Mantenimiento']};
function go(view, filters) {
  if (filters) { Object.assign(state, {estado: new Set(), area: '', volt: '', kwMin: '', cal: '', cols: {}, limit: 80}); for (const [k, v] of Object.entries(filters)) state[k] = k === 'estado' ? new Set([v]) : v; }
  state.view = view;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + view));
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.view === view));
  $('#title').textContent = META[view][0]; $('#subtitle').textContent = META[view][1];
  VISTAS[view]();
  $('#side').classList.remove('on'); window.scrollTo(0, 0);
}
$$('.nav').forEach(n => n.onclick = () => go(n.dataset.view));
$('#burger').onclick = () => $('#side').classList.toggle('on');
$('#gsearch').oninput = e => { state.q = e.target.value; state.limit = 80; if (state.view !== 'inventario') go('inventario'); else fillRows(); };
addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#gsearch').focus(); } if (e.key === 'Escape') closeDrawer(); });
const root = document.documentElement;
try { root.dataset.theme = localStorage.getItem('mv-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (_) {}
$('#theme').onclick = () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('mv-theme', root.dataset.theme); } catch (_) {} };
$('#fCount').textContent = D.length;
$('#heroSub').textContent = `${D.length} motores · ${[...new Set(D.map(m => m.faena))].join(' · ')}`;
go('resumen');
})();
