import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

import { isRoom, type Room } from '../domain/room';

export const ROOM_SNAPSHOT_STORAGE_KEY = 'chairo:versiculo-o-inventiculo:room';

/**
 * Copia persistente de la sala abierta. Mantiene la sala al recargar y, hasta
 * que exista el adaptador de Supabase, transporta los cambios entre pestañas
 * del mismo navegador mediante el evento `storage`.
 */
@Injectable({ providedIn: 'root' })
export class RoomSnapshotStore {
  private readonly document = inject(DOCUMENT);
  private memorySnapshot: Room | null = null;

  read(): Room | null {
    try {
      const raw = this.document.defaultView?.localStorage.getItem(ROOM_SNAPSHOT_STORAGE_KEY);
      if (!raw) return this.memorySnapshot;
      const parsed: unknown = JSON.parse(raw);
      if (!isRoom(parsed)) return this.memorySnapshot;
      this.memorySnapshot = parsed;
      return parsed;
    } catch {
      return this.memorySnapshot;
    }
  }

  write(room: Room | null): void {
    this.memorySnapshot = room;
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return;
      if (room) storage.setItem(ROOM_SNAPSHOT_STORAGE_KEY, JSON.stringify(room));
      else storage.removeItem(ROOM_SNAPSHOT_STORAGE_KEY);
    } catch {
      // Sin almacenamiento la sala sigue viva en memoria durante la sesión.
    }
  }

  /** Avisa de las escrituras hechas desde otro documento. Devuelve la baja. */
  onExternalChange(listener: (room: Room | null) => void): () => void {
    const view = this.document.defaultView;
    if (!view) return () => undefined;
    const handler = (event: StorageEvent): void => {
      if (event.key !== null && event.key !== ROOM_SNAPSHOT_STORAGE_KEY) return;
      this.memorySnapshot = null;
      listener(this.read());
    };
    view.addEventListener('storage', handler);
    return () => view.removeEventListener('storage', handler);
  }
}
