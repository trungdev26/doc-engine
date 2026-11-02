import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StepHistoryEntry, StepHistoryTone } from '../shared/step-history/step-history.component';

type LabId = 'boundary' | 'lost-update' | 'deadlock' | 'outbox';
type BoundaryMode = 'success' | 'failure';
type RaceMode = 'unsafe' | 'atomic';
type LockMode = 'inconsistent' | 'consistent';
type OutboxMode = 'direct' | 'outbox';
type RecordState = 'absent' | 'pending' | 'committed' | 'rolled-back';

interface LabOption {
  id: LabId;
  label: string;
  description: string;
  caseTitle: string;
  context: string;
  symptom: string;
  question: string;
}

interface LabFact {
  label: string;
  value: string;
}

interface SimulationStep {
  title: string;
  detail: string;
  activeIds: string[];
}

interface ActorPosition {
  x: number;
  y: number;
}

@Component({
  selector: 'app-transaction-demo',
  templateUrl: './transaction-demo.component.html',
  styleUrls: ['./transaction-demo.component.scss'],
})
export class TransactionDemoComponent implements OnDestroy {
  readonly labs: LabOption[] = [
    {
      id: 'boundary',
      label: 'Transaction Boundary',
      description: 'Quan sát dữ liệu tạm, commit và rollback khi một bước thất bại.',
      caseTitle: 'Tạo đơn hàng gồm nhiều thay đổi liên quan',
      context:
        'Một request phải tạo Order, OrderItems, giảm tồn kho và ghi StockTransaction. Bốn thay đổi cùng bảo vệ một invariant nghiệp vụ.',
      symptom:
        'Order đã xuất hiện nhưng tồn kho chưa giảm hoặc lịch sử kho bị thiếu khi request lỗi giữa chừng.',
      question: 'Boundary phải bao những write nào để database không công bố trạng thái nửa vời?',
    },
    {
      id: 'lost-update',
      label: 'Lost Update',
      description: 'Hai request cùng trừ tồn bằng hai chiến lược cập nhật khác nhau.',
      caseTitle: 'Hai request mua cùng một sản phẩm',
      context:
        'Stock ban đầu bằng 10. Request A mua 2 sản phẩm, Request B mua 3 sản phẩm và hai request chạy xen kẽ.',
      symptom: 'Cả hai request đều báo thành công nhưng Stock cuối bằng 7 thay vì 5.',
      question:
        'Read–Modify–Write làm mất update ở đâu, và Atomic Update thay đổi điểm phân xử như thế nào?',
    },
    {
      id: 'deadlock',
      label: 'Deadlock',
      description: 'Theo dõi hai transaction giữ và chờ lock theo một chu trình.',
      caseTitle: 'Hai transaction cập nhật cùng hai Order',
      context:
        'Transaction A và B đều cần cập nhật Order #1 và Order #2. Thứ tự lấy lock quyết định chúng tiếp tục, chờ hay tạo deadlock.',
      symptom:
        'Một request thỉnh thoảng bị database chọn làm deadlock victim dù SQL riêng lẻ vẫn chạy nhanh.',
      question:
        'Chu trình chờ được hình thành thế nào, và vì sao lock ordering nhất quán làm nó biến mất?',
    },
    {
      id: 'outbox',
      label: 'Transactional Outbox',
      description: 'Mô phỏng process dừng sau commit nhưng trước khi publish event.',
      caseTitle: 'Order đã commit nhưng OrderCreated bị mất',
      context:
        'Order service phải lưu Order và phát OrderCreated. Database và message broker không chia sẻ một local transaction.',
      symptom:
        'Order tồn tại nhưng Inventory service không nhận được event khi process dừng ngay sau commit.',
      question: 'Outbox đóng failure window giữa database commit và message publish bằng cách nào?',
    },
  ];

  visibleLabs: LabOption[] = [];
  activeLab: LabId = 'boundary';
  boundaryMode: BoundaryMode = 'failure';
  raceMode: RaceMode = 'unsafe';
  lockMode: LockMode = 'inconsistent';
  outboxMode: OutboxMode = 'direct';

  steps: SimulationStep[] = [];
  currentStepIndex = -1;
  isPlaying = false;
  speedMs = 1000;
  activeIds: string[] = [];

  transactionState = 'Chưa bắt đầu';
  orderState: RecordState = 'absent';
  itemState: RecordState = 'absent';
  movementState: RecordState = 'absent';
  stock = 1;

  stockARead: number | null = null;
  stockBRead: number | null = null;
  laneAState = 'Sẵn sàng';
  laneBState = 'Sẵn sàng';
  raceBroken = false;

  order1Owner: 'A' | 'B' | null = null;
  order2Owner: 'A' | 'B' | null = null;
  deadlockDetected = false;

  businessOrderState: RecordState = 'absent';
  outboxState: RecordState = 'absent';
  eventState = 'Chưa publish';
  processState = 'Đang chạy';
  deliveryCount = 0;
  consumerState = 'Chưa nhận event';

  private timer: ReturnType<typeof setInterval> | null = null;
  private actorAElement: SVGGElement | null = null;
  private actorBElement: SVGGElement | null = null;
  private gsapApi: (typeof import('gsap'))['gsap'] | null = null;
  private actorAnimationVersion = 0;

  @ViewChild('transactionAActor')
  set transactionAActor(elementRef: ElementRef<SVGGElement> | undefined) {
    this.actorAElement = elementRef?.nativeElement ?? null;
    void this.animateDeadlockActors(true);
  }

  @ViewChild('transactionBActor')
  set transactionBActor(elementRef: ElementRef<SVGGElement> | undefined) {
    this.actorBElement = elementRef?.nativeElement ?? null;
    void this.animateDeadlockActors(true);
  }

  constructor(route: ActivatedRoute) {
    const configuredLabs = route.snapshot.data['demoLabs'] as LabId[] | undefined;
    this.visibleLabs = configuredLabs?.length
      ? configuredLabs.map(id => this.labs.find(lab => lab.id === id)!).filter(Boolean)
      : this.labs;
    this.activeLab = this.visibleLabs[0].id;
    this.reset();
  }

  ngOnDestroy(): void {
    this.stop();
    this.actorAnimationVersion += 1;
    if (this.gsapApi) {
      this.gsapApi.killTweensOf([this.actorAElement, this.actorBElement]);
    }
  }

  get activeLabInfo(): LabOption {
    return this.labs.find(lab => lab.id === this.activeLab)!;
  }

  get currentStep(): SimulationStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  get executedStepLog(): StepHistoryEntry[] {
    if (this.currentStepIndex < 0) return [];

    return this.steps.slice(0, this.currentStepIndex + 1).map(step => ({
      actor: this.stepActorLabel(step),
      operation: this.stepOperation(step),
      title: step.title,
      note: step.detail,
      tone: this.stepActorTone(step),
    }));
  }

  get progressPercent(): number {
    return this.steps.length ? ((this.currentStepIndex + 1) / this.steps.length) * 100 : 0;
  }

  get showAWait(): boolean {
    return (
      this.lockMode === 'inconsistent' && this.currentStepIndex >= 2 && this.currentStepIndex <= 4
    );
  }

  get showBWait(): boolean {
    return (
      this.lockMode === 'inconsistent' && this.currentStepIndex >= 3 && this.currentStepIndex <= 4
    );
  }

  get showDeadlockCycle(): boolean {
    return (
      this.lockMode === 'inconsistent' && this.currentStepIndex >= 3 && this.currentStepIndex <= 4
    );
  }

  get outboxStatusLabel(): string {
    return this.outboxMode === 'outbox' && this.currentStepIndex >= 7
      ? 'Đã processed'
      : this.stateLabel(this.outboxState);
  }

  get scenarioNumber(): number {
    return this.visibleLabs.findIndex(lab => lab.id === this.activeLab) + 1;
  }

  get labFacts(): LabFact[] {
    switch (this.activeLab) {
      case 'lost-update':
        return [
          { label: 'Stock ban đầu', value: '10' },
          { label: 'Request A', value: 'Mua 2' },
          { label: 'Request B', value: 'Mua 3' },
        ];
      case 'deadlock':
        return [
          { label: 'Transaction A', value: 'Order #1 → Order #2' },
          {
            label: 'Transaction B',
            value: this.lockMode === 'inconsistent' ? 'Order #2 → Order #1' : 'Order #1 → Order #2',
          },
          { label: 'Resource', value: 'Exclusive lock' },
        ];
      case 'outbox':
        return [
          { label: 'Database', value: 'Orders' },
          { label: 'Broker', value: 'OrderCreated' },
          { label: 'Failure', value: 'Crash sau commit' },
        ];
      case 'boundary':
      default:
        return [
          { label: 'Stock ban đầu', value: '1' },
          { label: 'Số write', value: '4' },
          { label: 'Invariant', value: 'Không có trạng thái nửa vời' },
        ];
    }
  }

  get verdictTitle(): string {
    if (this.currentStepIndex < this.steps.length - 1) {
      return 'Chưa có kết quả cuối';
    }

    switch (this.activeLab) {
      case 'lost-update':
        return this.raceMode === 'unsafe' ? 'Invariant bị phá' : 'Update được tuần tự hóa';
      case 'deadlock':
        return this.lockMode === 'inconsistent'
          ? 'Database phải abort một transaction'
          : 'Không tạo chu trình chờ';
      case 'outbox':
        return this.outboxMode === 'direct' ? 'OrderCreated bị mất' : 'Event có thể phục hồi';
      case 'boundary':
      default:
        return this.boundaryMode === 'failure'
          ? 'Rollback giữ dữ liệu nhất quán'
          : 'Toàn bộ thay đổi đã commit';
    }
  }

  get verdictDetail(): string {
    switch (this.activeLab) {
      case 'lost-update':
        return this.raceMode === 'unsafe'
          ? 'B ghi 7 từ snapshot cũ và ghi đè kết quả 8 của A; kết quả đúng phải là 5.'
          : 'Mỗi UPDATE tính trên giá trị hiện tại trong database, nên Stock lần lượt chuyển 10 → 8 → 5.';
      case 'deadlock':
        return this.lockMode === 'inconsistent'
          ? 'A chờ Order #2 do B giữ, trong khi B chờ Order #1 do A giữ: wait-for graph có chu trình.'
          : 'B chờ A hoàn thành Order #1; sau khi A commit, B tiếp tục theo cùng thứ tự và không giữ lock ngược chiều.';
      case 'outbox':
        return this.outboxMode === 'direct'
          ? 'Commit đã bền vững nhưng publish chưa xảy ra; restart process không còn bản ghi nào để biết event đang thiếu.'
          : 'Order và OutboxMessage commit cùng nhau; relay có thể tiếp tục publish sau khi process chính dừng.';
      case 'boundary':
      default:
        return this.boundaryMode === 'failure'
          ? 'Order, item và stock change chưa từng được công bố; trạng thái trở về đúng như trước request.'
          : 'Order, item, stock và movement cùng chuyển từ pending sang committed tại một boundary.';
    }
  }

  selectLab(lab: LabId): void {
    if (lab === this.activeLab) {
      return;
    }
    this.activeLab = lab;
    this.reset();
  }

  setBoundaryMode(mode: BoundaryMode): void {
    this.boundaryMode = mode;
    this.reset();
  }

  setRaceMode(mode: RaceMode): void {
    this.raceMode = mode;
    this.reset();
  }

  setLockMode(mode: LockMode): void {
    this.lockMode = mode;
    this.reset();
  }

  setOutboxMode(mode: OutboxMode): void {
    this.outboxMode = mode;
    this.reset();
  }

  setSpeed(speedMs: number): void {
    this.speedMs = speedMs;
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stop();
      return;
    }
    this.play();
  }

  nextStep(): void {
    this.stop();
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.reset();
    }
    this.renderToStep(this.currentStepIndex + 1);
  }

  previousStep(): void {
    this.stop();
    this.renderToStep(this.currentStepIndex - 1);
  }

  reset(): void {
    this.stop();
    this.steps = this.buildSteps();
    this.renderToStep(-1);
  }

  isActive(id: string): boolean {
    return this.activeIds.includes(id);
  }

  stateLabel(state: RecordState): string {
    switch (state) {
      case 'pending':
        return 'Thay đổi tạm trong transaction';
      case 'committed':
        return 'Đã commit';
      case 'rolled-back':
        return 'Đã rollback';
      case 'absent':
      default:
        return 'Chưa tồn tại';
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  private stepActorLabel(step: SimulationStep): string {
    if (step.activeIds.includes('lane-a')) {
      return this.activeLab === 'lost-update' ? 'Request A' : 'Transaction A';
    }
    if (step.activeIds.includes('lane-b')) {
      return this.activeLab === 'lost-update' ? 'Request B' : 'Transaction B';
    }
    if (step.activeIds.includes('relay')) return 'Outbox Relay';
    if (step.activeIds.includes('service')) return 'Order Service';
    if (step.activeIds.includes('broker')) return 'Message Broker';
    if (
      step.activeIds.some(id =>
        ['database', 'outbox', 'order', 'items', 'stock', 'movement', 'transaction'].includes(id),
      )
    ) {
      return 'Database';
    }
    return 'Database engine';
  }

  private stepActorTone(step: SimulationStep): StepHistoryTone {
    if (step.activeIds.includes('lane-a') || step.activeIds.includes('service')) return 'primary';
    if (step.activeIds.includes('lane-b') || step.activeIds.includes('broker')) return 'secondary';
    return 'neutral';
  }

  private stepOperation(step: SimulationStep): string {
    const content = `${step.title} ${step.detail}`;
    if (/retry/i.test(content)) return 'RETRY';
    if (/rollback/i.test(content)) return 'ROLLBACK';
    if (/abort/i.test(content)) return 'ABORT';
    if (/commit/i.test(content)) return 'COMMIT';
    if (/publish/i.test(content)) return 'PUBLISH';
    if (/phát hiện/i.test(content)) return 'DETECT';
    if (/chờ/i.test(content)) return 'WAIT';
    if (/lock|khóa/i.test(content)) return 'LOCK';
    if (/đọc/i.test(content)) return 'READ';
    if (/insert|ghi|update|giảm/i.test(content)) return 'WRITE';
    if (/mở|bắt đầu/i.test(content)) return 'BEGIN';
    return 'STEP';
  }

  private play(): void {
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.renderToStep(-1);
    }
    this.isPlaying = true;
    this.timer = setInterval(() => {
      if (this.currentStepIndex >= this.steps.length - 1) {
        this.stop();
        return;
      }
      this.renderToStep(this.currentStepIndex + 1);
    }, this.speedMs);
  }

  private stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private renderToStep(stepIndex: number): void {
    this.initializeRuntime();
    this.currentStepIndex = Math.max(-1, Math.min(stepIndex, this.steps.length - 1));

    for (let index = 0; index <= this.currentStepIndex; index += 1) {
      this.applyStep(index);
    }

    this.activeIds = this.currentStep?.activeIds ?? [];
    void this.animateDeadlockActors(false);
  }

  private initializeRuntime(): void {
    this.activeIds = [];
    this.transactionState = 'Chưa bắt đầu';
    this.orderState = 'absent';
    this.itemState = 'absent';
    this.movementState = 'absent';
    this.stock = 1;
    this.stockARead = null;
    this.stockBRead = null;
    this.laneAState = 'Sẵn sàng';
    this.laneBState = 'Sẵn sàng';
    this.raceBroken = false;
    this.order1Owner = null;
    this.order2Owner = null;
    this.deadlockDetected = false;
    this.businessOrderState = 'absent';
    this.outboxState = 'absent';
    this.eventState = 'Chưa publish';
    this.processState = 'Đang chạy';
    this.deliveryCount = 0;
    this.consumerState = 'Chưa nhận event';
  }

  private buildSteps(): SimulationStep[] {
    switch (this.activeLab) {
      case 'lost-update':
        return this.buildRaceSteps();
      case 'deadlock':
        return this.buildLockSteps();
      case 'outbox':
        return this.buildOutboxSteps();
      case 'boundary':
      default:
        return this.buildBoundarySteps();
    }
  }

  private buildBoundarySteps(): SimulationStep[] {
    const shared: SimulationStep[] = [
      {
        title: 'Mở transaction',
        detail:
          'Database tạo một boundary; thay đổi sau đó chưa được transaction khác xem là committed.',
        activeIds: ['transaction'],
      },
      {
        title: 'Insert Order',
        detail: 'Order tồn tại trong write set của transaction nhưng chưa được công bố.',
        activeIds: ['order'],
      },
      {
        title: 'Insert OrderItems',
        detail: 'OrderItems tham gia cùng boundary với Order.',
        activeIds: ['items'],
      },
      {
        title: 'Giảm tồn kho',
        detail:
          this.boundaryMode === 'failure'
            ? 'Conditional update không tìm thấy đủ tồn kho. Transaction chuyển sang nhánh lỗi.'
            : 'Conditional update thành công: Stock chuyển từ 1 xuống 0.',
        activeIds: ['stock'],
      },
    ];

    if (this.boundaryMode === 'failure') {
      return [
        ...shared,
        {
          title: 'Rollback toàn bộ transaction',
          detail: 'Order và OrderItems bị hoàn tác; Stock vẫn bằng 1 và không có StockTransaction.',
          activeIds: ['transaction', 'order', 'items', 'stock'],
        },
      ];
    }

    return [
      ...shared,
      {
        title: 'Ghi StockTransaction',
        detail: 'Lịch sử giảm tồn tham gia cùng transaction.',
        activeIds: ['movement'],
      },
      {
        title: 'Commit boundary',
        detail: 'Bốn thay đổi cùng trở thành committed và có thể được transaction khác quan sát.',
        activeIds: ['transaction', 'order', 'items', 'stock', 'movement'],
      },
    ];
  }

  private buildRaceSteps(): SimulationStep[] {
    if (this.raceMode === 'unsafe') {
      return [
        {
          title: 'Request A đọc Stock = 10',
          detail: 'A giữ giá trị 10 trong memory để tính Stock mới.',
          activeIds: ['lane-a', 'stock'],
        },
        {
          title: 'Request B cũng đọc Stock = 10',
          detail: 'B đọc trước khi A ghi, nên cả hai request có cùng một snapshot cũ.',
          activeIds: ['lane-b', 'stock'],
        },
        {
          title: 'A ghi Stock = 8',
          detail: 'A lấy 10 - 2 và update giá trị 8.',
          activeIds: ['lane-a', 'stock'],
        },
        {
          title: 'B ghi Stock = 7',
          detail: 'B lấy snapshot 10 - 3 rồi ghi 7, ghi đè kết quả của A.',
          activeIds: ['lane-b', 'stock'],
        },
      ];
    }

    return [
      {
        title: 'A thực thi Atomic Update',
        detail: 'Database tính StockQuantity - 2 trực tiếp trên giá trị hiện tại: 10 → 8.',
        activeIds: ['lane-a', 'stock'],
      },
      {
        title: 'B thực thi Atomic Update',
        detail: 'B tiếp tục tính trên giá trị mới nhất trong database: 8 → 5.',
        activeIds: ['lane-b', 'stock'],
      },
    ];
  }

  private buildLockSteps(): SimulationStep[] {
    if (this.lockMode === 'inconsistent') {
      return [
        {
          title: 'A khóa Order #1',
          detail: 'A giữ exclusive lock trên Order #1.',
          activeIds: ['lane-a', 'order-1'],
        },
        {
          title: 'B khóa Order #2',
          detail: 'B giữ exclusive lock trên Order #2.',
          activeIds: ['lane-b', 'order-2'],
        },
        {
          title: 'A chờ Order #2',
          detail: 'A không thể lấy lock vì Order #2 đang do B giữ.',
          activeIds: ['lane-a', 'order-2'],
        },
        {
          title: 'B chờ Order #1',
          detail: 'B chờ resource do A giữ; wait-for graph đã tạo thành chu trình.',
          activeIds: ['lane-b', 'order-1'],
        },
        {
          title: 'Database phát hiện deadlock',
          detail: 'Database chọn B làm victim, rollback B và giải phóng lock trên Order #2.',
          activeIds: ['lane-a', 'lane-b', 'order-1', 'order-2'],
        },
        {
          title: 'A tiếp tục và commit',
          detail: 'A lấy Order #2, hoàn thành transaction rồi giải phóng toàn bộ lock.',
          activeIds: ['lane-a', 'order-2'],
        },
      ];
    }

    return [
      {
        title: 'A khóa Order #1',
        detail: 'Mọi code path đều lấy lock theo OrderId tăng dần.',
        activeIds: ['lane-a', 'order-1'],
      },
      {
        title: 'B chờ Order #1',
        detail: 'B chưa giữ Order #2, nên chưa thể tạo cạnh chờ ngược chiều.',
        activeIds: ['lane-b', 'order-1'],
      },
      {
        title: 'A khóa Order #2',
        detail: 'A đã giữ cả hai resource và thực hiện update.',
        activeIds: ['lane-a', 'order-2'],
      },
      {
        title: 'A commit và giải phóng lock',
        detail: 'Order #1 và #2 trở lại trạng thái không bị khóa.',
        activeIds: ['lane-a', 'order-1', 'order-2'],
      },
      {
        title: 'B lần lượt khóa Order #1 và #2',
        detail: 'B tiếp tục sau A theo cùng thứ tự resource.',
        activeIds: ['lane-b', 'order-1', 'order-2'],
      },
      {
        title: 'B commit',
        detail: 'Hai transaction hoàn thành tuần tự mà không tạo deadlock.',
        activeIds: ['lane-b'],
      },
    ];
  }

  private buildOutboxSteps(): SimulationStep[] {
    if (this.outboxMode === 'direct') {
      return [
        {
          title: 'Mở database transaction',
          detail: 'Order service bắt đầu local transaction.',
          activeIds: ['service', 'database'],
        },
        {
          title: 'Insert Order',
          detail: 'Order đang pending trong database transaction.',
          activeIds: ['database'],
        },
        {
          title: 'Commit Order',
          detail: 'Order đã durable; broker vẫn chưa có OrderCreated.',
          activeIds: ['database'],
        },
        {
          title: 'Process dừng trước khi publish',
          detail: 'Sau restart không có durable record nào mô tả event còn thiếu.',
          activeIds: ['service', 'broker'],
        },
      ];
    }

    return [
      {
        title: 'Mở database transaction',
        detail: 'Order service bắt đầu local transaction.',
        activeIds: ['service', 'database'],
      },
      {
        title: 'Insert Order và OutboxMessage',
        detail: 'Business data và intent phát event cùng nằm trong một transaction.',
        activeIds: ['database', 'outbox'],
      },
      {
        title: 'Commit cùng một boundary',
        detail: 'Order và OutboxMessage cùng durable.',
        activeIds: ['database', 'outbox'],
      },
      {
        title: 'Process chính dừng',
        detail: 'Event chưa publish nhưng OutboxMessage vẫn tồn tại sau restart.',
        activeIds: ['service', 'outbox'],
      },
      {
        title: 'Outbox relay đọc message pending',
        detail: 'Worker độc lập nhận biết chính xác event nào chưa được gửi.',
        activeIds: ['relay', 'outbox'],
      },
      {
        title: 'Relay publish OrderCreated',
        detail: 'Broker nhận event. Consumer vẫn cần idempotent vì publish có thể được retry.',
        activeIds: ['relay', 'broker'],
      },
      {
        title: 'Relay retry sau timeout',
        detail:
          'Relay chưa chắc broker đã nhận lần trước nên publish lại. Delivery là at-least-once và có thể tạo duplicate.',
        activeIds: ['relay', 'broker'],
      },
      {
        title: 'Consumer deduplicate và hoàn tất',
        detail:
          'Consumer dùng EventId để chỉ áp dụng nghiệp vụ một lần; relay đánh dấu OutboxMessage đã processed.',
        activeIds: ['outbox', 'broker', 'consumer'],
      },
    ];
  }

  private applyStep(index: number): void {
    switch (this.activeLab) {
      case 'lost-update':
        this.applyRaceStep(index);
        break;
      case 'deadlock':
        this.applyLockStep(index);
        break;
      case 'outbox':
        this.applyOutboxStep(index);
        break;
      case 'boundary':
      default:
        this.applyBoundaryStep(index);
        break;
    }
  }

  private applyBoundaryStep(index: number): void {
    if (index >= 0) {
      this.transactionState = 'Đang mở';
    }
    if (index >= 1) {
      this.orderState = 'pending';
    }
    if (index >= 2) {
      this.itemState = 'pending';
    }
    if (index >= 3 && this.boundaryMode === 'success') {
      this.stock = 0;
    }
    if (this.boundaryMode === 'failure' && index >= 3) {
      this.transactionState = index === 3 ? 'Lỗi: không đủ tồn' : 'Đã rollback';
    }
    if (this.boundaryMode === 'failure' && index >= 4) {
      this.orderState = 'rolled-back';
      this.itemState = 'rolled-back';
    }
    if (this.boundaryMode === 'success' && index >= 4) {
      this.movementState = 'pending';
    }
    if (this.boundaryMode === 'success' && index >= 5) {
      this.transactionState = 'Đã commit';
      this.orderState = 'committed';
      this.itemState = 'committed';
      this.movementState = 'committed';
    }
  }

  private applyRaceStep(index: number): void {
    if (this.raceMode === 'unsafe') {
      if (index >= 0) {
        this.stockARead = 10;
        this.laneAState = 'Đã đọc 10';
      }
      if (index >= 1) {
        this.stockBRead = 10;
        this.laneBState = 'Đã đọc 10';
      }
      if (index >= 2) {
        this.stock = 8;
        this.laneAState = 'Đã ghi 8';
      }
      if (index >= 3) {
        this.stock = 7;
        this.laneBState = 'Đã ghi 7 từ snapshot cũ';
        this.raceBroken = true;
      }
      return;
    }

    this.stock = 10;
    if (index >= 0) {
      this.stock = 8;
      this.laneAState = 'Atomic UPDATE: 10 → 8';
    }
    if (index >= 1) {
      this.stock = 5;
      this.laneBState = 'Atomic UPDATE: 8 → 5';
    }
  }

  private applyLockStep(index: number): void {
    if (this.lockMode === 'inconsistent') {
      if (index >= 0) {
        this.order1Owner = 'A';
        this.laneAState = 'Giữ Order #1';
      }
      if (index >= 1) {
        this.order2Owner = 'B';
        this.laneBState = 'Giữ Order #2';
      }
      if (index >= 2) {
        this.laneAState = 'Chờ Order #2';
      }
      if (index >= 3) {
        this.laneBState = 'Chờ Order #1';
        this.deadlockDetected = true;
      }
      if (index >= 4) {
        this.laneBState = 'Bị abort và rollback';
        this.order2Owner = null;
      }
      if (index >= 5) {
        this.order2Owner = 'A';
        this.laneAState = 'Commit';
      }
      return;
    }

    if (index >= 0) {
      this.order1Owner = 'A';
      this.laneAState = 'Giữ Order #1';
    }
    if (index >= 1) {
      this.laneBState = 'Chờ Order #1, chưa giữ lock';
    }
    if (index >= 2) {
      this.order2Owner = 'A';
      this.laneAState = 'Giữ Order #1 và #2';
    }
    if (index >= 3) {
      this.order1Owner = null;
      this.order2Owner = null;
      this.laneAState = 'Đã commit';
    }
    if (index >= 4) {
      this.order1Owner = 'B';
      this.order2Owner = 'B';
      this.laneBState = 'Giữ Order #1 và #2';
    }
    if (index >= 5) {
      this.order1Owner = null;
      this.order2Owner = null;
      this.laneBState = 'Đã commit';
    }
  }

  private getActorPosition(actor: 'A' | 'B'): ActorPosition {
    const index = this.currentStepIndex;

    if (actor === 'A') {
      if (this.lockMode === 'inconsistent') {
        if (index >= 5) return { x: 350, y: 222 };
        if (index >= 2) return { x: 350, y: 222 };
        if (index >= 0) return { x: 350, y: 78 };
      } else {
        if (index >= 3) return { x: 130, y: 78 };
        if (index >= 2) return { x: 350, y: 222 };
        if (index >= 0) return { x: 350, y: 78 };
      }
      return { x: 130, y: 78 };
    }

    if (this.lockMode === 'inconsistent') {
      if (index >= 4) return { x: 870, y: 222 };
      if (index >= 3) return { x: 650, y: 78 };
      if (index >= 1) return { x: 650, y: 222 };
    } else {
      if (index >= 5) return { x: 870, y: 222 };
      if (index >= 4) return { x: 650, y: 222 };
      if (index >= 1) return { x: 650, y: 78 };
    }
    return { x: 870, y: 222 };
  }

  private async animateDeadlockActors(immediate: boolean): Promise<void> {
    if (this.activeLab !== 'deadlock' || !this.actorAElement || !this.actorBElement) {
      return;
    }

    const version = ++this.actorAnimationVersion;
    const { gsap } = await import('gsap');
    if (version !== this.actorAnimationVersion || !this.actorAElement || !this.actorBElement) {
      return;
    }
    this.gsapApi = gsap;

    const positionA = this.getActorPosition('A');
    const positionB = this.getActorPosition('B');
    const duration = immediate ? 0 : Math.min(Math.max(this.speedMs * 0.00062, 0.34), 0.82);

    gsap.to(this.actorAElement, {
      x: positionA.x,
      y: positionA.y,
      duration,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
    gsap.to(this.actorBElement, {
      x: positionB.x,
      y: positionB.y,
      duration,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
  }

  private applyOutboxStep(index: number): void {
    if (index >= 0) {
      this.transactionState = 'Đang mở';
    }
    if (index >= 1) {
      this.businessOrderState = 'pending';
      if (this.outboxMode === 'outbox') {
        this.outboxState = 'pending';
      }
    }
    if (index >= 2) {
      this.transactionState = 'Đã commit';
      this.businessOrderState = 'committed';
      if (this.outboxMode === 'outbox') {
        this.outboxState = 'committed';
      }
    }
    if (index >= 3) {
      this.processState = 'Đã dừng';
      this.eventState = this.outboxMode === 'direct' ? 'Bị mất' : 'Đang chờ trong Outbox';
    }
    if (this.outboxMode === 'outbox' && index >= 4) {
      this.processState = 'Relay đang chạy';
    }
    if (this.outboxMode === 'outbox' && index >= 5) {
      this.eventState = 'Đã publish';
      this.deliveryCount = 1;
    }
    if (this.outboxMode === 'outbox' && index >= 6) {
      this.eventState = 'Đã publish 2 lần';
      this.deliveryCount = 2;
    }
    if (this.outboxMode === 'outbox' && index >= 7) {
      this.outboxState = 'committed';
      this.eventState = 'Đã publish · Outbox processed';
      this.consumerState = 'Áp dụng 1 lần · bỏ qua duplicate';
    }
  }
}
