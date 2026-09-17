import { expect, test } from '@playwright/test';

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
  validateWordBank,
  winner,
  type PasswordState
} from '../src/app/games/password/domain/match';

const words = ['Maná', 'Goliat', 'Arca', 'Jericó'];

function room(now = 1_000): PasswordState {
  const opened = openPasswordRoom('ABCD', 'host', 'Ana', 30, now);
  return joinPasswordRoom(opened, 'guest', 'Leo', 'orange', now + 1);
}

function preparing(now = 1_000): PasswordState {
  return startPasswordMatch(room(now), 'host', now + 2);
}

function playing(now = 1_000): PasswordState {
  const oneReady = setPasswordReady(preparing(now), 'host', true, words, now + 3, () => 0);
  return setPasswordReady(oneReady, 'guest', true, words, now + 4, () => 0);
}

test('el banco rechaza vacío, único e inválido, y deduplica respetando tildes', () => {
  for (const bank of [[], ['Maná'], ['x'.repeat(33)]]) {
    expect(() => validateWordBank(bank)).toThrow(PasswordError);
  }
  expect(validateWordBank([' Maná ', 'MANÁ', 'Mana', 'Goliat'])).toEqual(['Maná', 'Mana', 'Goliat']);
});

test('dos personas reciben palabras distintas y solo ven la propia durante la ronda', () => {
  const state = playing();
  const host = passwordSnapshot(state, 'host', 5_000);
  const guest = passwordSnapshot(state, 'guest', 5_000);
  expect(host.phase).toBe('playing');
  expect(host.selfWord).toBeTruthy();
  expect(guest.selfWord).toBeTruthy();
  expect(host.selfWord).not.toBe(guest.selfWord);
  expect(host.revealedEntries).toEqual([]);
  expect(guest.revealedEntries).toEqual([]);
});

test('los nombres vacíos o mayores de 24 caracteres se rechazan también en el dominio', () => {
  expect(() => openPasswordRoom('ABCD', 'host', '   ', 30, 0)).toThrowError(/invalid-results/);
  const opened = openPasswordRoom('ABCD', 'host', 'Ana', 30, 0);
  expect(() => joinPasswordRoom(opened, 'guest', 'x'.repeat(25), 'orange', 1)).toThrowError(/invalid-results/);
});

test('la bolsa no repite hasta agotarse y se reinicia con dos palabras distintas', () => {
  let state = playing();
  const first = state.rounds[0]!.entries.map(entry => entry.word);
  state = endPasswordRound(state, 'host', 40_000);
  state = scorePasswordRound(state, 'host', { host: false, guest: false }, 40_001);
  state = preparePasswordRound(state, 'host', 40_002);
  state = setPasswordReady(state, 'host', true, words, 40_003, () => 0);
  state = setPasswordReady(state, 'guest', true, words, 40_004, () => 0);
  const second = state.rounds[1]!.entries.map(entry => entry.word);
  expect(new Set([...first, ...second]).size).toBe(4);

  state = endPasswordRound(state, 'host', 80_000);
  state = scorePasswordRound(state, 'host', { host: false, guest: false }, 80_001);
  state = preparePasswordRound(state, 'host', 80_002);
  state = setPasswordReady(state, 'host', true, words, 80_003, () => 0);
  state = setPasswordReady(state, 'guest', true, words, 80_004, () => 0);
  const third = state.rounds[2]!.entries.map(entry => entry.word);
  expect(third[0]).not.toBe(third[1]);
});

test('llegar a cero no termina la ronda y solo el anfitrión puede cerrarla', () => {
  const state = playing();
  const afterDeadline = passwordSnapshot(state, 'host', state.deadlineAt! + 90_000);
  expect(afterDeadline.phase).toBe('playing');
  expect(() => endPasswordRound(state, 'guest', state.deadlineAt! + 1)).toThrowError(/not-host/);
  expect(endPasswordRound(state, 'host', state.deadlineAt! + 1).phase).toBe('scoring');
});

test('guardar 1/0 es atómico e idempotente y conserva empate o ganador', () => {
  let state = endPasswordRound(playing(), 'host', 40_000);
  expect(() => scorePasswordRound(state, 'host', { host: true }, 40_001)).toThrowError(/invalid-results/);
  state = scorePasswordRound(state, 'host', { host: true, guest: false }, 40_002);
  expect(state.players.map(player => player.score)).toEqual([1, 0]);
  const again = scorePasswordRound(state, 'host', { host: true, guest: false }, 40_003);
  expect(again.players.map(player => player.score)).toEqual([1, 0]);
  expect(winner(passwordSnapshot(again, 'host', 40_004))?.name).toBe('Ana');
});

test('otra ronda conserva puntos y jugar otra vez reinicia puntos, readiness y palabras', () => {
  let state = endPasswordRound(playing(), 'host', 40_000);
  state = scorePasswordRound(state, 'host', { host: true, guest: true }, 40_001);
  state = preparePasswordRound(state, 'host', 40_002);
  expect(state.players.map(player => player.score)).toEqual([1, 1]);
  expect(state.players.every(player => !player.ready)).toBe(true);
  expect(state.roundNumber).toBe(2);

  state = setPasswordReady(state, 'host', true, words, 40_003, () => 0);
  state = setPasswordReady(state, 'guest', true, words, 40_004, () => 0);
  state = endPasswordRound(state, 'host', 80_000);
  state = scorePasswordRound(state, 'host', { host: false, guest: false }, 80_001);
  state = finishPasswordMatch(state, 'host', 80_002);
  expect(winner(passwordSnapshot(state, 'host', 80_003))).toBeNull();
  state = reopenPasswordRoom(state, 'host', 60, 80_004);
  expect(state.phase).toBe('waiting');
  expect(state.rounds).toEqual([]);
  expect(state.players.map(player => player.score)).toEqual([0, 0]);
});

test('dos intentos por el segundo lugar dejan exactamente dos asientos', async () => {
  let state = openPasswordRoom('ABCD', 'host', 'Ana', 60, 0);
  const join = async (id: string): Promise<void> => {
    state = joinPasswordRoom(state, id, id, id === 'uno' ? 'orange' : 'blue', Date.now());
  };
  const results = await Promise.allSettled([join('uno'), join('dos')]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(state.players).toHaveLength(2);
});
