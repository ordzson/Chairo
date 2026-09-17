import { ChangeDetectionStrategy, Component, computed, inject, signal, type WritableSignal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { MultiplayerError, MultiplayerPort } from '../../domain/multiplayer.port';
import { isRoomCode, MAX_NAME_LENGTH, type RoomCode } from '../../domain/room';
import {
  DIFFICULTIES,
  LONG_STATEMENT_EXTRA_SECONDS,
  QUESTION_COUNTS,
  QUESTION_SECONDS,
  REVEAL_SECONDS,
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
  readonly questionSecondsOptions = QUESTION_SECONDS;
  readonly revealSecondsOptions = REVEAL_SECONDS;
  readonly longStatementExtraSeconds = LONG_STATEMENT_EXTRA_SECONDS;
  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly difficulty = signal<Difficulty>(this.initial.difficulty);
  readonly questionCount = signal(this.initial.questionCount);
  readonly hostRole = signal<HostRole>(this.initial.hostRole);
  readonly questionSeconds = signal(this.initial.questionSeconds);
  readonly revealSeconds = signal(this.initial.revealSeconds);
  /** Así ven al anfitrión los demás; al reiniciar la sala conserva su asiento. */
  readonly hostName = signal('Anfitrión');
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

  writeHostName(field: HTMLInputElement): void {
    const clean = field.value.slice(0, MAX_NAME_LENGTH);
    if (field.value !== clean) field.value = clean;
    this.hostName.set(clean);
    this.createError.set('');
  }

  changeQuestionCount(direction: -1 | 1): void {
    this.step(this.questionCount, this.questionCounts, direction);
  }

  changeQuestionSeconds(direction: -1 | 1): void {
    this.step(this.questionSeconds, this.questionSecondsOptions, direction);
  }

  changeRevealSeconds(direction: -1 | 1): void {
    this.step(this.revealSeconds, this.revealSecondsOptions, direction);
  }

  /**
   * Guarda la configuración y abre la sala, o reinicia la que ya estaba
   * abierta, y entrega el código al anfitrión.
   */
  async createRoom(): Promise<void> {
    if (this.creating()) return;
    const code = this.reopenCode();
    const hostName = this.hostName().trim();
    if (!code && !hostName) {
      this.createError.set('Escribe tu nombre para abrir la sala.');
      return;
    }
    const setup: MatchSetup = {
      difficulty: this.difficulty(),
      questionCount: this.questionCount(),
      hostRole: this.hostRole(),
      questionSeconds: this.questionSeconds(),
      revealSeconds: this.revealSeconds()
    };
    this.sound.playButtonClick();
    this.drafts.write(setup);
    this.creating.set(true);
    this.createError.set('');
    try {
      const room = code
        ? await this.multiplayer.reopenRoom(code, setup)
        : await this.multiplayer.createRoom(setup, hostName);
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
      this.questionSeconds.set(room.setup.questionSeconds);
      this.revealSeconds.set(room.setup.revealSeconds);
    } catch (error) {
      if (error instanceof MultiplayerError && error.reason === 'room-not-found') this.forgetRoom(code);
    }
  }

  /** Avanza un paso dentro de las opciones permitidas, sin salirse de los extremos. */
  private step(value: WritableSignal<number>, options: readonly number[], direction: -1 | 1): void {
    const index = options.indexOf(value());
    const nextValue = options[Math.min(options.length - 1, Math.max(0, index + direction))];
    if (nextValue === undefined || nextValue === value()) return;
    this.sound.playButtonClick();
    this.touched = true;
    value.set(nextValue);
    this.createError.set('');
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
