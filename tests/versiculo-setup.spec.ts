import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

const setupUrl = './#/juegos/versiculo-o-inventiculo';

test.beforeEach(async ({ page }) => withoutBackend(page));
const storageKey = 'chairo:versiculo-o-inventiculo:setup';

for (const width of [320, 390, 941, 1440]) {
  test(`setup screen is accessible and responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 941 ? 1672 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(setupUrl);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { name: '¿Versículo o inventículo?' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Media' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'También juego' })).toBeChecked();
    await expect(page.getByRole('status', { name: 'Preguntas' })).toHaveText('10');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(a11y.violations).toEqual([]);

    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('.impeccable/review', { recursive: true });
    const screenshotName = width === 390 ? 'setup-mobile' : width === 1440 ? 'setup-desktop' : `setup-width-${width}`;
    await page.screenshot({ path: `.impeccable/review/${screenshotName}.png`, fullPage: true, animations: 'disabled' });

    for (const [value, name] of [['easy', 'Fácil'], ['medium', 'Media'], ['hard', 'Difícil'], ['extreme', 'Extrema']] as const) {
      const radio = page.getByRole('radio', { name });
      await page.locator(`label[for="difficulty-${value}"]`).click();
      await expect(radio).toBeChecked();
    }

    const decrease = page.getByRole('button', { name: 'Quitar 5 preguntas' });
    const increase = page.getByRole('button', { name: 'Agregar 5 preguntas' });
    await decrease.click();
    await expect(page.getByRole('status', { name: 'Preguntas' })).toHaveText('5');
    await expect(decrease).toBeDisabled();
    await increase.click();
    await expect(page.getByRole('status', { name: 'Preguntas' })).toHaveText('10');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('setup choices persist and the host role explanation stays in sync', async ({ page }) => {
  await page.goto(setupUrl);
  await page.locator('label[for="difficulty-extreme"]').click();
  await page.getByRole('button', { name: 'Agregar 5 preguntas' }).click();
  await page.getByRole('button', { name: 'Agregar 5 preguntas' }).click();
  await page.locator('label[for="host-role-only"]').click();
  await expect(page.getByText('Conducirás la partida sin responder.')).toBeVisible();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/sala\/[2-9A-HJ-NP-Z]{4}$/);

  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(
    JSON.stringify({ difficulty: 'extreme', questionCount: 20, hostRole: 'host-only', questionSeconds: 12, revealSeconds: 5 })
  );

  await page.goto(setupUrl);
  await expect(page.getByRole('radio', { name: 'Extrema' })).toBeChecked();
  await expect(page.getByRole('status', { name: 'Preguntas' })).toHaveText('20');
  await expect(page.getByRole('radio', { name: 'Solo anfitrión' })).toBeChecked();
});

test('the host writes the name everyone else will see', async ({ page }) => {
  await page.goto(setupUrl);
  const name = page.getByLabel('Tu nombre');
  await expect(name).toHaveValue('Anfitrión');

  await name.fill('   ');
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page.getByText('Escribe tu nombre para abrir la sala.')).toBeVisible();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo$/);

  await name.fill('Pastor Luis');
  await expect(page.getByText('Escribe tu nombre para abrir la sala.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Pastor Luis' })).toContainText('anfitrión');
});

test('the host chooses how long to read each phrase and to see the answer', async ({ page }) => {
  await page.goto(setupUrl);
  const questionSeconds = page.getByRole('status', { name: 'Leer y responder' });
  const revealSeconds = page.getByRole('status', { name: 'Ver la respuesta' });
  await expect(questionSeconds).toHaveText('12 s');
  await expect(revealSeconds).toHaveText('5 s');
  await expect(page.getByText('Por frase. Las largas reciben 6 s más.')).toBeVisible();

  const lessReading = page.getByRole('button', { name: 'Menos tiempo para leer y responder' });
  for (const expected of ['10 s', '8 s', '5 s']) {
    await lessReading.click();
    await expect(questionSeconds).toHaveText(expected);
  }
  await expect(lessReading).toBeDisabled();

  const moreReveal = page.getByRole('button', { name: 'Más tiempo para ver la respuesta' });
  for (const expected of ['8 s', '10 s', '15 s', '20 s', '30 s', '45 s', '60 s']) {
    await moreReveal.click();
    await expect(revealSeconds).toHaveText(expected);
  }
  await expect(moreReveal).toBeDisabled();

  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  const stored = JSON.parse((await page.evaluate(key => localStorage.getItem(key), storageKey))!);
  expect(stored).toMatchObject({ questionSeconds: 5, revealSeconds: 60 });
  const room = JSON.parse((await page.evaluate(() => localStorage.getItem('chairo:versiculo-o-inventiculo:room')))!);
  expect(room.setup).toMatchObject({ questionSeconds: 5, revealSeconds: 60 });

  await page.goto(setupUrl);
  await expect(page.getByRole('status', { name: 'Leer y responder' })).toHaveText('5 s');
  await expect(page.getByRole('status', { name: 'Ver la respuesta' })).toHaveText('60 s');
});

test('a setup saved before timings existed keeps its choices', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ difficulty: 'hard', questionCount: 25, hostRole: 'host-only' }));
  }, storageKey);
  await page.goto(setupUrl);
  await expect(page.getByRole('radio', { name: 'Difícil' })).toBeChecked();
  await expect(page.getByRole('status', { name: 'Preguntas' })).toHaveText('25');
  await expect(page.getByRole('status', { name: 'Leer y responder' })).toHaveText('12 s');
  await expect(page.getByRole('status', { name: 'Ver la respuesta' })).toHaveText('5 s');
});

test('the center opens setup and setup returns to the center', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab').nth(1).click();
  await page.getByRole('link', { name: 'Preparar partida' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo$/);
  await page.getByRole('link', { name: 'Volver al centro de juegos' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Centro de juegos' })).toBeVisible();
});

test('invalid or unavailable storage does not block setup', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, '{broken');
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  }, storageKey);
  await page.goto(setupUrl);
  await expect(page.getByRole('radio', { name: 'Media' })).toBeChecked();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  await expect(page.getByRole('heading', { name: 'Sala lista', level: 1 })).toBeVisible();
});

test('setup supports keyboard focus, reduced motion and forced colors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(setupUrl);
  await expect(page.getByRole('heading', { name: '¿Versículo o inventículo?' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir a la configuración' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Volver al centro de juegos' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'Media' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Difícil' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Difícil' })).toBeChecked();
  expect(await page.getByRole('button', { name: 'Crear sala' }).evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.getByRole('button', { name: 'Crear sala' }).focus();
  expect(await page.getByRole('button', { name: 'Crear sala' }).evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
});
