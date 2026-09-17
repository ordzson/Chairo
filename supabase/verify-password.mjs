import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../public/supabase.json', import.meta.url), 'utf8'));
const base = config.url;
const key = config.publishableKey;
let failures = 0;
let code = '';

const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function signIn() {
  const response = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: '{}'
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.msg ?? `auth ${response.status}`);
  return body.access_token;
}

async function rpc(token, name, body) {
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message ?? `${name}: http ${response.status}`);
  return data;
}

const host = await signIn();
const guest = await signIn();
const words = ['Fixture Alfa', 'Fixture Beta', 'Fixture Gamma', 'Fixture Delta'];

try {
  const created = await rpc(host, 'create_password_room', { p_host_name: 'Verificador A', p_round_seconds: 30 });
  code = created.code;
  check('crear sala Password', /^[2-9A-HJ-NP-Z]{4}$/.test(code), code);
  const joined = await rpc(guest, 'join_password_room', { p_code: code, p_name: 'Verificador B', p_color: 'orange' });
  check('exactamente dos asientos', joined.players.length === 2, `${joined.players.length}`);
  await rpc(host, 'start_password_match', { p_code: code });
  await rpc(host, 'set_password_ready', { p_code: code, p_ready: true, p_words: words });
  const guestReady = await rpc(guest, 'set_password_ready', { p_code: code, p_ready: true, p_words: words });
  const hostView = await rpc(host, 'get_password_snapshot', { p_code: code });
  check('cada sesión recibe una palabra', Boolean(hostView.selfWord) && Boolean(guestReady.selfWord));
  check('las palabras son distintas', hostView.selfWord !== guestReady.selfWord);
  check('no se revela la palabra ajena', hostView.revealedEntries.length === 0 && guestReady.revealedEntries.length === 0);
  await new Promise(resolve => setTimeout(resolve, 3_200));
  const scoring = await rpc(host, 'end_password_round', { p_code: code });
  const results = scoring.players.map((player, index) => ({ participantId: player.id, guessed: index === 0 }));
  const scored = await rpc(host, 'score_password_round', { p_code: code, p_results: results });
  const repeated = await rpc(host, 'score_password_round', { p_code: code, p_results: results });
  check('las palabras se revelan al anotar', scored.revealedEntries.length === 2);
  check('guardar dos veces no duplica', JSON.stringify(scored.players) === JSON.stringify(repeated.players));
  check('resultado 1/0 atómico', scored.players.reduce((sum, player) => sum + player.score, 0) === 1);
} finally {
  if (code) {
    try { await rpc(host, 'close_password_room', { p_code: code }); } catch (error) { console.log(`limpieza pendiente ${code}: ${error.message}`); }
  }
}

console.log(failures === 0 ? '\nPassword correcto.' : `\n${failures} comprobaciones fallaron.`);
process.exit(failures === 0 ? 0 : 1);

