import { mkdir } from 'node:fs/promises';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

test.beforeEach(async ({ page }) => withoutBackend(page));

const roomKey = 'chairo:versiculo-o-inventiculo:room';
const joinUrl = (code?: string): string =>
  `./#/juegos/versiculo-o-inventiculo/unirse${code ? `/${code}` : ''}`;
const roomUrl = (code: string): string => `./#/juegos/versiculo-o-inventiculo/sala/${code}`;

type Seat = { id: string; name: string; role: string; status: string; color: string; plays: boolean };

const host: Seat = { id: 'host', name: 'Tú', role: 'host', status: 'ready', color: 'yellow', plays: true };

const openRoom = {
  code: 'ABCD',
  setup: { difficulty: 'medium', questionCount: 10, hostRole: 'player' },
  participants: [host],
  createdAt: 1_758_000_000_000
};

const guestSeat = (index: number, name: string, color: string): Seat =>
  ({ id: `guest-${index}`, name, role: 'guest', status: 'ready', color, plays: true });

/**
 * Deja una sala abierta antes de abrir la entrada, como si el anfitrión la
 * tuviera en pantalla. Se escribe una sola vez y no en cada navegación: al
 * recargar tiene que sobrevivir lo que el invitado acaba de hacer.
 */
async function withOpenRoom(page: Page, participants: Seat[] = [host]): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key!, value!),
    [roomKey, JSON.stringify({ ...openRoom, participants })] as const
  );
}

/** Escribe la sala desde otro documento, que es como llega un cambio ajeno. */
async function writeRoomElsewhere(context: BrowserContext, participants: Seat[]): Promise<void> {
  const other = await context.newPage();
  await other.goto('./');
  await other.evaluate(
    ([key, value]) => localStorage.setItem(key!, value!),
    [roomKey, JSON.stringify({ ...openRoom, participants })] as const
  );
  await other.close();
}

async function fillGuest(page: Page, name: string, color: string): Promise<void> {
  await page.locator('#guest-name').fill(name);
  await page.locator(`label[for="color-${color}"]`).click();
}

test('el enlace del QR llega con el código puesto y encuentra la sala', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ABCD'));

  await expect(page.getByRole('heading', { name: 'Entrar a la sala', level: 1 })).toBeVisible();
  await expect(page.locator('#room-code')).toHaveValue('ABCD');
  await expect(page.getByText('Sala encontrada · Media · 10 preguntas · quedan 5 colores libres')).toBeVisible();
  await expect(page.locator('.sr-only[role="status"]'))
    .toHaveText('Sala A B C D encontrada. Media · 10 preguntas · quedan 5 colores libres.');
});

test('el código también se escribe a mano y se busca solo al completarlo', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl());

  await expect(page.locator('#room-code')).toHaveValue('');
  await expect(page.locator('.room-found')).toHaveCount(0);

  await page.locator('#room-code').pressSequentially('abcd');
  await expect(page.locator('#room-code')).toHaveValue('ABCD');
  await expect(page.getByText(/Sala encontrada/)).toBeVisible();
});

test('el campo rechaza los caracteres ambiguos y explica por qué', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl());

  // Tecleado, cada carácter rechazado se explica en el momento.
  await page.locator('#room-code').pressSequentially('0O1I');
  await expect(page.locator('#room-code')).toHaveValue('');
  await expect(page.locator('#code-notice'))
    .toHaveText('El código no usa «I». Solo letras y números sin parejas que se confundan al dictarlas: nunca lleva 0, 1, I ni O.');

  // Pegado de golpe, los nombra todos y conserva lo que sí sirve.
  await page.locator('#room-code').fill('0OA1IB');
  await expect(page.locator('#room-code')).toHaveValue('AB');
  await expect(page.locator('#code-notice'))
    .toHaveText('El código no usa «0», «O», «1» ni «I». Solo letras y números sin parejas que se confundan al dictarlas: nunca lleva 0, 1, I ni O.');

  // Un código a medias no entra, y el error dice qué hacer con él.
  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page.getByRole('heading', { name: 'Ese código no puede existir' })).toBeVisible();
  await expect(page.getByText(/Son cuatro caracteres y nunca lleva 0, 1, I ni O/)).toBeVisible();
  await expect(page.locator('#room-code')).toBeFocused();
});

test('una sala que no existe se dice y se puede corregir sin recargar', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ZZZZ'));

  await expect(page.getByRole('heading', { name: 'No encontramos la sala ZZZZ' })).toBeVisible();
  await expect(page.getByText(/Pídelo otra vez o escanea el QR/)).toBeVisible();

  await page.locator('#room-code').fill('ABCD');
  await expect(page.getByText(/Sala encontrada/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No encontramos la sala ZZZZ' })).toHaveCount(0);
});

test('una sala completa no promete un asiento que no existe', async ({ page }) => {
  // Seis asientos con los seis colores: la sala llena y sin colores libres son
  // el mismo techo, porque cada color identifica a un asiento.
  await withOpenRoom(page, [
    host,
    guestSeat(1, 'Leo', 'orange'),
    guestSeat(2, 'Ana', 'turquoise'),
    guestSeat(3, 'Sam', 'blue'),
    guestSeat(4, 'Noa', 'green'),
    guestSeat(5, 'Iris', 'violet')
  ]);
  await page.goto(joinUrl('ABCD'));

  await expect(page.getByRole('heading', { name: 'La sala ABCD está completa' })).toBeVisible();
  await expect(page.getByText(/Pide al anfitrión que abra otra sala/)).toBeVisible();
});

test('los colores tomados se muestran no disponibles y no se pueden elegir', async ({ page }) => {
  await withOpenRoom(page, [host, guestSeat(1, 'Leo', 'turquoise'), guestSeat(2, 'Ana', 'violet')]);
  await page.goto(joinUrl('ABCD'));

  for (const color of ['yellow', 'turquoise', 'violet']) {
    await expect(page.locator(`#color-${color}`)).toBeDisabled();
    await expect(page.locator(`label[for="color-${color}"]`)).toContainText('No disponible');
  }
  for (const color of ['orange', 'blue', 'green']) {
    await expect(page.locator(`#color-${color}`)).toBeEnabled();
    await expect(page.locator(`label[for="color-${color}"]`)).not.toContainText('No disponible');
  }
  await expect(page.getByText('Quedan 3 colores libres en esta sala.')).toBeVisible();

  // El color se acompaña siempre de nombre y forma, nunca del color solo.
  const blue = page.locator('label[for="color-blue"]');
  await expect(blue).toContainText('Azul');
  await expect(blue.locator('chairo-color-mark svg')).toBeVisible();

  await blue.click();
  await expect(page.locator('#color-blue')).toBeChecked();
  await expect(blue).toContainText('Tu color');
});

test('un nombre repetido lo decide la sala, no el teléfono', async ({ page }) => {
  await withOpenRoom(page, [host, guestSeat(1, 'Leo', 'turquoise')]);
  await page.goto(joinUrl('ABCD'));

  await fillGuest(page, '  leo ', 'blue');
  await page.getByRole('button', { name: 'Unirme' }).click();

  await expect(page.getByRole('heading', { name: 'Ese nombre ya está en la sala' })).toBeVisible();
  await expect(page.getByText(/Cambia el tuyo —añade una inicial o un apodo—/)).toBeVisible();
  await expect(page.locator('#guest-name')).toBeFocused();
  await expect(page).toHaveURL(/unirse\/ABCD$/);

  await page.locator('#guest-name').fill('Leo B');
  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page).toHaveURL(/sala\/ABCD$/);
});

test('un color tomado en el último instante llega del servidor, no adelantado', async ({ page, context }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ABCD'));

  await fillGuest(page, 'Leo', 'blue');

  // Otra persona ocupa ese color entre la elección y el envío.
  await writeRoomElsewhere(context, [host, guestSeat(1, 'Ana', 'blue')]);
  await expect(page.locator('label[for="color-blue"]')).toContainText('No disponible');

  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page.getByRole('heading', { name: 'Ese color lo tomaron antes que tú' })).toBeVisible();
  await expect(page.locator('#color-blue')).not.toBeChecked();
  await expect(page).toHaveURL(/unirse\/ABCD$/);

  await page.locator('label[for="color-green"]').click();
  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page).toHaveURL(/sala\/ABCD$/);
});

test('unirse deja al invitado esperando, sin los mandos del anfitrión', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ABCD'));

  await fillGuest(page, 'Leo', 'turquoise');
  await page.getByRole('button', { name: 'Unirme' }).click();

  await expect(page).toHaveURL(/sala\/ABCD$/);
  await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();
  await expect(page.getByText('Leo · Turquesa')).toBeVisible();
  await expect(page.locator('.waiting-note')).toHaveText('Esperando a que el anfitrión comience');
  await expect(page.getByText('Media · 10 preguntas')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Leo' })).toContainText('listo');
  await expect(page.locator('.sr-only[role="status"]'))
    .toHaveText('2 participantes en la sala. Esperando a que el anfitrión comience.');

  // Nada de lo que solo puede hacer el anfitrión aparece en su pantalla.
  await expect(page.getByRole('button', { name: 'Comenzar partida' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Compartir invitación' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cerrar sala' })).toHaveCount(0);
  await expect(page.locator('chairo-qr-code')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salir de la sala', exact: true })).toBeVisible();
});

test('recargar no expulsa al invitado de la sala', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ABCD'));
  await fillGuest(page, 'Leo', 'turquoise');
  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();
  await expect(page.getByText('Leo · Turquesa')).toBeVisible();
  await expect(page.locator('.waiting-note')).toHaveText('Esperando a que el anfitrión comience');
  await expect(page.getByRole('button', { name: 'Comenzar partida' })).toHaveCount(0);
});

test('salir retira solo el asiento del invitado y deja la sala en pie', async ({ page }) => {
  await withOpenRoom(page);
  await page.goto(joinUrl('ABCD'));
  await fillGuest(page, 'Leo', 'turquoise');
  await page.getByRole('button', { name: 'Unirme' }).click();
  await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Salir de la sala', exact: true }).click();
  await expect(page).toHaveURL(/unirse$/);

  const room = JSON.parse((await page.evaluate(key => localStorage.getItem(key), roomKey))!) as typeof openRoom;
  expect(room.code).toBe('ABCD');
  expect(room.participants).toHaveLength(1);
  expect(room.participants[0]!.role).toBe('host');
});

test('el anfitrión ve entrar al invitado sin recargar', async ({ page, context }) => {
  await withOpenRoom(page);
  await page.goto(roomUrl('ABCD'));
  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Comenzar partida' })).toBeDisabled();

  const phone = await context.newPage();
  await withoutBackend(phone);
  await phone.goto(joinUrl('ABCD'));
  await fillGuest(phone, 'Leo', 'turquoise');
  await phone.getByRole('button', { name: 'Unirme' }).click();
  await expect(phone.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();

  // La pantalla del anfitrión no se recarga: el asiento aparece solo.
  await expect(page.getByRole('listitem').filter({ hasText: 'Leo' })).toContainText('listo');
  await expect(page.getByRole('button', { name: 'Comenzar partida' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Compartir invitación' })).toBeVisible();
  await phone.close();
});

for (const width of [320, 390, 941, 1440]) {
  test(`la entrada del invitado es accesible y responsiva a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 941 ? 1672 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    await withOpenRoom(page, [host, guestSeat(1, 'Leo', 'turquoise')]);
    await page.goto(joinUrl('ABCD'));
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: 'Entrar a la sala', level: 1 })).toBeVisible();

    for (const target of [page.locator('#room-code'), page.locator('#guest-name')]) {
      const bounds = (await target.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(48);
    }
    for (const color of ['orange', 'blue', 'green']) {
      const bounds = (await page.locator(`label[for="color-${color}"]`).boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(bounds.width).toBeGreaterThanOrEqual(48);
    }
    const submit = (await page.getByRole('button', { name: 'Unirme' }).boundingBox())!;
    expect(submit.height).toBeGreaterThanOrEqual(48);
    const back = (await page.getByRole('link', { name: 'Volver al centro de juegos' }).first().boundingBox())!;
    expect(back.height).toBeGreaterThanOrEqual(48);
    expect(back.width).toBeGreaterThanOrEqual(48);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(a11y.violations).toEqual([]);

    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('.impeccable/review', { recursive: true });
    await page.screenshot({ path: `.impeccable/review/unirse-width-${width}.png`, fullPage: true, animations: 'disabled' });

    if (width === 390) {
      await fillGuest(page, 'Ana', 'blue');
      await page.screenshot({ path: '.impeccable/review/unirse-listo-390.png', fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: 'Unirme' }).click();
      await expect(page.getByRole('heading', { name: 'Ya estás dentro', level: 1 })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: '.impeccable/review/sala-invitado-390.png', fullPage: true, animations: 'disabled' });

      const guestA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
      expect(guestA11y.violations).toEqual([]);
    }

    expect(errors).toEqual([]);
  });
}

test('la entrada cubre teclado, foco visible, movimiento reducido y colores forzados', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withOpenRoom(page, [host, guestSeat(1, 'Leo', 'turquoise')]);
  await page.goto(joinUrl('ABCD'));
  await expect(page.getByRole('heading', { name: 'Entrar a la sala', level: 1 })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir al formulario de entrada' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Volver al centro de juegos' }).first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#room-code')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#guest-name')).toBeFocused();

  // El color se elige con el teclado y los tomados quedan fuera del recorrido.
  await page.keyboard.press('Tab');
  await expect(page.locator('#color-orange')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#color-blue')).toBeChecked();

  const submit = page.getByRole('button', { name: 'Unirme' });
  expect(await submit.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');

  await page.emulateMedia({ forcedColors: 'active' });
  await page.locator('#color-blue').focus();
  const focused = page.locator('label[for="color-blue"]');
  expect(await focused.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  // Sin color, la forma y el nombre siguen distinguiendo cada pieza.
  await expect(focused.locator('chairo-color-mark svg')).toBeVisible();
  await expect(page.locator('label[for="color-turquoise"]')).toContainText('No disponible');
});
