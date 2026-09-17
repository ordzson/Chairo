import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { ManualHeaderComponent } from '../../../versiculo-o-inventiculo/ui/manual-header.component';
import { QrCodeComponent } from '../../../versiculo-o-inventiculo/ui/qr-code.component';
import { JEOPARDY_BANK } from '../../domain/question-bank.generated';
import {
  MAX_PLAYERS,
  SPECIAL_COUNT,
  createJeopardyBoard,
  playingPlayers,
  selfPlayer,
  type JeopardyPlayer
} from '../../domain/jeopardy';
import { JeopardyError, JeopardyPort } from '../../domain/jeopardy.port';

type LoadPhase = 'loading' | 'ready' | 'error';

@Component({
  selector: 'chairo-jeopardy-room-page',
  imports: [ManualHeaderComponent, QrCodeComponent],
  templateUrl: './room.page.html',
  styleUrls: ['../../ui/jeopardy-shell.css', './room.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JeopardyRoomPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly rooms = inject(JeopardyPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  /** Quien sale por su cuenta no necesita que le avisen de que la sala cerró. */
  private leaving = false;
  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '').toUpperCase();
  readonly room = this.rooms.room;
  readonly loadPhase = signal<LoadPhase>('loading');
  readonly error = signal('');
  readonly shareStatus = signal('');
  readonly busy = signal(false);
  readonly maxPlayers = MAX_PLAYERS;
  readonly specialCount = SPECIAL_COUNT;
  readonly self = computed(() => selfPlayer(this.room()));
  readonly isHost = computed(() => this.self()?.isHost === true);
  readonly playerCount = computed(() => playingPlayers(this.room()?.players ?? []).length);
  /** Sin invitados el anfitrión juega solo, así que siempre puede abrir el tablero. */
  readonly canStart = computed(() => this.isHost());
  readonly joinUrl = computed(() => {
    const url = new URL(this.document.baseURI);
    url.hash = `/juegos/jeopardy/unirse/${this.code}`;
    return url.href;
  });

  constructor() {
    void this.load();
    effect(() => {
      const room = this.room();
      if (room && room.status !== 'waiting') void this.router.navigate(['/juegos/jeopardy/partida', room.code]);
      // El anfitrión cerró la sala mientras se esperaba.
      if (!room && this.loadPhase() === 'ready' && !this.leaving) {
        this.error.set('El anfitrión cerró la sala.');
        this.loadPhase.set('error');
      }
    });
  }

  playerNote(player: JeopardyPlayer): string {
    if (player.isHost) return 'anfitrión · conduce';
    return player.id === this.self()?.id ? 'tú · listo' : 'listo';
  }

  async start(): Promise<void> {
    const room = this.room();
    if (!room || !this.canStart() || this.busy()) return;
    this.sound.playButtonClick();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.rooms.startGame(room.code, createJeopardyBoard(JEOPARDY_BANK, room.setup));
      await this.router.navigate(['/juegos/jeopardy/partida', room.code]);
    } catch {
      this.error.set('No pudimos abrir el tablero. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      this.busy.set(false);
    }
  }

  async share(): Promise<void> {
    this.sound.playButtonClick();
    const message = `Únete a mi Jeopardy bíblico en Chairo. Código: ${this.code}`;
    const navigator = this.document.defaultView?.navigator;
    try {
      if (navigator?.share) await navigator.share({ title: 'Jeopardy · Chairo', text: message, url: this.joinUrl() });
      else if (navigator?.clipboard) await navigator.clipboard.writeText(`${message}\n${this.joinUrl()}`);
      else throw new Error('unavailable');
      this.shareStatus.set('Invitación compartida.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.shareStatus.set(`No pudimos copiar. Comparte el código ${this.code}.`);
    }
  }

  /**
   * El anfitrión cierra la sala para todos; el invitado retira solo su puesto.
   * Si la escritura falla nadie se mueve: irse igualmente dejaría la sala
   * abierta a espaldas de quien creyó haberla cerrado.
   */
  async exit(): Promise<void> {
    if (this.busy()) return;
    this.sound.playButtonClick();
    const host = this.isHost();
    const seated = this.self() !== null;
    this.busy.set(true);
    this.leaving = true;
    this.error.set('');
    try {
      if (host) await this.rooms.closeRoom(this.code);
      else if (seated) await this.rooms.leaveRoom(this.code);
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      if (reason !== 'room-not-found') {
        this.error.set(host
          ? 'No pudimos cerrar la sala: sigue abierta. Revisa tu conexión y vuelve a intentarlo.'
          : 'No pudimos retirar tu puesto: sigues en la sala. Revisa tu conexión y vuelve a intentarlo.');
        this.leaving = false;
        this.busy.set(false);
        return;
      }
    }
    this.busy.set(false);
    await this.router.navigateByUrl(host ? '/juegos/jeopardy' : '/juegos/jeopardy/unirse');
  }

  private async load(): Promise<void> {
    try {
      await this.rooms.restoreRoom(this.code);
      this.loadPhase.set('ready');
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      this.error.set(reason === 'room-not-found'
        ? 'Esta sala ya no está abierta.'
        : 'No pudimos contactar con la sala. Revisa tu conexión.');
      this.loadPhase.set('error');
    }
  }
}
