import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { PasswordError } from '../../domain/match';
import { PasswordPort } from '../../domain/password.port';
import { MAX_NAME_LENGTH } from '../../domain/room';
import { ROUND_SECONDS, type RoundSeconds } from '../../domain/setup-config';
import { PasswordSetupDraftStore } from '../../infrastructure/setup-draft.store';
import { availablePasswordWords } from '../../infrastructure/word-bank';
import { PasswordHeaderComponent } from '../../ui/password-header.component';

@Component({
  selector: 'chairo-password-setup-page',
  imports: [PasswordHeaderComponent, RouterLink],
  templateUrl: './setup.page.html',
  styleUrl: '../../ui/password.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordSetupPageComponent {
  private readonly drafts = inject(PasswordSetupDraftStore);
  private readonly port = inject(PasswordPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private readonly initial = this.drafts.read();

  readonly durations = ROUND_SECONDS;
  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly hostName = signal('Anfitrión');
  readonly roundSeconds = signal<RoundSeconds>(this.initial.roundSeconds);
  readonly creating = signal(false);
  readonly error = signal('');
  readonly bankReady = availablePasswordWords().length >= 2;

  writeName(field: HTMLInputElement): void {
    const value = field.value.slice(0, MAX_NAME_LENGTH);
    if (field.value !== value) field.value = value;
    this.hostName.set(value);
    this.error.set('');
  }

  chooseDuration(seconds: RoundSeconds): void {
    this.sound.playButtonClick();
    this.roundSeconds.set(seconds);
    this.error.set('');
  }

  async createRoom(): Promise<void> {
    if (this.creating()) return;
    const name = this.hostName().trim();
    if (!name) {
      this.error.set('Escribe tu nombre para crear la sala.');
      return;
    }
    const setup = { roundSeconds: this.roundSeconds() } as const;
    this.sound.playButtonClick();
    this.drafts.write(setup);
    this.creating.set(true);
    this.error.set('');
    try {
      const snapshot = await this.port.createRoom(setup, name);
      await this.router.navigate(['/juegos/revelaciones/sala', snapshot.code]);
    } catch (failure) {
      this.error.set(failure instanceof PasswordError && failure.reason === 'code-unavailable'
        ? 'No pudimos reservar un código libre. Inténtalo otra vez.'
        : 'No pudimos crear la sala. Revisa la conexión e inténtalo otra vez.');
    } finally {
      this.creating.set(false);
    }
  }
}

