import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GAMES } from '../../game';
import { GameIconComponent } from '../../game-icon.component';
import {
  isPlayPreference,
  PLAY_PREFERENCES,
  type PlayPreference,
  PreferenceService
} from '../../preference.service';
import { SoundService } from '../../sound.service';

@Component({
  selector: 'chairo-game-center-page',
  imports: [GameIconComponent, RouterLink],
  templateUrl: './game-center.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GameCenterPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly preferenceStore = inject(PreferenceService);
  private readonly sound = inject(SoundService);

  readonly games = GAMES;
  readonly preferences = PLAY_PREFERENCES;
  readonly selectedIndex = signal(0);
  readonly selectedGame = computed(() => this.games[this.selectedIndex()]!);
  readonly preference = signal<PlayPreference>(this.preferenceStore.read());

  selectGame(index: number): void {
    if (index >= 0 && index < this.games.length) this.selectedIndex.set(index);
  }

  onGameTabClick(index: number): void {
    this.sound.playButtonClick();
    this.selectGame(index);
  }

  onStartGameClick(): void {
    this.sound.playButtonClick();
  }

  handleTabKey(event: KeyboardEvent, index: number): void {
    let nextIndex: number | undefined;
    switch (event.key) {
      case 'ArrowUp':
        nextIndex = (index - 1 + this.games.length) % this.games.length;
        break;
      case 'ArrowDown':
        nextIndex = (index + 1) % this.games.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = this.games.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.selectGame(nextIndex);
    this.focusTab(nextIndex);
  }

  focusSelectedTab(event: Event): void {
    event.preventDefault();
    this.focusTab(this.selectedIndex());
  }

  updatePreference(event: Event): void {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : 'none';
    if (!isPlayPreference(value)) return;
    this.preference.set(value);
    this.preferenceStore.write(value);
  }

  private focusTab(index: number): void {
    this.document.getElementById(`game-tab-${index}`)?.focus();
  }
}
