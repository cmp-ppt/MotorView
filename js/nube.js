/**
 * Acceso a los datos en Supabase por REST (PostgREST), con el token del usuario.
 * La anon key sola no abre nada: las políticas RLS exigen sesión y perfil.
 *
 * El mapeo entre columnas (snake_case) y la app (camelCase) está separado de la
 * red para poder probarlo con Node (tests/nube.test.js).
 */
(function (global) {
  'use strict';

  var T = { motores: 'motorview_motores', historial: 'motorview_historial', perfiles: 'motorview_perfiles' };

  /* ─────────────── lo que se puede probar sin red ─────────────── */

  function deFila(r) {
    return {
      id: r.id, numero: r.numero, faena: r.faena, area: r.area, estado: r.estado, tag: r.tag,
      descripcion: r.descripcion, observaciones: r.observaciones, hp: r.hp, kw: r.kw, amp: r.amp,
      volt: r.volt, voltTxt: r.volt_txt, rpm: r.rpm, montaje: r.montaje, frame: r.frame,
      rodLibre: r.rod_libre, rodCarga: r.rod_carga, cosFi: r.cos_fi, hojaVida: r.hoja_vida,
      actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por
    };
  }

  /** Cambios del formulario → cuerpo del PATCH. Vacío se manda como null. */
  function aCambios(c) {
    var vacio = function (v) { v = v == null ? '' : String(v).trim(); return v === '' ? null : v; };
    var o = {};
    if ('estado' in c) o.estado = c.estado;
    if ('area' in c) o.area = String(c.area).trim();
    if ('observaciones' in c) o.observaciones = vacio(c.observaciones);
    o.motivo = vacio(c.comentario);
    return o;
  }

  function mensaje(estado, json) {
    var m = json && (json.message || json.msg || json.error_description) || '';
    if (estado === 401) return 'Tu sesión expiró. Vuelve a ingresar.';
    if (estado === 403 || (json && json.code === '42501')) return 'Tu rol no permite este cambio.';
    if (json && json.code === '23514') return 'Algún valor no es válido (estado, ubicación o largo de los textos).';
    return m || 'Error ' + estado + ' al contactar a Supabase.';
  }

  /* ──────────────────────────── red ──────────────────────────── */

  async function rest(ruta, op) {
    var S = global.SESION, cfg = global.CONFIG_NUBE || {};
    var t = await S.token();
    if (!t) { var e = new Error('Tu sesión expiró. Vuelve a ingresar.'); e.sinSesion = true; throw e; }
    op = op || {};
    var r = await fetch(S.normalizarUrl(cfg.url) + '/rest/v1/' + ruta, {
      method: op.metodo || 'GET',
      headers: Object.assign({ apikey: cfg.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, op.cabeceras || {}),
      body: op.cuerpo ? JSON.stringify(op.cuerpo) : undefined
    });
    var json = await r.json().catch(function () { return null; });
    if (!r.ok) { var err = new Error(mensaje(r.status, json)); err.sinSesion = r.status === 401; throw err; }
    return json;
  }

  async function perfil(userId) {
    var f = await rest(T.perfiles + '?select=nombre,rol,activo&user_id=eq.' + encodeURIComponent(userId));
    return f && f[0] && f[0].activo ? { nombre: f[0].nombre, rol: f[0].rol } : null;
  }

  /** Todos los motores (PostgREST entrega máx. 1000 por petición: se pagina). */
  async function motores() {
    var todos = [], desde = 0, paso = 1000;
    for (;;) {
      var lote = await rest(T.motores + '?select=*&order=id', { cabeceras: { Range: desde + '-' + (desde + paso - 1), 'Range-Unit': 'items' } });
      todos = todos.concat(lote);
      if (lote.length < paso) break;
      desde += paso;
    }
    return todos.map(deFila);
  }

  async function guardar(id, cambios) {
    var f = await rest(T.motores + '?id=eq.' + encodeURIComponent(id), {
      metodo: 'PATCH', cuerpo: aCambios(cambios), cabeceras: { Prefer: 'return=representation' }
    });
    if (!f || !f.length) throw new Error('No se pudo guardar: tu rol no permite editar este motor.');
    return deFila(f[0]);
  }

  async function historial(id) {
    return rest(T.historial + '?select=fecha,usuario,campo,anterior,nuevo,comentario&motor_id=eq.' + encodeURIComponent(id) + '&order=id.desc&limit=100');
  }

  var API = { deFila: deFila, aCambios: aCambios, mensaje: mensaje, perfil: perfil, motores: motores, guardar: guardar, historial: historial };
  global.NUBE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
