import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

import {
  PasswordError,
  endPasswordRound,
  finishPasswordMatch,
  isPasswordState,
  joinPasswordRoom,
  leavePasswordRoom,
  openPasswordRoom,
  passwordSnapshot,
  preparePasswordRound,
  reopenPasswordRoom,
  scorePasswordRound,
  setPasswordReady,
  startPasswordMatch,
  type PasswordSnapshot,
  type PasswordState
} from '../domain/match';
import { PasswordPort, type PasswordSeatDraft } from '../domain/password.port';
import { createRoomCode, type RoomCode } from '../domain/room';
import type { PasswordSetup } from '../domain/setup-config';

const ROOM_PREFIX = 'chairo:password:sala:';
const SEAT_PREFIX = 'chairo:password:asiento:';
const CODE_ATTEMPTS = 12;

/**
 * Backend local de Password. La sala se comparte entre pestañas mediante
 * localStorage y el asiento pertenece a sessionStorage, igual que un teléfono.
 * Las reglas son las mismas funciones puras que cubren las pruebas de dominio.
 */
@Injectable()
export class InMemoryPasswordAdapter implements PasswordPort {
  private readonly document = inject(DOCUMENT);
  private readonly state = signal<PasswordState | null>(null);
  private readonly seatId = signal<string | null>(null);

  readonly connection = signal<'online'>('online').asReadonly();
  readonly snapshot = computed<PasswordSnapshot | null>(() => {
    const state = this.state();
    if (!state) return null;
    try {
      return passwordSnapshot(state, this.seatId(), Date.now());
    } catch {
      return null;
    }
  });

  constructor() {
    const view = this.document.defaultView;
    const listener = (event: StorageEvent): void => {
      const current = this.state();
      if (!current || (event.key !== null && event.key !== ROOM_PREFIX + current.code)) return;
      const next = this.read(current.code);
      this.state.set(next);
    };
    view?.addEventListener('storage', listener);
    inject(DestroyRef).onDestroy(() => view?.removeEventListener('storage', listener));
  }

  async createRoom(setup: PasswordSetup, hostName: string): Promise<PasswordSnapshot> {
    const code = this.freeCode();
    const hostId = this.newId();
    const state = openPasswordRoom(code, hostId, hostName, setup.roundSeconds, Date.now());
    this.writeSeat(code, hostId);
    return this.commit(state);
  }

  async restoreRoom(code: RoomCode): Promise<PasswordSnapshot> {
    return this.view(this.load(code));
  }

  async joinRoom(code: RoomCode, draft: PasswordSeatDraft): Promise<PasswordSnapshot> {
    const state = this.read(code);
    if (!state) throw new PasswordError('room-not-found');
    const currentSeat = this.readSeat(code);
    const seated = state.players.find(player => player.id === currentSeat);
    if (seated) {
      this.seatId.set(seated.id);
      this.state.set(state);
      return this.view(state);
    }
    const id = this.newId();
    const next = joinPasswordRoom(state, id, draft.name, draft.color, Date.now());
    this.writeSeat(code, id);
    return this.commit(next);
  }

  startMatch(code: RoomCode): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => startPasswordMatch(state, self, Date.now()));
  }

  setReady(code: RoomCode, ready: boolean, words: readonly string[]): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => setPasswordReady(state, self, ready, words, Date.now(), Math.random));
  }

  endRound(code: RoomCode): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => endPasswordRound(state, self, Date.now()));
  }

  scoreRound(code: RoomCode, results: Readonly<Record<string, boolean>>): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => scorePasswordRound(state, self, results, Date.now()));
  }

  prepareRound(code: RoomCode): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => preparePasswordRound(state, self, Date.now()));
  }

  finishMatch(code: RoomCode): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => finishPasswordMatch(state, self, Date.now()));
  }

  reopenRoom(code: RoomCode, setup: PasswordSetup): Promise<PasswordSnapshot> {
    return this.apply(code, (state, self) => reopenPasswordRoom(state, self, setup.roundSeconds, Date.now()));
  }

  async leaveRoom(code: RoomCode): Promise<void> {
    const state = this.load(code);
    const next = leavePasswordRoom(state, this.seatId(), Date.now());
    this.write(next);
    this.forget(code);
  }

  async closeRoom(code: RoomCode): Promise<void> {
    const state = this.load(code);
    const self = state.players.find(player => player.id === this.seatId());
    if (self?.role !== 'host') throw new PasswordError('not-host');
    this.storage('local')?.removeItem(ROOM_PREFIX + code);
    this.forget(code);
  }

  private async apply(
    code: RoomCode,
    change: (state: PasswordState, selfId: string | null) => PasswordState
  ): Promise<PasswordSnapshot> {
    const state = this.load(code);
    return this.commit(change(state, this.seatId()));
  }

  private commit(state: PasswordState): PasswordSnapshot {
    this.write(state);
    this.state.set(state);
    return this.view(state);
  }

  private view(state: PasswordState): PasswordSnapshot {
    return passwordSnapshot(state, this.seatId(), Date.now());
  }

  private load(code: RoomCode): PasswordState {
    const state = this.read(code);
    if (!state) {
      this.state.set(null);
      throw new PasswordError('room-not-found');
    }
    this.seatId.set(this.readSeat(code));
    this.state.set(state);
    return state;
  }

  private read(code: string): PasswordState | null {
    try {
      const raw = this.storage('local')?.getItem(ROOM_PREFIX + code.toUpperCase());
      const value: unknown = raw ? JSON.parse(raw) : null;
      return isPasswordState(value) ? value : null;
    } catch {
      return null;
    }
  }

  private write(state: PasswordState): void {
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

  private freeCode(): RoomCode {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
      const code = createRoomCode(Math.random);
      if (!this.read(code)) return code;
    }
    throw new PasswordError('code-unavailable');
  }

  private newId(): string {
    const crypto = this.document.defaultView?.crypto;
    return crypto?.randomUUID ? crypto.randomUUID() : `password-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

