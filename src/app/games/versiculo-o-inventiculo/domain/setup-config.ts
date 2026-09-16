export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type HostRole = 'player' | 'host-only';

export interface MatchSetup {
  readonly difficulty: Difficulty;
  readonly questionCount: number;
  readonly hostRole: HostRole;
  /** Segundos para leer y responder cada frase; las largas reciben algo más. */
  readonly questionSeconds: number;
  /** Segundos que la respuesta correcta queda en pantalla antes de seguir. */
  readonly revealSeconds: number;
}

export const DIFFICULTIES: readonly { readonly value: Difficulty; readonly label: string }[] = [
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
  { value: 'extreme', label: 'Extrema' }
] as const;

export const QUESTION_COUNTS = [5, 10, 15, 20, 25, 30] as const;

/**
 * `supabase/schema.sql` repite estas dos listas en los `check` de `rooms`: si
 * cambian aquí, cambian también allí.
 */
export const QUESTION_SECONDS = [5, 8, 10, 12, 15, 20, 30, 45, 60] as const;
export const REVEAL_SECONDS = [3, 5, 8, 10, 15, 20, 30, 45, 60] as const;

/** Lo que se suma al tiempo de responder cuando la frase pasa de 120 caracteres. */
export const LONG_STATEMENT_EXTRA_SECONDS = 6;

export const DEFAULT_MATCH_SETUP: MatchSetup = {
  difficulty: 'medium',
  questionCount: 10,
  hostRole: 'player',
  questionSeconds: 12,
  revealSeconds: 5
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

export function isQuestionSeconds(value: unknown): value is MatchSetup['questionSeconds'] {
  return typeof value === 'number' && QUESTION_SECONDS.includes(value as (typeof QUESTION_SECONDS)[number]);
}

export function isRevealSeconds(value: unknown): value is MatchSetup['revealSeconds'] {
  return typeof value === 'number' && REVEAL_SECONDS.includes(value as (typeof REVEAL_SECONDS)[number]);
}

export function isMatchSetup(value: unknown): value is MatchSetup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MatchSetup>;
  return isDifficulty(candidate.difficulty) &&
    isQuestionCount(candidate.questionCount) &&
    isHostRole(candidate.hostRole) &&
    isQuestionSeconds(candidate.questionSeconds) &&
    isRevealSeconds(candidate.revealSeconds);
}

/**
 * Lee una configuración guardada en el navegador. Los tiempos llegaron
 * después que el resto, así que una guardada antes, sin ellos, toma los de
 * siempre en vez de perderse entera.
 */
export function parseSetupDraft(value: unknown): MatchSetup | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = {
    questionSeconds: DEFAULT_MATCH_SETUP.questionSeconds,
    revealSeconds: DEFAULT_MATCH_SETUP.revealSeconds,
    ...value
  };
  return isMatchSetup(candidate) ? candidate : null;
}
