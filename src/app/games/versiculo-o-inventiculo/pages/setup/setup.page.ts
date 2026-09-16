import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { MultiplayerError, MultiplayerPort } from '../../domain/multiplayer.port';
import { isRoomCode, type RoomCode } from '../../domain/room';
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
  private readonly route = inject(ActivatedRoute);
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private readonly initial = this.drafts.read();
  private touched = false;

  readonly difficulties = DIFFICULTIES;
  readonly questionCounts = QUESTION_COUNTS;
  readonly difficulty = signal<Difficulty>(this.initial.difficulty);
  readonly questionCount = signal(this.initial.questionCount);
  readonly hostRole = signal<HostRole>(this.initial.hostRole);
  readonly creating = signal(false);
  readonly createError = signal('');

  /**
   * Con código en la ruta la pantalla viene de «Jugar otra vez»: no abre otra
   * sala, reinicia esa para quienes ya estaban dentro. Si la sala se cerró
   * entretanto, vuelve a ser la configuración de siempre.
   */
  readonly reopenCode = signal<RoomCode | null>(this.routeCode());
  readonly resultsRoute = computed(() => {
    const code = this.reopenCode();
    return code ? `/juegos/versiculo-o-inventiculo/partida/${code}` : '/';
  });

  constructor() {
    const code = this.reopenCode();
    if (code) void this.loadRoom(code);
  }

  chooseDifficulty(difficulty: Difficulty): void {
    this.sound.playButtonClick();
    this.touched = true;
    this.difficulty.set(difficulty);
    this.createError.set('');
  }

  chooseHostRole(role: HostRole): void {
    this.sound.playButtonClick();
    this.touched = true;
    this.hostRole.set(role);
    this.createError.set('');
  }

  changeQuestionCount(direction: -1 | 1): void {
    const index = this.questionCounts.indexOf(this.questionCount() as (typeof QUESTION_COUNTS)[number]);
    const nextIndex = Math.min(this.questionCounts.length - 1, Math.max(0, index + direction));
    const nextValue = this.questionCounts[nextIndex];
    if (nextValue === undefined || nextValue === this.questionCount()) return;
    this.sound.playButtonClick();
    this.touched = true;
    this.questionCount.set(nextValue);
    this.createError.set('');
  }

  /**
   * Guarda la configuración y abre la sala, o reinicia la que ya estaba
   * abierta, y entrega el código al anfitrión.
   */
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
    const code = this.reopenCode();
    try {
      const room = code
        ? await this.multiplayer.reopenRoom(code, setup)
        : await this.multiplayer.createRoom(setup);
      await this.router.navigate(['/juegos/versiculo-o-inventiculo/sala', room.code]);
    } catch (error) {
      if (!code) {
        this.createError.set('No pudimos abrir la sala. Vuelve a intentarlo.');
        return;
      }
      const reason = error instanceof MultiplayerError ? error.reason : 'unavailable';
      if (reason === 'room-not-found') this.forgetRoom(code);
      else this.createError.set(reason === 'room-started'
        ? 'La partida de esta sala sigue en curso. Espera a que termine.'
        : 'No pudimos reiniciar la sala. Vuelve a intentarlo.');
    } finally {
      this.creating.set(false);
    }
  }

  /** Parte de la configuración que ya tenía la sala, salvo que ya se haya tocado. */
  private async loadRoom(code: RoomCode): Promise<void> {
    try {
      const room = await this.multiplayer.restoreRoom(code);
      if (this.multiplayer.self()?.role !== 'host') {
        this.forgetRoom(code);
        return;
      }
      if (this.touched) return;
      this.difficulty.set(room.setup.difficulty);
      this.questionCount.set(room.setup.questionCount);
      this.hostRole.set(room.setup.hostRole);
    } catch (error) {
      if (error instanceof MultiplayerError && error.reason === 'room-not-found') this.forgetRoom(code);
    }
  }

  private forgetRoom(code: RoomCode): void {
    this.reopenCode.set(null);
    this.createError.set(`La sala ${code} ya no está abierta. Toca «Crear sala» para abrir una nueva.`);
  }

  private routeCode(): RoomCode | null {
    const code = (this.route.snapshot.paramMap.get('codigo') ?? '').toUpperCase();
    return isRoomCode(code) ? code : null;
  }
}
