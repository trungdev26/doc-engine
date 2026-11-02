import { Component } from '@angular/core';
import { IndicatorRowBase } from '@features/change-detection/components/base/indicator-row.base';
import { computeRiskScore } from '@features/change-detection/models/risk-score';

@Component({
  selector: 'tr[app-indicator-row-default]',
  templateUrl: '../base/indicator-row.template.html',
})
export class IndicatorRowDefaultComponent extends IndicatorRowBase {
  riskScore = 0;

  override checkRender(): string {
    super.checkRender();
    this.riskScore = computeRiskScore(this.data);
    return '';
  }
}
