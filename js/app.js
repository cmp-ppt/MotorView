(() => {
'use strict';
const D = window.MOTORES;
const ESTADOS = [
  {k:'En servicio', c:'var(--ok)'}, {k:'Taller', c:'var(--taller)'},
  {k:'Repuesto', c:'var(--spare)'}, {k:'Reservado', c:'#c9930a'}, {k:'En transporte', c:'#8a5cf0'}, {k:'De baja', c:'var(--baja)'}];
const COL = Object.fromEntries(ESTADOS.map(e => [e.k, e.c]));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (n, d = 0) => n == null ? '—' : n.toLocaleString('es-CL', {maximumFractionDigits: d});
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const state = {view:'resumen', q:'', estado:new Set(), area:'', volt:'', montaje:'', kwMin:'', frame:'', tag:'', cols:{}, masOpen:false, sort:'numero', dir:1, limit:80};
const canEdit = () => window.MV.user.rol !== 'consulta';

/* Filtros por columna, como el autofiltro de la planilla: un desplegable por columna
   (con sus valores reales y "(vacías)") y búsqueda por texto en las columnas de texto libre. */
const FILTROS_COL = [
  ['hp', 'HP', 'sel'], ['kw', 'kW', 'sel'], ['amp', 'Corriente (A)', 'sel'], ['voltTxt', 'Voltaje (V)', 'sel'],
  ['rpm', 'Velocidad (rpm)', 'sel'], ['rodLibre', 'Rodam. lado libre', 'sel'], ['rodCarga', 'Rodam. lado carga', 'sel'],
  ['cosFi', 'cos φ teórico', 'sel'], ['descripcion', 'Descripción contiene…', 'txt'], ['observaciones', 'Observaciones contiene…', 'txt']];
const TIPO_COL = Object.fromEntries(FILTROS_COL.map(([k, , t]) => [k, t]));
const VACIO = '__vacio__';
const vacio = x => x == null || x === '';
const cmpVal = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es', {numeric: true});
const valoresDe = k => [...new Set(D.map(m => m[k]).filter(x => !vacio(x)))].sort(cmpVal);
const etiquetaCol = (k, v) => typeof v === 'number' ? fmt(v, k === 'cosFi' ? 2 : 1) : v;
const coincideCol = (m, k, v) => TIPO_COL[k] === 'txt' ? norm(m[k]).includes(norm(v).trim()) : v === VACIO ? vacio(m[k]) : String(m[k]) === v;
const colsActivas = () => Object.values(state.cols).filter(Boolean).length;

/* ---------- filtros ---------- */
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const index = m => { m._s = norm([m.numero, m.tag, m.descripcion, m.area, m.frame, m.observaciones, m.rodLibre, m.rodCarga].join(' ')); };
D.forEach(index);
const voltBand = m => m.volt == null ? 'S/D' : m.volt >= 3000 ? 'Media tensión (4 kV)' : m.volt >= 600 ? 'Otro' : 'Baja tensión';
function filtered() {
  const q = norm(state.q).trim().split(/\s+/).filter(Boolean);
  return D.filter(m =>
    (!state.estado.size || state.estado.has(m.estado)) &&
    (!state.area || m.area === state.area) &&
    (!state.volt || voltBand(m) === state.volt) &&
    (!state.montaje || m.montaje === state.montaje) &&
    (!state.kwMin || (m.kw ?? 0) >= +state.kwMin) &&
    (!state.frame || m.frame === state.frame) &&
    (!state.tag || norm(m.tag).includes(norm(state.tag).trim())) &&
    Object.entries(state.cols).every(([k, v]) => !v || coincideCol(m, k, v)) &&
    q.every(t => m._s.includes(t)));
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
  mw:'<svg viewBox="0 0 24 24"><path d="M3 13h2v8H3zm4-4h2v12H7zm4-6h2v18h-2zm4 8h2v10h-2zm4-4h2v14h-2z"/></svg>'};
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
  $('#v-resumen').innerHTML = `
  <div class="grid kpis">
    ${kpi(ic.all, 'var(--accent)', n, '', 'Motores registrados', esc([...new Set(D.map(m => m.faena))].join(' · ')), '{}')}
    ${kpi(ic.ok, 'var(--ok)', by['En servicio'] || 0, '', 'En servicio', fmt((by['En servicio']||0)/n*100) + '%', '{"estado":"En servicio"}')}
    ${kpi(ic.tool, 'var(--taller)', by['Taller'] || 0, '', 'En taller / reparación', fmt((by['Taller']||0)/n*100) + '%', '{"estado":"Taller"}')}
    ${kpi(ic.box, 'var(--spare)', by['Repuesto'] || 0, '', 'Repuestos disponibles', 'Bodega', '{"estado":"Repuesto"}')}
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
    <div class="card"><h3>Mayores motores</h3><div class="sub">Top 6 por potencia</div><div class="rep">${kwDesc.map(m => `<button data-id="${m.id}"><div><b style="color:var(--accent)">${fmt(m.kw)} kW</b></div><div>N° ${m.numero}<small>${esc(m.descripcion || m.tag || m.area)} · ${esc(m.area)}</small></div><span class="pill" style="--c:${COL[m.estado]};margin-left:auto">${m.estado}</span></button>`).join('')}</div></div>
  </div>`;
  const root = $('#v-resumen'); bindTip(root);
  $$('.kpi', root).forEach(k => k.onclick = () => go('inventario', JSON.parse(k.dataset.go)));
  $$('[data-estado]', root).forEach(e => e.onclick = () => go('inventario', {estado: e.dataset.estado}));
  $$('.bar', root).forEach(e => e.onclick = () => go('inventario', {area: e.dataset.area}));
  $$('[data-id]', root).forEach(e => e.onclick = () => openDrawer(+e.dataset.id));
  $$('[data-v]', root).forEach(e => e.onclick = () => go('inventario', {volt: {'4 kV': 'Media tensión (4 kV)', '≤240 V': 'Baja tensión', '380–460 V': 'Baja tensión'}[e.dataset.v] || ''}));
  $$('[data-kw]', root).forEach(e => e.onclick = () => go('inventario', {kwMin: (bandas.find(b => b[0] + ' kW' === e.dataset.kw)[1] > 0 ? bandas.find(b => b[0] + ' kW' === e.dataset.kw)[1] : '')}));
}

/* ---------- vista Inventario ---------- */
const COLS = [['numero','N°'],['estado','Estado'],['tag','TAG'],['descripcion','Descripción'],['area','Ubicación'],['kw','kW'],['hp','HP'],['volt','V'],['rpm','RPM'],['amp','A'],['montaje','Montaje'],['frame','Frame'],['rodLibre','Rodam. libre'],['rodCarga','Rodam. carga'],['cosFi','cos φ']];
function renderInventario() {
  const areas = [...new Set(D.map(m => m.area))].sort();
  const frames = [...new Set(D.map(m => m.frame).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', {numeric: true}));
  const v = $('#v-inventario');
  v.innerHTML = `
  <div class="tools">
    ${ESTADOS.map(e => `<button class="chip ${state.estado.has(e.k) ? 'on' : ''}" data-e="${e.k}"><i style="background:${e.c}"></i>${e.k}</button>`).join('')}
    <select class="chip ${state.area ? 'on' : ''}" id="fArea"><option value="">Todas las áreas</option>${areas.map(a => `<option ${a === state.area ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select class="chip ${state.volt ? 'on' : ''}" id="fVolt"><option value="">Toda tensión</option>${['Baja tensión', 'Media tensión (4 kV)'].map(a => `<option ${a === state.volt ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <select class="chip ${state.montaje ? 'on' : ''}" id="fMont"><option value="">Montaje</option><option ${state.montaje === 'horizontal' ? 'selected' : ''}>horizontal</option><option ${state.montaje === 'vertical' ? 'selected' : ''}>vertical</option></select>
    <select class="chip ${state.kwMin ? 'on' : ''}" id="fKw"><option value="">Potencia</option>${[1, 5, 15, 37, 75, 200].map(k => `<option value="${k}" ${+state.kwMin === k ? 'selected' : ''}>≥ ${k} kW</option>`).join('')}</select>
    <select class="chip ${state.frame ? 'on' : ''}" id="fFrame"><option value="">Frame</option>${frames.map(a => `<option ${a === state.frame ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <input class="chip ${state.tag ? 'on' : ''}" id="fTag" placeholder="TAG contiene…" value="${esc(state.tag)}" style="width:150px">
    <button class="chip ${colsActivas() ? 'on' : ''}" id="fMas">Más filtros${colsActivas() ? ' (' + colsActivas() + ')' : ''} ▾</button>
    <button class="clear" id="clr">Limpiar</button><span class="count" id="cnt"></span>
    <button class="btn sec" id="csv">Exportar CSV</button>
  </div>
  <div class="tools" id="colsPanel" ${state.masOpen || colsActivas() ? '' : 'hidden'}>${FILTROS_COL.map(([k, l, t]) => t === 'txt'
    ? `<input class="chip ${state.cols[k] ? 'on' : ''}" data-col="${k}" placeholder="${l}" value="${esc(state.cols[k] || '')}" style="width:190px">`
    : `<select class="chip ${state.cols[k] ? 'on' : ''}" data-col="${k}"><option value="">${l}</option>${D.some(m => vacio(m[k])) ? `<option value="${VACIO}" ${state.cols[k] === VACIO ? 'selected' : ''}>${l}: (vacías)</option>` : ''}${valoresDe(k).map(x => `<option value="${esc(String(x))}" ${String(x) === state.cols[k] ? 'selected' : ''}>${esc(l + ': ' + etiquetaCol(k, x))}</option>`).join('')}</select>`).join('')}</div>
  <div class="card tablewrap"><table><thead><tr>${COLS.map(([k, l]) => `<th data-k="${k}" class="${state.sort === k ? 's' + (state.dir < 0 ? ' d' : '') : ''}">${l}</th>`).join('')}</tr></thead><tbody id="tb"></tbody></table><div id="mr"></div></div>`;
  $$('[data-e]', v).forEach(b => b.onclick = () => { const k = b.dataset.e; state.estado.has(k) ? state.estado.delete(k) : state.estado.add(k); state.limit = 80; renderInventario(); });
  $('#fMas').onclick = () => { state.masOpen = !(state.masOpen || colsActivas()); if (!state.masOpen) state.cols = {}; renderInventario(); };
  $$('[data-col]', v).forEach(el => {
    const k = el.dataset.col;
    if (el.tagName === 'INPUT') el.oninput = e => { state.cols[k] = e.target.value; state.limit = 80; e.target.classList.toggle('on', !!e.target.value); fillRows(); };
    else el.onchange = e => { state.cols[k] = e.target.value; state.limit = 80; renderInventario(); };
  });
  $('#fTag').oninput = e => { state.tag = e.target.value; state.limit = 80; e.target.classList.toggle('on', !!state.tag); fillRows(); };
  [['fArea','area'],['fVolt','volt'],['fMont','montaje'],['fKw','kwMin'],['fFrame','frame']].forEach(([id, k]) => $('#' + id).onchange = e => { state[k] = e.target.value; state.limit = 80; renderInventario(); });
  $('#clr').onclick = () => { Object.assign(state, {q:'', estado:new Set(), area:'', volt:'', montaje:'', kwMin:'', frame:'', tag:'', cols:{}}); $('#gsearch').value = ''; renderInventario(); };
  $('#csv').onclick = exportCSV;
  $$('th', v).forEach(th => th.onclick = () => { const k = th.dataset.k; state.dir = state.sort === k ? -state.dir : 1; state.sort = k; renderInventario(); });
  fillRows();
}
function fillRows() {
  const rows = filtered(), k = state.sort;
  rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'es', {numeric: true})) * state.dir; });
  $('#cnt').textContent = `${rows.length} de ${D.length} motores`;
  const tb = $('#tb');
  tb.innerHTML = rows.length ? rows.slice(0, state.limit).map(m => `<tr data-id="${m.id}"><td><b>${m.numero ?? '—'}</b></td><td><span class="pill" style="--c:${COL[m.estado]}">${m.estado}</span></td><td><span class="tag">${esc(m.tag) || '—'}</span></td><td class="desc" title="${esc(m.descripcion)}">${esc(m.descripcion) || '—'}</td><td>${esc(m.area)}</td><td class="num">${fmt(m.kw, 1)}</td><td class="num">${fmt(m.hp, 1)}</td><td class="num">${esc(m.voltTxt) || '—'}</td><td class="num">${fmt(m.rpm)}</td><td class="num">${fmt(m.amp, 1)}</td><td>${esc(m.montaje) || '—'}</td><td>${esc(m.frame) || '—'}</td><td>${esc(m.rodLibre) || '—'}</td><td>${esc(m.rodCarga) || '—'}</td><td class="num">${fmt(m.cosFi, 2)}</td></tr>`).join('') : `<tr><td colspan="15" class="empty">Sin resultados con estos filtros</td></tr>`;
  $$('tr[data-id]', tb).forEach(r => r.onclick = () => openDrawer(+r.dataset.id));
  $('#mr').innerHTML = rows.length > state.limit ? `<button class="btn sec more" id="more">Mostrar más (${rows.length - state.limit} restantes)</button>` : '';
  const mb = $('#more'); if (mb) mb.onclick = () => { state.limit += 120; fillRows(); };
}
function exportCSV() {
  const rows = filtered(), keys = ['numero','faena','area','estado','tag','descripcion','kw','hp','volt','amp','rpm','montaje','frame','rodLibre','rodCarga','cosFi','observaciones'];
  const csv = [keys.join(';'), ...rows.map(m => keys.map(k => `"${String(m[k] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const a = Object.assign(document.createElement('a'), {href: URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'})), download: 'motores_cmp.csv'}); a.click();
}

/* ---------- vista Disponibilidad ---------- */
function renderDisp() {
  const sp = D.filter(m => m.estado === 'Repuesto'), tl = D.filter(m => m.estado === 'Taller'), rs = D.filter(m => m.estado === 'Reservado'), tr = D.filter(m => m.estado === 'En transporte');
  const sec = (t, a) => `<h3 style="margin:28px 0 12px">${t} · ${a.length}</h3>` + (a.length ? `<div class="disp">${a.sort((x, y) => (y.kw || 0) - (x.kw || 0)).map(card).join('')}</div>` : '<p class="note">Ningún motor en este estado.</p>');
  const card = m => `<div class="card sp" data-id="${m.id}"><div class="kw">${fmt(m.kw, 1)}<small> kW · ${fmt(m.hp, 1)} HP</small></div><div class="m"><b>N° ${m.numero ?? '—'}</b> ${m.tag ? '· ' + esc(m.tag) : ''}<br>${m.volt ? fmt(m.volt) + ' V' : 's/d'} · ${m.rpm ? fmt(m.rpm) + ' rpm' : 's/d'} · ${m.montaje || 'montaje s/d'}<br>${esc(m.descripcion || '')}${m.observaciones ? '<br><i>' + esc(m.observaciones) + '</i>' : ''}</div></div>`;
  $('#v-disponibilidad').innerHTML = `
    <div class="card" style="margin-bottom:18px"><h3>Cómo usar esta vista</h3><div class="sub" style="margin:0">Aquí ves los motores listos para reemplazo. Abre cualquier motor del inventario y el sistema te sugiere repuestos compatibles (misma potencia, tensión y velocidad similar).</div></div>
    <h3 style="margin:8px 0 12px">Repuestos en bodega · ${sp.length}</h3><div class="disp">${sp.sort((a, b) => (b.kw || 0) - (a.kw || 0)).map(card).join('')}</div>
    ${sec('En taller / reparación', tl)}${sec('Reservados', rs)}${sec('En transporte', tr)}`;
  $$('[data-id]', $('#v-disponibilidad')).forEach(e => e.onclick = () => openDrawer(+e.dataset.id));
}

/* ---------- ficha de motor ---------- */
const dr = $('#drawer'), scrim = $('#scrim');
function compat(m) {
  if (!m.kw) return [];
  return D.filter(x => x.estado === 'Repuesto' && x.id !== m.id && x.kw && Math.abs(x.kw - m.kw) / m.kw <= .1 && (!m.volt || !x.volt || x.volt === m.volt) && (!m.rpm || !x.rpm || Math.abs(x.rpm - m.rpm) / m.rpm <= .08));
}
function openDrawer(id) {
  const m = D.find(x => x.id === id); if (!m) return;
  const kv = (l, v) => `<div><span>${l}</span><b>${v == null || v === '' ? '—' : esc(v)}</b></div>`;
  const cs = m.estado === 'En servicio' || m.estado === 'Taller' ? compat(m) : [];
  dr.innerHTML = `
  <div class="dh"><button class="x" id="dx">✕</button><small>${esc(m.faena)}</small><h2>Motor N° ${m.numero ?? '—'}</h2><p>${esc(m.descripcion || m.tag || 'Sin descripción')}</p><span class="pill" style="--c:${COL[m.estado]}">${m.estado}</span></div>
  <div class="big"><div><b>${fmt(m.kw, 1)}</b><span>kW</span></div><div><b>${m.voltTxt ? esc(m.voltTxt) : '—'}</b><span>Voltios</span></div><div><b>${fmt(m.rpm)}</b><span>RPM</span></div></div>
  <div class="sec"><h4>Ubicación y estado</h4><div class="kv">${kv('Ubicación', m.area)}${kv('TAG', m.tag)}${kv('Estado', m.estado)}${kv('Faena', m.faena)}</div>${m.observaciones ? `<p class="note">${esc(m.observaciones)}</p>` : ''}
    ${m.actualizadoPor ? `<p class="upd">Última actualización: ${esc(m.actualizadoPor)} · ${new Date(m.actualizadoEn).toLocaleString('es-CL')}</p>` : ''}</div>
  ${canEdit() ? `<form class="sec eform" id="ef"><h4>Actualizar motor</h4>
    <label>Estado<select name="estado">${ESTADOS.map(e => `<option ${e.k === m.estado ? 'selected' : ''}>${e.k}</option>`).join('')}</select></label>
    <label>Ubicación<input name="area" list="areas" value="${esc(m.area)}" maxlength="60" required></label>
    <datalist id="areas">${[...new Set(D.map(x => x.area))].map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    <label>Observaciones<textarea name="obs" rows="2" maxlength="500">${esc(m.observaciones)}</textarea></label>
    <label>Motivo del cambio (queda en el historial)<input name="com" maxlength="300"></label>
    <div class="erow"><button class="btn" type="submit">Guardar cambios</button><span id="emsg"></span></div></form>` : ''}
  <div class="sec"><h4>Características técnicas</h4><div class="kv">${kv('Potencia', `${fmt(m.hp, 1)} HP / ${fmt(m.kw, 1)} kW`)}${kv('Corriente', m.amp != null ? fmt(m.amp, 1) + ' A' : null)}${kv('Montaje', m.montaje)}${kv('Frame', m.frame)}${kv('Cos φ', m.cosFi != null ? fmt(m.cosFi, 2) : null)}${kv('Rodam. lado libre', m.rodLibre)}${kv('Rodam. lado carga', m.rodCarga)}</div></div>
  ${m.hojaVida ? `<div class="sec"><h4>Hoja de vida</h4><p class="note" style="margin:0;word-break:break-all">${esc(m.hojaVida)}</p></div>` : ''}
  ${cs.length ? `<div class="sec"><h4>Repuestos compatibles (${cs.length})</h4><div class="rep">${cs.slice(0, 6).map(x => `<button data-id="${x.id}"><b>N° ${x.numero ?? '—'}</b><div>${fmt(x.kw, 1)} kW · ${x.volt ? fmt(x.volt) + ' V' : 's/d'} · ${x.rpm ? fmt(x.rpm) + ' rpm' : 's/d'}<small>${esc(x.tag || x.descripcion || 'Bodega')}</small></div></button>`).join('')}</div></div>` : (m.estado === 'En servicio' ? `<div class="sec"><h4>Repuestos compatibles</h4><p class="note">No hay repuestos en bodega con potencia, tensión y velocidad similares.</p></div>` : '')}
  <div class="sec"><h4>Historial de cambios</h4><div id="hist" class="histl">Cargando…</div></div>`;
  dr.dataset.id = m.id;
  $$('[data-id]', dr).forEach(b => b.onclick = () => openDrawer(+b.dataset.id));
  const ef = $('#ef', dr);
  if (ef) ef.onsubmit = async e => {
    e.preventDefault(); const msg = $('#emsg'); msg.className = ''; msg.textContent = 'Guardando…';
    const f = ef.elements;
    try {
      Object.assign(m, await window.MV.guardar(m.id, {estado: f.estado.value, area: f.area.value, observaciones: f.obs.value, comentario: f.com.value}));
      index(m); refresh(); openDrawer(m.id);
    } catch (err) { msg.className = 'bad'; msg.textContent = err.message; }
  };
  const CAMPO = {estado: 'Estado', area: 'Ubicación', observaciones: 'Observaciones'};
  window.MV.historial(m.id).then(h => {
    const el = $('#hist'); if (!el || dr.dataset.id != m.id) return;
    el.innerHTML = h.length ? h.map(x => `<div class="hi"><b>${CAMPO[x.campo] || x.campo}</b>: ${esc(x.anterior ?? '—')} → <b>${esc(x.nuevo ?? '—')}</b><small>${esc(x.usuario)} · ${new Date(x.fecha).toLocaleString('es-CL')}${x.comentario ? ' · “' + esc(x.comentario) + '”' : ''}</small></div>`).join('') : '<p class="note" style="margin:0">Sin cambios registrados desde la importación del Excel.</p>';
  }).catch(() => {});
  $('#dx').onclick = closeDrawer; dr.classList.add('on'); scrim.classList.add('on'); dr.scrollTop = 0;
}
const refresh = () => ({resumen: renderResumen, inventario: renderInventario, disponibilidad: renderDisp})[state.view]();
function closeDrawer() { dr.classList.remove('on'); scrim.classList.remove('on'); }
scrim.onclick = closeDrawer;

/* ---------- navegación ---------- */
const META = {resumen: ['Resumen', 'Panorama general de motores eléctricos de la faena'], inventario: ['Inventario', 'Busca, filtra y revisa la ficha técnica de cada motor'], disponibilidad: ['Disponibilidad', 'Repuestos en bodega, reservados, en transporte y en reparación']};
function go(view, filters) {
  if (filters) { Object.assign(state, {estado: new Set(), area: '', volt: '', montaje: '', kwMin: '', frame: '', tag: '', cols: {}, limit: 80}); for (const [k, v] of Object.entries(filters)) state[k] = k === 'estado' ? new Set([v]) : v; }
  state.view = view;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + view));
  $$('.nav').forEach(n => n.classList.toggle('on', n.dataset.view === view));
  $('#title').textContent = META[view][0]; $('#subtitle').textContent = META[view][1];
  ({resumen: renderResumen, inventario: renderInventario, disponibilidad: renderDisp})[view]();
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
go('resumen');
})();
