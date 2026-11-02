import { Directive, Input } from '@angular/core';
import { ChiSoMau } from '@features/change-detection/models/chi-so.model';
import { RenderCounterService } from '@base/services/render-counter.service';
import { riskColor } from '@features/change-detection/models/risk-score';

@Directive()
export class IndicatorRowBase {
  @Input() data!: ChiSoMau;
  renderCount = 0;

  constructor(protected readonly counter: RenderCounterService) {}

  checkRender(): string {
    this.renderCount++;
    this.counter.increment();
    return '';
  }

  riskColor(score: number): string {
    return riskColor(score);
  }
}
