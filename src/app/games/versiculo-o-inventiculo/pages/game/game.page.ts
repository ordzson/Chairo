import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { GameError, GamePort } from '../../domain/game.port';
import type { AnswerChoice, MatchSnapshot, PlayerStanding } from '../../domain/match';
import { MultiplayerError, MultiplayerPort } from '../../domain/multiplayer.port';
import { colorLabel, isRoomCode } from '../../domain/room';
import { ColorMarkComponent } from '../../ui/color-mark.component';
import { ManualHeaderComponent } from '../../ui/manual-header.component';

type LoadPhase = 'loading' | 'ready' | 'error';

@Component({
  selector: 'chairo-versiculo-game-page',
  imports: [ColorMarkComponent, GameIconComponent, ManualHeaderComponent, RouterLink],
  templateUrl: './game.page.html',
  styleUrl: './game.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class GamePageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly game = inject(GamePort);
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private refreshing = false;
  private clockOffset = 0;

  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '').toUpperCase();
  readonly loadPhase = signal<LoadPhase>('loading');
  readonly match = this.game.match;
  readonly now = signal(Date.now());
  readonly sending = signal(false);
  readonly connectionNote = signal('');
  readonly errorMessage = signal('');

  readonly remainingSeconds = computed(() => {
    const end = this.match()?.phaseEndsAt;
    return end === null || end === undefined ? 0 : Math.max(0, Math.ceil((end - this.now()) / 1000));
  });

  readonly timerProgress = computed(() => {
    const match = this.match();
    if (!match?.phaseEndsAt) return '0deg';
    const total = match.phase === 'question' ? (match.question?.totalSeconds ?? 12) : match.phase === 'reveal' ? 5 : 3;
    return `${Math.max(0, Math.min(360, 360 * this.remainingSeconds() / total))}deg`;
  });

  readonly scoreCards = computed(() => {
    const match = this.match();
    if (!match) return [];
    const standings = match.standings;
    if (standings.length <= 2) return standings;
    const leader = standings[0]!;
    const mine = standings.find(player => player.participantId === match.self.id);
    return mine && mine.participantId !== leader.participantId ? [leader, mine] : standings.slice(0, 2);
  });

  readonly progressMarks = computed(() => {
    const match = this.match();
    if (!match) return [];
    const count = Math.min(10, match.totalRounds);
    const ratio = match.roundNumber / match.totalRounds;
    return Array.from({ length: count }, (_, index) => ({ index, done: (index + 1) / count <= ratio }));
  });

  readonly waitingCopy = computed(() => {
    const match = this.match();
    if (!match) return '';
    const pending = Math.max(0, match.expectedAnswers - match.answeredCount);
    if (pending === 0) return 'Preparando la revelación…';
    return pending === 1 ? 'Esperando 1 respuesta más…' : `Esperando ${pending} respuestas más…`;
  });

  readonly winner = computed(() => this.match()?.standings[0] ?? null);
  readonly ownStanding = computed(() => {
    const match = this.match();
    return match?.standings.find(player => player.participantId === match.self.id) ?? null;
  });
  readonly tiedWinners = computed(() => {
    const standings = this.match()?.standings ?? [];
    return standings.length > 1 && standings[0]!.score === standings[1]!.score;
  });

  constructor() {
    void this.load();
    const view = this.document.defaultView;
    const clock = view?.setInterval(() => {
      this.now.set(Date.now() + this.clockOffset);
      const match = this.match();
      if (match?.phaseEndsAt && this.now() >= match.phaseEndsAt) void this.refresh();
    }, 200);
    const poll = view?.setInterval(() => void this.refresh(), 900);
    this.destroyRef.onDestroy(() => {
      if (clock !== undefined) view?.clearInterval(clock);
      if (poll !== undefined) view?.clearInterval(poll);
    });
  }

  formatScore(score: number): string {
    return new Intl.NumberFormat('es-GT').format(score);
  }

  formatSeconds(milliseconds: number | null): string {
    return milliseconds === null ? 'sin respuesta' : `${(milliseconds / 1000).toFixed(1)} s`;
  }

  colorName(match: MatchSnapshot): string {
    return colorLabel(match.self.color);
  }

  roleLabel(match: MatchSnapshot): string {
    if (match.self.role === 'guest') return 'Participante';
    return match.self.plays ? 'Anfitrión · jugando' : 'Solo anfitrión';
  }

  trackStanding(_index: number, standing: PlayerStanding): string {
    return standing.participantId;
  }

  async answer(choice: AnswerChoice): Promise<void> {
    const match = this.match();
    if (!match || match.selfChoice || this.sending() || match.phase !== 'question') return;
    this.sound.playButtonClick();
    this.sending.set(true);
    this.connectionNote.set('Guardando tu respuesta…');
    try {
      const snapshot = await this.game.submitAnswer(this.code, choice);
      this.applyClock(snapshot);
      this.connectionNote.set('Respuesta guardada.');
    } catch (error) {
      const reason = error instanceof GameError ? error.reason : 'unavailable';
      if (reason === 'time-up') {
        this.connectionNote.set('Se terminó el tiempo antes de guardar la respuesta.');
        await this.refresh();
      } else if (reason === 'answer-locked') {
        this.connectionNote.set('Tu respuesta ya estaba guardada.');
        await this.refresh();
      } else {
        this.connectionNote.set('No pudimos guardar la respuesta. Revisa tu conexión e inténtalo otra vez.');
      }
    } finally {
      this.sending.set(false);
    }
  }

  async leaveGame(): Promise<void> {
    const self = this.match()?.self ?? this.multiplayer.self();
    this.connectionNote.set('Cerrando tu participación…');
    try {
      if (self?.role === 'host') await this.multiplayer.closeRoom(this.code);
      else await this.multiplayer.leaveRoom(this.code);
    } catch (error) {
      const reason = error instanceof MultiplayerError ? error.reason : 'unavailable';
      if (reason !== 'room-not-found') {
        this.connectionNote.set(self?.role === 'host'
          ? 'No pudimos cerrar la sala. Revisa tu conexión y vuelve a intentarlo.'
          : 'No pudimos retirar tu asiento. Revisa tu conexión y vuelve a intentarlo.');
        return;
      }
    }
    await this.router.navigateByUrl('/');
  }

  async playAgain(): Promise<void> {
    const self = this.match()?.self;
    if (self?.role !== 'host') {
      await this.router.navigateByUrl('/');
      return;
    }
    this.connectionNote.set('Cerrando esta sala…');
    try {
      await this.multiplayer.closeRoom(this.code);
    } catch (error) {
      const reason = error instanceof MultiplayerError ? error.reason : 'unavailable';
      if (reason !== 'room-not-found') {
        this.connectionNote.set('No pudimos cerrar esta sala. Revisa tu conexión y vuelve a intentarlo.');
        return;
      }
    }
    await this.router.navigateByUrl('/juegos/versiculo-o-inventiculo');
  }

  private async load(): Promise<void> {
    if (!isRoomCode(this.code)) {
      this.fail('El código de la partida no es válido.');
      return;
    }
    try {
      await this.multiplayer.restoreRoom(this.code);
      const snapshot = await this.game.restoreMatch(this.code);
      this.applyClock(snapshot);
      this.loadPhase.set('ready');
    } catch (error) {
      const reason = error instanceof GameError ? error.reason : 'unavailable';
      this.fail(reason === 'match-not-found'
        ? 'La partida todavía no comenzó o ya terminó de cerrarse.'
        : 'No pudimos recuperar la partida. Revisa tu conexión e inténtalo otra vez.');
    }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing || this.loadPhase() !== 'ready') return;
    this.refreshing = true;
    try {
      const snapshot = await this.game.restoreMatch(this.code);
      this.applyClock(snapshot);
      this.connectionNote.set('');
    } catch {
      this.connectionNote.set('Reconectando con la partida…');
    } finally {
      this.refreshing = false;
    }
  }

  private applyClock(snapshot: MatchSnapshot): void {
    this.clockOffset = snapshot.serverNow - Date.now();
    this.now.set(snapshot.serverNow);
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.loadPhase.set('error');
  }
}
