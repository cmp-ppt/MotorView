const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/nube.js');

test('deFila pasa de snake_case a camelCase', () => {
  const m = N.deFila({ id: 1, numero: 2, volt_txt: '380', rod_libre: '6208', rod_carga: '6209', cos_fi: 0.86, hoja_vida: 'x', actualizado_por: 'a@b.cl', actualizado_en: 't' });
  assert.equal(m.voltTxt, '380'); assert.equal(m.rodLibre, '6208'); assert.equal(m.rodCarga, '6209');
  assert.equal(m.cosFi, 0.86); assert.equal(m.hojaVida, 'x'); assert.equal(m.actualizadoPor, 'a@b.cl'); assert.equal(m.actualizadoEn, 't');
});

test('aCambios manda vacío como null y solo los campos editables', () => {
  const c = N.aCambios({ estado: 'Taller', area: ' Rougher ', observaciones: '  ', comentario: '', id: 99, kw: 1000 });
  assert.deepEqual(c, { estado: 'Taller', area: 'Rougher', observaciones: null, motivo: null });
});

test('aCambios conserva el motivo del cambio', () => {
  assert.equal(N.aCambios({ estado: 'Reservado', comentario: ' parada de planta ' }).motivo, 'parada de planta');
});

test('mensaje traduce los errores más comunes', () => {
  assert.match(N.mensaje(401, {}), /sesión expiró/);
  assert.match(N.mensaje(403, {}), /rol no permite/);
  assert.match(N.mensaje(400, { code: '42501' }), /rol no permite/);
  assert.match(N.mensaje(400, { code: '23514' }), /no es válido/);
  assert.equal(N.mensaje(500, { message: 'boom' }), 'boom');
});
