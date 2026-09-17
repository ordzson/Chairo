import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { ManualHeaderComponent } from '../../../versiculo-o-inventiculo/ui/manual-header.component';
import {
  COUNTDOWN_SECONDS,
  TURN_PHASES,
  WAGER_STEP,
  playerName,
  playingPlayers,
  selfPlayer,
  wagerLimit,
  type JeopardyAnswerKey,
  type JeopardyTile
} from '../../domain/jeopardy';
import { JeopardyError, JeopardyPort, type JeopardyErrorReason } from '../../domain/jeopardy.port';

type LoadPhase = 'loading' | 'ready' | 'error';

const MOVE_ERRORS: Partial<Record<JeopardyErrorReason, string>> = {
  'not-your-turn': 'Ahora no te toca a ti.',
  'steal-taken': 'Alguien pidió robar antes que tú.',
  'invalid-move': 'La jugada ya cambió. Mira el tablero actualizado.',
  'not-host': 'Solo el anfitrión puede hacer eso.',
  'room-not-found': 'La sala ya se cerró.'
};

@Component({
  selector: 'chairo-jeopardy-game-page',
  imports: [ManualHeaderComponent],
  templateUrl: './game.page.html',
  styleUrls: ['../../ui/jeopardy-shell.css', './game.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JeopardyGamePageComponent {
  private readonly rooms = inject(JeopardyPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private leaving = false;
  /** La última cuenta que ya pidió la sala al vencer, para no pedirla en cada tic. */
  private expiredDeadline: number | null = null;
  private readonly previewDialog = viewChild<ElementRef<HTMLDialogElement>>('previewDialog');
  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '').toUpperCase();
  readonly room = this.rooms.room;
  readonly loadPhase = signal<LoadPhase>('loading');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly wager = signal(WAGER_STEP);
  readonly wagerStep = WAGER_STEP;
  readonly countdownSeconds = COUNTDOWN_SECONDS;
  readonly now = signal(Date.now());
  readonly self = computed(() => selfPlayer(this.room()));
  readonly isHost = computed(() => this.self()?.isHost === true);
  /** El anfitrión que no juega puede mirar cualquier casilla; si juega solo, tocarla la elige. */
  readonly conducts = computed(() => this.isHost() && this.self()?.plays === false);
  readonly hostControls = computed(() => this.isHost() && TURN_PHASES.includes(this.room()?.phase ?? 'waiting'));
  readonly clue = computed(() => this.room()?.clue ?? null);
  /** Cada casilla abierta empieza con la respuesta tapada. */
  readonly showAnswer = linkedSignal({ source: () => this.clue()?.id ?? null, computation: () => false });
  readonly preview = signal<JeopardyAnswerKey | null>(null);
  readonly remaining = computed(() => {
    const deadline = this.room()?.deadline ?? null;
    // El último tic puede ser anterior a la cuenta: nunca se muestra más de lo que dura.
    return deadline === null
      ? null
      : Math.max(0, Math.min(COUNTDOWN_SECONDS, Math.ceil((deadline - this.now()) / 1000)));
  });
  readonly current = computed(() => {
    const room = this.room();
    return room?.players.find(player => player.id === room.turnPlayerId) ?? null;
  });
  readonly wagerMax = computed(() => wagerLimit(this.self()?.score ?? 0, this.room()?.board ?? []));
  readonly columns = computed(() => {
    const room = this.room();
    if (!room) return [];
    return Array.from({ length: room.setup.columns }, (_, column) => ({
      name: room.board.find(cell => cell.column === column)?.category ?? '',
      cells: room.board.filter(cell => cell.column === column).sort((a, b) => a.row - b.row)
    }));
  });
  readonly ranking = computed(() => [...playingPlayers(this.room()?.players ?? [])].sort((a, b) => b.score - a.score));
  readonly myTurn = computed(() => !!this.self() && this.current()?.id === this.self()?.id);
  readonly myAttempt = computed(() => !!this.self() && this.room()?.attemptPlayerId === this.self()?.id);
  readonly canSteal = computed(() => {
    const room = this.room();
    const self = this.self();
    return room?.phase === 'steal' && !!self && room.stealQueue.includes(self.id);
  });
  readonly attemptName = computed(() => {
    const room = this.room();
    return (room && playerName(room, room.attemptPlayerId)) || 'La persona en turno';
  });
  readonly stealWaiting = computed(() => {
    const room = this.room();
    const names = room ? room.stealQueue.map(id => playerName(room, id)).filter(Boolean) : [];
    if (names.length === 0) return 'Esperando a que alguien intente robar.';
    const list = new Intl.ListFormat('es', { type: 'conjunction' }).format(names);
    return names.length === 1 ? `${list} puede robar.` : `${list} pueden robar. Roba quien lo pida primero.`;
  });
  readonly boardInstruction = computed(() => {
    if (this.myTurn()) return 'Tu turno: elige una casilla.';
    const name = this.current()?.name ?? '';
    return this.conducts()
      ? `Turno de ${name}. Toca una casilla para ver su pregunta y respuesta.`
      : `Solo ${name} puede elegir.`;
  });

  constructor() {
    void this.load();
    const view = inject(DOCUMENT).defaultView;
    const clock = view?.setInterval(() => this.tick(), 250);
    inject(DestroyRef).onDestroy(() => {
      if (clock !== undefined) view?.clearInterval(clock);
    });
    effect(() => {
      const room = this.room();
      if (this.loadPhase() !== 'ready' || this.leaving) return;
      // El anfitrión armó otra ronda: todos vuelven a la sala con él.
      if (room?.status === 'waiting') void this.router.navigate(['/juegos/jeopardy/sala', room.code]);
      if (!room) {
        this.error.set('El anfitrión cerró la sala.');
        this.loadPhase.set('error');
      }
    });
  }

  select(cellId: string): Promise<void> {
    return this.move(() => this.rooms.selectCell(this.code, cellId));
  }

  updateWager(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.wager.set(event.target.valueAsNumber || WAGER_STEP);
  }

  confirmWager(): Promise<void> {
    return this.move(() => this.rooms.setWager(this.code, this.wager()));
  }

  answered(): Promise<void> { return this.move(() => this.rooms.markAnswered(this.code)); }
  judge(correct: boolean): Promise<void> { return this.move(() => this.rooms.judge(this.code, correct)); }
  steal(): Promise<void> { return this.move(() => this.rooms.acceptSteal(this.code)); }
  pass(): Promise<void> { return this.move(() => this.rooms.passSteal(this.code)); }
  countdown(): Promise<void> { return this.move(() => this.rooms.startCountdown(this.code)); }
  endTurn(): Promise<void> { return this.move(() => this.rooms.endTurn(this.code)); }

  toggleAnswer(): void {
    this.sound.playButtonClick();
    this.showAnswer.update(shown => !shown);
  }

  tileLabel(category: string, tile: JeopardyTile): string {
    const label = tile.used ? `${category}, usada` : `${category}, ${tile.value} puntos`;
    return this.conducts() ? `${label}, ver pregunta y respuesta` : label;
  }

  /** El anfitrión mira una casilla sin abrirla para nadie más. */
  async reveal(cellId: string): Promise<void> {
    this.sound.playButtonClick();
    this.error.set('');
    try {
      this.preview.set(await this.rooms.revealCell(this.code, cellId));
      const dialog = this.previewDialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    } catch {
      this.error.set('No pudimos abrir esa casilla. Revisa tu conexión y vuelve a intentarlo.');
    }
  }

  closePreview(): void {
    this.previewDialog()?.nativeElement.close();
  }

  /** La sala sigue abierta con todos dentro: el anfitrión elige el tablero nuevo. */
  async playAgain(): Promise<void> {
    this.sound.playButtonClick();
    this.leaving = true;
    await this.router.navigate(['/juegos/jeopardy/sala', this.code, 'configurar']);
  }

  /** El anfitrión cierra la sala para todos; quien juega deja su puesto. */
  async finish(): Promise<void> {
    if (this.busy()) return;
    this.sound.playButtonClick();
    this.busy.set(true);
    this.leaving = true;
    try {
      if (this.isHost()) await this.rooms.closeRoom(this.code);
      else if (this.self()) await this.rooms.leaveRoom(this.code);
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      if (reason !== 'room-not-found') {
        this.leaving = false;
        this.busy.set(false);
        this.error.set('No pudimos salir de la sala. Revisa tu conexión y vuelve a intentarlo.');
        return;
      }
    }
    this.busy.set(false);
    await this.router.navigateByUrl('/');
  }

  /** Al vencer la cuenta se vuelve a pedir la sala: esa lectura termina el turno. */
  private tick(): void {
    const now = Date.now();
    this.now.set(now);
    const deadline = this.room()?.deadline ?? null;
    if (deadline === null || now < deadline || deadline === this.expiredDeadline) return;
    this.expiredDeadline = deadline;
    void this.rooms.restoreRoom(this.code).catch(() => undefined);
  }

  private async move(action: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.sound.playButtonClick();
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      this.error.set(MOVE_ERRORS[reason] ?? 'No pudimos enviar la jugada. Revisa tu conexión y vuelve a intentarlo.');
      // La jugada llegó tarde: se muestra el estado que ya tiene la sala.
      await this.rooms.restoreRoom(this.code).catch(() => undefined);
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      await this.rooms.restoreRoom(this.code);
      this.loadPhase.set('ready');
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      this.error.set(reason === 'room-not-found'
        ? 'La partida ya no está disponible.'
        : 'No pudimos contactar con la partida. Revisa tu conexión.');
      this.loadPhase.set('error');
    }
  }
}
