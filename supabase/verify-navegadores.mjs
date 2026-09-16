// La prueba de dos navegadores contra el proyecto real, hecha guion. Dos
// contextos distintos son dos sesiones anónimas distintas, que es lo que
// separa al anfitrión del invitado.
//
//   pnpm run build
//   python3 -m http.server 4173 --bind 127.0.0.1 --directory dist &
//   node supabase/verify-navegadores.mjs
//
// Vive fuera de `tests/` a propósito: la suite de Playwright no toca la red.
// Este guion sí, y por eso crea una sala de verdad y la borra al terminar,
// pase lo que pase, para no dejar su código reservado.
//
// Lo que no cubre y sigue siendo de mano: escanear el QR con un teléfono.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const local = `${homedir()}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(local) ? local : undefined);
const BASE = 'http://127.0.0.1:4173/chairo/browser/';
const config = JSON.parse(readFileSync(new URL('../public/supabase.json', import.meta.url), 'utf8'));

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ executablePath });
const a = await browser.newContext({ reducedMotion: 'reduce' });
const b = await browser.newContext({ reducedMotion: 'reduce' });
const anfitrion = await a.newPage();
const invitado = await b.newPage();
let code = '';

try {
  await anfitrion.goto(`${BASE}#/juegos/versiculo-o-inventiculo`);
  await anfitrion.getByRole('button', { name: 'Crear sala' }).click();
  await anfitrion.waitForURL(/\/sala\/[2-9A-HJ-NP-Z]{4}$/, { timeout: 20_000 });
  code = anfitrion.url().split('/').pop();
  check('el anfitrión crea la sala en el proyecto real', /^[2-9A-HJ-NP-Z]{4}$/.test(code), code);

  await anfitrion.locator('chairo-qr-code svg').waitFor({ timeout: 20_000 });
  const caja = await anfitrion.locator('chairo-qr-code svg').boundingBox();
  check('la sala muestra el QR de la invitación', caja.width >= 96, `${Math.round(caja.width)}px`);

  await invitado.goto(`${BASE}#/juegos/versiculo-o-inventiculo/unirse/${code}`);
  await invitado.getByText(/Sala encontrada/).waitFor({ timeout: 20_000 });
  await invitado.locator('#guest-name').fill('Leo');
  await invitado.locator('label[for="color-turquoise"]').click();
  await invitado.getByRole('button', { name: 'Unirme' }).click();
  await invitado.waitForURL(new RegExp(`/sala/${code}$`), { timeout: 20_000 });
  check('el invitado entra desde otra sesión anónima', true);

  await anfitrion.getByRole('listitem').filter({ hasText: 'Leo' }).waitFor({ timeout: 20_000 });
  check('el invitado aparece en la pantalla del anfitrión sin recargar', true);

  const nota = invitado.getByText('Esperando a que el anfitrión comience', { exact: true });
  await nota.waitFor({ timeout: 20_000 });
  const espera = await nota.isVisible();
  const mandos = await invitado.getByRole('button', { name: 'Comenzar partida' }).count()
    + await invitado.getByRole('button', { name: 'Compartir invitación' }).count()
    + await invitado.getByRole('button', { name: 'Cerrar sala' }).count();
  check('el invitado espera y no ve ningún mando del anfitrión', espera && mandos === 0, `mandos: ${mandos}`);

  await invitado.reload();
  await invitado.getByRole('heading', { name: 'Ya estás dentro', level: 1 }).waitFor({ timeout: 20_000 });
  const rol = await invitado.getByText('Leo · Turquesa').isVisible();
  check('recargar no expulsa al invitado ni le cambia el asiento', rol);

  await invitado.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
  await invitado.waitForURL(/\/unirse$/, { timeout: 20_000 });
  await anfitrion.getByRole('listitem').filter({ hasText: 'Leo' }).waitFor({ state: 'detached', timeout: 20_000 });
  const sigueAbierta = await anfitrion.getByRole('heading', { name: 'Sala lista', level: 1 }).isVisible();
  check('salir retira solo su asiento y la sala sigue en pie', sigueAbierta);

  await anfitrion.getByRole('button', { name: 'Cerrar sala' }).click();
  await anfitrion.waitForTimeout(3_000);
  const cerrada = /versiculo-o-inventiculo$/.test(anfitrion.url());
  const aviso = await anfitrion.getByRole('alert').count()
    ? await anfitrion.getByRole('alert').textContent()
    : '';
  check('«Cerrar sala» cierra la sala de verdad', cerrada, cerrada ? '' : `aviso: ${aviso}`);
} finally {
  // No dejar salas abiertas reteniendo su código, pase lo que pase.
  if (code) {
    const token = await anfitrion.evaluate(key => {
      try { return JSON.parse(localStorage.getItem(key) ?? 'null')?.access_token ?? null; } catch { return null; }
    }, 'chairo:sesion');
    if (token) {
      const response = await fetch(`${config.url}/rest/v1/rooms?code=eq.${code}`, {
        method: 'DELETE',
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, Prefer: 'return=representation' }
      });
      console.log(`limpieza de ${code}: http ${response.status}`);
    } else {
      console.log(`limpieza de ${code}: sin token, revísala a mano`);
    }
  }
  await browser.close();
}

console.log(failures === 0 ? '\nTodo correcto.' : `\n${failures} comprobaciones fallaron.`);
process.exit(failures === 0 ? 0 : 1);
