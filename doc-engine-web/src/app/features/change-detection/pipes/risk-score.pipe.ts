import { Pipe, PipeTransform } from '@angular/core';
import { ChiSoMau } from '../models/chi-so.model';
import { computeRiskScore } from '../models/risk-score';

@Pipe({ name: 'riskScore' })
export class RiskScorePipe implements PipeTransform {
  transform(data: ChiSoMau): number {
    return computeRiskScore(data);
  }
}
