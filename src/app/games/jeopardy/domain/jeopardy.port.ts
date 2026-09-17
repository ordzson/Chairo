import type { Signal } from '@angular/core';

import type { GameColor } from '../../../game';
import type { JeopardyAnswerKey, JeopardyCell, JeopardyRoom, JeopardySetup } from './jeopardy';

export type JeopardyErrorReason =
  | 'room-not-found'
  | 'room-full'
  | 'room-started'
  | 'name-taken'
  | 'color-taken'
  | 'code-unavailable'
  | 'not-host'
  | 'not-seated'
  | 'not-your-turn'
  | 'steal-taken'
  | 'invalid-move'
  | 'unavailable';

/** Las mismas razones que lanza `supabase/schema.sql`, con el mismo texto. */
export const JEOPARDY_ERROR_REASONS: readonly JeopardyErrorReason[] = [
  'room-not-found',
  'room-full',
  'room-started',
  'name-taken',
  'color-taken',
  'code-unavailable',
  'not-host',
  'not-seated',
  'not-your-turn',
  'steal-taken',
  'invalid-move'
];

export class JeopardyError extends Error {
  constructor(readonly reason: JeopardyErrorReason, message: string = reason) {
    super(message);
    this.name = 'JeopardyError';
  }
}

export interface JeopardySeatDraft {
  readonly name: string;
  readonly color: GameColor;
}

/**
 * Autoridad de la sala y de la partida. Con Supabase la ejerce la base de
 * datos, para todos los teléfonos; sin backend, un adaptador que aplica las
 * mismas reglas en este navegador. Las pantallas no distinguen entre los dos.
 *
 * Cada jugada devuelve la sala ya actualizada, vista desde este asiento.
 */
export abstract class JeopardyPort {
  abstract readonly room: Signal<JeopardyRoom | null>;

  abstract createRoom(setup: JeopardySetup, hostName: string): Promise<JeopardyRoom>;
  /** Lee una sala abierta. Sin asiento propio sirve para buscarla antes de entrar. */
  abstract restoreRoom(code: string): Promise<JeopardyRoom>;
  abstract joinRoom(code: string, draft: JeopardySeatDraft): Promise<JeopardyRoom>;
  /** El anfitrión arma el tablero con el banco y lo entrega para empezar. */
  abstract startGame(code: string, cells: readonly JeopardyCell[]): Promise<JeopardyRoom>;
  abstract selectCell(code: string, cellId: string): Promise<JeopardyRoom>;
  abstract setWager(code: string, wager: number): Promise<JeopardyRoom>;
  abstract markAnswered(code: string): Promise<JeopardyRoom>;
  abstract judge(code: string, correct: boolean): Promise<JeopardyRoom>;
  /** Roba quien lo pida primero; a los demás les llega `steal-taken`. */
  abstract acceptSteal(code: string): Promise<JeopardyRoom>;
  abstract passSteal(code: string): Promise<JeopardyRoom>;
  /** Diez segundos para quien tiene la jugada; al vencer, el turno termina. Solo el anfitrión. */
  abstract startCountdown(code: string): Promise<JeopardyRoom>;
  /** Termina el turno ya: sin casilla abierta pasa al siguiente; con una, la cierra sin puntos. */
  abstract endTurn(code: string): Promise<JeopardyRoom>;
  /** Pregunta y respuesta de una casilla. Solo el anfitrión. */
  abstract revealCell(code: string, cellId: string): Promise<JeopardyAnswerKey>;
  /** «Jugar otra vez»: la misma sala vuelve a la espera con el tablero nuevo. */
  abstract reopenRoom(code: string, setup: JeopardySetup): Promise<JeopardyRoom>;
  /** Cierra la sala para todos. Solo el anfitrión. */
  abstract closeRoom(code: string): Promise<void>;
  /** Retira el asiento propio fuera de una ronda en juego. */
  abstract leaveRoom(code: string): Promise<void>;
}

export function jeopardyErrorFrom(message: string): JeopardyError {
  const reason = JEOPARDY_ERROR_REASONS.find(candidate => message.includes(candidate)) ?? 'unavailable';
  return new JeopardyError(reason, message);
}
