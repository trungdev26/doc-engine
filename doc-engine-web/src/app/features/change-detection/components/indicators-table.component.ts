import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChiSoMau } from '@features/change-detection/models/chi-so.model';
import { generateMockData } from '@features/change-detection/models/mock-data';
import { RenderCounterService } from '@base/services/render-counter.service';

type Strategy = 'default' | 'onpush' | 'onpush-pipe';

@Component({
  selector: 'app-indicators-table',
  templateUrl: './indicators-table.component.html',
  styleUrls: ['./indicators-table.component.scss'],
})
export class IndicatorsTableComponent implements OnInit, OnDestroy {
  readonly rowCountOptions = [1, 20, 50, 100, 200, 500, 1000];

  rows: ChiSoMau[] = [];
  rowCount = 1;
  strategy: Strategy = 'default';
  stressMode = false;
  rafCallbackCount = 0;

  private rafId?: number;

  constructor(public readonly counter: RenderCounterService) {}

  ngOnInit(): void {
    this.rows = generateMockData(this.rowCount);
  }

  onRowCountChange(): void {
    this.rows = generateMockData(this.rowCount);
    this.resetCounter();
  }

  ngOnDestroy(): void {
    this.stopStress();
  }

  trackById(_index: number, row: ChiSoMau): number {
    return row.id;
  }

  onStressModeChange(enabled: boolean): void {
    this.stressMode = enabled;
    if (enabled) {
      this.startStress();
    } else {
      this.stopStress();
    }
  }

  randomUpdate(): void {
    const idx = Math.floor(Math.random() * this.rows.length);
    const updated: ChiSoMau = { ...this.rows[idx], giaTri: +(Math.random() * 100).toFixed(1) };
    this.rows = [...this.rows.slice(0, idx), updated, ...this.rows.slice(idx + 1)];
  }

  resetCounter(): void {
    this.counter.reset();
    this.rafCallbackCount = 0;
  }

  private startStress(): void {
    const loop = () => {
      this.rafCallbackCount++;
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private stopStress(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }
}
