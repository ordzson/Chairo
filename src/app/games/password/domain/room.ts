import type { GameColor } from '../../../game';

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const MAX_NAME_LENGTH = 24;
export type RoomCode = string;

/** El anfitrión ocupa amarillo; el invitado elige uno de los cinco restantes. */
export const PASSWORD_GUEST_COLORS: readonly { readonly value: GameColor; readonly label: string }[] = [
  { value: 'orange', label: 'Naranja' },
  { value: 'turquoise', label: 'Turquesa' },
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'violet', label: 'Violeta' }
] as const;

export function sanitizeRoomCode(value: string): string {
  return Array.from(value.toLocaleUpperCase('es'))
    .filter(character => ROOM_CODE_ALPHABET.includes(character))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
}

export function rejectedCodeCharacters(value: string): readonly string[] {
  return [...new Set(Array.from(value.toLocaleUpperCase('es'))
    .filter(character => !/\s/.test(character) && !ROOM_CODE_ALPHABET.includes(character)))];
}

export function isRoomCode(value: unknown): value is RoomCode {
  return typeof value === 'string' && value.length === ROOM_CODE_LENGTH &&
    Array.from(value).every(character => ROOM_CODE_ALPHABET.includes(character));
}

export function createRoomCode(random: () => number): RoomCode {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const index = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    return ROOM_CODE_ALPHABET[index]!;
  }).join('');
}

export function colorLabel(color: GameColor): string {
  if (color === 'yellow') return 'Amarillo';
  return PASSWORD_GUEST_COLORS.find(option => option.value === color)?.label ?? color;
}

