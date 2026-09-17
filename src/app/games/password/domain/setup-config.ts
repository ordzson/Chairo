export const ROUND_SECONDS = [30, 45, 60, 90] as const;
export type RoundSeconds = typeof ROUND_SECONDS[number];

export const DEFAULT_ROUND_SECONDS: RoundSeconds = 60;

export interface PasswordSetup {
  readonly roundSeconds: RoundSeconds;
}

export function isRoundSeconds(value: unknown): value is RoundSeconds {
  return typeof value === 'number' && ROUND_SECONDS.includes(value as RoundSeconds);
}

export function isPasswordSetup(value: unknown): value is PasswordSetup {
  return Boolean(value) && typeof value === 'object' &&
    isRoundSeconds((value as Partial<PasswordSetup>).roundSeconds);
}

