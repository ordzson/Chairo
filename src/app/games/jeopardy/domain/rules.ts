import {
  JEOPARDY_COLORS,
  MAX_PLAYERS,
  SPECIAL_COUNT,
  cellId,
  cellPoints,
  cellValue,
  isValidSetup,
  nextPlayerAfter,
  normalizeWager,
  playingPlayers,
  stealOrder,
  wagerLimit,
  type JeopardyCell,
  type JeopardyPhase,
  type JeopardyPlayer,
  type JeopardyRoom,
  type JeopardySetup,
  type JeopardyStatus
} from './jeopardy';
import { JeopardyError, type JeopardySeatDraft } from './jeopardy.port';

/**
 * La sala completa, con preguntas y respuestas. Es lo que guarda el adaptador
 * sin backend; con Supabase vive repartida en `jeopardy_rooms`,
 * `jeopardy_players` y `jeopardy_cells`.
 *
 * Cada regla de este archivo tiene su gemela en `supabase/schema.sql`, con los
 * mismos mensajes, para que jugar con o sin backend sea el mismo juego.
 */
export interface JeopardyState {
  readonly code: string;
  readonly status: JeopardyStatus;
  readonly phase: JeopardyPhase;
  readonly setup: JeopardySetup;
  readonly players: readonly JeopardyPlayer[];
  readonly turnPlayerId: string | null;
  readonly activeCellId: string | null;
  readonly attemptPlayerId: string | null;
  /** Quienes todavía pueden robar la casilla abierta; el primero decide. */
  readonly stealQueue: readonly string[];
  readonly wager: number | null;
  readonly message: string;
  readonly cells: readonly JeopardyCell[];
}

export function openRoom(code: string, setup: JeopardySetup, hostId: string, hostName: string): JeopardyState {
  if (!isValidSetup(setup)) throw new JeopardyError('invalid-move');
  const name = validName(hostName);
  return {
    code,
    status: 'waiting',
    phase: 'waiting',
    setup,
    players: [{ id: hostId, name, color: null, isHost: true, plays: false, score: 0 }],
    turnPlayerId: null,
    activeCellId: null,
    attemptPlayerId: null,
    stealQueue: [],
    wager: null,
    message: 'Sala abierta.',
    cells: []
  };
}

export function joinRoom(state: JeopardyState, playerId: string, draft: JeopardySeatDraft): JeopardyState {
  if (state.players.some(player => player.id === playerId)) return state;
  if (state.status !== 'waiting') throw new JeopardyError('room-started');
  if (playingPlayers(state.players).length >= MAX_PLAYERS) throw new JeopardyError('room-full');
  const name = validName(draft.name);
  const key = name.toLocaleLowerCase('es');
  if (state.players.some(player => player.name.toLocaleLowerCase('es') === key)) throw new JeopardyError('name-taken');
  if (!JEOPARDY_COLORS.some(option => option.value === draft.color) ||
    state.players.some(player => player.color === draft.color)) {
    throw new JeopardyError('color-taken');
  }
  const player: JeopardyPlayer = { id: playerId, name, color: draft.color, isHost: false, plays: true, score: 0 };
  return { ...state, players: [...state.players, player], message: `${name} entró a la sala.` };
}

export function startGame(state: JeopardyState, selfId: string | null, cells: readonly JeopardyCell[]): JeopardyState {
  const host = requireHost(state, selfId);
  if (state.status !== 'waiting') throw new JeopardyError('room-started');
  // El anfitrión solo juega si nadie más entró; sin invitados el amarillo está libre.
  const players = playingPlayers(state.players).length > 0
    ? state.players
    : state.players.map(player => player.id === host.id ? { ...player, plays: true, color: 'yellow' as const } : player);
  const first = nextPlayerAfter(players, null)!;

  const { rows, columns, doubleCount } = state.setup;
  const board = cells.map(cell => ({ ...cell, id: cellId(cell.column, cell.row), value: cellValue(cell.row), used: false }));
  const ids = new Set(board.map(cell => cell.id));
  const valid = board.length === rows * columns && ids.size === board.length &&
    board.every(cell => Number.isInteger(cell.column) && cell.column >= 0 && cell.column < columns &&
      Number.isInteger(cell.row) && cell.row >= 0 && cell.row < rows &&
      !(cell.special && cell.double) && cell.category.trim() !== '' &&
      cell.question.prompt.trim() !== '' && cell.question.answer.trim() !== '') &&
    board.filter(cell => cell.special).length === SPECIAL_COUNT &&
    board.filter(cell => cell.double).length === doubleCount;
  if (!valid) throw new JeopardyError('invalid-move');

  return {
    ...state,
    status: 'playing',
    phase: 'board',
    players: players.map(player => ({ ...player, score: 0 })),
    cells: board,
    turnPlayerId: first.id,
    activeCellId: null,
    attemptPlayerId: null,
    stealQueue: [],
    wager: null,
    message: `Turno de ${first.name}.`
  };
}

export function selectCell(state: JeopardyState, selfId: string | null, id: string): JeopardyState {
  const self = requireSeat(state, selfId);
  if (state.phase !== 'board') throw new JeopardyError('invalid-move');
  if (state.turnPlayerId !== self.id) throw new JeopardyError('not-your-turn');
  const cell = state.cells.find(item => item.id === id && !item.used);
  if (!cell) throw new JeopardyError('invalid-move');
  return {
    ...state,
    activeCellId: cell.id,
    attemptPlayerId: self.id,
    stealQueue: [],
    wager: null,
    phase: cell.special ? 'wager' : 'question',
    message: cell.special
      ? `${self.name} encontró una apuesta especial.`
      : `${self.name} responde por ${cellPoints(cell, null)} puntos.`
  };
}

export function placeWager(state: JeopardyState, selfId: string | null, value: number): JeopardyState {
  const self = requireSeat(state, selfId);
  if (state.phase !== 'wager') throw new JeopardyError('invalid-move');
  if (state.turnPlayerId !== self.id) throw new JeopardyError('not-your-turn');
  const wager = normalizeWager(value, wagerLimit(self.score, state.cells));
  return { ...state, wager, phase: 'question', message: `${self.name} apuesta ${wager} puntos.` };
}

export function markAnswered(state: JeopardyState, selfId: string | null): JeopardyState {
  const self = requireSeat(state, selfId);
  if (state.phase !== 'question') throw new JeopardyError('invalid-move');
  if (state.attemptPlayerId !== self.id) throw new JeopardyError('not-your-turn');
  return { ...state, phase: 'judging', message: `${self.name} dio su respuesta. El anfitrión decide.` };
}

/** Cada intento suma o resta lo que está en juego, también al robar. */
export function judgeAnswer(state: JeopardyState, selfId: string | null, correct: boolean): JeopardyState {
  requireHost(state, selfId);
  if (state.phase !== 'judging') throw new JeopardyError('invalid-move');
  const cell = activeCell(state);
  const attempt = state.players.find(player => player.id === state.attemptPlayerId);
  if (!attempt) throw new JeopardyError('invalid-move');

  const points = cellPoints(cell, state.wager) ?? 0;
  const players = state.players.map(player => player.id === attempt.id
    ? { ...player, score: player.score + (correct ? points : -points) }
    : player);
  if (correct) return closeClue({ ...state, players }, `${attempt.name} acertó y suma ${points}.`);

  // Con cola ya abierta falló quien robaba, que es el primero de la cola.
  const queue = state.stealQueue.length > 0 ? state.stealQueue.slice(1) : stealOrder(players, attempt.id);
  if (queue.length === 0) return closeClue({ ...state, players }, `${attempt.name} falló y pierde ${points}.`);

  const next = players.find(player => player.id === queue[0]);
  return {
    ...state,
    players,
    phase: 'steal',
    stealQueue: queue,
    attemptPlayerId: null,
    message: `${attempt.name} pierde ${points}. ${next?.name ?? ''} puede robar.`
  };
}

export function acceptSteal(state: JeopardyState, selfId: string | null): JeopardyState {
  const self = requireSeat(state, selfId);
  if (state.phase !== 'steal') throw new JeopardyError('invalid-move');
  if (state.stealQueue[0] !== self.id) throw new JeopardyError('not-your-turn');
  const points = cellPoints(activeCell(state), state.wager);
  return { ...state, phase: 'question', attemptPlayerId: self.id, message: `${self.name} intenta robar por ${points} puntos.` };
}

export function passSteal(state: JeopardyState, selfId: string | null): JeopardyState {
  const self = requireSeat(state, selfId);
  if (state.phase !== 'steal') throw new JeopardyError('invalid-move');
  if (state.stealQueue[0] !== self.id) throw new JeopardyError('not-your-turn');
  const queue = state.stealQueue.slice(1);
  if (queue.length === 0) return closeClue(state, `${self.name} dejó pasar el robo.`);
  const next = state.players.find(player => player.id === queue[0]);
  return { ...state, stealQueue: queue, message: `${self.name} pasa. ${next?.name ?? ''} puede robar.` };
}

/**
 * «Jugar otra vez»: misma sala y mismos jugadores, tablero nuevo y puntos en
 * cero. El anfitrión vuelve a conducir aunque la ronda anterior la jugara solo.
 */
export function reopenRoom(state: JeopardyState, selfId: string | null, setup: JeopardySetup): JeopardyState {
  const host = requireHost(state, selfId);
  if (state.status === 'playing') throw new JeopardyError('room-started');
  if (!isValidSetup(setup)) throw new JeopardyError('invalid-move');

  return {
    ...state,
    setup,
    status: 'waiting',
    phase: 'waiting',
    players: state.players.map(player => player.id === host.id
      ? { ...player, plays: false, color: null, score: 0 }
      : { ...player, score: 0 }),
    cells: [],
    turnPlayerId: null,
    activeCellId: null,
    attemptPlayerId: null,
    stealQueue: [],
    wager: null,
    message: 'Sala lista para otra ronda.'
  };
}

/** Retirarse a mitad de ronda rompería el orden de turnos de los demás. */
export function leaveRoom(state: JeopardyState, selfId: string | null): JeopardyState {
  const self = state.players.find(player => player.id === selfId);
  if (!self) return state;
  if (self.isHost) throw new JeopardyError('not-host');
  if (state.status === 'playing') throw new JeopardyError('room-started');
  return {
    ...state,
    players: state.players.filter(player => player.id !== self.id),
    message: `${self.name} salió de la sala.`
  };
}

/** Lo que ve un asiento. La misma regla que `jeopardy_snapshot` en la base. */
export function viewRoom(state: JeopardyState, selfId: string | null): JeopardyRoom {
  const self = state.players.find(player => player.id === selfId) ?? null;
  const cell = self ? state.cells.find(item => item.id === state.activeCellId) ?? null : null;
  const judging = self?.isHost === true && state.phase === 'judging';
  return {
    code: state.code,
    status: state.status,
    phase: state.phase,
    setup: state.setup,
    players: state.players,
    selfId: self?.id ?? null,
    turnPlayerId: state.turnPlayerId,
    attemptPlayerId: state.attemptPlayerId,
    stealQueue: state.stealQueue,
    wager: state.wager,
    message: state.message,
    board: state.cells.map(({ id, column, row, category, value, used }) => ({ id, column, row, category, value, used })),
    clue: cell ? {
      id: cell.id,
      category: cell.question.category,
      value: cell.value,
      points: cellPoints(cell, state.wager),
      special: cell.special,
      double: cell.double,
      prompt: state.phase === 'wager' ? null : cell.question.prompt,
      answer: judging ? cell.question.answer : null,
      reference: judging ? cell.question.reference || null : null
    } : null
  };
}

export function isJeopardyState(value: unknown): value is JeopardyState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<JeopardyState>;
  return typeof candidate.code === 'string' &&
    typeof candidate.phase === 'string' &&
    typeof candidate.status === 'string' &&
    !!candidate.setup && isValidSetup(candidate.setup) &&
    Array.isArray(candidate.players) &&
    Array.isArray(candidate.cells) &&
    Array.isArray(candidate.stealQueue);
}

/** Cierra la casilla y pasa el turno a quien sigue a quien la eligió, aunque la haya ganado otro. */
function closeClue(state: JeopardyState, result: string): JeopardyState {
  const cells = state.cells.map(cell => cell.id === state.activeCellId ? { ...cell, used: true } : cell);
  const cleared = { ...state, cells, activeCellId: null, attemptPlayerId: null, stealQueue: [], wager: null };
  if (cells.every(cell => cell.used)) {
    return { ...cleared, status: 'finished', phase: 'finished', turnPlayerId: null, message: `${result} Tablero completo.` };
  }
  const next = nextPlayerAfter(state.players, state.turnPlayerId);
  return { ...cleared, phase: 'board', turnPlayerId: next?.id ?? null, message: `${result} Turno de ${next?.name ?? ''}.` };
}

function activeCell(state: JeopardyState): JeopardyCell {
  const cell = state.cells.find(item => item.id === state.activeCellId);
  if (!cell) throw new JeopardyError('invalid-move');
  return cell;
}

function requireSeat(state: JeopardyState, selfId: string | null): JeopardyPlayer {
  const self = state.players.find(player => player.id === selfId);
  if (!self) throw new JeopardyError('not-seated');
  return self;
}

function requireHost(state: JeopardyState, selfId: string | null): JeopardyPlayer {
  const self = requireSeat(state, selfId);
  if (!self.isHost) throw new JeopardyError('not-host');
  return self;
}

function validName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 24) throw new JeopardyError('invalid-move');
  return name;
}
