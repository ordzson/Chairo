import type { GameColor } from '../../../game';
import { isRoomCode, type RoomCode } from './room';
import { isRoundSeconds, type RoundSeconds } from './setup-config';

export type PasswordPhase =
  | 'waiting'
  | 'preparing'
  | 'countdown'
  | 'playing'
  | 'scoring'
  | 'scoreboard'
  | 'finished';

export interface PasswordPlayer {
  readonly id: string;
  readonly name: string;
  readonly color: GameColor;
  readonly role: 'host' | 'guest';
  readonly score: number;
  readonly ready: boolean;
}

export interface RoundEntry {
  readonly participantId: string;
  readonly word: string;
  readonly guessed: boolean | null;
}

export interface PasswordSnapshot {
  readonly code: RoomCode;
  readonly phase: PasswordPhase;
  readonly roundNumber: number;
  readonly roundSeconds: RoundSeconds;
  readonly wordVisibleAt: number | null;
  readonly deadlineAt: number | null;
  readonly serverNow: number;
  readonly self: PasswordPlayer;
  readonly players: readonly PasswordPlayer[];
  readonly selfWord: string | null;
  readonly revealedEntries: readonly RoundEntry[];
  readonly roundDeltas: Readonly<Record<string, 0 | 1>>;
}

export interface PasswordRound {
  readonly number: number;
  readonly entries: readonly RoundEntry[];
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly scoredAt: number | null;
}

/** Estado completo: solo vive en el adaptador o en tablas protegidas. */
export interface PasswordState {
  readonly code: RoomCode;
  readonly roundSeconds: RoundSeconds;
  readonly phase: PasswordPhase;
  readonly roundNumber: number;
  readonly wordVisibleAt: number | null;
  readonly deadlineAt: number | null;
  readonly players: readonly PasswordPlayer[];
  readonly rounds: readonly PasswordRound[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type PasswordErrorReason =
  | 'room-not-found'
  | 'room-full'
  | 'room-started'
  | 'name-taken'
  | 'color-taken'
  | 'code-unavailable'
  | 'not-host'
  | 'not-seated'
  | 'invalid-phase'
  | 'players-required'
  | 'bank-insufficient'
  | 'invalid-results'
  | 'unavailable';

export const PASSWORD_ERROR_REASONS: readonly PasswordErrorReason[] = [
  'room-not-found', 'room-full', 'room-started', 'name-taken', 'color-taken',
  'code-unavailable', 'not-host', 'not-seated', 'invalid-phase',
  'players-required', 'bank-insufficient', 'invalid-results'
];

export class PasswordError extends Error {
  constructor(readonly reason: PasswordErrorReason, message: string = reason) {
    super(message);
    this.name = 'PasswordError';
  }
}

export function passwordErrorFrom(message: string): PasswordError {
  const reason = PASSWORD_ERROR_REASONS.find(candidate => message.includes(candidate)) ?? 'unavailable';
  return new PasswordError(reason, message);
}

export function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function validateWordBank(words: readonly string[]): readonly string[] {
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    const word = raw.trim();
    if (word.length === 0 || word.length > 32) throw new PasswordError('bank-insufficient');
    const key = normalizeWord(word);
    if (!seen.has(key)) {
      seen.add(key);
      valid.push(word);
    }
  }
  if (valid.length < 2) throw new PasswordError('bank-insufficient');
  return valid;
}

export function openPasswordRoom(
  code: RoomCode,
  hostId: string,
  hostName: string,
  roundSeconds: RoundSeconds,
  now: number
): PasswordState {
  const name = validName(hostName);
  return {
    code,
    roundSeconds,
    phase: 'waiting',
    roundNumber: 0,
    wordVisibleAt: null,
    deadlineAt: null,
    players: [{ id: hostId, name, color: 'yellow', role: 'host', score: 0, ready: false }],
    rounds: [],
    createdAt: now,
    updatedAt: now
  };
}

export function joinPasswordRoom(
  state: PasswordState,
  playerId: string,
  nameValue: string,
  color: GameColor,
  now: number
): PasswordState {
  if (state.phase !== 'waiting') throw new PasswordError('room-started');
  if (state.players.length >= 2) throw new PasswordError('room-full');
  const name = validName(nameValue);
  if (state.players.some(player => normalizeWord(player.name) === normalizeWord(name))) {
    throw new PasswordError('name-taken');
  }
  if (state.players.some(player => player.color === color)) throw new PasswordError('color-taken');
  return touch(state, {
    players: [...state.players, { id: playerId, name, color, role: 'guest', score: 0, ready: false }]
  }, now);
}

export function startPasswordMatch(state: PasswordState, selfId: string | null, now: number): PasswordState {
  requireHost(state, selfId);
  if (state.phase !== 'waiting') throw new PasswordError('invalid-phase');
  if (state.players.length !== 2) throw new PasswordError('players-required');
  return touch(state, {
    phase: 'preparing',
    roundNumber: 1,
    players: state.players.map(player => ({ ...player, ready: false }))
  }, now);
}

export function setPasswordReady(
  state: PasswordState,
  selfId: string | null,
  ready: boolean,
  words: readonly string[],
  now: number,
  random: () => number
): PasswordState {
  requireSeat(state, selfId);
  if (state.phase !== 'preparing') throw new PasswordError('invalid-phase');
  const players = state.players.map(player => player.id === selfId ? { ...player, ready } : player);
  if (!players.every(player => player.ready)) return touch(state, { players }, now);

  const entries = selectRoundEntries(state, players, words, random);
  const visibleAt = now + 3_000;
  const round: PasswordRound = {
    number: state.roundNumber,
    entries,
    startedAt: visibleAt,
    endedAt: null,
    scoredAt: null
  };
  return touch(state, {
    phase: 'countdown',
    players,
    wordVisibleAt: visibleAt,
    deadlineAt: visibleAt + state.roundSeconds * 1_000,
    rounds: [...state.rounds, round]
  }, now);
}

export function endPasswordRound(state: PasswordState, selfId: string | null, now: number): PasswordState {
  requireHost(state, selfId);
  if (effectivePhase(state, now) !== 'playing') throw new PasswordError('invalid-phase');
  const rounds = updateCurrentRound(state, round => ({ ...round, endedAt: now }));
  return touch(state, { phase: 'scoring', rounds }, now);
}

export function scorePasswordRound(
  state: PasswordState,
  selfId: string | null,
  results: Readonly<Record<string, boolean>>,
  now: number
): PasswordState {
  requireHost(state, selfId);
  const current = currentRound(state);
  if (state.phase === 'scoreboard' && current?.scoredAt !== null) return state;
  if (state.phase !== 'scoring' || !current) throw new PasswordError('invalid-phase');
  const ids = state.players.map(player => player.id).sort();
  const submitted = Object.keys(results).sort();
  if (ids.length !== 2 || submitted.length !== 2 || ids.some((id, index) => id !== submitted[index]) ||
    submitted.some(id => typeof results[id] !== 'boolean')) {
    throw new PasswordError('invalid-results');
  }
  const entries = current.entries.map(entry => ({ ...entry, guessed: results[entry.participantId]! }));
  const rounds = updateCurrentRound(state, round => ({ ...round, entries, scoredAt: now }));
  const players = state.players.map(player => ({
    ...player,
    score: player.score + (results[player.id] ? 1 : 0)
  }));
  return touch(state, { phase: 'scoreboard', players, rounds }, now);
}

export function preparePasswordRound(state: PasswordState, selfId: string | null, now: number): PasswordState {
  requireHost(state, selfId);
  if (state.phase !== 'scoreboard') throw new PasswordError('invalid-phase');
  return touch(state, {
    phase: 'preparing',
    roundNumber: state.roundNumber + 1,
    wordVisibleAt: null,
    deadlineAt: null,
    players: state.players.map(player => ({ ...player, ready: false }))
  }, now);
}

export function finishPasswordMatch(state: PasswordState, selfId: string | null, now: number): PasswordState {
  requireHost(state, selfId);
  if (state.phase !== 'scoreboard') throw new PasswordError('invalid-phase');
  return touch(state, { phase: 'finished', wordVisibleAt: null, deadlineAt: null }, now);
}

export function reopenPasswordRoom(
  state: PasswordState,
  selfId: string | null,
  roundSeconds: RoundSeconds,
  now: number
): PasswordState {
  requireHost(state, selfId);
  if (state.phase !== 'finished') throw new PasswordError('invalid-phase');
  return touch(state, {
    roundSeconds,
    phase: 'waiting',
    roundNumber: 0,
    wordVisibleAt: null,
    deadlineAt: null,
    rounds: [],
    players: state.players.map(player => ({ ...player, score: 0, ready: false }))
  }, now);
}

export function leavePasswordRoom(state: PasswordState, selfId: string | null, now: number): PasswordState {
  requireSeat(state, selfId);
  if (state.phase !== 'waiting' && state.phase !== 'preparing') throw new PasswordError('invalid-phase');
  if (state.players.find(player => player.id === selfId)?.role === 'host') throw new PasswordError('not-host');
  return touch(state, { players: state.players.filter(player => player.id !== selfId) }, now);
}

export function passwordSnapshot(state: PasswordState, selfId: string | null, now: number): PasswordSnapshot {
  const self = requireSeat(state, selfId);
  const phase = effectivePhase(state, now);
  const round = currentRound(state);
  const secretPhase = phase === 'countdown' || phase === 'playing';
  const revealPhase = phase === 'scoring' || phase === 'scoreboard' || phase === 'finished';
  const selfWord = secretPhase
    ? round?.entries.find(entry => entry.participantId === self.id)?.word ?? null
    : null;
  const roundDeltas = Object.fromEntries(state.players.map(player => {
    const guessed = round?.entries.find(entry => entry.participantId === player.id)?.guessed;
    return [player.id, guessed === true ? 1 : 0];
  })) as Record<string, 0 | 1>;
  return {
    code: state.code,
    phase,
    roundNumber: state.roundNumber,
    roundSeconds: state.roundSeconds,
    wordVisibleAt: state.wordVisibleAt,
    deadlineAt: state.deadlineAt,
    serverNow: now,
    self: { ...self },
    players: state.players.map(player => ({ ...player })),
    selfWord,
    revealedEntries: revealPhase ? (round?.entries.map(entry => ({ ...entry })) ?? []) : [],
    roundDeltas
  };
}

export function effectivePhase(state: PasswordState, now: number): PasswordPhase {
  return state.phase === 'countdown' && state.wordVisibleAt !== null && now >= state.wordVisibleAt
    ? 'playing'
    : state.phase;
}

export function winner(snapshot: PasswordSnapshot): PasswordPlayer | null {
  if (snapshot.players.length !== 2 || snapshot.players[0]?.score === snapshot.players[1]?.score) return null;
  return snapshot.players.reduce((best, player) => player.score > best.score ? player : best);
}

export function isPasswordState(value: unknown): value is PasswordState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<PasswordState>;
  return isRoomCode(state.code) && isRoundSeconds(state.roundSeconds) &&
    isPhase(state.phase) && typeof state.roundNumber === 'number' &&
    Array.isArray(state.players) && state.players.every(isPlayer) && state.players.length > 0 && state.players.length <= 2 &&
    Array.isArray(state.rounds) && typeof state.createdAt === 'number' && typeof state.updatedAt === 'number';
}

function selectRoundEntries(
  state: PasswordState,
  players: readonly PasswordPlayer[],
  input: readonly string[],
  random: () => number
): readonly RoundEntry[] {
  const words = validateWordBank(input);
  const used = new Set(state.rounds.flatMap(round => round.entries.map(entry => normalizeWord(entry.word))));
  let pool = words.filter(word => !used.has(normalizeWord(word)));
  if (pool.length < 2) pool = [...words];
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.floor(random() * (index + 1)));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  const first = shuffled[0]!;
  const second = shuffled.find(word => normalizeWord(word) !== normalizeWord(first));
  if (!second) throw new PasswordError('bank-insufficient');
  return players.map((player, index) => ({
    participantId: player.id,
    word: index === 0 ? first : second,
    guessed: null
  }));
}

function requireSeat(state: PasswordState, selfId: string | null): PasswordPlayer {
  const player = state.players.find(candidate => candidate.id === selfId);
  if (!player) throw new PasswordError('not-seated');
  return player;
}

function validName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 24) throw new PasswordError('invalid-results');
  return name;
}

function requireHost(state: PasswordState, selfId: string | null): PasswordPlayer {
  const player = requireSeat(state, selfId);
  if (player.role !== 'host') throw new PasswordError('not-host');
  return player;
}

function currentRound(state: PasswordState): PasswordRound | undefined {
  return state.rounds.find(round => round.number === state.roundNumber);
}

function updateCurrentRound(
  state: PasswordState,
  change: (round: PasswordRound) => PasswordRound
): readonly PasswordRound[] {
  if (!currentRound(state)) throw new PasswordError('invalid-phase');
  return state.rounds.map(round => round.number === state.roundNumber ? change(round) : round);
}

function touch<T extends Partial<PasswordState>>(state: PasswordState, change: T, now: number): PasswordState {
  return { ...state, ...change, updatedAt: now };
}

function isPhase(value: unknown): value is PasswordPhase {
  return ['waiting', 'preparing', 'countdown', 'playing', 'scoring', 'scoreboard', 'finished'].includes(String(value));
}

function isPlayer(value: unknown): value is PasswordPlayer {
  if (!value || typeof value !== 'object') return false;
  const player = value as Partial<PasswordPlayer>;
  return typeof player.id === 'string' && typeof player.name === 'string' &&
    (player.role === 'host' || player.role === 'guest') && typeof player.color === 'string' &&
    typeof player.score === 'number' && typeof player.ready === 'boolean';
}
