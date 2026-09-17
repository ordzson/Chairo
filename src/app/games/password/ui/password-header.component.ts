import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ManualHeaderComponent } from '../../versiculo-o-inventiculo/ui/manual-header.component';

@Component({
  selector: 'chairo-password-header',
  imports: [ManualHeaderComponent],
  template: `
    <chairo-manual-header
      [backLink]="backLink()"
      [backLabel]="backLabel()"
      [note]="note()"
      (back)="back.emit()"
    />
    <div class="password-title-plate motion-rise">
      <span class="plate-pin" aria-hidden="true"></span>
      <h1 id="password-title">{{ title() }}</h1>
      <span class="plate-pin" aria-hidden="true"></span>
    </div>
  `,
  styleUrl: './password-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordHeaderComponent {
  readonly title = input.required<string>();
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Volver');
  readonly note = input<readonly string[]>([]);
  readonly back = output<void>();
}
