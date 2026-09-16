import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { isRoomCode, type RoomCode } from '../domain/room';

export const SEAT_STORAGE_KEY = 'chairo:versiculo-o-inventiculo:seat';

/** El asiento que este dispositivo ocupa en una sala. */
export interface Seat {
  readonly code: RoomCode;
  readonly participantId: string;
}

/**
 * Anota qué asiento es el de este dispositivo. Vive en `sessionStorage` y no
 * en `localStorage` a propósito: el asiento pertenece a la pestaña que se unió,
 * mientras que la sala del adaptador en memoria se comparte entre pestañas del
 * mismo navegador para simular varios teléfonos. Sobrevive a la recarga, que es
 * lo que impide que al invitado lo expulse actualizar la página.
 */
@Injectable({ providedIn: 'root' })
export class SeatStore {
  private readonly document = inject(DOCUMENT);
  private memorySeat: Seat | null = null;

  read(): Seat | null {
    try {
      const raw = this.document.defaultView?.sessionStorage.getItem(SEAT_STORAGE_KEY);
      if (!raw) return this.memorySeat;
      const parsed: unknown = JSON.parse(raw);
      if (!isSeat(parsed)) return this.memorySeat;
      this.memorySeat = parsed;
      return parsed;
    } catch {
      return this.memorySeat;
    }
  }

  write(seat: Seat | null): void {
    this.memorySeat = seat;
    try {
      const storage = this.document.defaultView?.sessionStorage;
      if (!storage) return;
      if (seat) storage.setItem(SEAT_STORAGE_KEY, JSON.stringify(seat));
      else storage.removeItem(SEAT_STORAGE_KEY);
    } catch {
      // Sin almacenamiento el asiento sigue vivo mientras dure la pantalla.
    }
  }
}

function isSeat(value: unknown): value is Seat {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Seat>;
  return isRoomCode(candidate.code) &&
    typeof candidate.participantId === 'string' && candidate.participantId.length > 0;
}
