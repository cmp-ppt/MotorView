/**
 * Sesión de usuario contra Supabase Auth, por REST (sin librerías).
 *
 * No hay registro desde la app a propósito: las cuentas las crea el
 * administrador en el panel de Supabase. Una pantalla de registro abierta en
 * un sitio público sería exactamente el agujero que esto viene a tapar.
 *
 * La lógica que decide si una clave o un token sirven está separada de la red
 * para poder probarla con Node (tests/sesion.test.js).
 */
(function (global) {
  'use strict';

  var CLAVE = 'motorview-cmp.sesion.v1';
  var MARGEN_MS = 120000;           // se renueva 2 minutos antes de que venza

  /* ─────────────── lo que se puede probar sin red ─────────────── */

  function normalizarUrl(u) {
    u = String(u || '').trim().replace(/\/+$/, '');
    return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u) ? u : '';
  }

  /** Devuelve el problema de la clave, o "" si sirve para el navegador. */
  function problemaDeClave(k) {
    k = String(k || '').trim();
    if (!k) return 'Falta la clave anon/publishable en js/config.js.';
    if (/^sb_secret_/i.test(k)) return 'Esa es la clave SECRETA. Usa la publicable (sb_publishable_…).';
    if (k.split('.').length === 3) {                       // formato antiguo (JWT)
      try {
        var p = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (p.role === 'service_role') return 'Esa es la clave service_role (secreta). Usa la anon/publishable.';
      } catch (e) { return 'La clave no tiene un formato válido.'; }
    }
    return '';
  }

  /** Respuesta de /auth/v1/token → lo que se guarda. null si no sirve. */
  function deRespuesta(json, ahora) {
    if (!json || !json.access_token || !json.refresh_token) return null;
    var t = ahora instanceof Date ? ahora.getTime() : (ahora == null ? Date.now() : ahora);
    var vida = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
    return {
      access: json.access_token, refresh: json.refresh_token, expiraEn: t + vida * 1000,
      id: json.user && json.user.id || '', email: json.user && (json.user.email || json.user.id) || ''
    };
  }

  function expirada(s, ahora, margen) {
    if (!s || !s.access || !s.expiraEn) return true;
    var t = ahora instanceof Date ? ahora.getTime() : (ahora == null ? Date.now() : ahora);
    return s.expiraEn - (margen === undefined ? MARGEN_MS : margen) <= t;
  }

  function mensajeDeError(estado, json) {
    var crudo = json && (json.error_description || json.msg || json.message || json.error) || '';
    if (/email not confirmed/i.test(crudo)) return 'El usuario existe pero su correo no está confirmado.';
    if (/invalid login credentials/i.test(crudo)) return 'Correo o contraseña incorrectos.';
    if (estado === 429) return 'Demasiados intentos. Espera un momento.';
    if (estado === 400 || estado === 401) return crudo || 'No se pudo iniciar sesión.';
    return crudo || 'Error ' + estado + ' al contactar a Supabase.';
  }

  /* ──────────────────────────── red ──────────────────────────── */

  function cfg() { return global.CONFIG_NUBE || {}; }
  function guardar(s) { try { localStorage.setItem(CLAVE, JSON.stringify(s)); } catch (e) {} }
  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; } }
  function borrar() { try { localStorage.removeItem(CLAVE); } catch (e) {} }

  async function auth(ruta, cuerpo) {
    var r = await fetch(normalizarUrl(cfg().url) + '/auth/v1/' + ruta, {
      method: 'POST', headers: { apikey: cfg().anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    });
    var json = await r.json().catch(function () { return {}; });
    return { ok: r.ok, estado: r.status, json: json };
  }

  async function ingresar(email, password) {
    var r = await auth('token?grant_type=password', { email: String(email).trim(), password: password });
    var s = r.ok && deRespuesta(r.json);
    if (!s) throw new Error(mensajeDeError(r.estado, r.json));
    guardar(s);
    return s;
  }

  var enCurso = null;
  /** Token vigente (renovándolo si hace falta) o null si no hay sesión. */
  async function token() {
    var s = leer();
    if (!s) return null;
    if (!expirada(s)) return s.access;
    if (!enCurso) enCurso = auth('token?grant_type=refresh_token', { refresh_token: s.refresh }).then(function (r) {
      var n = r.ok && deRespuesta(r.json);
      if (n) { guardar(n); return n.access; }
      borrar(); return null;
    }).finally(function () { enCurso = null; });
    return enCurso;
  }

  async function salir() {
    var s = leer();
    try {
      if (s) await fetch(normalizarUrl(cfg().url) + '/auth/v1/logout', { method: 'POST', headers: { apikey: cfg().anonKey, Authorization: 'Bearer ' + s.access } });
    } catch (e) { /* sin red: igual se borra lo local */ }
    borrar();
  }

  var API = { normalizarUrl: normalizarUrl, problemaDeClave: problemaDeClave, deRespuesta: deRespuesta, expirada: expirada,
              mensajeDeError: mensajeDeError, ingresar: ingresar, token: token, salir: salir, actual: leer };
  global.SESION = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
