import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { buildInvitationMessage, buildJoinUrl } from '../../domain/join-link';
import { MultiplayerError, MultiplayerPort } from '../../domain/multiplayer.port';
import {
  canStartMatch,
  colorLabel,
  hostRoleLabel,
  isRoomCode,
  isRoomFull,
  participantStatusLabel,
  setupSummary,
  type Participant,
  type Room
} from '../../domain/room';
import { ColorMarkComponent } from '../../ui/color-mark.component';
import { ManualHeaderComponent } from '../../ui/manual-header.component';
import { QrCodeComponent } from '../../ui/qr-code.component';

type RoomPhase = 'restoring' | 'ready' | 'error';

const SETUP_ROUTE = '/juegos/versiculo-o-inventiculo';
const JOIN_ROUTE = '/juegos/versiculo-o-inventiculo/unirse';

/** Qué pasó y qué hacer, sin que nadie pierda el sitio que ya tenía. */
const EXIT_FAILURE: Readonly<Record<'host' | 'guest', string>> = {
  host: 'No pudimos cerrar la sala: sigue abierta y nadie ha salido. Revisa tu conexión y vuelve a tocar «Cerrar sala».',
  guest: 'No pudimos retirar tu asiento: sigues dentro de la sala. Revisa tu conexión y vuelve a tocar «Salir de la sala».'
};

@Component({
  selector: 'chairo-versiculo-room-page',
  imports: [ColorMarkComponent, GameIconComponent, ManualHeaderComponent, QrCodeComponent, RouterLink],
  templateUrl: './room.page.html',
  styleUrl: './room.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoomPageComponent {
  private readonly document = inject(DOCUMENT);
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);

  readonly code = (inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '').toUpperCase();
  readonly setupRoute = SETUP_ROUTE;
  readonly phase = signal<RoomPhase>('restoring');
  readonly room = this.multiplayer.room;
  readonly shareStatus = signal('');
  readonly startStatus = signal('');
  readonly exitStatus = signal('');

  readonly title = computed(() => {
    switch (this.phase()) {
      case 'restoring': return 'Abriendo la sala';
      case 'error': return 'Sala no disponible';
      default: return this.isHost() ? 'Sala lista' : 'Ya estás dentro';
    }
  });

  /**
   * La sala es una sola pantalla con dos papeles. El anfitrión reparte la
   * invitación y comienza; el invitado solo espera. Sin asiento reconocido se
   * asume el papel de invitado, que no puede cerrar la sala de nadie.
   */
  readonly self = this.multiplayer.self;
  readonly isHost = computed(() => this.self()?.role === 'host');

  readonly backLabel = computed(() => this.isHost()
    ? 'Cerrar la sala y volver a la configuración'
    : 'Salir de la sala y volver a la entrada');

  readonly participants = computed<readonly Participant[]>(() => this.room()?.participants ?? []);
  readonly canStart = computed(() => {
    const room = this.room();
    return room !== null && canStartMatch(room);
  });
  readonly hasFreeSeat = computed(() => {
    const room = this.room();
    return room !== null && !isRoomFull(room);
  });

  /** Se lee carácter a carácter para poder dictarlo por teléfono. */
  readonly spacedCode = computed(() => Array.from(this.room()?.code ?? this.code).join(' '));
  readonly joinUrl = computed(() => buildJoinUrl(this.document.location.href, this.room()?.code ?? this.code));
  readonly qrLabel = computed(() => `Código QR con el enlace para entrar a la sala ${this.spacedCode()}`);

  readonly liveSummary = computed(() => {
    if (this.phase() !== 'ready') return '';
    const total = this.participants().length;
    const people = total === 1 ? '1 participante' : `${total} participantes`;
    if (!this.isHost()) return `${people} en la sala. Esperando a que el anfitrión comience.`;
    return this.canStart()
      ? `${people} en la sala. Ya puedes comenzar la partida.`
      : `${people} en la sala. Esperando participantes.`;
  });

  constructor() {
    void this.load();
  }

  roleLabel(room: Room): string {
    return hostRoleLabel(room.setup.hostRole);
  }

  summary(room: Room): string {
    return setupSummary(room.setup);
  }

  statusLabel(participant: Participant): string {
    return participantStatusLabel(participant);
  }

  retry(): void {
    this.sound.playButtonClick();
    void this.load();
  }

  startMatch(): void {
    if (!this.canStart()) return;
    this.sound.playButtonClick();
    this.startStatus.set('Todo listo. La cuenta regresiva llega en la próxima entrega de Chairo.');
  }

  colorName(participant: Participant): string {
    return colorLabel(participant.color);
  }

  /**
   * El anfitrión cierra la sala; el invitado retira solo su propio asiento.
   * La escritura puede fallar —red, RLS, sala ya cerrada— y entonces nadie se
   * mueve de donde está: irse igualmente dejaría la sala abierta a espaldas de
   * quien creyó haberla cerrado.
   */
  async exitRoom(): Promise<void> {
    this.sound.playButtonClick();
    const code = this.room()?.code ?? this.code;
    const role = this.isHost() ? 'host' : 'guest';
    this.exitStatus.set('');

    try {
      if (role === 'host') await this.multiplayer.closeRoom(code);
      else await this.multiplayer.leaveRoom(code);
    } catch (error) {
      // Una sala que ya no existe no retiene a nadie: la salida se cumplió sola.
      const reason = error instanceof MultiplayerError ? error.reason : 'unavailable';
      if (reason !== 'room-not-found') {
        this.exitStatus.set(EXIT_FAILURE[role]);
        return;
      }
    }

    await this.router.navigateByUrl(role === 'host' ? SETUP_ROUTE : JOIN_ROUTE);
  }

  async shareInvitation(): Promise<void> {
    this.sound.playButtonClick();
    const room = this.room();
    if (!room) return;
    const url = this.joinUrl();
    const message = buildInvitationMessage(url, room.code);
    const navigator = this.document.defaultView?.navigator;

    if (navigator?.share) {
      try {
        await navigator.share({ title: '¿Versículo o inventículo?', text: message, url });
        this.shareStatus.set('Invitación compartida.');
        return;
      } catch (error) {
        // Cancelar el diálogo del sistema no es un fallo que deba anunciarse.
        if (error instanceof DOMException && error.name === 'AbortError') {
          this.shareStatus.set('');
          return;
        }
      }
    }

    try {
      if (!navigator?.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(message);
      this.shareStatus.set('Invitación copiada.');
    } catch {
      this.shareStatus.set(`No pudimos copiar la invitación. Dicta el código ${this.spacedCode()}.`);
    }
  }

  private async load(): Promise<void> {
    this.phase.set('restoring');
    this.startStatus.set('');
    this.shareStatus.set('');
    this.exitStatus.set('');
    if (!isRoomCode(this.code)) {
      this.phase.set('error');
      return;
    }
    try {
      await this.multiplayer.restoreRoom(this.code);
      this.phase.set('ready');
    } catch {
      this.phase.set('error');
    }
  }
}
