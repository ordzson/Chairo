import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import {
  DEFAULT_MATCH_SETUP,
  isDifficulty,
  isHostRole,
  isQuestionCount,
  type MatchSetup
} from '../domain/setup-config';

export const SETUP_DRAFT_STORAGE_KEY = 'chairo:versiculo-o-inventiculo:setup';

@Injectable({ providedIn: 'root' })
export class SetupDraftStore {
  private readonly document = inject(DOCUMENT);
  private memoryDraft: MatchSetup = DEFAULT_MATCH_SETUP;

  read(): MatchSetup {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(SETUP_DRAFT_STORAGE_KEY);
      if (!raw) return this.memoryDraft;
      const parsed: unknown = JSON.parse(raw);
      if (!isMatchSetup(parsed)) return this.memoryDraft;
      this.memoryDraft = parsed;
      return parsed;
    } catch {
      return this.memoryDraft;
    }
  }

  write(draft: MatchSetup): void {
    this.memoryDraft = draft;
    try {
      this.document.defaultView?.localStorage.setItem(SETUP_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Private mode or full storage must not block configuring a game.
    }
  }
}

function isMatchSetup(value: unknown): value is MatchSetup {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MatchSetup>;
  return isDifficulty(candidate.difficulty) &&
    isQuestionCount(candidate.questionCount) &&
    isHostRole(candidate.hostRole);
}
