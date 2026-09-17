import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { encodeQrCode, type QrCode } from '../infrastructure/qr-code';

const QUIET_ZONE = 4;

@Component({
  selector: 'chairo-password-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (code(); as matrix) {
      <svg
        [attr.viewBox]="'0 0 ' + (matrix.size + QUIET_ZONE * 2) + ' ' + (matrix.size + QUIET_ZONE * 2)"
        role="img"
        [attr.aria-label]="label()"
        [attr.data-qr-version]="matrix.version"
        shape-rendering="crispEdges"
      >
        <rect width="100%" height="100%" fill="#fff"/>
        <path [attr.d]="path()" fill="var(--ink)"/>
      </svg>
    }
  `,
  styles: `:host, svg { display: block; width: 100%; } svg { height: auto; }`
})
export class PasswordQrComponent {
  readonly content = input.required<string>();
  readonly label = input.required<string>();
  protected readonly QUIET_ZONE = QUIET_ZONE;
  protected readonly code = computed<QrCode | null>(() => {
    try { return encodeQrCode(this.content()); } catch { return null; }
  });
  protected readonly path = computed(() => {
    const matrix = this.code();
    if (!matrix) return '';
    let value = '';
    matrix.modules.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) value += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
    }));
    return value;
  });
}

