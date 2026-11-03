const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/sesion.js');

const jwt = payload => 'aaa.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.ccc';

test('normalizarUrl acepta solo proyectos de Supabase por https', () => {
  assert.equal(S.normalizarUrl(' https://abc123.supabase.co/ '), 'https://abc123.supabase.co');
  assert.equal(S.normalizarUrl('http://abc123.supabase.co'), '');
  assert.equal(S.normalizarUrl('https://evil.example.com'), '');
  assert.equal(S.normalizarUrl(''), '');
});

test('problemaDeClave rechaza las claves secretas y vacías', () => {
  assert.match(S.problemaDeClave(''), /Falta/);
  assert.match(S.problemaDeClave('sb_secret_abc'), /SECRETA/);
  assert.match(S.problemaDeClave(jwt({ role: 'service_role' })), /service_role/);
  assert.equal(S.problemaDeClave(jwt({ role: 'anon' })), '');
  assert.equal(S.problemaDeClave('sb_publishable_abc'), '');
});

test('deRespuesta arma la sesión y asume 1 hora si falta expires_in', () => {
  const s = S.deRespuesta({ access_token: 'a', refresh_token: 'r', user: { id: 'u1', email: 'x@cmp.cl' } }, 1000);
  assert.deepEqual(s, { access: 'a', refresh: 'r', expiraEn: 1000 + 3600 * 1000, id: 'u1', email: 'x@cmp.cl' });
  assert.equal(S.deRespuesta({ access_token: 'a' }), null);
});

test('expirada renueva antes del vencimiento', () => {
  const s = { access: 'a', expiraEn: 10 * 60000 };
  assert.equal(S.expirada(s, 0), false);
  assert.equal(S.expirada(s, 9 * 60000), true);      // quedan 60 s < margen de 120 s
  assert.equal(S.expirada(null, 0), true);
});

test('mensajeDeError es legible', () => {
  assert.match(S.mensajeDeError(400, { error_description: 'Invalid login credentials' }), /incorrectos/);
  assert.match(S.mensajeDeError(429, {}), /Demasiados/);
});
