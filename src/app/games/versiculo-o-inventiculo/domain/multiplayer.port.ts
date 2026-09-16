import type { Signal } from '@angular/core';

import type { GameColor } from '../../../game';
import type { Participant, Room, RoomCode } from './room';
import type { MatchSetup } from './setup-config';

export interface ParticipantDraft {
  readonly name: string;
  readonly color: GameColor;
}

export type MultiplayerErrorReason =
  | 'room-not-found'
  | 'room-full'
  | 'room-started'
  | 'name-taken'
  | 'color-taken'
  | 'code-unavailable'
  | 'unavailable';

export class MultiplayerError extends Error {
  constructor(readonly reason: MultiplayerErrorReason, message: string) {
    super(message);
    this.name = 'MultiplayerError';
  }
}

/**
 * Puerto de sincronización de partida. La presentación solo conoce esta
 * interfaz; hoy la implementa un adaptador en memoria y más adelante lo hará
 * uno sobre Supabase sin tocar las pantallas.
 */
export abstract class MultiplayerPort {
  /** Sala observada actualmente, o `null` si no hay ninguna abierta. */
  abstract readonly room: Signal<Room | null>;

  /**
   * Asiento de este dispositivo dentro de la sala observada, o `null` si no
   * ocupa ninguno. Es lo que distingue al anfitrión del invitado en pantalla:
   * en Supabase sale de `auth.uid()` y en memoria del asiento guardado aquí.
   */
  abstract readonly self: Signal<Participant | null>;

  abstract createRoom(setup: MatchSetup): Promise<Room>;

  /** Recupera una sala ya creada, por ejemplo al recargar la pantalla. */
  abstract restoreRoom(code: RoomCode): Promise<Room>;

  abstract joinRoom(code: RoomCode, draft: ParticipantDraft): Promise<Participant>;

  /** Cierra la sala para todos. Es la salida del anfitrión. */
  abstract closeRoom(code: RoomCode): Promise<void>;

  /** Retira solo el asiento propio y deja la sala en pie para los demás. */
  abstract leaveRoom(code: RoomCode): Promise<void>;
}
