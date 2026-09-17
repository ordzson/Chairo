import { PASSWORD_WORDS } from '../domain/word-bank.generated';

/**
 * Banco publicado. Se genera desde `assets/password.md` con
 * `pnpm run generate:password-bank`; en tiempo de ejecución no se lee Markdown.
 */
export function availablePasswordWords(): readonly string[] {
  return PASSWORD_WORDS;
}
