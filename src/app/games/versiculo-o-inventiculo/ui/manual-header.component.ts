import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GameIconComponent } from '../../../game-icon.component';

const RINGS = [0, 1, 2] as const;

/**
 * Cabecera del manual: anillos de la encuadernación, botón de vuelta y marca.
 * Las tres pantallas del juego la comparten en lugar de copiarla, y cada una
 * ajusta las pocas medidas que difieren con las variables declaradas abajo.
 *
 * El anfitrión de la sala tiene que cerrarla antes de salir, así que la vuelta
 * es un enlace cuando hay ruta y un botón cuando hay que ejecutar algo antes.
 *
 * `display: contents` deja los anillos y la cabecera como hijos directos del
 * manual: siguen colocándose contra la hoja, no contra este componente.
 */
@Component({
  selector: 'chairo-manual-header',
  imports: [GameIconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="manual-rings motion-stagger" aria-hidden="true">
      @for (ring of rings; track ring) {
        <img class="motion-rise" src="assets/plates/ring.png" alt="">
      }
    </div>

    <header class="manual-header">
      @if (backLink(); as link) {
        <a class="back-button pressable motion-rise" [routerLink]="link" [attr.aria-label]="backLabel()">
          <chairo-game-icon name="arrow-left" />
        </a>
      } @else {
        <button
          class="back-button pressable motion-rise"
          type="button"
          [attr.aria-label]="backLabel()"
          (click)="back.emit()"
        >
          <chairo-game-icon name="arrow-left" />
        </button>
      }

      <div class="manual-brand">
        <img class="motion-stamp" src="assets/plates/brand.png" alt="Chairo">
        <p>Centro de juegos</p>
        <span aria-hidden="true"></span>
      </div>

      <p class="manual-note motion-rise" aria-hidden="true">@for (line of note(); track $index; let last = $last) {{{ line }}@if (!last) {<br>}}</p>
    </header>
  `,
  styleUrl: './manual-header.component.css'
})
export class ManualHeaderComponent {
  readonly rings = RINGS;

  /** Ruta de vuelta. Sin ella la cabecera emite `back` y la pantalla decide. */
  readonly backLink = input<string | null>(null);
  readonly backLabel = input.required<string>();
  /** Nota manuscrita del margen; una entrada por línea. */
  readonly note = input<readonly string[]>([]);

  readonly back = output<void>();
}
