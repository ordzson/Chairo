import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { PasswordError, winner, type PasswordPhase } from '../../domain/match';
import { PasswordPort } from '../../domain/password.port';
import { isRoomCode, type RoomCode } from '../../domain/room';
import { availablePasswordWords } from '../../infrastructure/word-bank';
import { PasswordHeaderComponent } from '../../ui/password-header.component';

const HOLD_MS = 600;

@Component({
  selector: 'chairo-password-game-page',
  imports: [PasswordHeaderComponent, RouterLink],
  templateUrl: './game.page.html',
  styleUrls: ['../../ui/password.css', '../../ui/password-game.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordGamePageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly port = inject(PasswordPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private readonly words = availablePasswordWords();
  private holdTimer?: number;
  private wakeLock?: WakeLockSentinel;
  private wakeLockPending = false;
  private announcedRound = 0;
  private announcedTen = false;
  private announcedZero = false;
  private resultRound = 0;

  readonly code: RoomCode | null = parseCode(inject(ActivatedRoute).snapshot.paramMap.get('codigo'));
  readonly snapshot = this.port.snapshot;
  readonly connection = this.port.connection;
  readonly now = signal(Date.now());
  readonly clockOffset = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly liveMessage = signal('');
  readonly holding = signal(false);
  readonly confirmEnd = signal(false);
  readonly results = signal<Record<string, boolean | undefined>>({});

  readonly correctedNow = computed(() => this.now() + this.clockOffset());
  readonly phase = computed<PasswordPhase>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return 'waiting';
    return snapshot.phase === 'countdown' && snapshot.wordVisibleAt !== null && this.correctedNow() >= snapshot.wordVisibleAt
      ? 'playing'
      : snapshot.phase;
  });
  readonly countdown = computed(() => {
    const target = this.snapshot()?.wordVisibleAt;
    return target === null || target === undefined ? 3 : Math.max(1, Math.ceil((target - this.correctedNow()) / 1_000));
  });
  readonly remainingSeconds = computed(() => {
    const deadline = this.snapshot()?.deadlineAt;
    return deadline === null || deadline === undefined
      ? 0
      : Math.max(0, Math.ceil((deadline - this.correctedNow()) / 1_000));
  });
  readonly isHost = computed(() => this.snapshot()?.self.role === 'host');
  readonly allResultsSelected = computed(() => {
    const snapshot = this.snapshot();
    const results = this.results();
    return Boolean(snapshot && snapshot.players.length === 2 && snapshot.players.every(player => typeof results[player.id] === 'boolean'));
  });
  readonly winner = computed(() => {
    const snapshot = this.snapshot();
    return snapshot ? winner(snapshot) : null;
  });
  readonly phaseTitle = computed(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return 'Revelaciones';
    const phase = this.phase();
    if (phase === 'finished') return 'Partida terminada';
    if (phase === 'scoreboard') return 'Marcador';
    if (phase === 'scoring') return `Ronda ${snapshot.roundNumber} · Anotar puntos`;
    return `Revelaciones · Ronda ${snapshot.roundNumber}`;
  });

  constructor() {
    const view = this.document.defaultView;
    const timer = view?.setInterval(() => this.now.set(Date.now()), 200);
    this.destroyRef.onDestroy(() => {
      if (timer !== undefined) view?.clearInterval(timer);
      this.cancelHold();
      void this.releaseWakeLock();
    });

    effect(() => {
      const snapshot = this.snapshot();
      if (!snapshot) return;
      this.clockOffset.set(snapshot.serverNow - Date.now());
      if (snapshot.phase === 'waiting') void this.router.navigate(['/juegos/revelaciones/sala', snapshot.code]);
      if (snapshot.roundNumber !== this.resultRound) {
        this.resultRound = snapshot.roundNumber;
        this.results.set({});
      }
    });

    effect(() => {
      const snapshot = this.snapshot();
      const phase = this.phase();
      const remaining = this.remainingSeconds();
      if (!snapshot) return;
      if (snapshot.roundNumber !== this.announcedRound) {
        this.announcedRound = snapshot.roundNumber;
        this.announcedTen = false;
        this.announcedZero = false;
      }
      if (phase === 'playing' && remaining <= 10 && remaining > 0 && !this.announcedTen) {
        this.announcedTen = true;
        this.liveMessage.set('Quedan 10 segundos.');
        this.notifyDevice(35);
      }
      if (phase === 'playing' && remaining === 0 && !this.announcedZero) {
        this.announcedZero = true;
        this.liveMessage.set('Tiempo agotado. La ronda continúa hasta que la persona anfitriona la termine.');
        this.notifyDevice([50, 40, 80]);
      }
      if (phase === 'countdown' || phase === 'playing') void this.requestWakeLock();
      if (phase !== 'countdown' && phase !== 'playing') void this.releaseWakeLock();
    });

    if (this.code) void this.restore(this.code);
    else this.error.set('El código de partida no es válido.');
  }

  async toggleReady(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.busy()) return;
    if (this.words.length < 2) {
      this.error.set('Falta el banco real de palabras. Añade al menos dos entradas y ejecuta el generador.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.sound.playButtonClick();
    if (!snapshot.self.ready) void this.requestWakeLock();
    try {
      const next = await this.port.setReady(snapshot.code, !snapshot.self.ready, this.words);
      this.liveMessage.set(next.phase === 'countdown'
        ? 'Ambas personas están listas. Comienza la cuenta 3, 2, 1.'
        : next.self.ready ? 'Estás listo. Esperando a la otra persona.' : 'Ya no estás listo.');
    } catch (failure) {
      this.error.set(messageFor(failure));
    } finally {
      this.busy.set(false);
    }
  }

  chooseResult(playerId: string, guessed: boolean): void {
    this.sound.playButtonClick();
    this.results.update(current => ({ ...current, [playerId]: guessed }));
    this.error.set('');
  }

  async saveScores(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.busy() || !this.allResultsSelected()) return;
    const complete: Record<string, boolean> = {};
    for (const player of snapshot.players) complete[player.id] = this.results()[player.id]!;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.port.scoreRound(snapshot.code, complete);
      this.liveMessage.set('Puntos guardados.');
    } catch (failure) {
      this.error.set(messageFor(failure));
    } finally {
      this.busy.set(false);
    }
  }

  async nextRound(): Promise<void> {
    await this.act(snapshot => this.port.prepareRound(snapshot.code), 'Preparando otra ronda…');
  }

  async finishMatch(): Promise<void> {
    await this.act(snapshot => this.port.finishMatch(snapshot.code), 'Partida terminada.');
  }

  async playAgain(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    await this.act(current => this.port.reopenRoom(current.code, { roundSeconds: current.roundSeconds }), 'Sala reiniciada.');
    await this.router.navigate(['/juegos/revelaciones/sala', snapshot.code]);
  }

  startHold(event?: Event): void {
    if (!this.isHost() || this.busy() || this.holding()) return;
    event?.preventDefault();
    this.confirmEnd.set(false);
    this.holding.set(true);
    this.holdTimer = this.document.defaultView?.setTimeout(() => void this.endRound(), HOLD_MS);
  }

  cancelHold(): void {
    if (this.holdTimer !== undefined) this.document.defaultView?.clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
    this.holding.set(false);
  }

  holdKeyDown(event: KeyboardEvent): void {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) this.startHold(event);
  }

  holdKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.cancelHold();
    }
  }

  async endRoundConfirmed(): Promise<void> {
    this.confirmEnd.set(false);
    await this.endRound();
  }

  private async endRound(): Promise<void> {
    this.cancelHold();
    await this.act(snapshot => this.port.endRound(snapshot.code), 'Ronda terminada. Ahora anota los puntos.');
  }

  private async act(
    action: (snapshot: NonNullable<ReturnType<typeof this.snapshot>>) => Promise<unknown>,
    liveMessage: string
  ): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.sound.playButtonClick();
    try {
      await action(snapshot);
      this.liveMessage.set(liveMessage);
    } catch (failure) {
      this.error.set(messageFor(failure));
    } finally {
      this.busy.set(false);
    }
  }

  private async restore(code: RoomCode): Promise<void> {
    try {
      await this.port.restoreRoom(code);
    } catch (failure) {
      this.error.set(messageFor(failure));
    }
  }

  private async requestWakeLock(): Promise<void> {
    if (this.wakeLock || this.wakeLockPending || this.document.visibilityState !== 'visible') return;
    this.wakeLockPending = true;
    try {
      const navigator = this.document.defaultView?.navigator as (Navigator & { wakeLock?: WakeLock }) | undefined;
      this.wakeLock ??= await navigator?.wakeLock?.request('screen');
      this.wakeLock?.addEventListener('release', () => {
        this.wakeLock = undefined;
        const phase = this.phase();
        if (phase === 'countdown' || phase === 'playing') void this.requestWakeLock();
      });
    } catch {
      // No todos los navegadores exponen Wake Lock; jugar sigue siendo posible.
    } finally {
      this.wakeLockPending = false;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const lock = this.wakeLock;
    this.wakeLock = undefined;
    try { await lock?.release(); } catch { /* Ya estaba liberado. */ }
  }

  private notifyDevice(pattern: VibratePattern): void {
    try { this.document.defaultView?.navigator.vibrate?.(pattern); } catch { /* opcional */ }
  }
}

function parseCode(value: string | null): RoomCode | null {
  const code = (value ?? '').toLocaleUpperCase('es');
  return isRoomCode(code) ? code : null;
}

function messageFor(failure: unknown): string {
  if (!(failure instanceof PasswordError)) return 'Perdimos la conexión. Conservamos el estado y puedes volver a intentarlo.';
  if (failure.reason === 'room-not-found') return 'La sala ya no está abierta. Vuelve al centro y crea o busca otra.';
  if (failure.reason === 'bank-insufficient') return 'El banco necesita al menos dos palabras distintas.';
  if (failure.reason === 'not-host') return 'Solo la persona anfitriona puede hacer eso.';
  if (failure.reason === 'invalid-results') return 'Marca un resultado para las dos personas antes de guardar.';
  if (failure.reason === 'invalid-phase') return 'La partida cambió de fase. Estamos recuperando el estado correcto.';
  return 'No pudimos completar la acción. Revisa la conexión e inténtalo otra vez.';
}
