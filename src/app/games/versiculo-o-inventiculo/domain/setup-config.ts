export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type HostRole = 'player' | 'host-only';

export interface MatchSetup {
  readonly difficulty: Difficulty;
  readonly questionCount: number;
  readonly hostRole: HostRole;
}

export const DIFFICULTIES: readonly { readonly value: Difficulty; readonly label: string }[] = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
  { value: 'extreme', label: 'Extrema' }
] as const;

export const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30] as const;

export const DEFAULT_MATCH_SETUP: MatchSetup = {
  difficulty: 'medium',
  questionCount: 10,
  hostRole: 'player'
};

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTIES.some(option => option.value === value);
}

export function isHostRole(value: unknown): value is HostRole {
  return value === 'player' || value === 'host-only';
}

export function isQuestionCount(value: unknown): value is MatchSetup['questionCount'] {
  return typeof value === 'number' && QUESTION_COUNTS.includes(value as (typeof QUESTION_COUNTS)[number]);
}
