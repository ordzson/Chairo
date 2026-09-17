import { mkdir } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import {
  PasswordError,
  endPasswordRound,
  finishPasswordMatch,
  joinPasswordRoom,
  openPasswordRoom,
  passwordSnapshot,
  preparePasswordRound,
  reopenPasswordRoom,
  scorePasswordRound,
  setPasswordReady,
  startPasswordMatch,
  type PasswordState
} from '../src/app/games/password/domain/match';

const APP = 'http://127.0.0.1:4173/chairo/browser/';
const BACKEND = 'https://password.test';

class SharedPasswordBackend {
  state?: PasswordState;

  call(name: string, input: Record<string, unknown>, userId: string): unknown {
    const now = Date.now();
    switch (name) {
      case 'create_password_room':
        this.state = openPasswordRoom('ABCD', userId, String(input['p_host_name']), Number(input['p_round_seconds']) as 30, now);
        break;
      case 'join_password_room':
        this.state = joinPasswordRoom(this.required(), userId, String(input['p_name']), String(input['p_color']) as 'orange', now);
        break;
      case 'start_password_match':
        this.state = startPasswordMatch(this.required(), userId, now);
        break;
      case 'set_password_ready': {
        const next = setPasswordReady(
          this.required(), userId, Boolean(input['p_ready']), input['p_words'] as string[], now, () => 0
        );
        // El contrato de producción conserva la duración configurada. El backend
        // simulado acorta únicamente la espera del test para comprobar el 0.
        this.state = next.phase === 'countdown'
          ? { ...next, deadlineAt: next.wordVisibleAt! + 1_100 }
          : next;
        break;
      }
      case 'end_password_round':
        this.state = endPasswordRound(this.required(), userId, now);
        break;
      case 'score_password_round': {
        const resultRows = input['p_results'] as { participantId: string; guessed: boolean }[];
        this.state = scorePasswordRound(
          this.required(), userId,
          Object.fromEntries(resultRows.map(result => [result.participantId, result.guessed])), now
        );
        break;
      }
      case 'prepare_password_round':
        this.state = preparePasswordRound(this.required(), userId, now);
        break;
      case 'finish_password_match':
        this.state = finishPasswordMatch(this.required(), userId, now);
        break;
      case 'reopen_password_room':
        this.state = reopenPasswordRoom(this.required(), userId, Number(input['p_round_seconds']) as 30, now);
        break;
      case 'get_password_snapshot':
        break;
      default:
        throw new PasswordError('unavailable', `RPC desconocida: ${name}`);
    }
    return { roomId: '00000000-0000-4000-8000-000000000001', ...passwordSnapshot(this.required(), userId, now) };
  }

  private required(): PasswordState {
    if (!this.state) throw new PasswordError('room-not-found');
    return this.state;
  }
}

async function connect(page: Page, backend: SharedPasswordBackend, userId: string): Promise<void> {
  await page.route('**/supabase.json', route => route.fulfill({
    json: { url: BACKEND, publishableKey: 'sb_password_test' }
  }));
  await page.route(`${BACKEND}/**`, route => handle(route, backend, userId));
}

async function handle(route: Route, backend: SharedPasswordBackend, userId: string): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  if (url.pathname === '/auth/v1/signup') return route.fulfill({ json: session(userId) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
  const match = url.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/);
  if (match) {
    try {
      const input = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ json: backend.call(match[1]!, input, userId) });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'unavailable';
      return route.fulfill({ status: 400, json: { code: 'P0001', details: null, hint: null, message } });
    }
  }
  return route.fulfill({ status: 404, json: { message: 'not-found' } });
}

function session(userId: string): Record<string, unknown> {
  return {
    access_token: `session-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${userId}`,
    user: {
      id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true,
      app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString()
    }
  };
}

async function axe(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze();
  expect(result.violations).toEqual([]);
}

async function holdToEnd(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Mantén para terminar ronda' });
  await button.hover();
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
}

test('dos contextos completan dos rondas, sincronizan 0, puntúan y juegan otra vez', async ({ browser }) => {
  test.setTimeout(90_000);
  const backend = new SharedPasswordBackend();
  const hostContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 320, height: 780 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await connect(host, backend, 'host');
  await connect(guest, backend, 'guest');

  try {
    await host.goto(`${APP}#/juegos/revelaciones`);
    await axe(host);
    await host.getByLabel('Tu nombre').fill('Ana');
    await host.getByRole('button', { name: 'Crear sala' }).click();
    await expect(host).toHaveURL(/revelaciones\/sala\/ABCD$/);

    await guest.goto(`${APP}#/juegos/revelaciones/unirse/ABCD`);
    await axe(guest);
    await guest.getByLabel('Tu nombre').fill('Leo');
    await guest.getByText('Naranja', { exact: true }).click();
    await guest.getByRole('button', { name: 'Unirme' }).click();
    await expect(guest).toHaveURL(/revelaciones\/sala\/ABCD$/);
    await expect(host.getByText('Leo')).toBeVisible({ timeout: 5_000 });
    await axe(host);

    await host.getByRole('button', { name: 'Empezar partida' }).click();
    await expect(host).toHaveURL(/revelaciones\/partida\/ABCD$/);
    await expect(guest).toHaveURL(/revelaciones\/partida\/ABCD$/, { timeout: 5_000 });
    await host.getByRole('button', { name: 'Estoy listo/a' }).click();
    await guest.getByRole('button', { name: 'Estoy listo/a' }).click();

    const hostWord = host.locator('.secret-word');
    const guestWord = guest.locator('.secret-word');
    await expect(hostWord).toBeVisible({ timeout: 7_000 });
    await expect(guestWord).toBeVisible({ timeout: 7_000 });
    const firstWords = new Set([await hostWord.textContent(), await guestWord.textContent()]);
    expect(firstWords.size).toBe(2);
    await axe(host);

    await expect(host.getByRole('timer')).toContainText('Tiempo agotado', { timeout: 4_000 });
    await expect(hostWord).toBeVisible();
    await expect(guestWord).toBeVisible();
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mkdir('.impeccable/review', { recursive: true });
    await host.screenshot({ path: '.impeccable/review/mobile.png', fullPage: true, animations: 'disabled' });
    await host.screenshot({ path: '.impeccable/review/password-playing-390.png', fullPage: true, animations: 'disabled' });
    await guest.screenshot({ path: '.impeccable/review/password-playing-320.png', fullPage: true, animations: 'disabled' });
    await host.setViewportSize({ width: 1280, height: 900 });
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await host.screenshot({ path: '.impeccable/review/desktop.png', fullPage: true, animations: 'disabled' });
    await host.setViewportSize({ width: 390, height: 844 });
    await holdToEnd(host);
    await expect(host.getByText('¿Quién adivinó?')).toBeVisible();
    await expect(guest.getByText('La persona anfitriona está anotando')).toBeVisible({ timeout: 5_000 });
    await axe(host);

    await host.getByRole('button', { name: 'Adivinó · +1' }).first().click();
    await host.getByRole('button', { name: 'No adivinó · +0' }).nth(1).click();
    await host.getByRole('button', { name: 'Guardar puntos' }).click();
    await expect(host.getByText('Después de 1 ronda')).toBeVisible();
    await expect(guest.getByText('Después de 1 ronda')).toBeVisible({ timeout: 5_000 });
    await expect(host.getByText('1 punto')).toBeVisible();

    await host.getByRole('button', { name: 'Otra ronda' }).click();
    await host.getByRole('button', { name: 'Estoy listo/a' }).click();
    await guest.getByRole('button', { name: 'Estoy listo/a' }).click();
    await expect(hostWord).toBeVisible({ timeout: 7_000 });
    await expect(guestWord).toBeVisible({ timeout: 7_000 });
    expect(firstWords.has(await hostWord.textContent())).toBe(false);
    expect(firstWords.has(await guestWord.textContent())).toBe(false);

    await holdToEnd(host);
    await host.getByRole('button', { name: 'Adivinó · +1' }).first().click();
    await host.getByRole('button', { name: 'Adivinó · +1' }).nth(1).click();
    await host.getByRole('button', { name: 'Guardar puntos' }).click();
    await host.getByRole('button', { name: 'Terminar partida' }).click();
    await expect(host.getByRole('heading', { name: 'Ana gana' })).toBeVisible();
    await expect(guest.getByRole('heading', { name: 'Ana gana' })).toBeVisible({ timeout: 5_000 });
    await axe(host);

    await host.getByRole('button', { name: 'Jugar otra vez' }).click();
    await expect(host).toHaveURL(/revelaciones\/sala\/ABCD$/);
    await expect(guest).toHaveURL(/revelaciones\/sala\/ABCD$/, { timeout: 5_000 });
    await expect(host.getByText('0 pts').first()).toBeVisible();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
