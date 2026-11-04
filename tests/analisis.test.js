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
