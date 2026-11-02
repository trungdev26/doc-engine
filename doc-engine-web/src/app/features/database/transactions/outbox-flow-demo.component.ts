import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

type OutboxFlowMode = 'direct' | 'outbox';

@Component({
  selector: 'app-outbox-flow-demo',
  templateUrl: './outbox-flow-demo.component.html',
  styleUrls: ['./outbox-flow-demo.component.scss'],
})
export class OutboxFlowDemoComponent implements OnChanges, OnDestroy {
  @Input() mode: OutboxFlowMode = 'direct';
  @Input() stepIndex = -1;
  @Input() speedMs = 1000;
  @Input() orderState = 'Chưa tồn tại';
  @Input() outboxState = 'Chưa tồn tại';
  @Input() eventState = 'Chưa publish';
  @Input() processState = 'Đang chạy';
  @Input() deliveryCount = 0;
  @Input() consumerState = 'Chưa nhận event';

  private tokenElement: SVGGElement | null = null;
  private gsapApi: (typeof import('gsap'))['gsap'] | null = null;
  private animationVersion = 0;

  @ViewChild('eventToken')
  set eventToken(elementRef: ElementRef<SVGGElement> | undefined) {
    this.tokenElement = elementRef?.nativeElement ?? null;
    void this.animateToken(true);
  }

  get processCrashed(): boolean {
    return this.stepIndex >= 3;
  }

  get directEventLost(): boolean {
    return this.mode === 'direct' && this.stepIndex >= 3;
  }

  get directTokenVisible(): boolean {
    return this.mode !== 'direct' || this.stepIndex >= 2;
  }

  get outboxDurable(): boolean {
    return this.mode === 'outbox' && this.stepIndex >= 2 && this.stepIndex <= 4;
  }

  get relayActive(): boolean {
    return this.mode === 'outbox' && this.stepIndex >= 4;
  }

  get consumerActive(): boolean {
    return this.mode === 'outbox' && this.stepIndex >= 7;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['stepIndex'] || changes['mode'] || changes['speedMs']) {
      void this.animateToken(false);
    }
  }

  ngOnDestroy(): void {
    this.animationVersion += 1;
    this.gsapApi?.killTweensOf(this.tokenElement);
  }

  private getTokenX(): number {
    if (this.mode === 'direct') {
      if (this.stepIndex >= 3) return 563;
      return 480;
    }

    if (this.stepIndex >= 7) return 1030;
    if (this.stepIndex >= 5) return 850;
    if (this.stepIndex >= 4) return 660;
    if (this.stepIndex >= 1) return 470;
    return 90;
  }

  private async animateToken(immediate: boolean): Promise<void> {
    if (!this.tokenElement) return;

    const version = ++this.animationVersion;
    const { gsap } = await import('gsap');
    if (version !== this.animationVersion || !this.tokenElement) return;
    this.gsapApi = gsap;

    const duration = immediate ? 0 : Math.min(Math.max(this.speedMs * 0.00062, 0.34), 0.82);
    if (this.mode === 'outbox' && this.stepIndex === 6 && !immediate) {
      gsap
        .timeline({ defaults: { ease: 'power2.inOut', overwrite: 'auto' } })
        .set(this.tokenElement, { x: 660, y: 56 })
        .to(this.tokenElement, { x: 850, duration });
      return;
    }

    gsap.to(this.tokenElement, {
      x: this.getTokenX(),
      y: this.mode === 'direct' ? 158 : 56,
      duration,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
  }
}
