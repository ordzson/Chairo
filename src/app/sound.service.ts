import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';

const BUTTON_CLICK_SRC = 'assets/sounds/ui normal button.mp3';
const BUTTON_CLICK_PLAYBACK_RATE = 0.8;

@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly document = inject(DOCUMENT);

  playButtonClick(): void {
    const AudioCtor = this.document.defaultView?.Audio;
    if (!AudioCtor) return;
    try {
      const audio = new AudioCtor(BUTTON_CLICK_SRC);
      audio.playbackRate = BUTTON_CLICK_PLAYBACK_RATE;
      audio.play().catch(() => {});
    } catch {
      // Autoplay restrictions or unsupported audio must not block interaction.
    }
  }
}
