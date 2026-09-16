import type { GameColor } from '../../../game';
import type { Participant, RoomCode } from './room';
import type { Difficulty } from './setup-config';

export type AnswerChoice = 'verse' | 'invented';
export type MatchPhase = 'countdown' | 'question' | 'reveal' | 'finished';

export interface GameQuestion {
  readonly id: string;
  readonly difficulty: Difficulty;
  readonly statement: string;
  readonly isVerse: boolean;
  readonly reference: string | null;
  readonly explanation: string;
}

export interface VisibleQuestion {
  readonly id: string;
  readonly statement: string;
  readonly totalSeconds: number;
}

export interface QuestionSolution {
  readonly isVerse: boolean;
  readonly reference: string | null;
  readonly explanation: string;
}

export interface RoundResult {
  readonly participantId: string;
  readonly name: string;
  readonly color: GameColor;
  readonly choice: AnswerChoice | null;
  readonly correct: boolean;
  readonly points: number;
  readonly responseMs: number | null;
}

export interface PlayerStanding {
  readonly participantId: string;
  readonly name: string;
  readonly color: GameColor;
  readonly score: number;
  readonly correctCount: number;
  readonly averageResponseMs: number | null;
}

export interface MatchSnapshot {
  readonly code: RoomCode;
  readonly phase: MatchPhase;
  readonly phaseEndsAt: number | null;
  readonly serverNow: number;
  /** Uno basado: la primera frase es la ronda 1. */
  readonly roundNumber: number;
  readonly totalRounds: number;
  readonly question: VisibleQuestion | null;
  readonly solution: QuestionSolution | null;
  readonly self: Participant;
  readonly selfChoice: AnswerChoice | null;
  readonly answeredCount: number;
  readonly expectedAnswers: number;
  readonly roundResults: readonly RoundResult[];
  readonly standings: readonly PlayerStanding[];
}

const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'hard', 'extreme'];

export function questionDuration(statement: string): number {
  return statement.length > 120 ? 18 : 12;
}

/**
 * Selecciona primero el nivel pedido y solo después baja de nivel. El orden
 * final sí se mezcla para que la dificultad de una frase no delate la
 * respuesta ni forme bloques reconocibles.
 */
export function selectQuestions(
  bank: readonly GameQuestion[],
  difficulty: Difficulty,
  count: number,
  random: () => number = Math.random
): readonly GameQuestion[] {
  const ceiling = DIFFICULTY_ORDER.indexOf(difficulty);
  const selected: GameQuestion[] = [];

  for (let level = ceiling; level >= 0 && selected.length < count; level -= 1) {
    const candidates = shuffle(bank.filter(question => question.difficulty === DIFFICULTY_ORDER[level]), random);
    selected.push(...candidates.slice(0, count - selected.length));
  }

  if (selected.length < count) {
    throw new Error(`El banco solo puede ofrecer ${selected.length} de ${count} preguntas.`);
  }
  return shuffle(selected, random);
}

export function scoreAnswer(
  correct: boolean,
  responseMs: number,
  totalSeconds: number
): number {
  if (!correct) return 0;
  const totalMs = totalSeconds * 1000;
  const remaining = Math.max(0, totalMs - Math.min(totalMs, responseMs));
  return 200 + Math.round(800 * remaining / totalMs);
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}
