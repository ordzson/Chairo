import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

test.beforeEach(async ({ page }) => withoutBackend(page));

for (const width of [320, 390]) {
  test(`Revelaciones setup is accessible without horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('./#/juegos/revelaciones');
    await expect(page.getByRole('heading', { name: 'Revelaciones', level: 1 })).toBeVisible();
    await expect(page.getByRole('radio', { name: '60' })).toBeChecked();
    await expect(page.getByText('El banco de palabras todavía no está cargado.')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
    expect(a11y.violations).toEqual([]);
    await mkdir('.impeccable/review', { recursive: true });
    await page.screenshot({ path: `.impeccable/review/password-setup-${width}.png`, fullPage: true, animations: 'disabled' });
  });
}

test('la duración se guarda y el nombre es obligatorio', async ({ page }) => {
  await page.goto('./#/juegos/revelaciones');
  await page.getByLabel('Tu nombre').fill('   ');
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page.getByRole('alert')).toContainText('Escribe tu nombre');
  await page.getByLabel('Tu nombre').fill('Marta');
  await page.getByText('90', { exact: true }).click();
  await page.getByRole('button', { name: 'Crear sala' }).click();
  await expect(page).toHaveURL(/revelaciones\/sala\/[2-9A-HJ-NP-Z]{4}$/);
  expect(await page.evaluate(() => localStorage.getItem('chairo:password:setup'))).toBe('{"roundSeconds":90}');
});
