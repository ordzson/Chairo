import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { ManualHeaderComponent } from '../../../versiculo-o-inventiculo/ui/manual-header.component';
import { WAGER_STEP, playerName, playingPlayers, selfPlayer, wagerLimit } from '../../domain/jeopardy';
import { JeopardyError, JeopardyPort, type JeopardyErrorReason } from '../../domain/jeopardy.port';

type LoadPhase = 'loading' | 'ready' | 'error';

const MOVE_ERRORS: Partial<Record<JeopardyErrorReason, string>> = {
  'not-your-turn': 'Ahora no te toca a ti.',
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
  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '').toUpperCase();
  readonly room = this.rooms.room;
  readonly loadPhase = signal<LoadPhase>('loading');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly wager = signal(WAGER_STEP);
  readonly wagerStep = WAGER_STEP;
  readonly self = computed(() => selfPlayer(this.room()));
  readonly isHost = computed(() => this.self()?.isHost === true);
  readonly clue = computed(() => this.room()?.clue ?? null);
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
  readonly mySteal = computed(() => !!this.self() && this.room()?.stealQueue[0] === this.self()?.id);
  readonly attemptName = computed(() => {
    const room = this.room();
    return (room && playerName(room, room.attemptPlayerId)) || 'La persona en turno';
  });
  readonly stealerName = computed(() => {
    const room = this.room();
    return (room && playerName(room, room.stealQueue[0] ?? null)) || 'quien puede robar';
  });

  constructor() {
    void this.load();
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
