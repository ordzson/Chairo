import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { buildPasswordInvitation, buildPasswordJoinUrl } from '../../domain/join-link';
import { PasswordError } from '../../domain/match';
import { PasswordPort } from '../../domain/password.port';
import { isRoomCode, type RoomCode } from '../../domain/room';
import { availablePasswordWords } from '../../infrastructure/word-bank';
import { PasswordHeaderComponent } from '../../ui/password-header.component';
import { PasswordQrComponent } from '../../ui/password-qr.component';

@Component({
  selector: 'chairo-password-room-page',
  imports: [PasswordHeaderComponent, PasswordQrComponent, RouterLink],
  templateUrl: './room.page.html',
  styleUrl: '../../ui/password.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordRoomPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly port = inject(PasswordPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  readonly code: RoomCode | null = parseCode(inject(ActivatedRoute).snapshot.paramMap.get('codigo'));

  readonly snapshot = this.port.snapshot;
  readonly connection = this.port.connection;
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly shareStatus = signal('');
  readonly isHost = computed(() => this.snapshot()?.self.role === 'host');
  readonly full = computed(() => this.snapshot()?.players.length === 2);
  readonly bankReady = availablePasswordWords().length >= 2;
  readonly joinUrl = this.code ? buildPasswordJoinUrl(this.document.location.href, this.code) : '';
  readonly spacedCode = this.code ? Array.from(this.code).join(' ') : '';

  constructor() {
    effect(() => {
      const snapshot = this.snapshot();
      if (snapshot && snapshot.phase !== 'waiting') {
        void this.router.navigate(['/juegos/revelaciones/partida', snapshot.code]);
      }
    });
    if (this.code) void this.load(this.code);
    else {
      this.loading.set(false);
      this.error.set('El código de esta sala no es válido.');
    }
  }

  async start(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.busy() || !this.bankReady) return;
    this.busy.set(true);
    this.error.set('');
    this.sound.playButtonClick();
    try {
      await this.port.startMatch(snapshot.code);
      await this.router.navigate(['/juegos/revelaciones/partida', snapshot.code]);
    } catch (failure) {
      this.error.set(messageFor(failure));
    } finally {
      this.busy.set(false);
    }
  }

  async share(): Promise<void> {
    if (!this.code) return;
    const message = buildPasswordInvitation(this.joinUrl, this.code);
    try {
      if (this.document.defaultView?.navigator.share) {
        await this.document.defaultView.navigator.share({ title: 'Revelaciones · Chairo', text: message, url: this.joinUrl });
        this.shareStatus.set('Invitación compartida.');
      } else {
        await this.document.defaultView?.navigator.clipboard.writeText(message);
        this.shareStatus.set('Invitación copiada.');
      }
    } catch {
      this.shareStatus.set(`No pudimos compartir. Dicta el código ${this.spacedCode}.`);
    }
  }

  async exit(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      if (snapshot.self.role === 'host') {
        await this.port.closeRoom(snapshot.code);
        await this.router.navigate(['/juegos/revelaciones']);
      } else {
        await this.port.leaveRoom(snapshot.code);
        await this.router.navigate(['/juegos/revelaciones/unirse']);
      }
    } catch {
      this.error.set(snapshot.self.role === 'host'
        ? 'No pudimos cerrar la sala. Sigue abierta; revisa la conexión e inténtalo otra vez.'
        : 'No pudimos retirar tu asiento. Sigues dentro; revisa la conexión e inténtalo otra vez.');
    } finally {
      this.busy.set(false);
    }
  }

  private async load(code: RoomCode): Promise<void> {
    try {
      await this.port.restoreRoom(code);
    } catch (failure) {
      this.error.set(messageFor(failure));
    } finally {
      this.loading.set(false);
    }
  }
}

function parseCode(value: string | null): RoomCode | null {
  const code = (value ?? '').toLocaleUpperCase('es');
  return isRoomCode(code) ? code : null;
}

function messageFor(failure: unknown): string {
  if (!(failure instanceof PasswordError)) return 'No pudimos actualizar la sala. Revisa la conexión e inténtalo otra vez.';
  if (failure.reason === 'room-not-found') return 'La sala ya no está abierta. Pide un código nuevo.';
  if (failure.reason === 'players-required') return 'La partida necesita exactamente dos participantes.';
  if (failure.reason === 'bank-insufficient') return 'Falta el banco real de palabras; la ronda todavía no puede comenzar.';
  if (failure.reason === 'not-host') return 'Solo la persona anfitriona puede comenzar la partida.';
  return 'La sala cambió o perdió la conexión. Vuelve a intentarlo.';
}

