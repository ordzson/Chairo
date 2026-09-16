import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import type { AnswerChoice, GameQuestion, MatchPhase } from '../domain/match';
import type { RoomCode } from '../domain/room';

export const MATCH_SNAPSHOT_STORAGE_KEY = 'chairo:versiculo-o-inventiculo:match';

export interface StoredAnswer {
  readonly participantId: string;
  readonly roundIndex: number;
  readonly choice: AnswerChoice;
  readonly answeredAt: number;
  readonly responseMs: number;
  readonly correct: boolean;
  readonly points: number;
}

export interface StoredMatch {
  readonly code: RoomCode;
  readonly questions: readonly GameQuestion[];
  readonly roundIndex: number;
  readonly phase: MatchPhase;
  readonly phaseStartedAt: number;
  readonly phaseEndsAt: number | null;
  readonly answers: readonly StoredAnswer[];
}

@Injectable({ providedIn: 'root' })
export class MatchSnapshotStore {
  private readonly document = inject(DOCUMENT);
  private memorySnapshot: StoredMatch | null = null;

  read(): StoredMatch | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(MATCH_SNAPSHOT_STORAGE_KEY);
      if (!raw) return this.memorySnapshot;
      const parsed: unknown = JSON.parse(raw);
      if (!isStoredMatch(parsed)) return this.memorySnapshot;
      this.memorySnapshot = parsed;
      return parsed;
    } catch {
      return this.memorySnapshot;
    }
  }

  write(match: StoredMatch | null): void {
    this.memorySnapshot = match;
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return;
      if (match) storage.setItem(MATCH_SNAPSHOT_STORAGE_KEY, JSON.stringify(match));
      else storage.removeItem(MATCH_SNAPSHOT_STORAGE_KEY);
    } catch {
      // La partida todavía funciona en memoria cuando el almacenamiento falla.
    }
  }

  onExternalChange(listener: (match: StoredMatch | null) => void): () => void {
    const view = this.document.defaultView;
    if (!view) return () => undefined;
    const handler = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== MATCH_SNAPSHOT_STORAGE_KEY) return;
      this.memorySnapshot = null;
      listener(this.read());
    };
    view.addEventListener('storage', handler);
    return () => view.removeEventListener('storage', handler);
  }
}

function isStoredMatch(value: unknown): value is StoredMatch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredMatch>;
  return typeof candidate.code === 'string' &&
    Array.isArray(candidate.questions) && candidate.questions.length > 0 &&
    Number.isInteger(candidate.roundIndex) &&
    (candidate.phase === 'countdown' || candidate.phase === 'question' || candidate.phase === 'reveal' || candidate.phase === 'finished') &&
    typeof candidate.phaseStartedAt === 'number' &&
    (candidate.phaseEndsAt === null || typeof candidate.phaseEndsAt === 'number') &&
    Array.isArray(candidate.answers);
}
