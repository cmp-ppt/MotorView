/**
 * Acceso a los datos en Supabase por REST (PostgREST), con el token del usuario.
 * La anon key sola no abre nada: las políticas RLS exigen sesión y perfil.
 *
 * El mapeo entre columnas (snake_case) y la app (camelCase) está separado de la
 * red para poder probarlo con Node (tests/nube.test.js).
 */
(function (global) {
  'use strict';

  var ESTADOS = ['En servicio', 'Taller', 'Repuesto', 'Reservado', 'En transporte', 'De baja'];

  var T = { motores: 'motorview_motores', historial: 'motorview_historial', perfiles: 'motorview_perfiles', reparaciones: 'motorview_reparaciones' };
  var TIPOS_REPARACION = ['Rebobinado', 'Cambio de rodamientos', 'Reparación mecánica', 'Mantención', 'Prueba eléctrica', 'Otro'];

  /* ─────────────── lo que se puede probar sin red ─────────────── */

  function deFila(r) {
    return {
      id: r.id, numero: r.numero, faena: r.faena, area: r.area, estado: r.estado, tag: r.tag,
      descripcion: r.descripcion, observaciones: r.observaciones, hp: r.hp, kw: r.kw, amp: r.amp,
      volt: r.volt, voltTxt: r.volt_txt, rpm: r.rpm, montaje: r.montaje, frame: r.frame,
      rodLibre: r.rod_libre, rodCarga: r.rod_carga, cosFi: r.cos_fi, hojaVida: r.hoja_vida,
      criticidad: r.criticidad == null ? null : r.criticidad,
      actualizadoEn: r.actualizado_en, actualizadoPor: r.actualizado_por
    };
  }

  /** Formulario de reparación → cuerpo del POST. Vacío se manda como null; quién y cuándo lo pone el servidor. */
  function aReparacion(motorId, d) {
    var vacio = function (v) { v = v == null ? '' : String(v).trim(); return v === '' ? null : v; };
    var o = { motor_id: motorId, tipo: d.tipo, taller: vacio(d.taller), descripcion: vacio(d.descripcion), resultado: vacio(d.resultado) };
    if (vacio(d.fecha)) o.fecha = String(d.fecha).trim();
    return o;
  }

  /** Cambios del formulario → cuerpo del PATCH. Vacío se manda como null. */
  function aCambios(c) {
    var vacio = function (v) { v = v == null ? '' : String(v).trim(); return v === '' ? null : v; };
    var o = {};
    if ('estado' in c) o.estado = c.estado;
    if ('area' in c) o.area = String(c.area).trim();
    if ('observaciones' in c) o.observaciones = vacio(c.observaciones);
    if ('criticidad' in c) o.criticidad = vacio(c.criticidad);
    o.motivo = vacio(c.comentario);
    return o;
  }

  /** Texto de un formulario → número. Vacío = null; acepta coma o punto decimal; si no es un número = NaN. */
  function numeroDe(v) {
    var t = v == null ? '' : String(v).trim().replace(',', '.');
    if (t === '') return null;
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }

  /**
   * Formulario de motor nuevo → cuerpo del POST, validando lo que la base también valida.
   * Devuelve { cuerpo, errores }. Si solo se indica HP o solo kW, el otro se calcula (1 HP = 0,746 kW).
   */
  function aMotorNuevo(d) {
    var e = [];
    var txt = function (v, max, nombre) {
      var t = v == null ? '' : String(v).trim().replace(/\s+/g, ' ');
      if (t.length > max) e.push(nombre + ': máximo ' + max + ' caracteres.');
      return t === '' ? null : t;
    };
    var pos = function (v, nombre) {
      var n = numeroDe(v);
      if (n !== null && !(n > 0)) { e.push(nombre + ' debe ser un número mayor que 0.'); return null; }
      return n;
    };
    var faena = txt(d.faena, 100, 'Faena'), area = txt(d.area, 60, 'Ubicación');
    if (!faena) e.push('Indica la faena.');
    if (!area) e.push('Indica la ubicación (área) del motor.');
    var estado = d.estado || 'En servicio';
    if (ESTADOS.indexOf(estado) < 0) e.push('Estado no válido.');
    var numero = numeroDe(d.numero);
    if (numero !== null && !(numero >= 1 && numero % 1 === 0)) { e.push('El N° de motor debe ser un número entero mayor que 0.'); numero = null; }
    var crit = txt(d.criticidad, 1, 'Criticidad');
    if (crit && ['A', 'B', 'C'].indexOf(crit) < 0) e.push('Criticidad: A, B o C.');
    var montaje = txt(d.montaje, 20, 'Montaje');
    if (montaje && ['horizontal', 'vertical'].indexOf(montaje) < 0) e.push('Montaje: horizontal o vertical.');
    var hp = pos(d.hp, 'La potencia en HP'), kw = pos(d.kw, 'La potencia en kW');
    if (kw == null && hp != null) kw = Math.round(hp * 0.746 * 10) / 10;
    if (hp == null && kw != null) hp = Math.round(kw / 0.746);
    var amp = pos(d.amp, 'La corriente'), rpm = pos(d.rpm, 'La velocidad');
    var cos = numeroDe(d.cosFi);
    if (cos !== null && !(cos >= 0.5 && cos <= 1)) { e.push('El cos φ debe estar entre 0,5 y 1.'); cos = null; }
    var voltTxt = txt(d.volt, 30, 'Voltaje'), volt = null;
    if (voltTxt) {
      var m = /\d+(?:[.,]\d+)?/.exec(voltTxt);
      if (!m) e.push('Voltaje: escribe un número, por ejemplo 380 o 380/660.'); else volt = Number(m[0].replace(',', '.'));
      if (volt !== null && !(volt > 0)) { e.push('El voltaje debe ser mayor que 0.'); volt = null; }
    }
    var cuerpo = {
      numero: numero, faena: faena, area: area, estado: estado, tag: txt(d.tag, 100, 'TAG'), descripcion: txt(d.descripcion, 300, 'Descripción'),
      observaciones: txt(d.observaciones, 500, 'Observaciones'), hp: hp, kw: kw, amp: amp, volt: volt, volt_txt: voltTxt, rpm: rpm,
      montaje: montaje, frame: txt(d.frame, 50, 'Frame'), rod_libre: txt(d.rodLibre, 100, 'Rodamiento lado libre'),
      rod_carga: txt(d.rodCarga, 100, 'Rodamiento lado carga'), cos_fi: cos, criticidad: crit
    };
    return { cuerpo: cuerpo, errores: e };
  }

  function mensaje(estado, json) {
    var m = json && (json.message || json.msg || json.error_description) || '';
    if (estado === 401) return 'Tu sesión expiró. Vuelve a ingresar.';
    if (estado === 403 || (json && json.code === '42501')) return 'Tu rol no permite este cambio.';
    if (json && /^(PGRST204|PGRST205|42703|42P01)$/.test(json.code)) return 'La base de datos no tiene la última versión. Ejecuta supabase/esquema.sql de nuevo en Supabase.';
    if (json && json.code === '23514') return 'Algún valor no es válido (estado, ubicación, criticidad, tipo, números fuera de rango o textos muy largos).';
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

  /** Ingresa un motor nuevo (solo admin y mantenimiento). El id, quién y cuándo los pone la base de datos. */
  async function crearMotor(datos) {
    var r = aMotorNuevo(datos);
    if (r.errores.length) throw new Error(r.errores[0]);
    var f = await rest(T.motores, { metodo: 'POST', cuerpo: r.cuerpo, cabeceras: { Prefer: 'return=representation' } });
    if (!f || !f.length) throw new Error('No se pudo ingresar el motor: tu rol no permite agregar motores.');
    return deFila(f[0]);
  }

  async function reparaciones(id) {
    return rest(T.reparaciones + '?select=id,fecha,tipo,taller,descripcion,resultado,registrado_por,registrado_en&motor_id=eq.' + encodeURIComponent(id) + '&order=fecha.desc,id.desc&limit=100');
  }

  async function registrarReparacion(id, datos) {
    var f = await rest(T.reparaciones, { metodo: 'POST', cuerpo: aReparacion(id, datos), cabeceras: { Prefer: 'return=representation' } });
    if (!f || !f.length) throw new Error('No se pudo registrar: tu rol no permite agregar reparaciones.');
    return f[0];
  }

  /** Registro global: los últimos cambios de todos los motores y las reparaciones registradas. */
  async function cambios(limite) {
    var n = limite || 1000;
    var r = await Promise.all([
      rest(T.historial + '?select=id,motor_id,fecha,usuario,campo,anterior,nuevo,comentario&order=id.desc&limit=' + n),
      rest(T.reparaciones + '?select=id,motor_id,tipo,taller,descripcion,resultado,fecha,registrado_por,registrado_en&order=id.desc&limit=' + n)
    ]);
    return { historial: r[0], reparaciones: r[1] };
  }

  var API = { deFila: deFila, aCambios: aCambios, aReparacion: aReparacion, mensaje: mensaje, perfil: perfil, motores: motores, guardar: guardar,
              historial: historial, cambios: cambios, crearMotor: crearMotor, aMotorNuevo: aMotorNuevo, numeroDe: numeroDe, ESTADOS: ESTADOS, reparaciones: reparaciones, registrarReparacion: registrarReparacion, TIPOS_REPARACION: TIPOS_REPARACION };
  global.NUBE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
