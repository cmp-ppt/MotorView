const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/analisis.js');

const motor = (o) => Object.assign({ id: 1, numero: 1, estado: 'En servicio', area: 'Rougher', tag: 'FS-1', kw: 7.5, volt: 380, rpm: 1430, amp: 15, cosFi: 0.86, criticidad: null }, o);

test('polos deduce 2, 4, 6 y 8 polos a 50 Hz', () => {
  assert.equal(A.polos(2960), 2);
  assert.equal(A.polos(1430), 4);
  assert.equal(A.polos(1485), 4);
  assert.equal(A.polos(985), 6);
  assert.equal(A.polos(735), 8);
  assert.equal(A.polos(null), null);
  assert.equal(A.polos(0), null);
});

test('calidad cuenta cada problema y no revisa los motores dados de baja', () => {
  const D = [
    motor({ id: 1, numero: 10, area: 'Sin clasificar', tag: null }),
    motor({ id: 2, numero: 10 }),                                   // N° repetido con el anterior
    motor({ id: 3, numero: null, cosFi: null }),
    motor({ id: 4, numero: 4, kw: null }),
    motor({ id: 5, numero: 5, estado: 'De baja', area: 'Sin clasificar', tag: null, cosFi: null }),
  ];
  const c = Object.fromEntries(A.calidad(D).map(p => [p.k, p]));
  assert.equal(c.sinArea.n, 1);
  assert.equal(c.sinTag.n, 1);
  assert.deepEqual(c.repetido.ids.sort(), [1, 2]);
  assert.equal(c.sinNumero.n, 1);
  assert.equal(c.sinPlaca.n, 1);
  assert.equal(c.sinCosFi.n, 1);                                    // el dado de baja no cuenta
  assert.equal(c.sinCrit.n, 4);
  assert.equal(c.sinArea.de, 4);                                    // universo = motores que no están de baja
});

test('cobertura agrupa por potencia, tensión y polos, y marca los tipos sin respaldo', () => {
  const D = [
    motor({ id: 1, kw: 7.5, rpm: 1430 }),
    motor({ id: 2, kw: 7.5, rpm: 1460 }),                           // mismo tipo (4 polos)
    motor({ id: 3, kw: 7.5, rpm: 1445, estado: 'Repuesto' }),
    motor({ id: 4, kw: 37, rpm: 2960 }),
    motor({ id: 5, kw: 37, rpm: 2960, criticidad: 'A' }),
    motor({ id: 6, kw: 55, rpm: 1480, estado: 'Repuesto' }),        // repuesto sin motores en servicio: no se lista
    motor({ id: 7, kw: 7.5, rpm: 1430, estado: 'De baja' }),
  ];
  const r = A.cobertura(D);
  assert.equal(r.length, 2);
  assert.equal(r[0].kw, 37);                                        // sin respaldo y con motores críticos: primero
  assert.equal(r[0].sinRespaldo, true);
  assert.equal(r[0].servicio, 2);
  assert.equal(r[0].criticos, 1);
  assert.equal(r[1].kw, 7.5);
  assert.equal(r[1].sinRespaldo, false);
  assert.equal(r[1].servicio, 2);
  assert.equal(r[1].repuesto, 1);
});

test('cobertura cuenta reservados, en transporte y en taller aparte', () => {
  const D = [motor({ id: 1 }), motor({ id: 2, estado: 'Reservado' }), motor({ id: 3, estado: 'En transporte' }), motor({ id: 4, estado: 'Taller' })];
  const [x] = A.cobertura(D);
  assert.deepEqual([x.servicio, x.reservado, x.transporte, x.taller, x.repuesto], [1, 1, 1, 1, 0]);
  assert.equal(x.sinRespaldo, true);                                // un reservado no está disponible
});

test('criticosPorArea cuenta los motores A y cuántos están fuera de servicio', () => {
  const D = [
    motor({ id: 1, area: 'Flotación', criticidad: 'A' }),
    motor({ id: 2, area: 'Flotación', criticidad: 'A', estado: 'Taller' }),
    motor({ id: 3, area: 'Rougher', criticidad: 'A' }),
    motor({ id: 4, area: 'Rougher', criticidad: 'B' }),
    motor({ id: 5, area: 'Rougher', criticidad: 'A', estado: 'De baja' }),
  ];
  const r = A.criticosPorArea(D);
  assert.deepEqual(r.map(x => [x.area, x.total, x.servicio, x.fuera]), [['Flotación', 2, 1, 1], ['Rougher', 1, 1, 0]]);
});

/* ---------- búsqueda ---------- */
const busca = (m, q) => A.coincideBusqueda(Object.assign({}, m, (() => { const x = A.indiceBusqueda(m); return { _s: x.s, _c: x.c }; })()), q);

test('buscar 200L encuentra el frame escrito "200 L" y "200L"', () => {
  const con = motor({ frame: '200 L' }), pegado = motor({ frame: '200L' }), otro = motor({ frame: '180 L' });
  ['200L', '200l', '200 L', '200 l', '200-L'].forEach(q => {
    assert.equal(busca(con, q), true, q + ' sobre "200 L"');
    assert.equal(busca(pegado, q), true, q + ' sobre "200L"');
  });
  assert.equal(busca(otro, '200L'), false);
});

test('la búsqueda compacta no junta columnas distintas', () => {
  const m = motor({ numero: 20, frame: '0L', tag: null, descripcion: null });
  assert.equal(busca(m, '200l'), false);
});

test('busca en todas las columnas, también en las numéricas', () => {
  const m = motor({ kw: 7.5, hp: 10, amp: 15.5, volt: 380, voltTxt: '380', rpm: 1430, cosFi: 0.86, montaje: 'vertical', criticidad: 'A', estado: 'Taller', rodLibre: '6208-ZZ' });
  ['380', '7,5', '7.5', '15,5', '1430', '0,86', 'vertical', 'taller', 'a', '6208zz', '6208-zz'].forEach(q => assert.equal(busca(m, q), true, q));
  assert.equal(busca(m, '75'), false);                      // 7,5 kW no es 75
  assert.equal(busca(m, 'bomba'), false);
});

test('ignora acentos y mayúsculas, y encuentra el TAG sin guiones', () => {
  const m = motor({ area: 'Flotación', tag: 'FS-21255-1M1', descripcion: 'Tambor Finisher' });
  assert.equal(busca(m, 'FLOTACION'), true);
  assert.equal(busca(m, 'fs21255'), true);
  assert.equal(busca(m, 'tambor finisher'), true);
  assert.equal(busca(m, 'finisher tambor'), true);          // palabras en cualquier orden
  assert.equal(busca(m, ''), true);
});

test('compacto deja solo letras y números', () => {
  assert.equal(A.compacto(' 200 L/4 '), '200l4');
  assert.equal(A.compacto('Flotación'), 'flotacion');
});

test('"200 L" no se confunde con un motor de 200 kW que tiene una L en otro campo', () => {
  const falso = motor({ kw: 200, frame: '180 S', descripcion: 'Molino' });
  assert.equal(busca(falso, '200 L'), false);
  assert.equal(busca(falso, '200'), true);                  // sola, la potencia sí coincide
});
