import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { encodeQrCode, type QrCode } from '../infrastructure/qr-code';

/** Zona de silencio exigida por la norma para que una cámara encuentre el código. */
const QUIET_ZONE = 4;

@Component({
  selector: 'chairo-qr-code',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (code(); as matrix) {
      <svg
        [attr.viewBox]="'0 0 ' + (matrix.size + QUIET_ZONE * 2) + ' ' + (matrix.size + QUIET_ZONE * 2)"
        role="img"
        [attr.aria-label]="label()"
        [attr.data-qr-version]="matrix.version"
        shape-rendering="crispEdges"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width="100%" height="100%" fill="#fff"/>
        <path [attr.d]="path()" fill="var(--qr-ink, #07266e)"/>
      </svg>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
    }
  `
})
export class QrCodeComponent {
  readonly content = input.required<string>();
  /** Nombre accesible; el código corto siempre se muestra además en texto. */
  readonly label = input.required<string>();

  protected readonly QUIET_ZONE = QUIET_ZONE;

  protected readonly code = computed<QrCode | null>(() => {
    try {
      return encodeQrCode(this.content());
    } catch {
      return null;
    }
  });

  protected readonly path = computed(() => {
    const matrix = this.code();
    if (!matrix) return '';
    let path = '';
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        if (matrix.modules[row]![column]) path += `M${column + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return path;
  });
}
