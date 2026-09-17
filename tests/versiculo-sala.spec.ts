import { mkdir, readFile } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

const setupUrl = './#/juegos/versiculo-o-inventiculo';

test.beforeEach(async ({ page }) => withoutBackend(page));
const roomKey = 'chairo:versiculo-o-inventiculo:room';
const roomUrl = (code: string): string => `./#/juegos/versiculo-o-inventiculo/sala/${code}`;
const joinUrl = (code: string): string =>
  `http://127.0.0.1:4173/chairo/browser/#/juegos/versiculo-o-inventiculo/unirse/${code}`;

const openRoom = {
  code: 'ABCD',
  setup: { difficulty: 'medium', questionCount: 10, hostRole: 'player', questionSeconds: 12, revealSeconds: 5 },
  participants: [{ id: 'host', name: 'Tú', role: 'host', status: 'ready', color: 'yellow', plays: true }],
  createdAt: 1_758_000_000_000
};

const guest = { id: 'guest-1', name: 'Leo', role: 'guest', status: 'ready', color: 'turquoise', plays: true };

/** Deja una sala abierta antes de cargar la página, como si acabara de crearse. */
async function withOpenRoom(page: Page, room: unknown = openRoom): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [roomKey, JSON.stringify(room)] as const
  );
}

/**
 * Simula al invitado que la pantalla de unión creará con `joinRoom`: otra
 * pestaña escribe la sala y el adaptador en memoria la recoge por `storage`.
 */
async function addReadyGuest(context: BrowserContext, page: Page): Promise<void> {
  const current = await page.evaluate(key => localStorage.getItem(key), roomKey);
  const room = JSON.parse(current!) as typeof openRoom;
  const updated = { ...room, participants: [...room.participants, guest] };

  const other = await context.newPage();
  await other.goto('./');
  await other.evaluate(
    ([key, value]) => localStorage.setItem(key!, value!),
    [roomKey, JSON.stringify(updated)] as const
  );
  await other.close();
}

test('crear sala guarda la configuración, genera un código válido y abre la sala', async ({ page }) => {
  await page.goto(setupUrl);
  await page.locator('label[for="difficulty-hard"]').click();
  await page.getByLabel('Tu nombre').fill('  Marta ');
  await page.getByRole('button', { name: 'Crear sala' }).click();

  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  const code = page.url().split('/').pop()!;
  expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
  expect(code).not.toMatch(/[01OI]/);

  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
  await expect(page.locator('.room-code-value')).toHaveText(code);
  await expect(page.getByText('Anfitrión · jugando')).toBeVisible();
  await expect(page.getByText('Difícil · 10 preguntas')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Marta' })).toContainText('anfitrión');
  await expect(page.getByText('Esperando…')).toBeVisible();

  const stored = JSON.parse((await page.evaluate(key => localStorage.getItem(key), roomKey))!) as typeof openRoom;
  expect(stored.code).toBe(code);
  expect(stored.setup).toEqual({ difficulty: 'hard', questionCount: 10, hostRole: 'player', questionSeconds: 12, revealSeconds: 5 });
  expect(stored.participants).toHaveLength(1);
  expect(stored.participants[0]?.name).toBe('Marta');

  // La sala sobrevive a una recarga: el código compartido sigue siendo válido.
  await page.reload();
  await expect(page.locator('.room-code-value')).toHaveText(code);
  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
});

test('el QR contiene la URL de unión a esa sala', async ({ page }) => {
  const golden = JSON.parse(
    await readFile('tests/fixtures/qr-join-abcd.json', 'utf8')
  ) as { content: string; version: number; size: number; rows: string[] };
  expect(golden.content).toBe(joinUrl('ABCD'));

  await withOpenRoom(page);
  await page.goto(roomUrl('ABCD'));

  const qr = page.locator('chairo-qr-code svg');
  await expect(qr).toHaveAttribute('data-qr-version', String(golden.version));
  await expect(qr).toHaveAttribute('aria-label', /A B C D/);

  const path = (await qr.locator('path').getAttribute('d'))!;
  const dark = new Set(
    [...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, x, y]) => `${Number(y) - 4},${Number(x) - 4}`)
  );
  const rendered = Array.from({ length: golden.size }, (_, row) =>
    Array.from({ length: golden.size }, (_, column) => (dark.has(`${row},${column}`) ? '1' : '0')).join('')
  );
  expect(rendered).toEqual(golden.rows);
  expect(dark.size).toBe(golden.rows.join('').split('1').length - 1);
});

test('compartir copia la invitación y lo anuncia', async ({ page }) => {
  await withOpenRoom(page);
  await page.addInitScript(() => {
    (window as unknown as { copied: string[] }).copied = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string): Promise<void> => {
          (window as unknown as { copied: string[] }).copied.push(text);
        }
      }
    });
  });
  await page.goto(roomUrl('ABCD'));

  await page.getByRole('button', { name: 'Compartir invitación' }).click();
  await expect(page.getByText('Invitación copiada.')).toBeVisible();

  const copied = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain(joinUrl('ABCD'));
  expect(copied[0]).toContain('ABCD');
});

test('si el portapapeles falla, la invitación explica cómo seguir', async ({ page }) => {
  await withOpenRoom(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (): Promise<void> => Promise.reject(new Error('denied')) }
    });
  });
  await page.goto(roomUrl('ABCD'));

  await page.getByRole('button', { name: 'Compartir invitación' }).click();
  await expect(page.getByText('No pudimos copiar la invitación. Dicta el código A B C D.')).toBeVisible();
});

test('comenzar se habilita cuando entra otra persona lista', async ({ page, context }) => {
  await withOpenRoom(page);
  await page.goto(roomUrl('ABCD'));

  const start = page.getByRole('button', { name: 'Comenzar partida' });
  await expect(start).toBeDisabled();
  await expect(page.getByText('Se activa cuando entre otra persona.')).toBeVisible();
  await expect(page.locator('.sr-only[role="status"]')).toHaveText('1 participante en la sala. Esperando participantes.');

  await addReadyGuest(context, page);

  await expect(start).toBeEnabled();
  await expect(page.getByRole('listitem').filter({ hasText: 'Leo' })).toContainText('listo');
  await expect(page.locator('.sr-only[role="status"]')).toHaveText('2 participantes en la sala. Ya puedes comenzar la partida.');

  await start.click();
  await expect(page).toHaveURL(/partida\/ABCD$/);
  await expect(page.getByText('Todos listos')).toBeVisible();
});

test('cerrar la sala vuelve a la configuración y la sala deja de existir', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(roomUrl('ABCD'));

  await page.getByRole('button', { name: 'Cerrar sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo$/);
  await expect(page.getByRole('heading', { name: '¿Versículo o inventículo?' })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), roomKey)).toBeNull();

  await page.goto(roomUrl('ABCD'));
  await expect(page.getByRole('heading', { name: 'No encontramos la sala ABCD' })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('heading', { name: 'No encontramos la sala ABCD' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a la configuración' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo$/);
});

test('un código imposible no deja la sala cargando', async ({ page }) => {
  await page.goto(roomUrl('0OI1'));
  await expect(page.getByRole('heading', { name: 'Sala no disponible', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('la sala salta desde el anfitrión que solo conduce', async ({ page }) => {
  await withOpenRoom(page, {
    ...openRoom,
    setup: { difficulty: 'extreme', questionCount: 30, hostRole: 'host-only', questionSeconds: 12, revealSeconds: 5 },
    participants: [{ ...openRoom.participants[0]!, plays: false }]
  });
  await page.goto(roomUrl('ABCD'));

  await expect(page.getByText('Solo anfitrión')).toBeVisible();
  await expect(page.getByText('Extrema · 30 preguntas')).toBeVisible();
});

for (const width of [320, 390, 941, 1440]) {
  test(`la sala es accesible y responsiva a ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: width === 941 ? 1672 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    await withOpenRoom(page);
    await page.goto(roomUrl('ABCD'));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
    await expect(page.locator('chairo-qr-code svg')).toBeVisible();

    const qr = (await page.locator('chairo-qr-code svg').boundingBox())!;
    expect(qr.width).toBeGreaterThanOrEqual(96);
    for (const name of ['Compartir invitación', 'Comenzar partida', 'Cerrar sala']) {
      const bounds = (await page.getByRole('button', { name }).boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(bounds.width).toBeGreaterThanOrEqual(48);
    }
    const back = (await page.getByRole('button', { name: 'Cerrar la sala y volver a la configuración' }).boundingBox())!;
    expect(back.height).toBeGreaterThanOrEqual(48);
    expect(back.width).toBeGreaterThanOrEqual(48);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(a11y.violations).toEqual([]);

    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('.impeccable/review', { recursive: true });
    await page.screenshot({ path: `.impeccable/review/sala-width-${width}.png`, fullPage: true, animations: 'disabled' });

    if (width === 390) {
      await addReadyGuest(context, page);
      await expect(page.getByRole('button', { name: 'Comenzar partida' })).toBeEnabled();
      await page.screenshot({ path: '.impeccable/review/sala-lista-390.png', fullPage: true, animations: 'disabled' });
    }

    expect(errors).toEqual([]);
  });
}

test('la sala cubre teclado, foco visible, movimiento reducido y colores forzados', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withOpenRoom(page);
  await page.goto(roomUrl('ABCD'));
  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir a la sala' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cerrar la sala y volver a la configuración' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Compartir invitación' })).toBeFocused();

  const share = page.getByRole('button', { name: 'Compartir invitación' });
  expect(await share.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');

  await page.emulateMedia({ forcedColors: 'active' });
  await share.focus();
  expect(await share.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await expect(page.locator('chairo-qr-code svg')).toBeVisible();
});
