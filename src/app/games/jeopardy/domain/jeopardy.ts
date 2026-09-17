import type { GameColor } from '../../../game';

export type QuestionLevel = 'easy' | 'medium' | 'hard' | 'extreme';
export type JeopardyPhase = 'waiting' | 'board' | 'wager' | 'question' | 'judging' | 'steal' | 'finished';
export type JeopardyStatus = 'waiting' | 'playing' | 'finished';

export interface JeopardyQuestion {
  readonly level: QuestionLevel;
  readonly category: string;
  readonly prompt: string;
  readonly answer: string;
  readonly reference: string;
}

export interface JeopardySetup {
  readonly rows: number;
  readonly columns: number;
  readonly doubleCount: number;
}

export interface JeopardyPlayer {
  readonly id: string;
  readonly name: string;
  /** El anfitrión conduce sin color; solo toma el amarillo si juega solo. */
  readonly color: GameColor | null;
  readonly isHost: boolean;
  /** El anfitrión solo juega cuando nadie más entró a la sala. */
  readonly plays: boolean;
  readonly score: number;
}

/** Casilla completa, con pregunta y respuesta. Nunca llega entera a un jugador. */
export interface JeopardyCell {
  readonly id: string;
  readonly column: number;
  readonly row: number;
  readonly category: string;
  readonly value: number;
  readonly question: JeopardyQuestion;
  readonly special: boolean;
  readonly double: boolean;
  readonly used: boolean;
}

/** Lo que cualquiera ve de una casilla en el tablero. */
export interface JeopardyTile {
  readonly id: string;
  readonly column: number;
  readonly row: number;
  readonly category: string;
  readonly value: number;
  readonly used: boolean;
}

/** La casilla abierta, con lo que cada asiento puede ver de ella. */
export interface JeopardyClue {
  readonly id: string;
  /** La de la pregunta: una apuesta especial trae una extrema de otra categoría. */
  readonly category: string;
  readonly value: number;
  /** Lo que suma o resta cada intento; `null` mientras se decide la apuesta. */
  readonly points: number | null;
  readonly special: boolean;
  readonly double: boolean;
  /** Oculta hasta que se fija la apuesta. */
  readonly prompt: string | null;
  /** Solo la recibe el anfitrión, y solo mientras juzga. */
  readonly answer: string | null;
  readonly reference: string | null;
}

/**
 * La sala tal como la ve un asiento. Los dos adaptadores devuelven esta forma
 * y ninguno entrega la respuesta a quien no juzga.
 */
export interface JeopardyRoom {
  readonly code: string;
  readonly status: JeopardyStatus;
  readonly phase: JeopardyPhase;
  readonly setup: JeopardySetup;
  readonly players: readonly JeopardyPlayer[];
  /** Asiento de este dispositivo, o `null` si todavía no entró. */
  readonly selfId: string | null;
  readonly turnPlayerId: string | null;
  readonly attemptPlayerId: string | null;
  readonly stealQueue: readonly string[];
  readonly wager: number | null;
  readonly message: string;
  readonly board: readonly JeopardyTile[];
  readonly clue: JeopardyClue | null;
}

export const JEOPARDY_COLORS: readonly { value: GameColor; label: string }[] = [
  { value: 'yellow', label: 'Amarillo' },
  { value: 'orange', label: 'Naranja' },
  { value: 'turquoise', label: 'Turquesa' },
  { value: 'violet', label: 'Violeta' }
] as const;

/*
 * `supabase/schema.sql` repite estos límites en los `check` de
 * `jeopardy_rooms` y en `join_jeopardy_room`: si cambian aquí, cambian allí.
 */
export const MIN_GRID = 3;
export const MAX_COLUMNS = 8;
export const MAX_ROWS = 8;
export const SPECIAL_COUNT = 2;
/** Un color por jugador. El anfitrión conduce y no cuenta. */
export const MAX_PLAYERS = JEOPARDY_COLORS.length;
export const WAGER_STEP = 100;

export function maxDoubles(rows: number, columns: number): number {
  return Math.max(0, rows * columns - SPECIAL_COUNT);
}

export function isValidSetup(setup: JeopardySetup): boolean {
  return Number.isInteger(setup.rows) && setup.rows >= MIN_GRID && setup.rows <= MAX_ROWS &&
    Number.isInteger(setup.columns) && setup.columns >= MIN_GRID && setup.columns <= MAX_COLUMNS &&
    Number.isInteger(setup.doubleCount) && setup.doubleCount >= 0 &&
    setup.doubleCount <= maxDoubles(setup.rows, setup.columns);
}

export function createJeopardyBoard(
  bank: readonly JeopardyQuestion[],
  setup: JeopardySetup,
  random: () => number = Math.random
): readonly JeopardyCell[] {
  const categories = unique(bank.filter(question => question.level !== 'extreme').map(question => question.category))
    .slice(0, setup.columns);
  if (categories.length < setup.columns) throw new Error('question-bank-insufficient');

  const levels: readonly QuestionLevel[] = ['easy', 'medium', 'hard', 'extreme'];
  const cells: JeopardyCell[] = [];
  const usedPrompts = new Set<string>();
  for (let column = 0; column < setup.columns; column += 1) {
    const category = categories[column]!;
    for (let row = 0; row < setup.rows; row += 1) {
      const level = levels[Math.min(levels.length - 1, Math.floor(row * levels.length / setup.rows))]!;
      const pool = bank.filter(question => question.category.startsWith(category.split(':')[0]!) && question.level === level && !usedPrompts.has(question.prompt));
      const fallback = bank.filter(question => question.category.startsWith(category.split(':')[0]!) && !usedPrompts.has(question.prompt));
      const question = pick(pool.length ? pool : fallback, row + column * setup.rows, random);
      usedPrompts.add(question.prompt);
      cells.push({
        id: cellId(column, row),
        column,
        row,
        category,
        value: cellValue(row),
        question,
        special: false,
        double: false,
        used: false
      });
    }
  }

  const candidates = shuffle(cells.map((_, index) => index), random);
  const specialIndexes = new Set(candidates.slice(0, Math.min(SPECIAL_COUNT, cells.length)));
  const doubleIndexes = new Set(candidates.filter(index => !specialIndexes.has(index)).slice(0, setup.doubleCount));
  const extreme = shuffle(bank.filter(question => question.level === 'extreme' && !usedPrompts.has(question.prompt)), random);
  let specialCursor = 0;
  return cells.map((cell, index) => ({
    ...cell,
    question: specialIndexes.has(index) ? (extreme[specialCursor++] ?? cell.question) : cell.question,
    special: specialIndexes.has(index),
    double: doubleIndexes.has(index)
  }));
}

export function cellId(column: number, row: number): string {
  return `${column}-${row}`;
}

/** El valor lo decide la fila: 100, 200, 300… También en la base de datos. */
export function cellValue(row: number): number {
  return (row + 1) * 100;
}

export function playingPlayers(players: readonly JeopardyPlayer[]): readonly JeopardyPlayer[] {
  return players.filter(player => player.plays);
}

/** Los turnos siguen el orden de llegada; sin referencia empieza el primero. */
export function nextPlayerAfter(players: readonly JeopardyPlayer[], playerId: string | null): JeopardyPlayer | null {
  const playing = playingPlayers(players);
  const index = playing.findIndex(player => player.id === playerId);
  return playing[(index + 1) % Math.max(1, playing.length)] ?? null;
}

/** Quién puede robar tras un fallo: el resto, empezando por quien sigue a quien falló. */
export function stealOrder(players: readonly JeopardyPlayer[], failedPlayerId: string): readonly string[] {
  const playing = playingPlayers(players);
  const index = playing.findIndex(player => player.id === failedPlayerId);
  return [...playing.slice(index + 1), ...playing.slice(0, Math.max(0, index))]
    .filter(player => player.id !== failedPlayerId)
    .map(player => player.id);
}

/** Puntos en juego: la apuesta en una especial, el doble en una doble. */
export function cellPoints(cell: Pick<JeopardyCell, 'value' | 'special' | 'double'>, wager: number | null): number | null {
  if (cell.special) return wager;
  return cell.double ? cell.value * 2 : cell.value;
}

/** Tope de la apuesta: lo que tiene quien apuesta o la casilla más alta. */
export function wagerLimit(score: number, board: readonly Pick<JeopardyTile, 'value'>[]): number {
  return Math.max(score, ...board.map(cell => cell.value), WAGER_STEP);
}

export function normalizeWager(value: number, limit: number): number {
  const rounded = Math.round((Number.isFinite(value) ? value : WAGER_STEP) / WAGER_STEP) * WAGER_STEP;
  return Math.max(WAGER_STEP, Math.min(limit, rounded));
}

export function selfPlayer(room: JeopardyRoom | null): JeopardyPlayer | null {
  if (!room?.selfId) return null;
  return room.players.find(player => player.id === room.selfId) ?? null;
}

export function playerName(room: JeopardyRoom, playerId: string | null): string {
  return room.players.find(player => player.id === playerId)?.name ?? '';
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function pick<T>(values: readonly T[], offset: number, random: () => number): T {
  if (!values.length) throw new Error('question-bank-insufficient');
  return values[(Math.floor(random() * values.length) + offset) % values.length]!;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
