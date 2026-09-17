import { expect, test } from '@playwright/test';

import { createRoomCode, isRoomCode, ROOM_CODE_ALPHABET, sanitizeRoomCode } from '../src/app/games/password/domain/room';

test('los códigos de Password usan el alfabeto sin caracteres ambiguos', () => {
  expect(sanitizeRoomCode('a0b-1codi')).toBe('ABCD');
  for (const character of ['0', 'O', '1', 'I']) expect(ROOM_CODE_ALPHABET).not.toContain(character);
  for (let index = 0; index < 200; index += 1) expect(isRoomCode(createRoomCode(Math.random))).toBe(true);
});
