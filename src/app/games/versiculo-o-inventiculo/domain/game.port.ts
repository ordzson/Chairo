import type { Signal } from '@angular/core';

import type { AnswerChoice, GameQuestion, MatchSnapshot } from './match';
import type { RoomCode } from './room';

export type GameErrorReason =
  | 'match-not-found'
  | 'not-host'
  | 'not-playing'
  | 'answer-locked'
  | 'time-up'
  | 'question-bank-insufficient'
  | 'unavailable';

export class GameError extends Error {
  constructor(readonly reason: GameErrorReason, message: string) {
    super(message);
    this.name = 'GameError';
  }
}

/** Autoridad de la partida; la interfaz nunca calcula resultados por su cuenta. */
export abstract class GamePort {
  abstract readonly match: Signal<MatchSnapshot | null>;
  abstract startMatch(code: RoomCode, questions: readonly GameQuestion[]): Promise<MatchSnapshot>;
  abstract restoreMatch(code: RoomCode): Promise<MatchSnapshot>;
  abstract submitAnswer(code: RoomCode, choice: AnswerChoice): Promise<MatchSnapshot>;
}
