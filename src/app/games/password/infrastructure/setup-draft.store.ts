import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { DEFAULT_ROUND_SECONDS, isRoundSeconds, type PasswordSetup } from '../domain/setup-config';

const STORAGE_KEY = 'chairo:password:setup';

@Injectable({ providedIn: 'root' })
export class PasswordSetupDraftStore {
  private readonly document = inject(DOCUMENT);

  read(): PasswordSetup {
    try {
      const value = JSON.parse(this.document.defaultView?.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PasswordSetup> | null;
      return value && isRoundSeconds(value.roundSeconds) ? { roundSeconds: value.roundSeconds } : { roundSeconds: DEFAULT_ROUND_SECONDS };
    } catch {
      return { roundSeconds: DEFAULT_ROUND_SECONDS };
    }
  }

  write(setup: PasswordSetup): void {
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
    } catch {
      // La preferencia ayuda, pero nunca bloquea la creación de la sala.
    }
  }
}

