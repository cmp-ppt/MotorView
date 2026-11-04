// Arranque: valida la configuración, pide login si hace falta y carga los datos desde Supabase.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const ROLES = { admin: 'Administrador', mantenimiento: 'Mantenimiento', consulta: 'Solo lectura' };
  const cfg = window.CONFIG_NUBE || {};
  // Versión de los archivos (viene en la dirección de este script): app.js se carga con la misma,
  // para no mezclar una copia vieja guardada en el navegador con archivos nuevos.
  const VERSION = (document.currentScript && document.currentScript.src.split('?')[1]) || '';

  async function entrar(s) {
    const p = await window.NUBE.perfil(s.id);
    if (!p) { await window.SESION.salir(); throw new Error('Tu cuenta existe pero no tiene acceso a MotorView. Pide al administrador que te asigne un perfil.'); }
    const user = { email: s.email, nombre: p.nombre, rol: p.rol };
    window.MV = { user, guardar: window.NUBE.guardar, historial: window.NUBE.historial, reparaciones: window.NUBE.reparaciones,
                  registrarReparacion: window.NUBE.registrarReparacion, tiposReparacion: window.NUBE.TIPOS_REPARACION };
    window.MOTORES = await window.NUBE.motores();
    $('#login').hidden = true;
    $('#whoAv').textContent = user.nombre.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    $('#whoName').textContent = user.nombre;
    $('#whoRole').textContent = ROLES[user.rol] || user.rol;
    $('#logout').onclick = () => window.SESION.salir().finally(() => location.reload());
    const s2 = document.createElement('script'); s2.src = 'js/app.js' + (VERSION ? '?' + VERSION : ''); document.body.appendChild(s2);
  }

  function login(mensaje) {
    $('#login').hidden = false;
    $('#lerr').textContent = mensaje || '';
    $('#lu').focus();
    $('#lform').onsubmit = async e => {
      e.preventDefault();
      const btn = $('#lbtn'); btn.disabled = true; $('#lerr').textContent = '';
      try { await entrar(await window.SESION.ingresar($('#lu').value, $('#lp').value)); }
      catch (err) { $('#lerr').textContent = err.message; $('#lp').value = ''; btn.disabled = false; $('#lp').focus(); }
    };
  }

  function sinConfigurar(texto) {
    $('#login').hidden = false;
    $('#lerr').textContent = texto;
    $('#lform').querySelectorAll('input,button').forEach(e => e.disabled = true);
  }

  async function iniciar() {
    if (!window.SESION.normalizarUrl(cfg.url)) return sinConfigurar('Falta configurar la dirección de Supabase en js/config.js (debe ser https://TU-PROYECTO.supabase.co).');
    const problema = window.SESION.problemaDeClave(cfg.anonKey);
    if (problema) return sinConfigurar(problema);
    const s = window.SESION.actual();
    if (!s || !(await window.SESION.token())) return login();
    try { await entrar(window.SESION.actual()); } catch (err) { login(err.message); }
  }
  iniciar();
})();
