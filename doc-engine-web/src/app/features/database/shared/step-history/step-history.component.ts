import { Component, Input } from '@angular/core';

export type StepHistoryTone = 'primary' | 'secondary' | 'neutral';

export interface StepHistoryEntry {
  actor: string;
  operation: string;
  title: string;
  note: string;
  tone?: StepHistoryTone;
}

@Component({
  selector: 'app-step-history',
  templateUrl: './step-history.component.html',
  styleUrls: ['./step-history.component.scss'],
})
export class StepHistoryComponent {
  @Input() entries: StepHistoryEntry[] = [];
  @Input() totalSteps = 0;

  trackByIndex(index: number): number {
    return index;
  }
}
