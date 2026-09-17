import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { type GameColor } from '../../../../game';
import { SoundService } from '../../../../sound.service';
import { sanitizeRoomCode } from '../../../versiculo-o-inventiculo/domain/room';
import { ManualHeaderComponent } from '../../../versiculo-o-inventiculo/ui/manual-header.component';
import { JEOPARDY_COLORS, MAX_PLAYERS, playingPlayers } from '../../domain/jeopardy';
import { JeopardyError, JeopardyPort, type JeopardyErrorReason } from '../../domain/jeopardy.port';

const JOIN_ERRORS: Partial<Record<JeopardyErrorReason, string>> = {
  'room-not-found': 'No encontramos esa sala. Revisa el código.',
  'room-full': 'La sala ya tiene cuatro jugadores.',
  'room-started': 'La ronda ya comenzó. Espera a la siguiente.',
  'name-taken': 'Ese nombre ya está en la sala. Usa otro.',
  'color-taken': 'Ese color acaba de ser tomado. Elige otro.',
  'invalid-move': 'Escribe un nombre de hasta 24 caracteres.'
};

@Component({
  selector: 'chairo-jeopardy-join-page',
  imports: [ManualHeaderComponent],
  templateUrl: './join.page.html',
  styleUrls: ['../../ui/jeopardy-shell.css', './join.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JeopardyJoinPageComponent {
  private readonly rooms = inject(JeopardyPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  readonly code = signal(sanitizeRoomCode(inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? ''));
  readonly name = signal('');
  readonly color = signal<GameColor>('orange');
  readonly room = this.rooms.room;
  readonly colors = JEOPARDY_COLORS;
  readonly error = signal('');
  readonly joining = signal(false);
  readonly found = computed(() => this.room()?.code === this.code());
  readonly full = computed(() => this.found() && playingPlayers(this.room()!.players).length >= MAX_PLAYERS);
  readonly started = computed(() => this.found() && this.room()!.status !== 'waiting');
  readonly lookupNote = computed(() => {
    const room = this.room();
    if (!this.found() || !room) return 'Cuatro letras o números';
    if (this.started()) return 'Sala encontrada · la ronda ya comenzó';
    if (this.full()) return 'Sala encontrada · ya tiene cuatro jugadores';
    return `Sala encontrada · ${room.setup.columns} × ${room.setup.rows}`;
  });

  constructor() {
    if (this.code().length === 4) void this.lookup();
  }

  updateCode(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const code = sanitizeRoomCode(event.target.value);
    this.code.set(code);
    event.target.value = code;
    this.error.set('');
    if (code.length === 4) void this.lookup();
  }

  updateName(event: Event): void { if (event.target instanceof HTMLInputElement) this.name.set(event.target.value); }
  chooseColor(color: GameColor): void { this.sound.playButtonClick(); this.color.set(color); this.error.set(''); }
  colorTaken(color: GameColor): boolean { return this.found() && this.room()!.players.some(player => player.color === color); }

  async join(): Promise<void> {
    if (this.joining()) return;
    if (!this.found() || !this.name().trim()) {
      this.error.set(this.found() ? 'Escribe tu nombre para tomar un puesto.' : 'Escribe un código de sala válido.');
      return;
    }
    this.sound.playButtonClick();
    this.joining.set(true);
    try {
      const room = await this.rooms.joinRoom(this.code(), { name: this.name(), color: this.color() });
      await this.router.navigate(['/juegos/jeopardy/sala', room.code]);
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      this.error.set(JOIN_ERRORS[reason] ?? 'No pudimos darte un puesto. Revisa tu conexión y vuelve a intentarlo.');
      if (reason === 'color-taken') void this.lookup();
    } finally {
      this.joining.set(false);
    }
  }

  private async lookup(): Promise<void> {
    const code = this.code();
    try {
      const room = await this.rooms.restoreRoom(code);
      if (code !== this.code()) return;
      // Este teléfono ya tenía puesto: vuelve a la sala en vez de pedir otro.
      if (room.selfId) {
        await this.router.navigate(['/juegos/jeopardy/sala', room.code]);
        return;
      }
      const free = this.colors.find(option => !room.players.some(player => player.color === option.value));
      if (free && this.colorTaken(this.color())) this.color.set(free.value);
      this.error.set('');
    } catch (error) {
      if (code !== this.code()) return;
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      this.error.set(reason === 'room-not-found'
        ? 'No encontramos esa sala. Revisa el código.'
        : 'No pudimos contactar con la sala. Revisa tu conexión.');
    }
  }
}
