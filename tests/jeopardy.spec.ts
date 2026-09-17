import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

/*
 * Sin backend: la sala vive en `localStorage`, que comparten las pestañas del
 * mismo contexto, y cada pestaña tiene su propio asiento. Las mismas reglas
 * contra Postgres las cubre la prueba de `supabase/schema.sql`.
 */

test.beforeEach(async ({ page }) => withoutBackend(page));

async function openGuest(context: BrowserContext, code: string, name: string, color: RegExp): Promise<Page> {
  const guest = await context.newPage();
  await withoutBackend(guest);
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.goto(`./#/juegos/jeopardy/unirse/${code}`);
  await expect(guest.getByText(/Sala encontrada/)).toBeVisible();
  await guest.getByLabel('Tu nombre').fill(name);
  await guest.getByRole('button', { name: color }).click();
  await guest.getByRole('button', { name: 'Entrar a la sala' }).click();
  await expect(guest).toHaveURL(new RegExp(`jeopardy/sala/${code}$`));
  return guest;
}

/** Quien tiene el turno abre la primera casilla libre, apuesta si toca, y queda respondiendo. */
async function openClue(chooser: Page): Promise<void> {
  await chooser.locator('.clue-tile:enabled').first().click();
  const wager = chooser.getByRole('button', { name: /Confirmar/ });
  const answered = chooser.getByRole('button', { name: 'Ya respondí' });
  await expect(wager.or(answered)).toBeVisible();
  if (await wager.isVisible()) await wager.click();
  await expect(answered).toBeVisible();
}

/** Quien tiene el turno abre la primera casilla libre y el anfitrión le da el punto. */
async function playTurn(chooser: Page, host: Page): Promise<void> {
  await openClue(chooser);
  await chooser.getByRole('button', { name: 'Ya respondí' }).click();
  await host.getByRole('button', { name: /^Acertó/ }).click();
}

async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/jeopardy\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  return page.url().split('/').pop()!;
}

test('el anfitrión conduce, los turnos se sincronizan, se puntúa y se roba', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/juegos/jeopardy');
  await expect(page.getByRole('heading', { name: 'Jeopardy' })).toBeVisible();
  await expect(page.getByRole('button', { name: /solo conduzco/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Quitar una categoría' }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Quitar una fila' }).click();
  const code = await createRoom(page);
  await expect(page.getByText('anfitrión · conduce')).toBeVisible();
  await expect(page.getByText('Si nadie más entra, jugarás tú solo.')).toBeVisible();

  const rut = await openGuest(context, code, 'Rut', /Naranja/);
  const leo = await openGuest(context, code, 'Leo', /Turquesa/);
  await expect(page.getByText('2 de 4 jugadores')).toBeVisible();
  await expect(page.getByText('Si nadie más entra, jugarás tú solo.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Abrir el tablero' }).click();
  for (const phone of [page, rut, leo]) {
    await expect(phone.getByRole('region', { name: 'Tablero de preguntas' })).toBeVisible();
  }
  await expect(page.locator('.score-list li')).toHaveCount(2);
  await expect(leo.locator('.clue-tile:enabled')).toHaveCount(0);
  await expect(rut.locator('.clue-tile:enabled')).toHaveCount(9);

  // El anfitrión conduce: tocar una casilla le enseña pregunta y respuesta sin abrirla.
  await expect(page.locator('.clue-tile:enabled')).toHaveCount(9);
  await page.locator('.clue-tile').first().click();
  const preview = page.getByRole('dialog');
  await expect(preview.getByText('Respuesta', { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Cerrar' }).click();
  await expect(preview).toBeHidden();
  await expect(rut.locator('.clue-tile:enabled')).toHaveCount(9);

  // Mientras Rut responde, el anfitrión destapa la respuesta; los jugadores nunca la ven.
  await openClue(rut);
  await expect(leo.getByRole('button', { name: 'Ver respuesta' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver respuesta' }).click();
  await expect(page.getByText('Respuesta', { exact: true })).toBeVisible();
  await rut.getByRole('button', { name: 'Ya respondí' }).click();
  await expect(leo.getByText('El anfitrión está comprobando la respuesta.')).toBeVisible();
  await expect(leo.getByText('Respuesta', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /No acertó/ }).click();

  await expect(leo.getByText('Puedes robar')).toBeVisible();
  await expect(rut.getByText('Leo puede robar.')).toBeVisible();
  await leo.getByRole('button', { name: 'Intentar robar' }).click();
  await leo.getByRole('button', { name: 'Ya respondí' }).click();
  await page.getByRole('button', { name: /^Acertó/ }).click();
  await expect(page.getByText(/Turno de Leo\.$/)).toBeVisible();
  await expect(leo.locator('.clue-tile:enabled')).toHaveCount(8);

  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations).toEqual([]);
});

test('el robo se abre a todos y el anfitrión apura o termina el turno', async ({ context, page }) => {
  // Reloj falso solo en el anfitrión: adelantarlo vence la cuenta en su pestaña,
  // que la aplica y la comparte con las demás.
  await page.clock.install();
  await page.goto('./#/juegos/jeopardy');
  await page.getByRole('button', { name: 'Quitar una categoría' }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Quitar una fila' }).click();
  const code = await createRoom(page);
  const rut = await openGuest(context, code, 'Rut', /Naranja/);
  const leo = await openGuest(context, code, 'Leo', /Turquesa/);
  const eva = await openGuest(context, code, 'Eva', /Violeta/);
  await page.getByRole('button', { name: 'Abrir el tablero' }).click();
  await expect(rut.locator('.clue-tile:enabled')).toHaveCount(9);
  await expect(rut.getByRole('group', { name: 'Controles del anfitrión' })).toHaveCount(0);

  // Diez segundos para elegir: al vencer, el turno pasa sin gastar casillas.
  await page.getByRole('button', { name: 'Dar 10 segundos' }).click();
  await expect(rut.getByRole('timer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reiniciar a 10' })).toBeVisible();
  await page.clock.fastForward(11_000);
  for (const phone of [page, rut, leo]) await expect(phone.getByText('Se acabó el tiempo. Turno de Leo.')).toBeVisible();
  await expect(rut.getByRole('timer')).toHaveCount(0);
  await expect(leo.locator('.clue-tile:enabled')).toHaveCount(9);

  // Leo se queda sin tiempo: cuenta como «Ya respondí» y el anfitrión juzga.
  await openClue(leo);
  await expect(page.locator('.question-paper h2')).toBeVisible();
  await page.getByRole('button', { name: 'Dar 10 segundos' }).click();
  await expect(leo.getByRole('timer')).toBeVisible();
  await page.clock.fastForward(11_000);
  for (const phone of [page, leo]) await expect(phone.getByText('Se acabó el tiempo de Leo. El anfitrión decide.')).toBeVisible();
  await expect(leo.getByRole('button', { name: 'Ya respondí' })).toHaveCount(0);
  await expect(leo.getByText('El anfitrión está comprobando la respuesta.')).toBeVisible();

  // Leo falla: Rut y Eva pueden robar a la vez y se lo queda quien lo pide primero.
  await page.getByRole('button', { name: /No acertó/ }).click();
  await expect(rut.getByText('Puedes robar')).toBeVisible();
  await expect(eva.getByText('Puedes robar')).toBeVisible();
  await expect(leo.getByText('Eva y Rut pueden robar. Roba quien lo pida primero.')).toBeVisible();
  await eva.getByRole('button', { name: 'Intentar robar' }).click();
  await expect(eva.getByRole('button', { name: 'Ya respondí' })).toBeVisible();
  await expect(rut.getByText('Eva está respondiendo.')).toBeVisible();
  await expect(rut.getByRole('button', { name: 'Intentar robar' })).toHaveCount(0);

  // El anfitrión corta la ronda de robo: la casilla se cierra sin puntos para Eva.
  await page.getByRole('button', { name: 'Terminar turno' }).click();
  await expect(eva.getByText('El anfitrión terminó el turno. Turno de Eva.')).toBeVisible();
  await expect(eva.locator('.clue-tile:enabled')).toHaveCount(8);
  await expect(eva.locator('.score-list strong')).toHaveText(['0', '-100', '0']);
});

test('sin invitados el anfitrión juega solo', async ({ page }) => {
  await page.goto('./#/juegos/jeopardy');
  await page.getByRole('button', { name: 'Quitar una categoría' }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Quitar una fila' }).click();
  await createRoom(page);
  await page.getByRole('button', { name: 'Abrir el tablero' }).click();

  await expect(page.locator('.score-list li')).toHaveCount(1);
  await expect(page.locator('.clue-tile:enabled')).toHaveCount(9);
  await playTurn(page, page);
  await expect(page.getByText(/^Anfitrión acertó y suma \d+\. Turno de Anfitrión\.$/)).toBeVisible();
  await expect(page.locator('.clue-tile:enabled')).toHaveCount(8);
});

test('jugar otra vez reinicia la misma sala y trae a los invitados de vuelta', async ({ context, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/juegos/jeopardy');
  await page.getByRole('button', { name: 'Quitar una categoría' }).click({ clickCount: 2 });
  await page.getByRole('button', { name: 'Quitar una fila' }).click();
  for (let index = 0; index < 3; index += 1) await page.getByRole('button', { name: 'Quitar una casilla doble' }).click();
  const code = await createRoom(page);
  const guest = await openGuest(context, code, 'Rut', /Naranja/);
  await expect(page.getByText('1 de 4 jugadores')).toBeVisible();
  await page.getByRole('button', { name: 'Abrir el tablero' }).click();

  // Una sola invitada: todas las casillas son suyas.
  for (let turn = 0; turn < 9; turn += 1) {
    await expect(guest.locator('.clue-tile:enabled')).toHaveCount(9 - turn);
    await playTurn(guest, page);
  }

  await expect(page.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Clasificación final' })).toBeVisible();
  await expect(page.locator('.final-ranking li')).toHaveCount(1);
  await expect(guest.getByRole('button', { name: 'Jugar otra vez' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Jugar otra vez' }).click();
  await expect(page.getByRole('heading', { name: 'Arma otra ronda' })).toBeVisible();
  await expect(page.getByLabel('Nombre del anfitrión')).toHaveCount(0);
  await expect(page.locator('.stepper output').first()).toHaveText('3');
  await page.getByRole('button', { name: 'Agregar una categoría' }).click();
  await page.getByRole('button', { name: 'Reiniciar sala' }).click();

  await expect(page).toHaveURL(new RegExp(`jeopardy/sala/${code}$`));
  await expect(page.getByText('1 de 4 jugadores')).toBeVisible();
  await expect(guest).toHaveURL(new RegExp(`jeopardy/sala/${code}$`));
  await expect(guest.locator('.round-facts dd').first()).toHaveText('4 × 3');

  await openGuest(context, code, 'Leo', /Amarillo/);
  await expect(page.getByText('2 de 4 jugadores')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir el tablero' }).click();
  await expect(guest.locator('.score-list li')).toHaveCount(2);
  await expect(guest.locator('.score-list strong')).toHaveText(['0', '0']);
});

test('el invitado sale de la sala y el anfitrión la cierra para todos', async ({ context, page }) => {
  await page.goto('./#/juegos/jeopardy');
  const code = await createRoom(page);
  const guest = await openGuest(context, code, 'Rut', /Naranja/);
  await expect(page.getByText('Rut', { exact: true })).toBeVisible();

  await guest.getByRole('button', { name: 'Salir de la sala' }).click();
  await expect(guest).toHaveURL(/jeopardy\/unirse$/);
  await expect(page.getByText('Rut', { exact: true })).toHaveCount(0);

  const other = await openGuest(context, code, 'Leo', /Turquesa/);
  await page.getByRole('button', { name: 'Cerrar sala y volver' }).click();
  await expect(page).toHaveURL(/#\/juegos\/jeopardy$/);
  await expect(other.getByText('El anfitrión cerró la sala.')).toBeVisible();
});

for (const width of [320, 1440]) {
  test(`la configuración de Jeopardy responde a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/juegos/jeopardy');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Crear sala' })).toBeVisible();
  });
}
