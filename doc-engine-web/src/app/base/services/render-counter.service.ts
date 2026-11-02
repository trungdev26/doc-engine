import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RenderCounterService {
  checkCount = 0;

  increment(): void {
    this.checkCount++;
  }

  reset(): void {
    this.checkCount = 0;
  }
}
