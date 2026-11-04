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

test('aCambios incluye la criticidad solo si viene en el formulario', () => {
  assert.deepEqual(N.aCambios({ criticidad: 'A', comentario: 'bomba principal' }), { criticidad: 'A', motivo: 'bomba principal' });
  assert.deepEqual(N.aCambios({ criticidad: '' }), { criticidad: null, motivo: null });
  assert.equal('criticidad' in N.aCambios({ estado: 'Taller' }), false);
});

test('aReparacion arma el cuerpo y no manda quién ni cuándo lo registró', () => {
  const b = N.aReparacion(7, { tipo: 'Rebobinado', fecha: '2026-10-20', taller: ' Taller Norte ', descripcion: '', resultado: 'ok', registrado_por: 'x@y.cl' });
  assert.deepEqual(b, { motor_id: 7, tipo: 'Rebobinado', taller: 'Taller Norte', descripcion: null, resultado: 'ok', fecha: '2026-10-20' });
  assert.equal('fecha' in N.aReparacion(7, { tipo: 'Otro', fecha: '' }), false);
});

test('deFila trae la criticidad', () => {
  assert.equal(N.deFila({ id: 1, criticidad: 'B' }).criticidad, 'B');
  assert.equal(N.deFila({ id: 1 }).criticidad, null);
});

test('mensaje avisa cuando falta actualizar el esquema de la base', () => {
  assert.match(N.mensaje(400, { code: 'PGRST204' }), /esquema\.sql/);
  assert.match(N.mensaje(404, { code: 'PGRST205' }), /esquema\.sql/);
});

test('mensaje traduce los errores más comunes', () => {
  assert.match(N.mensaje(401, {}), /sesión expiró/);
  assert.match(N.mensaje(403, {}), /rol no permite/);
  assert.match(N.mensaje(400, { code: '42501' }), /rol no permite/);
  assert.match(N.mensaje(400, { code: '23514' }), /no es válido/);
  assert.equal(N.mensaje(500, { message: 'boom' }), 'boom');
});
