import type { GameColor } from '../../../game';
import { DIFFICULTIES, isMatchSetup, type HostRole, type MatchSetup } from './setup-config';

/**
 * Códigos de sala de cuatro caracteres. Se excluyen `0`, `O`, `1` e `I`: el
 * código se dicta en voz alta y se teclea en otro teléfono, así que ninguna
 * pareja de caracteres puede confundirse al leerla.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

/** Los colores de capítulo, uno por asiento; el anfitrión hereda el amarillo. */
export const PARTICIPANT_COLORS: readonly { readonly value: GameColor; readonly label: string }[] = [
  { value: 'yellow', label: 'Amarillo' },
  { value: 'orange', label: 'Naranja' },
  { value: 'turquoise', label: 'Turquesa' },
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'violet', label: 'Violeta' }
] as const;

/**
 * De 2 a 6 participantes. El tope no se escribe aparte: el color identificador
 * es único dentro de la sala, así que hay exactamente un asiento por color y
 * el catálogo es el techo. Escribirlo dos veces fue lo que dejó prometidos
 * ocho asientos que la sala nunca pudo dar.
 *
 * `supabase/schema.sql` repite el número en `guard_participant_insert()`,
 * porque el disparador no puede leer de aquí: si el catálogo cambia, cambia
 * también el `if taken >= 6` de ese archivo.
 */
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = PARTICIPANT_COLORS.length;

/** Tope del nombre visible; `supabase/schema.sql` lo repite en `participants.name`. */
export const MAX_NAME_LENGTH = 24;

export type RoomCode = string;
export type ParticipantRole = 'host' | 'guest';
export type ParticipantStatus = 'joining' | 'ready';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface Participant {
  readonly id: string;
  readonly name: string;
  readonly role: ParticipantRole;
  readonly status: ParticipantStatus;
  /** Color identificador elegido al unirse; el anfitrión hereda el amarillo. */
  readonly color: GameColor;
  /** Un anfitrión en modo «Solo anfitrión» conduce la partida sin responder. */
  readonly plays: boolean;
}

export interface Room {
  readonly code: RoomCode;
  readonly setup: MatchSetup;
  readonly participants: readonly Participant[];
  readonly createdAt: number;
  /** Ausente solo en instantáneas locales creadas antes de existir la partida. */
  readonly status?: RoomStatus;
}

/** Deja pasar solo lo que puede formar un código, ya en mayúsculas. */
export function sanitizeRoomCode(value: string): string {
  return Array.from(value.toLocaleUpperCase('es'))
    .filter(character => ROOM_CODE_ALPHABET.includes(character))
    .slice(0, ROOM_CODE_LENGTH)
    .join('');
}

/** Lo que se descartó al escribir, para poder explicar por qué. */
export function rejectedCodeCharacters(value: string): readonly string[] {
  const rejected = Array.from(value.toLocaleUpperCase('es'))
    .filter(character => !/\s/.test(character) && !ROOM_CODE_ALPHABET.includes(character));
  return [...new Set(rejected)];
}

export function colorLabel(color: GameColor): string {
  return PARTICIPANT_COLORS.find(option => option.value === color)?.label ?? '';
}

export function takenColors(room: Room): ReadonlySet<GameColor> {
  return new Set(room.participants.map(participant => participant.color));
}

export function isRoomCode(value: unknown): value is RoomCode {
  return typeof value === 'string' &&
    value.length === ROOM_CODE_LENGTH &&
    Array.from(value).every(character => ROOM_CODE_ALPHABET.includes(character));
}

/** `random` devuelve valores en [0, 1); se inyecta para poder fijarlo en pruebas. */
export function createRoomCode(random: () => number): RoomCode {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const position = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    code += ROOM_CODE_ALPHABET[position];
  }
  return code;
}

/** El anfitrión aparece con el nombre que escribió, igual que cualquier invitado. */
export function hostParticipant(hostRole: HostRole, name: string): Participant {
  return {
    id: 'host',
    name: name.trim(),
    role: 'host',
    status: 'ready',
    color: 'yellow',
    plays: hostRole === 'player'
  };
}

export function hostRoleLabel(hostRole: HostRole): string {
  return hostRole === 'player' ? 'Anfitrión · jugando' : 'Solo anfitrión';
}

export function difficultyLabel(setup: MatchSetup): string {
  return DIFFICULTIES.find(option => option.value === setup.difficulty)?.label ?? '';
}

export function setupSummary(setup: MatchSetup): string {
  return `${difficultyLabel(setup)} · ${setup.questionCount} preguntas`;
}

export function participantStatusLabel(participant: Participant): string {
  if (participant.role === 'host') return 'anfitrión';
  return participant.status === 'ready' ? 'listo' : 'entrando';
}

export function guestsReady(room: Room): readonly Participant[] {
  return room.participants.filter(participant => participant.role === 'guest' && participant.status === 'ready');
}

/** La partida solo puede empezar cuando hay al menos otra persona lista. */
export function canStartMatch(room: Room): boolean {
  return guestsReady(room).length > 0;
}

export function isRoomFull(room: Room): boolean {
  return room.participants.length >= MAX_PARTICIPANTS;
}

export function isParticipant(value: unknown): value is Participant {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Participant>;
  return typeof candidate.id === 'string' && candidate.id.length > 0 &&
    typeof candidate.name === 'string' && candidate.name.length > 0 &&
    (candidate.role === 'host' || candidate.role === 'guest') &&
    (candidate.status === 'joining' || candidate.status === 'ready') &&
    typeof candidate.color === 'string' &&
    typeof candidate.plays === 'boolean';
}

export function isRoom(value: unknown): value is Room {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Room>;
  return isRoomCode(candidate.code) &&
    isMatchSetup(candidate.setup) &&
    Array.isArray(candidate.participants) &&
    candidate.participants.length > 0 &&
    candidate.participants.length <= MAX_PARTICIPANTS &&
    candidate.participants.every(isParticipant) &&
    typeof candidate.createdAt === 'number' &&
    (candidate.status === undefined || candidate.status === 'waiting' || candidate.status === 'playing' || candidate.status === 'finished');
}
