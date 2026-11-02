import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { gsap } from 'gsap';

type ScenarioId = 'promise-timer' | 'async-await' | 'blocking';
type FlowStage = 'source' | 'stack' | 'webApi' | 'microtask' | 'task' | 'output' | 'done';
type TokenKind = 'sync' | 'promise' | 'timer' | 'system';

interface Point {
  x: number;
  y: number;
}

interface SimulationStep {
  tokenId: string;
  tokenLabel: string;
  kind: TokenKind;
  from: FlowStage;
  to: FlowStage;
  title: string;
  detail: string;
  path: string;
  codeLine: number;
  output?: string;
}

interface SimulationScenario {
  id: ScenarioId;
  title: string;
  subtitle: string;
  codeLines: string[];
  steps: SimulationStep[];
}

interface VisualToken {
  id: string;
  label: string;
  kind: TokenKind;
  stage: FlowStage;
  x: number;
  y: number;
}

const FLOW_POINTS: Record<FlowStage, Point> = {
  source: { x: 24, y: 305 },
  task: { x: 175, y: 101 },
  microtask: { x: 175, y: 221 },
  stack: { x: 184, y: 510 },
  webApi: { x: 446, y: 374 },
  output: { x: 720, y: 376 },
  done: { x: 446, y: 505 },
};

function createStep(
  tokenId: string,
  tokenLabel: string,
  kind: TokenKind,
  from: FlowStage,
  to: FlowStage,
  title: string,
  detail: string,
  path: string,
  codeLine: number,
  output?: string,
): SimulationStep {
  return {
    tokenId,
    tokenLabel,
    kind,
    from,
    to,
    title,
    detail,
    path,
    codeLine,
    output,
  };
}

const SCENARIOS: SimulationScenario[] = [
  {
    id: 'promise-timer',
    title: 'Promise và timer',
    subtitle: 'Microtask chạy trước task',
    codeLines: [
      "console.log('A');",
      "setTimeout(() => console.log('D'), 0);",
      "Promise.resolve().then(() => console.log('C'));",
      "console.log('B');",
    ],
    steps: [
      createStep(
        'script',
        'script',
        'system',
        'source',
        'stack',
        'Script bắt đầu',
        'Global script được đưa vào Call Stack và chạy từ trên xuống.',
        'Source Code → Call Stack',
        0,
      ),
      createStep(
        'log-a',
        "log('A')",
        'sync',
        'source',
        'stack',
        'Gọi console.log A',
        'Lệnh đồng bộ được đẩy lên trên frame script.',
        'Source Code → Call Stack',
        0,
      ),
      createStep(
        'log-a',
        'A',
        'sync',
        'stack',
        'output',
        'A được in ngay',
        'console.log hoàn thành đồng bộ rồi rời Call Stack.',
        'Call Stack → Output',
        0,
        'A',
      ),
      createStep(
        'timer-d',
        'timer D',
        'timer',
        'source',
        'stack',
        'Gặp setTimeout',
        'setTimeout được gọi trên Call Stack; callback chưa chạy.',
        'Source Code → Call Stack',
        1,
      ),
      createStep(
        'timer-d',
        'timer D',
        'timer',
        'stack',
        'webApi',
        'Browser giữ timer',
        'Web APIs quản lý bộ đếm. Call Stack không đứng chờ.',
        'Call Stack → Web APIs',
        1,
      ),
      createStep(
        'timer-d',
        'callback D',
        'timer',
        'webApi',
        'task',
        'Timer hết hạn',
        'Delay 0 ms chỉ đưa callback vào Task Queue.',
        'Web APIs → Task Queue',
        1,
      ),
      createStep(
        'promise-c',
        'then(C)',
        'promise',
        'source',
        'stack',
        'Đăng ký Promise callback',
        'Promise.then được xử lý trong script hiện tại.',
        'Source Code → Call Stack',
        2,
      ),
      createStep(
        'promise-c',
        'callback C',
        'promise',
        'stack',
        'microtask',
        'Callback vào Microtask Queue',
        'Promise đã resolved nên callback C chờ trong Microtask Queue.',
        'Call Stack → Microtask Queue',
        2,
      ),
      createStep(
        'log-b',
        "log('B')",
        'sync',
        'source',
        'stack',
        'Script tiếp tục chạy B',
        'Callback đang chờ không làm script đồng bộ bị ngắt.',
        'Source Code → Call Stack',
        3,
      ),
      createStep(
        'log-b',
        'B',
        'sync',
        'stack',
        'output',
        'B được in',
        'Output hiện là A, B. Hai callback vẫn đang chờ.',
        'Call Stack → Output',
        3,
        'B',
      ),
      createStep(
        'script',
        'script',
        'system',
        'stack',
        'done',
        'Script hoàn thành',
        'Call Stack rỗng. Event Loop kiểm tra Microtask Queue trước.',
        'Call Stack → Event Loop',
        3,
      ),
      createStep(
        'promise-c',
        'callback C',
        'promise',
        'microtask',
        'stack',
        'Microtask được ưu tiên',
        'Event Loop drain Microtask Queue trước Task Queue.',
        'Microtask Queue → Call Stack',
        2,
      ),
      createStep(
        'promise-c',
        'C',
        'promise',
        'stack',
        'output',
        'C được in',
        'Promise callback hoàn thành và Microtask Queue rỗng.',
        'Call Stack → Output',
        2,
        'C',
      ),
      createStep(
        'timer-d',
        'callback D',
        'timer',
        'task',
        'stack',
        'Event Loop lấy timer task',
        'Sau khi drain microtask, callback D mới vào Call Stack.',
        'Task Queue → Call Stack',
        1,
      ),
      createStep(
        'timer-d',
        'D',
        'timer',
        'stack',
        'output',
        'D được in cuối cùng',
        'Thứ tự hoàn chỉnh: A → B → C → D.',
        'Call Stack → Output',
        1,
        'D',
      ),
    ],
  },
  {
    id: 'async-await',
    title: 'Async / await',
    subtitle: 'Function tạm dừng tại await',
    codeLines: [
      'async function load() {',
      "  console.log('before');",
      '  await Promise.resolve();',
      "  console.log('after');",
      '}',
      "console.log('start');",
      'load();',
      "console.log('end');",
    ],
    steps: [
      createStep(
        'script',
        'script',
        'system',
        'source',
        'stack',
        'Script bắt đầu',
        'Global script vào Call Stack.',
        'Source Code → Call Stack',
        5,
      ),
      createStep(
        'start',
        "log('start')",
        'sync',
        'source',
        'stack',
        'Gọi console.log start',
        'Lệnh đồng bộ vào Call Stack.',
        'Source Code → Call Stack',
        5,
      ),
      createStep(
        'start',
        'start',
        'sync',
        'stack',
        'output',
        'In start',
        'start được in ngay.',
        'Call Stack → Output',
        5,
        'start',
      ),
      createStep(
        'load',
        'load()',
        'sync',
        'source',
        'stack',
        'Gọi async function',
        'Async function bắt đầu chạy đồng bộ như function bình thường.',
        'Source Code → Call Stack',
        6,
      ),
      createStep(
        'before',
        "log('before')",
        'sync',
        'source',
        'stack',
        'Chạy phần trước await',
        'Phần trước await vẫn nằm trên Call Stack.',
        'Source Code → Call Stack',
        1,
      ),
      createStep(
        'before',
        'before',
        'sync',
        'stack',
        'output',
        'In before',
        'before được in trước khi function tạm dừng.',
        'Call Stack → Output',
        1,
        'before',
      ),
      createStep(
        'load',
        'load continuation',
        'promise',
        'stack',
        'microtask',
        'Tạm dừng tại await',
        'Phần còn lại của load trở thành continuation trong Microtask Queue.',
        'Call Stack → Microtask Queue',
        2,
      ),
      createStep(
        'end',
        "log('end')",
        'sync',
        'source',
        'stack',
        'Caller tiếp tục chạy',
        'await bên trong load không chặn global script.',
        'Source Code → Call Stack',
        7,
      ),
      createStep(
        'end',
        'end',
        'sync',
        'stack',
        'output',
        'In end',
        'Output lúc này là start, before, end.',
        'Call Stack → Output',
        7,
        'end',
      ),
      createStep(
        'script',
        'script',
        'system',
        'stack',
        'done',
        'Script hoàn thành',
        'Call Stack rỗng nên Event Loop drain microtask.',
        'Call Stack → Event Loop',
        7,
      ),
      createStep(
        'load',
        'load continuation',
        'promise',
        'microtask',
        'stack',
        'load tiếp tục sau await',
        'Continuation được đưa trở lại Call Stack.',
        'Microtask Queue → Call Stack',
        3,
      ),
      createStep(
        'load',
        'after',
        'promise',
        'stack',
        'output',
        'In after',
        'Thứ tự cuối cùng: start → before → end → after.',
        'Call Stack → Output',
        3,
        'after',
      ),
    ],
  },
  {
    id: 'blocking',
    title: 'Main thread bị block',
    subtitle: 'Timer hết hạn nhưng chưa thể chạy',
    codeLines: [
      "console.log('start');",
      "setTimeout(() => console.log('timer'), 0);",
      'heavyWork(350);',
      "console.log('done');",
    ],
    steps: [
      createStep(
        'script',
        'script',
        'system',
        'source',
        'stack',
        'Script bắt đầu',
        'Global script giữ Call Stack.',
        'Source Code → Call Stack',
        0,
      ),
      createStep(
        'start',
        'start',
        'sync',
        'source',
        'output',
        'In start',
        'Lệnh đồng bộ hoàn thành ngay.',
        'Call Stack → Output',
        0,
        'start',
      ),
      createStep(
        'timer',
        'timer',
        'timer',
        'source',
        'webApi',
        'Đăng ký timer 0 ms',
        'Browser nhận timer; script không đứng chờ.',
        'Call Stack → Web APIs',
        1,
      ),
      createStep(
        'heavy',
        'heavyWork',
        'sync',
        'source',
        'stack',
        'CPU task chiếm Call Stack',
        'Main thread bận nên callback khác không thể chen vào.',
        'Source Code → Call Stack',
        2,
      ),
      createStep(
        'timer',
        'timer callback',
        'timer',
        'webApi',
        'task',
        'Timer đã hết hạn',
        'Callback chỉ có thể chờ vì Call Stack vẫn bận.',
        'Web APIs → Task Queue',
        1,
      ),
      createStep(
        'heavy',
        'heavyWork',
        'sync',
        'stack',
        'done',
        'CPU task hoàn thành',
        'Sau khoảng 350 ms, heavyWork mới rời Call Stack.',
        'Call Stack → Event Loop',
        2,
      ),
      createStep(
        'done',
        'done',
        'sync',
        'source',
        'output',
        'Script in done',
        'Script vẫn phải chạy hết trước khi timer được lấy.',
        'Call Stack → Output',
        3,
        'done',
      ),
      createStep(
        'script',
        'script',
        'system',
        'stack',
        'done',
        'Call Stack rỗng',
        'Bây giờ Event Loop mới có thể lấy task đang chờ.',
        'Call Stack → Event Loop',
        3,
      ),
      createStep(
        'timer',
        'timer callback',
        'timer',
        'task',
        'stack',
        'Timer callback được chạy',
        '0 ms là delay tối thiểu, không phải thời điểm chạy đảm bảo.',
        'Task Queue → Call Stack',
        1,
      ),
      createStep(
        'timer',
        'timer',
        'timer',
        'stack',
        'output',
        'In timer cuối cùng',
        'Kết quả: start → done → timer.',
        'Call Stack → Output',
        1,
        'timer',
      ),
    ],
  },
];

@Component({
  selector: 'app-event-loop-async-demo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-loop-async-demo.component.html',
  styleUrls: ['./event-loop-async-demo.component.scss'],
})
export class EventLoopAsyncDemoComponent implements OnDestroy {
  readonly scenarios = SCENARIOS;
  readonly stages: FlowStage[] = ['task', 'microtask', 'stack', 'webApi', 'output'];

  selectedScenarioId: ScenarioId = 'promise-timer';
  currentStepIndex = -1;
  tokens: VisualToken[] = [];
  output: string[] = [];
  isAnimating = false;
  isAutoPlaying = false;
  activeFrom?: FlowStage;
  activeTo?: FlowStage;
  activePath = '';

  @ViewChild('svgRoot', { static: true })
  private svgRoot!: ElementRef<SVGSVGElement>;

  @ViewChild('activePathElement')
  private activePathElement?: ElementRef<SVGPathElement>;

  private autoPlayTimerId?: number;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  get selectedScenario(): SimulationScenario {
    return (
      this.scenarios.find(scenario => scenario.id === this.selectedScenarioId) ??
      this.scenarios[0]
    );
  }

  get currentStep(): SimulationStep | undefined {
    return this.currentStepIndex >= 0
      ? this.selectedScenario.steps[this.currentStepIndex]
      : undefined;
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.selectedScenario.steps.length) * 100;
  }

  get isAtEnd(): boolean {
    return this.currentStepIndex >= this.selectedScenario.steps.length - 1;
  }

  selectScenario(id: ScenarioId): void {
    if (id === this.selectedScenarioId) {
      return;
    }

    this.stopAutoPlay();
    this.selectedScenarioId = id;
    this.reset();
  }

  next(): void {
    if (this.isAnimating || this.isAtEnd) {
      return;
    }

    const index = this.currentStepIndex + 1;
    this.runStep(this.selectedScenario.steps[index], index);
  }

  previous(): void {
    if (this.isAnimating || this.currentStepIndex < 0) {
      return;
    }

    this.stopAutoPlay();
    this.rebuildToStep(this.currentStepIndex - 1);
  }

  toggleAutoPlay(): void {
    if (this.isAutoPlaying) {
      this.stopAutoPlay();
      return;
    }

    if (this.isAtEnd) {
      this.reset();
    }

    this.isAutoPlaying = true;
    this.next();
  }

  reset(): void {
    this.stopAutoPlay();
    gsap.killTweensOf(this.svgRoot.nativeElement.querySelectorAll('.job-token'));
    this.currentStepIndex = -1;
    this.tokens = [];
    this.output = [];
    this.activeFrom = undefined;
    this.activeTo = undefined;
    this.activePath = '';
    this.isAnimating = false;
  }

  getStageCount(stage: FlowStage): number {
    return this.tokens.filter(token => token.stage === stage).length;
  }

  isStageActive(stage: FlowStage): boolean {
    return this.activeFrom === stage || this.activeTo === stage;
  }

  tokenClass(kind: TokenKind): string {
    return `job-token--${kind}`;
  }

  trackByScenario(_: number, scenario: SimulationScenario): ScenarioId {
    return scenario.id;
  }

  trackByLine(index: number): number {
    return index;
  }

  trackByToken(_: number, token: VisualToken): string {
    return token.id;
  }

  ngOnDestroy(): void {
    this.stopAutoPlay();
    gsap.killTweensOf(this.svgRoot.nativeElement.querySelectorAll('*'));
  }

  private runStep(step: SimulationStep, index: number): void {
    this.isAnimating = true;
    this.currentStepIndex = index;
    this.activeFrom = step.from;
    this.activeTo = step.to;

    const token = this.ensureToken(step);
    const destination = this.getTokenPosition(step.to, step.tokenId, step.codeLine);
    const origin = { x: token.x, y: token.y };
    this.activePath = this.createPath(origin, destination);
    this.cdr.detectChanges();

    const tokenElement = this.svgRoot.nativeElement.querySelector<SVGGElement>(
      `#job-token-${step.tokenId}`,
    );

    if (!tokenElement) {
      this.completeStep(step, token, destination);
      return;
    }

    const pathElement = this.activePathElement?.nativeElement;

    if (pathElement) {
      const length = pathElement.getTotalLength();
      gsap.fromTo(
        pathElement,
        { strokeDasharray: length, strokeDashoffset: length, opacity: 1 },
        { strokeDashoffset: 0, duration: 0.75, ease: 'power1.inOut' },
      );
    }

    gsap.to(tokenElement, {
      attr: {
        transform: `translate(${destination.x} ${destination.y})`,
      },
      duration: 0.82,
      ease: 'power2.inOut',
      onComplete: () => {
        this.completeStep(step, token, destination);
      },
    });
  }

  private completeStep(step: SimulationStep, token: VisualToken, destination: Point): void {
    token.label = step.tokenLabel;
    token.stage = step.to;
    token.x = destination.x;
    token.y = destination.y;

    if (step.to === 'done') {
      this.tokens = this.tokens.filter(item => item.id !== token.id);
    }

    if (step.output) {
      this.output = [...this.output, step.output];
    }

    this.activePath = '';
    this.activeFrom = undefined;
    this.activeTo = step.to;
    this.isAnimating = false;
    this.cdr.detectChanges();

    if (this.activeTo && this.activeTo !== 'done') {
      const stageElement = this.svgRoot.nativeElement.querySelector(
        `[data-stage="${this.activeTo}"]`,
      );
      if (stageElement) {
        gsap.fromTo(
          stageElement,
          { scale: 1, transformOrigin: 'center center' },
          { scale: 1.015, duration: 0.18, yoyo: true, repeat: 1 },
        );
      }
    }

    if (this.isAutoPlaying) {
      if (this.isAtEnd) {
        this.stopAutoPlay();
        this.cdr.detectChanges();
      } else {
        this.autoPlayTimerId = window.setTimeout(() => this.next(), 650);
      }
    }
  }

  private ensureToken(step: SimulationStep): VisualToken {
    const existing = this.tokens.find(token => token.id === step.tokenId);

    if (existing) {
      existing.label = step.tokenLabel;
      return existing;
    }

    const origin = this.getTokenPosition(step.from, step.tokenId, step.codeLine);
    const token: VisualToken = {
      id: step.tokenId,
      label: step.tokenLabel,
      kind: step.kind,
      stage: step.from,
      x: origin.x,
      y: origin.y,
    };

    this.tokens = [...this.tokens, token];
    this.cdr.detectChanges();
    return token;
  }

  private getTokenPosition(
    stage: FlowStage,
    tokenId: string,
    codeLine = 0,
  ): Point {
    if (stage === 'source') {
      return { x: FLOW_POINTS.source.x, y: 282 + Math.min(codeLine, 6) * 20 };
    }

    if (stage === 'done') {
      return { ...FLOW_POINTS.done };
    }

    const peers = this.tokens.filter(
      token => token.stage === stage && token.id !== tokenId,
    );
    const slot = peers.length;

    if (stage === 'task' || stage === 'microtask') {
      return {
        x: FLOW_POINTS[stage].x + (slot % 4) * 164,
        y: FLOW_POINTS[stage].y,
      };
    }

    if (stage === 'stack') {
      return {
        x: FLOW_POINTS.stack.x,
        y: FLOW_POINTS.stack.y - slot * 46,
      };
    }

    if (stage === 'webApi') {
      return {
        x: FLOW_POINTS.webApi.x,
        y: FLOW_POINTS.webApi.y + slot * 48,
      };
    }

    return {
      x: FLOW_POINTS.output.x,
      y: FLOW_POINTS.output.y + slot * 48,
    };
  }

  private createPath(from: Point, to: Point): string {
    const deltaX = to.x - from.x;
    const controlOffset = Math.max(55, Math.min(150, Math.abs(deltaX) * 0.45));
    const controlX1 = from.x + Math.sign(deltaX || 1) * controlOffset;
    const controlX2 = to.x - Math.sign(deltaX || 1) * controlOffset;

    return `M ${from.x} ${from.y} C ${controlX1} ${from.y}, ${controlX2} ${to.y}, ${to.x} ${to.y}`;
  }

  private rebuildToStep(targetIndex: number): void {
    gsap.killTweensOf(this.svgRoot.nativeElement.querySelectorAll('.job-token'));
    const states = new Map<
      string,
      { label: string; kind: TokenKind; stage: FlowStage; codeLine: number }
    >();
    const output: string[] = [];

    for (let index = 0; index <= targetIndex; index++) {
      const step = this.selectedScenario.steps[index];

      if (step.to === 'done') {
        states.delete(step.tokenId);
      } else {
        states.set(step.tokenId, {
          label: step.tokenLabel,
          kind: step.kind,
          stage: step.to,
          codeLine: step.codeLine,
        });
      }

      if (step.output) {
        output.push(step.output);
      }
    }

    this.tokens = [];

    for (const [id, state] of states) {
      const position = this.getTokenPosition(state.stage, id, state.codeLine);
      this.tokens.push({
        id,
        label: state.label,
        kind: state.kind,
        stage: state.stage,
        x: position.x,
        y: position.y,
      });
    }

    this.output = output;
    this.currentStepIndex = targetIndex;
    const step = targetIndex >= 0 ? this.selectedScenario.steps[targetIndex] : undefined;
    this.activeFrom = step?.from;
    this.activeTo = step?.to;
    this.activePath = '';
    this.cdr.detectChanges();
  }

  private stopAutoPlay(): void {
    this.isAutoPlaying = false;

    if (this.autoPlayTimerId !== undefined) {
      window.clearTimeout(this.autoPlayTimerId);
      this.autoPlayTimerId = undefined;
    }
  }
}
