import { Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { StepHistoryEntry } from '../shared/step-history/step-history.component';

type AnomalyId = 'dirty-read' | 'non-repeatable' | 'phantom' | 'write-skew';
type ProtectionMode = 'exposed' | 'protected';
type StepActor = 't1' | 'database' | 't2';

interface AnomalyLab {
  id: AnomalyId;
  label: string;
  description: string;
  caseTitle: string;
  context: string;
  symptom: string;
  question: string;
  exposedLabel: string;
  protectedLabel: string;
}

interface AnomalyStep {
  title: string;
  detail: string;
  actor: StepActor;
  action: string;
}

@Component({
  selector: 'app-isolation-anomalies-demo',
  templateUrl: './isolation-anomalies-demo.component.html',
  styleUrls: ['./isolation-anomalies-demo.component.scss'],
})
export class IsolationAnomaliesDemoComponent implements OnDestroy {
  readonly labs: AnomalyLab[] = [
    {
      id: 'dirty-read',
      label: 'Dirty Read',
      description: 'T2 đọc một write của T1 khi write đó chưa commit.',
      caseTitle: 'Risk engine đọc số dư đang được điều chỉnh',
      context:
        'Balance committed là 100. T1 tạm cập nhật xuống 50 nhưng chưa commit; T2 đồng thời đọc Balance để quyết định hạn mức.',
      symptom:
        'T2 đưa ra quyết định từ giá trị 50, sau đó T1 rollback và database trở lại 100. Giá trị T2 đã dùng chưa từng trở thành committed.',
      question:
        'Isolation phải chặn observation nào để dữ liệu rollback không thoát khỏi transaction?',
      exposedLabel: 'Read Uncommitted',
      protectedLabel: 'Read Committed',
    },
    {
      id: 'non-repeatable',
      label: 'Non-repeatable Read',
      description: 'Cùng một row trả về hai giá trị khác nhau trong một transaction.',
      caseTitle: 'Pricing job đọc lại cùng một Product',
      context:
        'T1 đọc Product #42 có Price = 100 để tính báo giá. Trước lần đọc thứ hai, T2 cập nhật Price = 120 và commit.',
      symptom:
        'Hai phép đọc cùng Row ID trong một transaction trả về 100 rồi 120, làm kết quả tính toán không dựa trên một view ổn định.',
      question:
        'Database phải giữ row lock hay snapshot nào để lần đọc sau còn thấy cùng một version?',
      exposedLabel: 'Read Committed',
      protectedLabel: 'Repeatable Read / Snapshot',
    },
    {
      id: 'phantom',
      label: 'Phantom Read',
      description: 'Cùng một predicate query trả về tập row khác nhau.',
      caseTitle: 'Batch job đếm Order đang OPEN',
      context:
        'T1 chạy SELECT theo predicate Status = OPEN và thấy hai Order. T2 chèn thêm một Order OPEN rồi commit.',
      symptom:
        'T1 chạy lại đúng predicate nhưng thấy ba row. Row mới không phải row cũ bị sửa mà là một phantom lọt vào tập kết quả.',
      question:
        'Bảo vệ từng row hiện có có đủ không, hay phải bảo vệ cả khoảng/predicate chưa có row?',
      exposedLabel: 'Predicate không được bảo vệ',
      protectedLabel: 'Serializable / Range Lock',
    },
    {
      id: 'write-skew',
      label: 'Write Skew',
      description: 'Hai transaction sửa hai row khác nhau nhưng cùng phá một invariant.',
      caseTitle: 'Hai bác sĩ cùng rời ca trực',
      context:
        'Doctor A và B đều đang on-call. Invariant yêu cầu luôn có ít nhất một người trực. Mỗi transaction đọc cả hai row rồi tắt row của chính mình.',
      symptom:
        'Hai write không đè nhau nên Snapshot Isolation có thể cho cả hai commit; kết quả không còn bác sĩ nào trực.',
      question:
        'Vì sao row-level write conflict không phát hiện được conflict trên predicate COUNT(on_call) ≥ 1?',
      exposedLabel: 'Snapshot Isolation',
      protectedLabel: 'Serializable / Predicate Validation',
    },
  ];

  activeLab: AnomalyId = 'dirty-read';
  mode: ProtectionMode = 'exposed';
  steps: AnomalyStep[] = [];
  currentStepIndex = -1;
  isPlaying = false;
  speedMs = 1000;

  t1State = 'Sẵn sàng';
  t2State = 'Sẵn sàng';
  balanceCommitted = 100;
  balancePending: number | null = null;
  t2ObservedBalance: number | null = null;
  priceCurrent = 100;
  firstPriceRead: number | null = null;
  secondPriceRead: number | null = null;
  orderIds = [101, 102];
  firstOrderCount: number | null = null;
  secondOrderCount: number | null = null;
  insertBlocked = false;
  doctorAOnCall = true;
  doctorBOnCall = true;
  serializationFailure = false;

  private timer: ReturnType<typeof setInterval> | null = null;
  private operationTokenElement: HTMLDivElement | null = null;
  private dataPanelElement: HTMLDivElement | null = null;
  private gsapApi: (typeof import('gsap'))['gsap'] | null = null;
  private animationVersion = 0;

  @ViewChild('operationToken')
  set operationToken(elementRef: ElementRef<HTMLDivElement> | undefined) {
    this.operationTokenElement = elementRef?.nativeElement ?? null;
    void this.animateStep(true);
  }

  @ViewChild('dataPanel')
  set dataPanel(elementRef: ElementRef<HTMLDivElement> | undefined) {
    this.dataPanelElement = elementRef?.nativeElement ?? null;
  }

  constructor() {
    this.reset();
  }

  ngOnDestroy(): void {
    this.stop();
    this.animationVersion += 1;
    this.gsapApi?.killTweensOf([this.operationTokenElement, this.dataPanelElement]);
  }

  get activeLabInfo(): AnomalyLab {
    return this.labs.find(lab => lab.id === this.activeLab)!;
  }

  get currentStep(): AnomalyStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  get executedStepLog(): StepHistoryEntry[] {
    if (this.currentStepIndex < 0) return [];

    return this.steps.slice(0, this.currentStepIndex + 1).map(step => ({
      actor:
        step.actor === 't1'
          ? 'Transaction T1'
          : step.actor === 't2'
            ? 'Transaction T2'
            : 'Shared Data',
      operation: step.action,
      title: step.title,
      note: step.detail,
      tone: step.actor === 't1' ? 'primary' : step.actor === 't2' ? 'secondary' : 'neutral',
    }));
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.steps.length) * 100;
  }

  get onCallCount(): number {
    return Number(this.doctorAOnCall) + Number(this.doctorBOnCall);
  }

  get verdictTitle(): string {
    if (this.currentStepIndex < this.steps.length - 1) return 'Chưa có kết quả cuối';
    if (this.mode === 'protected') {
      return this.activeLab === 'write-skew'
        ? 'Serialization failure bảo vệ invariant'
        : 'Transaction giữ được một view hợp lệ';
    }
    switch (this.activeLab) {
      case 'dirty-read':
        return 'T2 đã sử dụng dữ liệu chưa từng commit';
      case 'non-repeatable':
        return 'Cùng một row trả về hai version';
      case 'phantom':
        return 'Predicate xuất hiện thêm phantom row';
      case 'write-skew':
        return 'Invariant COUNT(on_call) ≥ 1 bị phá';
    }
  }

  get verdictDetail(): string {
    if (this.currentStepIndex < this.steps.length - 1) {
      return 'Chạy hết timeline để đối chiếu observation của T1/T2 với trạng thái committed.';
    }
    if (this.mode === 'protected') {
      switch (this.activeLab) {
        case 'dirty-read':
          return 'T2 chỉ quan sát Balance = 100 đã committed; write tạm của T1 không thoát khỏi boundary.';
        case 'non-repeatable':
          return 'T1 tiếp tục đọc version Price = 100 từ snapshot ổn định dù version mới đã commit.';
        case 'phantom':
          return 'Insert khớp predicate phải chờ range/predicate protection; tập kết quả của T1 vẫn có hai row.';
        case 'write-skew':
          return 'T2 bị abort khi database phát hiện dependency trên predicate on_call; ít nhất một bác sĩ vẫn trực.';
      }
    }
    switch (this.activeLab) {
      case 'dirty-read':
        return 'T2 đọc 50 rồi T1 rollback về 100; observation 50 không tồn tại trong lịch sử committed.';
      case 'non-repeatable':
        return 'T1 đọc Product #42 lần lượt là 100 và 120 trong cùng một transaction.';
      case 'phantom':
        return 'T2 chèn Order #103 nên cùng predicate của T1 tăng từ hai lên ba row.';
      case 'write-skew':
        return 'T1 và T2 ghi hai row khác nhau nên không có write-write conflict, nhưng tổng on-call giảm về 0.';
    }
  }

  selectLab(lab: AnomalyId): void {
    if (lab === this.activeLab) return;
    this.activeLab = lab;
    this.mode = 'exposed';
    this.reset();
  }

  setMode(mode: ProtectionMode): void {
    this.mode = mode;
    this.reset();
  }

  setSpeed(speedMs: number): void {
    this.speedMs = speedMs;
    if (this.isPlaying) {
      this.stop();
      this.play();
    }
  }

  nextStep(): void {
    this.stop();
    if (this.currentStepIndex >= this.steps.length - 1) this.reset();
    this.renderToStep(this.currentStepIndex + 1);
  }

  previousStep(): void {
    this.stop();
    this.renderToStep(this.currentStepIndex - 1);
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stop();
      return;
    }
    this.play();
  }

  reset(): void {
    this.stop();
    this.steps = this.buildSteps();
    this.renderToStep(-1);
  }

  private play(): void {
    if (this.currentStepIndex >= this.steps.length - 1) this.renderToStep(-1);
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
    for (let index = 0; index <= this.currentStepIndex; index += 1) this.applyStep(index);
    void this.animateStep(false);
  }

  private initializeRuntime(): void {
    this.t1State = 'Sẵn sàng';
    this.t2State = 'Sẵn sàng';
    this.balanceCommitted = 100;
    this.balancePending = null;
    this.t2ObservedBalance = null;
    this.priceCurrent = 100;
    this.firstPriceRead = null;
    this.secondPriceRead = null;
    this.orderIds = [101, 102];
    this.firstOrderCount = null;
    this.secondOrderCount = null;
    this.insertBlocked = false;
    this.doctorAOnCall = true;
    this.doctorBOnCall = true;
    this.serializationFailure = false;
  }

  private buildSteps(): AnomalyStep[] {
    switch (this.activeLab) {
      case 'dirty-read':
        return [
          {
            title: 'T1 ghi Balance = 50',
            detail: 'Write mới chỉ nằm trong transaction T1 và chưa phải committed state.',
            actor: 't1',
            action: 'WRITE 50',
          },
          {
            title: 'T2 đọc Balance',
            detail:
              this.mode === 'exposed'
                ? 'Read Uncommitted cho T2 nhìn thấy write tạm bằng 50.'
                : 'Read Committed không cho T2 nhìn write tạm; T2 đọc version committed bằng 100.',
            actor: 't2',
            action: 'READ',
          },
          {
            title: 'T1 rollback',
            detail: 'Write tạm bị loại bỏ và Balance committed vẫn bằng 100.',
            actor: 't1',
            action: 'ROLLBACK',
          },
          {
            title: 'Đối chiếu observation',
            detail: 'So sánh giá trị T2 đã dùng với lịch sử committed của database.',
            actor: 'database',
            action: 'VERIFY',
          },
        ];
      case 'non-repeatable':
        return [
          {
            title: 'T1 đọc Product #42 lần một',
            detail: 'T1 nhận Price = 100.',
            actor: 't1',
            action: 'READ #1',
          },
          {
            title: 'T2 cập nhật Price = 120 và commit',
            detail: 'Database có version committed mới của cùng Product #42.',
            actor: 't2',
            action: 'UPDATE 120',
          },
          {
            title: 'T1 đọc Product #42 lần hai',
            detail:
              this.mode === 'exposed'
                ? 'Read Committed lấy version mới nhất nên T1 nhận 120.'
                : 'Snapshot/Repeatable Read giữ view ban đầu nên T1 vẫn nhận 100.',
            actor: 't1',
            action: 'READ #2',
          },
          {
            title: 'So sánh hai lần đọc',
            detail: 'Hai observation phải được đánh giá trong cùng transaction T1.',
            actor: 'database',
            action: 'COMPARE',
          },
        ];
      case 'phantom':
        return [
          {
            title: 'T1 query Status = OPEN',
            detail: 'Predicate query trả về Order #101 và #102.',
            actor: 't1',
            action: 'COUNT #1',
          },
          {
            title: 'T2 insert Order #103 OPEN',
            detail:
              this.mode === 'exposed'
                ? 'Insert commit vì predicate chưa được bảo vệ.'
                : 'Range/predicate protection buộc insert khớp điều kiện phải chờ.',
            actor: 't2',
            action: 'INSERT',
          },
          {
            title: 'T1 chạy lại cùng predicate',
            detail:
              this.mode === 'exposed'
                ? 'Query lần hai thấy thêm Order #103.'
                : 'Tập kết quả của T1 vẫn chỉ có hai row.',
            actor: 't1',
            action: 'COUNT #2',
          },
          {
            title: 'Đối chiếu result set',
            detail:
              'Phantom là thay đổi tập row khớp predicate, không chỉ thay đổi giá trị một row.',
            actor: 'database',
            action: 'COMPARE',
          },
        ];
      case 'write-skew':
        return [
          {
            title: 'T1 và T2 đọc cùng snapshot',
            detail: 'Cả hai đều thấy Doctor A và B đang on-call nên cùng kết luận có thể rời ca.',
            actor: 'database',
            action: 'SNAPSHOT',
          },
          {
            title: 'T1 tắt on-call của Doctor A',
            detail: 'T1 chỉ ghi row A và chuẩn bị commit.',
            actor: 't1',
            action: 'A → OFF',
          },
          {
            title: 'T2 tắt on-call của Doctor B',
            detail:
              this.mode === 'exposed'
                ? 'T2 ghi row B; không có write-write conflict với T1 nên cả hai có thể commit.'
                : 'Serializable validation phát hiện dependency trên predicate và abort T2.',
            actor: 't2',
            action: this.mode === 'exposed' ? 'B → OFF' : 'ABORT T2',
          },
          {
            title: 'Kiểm tra invariant',
            detail: 'COUNT(Doctor WHERE on_call = true) phải luôn lớn hơn hoặc bằng 1.',
            actor: 'database',
            action: 'CHECK ≥ 1',
          },
        ];
    }
  }

  private applyStep(index: number): void {
    switch (this.activeLab) {
      case 'dirty-read':
        if (index >= 0) {
          this.balancePending = 50;
          this.t1State = 'Balance = 50 · chưa commit';
        }
        if (index >= 1) {
          this.t2ObservedBalance = this.mode === 'exposed' ? 50 : 100;
          this.t2State = `Đã đọc ${this.t2ObservedBalance}`;
        }
        if (index >= 2) {
          this.balancePending = null;
          this.t1State = 'Đã rollback';
        }
        break;
      case 'non-repeatable':
        if (index >= 0) {
          this.firstPriceRead = 100;
          this.t1State = 'Lần 1: Price = 100';
        }
        if (index >= 1) {
          this.priceCurrent = 120;
          this.t2State = 'Đã commit Price = 120';
        }
        if (index >= 2) {
          this.secondPriceRead = this.mode === 'exposed' ? 120 : 100;
          this.t1State = `Lần 2: Price = ${this.secondPriceRead}`;
        }
        break;
      case 'phantom':
        if (index >= 0) {
          this.firstOrderCount = 2;
          this.t1State = 'Lần 1: 2 rows';
        }
        if (index >= 1) {
          if (this.mode === 'exposed') {
            this.orderIds = [101, 102, 103];
            this.t2State = 'Đã commit Order #103';
          } else {
            this.insertBlocked = true;
            this.t2State = 'Insert đang chờ range lock';
          }
        }
        if (index >= 2) {
          this.secondOrderCount = this.mode === 'exposed' ? 3 : 2;
          this.t1State = `Lần 2: ${this.secondOrderCount} rows`;
        }
        break;
      case 'write-skew':
        if (index >= 0) {
          this.t1State = 'Snapshot: A ON · B ON';
          this.t2State = 'Snapshot: A ON · B ON';
        }
        if (index >= 1) {
          this.doctorAOnCall = false;
          this.t1State = 'Doctor A → OFF · commit';
        }
        if (index >= 2) {
          if (this.mode === 'exposed') {
            this.doctorBOnCall = false;
            this.t2State = 'Doctor B → OFF · commit';
          } else {
            this.serializationFailure = true;
            this.t2State = 'Serialization failure · rollback';
          }
        }
        break;
    }
  }

  private async animateStep(immediate: boolean): Promise<void> {
    if (!this.operationTokenElement) return;
    const version = ++this.animationVersion;
    const { gsap } = await import('gsap');
    if (version !== this.animationVersion || !this.operationTokenElement) return;
    this.gsapApi = gsap;

    const actor = this.currentStep?.actor ?? 'database';
    const left = actor === 't1' ? '14%' : actor === 't2' ? '86%' : '50%';
    const duration = immediate ? 0 : Math.min(Math.max(this.speedMs * 0.00055, 0.3), 0.75);
    gsap.to(this.operationTokenElement, {
      left,
      duration,
      ease: 'power2.inOut',
      overwrite: 'auto',
    });
    if (this.dataPanelElement && !immediate) {
      gsap.fromTo(
        this.dataPanelElement,
        { scale: 0.985 },
        { scale: 1, duration: 0.32, ease: 'power1.out', overwrite: 'auto' },
      );
    }
  }
}
