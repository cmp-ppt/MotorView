/**
 * Análisis del inventario: calidad de datos, cobertura de repuestos y criticidad.
 * Son funciones puras (sin pantalla ni red) para poder probarlas con Node
 * (tests/analisis.test.js). La interfaz solo las dibuja.
 */
(function (global) {
  'use strict';

  var vacio = function (x) { return x == null || x === ''; };

  /* ───────────────────────── calidad de datos ───────────────────────── */

  /** Números de motor que aparecen más de una vez (el Excel los repite en algunos casos). */
  function numerosRepetidos(D) {
    var c = {}, rep = {};
    D.forEach(function (m) { if (m.numero != null) c[m.numero] = (c[m.numero] || 0) + 1; });
    Object.keys(c).forEach(function (k) { if (c[k] > 1) rep[k] = true; });
    return rep;
  }

  // Cada problema: clave, título, ayuda y la regla que dice si un motor lo tiene.
  // Los motores dados de baja no se revisan: su información ya no se usa.
  var PROBLEMAS = [
    { k: 'sinArea', t: 'Sin área clasificada', corrige: 'Desde la ficha: ubicación.',
      ayuda: 'No se sabe dónde está el motor.', f: function (m) { return m.area === 'Sin clasificar'; } },
    { k: 'sinTag', t: 'Sin TAG', corrige: 'Se completa en la base de datos o con una carga corregida.',
      ayuda: 'Sin TAG no se puede ubicar el equipo en la planta.', f: function (m) { return vacio(m.tag); } },
    { k: 'repetido', t: 'N° de motor repetido', corrige: 'Se corrige en la planilla de origen.',
      ayuda: 'Dos o más motores comparten el mismo número.', f: function (m, ctx) { return m.numero != null && ctx.rep[m.numero] === true; } },
    { k: 'sinNumero', t: 'Sin N° de motor', corrige: 'Se corrige en la planilla de origen.',
      ayuda: 'La fila no trae número de motor.', f: function (m) { return m.numero == null; } },
    { k: 'sinPlaca', t: 'Faltan datos de placa', corrige: 'Se completan en terreno, desde la placa del motor.',
      ayuda: 'Falta potencia, voltaje, velocidad o corriente.',
      f: function (m) { return m.kw == null || m.volt == null || m.rpm == null || m.amp == null; } },
    { k: 'sinCosFi', t: 'Sin cos φ', corrige: 'Se completa desde la placa o la hoja de datos.',
      ayuda: 'El cos φ teórico está vacío o no era un valor razonable.', f: function (m) { return m.cosFi == null; } },
    { k: 'sinCrit', t: 'Sin criticidad', corrige: 'Desde la ficha: criticidad A, B o C.',
      ayuda: 'Aún no se asignó qué tan crítico es el motor.', f: function (m) { return vacio(m.criticidad); } }
  ];

  /** Cuántos motores (sin contar los dados de baja) tiene cada problema. */
  function calidad(D) {
    var vivos = D.filter(function (m) { return m.estado !== 'De baja'; });
    var ctx = { rep: numerosRepetidos(D) };
    return PROBLEMAS.map(function (p) {
      var ids = vivos.filter(function (m) { return p.f(m, ctx); }).map(function (m) { return m.id; });
      return { k: p.k, t: p.t, ayuda: p.ayuda, corrige: p.corrige, n: ids.length, ids: ids, de: vivos.length };
    });
  }

  /* ─────────────────────── cobertura de repuestos ─────────────────────── */

  /** Número de polos a partir de la velocidad (red de 50 Hz: 2 polos ≈ 3000 rpm, 4 ≈ 1500, 6 ≈ 1000, 8 ≈ 750). */
  function polos(rpm) {
    if (!(rpm > 0)) return null;
    return Math.max(2, 2 * Math.round(3000 / rpm));
  }

  /**
   * Agrupa los motores por tipo (potencia, tensión y polos) y cuenta cuántos hay en servicio
   * y cuántos de repuesto. Un tipo "sin respaldo" tiene motores en servicio y ninguno de repuesto.
   * Primero salen los sin respaldo, con los críticos (A) arriba y luego los más expuestos.
   */
  function cobertura(D) {
    var g = {};
    D.forEach(function (m) {
      if (m.kw == null || m.estado === 'De baja') return;
      var p = polos(m.rpm), key = m.kw + '|' + (m.volt == null ? '' : m.volt) + '|' + (p == null ? '' : p);
      var x = g[key] || (g[key] = { kw: m.kw, hp: m.hp, volt: m.volt, voltTxt: m.voltTxt, polos: p,
        servicio: 0, repuesto: 0, reservado: 0, transporte: 0, taller: 0, criticos: 0 });
      if (m.estado === 'En servicio') { x.servicio++; if (m.criticidad === 'A') x.criticos++; }
      else if (m.estado === 'Repuesto') x.repuesto++;
      else if (m.estado === 'Reservado') x.reservado++;
      else if (m.estado === 'En transporte') x.transporte++;
      else if (m.estado === 'Taller') x.taller++;
    });
    var lista = Object.keys(g).map(function (k) { return g[k]; }).filter(function (x) { return x.servicio > 0; });
    lista.forEach(function (x) { x.sinRespaldo = x.repuesto === 0; });
    lista.sort(function (a, b) {
      if (a.sinRespaldo !== b.sinRespaldo) return a.sinRespaldo ? -1 : 1;
      if (a.criticos !== b.criticos) return b.criticos - a.criticos;
      if (a.servicio !== b.servicio) return b.servicio - a.servicio;
      return b.kw - a.kw;
    });
    return lista;
  }

  /* ───────────────────────── criticidad por área ───────────────────────── */

  /** Motores críticos (A) por área: cuántos hay, cuántos están en servicio y cuántos no. */
  function criticosPorArea(D) {
    var g = {};
    D.forEach(function (m) {
      if (m.criticidad !== 'A' || m.estado === 'De baja') return;
      var x = g[m.area] || (g[m.area] = { area: m.area, total: 0, servicio: 0, fuera: 0 });
      x.total++;
      if (m.estado === 'En servicio') x.servicio++; else x.fuera++;
    });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.fuera - a.fuera || b.total - a.total; });
  }

  /* ───────────────────────────── búsqueda ───────────────────────────── */

  var sinAcentos = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  /** Solo letras y números: "200 L", "200L" y "200-L" quedan iguales; "FS-21255-1M1" y "FS212551M1" también. */
  var compacto = function (s) { return sinAcentos(s).replace(/[^a-z0-9]/g, ''); };

  var CAMPOS_TEXTO = ['numero', 'estado', 'criticidad', 'area', 'faena', 'montaje', 'frame', 'rodLibre', 'rodCarga', 'tag', 'descripcion', 'observaciones', 'voltTxt'];
  var CAMPOS_NUMERO = ['kw', 'hp', 'amp', 'volt', 'rpm', 'cosFi'];

  /**
   * Texto en el que se busca: todas las columnas de la planilla.
   * `s`: texto normal (sin acentos ni mayúsculas); los números van con punto y con coma, para que "7,5" y "7.5" sirvan.
   * `c`: versión compacta de las columnas de texto, cada una por separado (para que dos columnas no se junten por error).
   */
  function indiceBusqueda(m) {
    var texto = CAMPOS_TEXTO.map(function (k) { return m[k]; }).filter(function (v) { return v != null && v !== ''; });
    var numeros = [];
    CAMPOS_NUMERO.forEach(function (k) {
      var v = m[k];
      if (v != null && v !== '') { numeros.push(String(v)); numeros.push(String(v).replace('.', ',')); }
    });
    return { s: sinAcentos(texto.concat(numeros).join(' ')), c: texto.map(compacto).filter(Boolean).join('|') };
  }

  /** ¿El motor coincide con lo escrito? Todas las palabras presentes, o lo escrito completo sin espacios ni signos. */
  function coincideBusqueda(m, q) {
    var t = sinAcentos(q).trim();
    if (!t) return true;
    var idx = m._s !== undefined ? { s: m._s, c: m._c || '' } : indiceBusqueda(m);
    var palabras = t.split(/\s+/);
    // Varias palabras en cualquier orden ("tambor finisher"), pero no con letras sueltas: "200 L" es un frame, no "200" y "L" por separado.
    var usaPalabras = palabras.length === 1 || palabras.every(function (p) { return p.length >= 2; });
    if (usaPalabras && palabras.every(function (p) { return idx.s.indexOf(p) !== -1; })) return true;
    var qc = compacto(t);
    return qc.length > 0 && idx.c.indexOf(qc) !== -1;
  }

  /* ─────────────────────────── control de cambios ─────────────────────────── */

  /**
   * Une el historial de cambios y las reparaciones en una sola lista, del más nuevo al más antiguo.
   * tipo: estado | area | observaciones | criticidad | reparacion
   */
  function unirCambios(historial, reparaciones) {
    var a = (historial || []).map(function (x) {
      return { clave: 'h' + x.id, fecha: x.fecha, usuario: x.usuario, tipo: x.campo, motorId: x.motor_id,
               antes: x.anterior, despues: x.nuevo, motivo: x.comentario || '' };
    });
    var b = (reparaciones || []).map(function (x) {
      return { clave: 'r' + x.id, fecha: x.registrado_en || x.fecha, usuario: x.registrado_por, tipo: 'reparacion', motorId: x.motor_id,
               subtipo: x.tipo, taller: x.taller, descripcion: x.descripcion, resultado: x.resultado, fechaTrabajo: x.fecha, motivo: '' };
    });
    return a.concat(b).sort(function (p, q) {
      var d = new Date(q.fecha) - new Date(p.fecha);
      return d || (p.clave < q.clave ? 1 : -1);
    });
  }

  var API = { numerosRepetidos: numerosRepetidos, calidad: calidad, polos: polos, cobertura: cobertura, criticosPorArea: criticosPorArea,
               indiceBusqueda: indiceBusqueda, coincideBusqueda: coincideBusqueda, compacto: compacto, unirCambios: unirCambios };
  global.ANALISIS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
