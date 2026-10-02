import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { FpsMeterService } from '@base/services/fps-meter.service';

@Component({
  selector: 'app-fps-meter',
  templateUrl: './fps-meter.component.html',
})
export class FpsMeterComponent implements AfterViewInit, OnDestroy {
  @ViewChild('output', { static: true }) private output!: ElementRef<HTMLSpanElement>;

  constructor(private readonly meter: FpsMeterService) {}

  ngAfterViewInit(): void {
    this.meter.start(fps => {
      this.output.nativeElement.textContent = `FPS: ${fps}`;
    });
  }

  ngOnDestroy(): void {
    this.meter.stop();
  }
}
