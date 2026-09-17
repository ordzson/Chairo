import { ChangeDetectionStrategy, Component, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import type { GameColor } from '../../../../game';
import { SoundService } from '../../../../sound.service';
import { PasswordError, type PasswordErrorReason } from '../../domain/match';
import { PasswordPort } from '../../domain/password.port';
import {
  MAX_NAME_LENGTH,
  PASSWORD_GUEST_COLORS,
  ROOM_CODE_LENGTH,
  isRoomCode,
  rejectedCodeCharacters,
  sanitizeRoomCode
} from '../../domain/room';
import { PasswordHeaderComponent } from '../../ui/password-header.component';

type JoinIssue = PasswordErrorReason | 'code-invalid' | 'name-missing' | 'color-missing';

@Component({
  selector: 'chairo-password-join-page',
  imports: [PasswordHeaderComponent, RouterLink],
  templateUrl: './join.page.html',
  styleUrl: '../../ui/password.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordJoinPageComponent {
  private readonly port = inject(PasswordPort);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);
  private readonly codeField = viewChild<ElementRef<HTMLInputElement>>('codeField');
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('nameField');

  readonly colors = PASSWORD_GUEST_COLORS;
  readonly codeLength = ROOM_CODE_LENGTH;
  readonly maxNameLength = MAX_NAME_LENGTH;
  readonly code = signal(sanitizeRoomCode(inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? ''));
  readonly name = signal('');
  readonly color = signal<GameColor | null>(null);
  readonly joining = signal(false);
  readonly issue = signal<JoinIssue | null>(null);
  readonly codeNotice = signal('');

  writeCode(field: HTMLInputElement): void {
    const rejected = rejectedCodeCharacters(field.value);
    const value = sanitizeRoomCode(field.value);
    if (field.value !== value) field.value = value;
    this.code.set(value);
    this.codeNotice.set(rejected.length > 0 ? 'El código nunca usa 0, 1, I ni O.' : '');
    this.issue.set(null);
  }

  writeName(field: HTMLInputElement): void {
    const value = field.value.slice(0, MAX_NAME_LENGTH);
    if (field.value !== value) field.value = value;
    this.name.set(value);
    this.issue.set(null);
  }

  chooseColor(color: GameColor): void {
    this.sound.playButtonClick();
    this.color.set(color);
    this.issue.set(null);
  }

  async join(): Promise<void> {
    if (this.joining()) return;
    const code = this.code();
    if (!isRoomCode(code)) return this.refuse('code-invalid', this.codeField());
    const name = this.name().trim();
    if (!name) return this.refuse('name-missing', this.nameField());
    const color = this.color();
    if (!color) return this.refuse('color-missing');
    this.joining.set(true);
    this.issue.set(null);
    this.sound.playButtonClick();
    try {
      await this.port.joinRoom(code, { name, color });
      await this.router.navigate(['/juegos/revelaciones/sala', code]);
    } catch (failure) {
      this.issue.set(failure instanceof PasswordError ? failure.reason : 'unavailable');
      if (failure instanceof PasswordError && failure.reason === 'color-taken') this.color.set(null);
    } finally {
      this.joining.set(false);
    }
  }

  issueTitle(): string {
    const issue = this.issue();
    return issue ? ISSUE_COPY[issue] : '';
  }

  private refuse(issue: JoinIssue, field?: ElementRef<HTMLInputElement>): void {
    this.issue.set(issue);
    field?.nativeElement.focus();
  }
}

const ISSUE_COPY: Readonly<Record<JoinIssue, string>> = {
  'code-invalid': 'Escribe los cuatro caracteres del código de sala.',
  'name-missing': 'Escribe el nombre que verá la otra persona.',
  'color-missing': 'Elige un color libre para identificarte.',
  'room-not-found': 'No encontramos esa sala. Comprueba el código o pide uno nuevo.',
  'room-full': 'La sala ya tiene sus dos participantes.',
  'room-started': 'La partida ya comenzó y no admite otra persona.',
  'name-taken': 'Ese nombre ya está en la sala. Prueba con una inicial o un apodo.',
  'color-taken': 'Ese color acaba de ocuparse. Elige otro.',
  'code-unavailable': 'No pudimos usar ese código. Inténtalo otra vez.',
  'not-host': 'Solo quien creó la sala puede hacer eso.',
  'not-seated': 'Este teléfono ya no tiene asiento en la sala.',
  'invalid-phase': 'La sala cambió de fase. Vuelve a intentarlo.',
  'players-required': 'La sala necesita exactamente dos participantes.',
  'bank-insufficient': 'El banco de palabras todavía no está disponible.',
  'invalid-results': 'Los datos enviados no son válidos.',
  unavailable: 'No pudimos entrar. Revisa la conexión e inténtalo otra vez.'
};

