import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { MultiplayerPort } from '../../domain/multiplayer.port';
import {
  DIFFICULTIES,
  QUESTION_COUNTS,
  type Difficulty,
  type HostRole,
  type MatchSetup
} from '../../domain/setup-config';
import { SetupDraftStore } from '../../infrastructure/setup-draft.store';
import { ManualHeaderComponent } from '../../ui/manual-header.component';

@Component({
  selector: 'chairo-versiculo-setup-page',
  imports: [GameIconComponent, ManualHeaderComponent, RouterLink],
  templateUrl: './setup.page.html',
  styleUrl: './setup.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetupPageComponent {
  private readonly drafts = inject(SetupDraftStore);
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private readonly initial = this.drafts.read();

  readonly difficulties = DIFFICULTIES;
  readonly questionCounts = QUESTION_COUNTS;
  readonly difficulty = signal<Difficulty>(this.initial.difficulty);
  readonly questionCount = signal(this.initial.questionCount);
  readonly hostRole = signal<HostRole>(this.initial.hostRole);
  readonly creating = signal(false);
  readonly createError = signal('');

  chooseDifficulty(difficulty: Difficulty): void {
    this.sound.playButtonClick();
    this.difficulty.set(difficulty);
    this.createError.set('');
  }

  chooseHostRole(role: HostRole): void {
    this.sound.playButtonClick();
    this.hostRole.set(role);
    this.createError.set('');
  }

  changeQuestionCount(direction: -1 | 1): void {
    const index = this.questionCounts.indexOf(this.questionCount() as (typeof QUESTION_COUNTS)[number]);
    const nextIndex = Math.min(this.questionCounts.length - 1, Math.max(0, index + direction));
    const nextValue = this.questionCounts[nextIndex];
    if (nextValue === undefined || nextValue === this.questionCount()) return;
    this.sound.playButtonClick();
    this.questionCount.set(nextValue);
    this.createError.set('');
  }

  /** Guarda la configuración, abre la sala y entrega el código al anfitrión. */
  async createRoom(): Promise<void> {
    if (this.creating()) return;
    const setup: MatchSetup = {
      difficulty: this.difficulty(),
      questionCount: this.questionCount(),
      hostRole: this.hostRole()
    };
    this.sound.playButtonClick();
    this.drafts.write(setup);
    this.creating.set(true);
    this.createError.set('');
    try {
      const room = await this.multiplayer.createRoom(setup);
      await this.router.navigate(['/juegos/versiculo-o-inventiculo/sala', room.code]);
    } catch {
      this.createError.set('No pudimos abrir la sala. Vuelve a intentarlo.');
    } finally {
      this.creating.set(false);
    }
  }
}
