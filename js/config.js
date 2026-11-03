/**
 * Conexión con Supabase. Viaja con el sitio, así que vale para todos los
 * que abran el enlace.
 *
 * Pega aquí dos datos de Supabase → Project Settings → API:
 *   url      la "Project URL"
 *   anonKey  la clave "anon" / "publishable"
 *
 * La clave publicable es pública por diseño: quien abra el sitio la ve. Lo que
 * protege los datos son las políticas RLS de supabase/esquema.sql, que exigen
 * un usuario con perfil activo, más la sesión de cada persona.
 *
 * Acá NUNCA va la clave secreta (sb_secret_… / service_role): daría acceso de
 * administrador a toda la base. La app se niega a usarla.
 */
window.CONFIG_NUBE = {
  url: "https://ywocrktcwnwqzhsgnzex.supabase.co",
  anonKey: "sb_publishable_tX3yfeF0ibrqGaTCntA3-Q_Ow8Iv9uY"
};
