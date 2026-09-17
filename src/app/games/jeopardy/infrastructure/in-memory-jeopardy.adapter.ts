import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import { createRoomCode } from '../../versiculo-o-inventiculo/domain/room';
import type { JeopardyAnswerKey, JeopardyCell, JeopardyRoom, JeopardySetup } from '../domain/jeopardy';
import { JeopardyError, JeopardyPort, type JeopardySeatDraft } from '../domain/jeopardy.port';
import {
  acceptSteal,
  answerKey,
  endTurn,
  expireCountdown,
  isJeopardyState,
  joinRoom,
  judgeAnswer,
  leaveRoom,
  markAnswered,
  openRoom,
  passSteal,
  placeWager,
  reopenRoom,
  selectCell,
  startCountdown,
  startGame,
  viewRoom,
  type JeopardyState
} from '../domain/rules';

const ROOM_PREFIX = 'chairo:jeopardy:sala:';
const SEAT_PREFIX = 'chairo:jeopardy:asiento:';
const CODE_ATTEMPTS = 12;

/**
 * Jeopardy sin backend, con las mismas reglas que la base de datos. La sala
 * vive en `localStorage`, que comparten las pestañas de este navegador —así
 * simulan varios teléfonos las pruebas—, y el asiento en `sessionStorage`, que
 * es de cada pestaña y sobrevive a la recarga.
 */
@Injectable()
export class InMemoryJeopardyAdapter implements JeopardyPort {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<JeopardyState | null>(null);
  private readonly seatId = signal<string | null>(null);

  readonly room = computed<JeopardyRoom | null>(() => {
    const state = this.state();
    return state ? viewRoom(state, this.seatId()) : null;
  });

  constructor() {
    const view = this.document.defaultView;
    const listener = (event: StorageEvent): void => {
      const current = this.state();
      if (!current || (event.key !== null && event.key !== ROOM_PREFIX + current.code)) return;
      this.state.set(this.read(current.code));
    };
    view?.addEventListener('storage', listener);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('storage', listener));
  }

  async createRoom(setup: JeopardySetup, hostName: string): Promise<JeopardyRoom> {
    const code = this.freeCode();
    const hostId = this.newId();
    const state = openRoom(code, setup, hostId, hostName);
    this.writeSeat(code, hostId);
    return this.commit(state);
  }

  async restoreRoom(code: string): Promise<JeopardyRoom> {
    const state = this.load(code);
    return viewRoom(state, this.seatId());
  }

  async joinRoom(code: string, draft: JeopardySeatDraft): Promise<JeopardyRoom> {
    const state = this.load(code);
    const seated = state.players.find(player => player.id === this.seatId());
    const id = seated?.id ?? this.newId();
    const next = joinRoom(state, id, draft);
    this.writeSeat(state.code, id);
    return this.commit(next);
  }

  startGame(code: string, cells: readonly JeopardyCell[]): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => startGame(state, self, cells));
  }

  selectCell(code: string, cellId: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => selectCell(state, self, cellId));
  }

  setWager(code: string, wager: number): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => placeWager(state, self, wager));
  }

  markAnswered(code: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => markAnswered(state, self));
  }

  judge(code: string, correct: boolean): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => judgeAnswer(state, self, correct));
  }

  acceptSteal(code: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => acceptSteal(state, self));
  }

  passSteal(code: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => passSteal(state, self));
  }

  startCountdown(code: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => startCountdown(state, self, Date.now()));
  }

  endTurn(code: string): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => endTurn(state, self));
  }

  async revealCell(code: string, cellId: string): Promise<JeopardyAnswerKey> {
    return answerKey(this.load(code), this.seatId(), cellId);
  }

  reopenRoom(code: string, setup: JeopardySetup): Promise<JeopardyRoom> {
    return this.apply(code, (state, self) => reopenRoom(state, self, setup));
  }

  async closeRoom(code: string): Promise<void> {
    const state = this.load(code);
    if (!state.players.some(player => player.id === this.seatId() && player.isHost)) {
      throw new JeopardyError('not-host');
    }
    this.storage('local')?.removeItem(ROOM_PREFIX + state.code);
    this.forget(state.code);
  }

  async leaveRoom(code: string): Promise<void> {
    const state = this.load(code);
    this.write(leaveRoom(state, this.seatId()));
    this.forget(state.code);
  }

  /**
   * Lee la sala más reciente y reconoce el asiento; si no existe, lo dice. Una
   * cuenta regresiva vencida se aplica aquí, así la cierra la primera pestaña
   * que mire la sala después.
   */
  private load(code: string): JeopardyState {
    const stored = this.read(code);
    if (!stored) {
      this.state.set(null);
      throw new JeopardyError('room-not-found');
    }
    const state = expireCountdown(stored, Date.now());
    if (state !== stored) this.write(state);
    this.seatId.set(this.readSeat(state.code));
    this.state.set(state);
    return state;
  }

  private async apply(
    code: string,
    change: (state: JeopardyState, selfId: string | null) => JeopardyState
  ): Promise<JeopardyRoom> {
    const state = this.load(code);
    return this.commit(change(state, this.seatId()));
  }

  private commit(state: JeopardyState): JeopardyRoom {
    this.write(state);
    this.state.set(state);
    return viewRoom(state, this.seatId());
  }

  private read(code: string): JeopardyState | null {
    try {
      const raw = this.storage('local')?.getItem(ROOM_PREFIX + code.toUpperCase());
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return isJeopardyState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private write(state: JeopardyState): void {
    this.storage('local')?.setItem(ROOM_PREFIX + state.code, JSON.stringify(state));
  }

  private readSeat(code: string): string | null {
    return this.storage('session')?.getItem(SEAT_PREFIX + code) ?? null;
  }

  private writeSeat(code: string, id: string): void {
    this.storage('session')?.setItem(SEAT_PREFIX + code, id);
    this.seatId.set(id);
  }

  private forget(code: string): void {
    this.storage('session')?.removeItem(SEAT_PREFIX + code);
    this.seatId.set(null);
    this.state.set(null);
  }

  private freeCode(): string {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = createRoomCode(Math.random);
      if (!this.read(code)) return code;
    }
    throw new JeopardyError('code-unavailable');
  }

  private newId(): string {
    const crypto = this.document.defaultView?.crypto;
    return crypto?.randomUUID ? crypto.randomUUID() : `asiento-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private storage(kind: 'local' | 'session'): Storage | null {
    try {
      const view = this.document.defaultView;
      return (kind === 'local' ? view?.localStorage : view?.sessionStorage) ?? null;
    } catch {
      return null;
    }
  }
}
