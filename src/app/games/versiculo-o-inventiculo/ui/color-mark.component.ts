import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { GameColor } from '../../../game';

/**
 * Marca del color identificador. Cada color trae su propia forma porque el
 * color nunca puede comunicar solo: quien no distingue turquesa de verde
 * distingue el triángulo del pentágono, y el nombre acompaña siempre en texto.
 *
 * La cara toma el color de capítulo por `currentColor` y el contorno es la
 * tinta del manual, como cualquier otra pieza moldeada del sistema.
 */
@Component({
  selector: 'chairo-color-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      @switch (color()) {
        @case ('yellow') { <circle cx="16" cy="16" r="12"/> }
        @case ('orange') { <rect x="4" y="4" width="24" height="24" rx="4"/> }
        @case ('turquoise') { <path d="M16 3 30 27H2L16 3Z"/> }
        @case ('blue') { <path d="M16 2 30 16 16 30 2 16 16 2Z"/> }
        @case ('green') { <path d="M16 2 30 12.4 24.6 29H7.4L2 12.4 16 2Z"/> }
        @case ('violet') { <path d="m16 2 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z"/> }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-block;
      width: 1.6em;
      line-height: 0;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
      fill: currentcolor;
      stroke: var(--ink);
      stroke-width: 2.5;
      stroke-linejoin: round;
    }
  `,
  host: { class: 'color-mark' }
})
export class ColorMarkComponent {
  readonly color = input.required<GameColor>();
}
