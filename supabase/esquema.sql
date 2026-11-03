-- ============================================================
-- MotorView CMP · tablas, roles, historial y políticas RLS
-- Ejecutar en Supabase: SQL Editor → New query → pegar todo → Run.
-- Se puede volver a ejecutar sin perder datos.
--
-- Todo va con prefijo `motorview_` para convivir con otros proyectos
-- (p. ej. demurrage_*) dentro del mismo proyecto de Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- PERFILES: quién puede entrar a MotorView y con qué rol
--
-- Tener una cuenta en Supabase Auth NO da acceso a los motores: hace
-- falta además una fila activa aquí. Así, si el proyecto se comparte con
-- otra aplicación, sus usuarios no ven este inventario por defecto.
-- ------------------------------------------------------------
create table if not exists public.motorview_perfiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  rol        text not null check (rol in ('admin','mantenimiento','consulta')),
  activo     boolean not null default true,
  creado_en  timestamptz not null default now()
);

-- Rol del usuario que hace la consulta (null si no tiene perfil activo).
-- security definer para poder leerse a sí misma sin recursión de RLS.
create or replace function public.motorview_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.motorview_perfiles where user_id = auth.uid() and activo
$$;
revoke all on function public.motorview_rol() from public, anon;
grant execute on function public.motorview_rol() to authenticated;

-- ------------------------------------------------------------
-- MOTORES
-- `id` es interno y único; `numero` es el N° del listado Excel, que en
-- algunos motores se repite.
-- ------------------------------------------------------------
create table if not exists public.motorview_motores (
  id              bigint primary key,
  numero          integer,
  faena           text not null,
  area            text not null check (char_length(area) between 1 and 60),
  estado          text not null check (estado in ('En servicio','Taller','Repuesto','Reservado','En transporte','De baja')),
  tag             text,
  descripcion     text,
  observaciones   text check (char_length(observaciones) <= 500),
  hp              numeric,
  kw              numeric,
  amp             numeric,
  volt            numeric,
  volt_txt        text,
  rpm             numeric,
  montaje         text,
  frame           text,
  rod_libre       text,
  rod_carga       text,
  cos_fi          numeric,
  hoja_vida       text,
  motivo          text check (char_length(motivo) <= 300),  -- lo escribe el cliente; el disparador lo pasa al historial y lo borra
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);
create index if not exists motorview_motores_estado_idx on public.motorview_motores (estado);
create index if not exists motorview_motores_area_idx   on public.motorview_motores (area);

-- ------------------------------------------------------------
-- HISTORIAL: una fila por campo cambiado. Solo lo escribe el disparador.
-- ------------------------------------------------------------
create table if not exists public.motorview_historial (
  id          bigint generated always as identity primary key,
  motor_id    bigint not null references public.motorview_motores(id) on delete cascade,
  fecha       timestamptz not null default now(),
  usuario     text not null,
  campo       text not null,
  anterior    text,
  nuevo       text,
  comentario  text
);
create index if not exists motorview_historial_motor_idx on public.motorview_historial (motor_id, id desc);

-- Registra quién, cuándo y qué cambió. La fecha y el usuario las pone el
-- servidor (no el navegador): el historial no puede falsearse desde el cliente.
create or replace function public.motorview_motores_cambios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  quien   text := coalesce(auth.jwt() ->> 'email', current_user);
  cambio  boolean := false;
begin
  if new.estado is distinct from old.estado then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'estado', old.estado, new.estado, new.motivo);
    cambio := true;
  end if;
  if new.area is distinct from old.area then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'area', old.area, new.area, new.motivo);
    cambio := true;
  end if;
  if new.observaciones is distinct from old.observaciones then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'observaciones', old.observaciones, new.observaciones, new.motivo);
    cambio := true;
  end if;

  if not cambio then
    return old;                      -- nada cambió: no se toca ni se registra
  end if;
  new.actualizado_en  := now();
  new.actualizado_por := quien;
  new.motivo          := null;
  return new;
end $$;

drop trigger if exists motorview_motores_cambios on public.motorview_motores;
create trigger motorview_motores_cambios
  before update on public.motorview_motores
  for each row execute function public.motorview_motores_cambios();

-- ------------------------------------------------------------
-- PERMISOS Y RLS
--
-- Supabase da permisos amplios por defecto a `anon` y `authenticated`;
-- se retiran y se devuelve solo lo necesario:
--   · lectura: cualquier usuario con perfil activo (admin, mantenimiento, consulta)
--   · edición: admin y mantenimiento, y solo estado, área, observaciones y motivo
--   · sin insert ni delete desde la aplicación (la carga inicial se hace desde el SQL Editor)
--   · `anon` (sin login) no accede a nada
-- ------------------------------------------------------------
alter table public.motorview_perfiles  enable row level security;
alter table public.motorview_motores   enable row level security;
alter table public.motorview_historial enable row level security;

revoke all on public.motorview_perfiles, public.motorview_motores, public.motorview_historial from anon, authenticated;
grant select on public.motorview_perfiles, public.motorview_motores, public.motorview_historial to authenticated;
grant update (estado, area, observaciones, motivo) on public.motorview_motores to authenticated;

drop policy if exists motorview_perfiles_ver on public.motorview_perfiles;
create policy motorview_perfiles_ver on public.motorview_perfiles
  for select to authenticated
  using (user_id = auth.uid() or public.motorview_rol() = 'admin');

drop policy if exists motorview_motores_ver on public.motorview_motores;
create policy motorview_motores_ver on public.motorview_motores
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_motores_editar on public.motorview_motores;
create policy motorview_motores_editar on public.motorview_motores
  for update to authenticated
  using (public.motorview_rol() in ('admin','mantenimiento'))
  with check (public.motorview_rol() in ('admin','mantenimiento'));

drop policy if exists motorview_historial_ver on public.motorview_historial;
create policy motorview_historial_ver on public.motorview_historial
  for select to authenticated
  using (public.motorview_rol() is not null);

-- ============================================================
-- CÓMO DAR ACCESO A UNA PERSONA
--
-- 1. Authentication → Users → Add user → correo y contraseña
--    (marca "Auto Confirm User"). No hay registro desde la aplicación.
-- 2. Dale perfil y rol (cambia el correo, el nombre y el rol):
--
--    insert into public.motorview_perfiles (user_id, nombre, rol)
--    select id, 'Nombre Apellido', 'mantenimiento'
--    from auth.users where email = 'persona@cmp.cl';
--
--    Roles: admin · mantenimiento · consulta
--    Cambiar rol:  update public.motorview_perfiles set rol = 'consulta' where user_id = (select id from auth.users where email = '...');
--    Quitar acceso: update public.motorview_perfiles set activo = false where user_id = (select id from auth.users where email = '...');
--
-- COMPROBACIÓN (debe devolver 0 filas: nada es accesible sin login)
--
--    set role anon;  select count(*) from public.motorview_motores;  -- error "permission denied" = correcto
--    reset role;
-- ============================================================
