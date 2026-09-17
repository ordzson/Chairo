import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

const games = [
  'Jeopardy', '¿Versículo o inventículo?', 'El discípulo más perdido',
  'Revelaciones', 'Buscando perlas', 'Trivia'
];
/** Jeopardy, ¿Versículo o inventículo? y Revelaciones —el Password bíblico— ya se juegan. */
const available = new Set([0, 1, 3]);
const withJoinLink = new Set([1, 3]);
const gameStatuses = games.map((_, index) => available.has(index) ? 'Disponible' : 'Próximamente');
const storageKey = 'chairo:play-preference';

for (const width of [320, 390, 941, 1280, 1440]) {
  test(`exploration, assets and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 941 ? 1672 : 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    const initialUrl = page.url();
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(6);
    await expect(page.getByRole('combobox')).toHaveValue('none');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    for (const [index, name] of games.entries()) {
      const tab = tabs.nth(index);
      await expect(tab).toContainText(name);
      await expect(tab).toContainText(gameStatuses[index]!);
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel').getByRole('heading')).toHaveText(name);
      if (available.has(index)) {
        await expect(page.getByRole('tabpanel')).toContainText('¡A jugar!');
        await expect(page.getByRole('link', { name: 'Preparar partida' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Unirse con código' })).toHaveCount(withJoinLink.has(index) ? 1 : 0);
      } else {
        await expect(page.getByRole('tabpanel')).toContainText('Próximamente');
        await expect(page.getByRole('tabpanel')).toContainText('Estamos preparando este juego.');
      }
      await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
      expect(page.url()).toBe(initialUrl);
      const bounds = await tab.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }

    await tabs.first().click();
    await expect(page.getByRole('link', { name: 'Preparar partida' })).toBeVisible();
    expect(await page.locator('img').evaluateAll(images =>
      images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(a11y.violations).toEqual([]);
    expect(errors).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await mkdir('.impeccable/review', { recursive: true });
    const name = width === 390 ? 'mobile' : width === 1440 ? 'desktop' : width === 941 ? 'comp-size' : `width-${width}`;
    await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true, animations: 'disabled' });
  });
}

test('keyboard roving focus, wrap, Home/End and logical Tab sequence', async ({ page }) => {
  await page.goto('./');
  const tabs = page.getByRole('tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Ir a los juegos' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(tabs.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tabs.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('tabindex', '0');
  await expect(tabs.first()).toHaveAttribute('tabindex', '-1');
  expect(await tabs.nth(1).evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('tabpanel')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Preparar partida' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Unirse con código' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Unirse con código' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Preparar partida' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('tabpanel')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(tabs.nth(1)).toBeFocused();
});

test('versículo o inventículo permite entrar con un código desde el centro', async ({ page }) => {
  await withoutBackend(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.getByRole('tab', { name: /¿Versículo o inventículo?/ }).click();
  await page.screenshot({ path: '.impeccable/review/centro-unirse-390.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: '.impeccable/review/centro-unirse-1440.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Unirse con código' }).click();

  await expect(page).toHaveURL(/#\/juegos\/versiculo-o-inventiculo\/unirse$/);
  await expect(page.getByRole('heading', { name: 'Entrar a la sala' })).toBeVisible();
  // El campo espera vacío: el foco se queda al principio para no saltarse el enlace de salto.
  await expect(page.locator('#room-code')).toHaveValue('');
});

test('preference is optional, persistent, removable and independent of exploration', async ({ page }) => {
  await page.goto('./');
  const select = page.getByRole('combobox', { name: 'Modalidad preferida (opcional)' });
  for (const value of ['solo', 'shared-device', 'multiple-phones']) {
    await select.selectOption(value);
    await page.getByRole('tab').last().click();
    await expect(select).toHaveValue(value);
    await page.reload();
    await expect(select).toHaveValue(value);
  }
  await select.selectOption('none');
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await page.reload();
  await expect(select).toHaveValue('none');
  await expect(page.getByText('La modalidad se elegirá dentro de cada juego.')).toBeVisible();
});

for (const failure of ['invalid', 'getter', 'read', 'write'] as const) {
  test(`storage ${failure} cannot block the app`, async ({ page }) => {
    await page.addInitScript(({ failure, storageKey }) => {
      if (failure === 'invalid') localStorage.setItem(storageKey, '{broken-value}');
      if (failure === 'getter') Object.defineProperty(window, 'localStorage', {
        get() { throw new DOMException('Blocked', 'SecurityError'); }
      });
      if (failure === 'read') Storage.prototype.getItem = () => { throw new DOMException('Blocked'); };
      if (failure === 'write') {
        Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
        Storage.prototype.removeItem = () => { throw new DOMException('Blocked'); };
      }
    }, { failure, storageKey });
    await page.goto('./');
    const select = page.getByRole('combobox');
    await expect(select).toHaveValue('none');
    await select.selectOption('multiple-phones');
    await expect(select).toHaveValue('multiple-phones');
    await page.getByRole('tab').nth(2).click();
    await expect(page.getByRole('tabpanel').getByRole('heading')).toHaveText(games[2]!);
    await select.selectOption('none');
    await expect(select).toHaveValue('none');
  });
}

test('200% text enlargement, reduced motion and forced colors', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.getByRole('tab').first().evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.emulateMedia({ forcedColors: 'active' });
  await page.getByRole('tab').first().focus();
  expect(await page.getByRole('tab').first().evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
});
