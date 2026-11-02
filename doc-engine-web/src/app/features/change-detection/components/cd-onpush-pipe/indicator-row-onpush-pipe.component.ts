import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IndicatorRowBase } from '@features/change-detection/components/base/indicator-row.base';

@Component({
  selector: 'tr[app-indicator-row-onpush-pipe]',
  templateUrl: './indicator-row-onpush-pipe.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorRowOnpushPipeComponent extends IndicatorRowBase {}
