import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { GameIcon } from './game';

export type ChairoIcon = GameIcon |
  'gear' |
  'arrow-left' |
  'mountain' |
  'list' |
  'users' |
  'person' |
  'host' |
  'note' |
  'play' |
  'minus' |
  'plus' |
  'share' |
  'check';

@Component({
  selector: 'chairo-game-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('bulb') {
          <path d="M20 39c-4-3-7-8-7-14a19 19 0 0 1 38 0c0 6-3 11-7 14-3 3-4 5-4 9H24c0-4-1-6-4-9Z"/>
          <path d="M25 54h14M27 59h10M25 24c2 1 5 4 7 9 2-5 5-8 7-9M32 33v15"/>
          <path d="M32 2v6M9 10l5 5M55 10l-5 5M3 28h7M54 28h7"/>
        }
        @case ('question') {
          <path d="M19 22c1-10 8-16 18-16 11 0 18 7 18 16 0 8-4 12-11 16-6 4-8 7-8 13"/>
          <path d="M35 59h.1"/>
        }
        @case ('compass') {
          <circle cx="32" cy="32" r="24"/>
          <path d="m40 18-5 14-11 14 5-14 11-14Z"/>
          <path d="M32 2v7M32 55v7M2 32h7M55 32h7"/>
        }
        @case ('book') {
          <path d="M6 12c10-2 18 0 26 6v38C24 50 16 48 6 50V12Z"/>
          <path d="M58 12c-10-2-18 0-26 6v38c8-6 16-8 26-6V12Z"/>
          <path d="M13 23c5 0 9 1 13 4M38 27c4-3 8-4 13-4M13 32c5 0 9 1 13 4M38 36c4-3 8-4 13-4"/>
        }
        @case ('shell') {
          <path d="M7 47c4-21 13-36 25-36s21 15 25 36c-7 5-15 7-25 7S14 52 7 47Z"/>
          <path d="M32 12v36M20 14l8 34M44 14l-8 34M12 28l16 20M52 28 36 48M8 42l20 6M56 42l-20 6"/>
        }
        @case ('trophy') {
          <path d="M18 7h28v12c0 11-6 20-14 20s-14-9-14-20V7Z"/>
          <path d="M18 12H8v7c0 8 5 13 13 13M46 12h10v7c0 8-5 13-13 13M32 39v10M21 57h22M25 49h14"/>
        }
        @case ('gear') {
          <path d="m27 5 2-3h6l2 3 5 2 4-1 4 4-1 4 2 5 4 2v6l-4 2-2 5 1 4-4 4-4-1-5 2-2 4h-6l-2-4-5-2-4 1-4-4 1-4-2-5-4-2v-6l4-2 2-5-1-4 4-4 4 1 5-2Z"/>
          <circle cx="32" cy="24" r="9"/>
        }
        @case ('arrow-left') {
          <path d="M52 32H13M28 17 13 32l15 15"/>
        }
        @case ('mountain') {
          <path d="M7 53 26 20l8 12 7-10 16 31H7Z"/>
          <path d="M26 20V8h19l-5 6 5 6H27M18 39h27"/>
        }
        @case ('list') {
          <rect x="13" y="7" width="38" height="50" rx="4"/>
          <path d="M22 20h20M22 32h20M22 44h13"/>
        }
        @case ('users') {
          <circle cx="24" cy="20" r="10"/>
          <circle cx="44" cy="25" r="8"/>
          <path d="M7 56c0-13 7-21 17-21s17 8 17 21M39 39c11 0 18 6 18 17"/>
        }
        @case ('person') {
          <circle cx="32" cy="18" r="11"/>
          <path d="M12 57c0-16 8-25 20-25s20 9 20 25"/>
        }
        @case ('host') {
          <circle cx="27" cy="19" r="10"/>
          <path d="M8 56c0-15 7-24 19-24 7 0 12 3 16 8"/>
          <path d="m47 40 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>
        }
        @case ('note') {
          <path d="M10 8h37l7 7v41H10V8Z"/>
          <path d="M47 8v10h7M19 25h26M19 36h26M19 47h17"/>
        }
        @case ('play') {
          <path d="m19 10 34 22-34 22V10Z"/>
        }
        @case ('minus') {
          <path d="M13 32h38"/>
        }
        @case ('plus') {
          <path d="M13 32h38M32 13v38"/>
        }
        @case ('share') {
          <circle cx="48" cy="14" r="8"/>
          <circle cx="16" cy="32" r="8"/>
          <circle cx="48" cy="50" r="8"/>
          <path d="m23 28 18-10M23 36l18 10"/>
        }
        @case ('check') {
          <path d="m12 34 14 14 26-32"/>
        }
      }
    </svg>
  `,
  host: { class: 'game-icon' }
})
export class GameIconComponent {
  readonly name = input.required<ChairoIcon>();
}
