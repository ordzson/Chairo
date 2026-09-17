import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { SoundService } from '../../../../sound.service';
import { isRoomCode } from '../../../versiculo-o-inventiculo/domain/room';
import { ManualHeaderComponent } from '../../../versiculo-o-inventiculo/ui/manual-header.component';
import {
  MAX_COLUMNS,
  MAX_ROWS,
  MIN_GRID,
  SPECIAL_COUNT,
  maxDoubles,
  selfPlayer,
  type JeopardySetup
} from '../../domain/jeopardy';
import { JeopardyError, JeopardyPort } from '../../domain/jeopardy.port';

@Component({
  selector: 'chairo-jeopardy-setup-page',
  imports: [ManualHeaderComponent, RouterLink],
  templateUrl: './setup.page.html',
  styleUrls: ['../../ui/jeopardy-shell.css', './setup.page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JeopardySetupPageComponent {
  private readonly rooms = inject(JeopardyPort);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private touched = false;

  readonly rows = signal(4);
  readonly columns = signal(5);
  readonly doubleCount = signal(3);
  readonly hostName = signal('Anfitrión');
  readonly creating = signal(false);
  readonly error = signal('');
  readonly minGrid = MIN_GRID;
  readonly maxRows = MAX_ROWS;
  readonly maxColumns = MAX_COLUMNS;
  readonly specialCount = SPECIAL_COUNT;
  readonly doubleLimit = computed(() => maxDoubles(this.rows(), this.columns()));

  /**
   * Con código en la ruta la pantalla viene de «Jugar otra vez»: no abre otra
   * sala, reinicia esa para quienes siguen dentro. Si la sala se cerró
   * entretanto, vuelve a ser la configuración de siempre.
   */
  readonly reopenCode = signal<string | null>(this.routeCode());
  readonly backLink = computed(() => {
    const code = this.reopenCode();
    return code ? `/juegos/jeopardy/partida/${code}` : '/';
  });

  constructor() {
    const code = this.reopenCode();
    if (code) void this.loadRoom(code);
  }

  step(field: 'rows' | 'columns' | 'doubleCount', direction: -1 | 1): void {
    this.sound.playButtonClick();
    this.touched = true;
    const target = this[field];
    const minimum = field === 'doubleCount' ? 0 : MIN_GRID;
    const maximum = field === 'rows' ? MAX_ROWS : field === 'columns' ? MAX_COLUMNS : this.doubleLimit();
    target.set(Math.max(minimum, Math.min(maximum, target() + direction)));
    this.doubleCount.set(Math.min(this.doubleCount(), this.doubleLimit()));
    this.error.set('');
  }

  updateName(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.hostName.set(event.target.value);
  }

  async createRoom(): Promise<void> {
    if (this.creating()) return;
    const code = this.reopenCode();
    const hostName = this.hostName().trim();
    if (!code && !hostName) {
      this.error.set('Escribe el nombre del anfitrión para abrir la sala.');
      return;
    }
    const setup: JeopardySetup = {
      rows: this.rows(), columns: this.columns(), doubleCount: this.doubleCount()
    };
    this.sound.playButtonClick();
    this.creating.set(true);
    this.error.set('');
    try {
      const room = code
        ? await this.rooms.reopenRoom(code, setup)
        : await this.rooms.createRoom(setup, hostName);
      await this.router.navigate(['/juegos/jeopardy/sala', room.code]);
    } catch (error) {
      const reason = error instanceof JeopardyError ? error.reason : 'unavailable';
      if (!code) {
        this.error.set('No pudimos abrir la sala. Revisa tu conexión y vuelve a intentarlo.');
      } else if (reason === 'room-not-found' || reason === 'not-host' || reason === 'not-seated') {
        this.forgetRoom(code);
      } else if (reason === 'room-started') {
        this.error.set('La ronda de esta sala sigue en juego. Espera a que termine.');
      } else {
        this.error.set('No pudimos reiniciar la sala. Revisa tu conexión y vuelve a intentarlo.');
      }
    } finally {
      this.creating.set(false);
    }
  }

  /** Parte del tablero que ya tenía la sala, salvo que ya se haya tocado algo. */
  private async loadRoom(code: string): Promise<void> {
    try {
      const room = await this.rooms.restoreRoom(code);
      if (!selfPlayer(room)?.isHost) {
        this.forgetRoom(code);
        return;
      }
      if (this.touched) return;
      this.rows.set(room.setup.rows);
      this.columns.set(room.setup.columns);
      this.doubleCount.set(room.setup.doubleCount);
    } catch (error) {
      if (error instanceof JeopardyError && error.reason === 'room-not-found') this.forgetRoom(code);
    }
  }

  private forgetRoom(code: string): void {
    this.reopenCode.set(null);
    this.error.set(`La sala ${code} ya no está abierta. Toca «Crear sala» para abrir una nueva.`);
  }

  private routeCode(): string | null {
    const code = (this.route.snapshot.paramMap.get('codigo') ?? '').toUpperCase();
    return isRoomCode(code) ? code : null;
  }
}
