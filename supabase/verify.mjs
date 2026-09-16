// Comprueba contra el proyecto real las reglas que promete schema.sql: sesión
// anónima, creación de sala, entrada de invitado, nombre y color repetidos,
// sala llena a los seis asientos y aislamiento RLS entre dispositivos.
//
// Cada alta de participante usa una sesión anónima nueva, porque un mismo
// dispositivo solo puede ocupar un asiento y sus intentos rebotarían por esa
// razón en lugar de por la que se está comprobando.
//
//   node supabase/verify.mjs
//
// Usa la misma configuración que la aplicación y toca la base de verdad:
// crea filas, las comprueba y borra la sala al terminar. No lo apuntes a un
// proyecto con partidas en curso.
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../public/supabase.json', import.meta.url), 'utf8'));
const URL_BASE = config.url;
const KEY = config.publishableKey;
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function signIn() {
  const response = await fetch(`${URL_BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sesión anónima: ${body.msg ?? response.status}`);
  return body.access_token;
}

async function rest(token, path, init = {}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers
    }
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

const host = await signIn();
const guest = await signIn();
check('dos sesiones anónimas distintas', host !== guest);

const room = await rest(host, 'rooms', {
  method: 'POST',
  body: JSON.stringify({ code, difficulty: 'medium', question_count: 10, host_role: 'player' })
});
check('el anfitrión abre la sala', room.status === 201, `http ${room.status}`);
const roomId = room.body?.[0]?.id;

const hostSeat = await rest(host, 'participants', {
  method: 'POST',
  body: JSON.stringify({ room_id: roomId, name: 'Tú', color: 'yellow', role: 'host', status: 'ready', plays: true })
});
check('el anfitrión ocupa su asiento', hostSeat.status === 201, `http ${hostSeat.status}`);

const found = await rest(guest, `rooms?select=id,code&code=eq.${code}&closed_at=is.null`);
check('el invitado encuentra la sala por código', found.body?.length === 1);

const joined = await rest(guest, 'participants', {
  method: 'POST',
  body: JSON.stringify({ room_id: roomId, name: 'Leo', color: 'turquoise', role: 'guest', status: 'ready', plays: true })
});
check('el invitado entra', joined.status === 201, `http ${joined.status}`);

const roster = await rest(host, `participants?select=name&room_id=eq.${roomId}&order=joined_at`);
check('el anfitrión ve a los dos', roster.body?.length === 2, JSON.stringify(roster.body?.map(p => p.name)));

// Cada alta viene de una sesión anónima nueva. Con el token del mismo invitado
// lo que rebotaría sería `participants_room_user_key` —un asiento por
// dispositivo— y no los índices de nombre y color, que son los que traduce
// `joinError()`.
const seat = async (name, color) => rest(await signIn(), 'participants', {
  method: 'POST',
  body: JSON.stringify({ room_id: roomId, name, color, role: 'guest', status: 'ready', plays: true })
});

const sameName = await seat('leo', 'orange');
check(
  'nombre repetido rechazado por el índice de nombre',
  sameName.body?.message?.includes('participants_room_name_key') === true,
  sameName.body?.message ?? ''
);

const sameColor = await seat('Otra', 'turquoise');
check(
  'color repetido rechazado por el índice de color',
  sameColor.body?.message?.includes('participants_room_color_key') === true,
  sameColor.body?.message ?? ''
);

const stealSeat = await rest(guest, `participants?room_id=eq.${roomId}&role=eq.host`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'Secuestrado' })
});
check('RLS impide editar el asiento ajeno', (stealSeat.body ?? []).length === 0, `http ${stealSeat.status}`);

const stealRoom = await rest(guest, `rooms?id=eq.${roomId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'playing' })
});
check('RLS impide que el invitado cambie la sala', (stealRoom.body ?? []).length === 0, `http ${stealRoom.status}`);

// Sala llena: cada invitado con su sesión y un color libre, hasta los seis
// asientos que permite el catálogo. El amarillo es del anfitrión y el turquesa
// de Leo, así que quedan estos cuatro.
for (const [index, color] of ['orange', 'blue', 'green', 'violet'].entries()) {
  const extra = await seat(`Invitado ${index}`, color);
  check(`el invitado de color ${color} entra`, extra.status === 201, extra.body?.message ?? `http ${extra.status}`);
}
const full = await rest(host, `participants?select=id&room_id=eq.${roomId}`);
check('la sala se llena hasta seis', full.body?.length === 6, `${full.body?.length} asientos`);

// El disparador corre antes que los índices, así que con la sala llena el
// séptimo recibe `room-full` aunque además pida un color ya tomado.
const seventh = await seat('Séptimo', 'violet');
check(
  'el séptimo recibe room-full y no un choque de color',
  seventh.body?.message?.includes('room-full') === true,
  seventh.body?.message ?? `http ${seventh.status}`
);

const closed = await rest(host, `rooms?id=eq.${roomId}`, {
  method: 'PATCH',
  body: JSON.stringify({ closed_at: new Date().toISOString() })
});
check('el anfitrión cierra la sala', closed.status === 200, `http ${closed.status} ${closed.body?.message ?? ''}`);

// Sin filtrar por `closed_at`: la política tiene que ser la que la esconda.
const gone = await rest(guest, `rooms?select=id&code=eq.${code}`);
check('la sala cerrada deja de verse para el invitado', gone.body?.length === 0, JSON.stringify(gone.body));

// Y el anfitrión sigue viéndola, que es justo lo que le permite cerrarla.
const mine = await rest(host, `rooms?select=id,closed_at&code=eq.${code}`);
check('el anfitrión sigue viendo la sala que cerró', mine.body?.length === 1, `${mine.body?.length} filas`);

await rest(host, `rooms?id=eq.${roomId}`, { method: 'DELETE' });
console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} comprobaciones fallaron.`);
process.exit(failures === 0 ? 0 : 1);
