import { expect, test } from '@playwright/test';

import { JEOPARDY_BANK } from '../src/app/games/jeopardy/domain/question-bank.generated';
import {
  MAX_PLAYERS,
  SPECIAL_COUNT,
  cellId,
  cellValue,
  createJeopardyBoard,
  nextPlayerAfter,
  normalizeWager,
  stealOrder,
  type JeopardyCell,
  type JeopardyPlayer,
  type JeopardySetup
} from '../src/app/games/jeopardy/domain/jeopardy';
import { JeopardyError, jeopardyErrorFrom } from '../src/app/games/jeopardy/domain/jeopardy.port';
import {
  acceptSteal,
  answerKey,
  endTurn,
  expireCountdown,
  joinRoom,
  judgeAnswer,
  leaveRoom,
  markAnswered,
  openRoom,
  passSteal,
  placeWager,
  reopenRoom,
  selectCell,
  startCountdown,
  startGame,
  viewRoom,
  type JeopardyState
} from '../src/app/games/jeopardy/domain/rules';

/*
 * Las mismas jugadas que comprueba contra Postgres la prueba de
 * `supabase/schema.sql`: ambas versiones de las reglas tienen que coincidir.
 */

const setup: JeopardySetup = { rows: 3, columns: 3, doubleCount: 1 };

/** Tablero fijo: apuestas especiales en 0-1 y 2-2, doble en 1-0. */
function fixedBoard(rows = 3, columns = 3, specials = ['0-1', '2-2'], doubles = ['1-0']): JeopardyCell[] {
  const cells: JeopardyCell[] = [];
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const id = cellId(column, row);
      cells.push({
        id, column, row, category: `Cat${column}`, value: cellValue(row),
        question: { level: 'easy', category: `Q${column}`, prompt: `P${column}${row}`, answer: `A${column}${row}`, reference: `Ref ${column}${row}` },
        special: specials.includes(id), double: doubles.includes(id), used: false
      });
    }
  }
  return cells;
}

/** Ana conduce; Rut, Leo y Eva juegan en ese orden. */
function withPlayers(): JeopardyState {
  let state = openRoom('ABCD', setup, 'ana', 'Ana');
  state = joinRoom(state, 'rut', { name: 'Rut', color: 'orange' });
  state = joinRoom(state, 'leo', { name: 'Leo', color: 'turquoise' });
  return joinRoom(state, 'eva', { name: 'Eva', color: 'violet' });
}

function player(state: JeopardyState, id: string): JeopardyPlayer {
  return state.players.find(item => item.id === id)!;
}

function reason(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof JeopardyError ? error.reason : String(error);
  }
  return 'sin error';
}

test('el orden de turnos y de robo sigue a quien falló', () => {
  const players = ['a', 'b', 'c'].map(id => ({ id, plays: true }) as JeopardyPlayer);
  expect(nextPlayerAfter(players, null)?.id).toBe('a');
  expect(nextPlayerAfter(players, 'c')?.id).toBe('a');
  expect(stealOrder(players, 'b')).toEqual(['c', 'a']);
  expect(stealOrder(players, 'a')).toEqual(['b', 'c']);
  expect(normalizeWager(99_999, 300)).toBe(300);
  expect(normalizeWager(-50, 300)).toBe(100);
  expect(normalizeWager(249, 800)).toBe(200);
});

test('una ronda completa: fallos, robos, apuesta especial y doble', () => {
  let state = startGame(withPlayers(), 'ana', fixedBoard());
  expect(player(state, 'ana')).toMatchObject({ plays: false, color: null });
  expect(state.turnPlayerId).toBe('rut');
  expect(state.message).toBe('Turno de Rut.');
  expect(reason(() => selectCell(state, 'ana', '0-0'))).toBe('not-your-turn');
  expect(reason(() => selectCell(state, 'leo', '0-0'))).toBe('not-your-turn');

  // Rut falla, el robo se abre a Leo y Eva, Leo lo pide primero y falla, Eva pasa.
  state = selectCell(state, 'rut', '0-0');
  expect(viewRoom(state, 'rut').clue).toMatchObject({ prompt: 'P00', answer: null });
  // El anfitrión tiene la respuesta desde que la pregunta está a la vista.
  expect(viewRoom(state, 'ana').clue).toMatchObject({ answer: 'A00', reference: 'Ref 00' });
  state = markAnswered(state, 'rut');
  expect(viewRoom(state, 'leo').clue).toMatchObject({ prompt: 'P00', answer: null, reference: null });
  expect(viewRoom(state, null).clue).toBeNull();
  expect(reason(() => judgeAnswer(state, 'rut', true))).toBe('not-host');
  state = judgeAnswer(state, 'ana', false);
  expect(state.stealQueue).toEqual(['leo', 'eva']);
  expect(state.message).toBe('Rut pierde 100. Roba quien lo pida primero.');
  expect(reason(() => acceptSteal(state, 'rut'))).toBe('not-your-turn');
  state = acceptSteal(state, 'leo');
  expect(state.stealQueue).toEqual(['eva']);
  expect(reason(() => acceptSteal(state, 'eva'))).toBe('steal-taken');
  state = judgeAnswer(markAnswered(state, 'leo'), 'ana', false);
  expect(player(state, 'leo').score).toBe(-100);
  expect(state.phase).toBe('steal');
  expect(state.stealQueue).toEqual(['eva']);
  expect(reason(() => acceptSteal(state, 'leo'))).toBe('not-your-turn');
  state = passSteal(state, 'eva');
  expect(state.phase).toBe('board');
  expect(state.turnPlayerId).toBe('leo');
  expect(state.message).toBe('Eva dejó pasar el robo. Turno de Leo.');

  // Leo encuentra una apuesta especial: la pregunta espera a la apuesta.
  state = selectCell(state, 'leo', '0-1');
  expect(viewRoom(state, 'leo').clue).toMatchObject({ prompt: null, special: true, points: null, category: 'Q0' });
  state = placeWager(state, 'leo', 99_999);
  expect(state.wager).toBe(300);
  state = judgeAnswer(markAnswered(state, 'leo'), 'ana', true);
  expect(player(state, 'leo').score).toBe(200);
  expect(state.turnPlayerId).toBe('eva');

  // Eva falla la doble; Rut roba y acierta.
  state = selectCell(state, 'eva', '1-0');
  expect(viewRoom(state, 'eva').clue?.points).toBe(200);
  state = judgeAnswer(markAnswered(state, 'eva'), 'ana', false);
  expect(state.stealQueue).toEqual(['rut', 'leo']);
  state = judgeAnswer(markAnswered(acceptSteal(state, 'rut'), 'rut'), 'ana', true);
  expect(player(state, 'rut').score).toBe(100);
  expect(player(state, 'eva').score).toBe(-200);
  expect(state.turnPlayerId).toBe('rut');

  for (let guard = 0; state.status !== 'finished' && guard < 20; guard += 1) {
    const chooser = state.turnPlayerId!;
    state = selectCell(state, chooser, state.cells.find(cell => !cell.used)!.id);
    if (state.phase === 'wager') state = placeWager(state, chooser, 150);
    state = judgeAnswer(markAnswered(state, chooser), 'ana', true);
  }
  expect(state.phase).toBe('finished');
  expect(state.message).toMatch(/ Tablero completo\.$/);
  expect(player(state, 'ana').score).toBe(0);
  expect(reason(() => reopenRoom(state, 'rut', setup))).toBe('not-host');
});

test('si fallan todos los que roban, la casilla se cierra sola', () => {
  let state = startGame(withPlayers(), 'ana', fixedBoard());
  state = judgeAnswer(markAnswered(selectCell(state, 'rut', '0-0'), 'rut'), 'ana', false);
  state = judgeAnswer(markAnswered(acceptSteal(state, 'eva'), 'eva'), 'ana', false);
  state = judgeAnswer(markAnswered(acceptSteal(state, 'leo'), 'leo'), 'ana', false);
  expect(state.phase).toBe('board');
  expect(state.message).toBe('Leo falló y pierde 100. Turno de Leo.');
  expect(state.players.map(item => item.score)).toEqual([0, -100, -100, -100]);
});

test('el anfitrión apura con diez segundos o termina el turno cuando quiere', () => {
  let state = startGame(withPlayers(), 'ana', fixedBoard());
  expect(reason(() => startCountdown(state, 'rut', 0))).toBe('not-host');
  expect(reason(() => endTurn(state, 'rut'))).toBe('not-host');

  // En el tablero, la cuenta vencida pasa el turno sin gastar casillas.
  state = startCountdown(state, 'ana', 1_000);
  expect(state).toMatchObject({ deadline: 11_000, message: 'El anfitrión dio 10 segundos.' });
  expect(viewRoom(state, 'leo').deadline).toBe(11_000);
  expect(expireCountdown(state, 10_999)).toBe(state);
  state = expireCountdown(state, 11_000);
  expect(state).toMatchObject({ phase: 'board', turnPlayerId: 'leo', deadline: null, message: 'Se acabó el tiempo. Turno de Leo.' });
  expect(state.cells.some(cell => cell.used)).toBe(false);

  // Con la casilla abierta, terminar la cierra sin puntos.
  state = startCountdown(selectCell(state, 'leo', '0-0'), 'ana', 0);
  state = endTurn(state, 'ana');
  expect(state).toMatchObject({ phase: 'board', turnPlayerId: 'eva', deadline: null, message: 'El anfitrión terminó el turno. Turno de Eva.' });
  expect(state.cells.find(cell => cell.id === '0-0')?.used).toBe(true);
  expect(state.players.every(item => item.score === 0)).toBe(true);

  // Responder a tiempo retira la cuenta; juzgando no hay nada que apurar.
  state = startCountdown(selectCell(state, 'eva', '0-2'), 'ana', 0);
  state = markAnswered(state, 'eva');
  expect(state.deadline).toBeNull();
  expect(reason(() => startCountdown(state, 'ana', 0))).toBe('invalid-move');

  // Si la cuenta vence mientras responde, cuenta como «Ya respondí»: el
  // anfitrión juzga y un fallo abre el robo.
  state = startCountdown(selectCell(judgeAnswer(state, 'ana', true), 'rut', '1-1'), 'ana', 0);
  state = expireCountdown(state, 10_000);
  expect(state).toMatchObject({ phase: 'judging', attemptPlayerId: 'rut', deadline: null, message: 'Se acabó el tiempo de Rut. El anfitrión decide.' });
  state = judgeAnswer(state, 'ana', false);
  expect(state).toMatchObject({ phase: 'steal', stealQueue: ['leo', 'eva'] });

  // Quien roba también: al vencer su intento, el anfitrión juzga.
  state = startCountdown(acceptSteal(state, 'leo'), 'ana', 0);
  state = expireCountdown(state, 10_000);
  expect(state).toMatchObject({ phase: 'judging', attemptPlayerId: 'leo', message: 'Se acabó el tiempo de Leo. El anfitrión decide.' });
  state = judgeAnswer(state, 'ana', false);
  expect(state).toMatchObject({ phase: 'steal', stealQueue: ['eva'] });

  // En el robo la cuenta sigue aunque alguien pase, y al vencer se cierra.
  state = passSteal(state, 'eva');
  state = judgeAnswer(markAnswered(selectCell(state, 'leo', '1-2'), 'leo'), 'ana', false);
  state = startCountdown(state, 'ana', 0);
  state = passSteal(state, 'eva');
  expect(state.deadline).toBe(10_000);
  state = expireCountdown(state, 10_000);
  expect(state).toMatchObject({ phase: 'board', turnPlayerId: 'eva', message: 'Se acabó el tiempo. Turno de Eva.' });

  state = { ...state, status: 'finished', phase: 'finished' };
  expect(reason(() => endTurn(state, 'ana'))).toBe('invalid-move');
});

test('el anfitrión mira la pregunta y la respuesta de cualquier casilla', () => {
  const state = startGame(withPlayers(), 'ana', fixedBoard());
  expect(answerKey(state, 'ana', '2-2')).toEqual({
    id: '2-2', category: 'Q2', value: 300, special: true, double: false, prompt: 'P22', answer: 'A22', reference: 'Ref 22'
  });
  expect(reason(() => answerKey(state, 'rut', '2-2'))).toBe('not-host');
  expect(reason(() => answerKey(state, 'ana', '9-9'))).toBe('invalid-move');
  // Mientras se apuesta nadie lee la pregunta, tampoco el anfitrión.
  expect(viewRoom(selectCell(state, 'rut', '0-1'), 'ana').clue).toMatchObject({ prompt: null, answer: null });
});

test('el anfitrión conduce: caben cuatro invitados y ninguno más', () => {
  let state = openRoom('ABCD', setup, 'ana', 'Ana');
  expect(state.players[0]).toMatchObject({ color: null, plays: false });
  const colors = ['yellow', 'orange', 'turquoise', 'violet'] as const;
  colors.forEach((color, index) => {
    state = joinRoom(state, `j${index}`, { name: `Jugador ${index}`, color });
  });
  expect(state.players.filter(item => item.plays)).toHaveLength(MAX_PLAYERS);
  expect(reason(() => joinRoom(state, 'x', { name: 'Quinto', color: 'violet' }))).toBe('room-full');
  state = startGame(state, 'ana', fixedBoard());
  expect(player(state, 'ana').plays).toBe(false);
  expect(state.turnPlayerId).toBe('j0');
});

test('sin invitados el anfitrión juega solo y vuelve a conducir en la siguiente', () => {
  let state = startGame(openRoom('ABCD', setup, 'ana', 'Ana'), 'ana', fixedBoard());
  expect(player(state, 'ana')).toMatchObject({ plays: true, color: 'yellow' });
  expect(state.turnPlayerId).toBe('ana');
  state = markAnswered(selectCell(state, 'ana', '0-0'), 'ana');
  state = judgeAnswer(state, 'ana', false);
  expect(state.phase).toBe('board');
  expect(state.message).toBe('Ana falló y pierde 100. Turno de Ana.');

  state = reopenRoom({ ...state, status: 'finished', phase: 'finished' }, 'ana', setup);
  expect(player(state, 'ana')).toMatchObject({ plays: false, color: null, score: 0 });
  state = joinRoom(state, 'rut', { name: 'Rut', color: 'yellow' });
  expect(startGame(state, 'ana', fixedBoard()).turnPlayerId).toBe('rut');
});

test('otra ronda vuelve a la espera con puntos en cero y el tablero nuevo', () => {
  let state = startGame(withPlayers(), 'ana', fixedBoard());
  state = judgeAnswer(markAnswered(selectCell(state, 'rut', '0-2'), 'rut'), 'ana', true);
  expect(reason(() => reopenRoom(state, 'ana', setup))).toBe('room-started');
  expect(reason(() => leaveRoom(state, 'leo'))).toBe('room-started');

  state = { ...state, status: 'finished', phase: 'finished' };
  const next = { rows: 4, columns: 4, doubleCount: 2 };
  expect(reason(() => reopenRoom(state, 'ana', { ...next, doubleCount: 15 }))).toBe('invalid-move');
  state = reopenRoom(state, 'ana', next);
  expect(state).toMatchObject({ status: 'waiting', phase: 'waiting', setup: next, cells: [] });
  expect(state.players.every(item => item.score === 0)).toBe(true);
  expect(state.players.map(item => item.id)).toEqual(['ana', 'rut', 'leo', 'eva']);
  expect(reason(() => leaveRoom(state, 'ana'))).toBe('not-host');
  expect(leaveRoom(state, 'leo').players.map(item => item.id)).toEqual(['ana', 'rut', 'eva']);
});

test('el tablero entregado tiene que respetar la configuración', () => {
  const state = withPlayers();
  expect(reason(() => startGame(state, 'rut', fixedBoard()))).toBe('not-host');
  expect(reason(() => startGame(state, 'ana', fixedBoard().slice(1)))).toBe('invalid-move');
  expect(reason(() => startGame(state, 'ana', fixedBoard(3, 3, ['0-0', '0-1', '0-2'])))).toBe('invalid-move');
  expect(reason(() => startGame(state, 'ana', fixedBoard(3, 3, ['0-1', '2-2'], [])))).toBe('invalid-move');
});

test('el banco arma tableros con dos especiales y las dobles pedidas', () => {
  for (const [rows, columns, doubleCount] of [[3, 3, 0], [4, 5, 3], [8, 8, 10]] as const) {
    const cells = createJeopardyBoard(JEOPARDY_BANK, { rows, columns, doubleCount });
    expect(cells).toHaveLength(rows * columns);
    expect(cells.filter(cell => cell.special)).toHaveLength(SPECIAL_COUNT);
    expect(cells.filter(cell => cell.double)).toHaveLength(doubleCount);
    expect(cells.every(cell => cell.value === cellValue(cell.row) && !(cell.special && cell.double))).toBe(true);
    expect(new Set(cells.map(cell => cell.question.prompt)).size).toBe(cells.length);
    expect(cells.filter(cell => cell.special).every(cell => cell.question.level === 'extreme')).toBe(true);
  }
});

test('los errores de la base se traducen por su texto', () => {
  expect(jeopardyErrorFrom('not-your-turn').reason).toBe('not-your-turn');
  expect(jeopardyErrorFrom('P0001: room-full').reason).toBe('room-full');
  expect(jeopardyErrorFrom('steal-taken').reason).toBe('steal-taken');
  expect(jeopardyErrorFrom('TypeError: Failed to fetch').reason).toBe('unavailable');
});
