  -- Chairo — salas multijugador de ¿Versículo o inventículo? y Jeopardy
  --
  -- Pega este archivo completo en el SQL Editor de Supabase y ejecútalo una vez.
  -- Requiere que "Allow anonymous sign-ins" esté activado en Authentication:
  -- cada teléfono recibe un usuario anónimo, sin correo ni cuenta, y ese
  -- `auth.uid()` es lo único que decide qué puede tocar cada quien.
  --
  -- Cubre la sala y la partida completa de ambos juegos. Las preguntas se
  -- seleccionan del banco revisado que viaja con el frontend, pero la partida,
  -- los relojes, las respuestas y los puntos quedan bajo autoridad de estas
  -- funciones. Jeopardy vive en sus propias tablas, al final del archivo.

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

  -- ======================================================================
  -- Password
  -- ======================================================================
  --
  -- Dos teléfonos y dos palabras secretas. Las rondas y sus entradas no son
  -- legibles directamente: cada cliente recibe solo su palabra a través de
  -- `get_password_snapshot`. Realtime publica únicamente sala y jugadores.

  create table if not exists public.password_rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null check (code ~ '^[2-9A-HJ-NP-Z]{4}$'),
    host_id uuid not null default auth.uid(),
    round_seconds integer not null check (round_seconds in (30, 45, 60, 90)),
    phase text not null default 'waiting'
      check (phase in ('waiting', 'preparing', 'countdown', 'playing', 'scoring', 'scoreboard', 'finished')),
    round_number integer not null default 0 check (round_number >= 0),
    word_visible_at timestamptz,
    deadline_at timestamptz,
    created_at timestamptz not null default clock_timestamp(),
    updated_at timestamptz not null default clock_timestamp(),
    closed_at timestamptz
  );

  create unique index if not exists password_rooms_open_code_key
    on public.password_rooms (code) where closed_at is null;

  create table if not exists public.password_players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.password_rooms (id) on delete cascade,
    user_id uuid not null default auth.uid(),
    name varchar(24) not null check (char_length(btrim(name)) between 1 and 24),
    color text not null check (color in ('yellow', 'orange', 'turquoise', 'blue', 'green', 'violet')),
    role text not null check (role in ('host', 'guest')),
    score integer not null default 0 check (score >= 0),
    ready boolean not null default false,
    joined_at timestamptz not null default clock_timestamp()
  );

  create unique index if not exists password_players_room_user_key
    on public.password_players (room_id, user_id);
  create unique index if not exists password_players_room_name_key
    on public.password_players (room_id, lower(btrim(name)));
  create unique index if not exists password_players_room_color_key
    on public.password_players (room_id, color);
  create unique index if not exists password_players_one_host_key
    on public.password_players (room_id) where role = 'host';

  create table if not exists public.password_rounds (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.password_rooms (id) on delete cascade,
    round_number integer not null check (round_number > 0),
    started_at timestamptz not null,
    ended_at timestamptz,
    scored_at timestamptz,
    ended_by uuid references public.password_players (id),
    unique (room_id, round_number)
  );

  create table if not exists public.password_round_entries (
    round_id uuid not null references public.password_rounds (id) on delete cascade,
    participant_id uuid not null references public.password_players (id) on delete cascade,
    word text not null check (char_length(btrim(word)) between 1 and 32),
    guessed boolean,
    primary key (round_id, participant_id)
  );

  create or replace function public.guard_password_player_insert()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
    taken integer;
  begin
    select * into room from public.password_rooms where id = new.room_id for update;
    if not found or room.closed_at is not null then raise exception 'room-not-found'; end if;
    if room.phase <> 'waiting' and new.role = 'guest' then raise exception 'room-started'; end if;
    select count(*) into taken from public.password_players where room_id = room.id;
    if taken >= 2 then raise exception 'room-full'; end if;
    if new.role = 'host' and (new.user_id is distinct from room.host_id or new.color <> 'yellow') then
      raise exception 'not-host';
    end if;
    if new.role = 'guest' and new.color = 'yellow' then raise exception 'color-taken'; end if;
    return new;
  end;
  $$;

  drop trigger if exists password_players_guard on public.password_players;
  create trigger password_players_guard
    before insert on public.password_players
    for each row execute function public.guard_password_player_insert();

  -- La fila bloqueada serializa todas las mutaciones y convierte countdown en
  -- playing al primer acceso posterior a `word_visible_at`; el vencimiento del
  -- reloj jamás cambia de fase.
  create or replace function public.password_lock_room(p_code text)
  returns public.password_rooms
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
  begin
    select * into room from public.password_rooms
      where code = upper(p_code) and closed_at is null for update;
    if not found then raise exception 'room-not-found'; end if;
    if room.phase = 'countdown' and room.word_visible_at <= clock_timestamp() then
      update public.password_rooms
        set phase = 'playing', updated_at = clock_timestamp()
        where id = room.id
        returning * into room;
    end if;
    return room;
  end;
  $$;

  create or replace function public.password_snapshot(target_room_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
    seat public.password_players%rowtype;
    current_round_id uuid;
    players jsonb;
    entries jsonb := '[]'::jsonb;
    deltas jsonb := '{}'::jsonb;
    self_word text;
  begin
    select * into room from public.password_rooms where id = target_room_id and closed_at is null;
    if not found then raise exception 'room-not-found'; end if;
    select * into seat from public.password_players where room_id = room.id and user_id = auth.uid();
    if not found then raise exception 'not-seated'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'color', p.color, 'role', p.role,
      'score', p.score, 'ready', p.ready
    ) order by p.joined_at, p.id), '[]'::jsonb)
    into players from public.password_players p where p.room_id = room.id;

    select id into current_round_id from public.password_rounds
      where room_id = room.id and round_number = room.round_number;
    if current_round_id is not null then
      if room.phase in ('countdown', 'playing') then
        select word into self_word from public.password_round_entries
          where round_id = current_round_id and participant_id = seat.id;
      end if;
      if room.phase in ('scoring', 'scoreboard', 'finished') then
        select coalesce(jsonb_agg(jsonb_build_object(
          'participantId', e.participant_id, 'word', e.word, 'guessed', e.guessed
        ) order by p.joined_at), '[]'::jsonb)
        into entries
        from public.password_round_entries e
        join public.password_players p on p.id = e.participant_id
        where e.round_id = current_round_id;
      end if;
      select coalesce(jsonb_object_agg(e.participant_id::text, case when e.guessed then 1 else 0 end), '{}'::jsonb)
        into deltas from public.password_round_entries e where e.round_id = current_round_id;
    end if;

    return jsonb_build_object(
      'roomId', room.id,
      'code', room.code,
      'phase', room.phase,
      'roundNumber', room.round_number,
      'roundSeconds', room.round_seconds,
      'wordVisibleAt', room.word_visible_at,
      'deadlineAt', room.deadline_at,
      'serverNow', clock_timestamp(),
      'self', jsonb_build_object(
        'id', seat.id, 'name', seat.name, 'color', seat.color, 'role', seat.role,
        'score', seat.score, 'ready', seat.ready
      ),
      'players', players,
      'selfWord', self_word,
      'revealedEntries', entries,
      'roundDeltas', deltas
    );
  end;
  $$;

  create or replace function public.create_password_room(p_host_name text, p_round_seconds integer)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    new_code text;
    new_room_id uuid;
  begin
    if auth.uid() is null then raise exception 'not-seated'; end if;
    if char_length(btrim(coalesce(p_host_name, ''))) not between 1 and 24
      or p_round_seconds not in (30, 45, 60, 90) then raise exception 'invalid-results'; end if;
    for attempt in 1..12 loop
      new_code := '';
      for position in 1..4 loop
        new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
      begin
        insert into public.password_rooms (code, host_id, round_seconds)
          values (new_code, auth.uid(), p_round_seconds) returning id into new_room_id;
        exit;
      exception when unique_violation then new_room_id := null;
      end;
    end loop;
    if new_room_id is null then raise exception 'code-unavailable'; end if;
    insert into public.password_players (room_id, user_id, name, color, role)
      values (new_room_id, auth.uid(), btrim(p_host_name), 'yellow', 'host');
    return public.password_snapshot(new_room_id);
  end;
  $$;

  create or replace function public.get_password_snapshot(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype;
  begin
    room := public.password_lock_room(p_code);
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.join_password_room(p_code text, p_name text, p_color text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
    violated_constraint text;
  begin
    room := public.password_lock_room(p_code);
    if room.phase <> 'waiting' then raise exception 'room-started'; end if;
    if char_length(btrim(coalesce(p_name, ''))) not between 1 and 24 then raise exception 'invalid-results'; end if;
    if p_color not in ('orange', 'turquoise', 'blue', 'green', 'violet') then raise exception 'color-taken'; end if;
    insert into public.password_players (room_id, user_id, name, color, role)
      values (room.id, auth.uid(), btrim(p_name), p_color, 'guest');
    update public.password_rooms set updated_at = clock_timestamp() where id = room.id;
    return public.password_snapshot(room.id);
  exception when unique_violation then
    get stacked diagnostics violated_constraint = CONSTRAINT_NAME;
    if violated_constraint = 'password_players_room_name_key' then raise exception 'name-taken'; end if;
    if violated_constraint = 'password_players_room_color_key' then raise exception 'color-taken'; end if;
    raise exception 'room-full';
  end;
  $$;

  create or replace function public.start_password_match(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype; taken integer;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    if room.phase <> 'waiting' then raise exception 'invalid-phase'; end if;
    select count(*) into taken from public.password_players where room_id = room.id;
    if taken <> 2 then raise exception 'players-required'; end if;
    update public.password_players set ready = false where room_id = room.id;
    update public.password_rooms
      set phase = 'preparing', round_number = 1, word_visible_at = null, deadline_at = null,
          updated_at = clock_timestamp()
      where id = room.id;
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.set_password_ready(p_code text, p_ready boolean, p_words jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
    seat public.password_players%rowtype;
    item jsonb;
    ready_count integer;
    bank text[];
    choices text[];
    new_round_id uuid;
    visible_at timestamptz;
  begin
    room := public.password_lock_room(p_code);
    if room.phase <> 'preparing' then raise exception 'invalid-phase'; end if;
    select * into seat from public.password_players where room_id = room.id and user_id = auth.uid();
    if not found then raise exception 'not-seated'; end if;
    update public.password_players set ready = p_ready where id = seat.id;
    select count(*) into ready_count from public.password_players where room_id = room.id and ready;
    if ready_count < 2 then
      update public.password_rooms set updated_at = clock_timestamp() where id = room.id;
      return public.password_snapshot(room.id);
    end if;

    if jsonb_typeof(p_words) <> 'array' then raise exception 'bank-insufficient'; end if;
    for item in select value from jsonb_array_elements(p_words)
    loop
      if jsonb_typeof(item) <> 'string' or char_length(btrim(item #>> '{}')) not between 1 and 32 then
        raise exception 'bank-insufficient';
      end if;
    end loop;
    select array_agg(word order by random()) into bank
    from (
      select distinct on (lower(btrim(value))) btrim(value) as word
      from jsonb_array_elements_text(p_words)
      order by lower(btrim(value)), btrim(value)
    ) normalized;
    if coalesce(cardinality(bank), 0) < 2 then raise exception 'bank-insufficient'; end if;

    -- El candidato se llama distinto que `password_round_entries.word`: con el
    -- mismo nombre la subconsulta se compara consigo misma y la bolsa se agota
    -- en la primera ronda, repitiendo palabras en la siguiente.
    select array_agg(candidate order by random()) into choices
    from unnest(bank) as candidate
    where not exists (
      select 1 from public.password_round_entries e
      join public.password_rounds r on r.id = e.round_id
      where r.room_id = room.id and lower(btrim(e.word)) = lower(btrim(candidate))
    );
    if coalesce(cardinality(choices), 0) < 2 then choices := bank; end if;
    visible_at := clock_timestamp() + interval '3 seconds';
    insert into public.password_rounds (room_id, round_number, started_at)
      values (room.id, room.round_number, visible_at) returning id into new_round_id;
    insert into public.password_round_entries (round_id, participant_id, word)
      select new_round_id, ordered.id, choices[ordered.position]
      from (
        select id, row_number() over (order by joined_at, id)::integer as position
        from public.password_players where room_id = room.id
      ) ordered;
    update public.password_rooms
      set phase = 'countdown', word_visible_at = visible_at,
          deadline_at = visible_at + make_interval(secs => room.round_seconds),
          updated_at = clock_timestamp()
      where id = room.id;
    return public.password_snapshot(room.id);
  exception when unique_violation then
    raise exception 'invalid-phase';
  end;
  $$;

  create or replace function public.end_password_round(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype; seat public.password_players%rowtype;
  begin
    room := public.password_lock_room(p_code);
    select * into seat from public.password_players where room_id = room.id and user_id = auth.uid();
    if not found or seat.role <> 'host' then raise exception 'not-host'; end if;
    if room.phase <> 'playing' then raise exception 'invalid-phase'; end if;
    update public.password_rounds
      set ended_at = coalesce(ended_at, clock_timestamp()), ended_by = seat.id
      where room_id = room.id and round_number = room.round_number;
    update public.password_rooms set phase = 'scoring', updated_at = clock_timestamp() where id = room.id;
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.score_password_round(p_code text, p_results jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.password_rooms%rowtype;
    target_round public.password_rounds%rowtype;
    valid_count integer;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    select * into target_round from public.password_rounds
      where room_id = room.id and round_number = room.round_number for update;
    if room.phase = 'scoreboard' and target_round.scored_at is not null then
      return public.password_snapshot(room.id);
    end if;
    if room.phase <> 'scoring' or target_round.id is null then raise exception 'invalid-phase'; end if;
    if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) <> 2 then raise exception 'invalid-results'; end if;
    select count(*) into valid_count
    from jsonb_array_elements(p_results) result
    join public.password_players p
      on p.room_id = room.id and p.id = (result->>'participantId')::uuid
    where jsonb_typeof(result->'guessed') = 'boolean';
    if valid_count <> 2 or (
      select count(distinct result->>'participantId') from jsonb_array_elements(p_results) result
    ) <> 2 then raise exception 'invalid-results'; end if;

    update public.password_round_entries e
      set guessed = (result->>'guessed')::boolean
      from jsonb_array_elements(p_results) result
      where e.round_id = target_round.id and e.participant_id = (result->>'participantId')::uuid;
    update public.password_players p
      set score = p.score + case when e.guessed then 1 else 0 end
      from public.password_round_entries e
      where e.round_id = target_round.id and e.participant_id = p.id;
    update public.password_rounds set scored_at = clock_timestamp() where id = target_round.id;
    update public.password_rooms set phase = 'scoreboard', updated_at = clock_timestamp() where id = room.id;
    return public.password_snapshot(room.id);
  exception when invalid_text_representation then
    raise exception 'invalid-results';
  end;
  $$;

  create or replace function public.prepare_password_round(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    if room.phase <> 'scoreboard' then raise exception 'invalid-phase'; end if;
    update public.password_players set ready = false where room_id = room.id;
    update public.password_rooms
      set phase = 'preparing', round_number = room.round_number + 1,
          word_visible_at = null, deadline_at = null, updated_at = clock_timestamp()
      where id = room.id;
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.finish_password_match(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    if room.phase <> 'scoreboard' then raise exception 'invalid-phase'; end if;
    update public.password_rooms
      set phase = 'finished', word_visible_at = null, deadline_at = null, updated_at = clock_timestamp()
      where id = room.id;
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.reopen_password_room(p_code text, p_round_seconds integer)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    if room.phase <> 'finished' then raise exception 'invalid-phase'; end if;
    if p_round_seconds not in (30, 45, 60, 90) then raise exception 'invalid-results'; end if;
    delete from public.password_rounds where room_id = room.id;
    update public.password_players set score = 0, ready = false where room_id = room.id;
    update public.password_rooms
      set round_seconds = p_round_seconds, phase = 'waiting', round_number = 0,
          word_visible_at = null, deadline_at = null, updated_at = clock_timestamp()
      where id = room.id;
    return public.password_snapshot(room.id);
  end;
  $$;

  create or replace function public.leave_password_room(p_code text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype; seat public.password_players%rowtype;
  begin
    room := public.password_lock_room(p_code);
    select * into seat from public.password_players where room_id = room.id and user_id = auth.uid();
    if not found then return; end if;
    if seat.role = 'host' then raise exception 'not-host'; end if;
    if room.phase not in ('waiting', 'preparing') then raise exception 'room-started'; end if;
    delete from public.password_players where id = seat.id;
    update public.password_rooms
      set phase = 'waiting', round_number = 0, word_visible_at = null, deadline_at = null,
          updated_at = clock_timestamp()
      where id = room.id;
  end;
  $$;

  create or replace function public.close_password_room(p_code text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare room public.password_rooms%rowtype;
  begin
    room := public.password_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    update public.password_rooms set closed_at = clock_timestamp(), updated_at = clock_timestamp() where id = room.id;
  end;
  $$;

  alter table public.password_rooms enable row level security;
  alter table public.password_players enable row level security;
  alter table public.password_rounds enable row level security;
  alter table public.password_round_entries enable row level security;

  revoke all on public.password_rooms, public.password_players,
    public.password_rounds, public.password_round_entries from anon;
  revoke insert, update, delete, truncate on public.password_rooms, public.password_players from authenticated;
  revoke all on public.password_rounds, public.password_round_entries from authenticated;
  grant select on public.password_rooms, public.password_players to authenticated;

  drop policy if exists "password_rooms_select_open" on public.password_rooms;
  create policy "password_rooms_select_open" on public.password_rooms
    for select to authenticated using (closed_at is null);
  drop policy if exists "password_players_select_open_room" on public.password_players;
  create policy "password_players_select_open_room" on public.password_players
    for select to authenticated
    using (exists (select 1 from public.password_rooms r where r.id = room_id and r.closed_at is null));

  revoke all on function public.guard_password_player_insert() from public, anon, authenticated;
  revoke all on function public.password_lock_room(text) from public, anon, authenticated;
  revoke all on function public.password_snapshot(uuid) from public, anon, authenticated;
  revoke all on function public.create_password_room(text, integer) from public, anon;
  revoke all on function public.get_password_snapshot(text) from public, anon;
  revoke all on function public.join_password_room(text, text, text) from public, anon;
  revoke all on function public.start_password_match(text) from public, anon;
  revoke all on function public.set_password_ready(text, boolean, jsonb) from public, anon;
  revoke all on function public.end_password_round(text) from public, anon;
  revoke all on function public.score_password_round(text, jsonb) from public, anon;
  revoke all on function public.prepare_password_round(text) from public, anon;
  revoke all on function public.finish_password_match(text) from public, anon;
  revoke all on function public.reopen_password_room(text, integer) from public, anon;
  revoke all on function public.leave_password_room(text) from public, anon;
  revoke all on function public.close_password_room(text) from public, anon;

  grant execute on function public.create_password_room(text, integer) to authenticated;
  grant execute on function public.get_password_snapshot(text) to authenticated;
  grant execute on function public.join_password_room(text, text, text) to authenticated;
  grant execute on function public.start_password_match(text) to authenticated;
  grant execute on function public.set_password_ready(text, boolean, jsonb) to authenticated;
  grant execute on function public.end_password_round(text) to authenticated;
  grant execute on function public.score_password_round(text, jsonb) to authenticated;
  grant execute on function public.prepare_password_round(text) to authenticated;
  grant execute on function public.finish_password_match(text) to authenticated;
  grant execute on function public.reopen_password_room(text, integer) to authenticated;
  grant execute on function public.leave_password_room(text) to authenticated;
  grant execute on function public.close_password_room(text) to authenticated;

  alter table public.password_rooms replica identity full;
  alter table public.password_players replica identity full;
  do $$
  begin
    begin
      alter publication supabase_realtime add table public.password_rooms;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.password_players;
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

  -- ======================================================================
  -- Jeopardy
  -- ======================================================================
  --
  -- Tablas propias en vez de compartir `rooms` y `participants`: la sala de
  -- Jeopardy tiene otra configuración, otro tope de jugadores y otra partida, y
  -- mezclarlas obligaría a tocar un juego ya terminado para abrir el siguiente.
  --
  -- Nadie escribe estas tablas directamente. Cada jugada es una función que
  -- comprueba turno, fase y asiento con la fila de la sala bloqueada, así que dos
  -- teléfonos que tocan a la vez no pueden abrir dos casillas ni robar dos veces.
  -- Las preguntas y respuestas viven en `jeopardy_cells`, que ningún cliente
  -- puede leer: `jeopardy_snapshot` muestra la pregunta abierta y solo enseña la
  -- respuesta al anfitrión, que conduce; `get_jeopardy_cell` le deja mirar
  -- cualquier otra casilla.

  -- ---------------------------------------------------------------- tablas ---

  create table if not exists public.jeopardy_rooms (
    id uuid primary key default gen_random_uuid(),
    code text not null check (code ~ '^[2-9A-HJ-NP-Z]{4}$'),
    host_id uuid not null default auth.uid(),
    -- Los límites repiten MIN_GRID, MAX_ROWS, MAX_COLUMNS y SPECIAL_COUNT de
    -- `jeopardy.ts`.
    board_rows integer not null check (board_rows between 3 and 8),
    board_columns integer not null check (board_columns between 3 and 8),
    double_count integer not null,
    status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
    phase text not null default 'waiting'
      check (phase in ('waiting', 'board', 'wager', 'question', 'judging', 'steal', 'finished')),
    turn_player_id uuid,
    active_cell text,
    attempt_player_id uuid,
    -- Quienes todavía pueden robar la casilla abierta; se la queda quien lo pida
    -- primero, y gasta su oportunidad.
    steal_queue uuid[] not null default '{}',
    wager integer,
    -- Fin de la cuenta regresiva del anfitrión. Al vencer termina el turno.
    deadline_at timestamptz,
    message text not null default '',
    created_at timestamptz not null default now(),
    started_at timestamptz,
    closed_at timestamptz,
    constraint jeopardy_rooms_double_count_check
      check (double_count between 0 and board_rows * board_columns - 2)
  );

  -- Una versión previa dejaba elegir si el anfitrión jugaba; ahora solo juega
  -- cuando nadie más entra, y lo decide `start_jeopardy_game`.
  alter table public.jeopardy_rooms drop column if exists host_plays;

  -- Instalaciones anteriores a la cuenta regresiva.
  alter table public.jeopardy_rooms add column if not exists deadline_at timestamptz;

  create unique index if not exists jeopardy_rooms_open_code_key
    on public.jeopardy_rooms (code)
    where closed_at is null;

  create table if not exists public.jeopardy_players (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.jeopardy_rooms (id) on delete cascade,
    user_id uuid not null default auth.uid(),
    name text not null check (char_length(btrim(name)) between 1 and 24),
    -- El anfitrión conduce sin color, así los cuatro quedan para los invitados.
    -- Solo toma uno, el amarillo, cuando juega solo.
    color text check (color in ('yellow', 'orange', 'turquoise', 'violet')),
    is_host boolean not null default false,
    plays boolean not null default true,
    score integer not null default 0,
    joined_at timestamptz not null default clock_timestamp(),
    constraint jeopardy_players_color_plays_check check (plays = (color is not null))
  );

  create unique index if not exists jeopardy_players_room_user_key
    on public.jeopardy_players (room_id, user_id);
  create unique index if not exists jeopardy_players_room_name_key
    on public.jeopardy_players (room_id, lower(btrim(name)));
  create unique index if not exists jeopardy_players_room_color_key
    on public.jeopardy_players (room_id, color);

  create table if not exists public.jeopardy_cells (
    room_id uuid not null references public.jeopardy_rooms (id) on delete cascade,
    id text not null,
    board_column integer not null check (board_column between 0 and 7),
    board_row integer not null check (board_row between 0 and 7),
    category text not null check (btrim(category) <> ''),
    value integer not null check (value > 0),
    -- Una apuesta especial trae una pregunta extrema de otra categoría.
    question_category text not null check (btrim(question_category) <> ''),
    prompt text not null check (btrim(prompt) <> ''),
    answer text not null check (btrim(answer) <> ''),
    reference text not null default '',
    is_special boolean not null default false,
    is_double boolean not null default false,
    used boolean not null default false,
    primary key (room_id, id),
    check (not (is_special and is_double))
  );

  -- ------------------------------------------------------------ auxiliares ---

  -- Lo que un asiento puede ver de la sala. Sin asiento —quien busca el código
  -- para entrar— se ve la sala, pero ninguna pregunta. La respuesta de la
  -- casilla abierta solo la recibe el anfitrión, en cuanto la pregunta está a la
  -- vista. Igual que `viewRoom` en `rules.ts`.
  create or replace function public.jeopardy_snapshot(target_room_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    cell public.jeopardy_cells%rowtype;
    seated boolean;
    host_view boolean;
    players jsonb;
    board jsonb;
    clue jsonb;
  begin
    select * into room from public.jeopardy_rooms where id = target_room_id;
    select * into seat from public.jeopardy_players where room_id = room.id and user_id = auth.uid();
    seated := found;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.name, 'color', p.color, 'isHost', p.is_host, 'plays', p.plays, 'score', p.score
    ) order by p.joined_at, p.id), '[]'::jsonb)
    into players
    from public.jeopardy_players p
    where p.room_id = room.id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'column', c.board_column, 'row', c.board_row, 'category', c.category, 'value', c.value, 'used', c.used
    ) order by c.board_column, c.board_row), '[]'::jsonb)
    into board
    from public.jeopardy_cells c
    where c.room_id = room.id;

    if seated and room.active_cell is not null then
      select * into cell from public.jeopardy_cells where room_id = room.id and id = room.active_cell;
      if found then
        host_view := seat.is_host and room.phase <> 'wager';
        clue := jsonb_build_object(
          'id', cell.id,
          'category', cell.question_category,
          'value', cell.value,
          'points', case when cell.is_special then room.wager when cell.is_double then cell.value * 2 else cell.value end,
          'special', cell.is_special,
          'double', cell.is_double,
          -- La apuesta se fija antes de leer la pregunta.
          'prompt', case when room.phase = 'wager' then null else cell.prompt end,
          'answer', case when host_view then cell.answer end,
          'reference', case when host_view then nullif(cell.reference, '') end
        );
      end if;
    end if;

    return jsonb_build_object(
      'roomId', room.id,
      'code', room.code,
      'status', room.status,
      'phase', room.phase,
      'setup', jsonb_build_object(
        'rows', room.board_rows, 'columns', room.board_columns,
        'doubleCount', room.double_count
      ),
      'players', players,
      'selfId', case when seated then seat.id end,
      'turnPlayerId', room.turn_player_id,
      'attemptPlayerId', room.attempt_player_id,
      'stealQueue', to_jsonb(room.steal_queue),
      'wager', room.wager,
      -- La cuenta viaja con la hora del servidor: cada teléfono la traslada a su reloj.
      'deadline', room.deadline_at,
      'serverNow', clock_timestamp(),
      'message', room.message,
      'board', board,
      'clue', clue
    );
  end;
  $$;

  -- La sala abierta con ese código, bloqueada hasta el final de la jugada. Si
  -- la cuenta regresiva ya venció, se aplica antes de mirar la jugada: nadie
  -- responde ni roba con el tiempo acabado. Mientras alguien responde, vencer
  -- cuenta como «Ya respondí» y el anfitrión juzga; en las demás fases el turno
  -- termina. Igual que `expireCountdown` en `rules.ts`.
  create or replace function public.jeopardy_lock_room(p_code text)
  returns public.jeopardy_rooms
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    attempt_name text;
  begin
    select * into room from public.jeopardy_rooms
      where code = upper(p_code) and closed_at is null
      for update;
    if not found then raise exception 'room-not-found'; end if;
    if room.deadline_at <= clock_timestamp() then
      if room.phase = 'question' then
        select name into attempt_name from public.jeopardy_players where id = room.attempt_player_id;
        update public.jeopardy_rooms
          set phase = 'judging', deadline_at = null,
              message = 'Se acabó el tiempo de ' || coalesce(attempt_name, '') || '. El anfitrión decide.'
          where id = room.id;
      else
        perform public.jeopardy_finish_turn(room.id, 'Se acabó el tiempo.');
      end if;
      select * into room from public.jeopardy_rooms where id = room.id;
    end if;
    return room;
  end;
  $$;

  create or replace function public.jeopardy_seat(target_room_id uuid)
  returns public.jeopardy_players
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    seat public.jeopardy_players%rowtype;
  begin
    select * into seat from public.jeopardy_players where room_id = target_room_id and user_id = auth.uid();
    if not found then raise exception 'not-seated'; end if;
    return seat;
  end;
  $$;

  -- Los turnos siguen el orden de llegada. Sin jugador de referencia empieza el
  -- primero; después del último vuelve al primero.
  create or replace function public.jeopardy_next_player(target_room_id uuid, after_player uuid)
  returns uuid
  language sql
  stable
  security definer
  set search_path = public
  as $$
    with ordered as (
      select id, row_number() over (order by joined_at, id) as position
      from public.jeopardy_players
      where room_id = target_room_id and plays
    ), reference as (
      select coalesce((select position from ordered where id = after_player), 0) as position
    )
    select ordered.id
    from ordered, reference
    order by ordered.position <= reference.position, ordered.position
    limit 1
  $$;

  -- Quién puede robar después de un fallo: el resto de jugadores, en orden de
  -- turno a partir de quien falló. Igual que `stealOrder` en `jeopardy.ts`.
  create or replace function public.jeopardy_steal_order(target_room_id uuid, after_player uuid)
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public
  as $$
    with ordered as (
      select id, row_number() over (order by joined_at, id) as position
      from public.jeopardy_players
      where room_id = target_room_id and plays
    ), reference as (
      select coalesce((select position from ordered where id = after_player), 0) as position
    )
    select coalesce(array_agg(ordered.id order by ordered.position <= reference.position, ordered.position), '{}')
    from ordered, reference
    where ordered.id <> after_player
  $$;

  -- Cierra la casilla abierta y pasa el turno a quien sigue a quien la eligió,
  -- aunque la haya ganado otro robando.
  create or replace function public.jeopardy_close_clue(target_room_id uuid, result_message text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    next_player uuid;
    next_name text;
  begin
    select * into room from public.jeopardy_rooms where id = target_room_id;
    update public.jeopardy_cells set used = true where room_id = room.id and id = room.active_cell;

    if not exists (select 1 from public.jeopardy_cells where room_id = room.id and not used) then
      update public.jeopardy_rooms
        set status = 'finished', phase = 'finished', turn_player_id = null, active_cell = null,
            attempt_player_id = null, steal_queue = '{}', wager = null, deadline_at = null,
            message = result_message || ' Tablero completo.'
        where id = room.id;
      return;
    end if;

    next_player := public.jeopardy_next_player(room.id, room.turn_player_id);
    select name into next_name from public.jeopardy_players where id = next_player;
    update public.jeopardy_rooms
      set phase = 'board', turn_player_id = next_player, active_cell = null,
          attempt_player_id = null, steal_queue = '{}', wager = null, deadline_at = null,
          message = result_message || ' Turno de ' || next_name || '.'
      where id = room.id;
  end;
  $$;

  -- Termina el turno sin puntos para nadie: con una casilla abierta la cierra;
  -- sin ella, pasa al siguiente jugador. Fuera de juego solo retira la cuenta.
  -- Igual que `finishTurn` en `rules.ts`.
  create or replace function public.jeopardy_finish_turn(target_room_id uuid, result_message text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    next_player uuid;
    next_name text;
  begin
    select * into room from public.jeopardy_rooms where id = target_room_id;

    if room.phase in ('wager', 'question', 'judging', 'steal') then
      perform public.jeopardy_close_clue(room.id, result_message);
    elsif room.phase = 'board' then
      next_player := public.jeopardy_next_player(room.id, room.turn_player_id);
      select name into next_name from public.jeopardy_players where id = next_player;
      update public.jeopardy_rooms
        set turn_player_id = next_player, deadline_at = null,
            message = result_message || ' Turno de ' || next_name || '.'
        where id = room.id;
    else
      update public.jeopardy_rooms set deadline_at = null where id = room.id;
    end if;
  end;
  $$;

  -- ------------------------------------------------------------------ sala ---

  -- Las versiones anteriores recibían si el anfitrión jugaba.
  drop function if exists public.create_jeopardy_room(integer, integer, integer, boolean, text);
  drop function if exists public.reopen_jeopardy_room(text, integer, integer, integer, boolean);

  -- El anfitrión entra conduciendo: arbitra y no ocupa puesto de jugador.
  create or replace function public.create_jeopardy_room(
    p_rows integer,
    p_columns integer,
    p_double_count integer,
    p_host_name text
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    new_code text;
    new_room_id uuid;
  begin
    if auth.uid() is null then raise exception 'not-seated'; end if;
    if char_length(btrim(coalesce(p_host_name, ''))) not between 1 and 24 then raise exception 'invalid-move'; end if;

    -- Un código solo choca con otra sala abierta: se prueba otro.
    for attempt in 1..12 loop
      new_code := '';
      for position in 1..4 loop
        new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
      end loop;
      begin
        insert into public.jeopardy_rooms (code, host_id, board_rows, board_columns, double_count, message)
          values (new_code, auth.uid(), p_rows, p_columns, p_double_count, 'Sala abierta.')
          returning id into new_room_id;
        exit;
      exception when unique_violation then
        new_room_id := null;
      end;
    end loop;
    if new_room_id is null then raise exception 'code-unavailable'; end if;

    insert into public.jeopardy_players (room_id, user_id, name, color, is_host, plays)
      values (new_room_id, auth.uid(), btrim(p_host_name), null, true, false);
    return public.jeopardy_snapshot(new_room_id);
  exception when check_violation or not_null_violation then
    raise exception 'invalid-move';
  end;
  $$;

  -- Nadie escribe cuando vence la cuenta regresiva: la primera lectura que llega
  -- después la aplica, y así lo ven todos.
  create or replace function public.get_jeopardy_room(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    target record;
  begin
    select id, deadline_at into target from public.jeopardy_rooms where code = upper(p_code) and closed_at is null;
    if not found then raise exception 'room-not-found'; end if;
    if target.deadline_at <= clock_timestamp() then
      perform public.jeopardy_lock_room(p_code);
    end if;
    return public.jeopardy_snapshot(target.id);
  end;
  $$;

  -- Hasta cuatro jugadores, uno por color; el anfitrión conduce y no cuenta.
  -- Entrar dos veces desde el mismo teléfono devuelve el mismo asiento.
  create or replace function public.join_jeopardy_room(p_code text, p_name text, p_color text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    playing integer;
    violated text;
  begin
    if auth.uid() is null then raise exception 'not-seated'; end if;
    room := public.jeopardy_lock_room(p_code);
    if exists (select 1 from public.jeopardy_players where room_id = room.id and user_id = auth.uid()) then
      return public.jeopardy_snapshot(room.id);
    end if;
    if room.status <> 'waiting' then raise exception 'room-started'; end if;

    select count(*) into playing from public.jeopardy_players where room_id = room.id and plays;
    if playing >= 4 then raise exception 'room-full'; end if;
    if char_length(btrim(coalesce(p_name, ''))) not between 1 and 24 then raise exception 'invalid-move'; end if;
    if p_color is null or p_color not in ('yellow', 'orange', 'turquoise', 'violet') then
      raise exception 'color-taken';
    end if;

    begin
      insert into public.jeopardy_players (room_id, user_id, name, color, is_host, plays)
        values (room.id, auth.uid(), btrim(p_name), p_color, false, true);
    exception when unique_violation then
      get stacked diagnostics violated = constraint_name;
      if violated = 'jeopardy_players_room_name_key' then raise exception 'name-taken'; end if;
      if violated = 'jeopardy_players_room_color_key' then raise exception 'color-taken'; end if;
      raise;
    end;

    update public.jeopardy_rooms set message = btrim(p_name) || ' entró a la sala.' where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- El tablero lo arma el teléfono del anfitrión con el banco revisado; aquí se
  -- comprueba su forma antes de guardarlo. El valor de cada casilla lo decide la
  -- fila, no lo que llegue en la petición.
  create or replace function public.start_jeopardy_game(p_code text, p_cells jsonb)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    item jsonb;
    first_player uuid;
    first_name text;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if not seat.is_host then raise exception 'not-host'; end if;
    if room.status <> 'waiting' then raise exception 'room-started'; end if;

    -- El anfitrión solo juega si nadie más entró. Toma el amarillo, que sin
    -- invitados está libre.
    if not exists (select 1 from public.jeopardy_players where room_id = room.id and plays) then
      update public.jeopardy_players set plays = true, color = 'yellow' where id = seat.id;
    end if;
    first_player := public.jeopardy_next_player(room.id, null);
    if jsonb_typeof(p_cells) is distinct from 'array'
      or jsonb_array_length(p_cells) <> room.board_rows * room.board_columns then
      raise exception 'invalid-move';
    end if;

    delete from public.jeopardy_cells where room_id = room.id;
    for item in select value from jsonb_array_elements(p_cells)
    loop
      insert into public.jeopardy_cells (
        room_id, id, board_column, board_row, category, value, question_category,
        prompt, answer, reference, is_special, is_double
      ) values (
        room.id,
        (item->>'column')::integer || '-' || (item->>'row')::integer,
        (item->>'column')::integer,
        (item->>'row')::integer,
        item->>'category',
        ((item->>'row')::integer + 1) * 100,
        item->>'questionCategory',
        item->>'prompt',
        item->>'answer',
        coalesce(item->>'reference', ''),
        (item->>'special')::boolean,
        (item->>'double')::boolean
      );
    end loop;

    if exists (
        select 1 from public.jeopardy_cells
        where room_id = room.id and (board_column >= room.board_columns or board_row >= room.board_rows)
      )
      or (select count(*) from public.jeopardy_cells where room_id = room.id and is_special) <> 2
      or (select count(*) from public.jeopardy_cells where room_id = room.id and is_double) <> room.double_count
    then
      raise exception 'invalid-move';
    end if;

    update public.jeopardy_players set score = 0 where room_id = room.id;
    select name into first_name from public.jeopardy_players where id = first_player;
    update public.jeopardy_rooms
      set status = 'playing', phase = 'board', started_at = now(), turn_player_id = first_player,
          active_cell = null, attempt_player_id = null, steal_queue = '{}', wager = null, deadline_at = null,
          message = 'Turno de ' || first_name || '.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  exception
    when unique_violation or not_null_violation or check_violation
      or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid-move';
  end;
  $$;

  -- --------------------------------------------------------------- jugadas ---

  create or replace function public.select_jeopardy_cell(p_code text, p_cell_id text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    cell public.jeopardy_cells%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if room.phase <> 'board' then raise exception 'invalid-move'; end if;
    if room.turn_player_id is distinct from seat.id then raise exception 'not-your-turn'; end if;

    select * into cell from public.jeopardy_cells where room_id = room.id and id = p_cell_id and not used;
    if not found then raise exception 'invalid-move'; end if;

    update public.jeopardy_rooms
      set active_cell = cell.id, attempt_player_id = seat.id, steal_queue = '{}', wager = null, deadline_at = null,
          phase = case when cell.is_special then 'wager' else 'question' end,
          message = case
            when cell.is_special then seat.name || ' encontró una apuesta especial.'
            else seat.name || ' responde por ' || (case when cell.is_double then cell.value * 2 else cell.value end) || ' puntos.'
          end
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- Se apuesta de cien en cien, entre 100 y lo que tenga quien apuesta o la
  -- casilla más alta del tablero, lo que sea mayor. Igual que `normalizeWager`.
  create or replace function public.set_jeopardy_wager(p_code text, p_wager integer)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    top_points integer;
    amount integer;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if room.phase <> 'wager' then raise exception 'invalid-move'; end if;
    if room.turn_player_id is distinct from seat.id then raise exception 'not-your-turn'; end if;

    select greatest(seat.score, max(value)) into top_points from public.jeopardy_cells where room_id = room.id;
    amount := greatest(100, least(top_points, round(coalesce(p_wager, 100) / 100.0)::integer * 100));
    update public.jeopardy_rooms
      set wager = amount, phase = 'question', deadline_at = null,
          message = seat.name || ' apuesta ' || amount || ' puntos.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  create or replace function public.mark_jeopardy_answered(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if room.phase <> 'question' then raise exception 'invalid-move'; end if;
    if room.attempt_player_id is distinct from seat.id then raise exception 'not-your-turn'; end if;

    update public.jeopardy_rooms
      set phase = 'judging', deadline_at = null, message = seat.name || ' dio su respuesta. El anfitrión decide.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- Cada intento suma o resta el valor en juego, también al robar. Un fallo abre
  -- el robo a quienes todavía no lo intentaron; sin nadie más, se cierra.
  create or replace function public.judge_jeopardy_answer(p_code text, p_correct boolean)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    cell public.jeopardy_cells%rowtype;
    attempt public.jeopardy_players%rowtype;
    points integer;
    queue uuid[];
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if not seat.is_host then raise exception 'not-host'; end if;
    if room.phase <> 'judging' or p_correct is null then raise exception 'invalid-move'; end if;

    select * into cell from public.jeopardy_cells where room_id = room.id and id = room.active_cell;
    if not found then raise exception 'invalid-move'; end if;
    select * into attempt from public.jeopardy_players where id = room.attempt_player_id;
    if not found then raise exception 'invalid-move'; end if;

    points := case when cell.is_special then room.wager when cell.is_double then cell.value * 2 else cell.value end;
    update public.jeopardy_players
      set score = score + case when p_correct then points else -points end
      where id = attempt.id;

    if p_correct then
      perform public.jeopardy_close_clue(room.id, attempt.name || ' acertó y suma ' || points || '.');
      return public.jeopardy_snapshot(room.id);
    end if;

    -- Si falló quien eligió la casilla, el robo se abre a todos los demás; si
    -- falló quien robaba, siguen quienes todavía no lo intentaron.
    queue := case
      when attempt.id = room.turn_player_id then public.jeopardy_steal_order(room.id, attempt.id)
      else room.steal_queue
    end;
    if cardinality(queue) = 0 then
      perform public.jeopardy_close_clue(room.id, attempt.name || ' falló y pierde ' || points || '.');
      return public.jeopardy_snapshot(room.id);
    end if;

    update public.jeopardy_rooms
      set phase = 'steal', steal_queue = queue, attempt_player_id = null, deadline_at = null,
          message = attempt.name || ' pierde ' || points || '. Roba quien lo pida primero.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- Todos los que pueden robar lo piden a la vez. La sala bloqueada deja pasar
  -- una sola petición: esa se queda el intento y lo gasta, y a las que llegan
  -- detrás les responde `steal-taken`.
  create or replace function public.accept_jeopardy_steal(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    cell public.jeopardy_cells%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if room.phase <> 'steal' then
      if room.phase in ('question', 'judging') and room.attempt_player_id is distinct from room.turn_player_id then
        raise exception 'steal-taken';
      end if;
      raise exception 'invalid-move';
    end if;
    if not (seat.id = any(room.steal_queue)) then raise exception 'not-your-turn'; end if;

    select * into cell from public.jeopardy_cells where room_id = room.id and id = room.active_cell;
    update public.jeopardy_rooms
      set phase = 'question', attempt_player_id = seat.id,
          steal_queue = array_remove(room.steal_queue, seat.id), deadline_at = null,
          message = seat.name || ' intenta robar por '
            || (case when cell.is_special then room.wager when cell.is_double then cell.value * 2 else cell.value end)
            || ' puntos.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  create or replace function public.pass_jeopardy_steal(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
    queue uuid[];
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if room.phase <> 'steal' then raise exception 'invalid-move'; end if;
    if not (seat.id = any(room.steal_queue)) then raise exception 'not-your-turn'; end if;

    -- Quien pasa se retira; la cuenta regresiva, si la hay, sigue para los demás.
    queue := array_remove(room.steal_queue, seat.id);
    if cardinality(queue) = 0 then
      perform public.jeopardy_close_clue(room.id, seat.name || ' dejó pasar el robo.');
      return public.jeopardy_snapshot(room.id);
    end if;

    update public.jeopardy_rooms
      set steal_queue = queue, message = seat.name || ' pasa.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- ------------------------------------------------------------ anfitrión ---

  -- Diez segundos para quien tiene la jugada: elegir, apostar, responder o robar.
  -- Al vencer mientras responde, el anfitrión pasa a juzgar; en las demás fases
  -- el turno termina como si lo terminara él. Lo aplica `jeopardy_lock_room` en
  -- la primera jugada o lectura que llega después.
  -- Mientras juzga no hay nada que apurar. Pedirla otra vez la reinicia. Los
  -- diez segundos repiten COUNTDOWN_SECONDS de `jeopardy.ts`.
  create or replace function public.start_jeopardy_countdown(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if not seat.is_host then raise exception 'not-host'; end if;
    if room.phase not in ('board', 'wager', 'question', 'steal') then raise exception 'invalid-move'; end if;

    update public.jeopardy_rooms
      set deadline_at = clock_timestamp() + interval '10 seconds', message = 'El anfitrión dio 10 segundos.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- El anfitrión termina el turno en cualquier momento, con o sin casilla abierta.
  create or replace function public.end_jeopardy_turn(p_code text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if not seat.is_host then raise exception 'not-host'; end if;
    if room.phase not in ('board', 'wager', 'question', 'judging', 'steal') then raise exception 'invalid-move'; end if;

    perform public.jeopardy_finish_turn(room.id, 'El anfitrión terminó el turno.');
    return public.jeopardy_snapshot(room.id);
  end;
  $$;

  -- Pregunta y respuesta de cualquier casilla, usada o no, para el anfitrión.
  create or replace function public.get_jeopardy_cell(p_code text, p_cell_id text)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path = public
  as $$
  declare
    target_room_id uuid;
    seat public.jeopardy_players%rowtype;
    cell public.jeopardy_cells%rowtype;
  begin
    select id into target_room_id from public.jeopardy_rooms where code = upper(p_code) and closed_at is null;
    if not found then raise exception 'room-not-found'; end if;
    seat := public.jeopardy_seat(target_room_id);
    if not seat.is_host then raise exception 'not-host'; end if;

    select * into cell from public.jeopardy_cells where room_id = target_room_id and id = p_cell_id;
    if not found then raise exception 'invalid-move'; end if;
    return jsonb_build_object(
      'id', cell.id,
      'category', cell.question_category,
      'value', cell.value,
      'special', cell.is_special,
      'double', cell.is_double,
      'prompt', cell.prompt,
      'answer', cell.answer,
      'reference', nullif(cell.reference, '')
    );
  end;
  $$;

  -- ---------------------------------------------------------- otra ronda ---

  -- «Jugar otra vez» en la misma sala: vuelve a la espera con el tablero nuevo,
  -- conserva a quienes siguen dentro y deja los puntos en cero. El anfitrión
  -- vuelve a conducir aunque la ronda anterior la jugara solo.
  create or replace function public.reopen_jeopardy_room(
    p_code text,
    p_rows integer,
    p_columns integer,
    p_double_count integer
  )
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    seat := public.jeopardy_seat(room.id);
    if not seat.is_host then raise exception 'not-host'; end if;
    if room.status = 'playing' then raise exception 'room-started'; end if;

    delete from public.jeopardy_cells where room_id = room.id;
    update public.jeopardy_players set score = 0 where room_id = room.id;
    update public.jeopardy_players set plays = false, color = null where id = seat.id;
    update public.jeopardy_rooms
      set board_rows = p_rows, board_columns = p_columns, double_count = p_double_count,
          status = 'waiting', phase = 'waiting', started_at = null,
          turn_player_id = null, active_cell = null, attempt_player_id = null, steal_queue = '{}',
          wager = null, deadline_at = null, message = 'Sala lista para otra ronda.'
      where id = room.id;
    return public.jeopardy_snapshot(room.id);
  exception when check_violation or not_null_violation then
    raise exception 'invalid-move';
  end;
  $$;

  create or replace function public.close_jeopardy_room(p_code text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    if room.host_id is distinct from auth.uid() then raise exception 'not-host'; end if;
    update public.jeopardy_rooms set closed_at = now() where id = room.id;
  end;
  $$;

  -- El invitado deja su puesto mientras no haya un tablero en juego: retirarse a
  -- mitad de ronda rompería el orden de turnos de los demás.
  create or replace function public.leave_jeopardy_room(p_code text)
  returns void
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    room public.jeopardy_rooms%rowtype;
    seat public.jeopardy_players%rowtype;
  begin
    room := public.jeopardy_lock_room(p_code);
    select * into seat from public.jeopardy_players where room_id = room.id and user_id = auth.uid();
    if not found then return; end if;
    if seat.is_host then raise exception 'not-host'; end if;
    if room.status = 'playing' then raise exception 'room-started'; end if;

    delete from public.jeopardy_players where id = seat.id;
    update public.jeopardy_rooms set message = seat.name || ' salió de la sala.' where id = room.id;
  end;
  $$;

  -- ------------------------------------------------------------ permisos ---

  alter table public.jeopardy_rooms enable row level security;
  alter table public.jeopardy_players enable row level security;
  alter table public.jeopardy_cells enable row level security;

  -- Las preguntas no se leen nunca directamente, y las otras dos solo se leen:
  -- escribirlas es cosa de las funciones de arriba.
  revoke all on public.jeopardy_cells from anon, authenticated;
  revoke all on public.jeopardy_rooms, public.jeopardy_players from anon;
  revoke insert, update, delete, truncate on public.jeopardy_rooms, public.jeopardy_players from authenticated;
  grant select on public.jeopardy_rooms, public.jeopardy_players to authenticated;

  -- Leerlas sirve para que Realtime avise de cada cambio; la pantalla vuelve a
  -- pedir la sala a `get_jeopardy_room`, que es la que decide qué se ve.
  drop policy if exists "jeopardy_rooms_select_open" on public.jeopardy_rooms;
  create policy "jeopardy_rooms_select_open" on public.jeopardy_rooms
    for select to authenticated
    using (closed_at is null);

  drop policy if exists "jeopardy_players_select_open_room" on public.jeopardy_players;
  create policy "jeopardy_players_select_open_room" on public.jeopardy_players
    for select to authenticated
    using (exists (select 1 from public.jeopardy_rooms r where r.id = room_id and r.closed_at is null));

  revoke all on function public.jeopardy_snapshot(uuid) from public, anon, authenticated;
  revoke all on function public.jeopardy_lock_room(text) from public, anon, authenticated;
  revoke all on function public.jeopardy_seat(uuid) from public, anon, authenticated;
  revoke all on function public.jeopardy_next_player(uuid, uuid) from public, anon, authenticated;
  revoke all on function public.jeopardy_steal_order(uuid, uuid) from public, anon, authenticated;
  revoke all on function public.jeopardy_close_clue(uuid, text) from public, anon, authenticated;
  revoke all on function public.jeopardy_finish_turn(uuid, text) from public, anon, authenticated;

  revoke all on function public.create_jeopardy_room(integer, integer, integer, text) from public, anon;
  revoke all on function public.get_jeopardy_room(text) from public, anon;
  revoke all on function public.join_jeopardy_room(text, text, text) from public, anon;
  revoke all on function public.start_jeopardy_game(text, jsonb) from public, anon;
  revoke all on function public.select_jeopardy_cell(text, text) from public, anon;
  revoke all on function public.set_jeopardy_wager(text, integer) from public, anon;
  revoke all on function public.mark_jeopardy_answered(text) from public, anon;
  revoke all on function public.judge_jeopardy_answer(text, boolean) from public, anon;
  revoke all on function public.accept_jeopardy_steal(text) from public, anon;
  revoke all on function public.pass_jeopardy_steal(text) from public, anon;
  revoke all on function public.start_jeopardy_countdown(text) from public, anon;
  revoke all on function public.end_jeopardy_turn(text) from public, anon;
  revoke all on function public.get_jeopardy_cell(text, text) from public, anon;
  revoke all on function public.reopen_jeopardy_room(text, integer, integer, integer) from public, anon;
  revoke all on function public.close_jeopardy_room(text) from public, anon;
  revoke all on function public.leave_jeopardy_room(text) from public, anon;

  grant execute on function public.create_jeopardy_room(integer, integer, integer, text) to authenticated;
  grant execute on function public.get_jeopardy_room(text) to authenticated;
  grant execute on function public.join_jeopardy_room(text, text, text) to authenticated;
  grant execute on function public.start_jeopardy_game(text, jsonb) to authenticated;
  grant execute on function public.select_jeopardy_cell(text, text) to authenticated;
  grant execute on function public.set_jeopardy_wager(text, integer) to authenticated;
  grant execute on function public.mark_jeopardy_answered(text) to authenticated;
  grant execute on function public.judge_jeopardy_answer(text, boolean) to authenticated;
  grant execute on function public.accept_jeopardy_steal(text) to authenticated;
  grant execute on function public.pass_jeopardy_steal(text) to authenticated;
  grant execute on function public.start_jeopardy_countdown(text) to authenticated;
  grant execute on function public.end_jeopardy_turn(text) to authenticated;
  grant execute on function public.get_jeopardy_cell(text, text) to authenticated;
  grant execute on function public.reopen_jeopardy_room(text, integer, integer, integer) to authenticated;
  grant execute on function public.close_jeopardy_room(text) to authenticated;
  grant execute on function public.leave_jeopardy_room(text) to authenticated;

  -- -------------------------------------------------------------- realtime ---

  alter table public.jeopardy_rooms replica identity full;
  alter table public.jeopardy_players replica identity full;

  do $$
  begin
    begin
      alter publication supabase_realtime add table public.jeopardy_rooms;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.jeopardy_players;
    exception when duplicate_object then null;
    end;
  end
  $$;
