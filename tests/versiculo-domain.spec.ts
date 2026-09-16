import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

import { buildInvitationMessage, buildJoinUrl, JOIN_ROUTE } from '../src/app/games/versiculo-o-inventiculo/domain/join-link';
import {
  canStartMatch,
  createRoomCode,
  hostParticipant,
  isRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  setupSummary,
  type Room
} from '../src/app/games/versiculo-o-inventiculo/domain/room';
import { encodeQrCode } from '../src/app/games/versiculo-o-inventiculo/infrastructure/qr-code';

const room: Room = {
  code: 'ABCD',
  setup: { difficulty: 'medium', questionCount: 10, hostRole: 'player' },
  participants: [hostParticipant('player')],
  createdAt: 0
};

test('el código corto usa cuatro caracteres sin parejas ambiguas', () => {
  expect(ROOM_CODE_LENGTH).toBe(4);
  for (const ambiguous of ['0', 'O', '1', 'I']) {
    expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
  }

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = createRoomCode(Math.random);
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}$/);
    expect(isRoomCode(code)).toBe(true);
  }

  // Un generador degenerado nunca debe salirse del alfabeto.
  expect(createRoomCode(() => 0)).toBe('2222');
  expect(createRoomCode(() => 0.999999)).toBe('ZZZZ');
  expect(isRoomCode('0OI1')).toBe(false);
  expect(isRoomCode('ABC')).toBe(false);
  expect(isRoomCode('abcd')).toBe(false);
});

test('la invitación apunta a la ruta de unión de esa sala', () => {
  const href = 'http://127.0.0.1:4173/chairo/browser/#/juegos/versiculo-o-inventiculo/sala/ABCD';
  const joinUrl = buildJoinUrl(href, 'ABCD');

  expect(joinUrl).toBe(`http://127.0.0.1:4173/chairo/browser/${JOIN_ROUTE}/ABCD`);
  expect(buildJoinUrl('https://alguien.github.io/chairo/?ver=1#/otra', 'K9PQ'))
    .toBe(`https://alguien.github.io/chairo/?ver=1${JOIN_ROUTE}/K9PQ`);
  expect(buildInvitationMessage(joinUrl, 'ABCD')).toContain('ABCD');
  expect(buildInvitationMessage(joinUrl, 'ABCD')).toContain(joinUrl);
});

test('el QR codifica la URL de unión igual que una implementación independiente', async () => {
  const golden = JSON.parse(
    await readFile('tests/fixtures/qr-join-abcd.json', 'utf8')
  ) as { content: string; version: number; size: number; rows: string[] };

  const code = encodeQrCode(golden.content);
  const rows = code.modules.map(row => row.map(module => (module ? '1' : '0')).join(''));

  expect(code.version).toBe(golden.version);
  expect(code.size).toBe(golden.size);
  expect(rows).toEqual(golden.rows);
});

test('la partida solo puede comenzar con otra persona lista', () => {
  expect(canStartMatch(room)).toBe(false);

  const joining = {
    ...room,
    participants: [...room.participants, { id: 'g1', name: 'Leo', role: 'guest', status: 'joining', color: 'turquoise', plays: true }]
  } satisfies Room;
  expect(canStartMatch(joining)).toBe(false);

  const ready = {
    ...room,
    participants: [...room.participants, { id: 'g1', name: 'Leo', role: 'guest', status: 'ready', color: 'turquoise', plays: true }]
  } satisfies Room;
  expect(canStartMatch(ready)).toBe(true);
  expect(setupSummary(ready.setup)).toBe('Media · 10 preguntas');
});
