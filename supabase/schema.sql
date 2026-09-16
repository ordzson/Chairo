-- ¿Versículo o inventículo? — salas multijugador
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo una vez.
-- Requiere que "Allow anonymous sign-ins" esté activado en Authentication:
-- cada teléfono recibe un usuario anónimo, sin correo ni cuenta, y ese
-- `auth.uid()` es lo único que decide qué puede tocar cada quien.
--
-- Cubre las etapas 1 a 3 (configuración, sala de espera y entrada del
-- invitado). Las preguntas, respuestas y puntuaciones llegan en etapas
-- posteriores y tendrán sus propias tablas.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tablas ---

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Cuatro caracteres sin parejas ambiguas: sin 0/O ni 1/I.
  code text not null check (code ~ '^[2-9A-HJ-NP-Z]{4}$'),
  host_id uuid not null default auth.uid(),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard', 'extreme')),
  question_count integer not null check (question_count in (5, 10, 15, 20, 25, 30)),
  host_role text not null check (host_role in ('player', 'host-only')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

-- Un código solo es único mientras la sala sigue abierta; después se recicla.
create unique index if not exists rooms_open_code_key
  on public.rooms (code)
  where closed_at is null and status <> 'finished';

create index if not exists rooms_created_at_idx on public.rooms (created_at);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 24),
  color text not null check (color in ('yellow', 'orange', 'turquoise', 'blue', 'green', 'violet')),
  role text not null check (role in ('host', 'guest')),
  status text not null default 'ready' check (status in ('joining', 'ready')),
  plays boolean not null default true,
  joined_at timestamptz not null default now()
);

-- Un asiento por dispositivo, y ni el nombre ni el color se repiten en la sala.
create unique index if not exists participants_room_user_key
  on public.participants (room_id, user_id);
create unique index if not exists participants_room_name_key
  on public.participants (room_id, lower(btrim(name)));
create unique index if not exists participants_room_color_key
  on public.participants (room_id, color);

-- --------------------------------------------------------------- límites ---

-- Sala llena y partida ya empezada no son condiciones que el cliente pueda
-- comprobar sin carreras: las decide la base y devuelve un mensaje que la
-- aplicación traduce a su propio error de dominio.
create or replace function public.guard_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  room record;
  taken integer;
begin
  select status, closed_at into room from public.rooms where id = new.room_id;

  if not found or room.closed_at is not null then
    raise exception 'room-not-found';
  end if;

  if room.status <> 'waiting' and new.role = 'guest' then
    raise exception 'room-started';
  end if;

  -- Seis: uno por color identificador, que es único dentro de la sala.
  select count(*) into taken from public.participants where room_id = new.room_id;
  if taken >= 6 then
    raise exception 'room-full';
  end if;

  return new;
end;
$$;

drop trigger if exists participants_guard on public.participants;
create trigger participants_guard
  before insert on public.participants
  for each row execute function public.guard_participant_insert();

-- El reloj de la partida se calcula desde el servidor, nunca desde el teléfono.
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now() $$;

-- ------------------------------------------------------------------- RLS ---

alter table public.rooms enable row level security;
alter table public.participants enable row level security;

-- Este archivo es la única fuente de las políticas de estas dos tablas, así
-- que cualquier otra se retira antes de crear las suyas. `drop policy if
-- exists` solo alcanza a las que ya se llaman igual, y una política de UPDATE
-- dejada por una versión anterior con otro nombre siguió bloqueando el cierre
-- de sala mucho después de haber corregido el archivo. Volver a aplicarlo
-- ahora deja la base como el repositorio, tenga lo que tenga.
do $$
declare
  stray record;
begin
  for stray in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('rooms', 'participants')
      and policyname not in (
        'rooms_select_open',
        'rooms_insert_own',
        'rooms_update_host',
        'rooms_delete_host',
        'participants_select_open_room',
        'participants_insert_self',
        'participants_update_self',
        'participants_delete_self_or_host'
      )
  loop
    execute format('drop policy %I on public.%I', stray.policyname, stray.tablename);
  end loop;
end
$$;

-- Una sala abierta la ve cualquiera que tenga su código; una cerrada, solo
-- quien la abrió. Lo segundo no es comodidad, es lo que permite cerrarla:
-- PostgREST cuenta las filas afectadas con `RETURNING`, y Postgres exige que
-- la fila nueva siga pasando la política de SELECT. Con `closed_at is null` a
-- secas, escribir `closed_at` hacía la fila invisible en ese mismo instante y
-- el propio cierre se rechazaba con `42501 new row violates row-level
-- security policy`. El invitado sigue sin ver ninguna sala cerrada.
drop policy if exists "rooms_select_open" on public.rooms;
create policy "rooms_select_open" on public.rooms
  for select to authenticated
  using (closed_at is null or host_id = auth.uid());

drop policy if exists "rooms_insert_own" on public.rooms;
create policy "rooms_insert_own" on public.rooms
  for insert to authenticated
  with check (host_id = auth.uid());

drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host" on public.rooms
  for update to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "rooms_delete_host" on public.rooms;
create policy "rooms_delete_host" on public.rooms
  for delete to authenticated
  using (host_id = auth.uid());

drop policy if exists "participants_select_open_room" on public.participants;
create policy "participants_select_open_room" on public.participants
  for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.closed_at is null));

drop policy if exists "participants_insert_self" on public.participants;
create policy "participants_insert_self" on public.participants
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "participants_update_self" on public.participants;
create policy "participants_update_self" on public.participants
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "participants_delete_self_or_host" on public.participants;
create policy "participants_delete_self_or_host" on public.participants
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid())
  );

-- -------------------------------------------------------------- realtime ---

-- `replica identity full` hace que el evento de borrado traiga la fila
-- completa, así el resto de la sala sabe quién salió.
alter table public.rooms replica identity full;
alter table public.participants replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.participants;
  exception when duplicate_object then null;
  end;
end
$$;

-- ------------------------------------------------------------- limpieza ----

-- Una sala olvidada no debe retener su código para siempre. Ejecútalo con
-- pg_cron si quieres, o déjalo a mano: no es necesario para jugar.
create or replace function public.close_stale_rooms(older_than interval default '12 hours')
returns integer
language sql
security definer
set search_path = public
as $$
  with closed as (
    update public.rooms
    set closed_at = now()
    where closed_at is null and created_at < now() - older_than
    returning 1
  )
  select count(*)::integer from closed;
$$;

-- `security definer` salta RLS por diseño, así que esta función no puede
-- quedar al alcance de cualquier teléfono: medido contra el proyecto real, una
-- sesión anónima cualquiera podía llamarla, y con '0 seconds' habría cerrado
-- todas las salas abiertas. Limpiar es tarea del propietario o de pg_cron, no
-- de un jugador. La aplicación no la llama.
revoke all on function public.close_stale_rooms(interval) from public, anon, authenticated;
