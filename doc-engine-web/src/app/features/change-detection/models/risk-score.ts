import { ChiSoMau } from './chi-so.model';

export const RISK_SCORE_ITERATIONS = 4000;

// Cố ý nặng (~4000 vòng lặp) để minh họa chi phí khi method này bị gọi lại mỗi CD check.
export function computeRiskScore(data: ChiSoMau): number {
  let score = 0;
  for (let i = 0; i < RISK_SCORE_ITERATIONS; i++) {
    score += Math.sin(data.giaTri * (i + 1)) ** 2;
  }
  return Math.round((score / RISK_SCORE_ITERATIONS) * 100);
}

export function riskColor(score: number): string {
  if (score < 33) {
    return 'green';
  }
  if (score < 66) {
    return 'orange';
  }
  return 'red';
}
