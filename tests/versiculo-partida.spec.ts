import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { withoutBackend } from './offline';

const roomKey = 'chairo:versiculo-o-inventiculo:room';
const matchKey = 'chairo:versiculo-o-inventiculo:match';
const roomUrl = './#/juegos/versiculo-o-inventiculo/sala/ABCD';
const gameUrl = './#/juegos/versiculo-o-inventiculo/partida/ABCD';

const host = { id: 'host', name: 'Tú', role: 'host', status: 'ready', color: 'yellow', plays: true };
const guest = { id: 'guest-1', name: 'Leo', role: 'guest', status: 'ready', color: 'orange', plays: true };
const room = {
  code: 'ABCD',
  setup: { difficulty: 'easy', questionCount: 5, hostRole: 'player' },
  participants: [host, guest],
  createdAt: 1_758_000_000_000,
  status: 'waiting'
};

test.beforeEach(async ({ page }) => {
  await withoutBackend(page);
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [roomKey, JSON.stringify(room)] as const
  );
});

test('el anfitrión inicia y todos reciben una pregunta real', async ({ page }) => {
  await page.goto(roomUrl);
  await page.getByRole('button', { name: 'Comenzar partida' }).click();

  await expect(page).toHaveURL(/partida\/ABCD$/);
  await expect(page.getByText('Todos listos')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Versículo' })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.question-sheet > p')).not.toBeEmpty();
  await expect(page.getByText('Ronda 1/5')).toBeVisible();

  await page.getByRole('button', { name: 'Versículo' }).click();
  await expect(page.getByText('Respuesta enviada')).toBeVisible();
  await expect(page.getByText('Esperando 1 respuesta más…')).toBeVisible();
  await expect(page.getByText('Sí es versículo')).toHaveCount(0);
});

test('la pantalla de pregunta conserva accesibilidad y no desborda en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const now = Date.now();
  const question = {
    id: 'easy-01',
    difficulty: 'easy',
    statement: 'Mejor es perro vivo que león muerto.',
    isVerse: true,
    reference: 'Ec 9:4 · RVR1960',
    explanation: 'Suena a refrán de pueblo.'
  };
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [matchKey, JSON.stringify({
      code: 'ABCD', questions: [question], roundIndex: 0, phase: 'question',
      phaseStartedAt: now, phaseEndsAt: now + 12_000, answers: []
    })] as const
  );

  await page.goto(gameUrl);
  await expect(page.getByRole('button', { name: 'Inventículo' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('la partida conserva su jerarquía en móvil y escritorio', async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [matchKey, JSON.stringify({
      code: 'ABCD',
      questions: [{
        id: 'easy-01', difficulty: 'easy', statement: 'Mejor es perro vivo que león muerto.',
        isVerse: true, reference: 'Ec 9:4 · RVR1960', explanation: 'Suena a refrán de pueblo.'
      }],
      roundIndex: 0, phase: 'question', phaseStartedAt: now,
      phaseEndsAt: now + 12_000, answers: []
    })] as const
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gameUrl);
  await expect(page.getByRole('button', { name: 'Versículo' })).toBeVisible();
  await page.screenshot({ path: '.impeccable/review/partida-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByRole('button', { name: 'Inventículo' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.impeccable/review/partida-desktop.png', fullPage: true });
});

test('los resultados finales muestran clasificación, estadísticas y salida', async ({ page }) => {
  const now = Date.now();
  const question = {
    id: 'easy-01', difficulty: 'easy', statement: 'Mejor es perro vivo que león muerto.',
    isVerse: true, reference: 'Ec 9:4 · RVR1960', explanation: 'Suena a refrán de pueblo.'
  };
  const finishedRoom = { ...room, status: 'finished' };
  const finishedMatch = {
    code: 'ABCD', questions: [question], roundIndex: 0, phase: 'finished',
    phaseStartedAt: now, phaseEndsAt: null,
    answers: [
      { participantId: 'host', roundIndex: 0, choice: 'verse', answeredAt: now, responseMs: 1_000, correct: true, points: 933 },
      { participantId: 'guest-1', roundIndex: 0, choice: 'invented', answeredAt: now, responseMs: 2_000, correct: false, points: 0 }
    ]
  };
  await page.addInitScript(
    ([roomStorage, roomValue, matchStorage, matchValue]) => {
      localStorage.setItem(roomStorage!, roomValue!);
      localStorage.setItem(matchStorage!, matchValue!);
    },
    [roomKey, JSON.stringify(finishedRoom), matchKey, JSON.stringify(finishedMatch)] as const
  );

  await page.goto(gameUrl);
  await expect(page.getByRole('heading', { name: '¡Partida terminada!' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Tú' })).toBeVisible();
  await expect(page.getByText('933', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jugar otra vez' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver al centro', exact: true })).toBeVisible();
});

test('jugar otra vez reinicia la misma sala y la nueva partida llega a todos', async ({ page, context }) => {
  const now = Date.now();
  const question = {
    id: 'easy-01', difficulty: 'easy', statement: 'Mejor es perro vivo que león muerto.',
    isVerse: true, reference: 'Ec 9:4 · RVR1960', explanation: 'Suena a refrán de pueblo.'
  };
  await page.addInitScript(
    ([roomStorage, roomValue, matchStorage, matchValue]) => {
      localStorage.setItem(roomStorage!, roomValue!);
      localStorage.setItem(matchStorage!, matchValue!);
    },
    [roomKey, JSON.stringify({ ...room, status: 'finished' }), matchKey, JSON.stringify({
      code: 'ABCD', questions: [question], roundIndex: 0, phase: 'finished',
      phaseStartedAt: now, phaseEndsAt: null,
      answers: [
        { participantId: 'host', roundIndex: 0, choice: 'verse', answeredAt: now, responseMs: 1_000, correct: true, points: 933 },
        { participantId: 'guest-1', roundIndex: 0, choice: 'invented', answeredAt: now, responseMs: 2_000, correct: false, points: 0 }
      ]
    })] as const
  );
  await page.goto(gameUrl);
  await expect(page.getByRole('heading', { name: '¡Partida terminada!' })).toBeVisible();

  // Leo mira los resultados desde otra pestaña, que hace de su teléfono.
  const guestPage = await context.newPage();
  await withoutBackend(guestPage);
  await guestPage.addInitScript(() => sessionStorage.setItem(
    'chairo:versiculo-o-inventiculo:seat',
    JSON.stringify({ code: 'ABCD', participantId: 'guest-1' })
  ));
  await guestPage.goto(gameUrl);
  await expect(guestPage.getByText('Si el anfitrión prepara otra partida, te llevaremos a la sala automáticamente.')).toBeVisible();
  await expect(guestPage.getByRole('button', { name: 'Jugar otra vez' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Jugar otra vez' }).click();
  await expect(page).toHaveURL(/sala\/ABCD\/configurar$/);
  await expect(page.getByRole('radio', { name: 'Fácil' })).toBeChecked();
  await expect(page.locator('.question-count')).toHaveText('5');
  await page.getByRole('button', { name: 'Reiniciar sala' }).click();

  await expect(page).toHaveURL(/sala\/ABCD$/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Leo' })).toBeVisible();
  await expect(guestPage).toHaveURL(/sala\/ABCD$/);
  await expect(guestPage.getByText('Esperando a que el anfitrión comience', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Comenzar partida' }).click();
  await expect(page).toHaveURL(/partida\/ABCD$/);
  await expect(guestPage).toHaveURL(/partida\/ABCD$/);
  for (const phone of [page, guestPage]) {
    await expect(phone.getByRole('button', { name: 'Versículo' })).toBeVisible({ timeout: 5_000 });
    await expect(phone.getByText('Ronda 1/5')).toBeVisible();
    await expect(phone.getByText('933', { exact: true })).toHaveCount(0);
  }
});
