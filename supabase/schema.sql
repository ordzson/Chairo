-- ¿Versículo o inventículo? — salas multijugador
--
-- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo una vez.
-- Requiere que "Allow anonymous sign-ins" esté activado en Authentication:
-- cada teléfono recibe un usuario anónimo, sin correo ni cuenta, y ese
-- `auth.uid()` es lo único que decide qué puede tocar cada quien.
--
-- Cubre la sala y la partida completa. Las frases se seleccionan del banco
-- revisado que viaja con el frontend, pero la partida, los relojes, las
-- respuestas y los puntos quedan bajo autoridad de estas funciones.

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
  -- Tiempos elegidos por el anfitrión, en segundos. Las listas repiten
  -- QUESTION_SECONDS y REVEAL_SECONDS de `setup-config.ts`.
  question_seconds integer not null default 12
    check (question_seconds in (5, 8, 10, 12, 15, 20, 30, 45, 60)),
  reveal_seconds integer not null default 5
    check (reveal_seconds in (3, 5, 8, 10, 15, 20, 30, 45, 60)),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  closed_at timestamptz
);

-- Un código solo es único mientras la sala sigue abierta; incluso una partida
-- terminada conserva el código hasta que el anfitrión cierre su sala. Recrear
-- el índice también corrige instalaciones de la versión anterior, que
-- excluían por error las salas con estado `finished`.
drop index if exists public.rooms_open_code_key;
create unique index rooms_open_code_key
  on public.rooms (code)
  where closed_at is null;

create index if not exists rooms_created_at_idx on public.rooms (created_at);

-- Instalaciones anteriores a los tiempos configurables: `create table if not
-- exists` no toca una tabla que ya existe, así que las columnas se agregan
-- aquí. Las salas abiertas reciben los tiempos de siempre.
alter table public.rooms
  add column if not exists question_seconds integer not null default 12
    check (question_seconds in (5, 8, 10, 12, 15, 20, 30, 45, 60)),
  add column if not exists reveal_seconds integer not null default 5
    check (reveal_seconds in (3, 5, 8, 10, 15, 20, 30, 45, 60));

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

create table if not exists public.versiculo_matches (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  -- Copia inmutable de las preguntas seleccionadas para esta partida. La tabla
  -- no se expone al cliente: get_versiculo_match oculta la solución hasta la
  -- fase de revelación.
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) > 0),
  current_round integer not null default 0 check (current_round >= 0),
  phase text not null default 'countdown' check (phase in ('countdown', 'question', 'reveal', 'finished')),
  phase_started_at timestamptz not null default clock_timestamp(),
  phase_ends_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.versiculo_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  round_index integer not null check (round_index >= 0),
  participant_id uuid not null references public.participants (id) on delete cascade,
  choice text not null check (choice in ('verse', 'invented')),
  answered_at timestamptz not null default clock_timestamp(),
  response_ms integer not null check (response_ms >= 0),
  correct boolean not null,
  points integer not null check (points between 0 and 1000),
  unique (room_id, round_index, participant_id)
);

create index if not exists versiculo_answers_room_round_idx
  on public.versiculo_answers (room_id, round_index);

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

-- ---------------------------------------------------------- partida RPC ---

-- La versión anterior tenía un solo argumento y un tiempo fijo.
drop function if exists public.versiculo_question_seconds(jsonb);

-- `base_seconds` es el tiempo de la sala; las frases largas reciben seis
-- segundos más, igual que `questionDuration` en `match.ts`.
create or replace function public.versiculo_question_seconds(question jsonb, base_seconds integer)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when char_length(coalesce(question->>'statement', '')) > 120 then base_seconds + 6 else base_seconds end
$$;

-- Avanza como máximo una fase. Si alguien vuelve tras una desconexión larga,
-- recibe una pregunta completa en vez de saltarse varias sin poder leerlas.
create or replace function public.advance_versiculo_match(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  game public.versiculo_matches%rowtype;
  timing record;
  now_at timestamptz := clock_timestamp();
  expected integer;
  received integer;
  seconds integer;
begin
  select * into game from public.versiculo_matches where room_id = target_room_id for update;
  if not found or game.phase = 'finished' then return; end if;
  select question_seconds, reveal_seconds into timing from public.rooms where id = target_room_id;

  if game.phase = 'question' then
    select count(*) into expected from public.participants where room_id = target_room_id and plays;
    select count(*) into received
      from public.versiculo_answers
      where room_id = target_room_id and round_index = game.current_round;
    if now_at < game.phase_ends_at and received < expected then return; end if;

    update public.versiculo_matches
      set phase = 'reveal', phase_started_at = now_at, phase_ends_at = now_at + make_interval(secs => timing.reveal_seconds)
      where room_id = target_room_id;
    return;
  end if;

  if game.phase_ends_at is null or now_at < game.phase_ends_at then return; end if;

  if game.phase = 'countdown' then
    seconds := public.versiculo_question_seconds(game.questions->game.current_round, timing.question_seconds);
    update public.versiculo_matches
      set phase = 'question', phase_started_at = now_at, phase_ends_at = now_at + make_interval(secs => seconds)
      where room_id = target_room_id;
    return;
  end if;

  if game.phase = 'reveal' then
    if game.current_round + 1 >= jsonb_array_length(game.questions) then
      update public.versiculo_matches
        set phase = 'finished', phase_started_at = now_at, phase_ends_at = null
        where room_id = target_room_id;
      update public.rooms set status = 'finished' where id = target_room_id;
    else
      update public.versiculo_matches
        set current_round = game.current_round + 1,
            phase = 'countdown',
            phase_started_at = now_at,
            phase_ends_at = now_at + interval '3 seconds'
        where room_id = target_room_id;
    end if;
  end if;
end;
$$;

create or replace function public.get_versiculo_match(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.rooms%rowtype;
  game public.versiculo_matches%rowtype;
  seat public.participants%rowtype;
  question jsonb;
  self_choice text;
  expected integer;
  received integer;
  results jsonb := '[]'::jsonb;
  ranking jsonb := '[]'::jsonb;
begin
  select * into room from public.rooms where code = upper(p_code) and closed_at is null;
  if not found then raise exception 'match-not-found'; end if;

  select * into seat from public.participants where room_id = room.id and user_id = auth.uid();
  if not found then raise exception 'match-not-found'; end if;

  select * into game from public.versiculo_matches where room_id = room.id;
  if not found then raise exception 'match-not-found'; end if;

  perform public.advance_versiculo_match(room.id);
  select * into game from public.versiculo_matches where room_id = room.id;
  question := game.questions->game.current_round;

  select choice into self_choice
    from public.versiculo_answers
    where room_id = room.id and round_index = game.current_round and participant_id = seat.id;
  select count(*) into expected from public.participants where room_id = room.id and plays;
  select count(*) into received
    from public.versiculo_answers where room_id = room.id and round_index = game.current_round;

  select coalesce(jsonb_agg(jsonb_build_object(
    'participantId', scored.id,
    'name', scored.name,
    'color', scored.color,
    'score', scored.score,
    'correctCount', scored.correct_count,
    'averageResponseMs', scored.average_ms
  ) order by scored.score desc, scored.joined_at), '[]'::jsonb)
  into ranking
  from (
    select p.id, p.name, p.color, p.joined_at,
      coalesce(sum(a.points), 0)::integer as score,
      count(a.id) filter (where a.correct)::integer as correct_count,
      round(avg(a.response_ms))::integer as average_ms
    from public.participants p
    left join public.versiculo_answers a on a.participant_id = p.id and a.room_id = room.id
    where p.room_id = room.id and p.plays
    group by p.id, p.name, p.color, p.joined_at
  ) scored;

  if game.phase = 'reveal' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'participantId', p.id,
      'name', p.name,
      'color', p.color,
      'choice', a.choice,
      'correct', coalesce(a.correct, false),
      'points', coalesce(a.points, 0),
      'responseMs', a.response_ms
    ) order by p.joined_at), '[]'::jsonb)
    into results
    from public.participants p
    left join public.versiculo_answers a
      on a.participant_id = p.id and a.room_id = room.id and a.round_index = game.current_round
    where p.room_id = room.id and p.plays;
  end if;

  return jsonb_build_object(
    'code', room.code,
    'phase', game.phase,
    'phaseEndsAt', game.phase_ends_at,
    'serverNow', clock_timestamp(),
    'roundNumber', game.current_round + 1,
    'totalRounds', jsonb_array_length(game.questions),
    'question', case when game.phase in ('question', 'reveal') then jsonb_build_object(
      'id', question->>'id',
      'statement', question->>'statement',
      'totalSeconds', public.versiculo_question_seconds(question, room.question_seconds)
    ) else null end,
    'solution', case when game.phase = 'reveal' then jsonb_build_object(
      'isVerse', (question->>'isVerse')::boolean,
      'reference', question->'reference',
      'explanation', question->>'explanation'
    ) else null end,
    'revealSeconds', room.reveal_seconds,
    'self', jsonb_build_object(
      'id', seat.id, 'name', seat.name, 'role', seat.role, 'status', seat.status,
      'color', seat.color, 'plays', seat.plays
    ),
    'selfChoice', self_choice,
    'answeredCount', received,
    'expectedAnswers', expected,
    'roundResults', results,
    'standings', ranking
  );
end;
$$;

create or replace function public.start_versiculo_match(p_code text, p_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.rooms%rowtype;
  ready_count integer;
  item jsonb;
  now_at timestamptz := clock_timestamp();
begin
  select * into room from public.rooms
    where code = upper(p_code) and closed_at is null and host_id = auth.uid()
    for update;
  if not found then raise exception 'not-host'; end if;
  if room.status <> 'waiting' then raise exception 'not-playing'; end if;

  select count(*) into ready_count from public.participants where room_id = room.id and status = 'ready';
  if ready_count < 2 then raise exception 'not-playing'; end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) <> room.question_count then
    raise exception 'question-bank-insufficient';
  end if;
  for item in select value from jsonb_array_elements(p_questions)
  loop
    if coalesce(item->>'id', '') = '' or coalesce(item->>'statement', '') = ''
       or jsonb_typeof(item->'isVerse') <> 'boolean' or coalesce(item->>'explanation', '') = '' then
      raise exception 'question-bank-insufficient';
    end if;
  end loop;

  insert into public.versiculo_matches (
    room_id, questions, current_round, phase, phase_started_at, phase_ends_at
  ) values (
    room.id, p_questions, 0, 'countdown', now_at, now_at + interval '3 seconds'
  );
  update public.rooms set status = 'playing', started_at = now_at where id = room.id;
  return public.get_versiculo_match(room.code);
exception when unique_violation then
  raise exception 'not-playing';
end;
$$;

create or replace function public.submit_versiculo_answer(p_code text, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.rooms%rowtype;
  game public.versiculo_matches%rowtype;
  seat public.participants%rowtype;
  question jsonb;
  now_at timestamptz := clock_timestamp();
  elapsed integer;
  total_ms integer;
  is_correct boolean;
  awarded integer;
begin
  if p_choice not in ('verse', 'invented') then raise exception 'not-playing'; end if;
  select * into room from public.rooms where code = upper(p_code) and closed_at is null;
  if not found then raise exception 'match-not-found'; end if;
  select * into seat from public.participants
    where room_id = room.id and user_id = auth.uid() and plays;
  if not found then raise exception 'not-playing'; end if;

  perform public.advance_versiculo_match(room.id);
  select * into game from public.versiculo_matches where room_id = room.id for update;
  if not found then raise exception 'match-not-found'; end if;
  if game.phase <> 'question' then
    if game.phase = 'reveal' then raise exception 'time-up'; end if;
    raise exception 'not-playing';
  end if;
  if exists (
    select 1 from public.versiculo_answers
    where room_id = room.id and round_index = game.current_round and participant_id = seat.id
  ) then raise exception 'answer-locked'; end if;

  question := game.questions->game.current_round;
  total_ms := public.versiculo_question_seconds(question, room.question_seconds) * 1000;
  elapsed := greatest(0, least(total_ms, round(extract(epoch from (now_at - game.phase_started_at)) * 1000)::integer));
  is_correct := (p_choice = 'verse') = ((question->>'isVerse')::boolean);
  awarded := case when is_correct then 200 + round(800 * (total_ms - elapsed)::numeric / total_ms)::integer else 0 end;

  insert into public.versiculo_answers (
    room_id, round_index, participant_id, choice, answered_at, response_ms, correct, points
  ) values (
    room.id, game.current_round, seat.id, p_choice, now_at, elapsed, is_correct, awarded
  );
  perform public.advance_versiculo_match(room.id);
  return public.get_versiculo_match(room.code);
exception when unique_violation then
  raise exception 'answer-locked';
end;
$$;

-- «Jugar otra vez» sin abrir otra sala: la misma vuelve a la espera con la
-- configuración nueva. Quienes siguen dentro conservan su asiento, y la
-- partida anterior se borra entera —preguntas, respuestas y puntos— para que
-- la siguiente empiece desde cero para todos. Una partida en curso no se
-- puede reiniciar a espaldas de quien está respondiendo.
--
-- La versión anterior no recibía tiempos. Se retira porque convivir con esta
-- haría ambigua la llamada de cuatro argumentos; los valores por omisión
-- mantienen funcionando un cliente que aún no los envía.
drop function if exists public.reopen_versiculo_room(text, text, integer, text);

create or replace function public.reopen_versiculo_room(
  p_code text,
  p_difficulty text,
  p_question_count integer,
  p_host_role text,
  p_question_seconds integer default 12,
  p_reveal_seconds integer default 5
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  room public.rooms%rowtype;
begin
  select * into room from public.rooms
    where code = upper(p_code) and closed_at is null and host_id = auth.uid()
    for update;
  if not found then raise exception 'room-not-found'; end if;
  if room.status = 'playing' then raise exception 'room-started'; end if;

  delete from public.versiculo_answers where room_id = room.id;
  delete from public.versiculo_matches where room_id = room.id;

  -- Los `check` de la tabla rechazan una configuración que no existe.
  update public.rooms
    set status = 'waiting',
        started_at = null,
        difficulty = p_difficulty,
        question_count = p_question_count,
        host_role = p_host_role,
        question_seconds = p_question_seconds,
        reveal_seconds = p_reveal_seconds
    where id = room.id;
  update public.participants
    set plays = (p_host_role = 'player')
    where room_id = room.id and role = 'host';
end;
$$;

-- ------------------------------------------------------------------- RLS ---

alter table public.rooms enable row level security;
alter table public.participants enable row level security;
alter table public.versiculo_matches enable row level security;
alter table public.versiculo_answers enable row level security;

-- Estas dos tablas nunca se leen directamente: así un participante no puede
-- inspeccionar la solución antes de la revelación ni escribir sus puntos.
revoke all on public.versiculo_matches, public.versiculo_answers from anon, authenticated;
revoke all on function public.advance_versiculo_match(uuid) from public, anon, authenticated;
revoke all on function public.versiculo_question_seconds(jsonb, integer) from public, anon, authenticated;
revoke all on function public.start_versiculo_match(text, jsonb) from public, anon;
revoke all on function public.get_versiculo_match(text) from public, anon;
revoke all on function public.submit_versiculo_answer(text, text) from public, anon;
revoke all on function public.reopen_versiculo_room(text, text, integer, text, integer, integer) from public, anon;
grant execute on function public.start_versiculo_match(text, jsonb) to authenticated;
grant execute on function public.get_versiculo_match(text) to authenticated;
grant execute on function public.submit_versiculo_answer(text, text) to authenticated;
grant execute on function public.reopen_versiculo_room(text, text, integer, text, integer, integer) to authenticated;

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
