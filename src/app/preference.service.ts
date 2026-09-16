import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

export const PLAY_PREFERENCES = [
  { value: 'none', label: 'Sin preferencia' },
  { value: 'solo', label: 'A solas' },
  { value: 'shared-device', label: 'En grupo en un dispositivo' },
  { value: 'multiple-phones', label: 'En grupo con varios teléfonos' }
] as const;

export type PlayPreference = typeof PLAY_PREFERENCES[number]['value'];

const STORAGE_KEY = 'chairo:play-preference';
const VALID_VALUES = new Set<PlayPreference>(PLAY_PREFERENCES.map(({ value }) => value));

export function isPlayPreference(value: unknown): value is PlayPreference {
  return typeof value === 'string' && VALID_VALUES.has(value as PlayPreference);
}

@Injectable({ providedIn: 'root' })
export class PreferenceService {
  private readonly document = inject(DOCUMENT);

  read(): PlayPreference {
    try {
      const value = this.document.defaultView?.localStorage.getItem(STORAGE_KEY);
      return isPlayPreference(value) ? value : 'none';
    } catch {
      return 'none';
    }
  }

  write(value: PlayPreference): void {
    try {
      const storage = this.document.defaultView?.localStorage;
      if (!storage) return;
      if (value === 'none') storage.removeItem(STORAGE_KEY);
      else storage.setItem(STORAGE_KEY, value);
    } catch {
      // The preference is optional; private or full storage must not block play.
    }
  }
}
