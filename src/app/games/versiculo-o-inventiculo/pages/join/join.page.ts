import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { GameColor } from '../../../../game';
import { GameIconComponent } from '../../../../game-icon.component';
import { SoundService } from '../../../../sound.service';
import { MultiplayerError, MultiplayerPort, type MultiplayerErrorReason } from '../../domain/multiplayer.port';
import {
  MAX_NAME_LENGTH,
  PARTICIPANT_COLORS,
  ROOM_CODE_LENGTH,
  colorLabel,
  isRoomCode,
  isRoomFull,
  rejectedCodeCharacters,
  sanitizeRoomCode,
  setupSummary,
  takenColors,
  type Room
} from '../../domain/room';
import { ColorMarkComponent } from '../../ui/color-mark.component';
import { ManualHeaderComponent } from '../../ui/manual-header.component';

/** Lo que puede impedir la entrada, del teclado o del servidor. */
type JoinIssue = MultiplayerErrorReason | 'code-invalid' | 'name-missing' | 'color-missing';

const ROOM_ROUTE = '/juegos/versiculo-o-inventiculo/sala';

@Component({
  selector: 'chairo-versiculo-join-page',
  imports: [ColorMarkComponent, GameIconComponent, ManualHeaderComponent, RouterLink],
  templateUrl: './join.page.html',
  styleUrl: './join.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JoinPageComponent {
  private readonly multiplayer = inject(MultiplayerPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);

  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');
  /** Descarta respuestas de una búsqueda que el siguiente carácter ya invalidó. */
  private lookupToken = 0;

  readonly colors = PARTICIPANT_COLORS;
  readonly codeLength = ROOM_CODE_LENGTH;
  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly centerRoute = '/';

  readonly code = signal(sanitizeRoomCode(inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? ''));
  readonly name = signal('');
  readonly color = signal<GameColor | null>(null);
  readonly joining = signal(false);
  readonly looking = signal(false);
  readonly issue = signal<JoinIssue | null>(null);
  /** Aviso de los caracteres que el código no admite, en cuanto se teclean. */
  readonly codeNotice = signal('');

  /** La sala solo cuenta si es la del código escrito ahora mismo. */
  readonly foundRoom = computed<Room | null>(() => {
    const room = this.multiplayer.room();
    return room && room.code === this.code() ? room : null;
  });

  readonly taken = computed<ReadonlySet<GameColor>>(() => {
    const room = this.foundRoom();
    return room ? takenColors(room) : new Set<GameColor>();
  });

  readonly freeColors = computed(() => this.colors.filter(option => !this.taken().has(option.value)).length);
  readonly codeComplete = computed(() => isRoomCode(this.code()));
  readonly spacedCode = computed(() => Array.from(this.code()).join(' '));

  readonly roomSummary = computed(() => {
    const room = this.foundRoom();
    if (!room) return '';
    const free = this.freeColors();
    const colors = free === 1 ? 'queda 1 color libre' : `quedan ${free} colores libres`;
    return `${setupSummary(room.setup)} · ${colors}`;
  });

  /** Lo que oye quien no ve la pantalla mientras escribe el código. */
  readonly lookupStatus = computed(() => {
    if (!this.codeComplete()) return '';
    if (this.looking()) return `Buscando la sala ${this.spacedCode()}…`;
    const room = this.foundRoom();
    return room ? `Sala ${this.spacedCode()} encontrada. ${this.roomSummary()}.` : '';
  });

  readonly errorTitle = computed(() => {
    const issue = this.issue();
    if (!issue) return '';
    return ISSUE_COPY[issue].title.replace('{code}', this.code() || '…');
  });

  readonly errorDetail = computed(() => {
    const issue = this.issue();
    return issue ? ISSUE_COPY[issue].detail : '';
  });

  constructor() {
    // El código del QR llega escrito, así que se comprueba al abrir la pantalla.
    this.checkCode();
  }

  colorName(color: GameColor): string {
    return colorLabel(color);
  }

  /**
   * Recibe el campo y no su texto: cuando lo tecleado se descarta entero, la
   * señal no cambia y el enlace de Angular no reescribiría el campo, así que
   * el carácter rechazado se quedaría a la vista. Aquí se borra a mano.
   */
  writeCode(field: HTMLInputElement): void {
    const rejected = rejectedCodeCharacters(field.value);
    const clean = sanitizeRoomCode(field.value);
    if (field.value !== clean) field.value = clean;
    this.code.set(clean);
    this.codeNotice.set(rejected.length === 0
      ? ''
      : `El código no usa ${listCharacters(rejected)}. Solo letras y números sin parejas que se confundan al dictarlas: nunca lleva 0, 1, I ni O.`);
    if (this.issue() !== null) this.issue.set(null);
    this.checkCode();
  }

  writeName(field: HTMLInputElement): void {
    const clean = field.value.slice(0, MAX_NAME_LENGTH);
    if (field.value !== clean) field.value = clean;
    this.name.set(clean);
    if (this.issue() !== null) this.issue.set(null);
  }

  chooseColor(color: GameColor): void {
    this.sound.playButtonClick();
    this.color.set(color);
    if (this.issue() !== null) this.issue.set(null);
  }

  async join(): Promise<void> {
    if (this.joining()) return;

    const code = this.code();
    if (!isRoomCode(code)) return this.refuse('code-invalid', this.codeField());
    const name = this.name().trim();
    if (name.length === 0) return this.refuse('name-missing', this.nameField());
    const color = this.color();
    if (color === null) return this.refuse('color-missing');

    this.sound.playButtonClick();
    this.joining.set(true);
    this.issue.set(null);
    try {
      await this.multiplayer.joinRoom(code, { name, color });
      await this.router.navigate([ROOM_ROUTE, code]);
    } catch (error) {
      // La carrera la resuelve el servidor: dos personas pueden pedir el mismo
      // nombre o el último asiento a la vez, y solo él sabe quién llegó antes.
      const reason = error instanceof MultiplayerError ? error.reason : 'unavailable';
      this.issue.set(reason);
      if (reason === 'color-taken') {
        this.color.set(null);
        void this.lookup(code);
      }
      if (reason === 'name-taken') this.focus(this.nameField());
    } finally {
      this.joining.set(false);
    }
  }

  /** Un código completo se busca solo; uno a medias cancela la búsqueda viva. */
  private checkCode(): void {
    const code = this.code();
    if (isRoomCode(code)) {
      void this.lookup(code);
      return;
    }
    this.lookupToken += 1;
    this.looking.set(false);
  }

  private refuse(issue: JoinIssue, field?: ElementRef<HTMLInputElement>): void {
    this.issue.set(issue);
    this.focus(field);
  }

  private focus(field?: ElementRef<HTMLInputElement>): void {
    field?.nativeElement.focus();
  }

  private async lookup(code: string): Promise<void> {
    const token = (this.lookupToken += 1);
    this.looking.set(true);
    try {
      await this.multiplayer.restoreRoom(code);
      if (token !== this.lookupToken) return;
      // Un color que dejó de estar libre mientras se elegía no puede quedarse.
      const chosen = this.color();
      if (chosen !== null && this.taken().has(chosen)) {
        this.color.set(null);
        this.issue.set('color-taken');
      }
      // El techo es uno solo: hay un asiento por color, así que la sala se
      // llena justo cuando se acaba el último color libre.
      const room = this.foundRoom();
      if (room && isRoomFull(room)) this.issue.set('room-full');
    } catch (error) {
      if (token !== this.lookupToken) return;
      this.issue.set(error instanceof MultiplayerError ? error.reason : 'unavailable');
    } finally {
      if (token === this.lookupToken) this.looking.set(false);
    }
  }
}

/** Cada razón dice qué pasó y qué hacer; ninguna deja al invitado sin salida. */
const ISSUE_COPY: Readonly<Record<JoinIssue, { readonly title: string; readonly detail: string }>> = {
  'code-invalid': {
    title: 'Ese código no puede existir',
    detail: 'Son cuatro caracteres y nunca lleva 0, 1, I ni O. Pídelo otra vez a quien te invitó o escanea el QR de su pantalla.'
  },
  'name-missing': {
    title: 'Falta tu nombre',
    detail: 'Escribe cómo quieres que te vean los demás. Basta un nombre corto; no hace falta cuenta ni registro.'
  },
  'color-missing': {
    title: 'Falta tu color',
    detail: 'Elige uno de los colores libres. Es lo que te distingue en la lista y en el marcador.'
  },
  'room-not-found': {
    title: 'No encontramos la sala {code}',
    detail: 'Puede que el anfitrión la haya cerrado o que el código no sea ese. Pídelo otra vez o escanea el QR de su pantalla.'
  },
  'room-full': {
    title: 'La sala {code} está completa',
    detail: 'Alguien ocupó el último asiento. Pide al anfitrión que abra otra sala y comparta el código nuevo.'
  },
  'room-started': {
    title: 'La partida ya empezó',
    detail: 'La sala {code} cerró la entrada al comenzar. Espera a que termine y pide el código de la siguiente.'
  },
  'name-taken': {
    title: 'Ese nombre ya está en la sala',
    detail: 'Alguien lo pidió un instante antes que tú. Cambia el tuyo —añade una inicial o un apodo— y vuelve a intentarlo.'
  },
  'color-taken': {
    title: 'Ese color lo tomaron antes que tú',
    detail: 'Elige otro de los que siguen libres y vuelve a intentarlo. La lista de arriba ya está al día.'
  },
  'code-unavailable': {
    title: 'No pudimos entrar a la sala',
    detail: 'Fue un problema nuestro, no del código. Vuelve a intentarlo en unos segundos.'
  },
  unavailable: {
    title: 'No pudimos entrar a la sala',
    detail: 'Revisa tu conexión y vuelve a intentarlo. El código sigue siendo válido mientras la sala esté abierta.'
  }
};

function listCharacters(characters: readonly string[]): string {
  const quoted = characters.map(character => `«${character}»`);
  if (quoted.length === 1) return quoted[0]!;
  return `${quoted.slice(0, -1).join(', ')} ni ${quoted.at(-1)}`;
}
