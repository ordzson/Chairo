-- Ejecutar en el SQL Editor de Supabase antes de usar Sistemas.
-- Requiere el esquema de Jeopardy instalado; conserva las salas existentes.
begin;

alter table public.jeopardy_rooms add column if not exists topic text not null default 'biblia'
  check (topic in ('biblia', 'sistemas'));

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
      'doubleCount', room.double_count, 'topic', room.topic
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

drop function if exists public.create_jeopardy_room(integer, integer, integer, text);
drop function if exists public.reopen_jeopardy_room(text, integer, integer, integer);

create or replace function public.create_jeopardy_room(
  p_rows integer,
  p_columns integer,
  p_double_count integer,
  p_host_name text,
  p_topic text default 'biblia'
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
      insert into public.jeopardy_rooms (code, host_id, board_rows, board_columns, double_count, topic, message)
        values (new_code, auth.uid(), p_rows, p_columns, p_double_count, p_topic, 'Sala abierta.')
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

create or replace function public.reopen_jeopardy_room(
  p_code text,
  p_rows integer,
  p_columns integer,
  p_double_count integer,
  p_topic text default 'biblia'
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
    set board_rows = p_rows, board_columns = p_columns, double_count = p_double_count, topic = p_topic,
        status = 'waiting', phase = 'waiting', started_at = null,
        turn_player_id = null, active_cell = null, attempt_player_id = null, steal_queue = '{}',
        wager = null, deadline_at = null, message = 'Sala lista para otra ronda.'
    where id = room.id;
  return public.jeopardy_snapshot(room.id);
exception when check_violation or not_null_violation then
  raise exception 'invalid-move';
end;
$$;

revoke all on function public.create_jeopardy_room(integer, integer, integer, text, text) from public, anon;
revoke all on function public.reopen_jeopardy_room(text, integer, integer, integer, text) from public, anon;
grant execute on function public.create_jeopardy_room(integer, integer, integer, text, text) to authenticated;
grant execute on function public.reopen_jeopardy_room(text, integer, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;
