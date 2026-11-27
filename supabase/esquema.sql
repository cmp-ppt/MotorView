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

-- Criticidad del motor para la operación: A (crítico), B (importante) o C (normal).
-- Se asigna desde la ficha; mientras no se asigne queda vacía.
alter table public.motorview_motores add column if not exists criticidad text;
alter table public.motorview_motores drop constraint if exists motorview_motores_criticidad_check;
alter table public.motorview_motores add constraint motorview_motores_criticidad_check check (criticidad in ('A','B','C'));

-- Los motores que se ingresan desde la aplicación reciben su id de una secuencia
-- (la carga inicial usa ids explícitos: 1, 2, 3…). Cada vez que se ejecuta este archivo
-- la secuencia se ubica justo después del mayor id existente.
create sequence if not exists public.motorview_motores_id_seq;
select setval('public.motorview_motores_id_seq', coalesce((select max(id) from public.motorview_motores), 0) + 1, false);
alter table public.motorview_motores alter column id set default nextval('public.motorview_motores_id_seq');

-- Reglas de validez para lo que se ingresa o edita (no revisan de nuevo lo ya cargado).
alter table public.motorview_motores drop constraint if exists motorview_motores_valores_check;
alter table public.motorview_motores add constraint motorview_motores_valores_check check (
      (numero is null or numero > 0) and (hp is null or hp > 0) and (kw is null or kw > 0)
  and (amp is null or amp > 0) and (volt is null or volt > 0) and (rpm is null or rpm > 0)
  and (cos_fi is null or cos_fi between 0.5 and 1)
  and char_length(coalesce(tag, '')) <= 100 and char_length(coalesce(descripcion, '')) <= 300
  and char_length(coalesce(frame, '')) <= 50 and char_length(coalesce(rod_libre, '')) <= 100 and char_length(coalesce(rod_carga, '')) <= 100
) not valid;

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
  if new.faena is distinct from old.faena then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'faena', old.faena, new.faena, new.motivo);
    cambio := true;
  end if;
  if new.observaciones is distinct from old.observaciones then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'observaciones', old.observaciones, new.observaciones, new.motivo);
    cambio := true;
  end if;
  if new.criticidad is distinct from old.criticidad then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo, comentario)
    values (old.id, quien, 'criticidad', old.criticidad, new.criticidad, new.motivo);
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

-- ALTA DE UN MOTOR desde la aplicación: el servidor pone quién y cuándo, y deja el registro en el
-- historial (control de cambios). La carga inicial hecha desde el SQL Editor no genera estos registros.
create or replace function public.motorview_motores_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare quien text := auth.jwt() ->> 'email';
begin
  if quien is not null then
    new.actualizado_en  := now();
    new.actualizado_por := quien;
    new.motivo          := null;
  end if;
  return new;
end $$;

drop trigger if exists motorview_motores_alta on public.motorview_motores;
create trigger motorview_motores_alta
  before insert on public.motorview_motores
  for each row execute function public.motorview_motores_alta();

create or replace function public.motorview_motores_alta_historial()
returns trigger language plpgsql security definer set search_path = public as $$
declare quien text := auth.jwt() ->> 'email';
begin
  if quien is not null then
    insert into public.motorview_historial (motor_id, usuario, campo, anterior, nuevo)
    values (new.id, quien, 'alta', null, concat_ws(' · ', 'N° ' || coalesce(new.numero::text, 's/n'), new.faena, new.area));
  end if;
  return null;
end $$;

drop trigger if exists motorview_motores_alta_historial on public.motorview_motores;
create trigger motorview_motores_alta_historial
  after insert on public.motorview_motores
  for each row execute function public.motorview_motores_alta_historial();

-- ------------------------------------------------------------
-- REPARACIONES Y REBOBINADOS: una fila por intervención en un motor.
--
-- Solo se agregan; no se editan ni se borran desde la aplicación: una
-- corrección se registra como una intervención nueva. Quién la registró
-- y cuándo lo pone el servidor, no el navegador.
-- ------------------------------------------------------------
create table if not exists public.motorview_reparaciones (
  id              bigint generated always as identity primary key,
  motor_id        bigint not null references public.motorview_motores(id) on delete cascade,
  fecha           date not null default current_date,
  tipo            text not null check (tipo in ('Rebobinado','Cambio de rodamientos','Reparación mecánica','Mantención','Prueba eléctrica','Otro')),
  taller          text check (char_length(taller) <= 100),
  descripcion     text check (char_length(descripcion) <= 500),
  resultado       text check (char_length(resultado) <= 300),     -- pruebas posteriores, garantía, etc.
  registrado_por  text,
  registrado_en   timestamptz not null default now()
);
create index if not exists motorview_reparaciones_motor_idx on public.motorview_reparaciones (motor_id, fecha desc, id desc);

create or replace function public.motorview_reparaciones_sello()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.registrado_por := coalesce(auth.jwt() ->> 'email', current_user);
  new.registrado_en  := now();
  return new;
end $$;

drop trigger if exists motorview_reparaciones_sello on public.motorview_reparaciones;
create trigger motorview_reparaciones_sello
  before insert on public.motorview_reparaciones
  for each row execute function public.motorview_reparaciones_sello();

-- ------------------------------------------------------------
-- RESPONSABLES POR FAENA Y SOLICITUDES DE MOTORES ENTRE FAENAS
--
-- Cada faena tiene uno o más responsables. Un administrador o personal de mantenimiento
-- puede solicitar la reserva de un motor (en taller o de repuesto) que está en OTRA faena;
-- el responsable de la faena que lo tiene debe aprobar o rechazar la solicitud en la aplicación.
--   Pendiente → Aprobada (el motor queda "Reservado") → Entregada (el motor pasa a la faena que lo pidió)
--   Pendiente → Rechazada · Pendiente o Aprobada → Cancelada (el motor vuelve a su estado)
-- Si una faena aún no tiene responsables, la resuelve un administrador distinto de quien la pidió.
-- Todo cambio pasa por la función motorview_gestionar_solicitud: nadie edita solicitudes a mano.
-- ------------------------------------------------------------
create table if not exists public.motorview_responsables (
  faena    text not null check (char_length(faena) between 1 and 60),
  user_id  uuid not null references auth.users(id) on delete cascade,
  primary key (faena, user_id)
);

-- Responsables con su nombre (la tabla de perfiles solo es visible para su dueño y el admin).
create or replace function public.motorview_responsables_lista()
returns table (faena text, user_id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select r.faena, r.user_id, p.nombre
  from public.motorview_responsables r
  join public.motorview_perfiles p on p.user_id = r.user_id and p.activo
  where public.motorview_rol() is not null
  order by r.faena, p.nombre
$$;
revoke all on function public.motorview_responsables_lista() from public, anon;
grant execute on function public.motorview_responsables_lista() to authenticated;

create table if not exists public.motorview_solicitudes (
  id              bigint generated always as identity primary key,
  motor_id        bigint not null references public.motorview_motores(id) on delete cascade,
  faena_origen    text not null,                       -- faena que tiene el motor (la pone el servidor)
  faena_destino   text not null check (char_length(faena_destino) between 1 and 60),
  motivo          text not null check (char_length(btrim(motivo)) between 3 and 300),
  estado          text not null default 'Pendiente' check (estado in ('Pendiente','Aprobada','Rechazada','Entregada','Cancelada')),
  estado_motor    text,                                -- estado del motor al pedirlo; a él vuelve si se cancela
  solicitada_por  text not null,
  solicitada_en   timestamptz not null default now(),
  resuelta_por    text,
  resuelta_en     timestamptz,
  comentario      text check (char_length(comentario) <= 300),
  entregada_por   text,
  entregada_en    timestamptz
);
create index if not exists motorview_solicitudes_motor_idx on public.motorview_solicitudes (motor_id);
create index if not exists motorview_solicitudes_estado_idx on public.motorview_solicitudes (estado, solicitada_en desc);
-- un motor no puede tener dos solicitudes vivas a la vez
create unique index if not exists motorview_solicitudes_viva_idx on public.motorview_solicitudes (motor_id) where estado in ('Pendiente','Aprobada');

-- Al crearla, el servidor pone quién, cuándo, la faena de origen y el estado; y valida el pedido.
create or replace function public.motorview_solicitudes_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select faena, estado into m from public.motorview_motores where id = new.motor_id;
  if not found then raise exception 'El motor no existe.'; end if;
  if m.faena = new.faena_destino then raise exception 'El motor ya está en %.', new.faena_destino; end if;
  if m.estado not in ('Taller','Repuesto') then raise exception 'Solo se pueden solicitar motores en taller o de repuesto.'; end if;
  new.faena_origen   := m.faena;
  new.estado_motor   := m.estado;
  new.estado         := 'Pendiente';
  new.solicitada_por := coalesce(auth.jwt() ->> 'email', current_user);
  new.solicitada_en  := now();
  new.resuelta_por := null; new.resuelta_en := null; new.comentario := null; new.entregada_por := null; new.entregada_en := null;
  return new;
end $$;

drop trigger if exists motorview_solicitudes_alta on public.motorview_solicitudes;
create trigger motorview_solicitudes_alta
  before insert on public.motorview_solicitudes
  for each row execute function public.motorview_solicitudes_alta();

-- Aprobar, rechazar, entregar o cancelar una solicitud. Comprueba quién puede hacerlo.
create or replace function public.motorview_gestionar_solicitud(p_id bigint, p_accion text, p_comentario text default null)
returns public.motorview_solicitudes
language plpgsql security definer set search_path = public as $$
declare
  s        public.motorview_solicitudes;
  m        record;
  quien    text := auth.jwt() ->> 'email';
  rol      text := public.motorview_rol();
  com      text := nullif(btrim(p_comentario), '');
  hay_resp boolean;
  soy_resp boolean;
  puede    boolean;
  mia      boolean;
begin
  if quien is null or rol is null then raise exception 'Tu cuenta no tiene acceso a MotorView.'; end if;
  if p_accion not in ('aprobar','rechazar','entregar','cancelar') then raise exception 'Acción no válida.'; end if;
  if com is not null and char_length(com) > 300 then raise exception 'El comentario puede tener hasta 300 caracteres.'; end if;

  select * into s from public.motorview_solicitudes where id = p_id for update;
  if not found then raise exception 'La solicitud no existe.'; end if;

  select exists (select 1 from public.motorview_responsables where faena = s.faena_origen) into hay_resp;
  select exists (select 1 from public.motorview_responsables where faena = s.faena_origen and user_id = auth.uid()) into soy_resp;
  puede := soy_resp or (not hay_resp and rol = 'admin');      -- sin responsables, resuelve un administrador
  mia   := lower(s.solicitada_por) = lower(quien);

  if p_accion in ('aprobar','rechazar') then
    if s.estado <> 'Pendiente' then raise exception 'La solicitud ya fue resuelta.'; end if;
    if not puede then raise exception 'Solo el responsable de % (o un administrador, si la faena no tiene responsables) puede resolver esta solicitud.', s.faena_origen; end if;
    if mia then raise exception 'No puedes resolver una solicitud hecha por ti.'; end if;

    if p_accion = 'rechazar' then
      update public.motorview_solicitudes set estado = 'Rechazada', resuelta_por = quien, resuelta_en = now(), comentario = com
       where id = s.id returning * into s;
      return s;
    end if;

    select faena, estado into m from public.motorview_motores where id = s.motor_id for update;
    if m.faena <> s.faena_origen or m.estado not in ('Taller','Repuesto') then
      raise exception 'El motor cambió de faena o de estado y ya no se puede reservar. Rechaza la solicitud.';
    end if;
    update public.motorview_motores
       set estado = 'Reservado', motivo = left('Reservado para ' || s.faena_destino || ' (solicitud N° ' || s.id || ')', 300)
     where id = s.motor_id;
    update public.motorview_solicitudes set estado = 'Aprobada', estado_motor = m.estado, resuelta_por = quien, resuelta_en = now(), comentario = com
     where id = s.id returning * into s;
    return s;

  elsif p_accion = 'entregar' then
    if s.estado <> 'Aprobada' then raise exception 'Solo se puede entregar una solicitud aprobada.'; end if;
    if not puede then raise exception 'Solo el responsable de % (o un administrador, si la faena no tiene responsables) puede registrar la entrega.', s.faena_origen; end if;
    select faena, estado into m from public.motorview_motores where id = s.motor_id for update;
    if m.faena <> s.faena_origen or m.estado <> 'Reservado' then
      raise exception 'El motor ya no está reservado en %.', s.faena_origen;
    end if;
    update public.motorview_motores
       set faena = s.faena_destino, estado = 'Repuesto', area = 'Por asignar',
           motivo = left('Entregado a ' || s.faena_destino || ' (solicitud N° ' || s.id || ')', 300)
     where id = s.motor_id;
    update public.motorview_solicitudes set estado = 'Entregada', entregada_por = quien, entregada_en = now(), comentario = coalesce(com, comentario)
     where id = s.id returning * into s;
    return s;

  else  -- cancelar
    if s.estado not in ('Pendiente','Aprobada') then raise exception 'Solo se puede cancelar una solicitud pendiente o aprobada.'; end if;
    if not (mia or puede) then raise exception 'Solo quien la pidió o el responsable de % puede cancelarla.', s.faena_origen; end if;
    if s.estado = 'Aprobada' then
      update public.motorview_motores
         set estado = coalesce(s.estado_motor, 'Repuesto'), motivo = left('Reserva cancelada (solicitud N° ' || s.id || ')', 300)
       where id = s.motor_id and estado = 'Reservado';
    end if;
    update public.motorview_solicitudes set estado = 'Cancelada', resuelta_por = quien, resuelta_en = now(), comentario = coalesce(com, comentario)
     where id = s.id returning * into s;
    return s;
  end if;
end $$;
revoke all on function public.motorview_gestionar_solicitud(bigint, text, text) from public, anon;
grant execute on function public.motorview_gestionar_solicitud(bigint, text, text) to authenticated;

-- ------------------------------------------------------------
-- PERMISOS Y RLS
--
-- Supabase da permisos amplios por defecto a `anon` y `authenticated`;
-- se retiran y se devuelve solo lo necesario:
--   · lectura: cualquier usuario con perfil activo (admin, mantenimiento, consulta)
--   · edición: admin y mantenimiento, y solo estado, área, observaciones, criticidad y motivo
--   · reparaciones: admin y mantenimiento pueden agregar; nadie edita ni borra desde la aplicación
--   · ingreso de motores nuevos: admin y mantenimiento (por columna; sin tocar hoja de vida ni sellos del servidor)
--   · sin delete de motores desde la aplicación; la carga masiva inicial se hace desde el SQL Editor
--   · `anon` (sin login) no accede a nada
-- ------------------------------------------------------------
alter table public.motorview_perfiles  enable row level security;
alter table public.motorview_motores   enable row level security;
alter table public.motorview_historial enable row level security;
alter table public.motorview_reparaciones enable row level security;
alter table public.motorview_responsables enable row level security;
alter table public.motorview_solicitudes enable row level security;

revoke all on public.motorview_perfiles, public.motorview_motores, public.motorview_historial, public.motorview_reparaciones,
              public.motorview_responsables, public.motorview_solicitudes from anon, authenticated;
grant select on public.motorview_perfiles, public.motorview_motores, public.motorview_historial, public.motorview_reparaciones,
                public.motorview_responsables, public.motorview_solicitudes to authenticated;
grant insert (motor_id, faena_destino, motivo) on public.motorview_solicitudes to authenticated;
grant update (estado, area, observaciones, criticidad, motivo) on public.motorview_motores to authenticated;
grant insert (motor_id, fecha, tipo, taller, descripcion, resultado) on public.motorview_reparaciones to authenticated;
revoke all on sequence public.motorview_motores_id_seq from anon, authenticated;
grant usage on sequence public.motorview_motores_id_seq to authenticated;
grant insert (numero, faena, area, estado, tag, descripcion, observaciones, hp, kw, amp, volt, volt_txt, rpm, montaje, frame,
              rod_libre, rod_carga, cos_fi, criticidad) on public.motorview_motores to authenticated;

drop policy if exists motorview_perfiles_ver on public.motorview_perfiles;
create policy motorview_perfiles_ver on public.motorview_perfiles
  for select to authenticated
  using (user_id = auth.uid() or public.motorview_rol() = 'admin');

drop policy if exists motorview_motores_ver on public.motorview_motores;
create policy motorview_motores_ver on public.motorview_motores
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_motores_agregar on public.motorview_motores;
create policy motorview_motores_agregar on public.motorview_motores
  for insert to authenticated
  with check (public.motorview_rol() in ('admin','mantenimiento'));

drop policy if exists motorview_motores_editar on public.motorview_motores;
create policy motorview_motores_editar on public.motorview_motores
  for update to authenticated
  using (public.motorview_rol() in ('admin','mantenimiento'))
  with check (public.motorview_rol() in ('admin','mantenimiento'));

drop policy if exists motorview_historial_ver on public.motorview_historial;
create policy motorview_historial_ver on public.motorview_historial
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_reparaciones_ver on public.motorview_reparaciones;
create policy motorview_reparaciones_ver on public.motorview_reparaciones
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_reparaciones_agregar on public.motorview_reparaciones;
create policy motorview_reparaciones_agregar on public.motorview_reparaciones
  for insert to authenticated
  with check (public.motorview_rol() in ('admin','mantenimiento'));

drop policy if exists motorview_responsables_ver on public.motorview_responsables;
create policy motorview_responsables_ver on public.motorview_responsables
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_solicitudes_ver on public.motorview_solicitudes;
create policy motorview_solicitudes_ver on public.motorview_solicitudes
  for select to authenticated
  using (public.motorview_rol() is not null);

drop policy if exists motorview_solicitudes_agregar on public.motorview_solicitudes;
create policy motorview_solicitudes_agregar on public.motorview_solicitudes
  for insert to authenticated
  with check (public.motorview_rol() in ('admin','mantenimiento'));

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
--
-- RESPONSABLE DE UNA FAENA (aprueba las solicitudes de motores que están en su faena; puede haber varios):
--
--    insert into public.motorview_responsables (faena, user_id)
--    select 'Planta Magnetita', id from auth.users where email = 'persona@cmp.cl'
--    on conflict do nothing;
--
--    Quitar:  delete from public.motorview_responsables where faena = 'Planta Magnetita'
--             and user_id = (select id from auth.users where email = 'persona@cmp.cl');
--    Cambiar rol:  update public.motorview_perfiles set rol = 'consulta' where user_id = (select id from auth.users where email = '...');
--    Quitar acceso: update public.motorview_perfiles set activo = false where user_id = (select id from auth.users where email = '...');
--
-- COMPROBACIÓN (debe devolver 0 filas: nada es accesible sin login)
--
--    set role anon;  select count(*) from public.motorview_motores;  -- error "permission denied" = correcto
--    reset role;
-- ============================================================
