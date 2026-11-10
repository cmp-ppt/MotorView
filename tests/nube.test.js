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

/* ---------- motor nuevo ---------- */
test('aMotorNuevo calcula kW desde HP y HP desde kW, y acepta coma decimal', () => {
  const a = N.aMotorNuevo({ faena: 'Planta Magnetita', area: 'Rougher', hp: '10' });
  assert.equal(a.cuerpo.kw, 7.5);
  const b = N.aMotorNuevo({ faena: 'Planta Magnetita', area: 'Rougher', kw: '7,5' });
  assert.equal(b.cuerpo.hp, 10);
  assert.deepEqual(b.errores, []);
  const c = N.aMotorNuevo({ faena: 'F', area: 'A', hp: '10', kw: '8' });          // si se indican los dos, se respetan
  assert.deepEqual([c.cuerpo.hp, c.cuerpo.kw], [10, 8]);
});

test('aMotorNuevo exige faena y ubicación, y vacío se manda como null', () => {
  const r = N.aMotorNuevo({});
  assert.equal(r.errores.length, 2);
  assert.match(r.errores.join(' '), /faena/); assert.match(r.errores.join(' '), /ubicación/);
  const ok = N.aMotorNuevo({ faena: 'F', area: 'A', tag: '  ', descripcion: ' Bomba   de agua ', numero: '' });
  assert.equal(ok.cuerpo.tag, null); assert.equal(ok.cuerpo.numero, null);
  assert.equal(ok.cuerpo.descripcion, 'Bomba de agua');
  assert.equal(ok.cuerpo.estado, 'En servicio');
});

test('aMotorNuevo rechaza valores que la base también rechaza', () => {
  const malo = d => N.aMotorNuevo(Object.assign({ faena: 'F', area: 'A' }, d)).errores.length > 0;
  assert.equal(malo({ kw: '-5' }), true);
  assert.equal(malo({ kw: '0' }), true);
  assert.equal(malo({ kw: 'abc' }), true);
  assert.equal(malo({ cosFi: '2' }), true);
  assert.equal(malo({ cosFi: '0,86' }), false);
  assert.equal(malo({ numero: '4,5' }), true);
  assert.equal(malo({ numero: '0' }), true);
  assert.equal(malo({ estado: 'Volando' }), true);
  assert.equal(malo({ criticidad: 'Z' }), true);
  assert.equal(malo({ montaje: 'diagonal' }), true);
  assert.equal(malo({ volt: 'alto' }), true);
  assert.equal(malo({ tag: 'x'.repeat(101) }), true);
  assert.equal(malo({ observaciones: 'x'.repeat(501) }), true);
});

test('aMotorNuevo separa el voltaje en número y texto', () => {
  const r = N.aMotorNuevo({ faena: 'F', area: 'A', volt: '380/660' });
  assert.equal(r.cuerpo.volt, 380); assert.equal(r.cuerpo.volt_txt, '380/660');
  assert.equal(N.aMotorNuevo({ faena: 'F', area: 'A', volt: '4,16' }).cuerpo.volt, 4.16);
});
