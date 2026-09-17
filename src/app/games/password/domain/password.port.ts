import type { Signal } from '@angular/core';

import type { GameColor } from '../../../game';
import type { PasswordSnapshot } from './match';
import type { RoomCode } from './room';
import type { PasswordSetup } from './setup-config';

export interface PasswordSeatDraft {
  readonly name: string;
  readonly color: GameColor;
}

export type PasswordConnection = 'online' | 'reconnecting' | 'offline';

export abstract class PasswordPort {
  abstract readonly snapshot: Signal<PasswordSnapshot | null>;
  abstract readonly connection: Signal<PasswordConnection>;

  abstract createRoom(setup: PasswordSetup, hostName: string): Promise<PasswordSnapshot>;
  abstract restoreRoom(code: RoomCode): Promise<PasswordSnapshot>;
  abstract joinRoom(code: RoomCode, draft: PasswordSeatDraft): Promise<PasswordSnapshot>;
  abstract startMatch(code: RoomCode): Promise<PasswordSnapshot>;
  abstract setReady(code: RoomCode, ready: boolean, words: readonly string[]): Promise<PasswordSnapshot>;
  abstract endRound(code: RoomCode): Promise<PasswordSnapshot>;
  abstract scoreRound(code: RoomCode, results: Readonly<Record<string, boolean>>): Promise<PasswordSnapshot>;
  abstract prepareRound(code: RoomCode): Promise<PasswordSnapshot>;
  abstract finishMatch(code: RoomCode): Promise<PasswordSnapshot>;
  abstract reopenRoom(code: RoomCode, setup: PasswordSetup): Promise<PasswordSnapshot>;
  abstract leaveRoom(code: RoomCode): Promise<void>;
  abstract closeRoom(code: RoomCode): Promise<void>;
}

