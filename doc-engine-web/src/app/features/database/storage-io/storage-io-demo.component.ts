import { Component, OnDestroy } from '@angular/core';

type LabId = 'read' | 'pressure' | 'write';
type ReadMode = 'cold' | 'warm';
type PressurePattern = 'fits' | 'exceeds' | 'report';
type PageState = 'normal' | 'active' | 'loaded' | 'dirty' | 'evicted';

interface LabOption {
  id: LabId;
  label: string;
  description: string;
  caseTitle: string;
  context: string;
  symptom: string;
  question: string;
  query: string;
}

interface Fact {
  label: string;
  value: string;
}

interface SimulationStep {
  title: string;
  detail: string;
  activeNodes: string[];
}

interface BufferFrame {
  pageId: number | null;
  state: PageState;
}

interface AccessResult {
  pageId: number;
  hit: boolean;
  evictedPageId: number | null;
}

@Component({
  selector: 'app-storage-io-demo',
  templateUrl: './storage-io-demo.component.html',
  styleUrls: ['./storage-io-demo.component.scss'],
})
export class StorageIoDemoComponent implements OnDestroy {
  readonly labs: LabOption[] = [
    {
      id: 'read',
      label: 'Read Path',
      description: 'Theo một page từ câu query đến RAM, storage và CPU.',
      caseTitle: 'API đọc chi tiết đơn hàng',
      context:
        'API tìm OrderId 4201. Row này nằm cùng nhiều row khác trong một khối dữ liệu mà mô hình đặt tên là Page #42. Buffer Pool chỉ giữ bản sao các page đã được nạp vào RAM.',
      symptom:
        'Lần gọi đầu chậm hơn rõ rệt, các lần gọi ngay sau đó nhanh dù câu SQL và execution plan không thay đổi.',
      question:
        'Physical read phát sinh ở bước nào, và vì sao cùng một logical read có thể có latency rất khác nhau?',
      query: 'SELECT * FROM Orders WHERE OrderId = 4201;  -- Page #42',
    },
    {
      id: 'pressure',
      label: 'Cache Pressure',
      description: 'Quan sát working set, cache hit và LRU eviction.',
      caseTitle: 'Report làm nguội cache của API',
      context:
        'API thường xuyên đọc ba page chứa đơn hàng mới. Buffer Pool minh họa chỉ có vài frame. Report lịch sử quét một nhóm page lạnh và có thể thay thế các hot page.',
      symptom:
        'Sau khi report chạy xong, API không đổi code nhưng Physical Reads tăng mạnh trong một khoảng ngắn.',
      question:
        'Working set nào vượt sức chứa Buffer Pool, page nào bị eviction và vì sao hit ratio giảm?',
      query: 'API: Page #1–#3  |  Report: quét Page #20–#25',
    },
    {
      id: 'write',
      label: 'Write Path',
      description: 'Phân biệt Dirty Page, WAL flush và data-page flush.',
      caseTitle: 'COMMIT thành công khi data page chưa xuống đĩa',
      context:
        'Transaction cập nhật Account Id 17. Row này nằm trong Page #7 đang có ở Buffer Pool. Database dùng Write-Ahead Logging để bảo đảm có thể phục hồi thay đổi sau sự cố.',
      symptom:
        'Ứng dụng nhận COMMIT thành công, nhưng công cụ quan sát cho thấy Page #7 vẫn là Dirty Page trong RAM.',
      question: 'Database có thể xác nhận COMMIT ở đâu, và checkpoint khác WAL flush như thế nào?',
      query: 'UPDATE Accounts SET Balance = Balance - 500 WHERE Id = 17;',
    },
  ];

  activeLab: LabId = 'read';
  readMode: ReadMode = 'cold';
  pressurePattern: PressurePattern = 'report';
  bufferCapacity = 4;
  speedMs = 900;

  steps: SimulationStep[] = [];
  currentStepIndex = -1;
  isPlaying = false;
  activeNodes: string[] = [];

  frames: BufferFrame[] = [];
  accessHistory: AccessResult[] = [];
  currentPageId: number | null = null;
  currentAccess: 'hit' | 'miss' | null = null;
  evictedPageId: number | null = null;

  logicalReads = 0;
  physicalReads = 0;
  evictions = 0;

  walBuffered = false;
  walDurable = false;
  commitAcknowledged = false;
  dataPageDurable = false;

  private recency: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.reset();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  get activeLabInfo(): LabOption {
    return this.labs.find(lab => lab.id === this.activeLab)!;
  }

  get labNumber(): number {
    return this.labs.findIndex(lab => lab.id === this.activeLab) + 1;
  }

  get currentStep(): SimulationStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  get progressPercent(): number {
    return this.steps.length ? ((this.currentStepIndex + 1) / this.steps.length) * 100 : 0;
  }

  get hitCount(): number {
    return this.logicalReads - this.physicalReads;
  }

  get hitRatio(): number {
    return this.logicalReads ? (this.hitCount / this.logicalReads) * 100 : 0;
  }

  get dirtyPageCount(): number {
    return this.frames.filter(frame => frame.state === 'dirty').length;
  }

  get scenarioFacts(): Fact[] {
    switch (this.activeLab) {
      case 'pressure':
        return [
          { label: 'Buffer Pool', value: `${this.bufferCapacity} frames` },
          { label: 'Chính sách', value: 'LRU minh họa' },
          { label: 'Chuỗi truy cập', value: `${this.pressureSequence.length} pages` },
        ];
      case 'write':
        return [
          { label: 'Page mục tiêu', value: '#7 · đang ở RAM' },
          { label: 'Cơ chế bền vững', value: 'Write-Ahead Log' },
          { label: 'Flush data page', value: 'Checkpoint / background writer' },
        ];
      case 'read':
      default:
        return [
          { label: 'Page mục tiêu', value: '#42' },
          {
            label: 'Trạng thái đầu',
            value: this.readMode === 'cold' ? 'Không có trong RAM' : 'Đã có trong RAM',
          },
          { label: 'Yêu cầu của query', value: '1 logical read' },
        ];
    }
  }

  get pressureSequence(): number[] {
    switch (this.pressurePattern) {
      case 'fits':
        return [1, 2, 3, 1, 2, 3, 1, 2, 3];
      case 'exceeds':
        return [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6];
      case 'report':
      default:
        return [1, 2, 3, 1, 2, 3, 20, 21, 22, 23, 24, 25, 1, 2, 3];
    }
  }

  selectLab(lab: LabId): void {
    if (lab === this.activeLab) {
      return;
    }
    this.activeLab = lab;
    this.reset();
  }

  setReadMode(mode: ReadMode): void {
    this.readMode = mode;
    this.reset();
  }

  setPressurePattern(pattern: PressurePattern): void {
    this.pressurePattern = pattern;
    this.reset();
  }

  setCapacity(capacity: number): void {
    this.bufferCapacity = capacity;
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

  isNodeActive(nodeId: string): boolean {
    return this.activeNodes.includes(nodeId);
  }

  pageMeaning(pageId: number | null): string {
    if (pageId === null) {
      return 'Chưa chứa page';
    }

    if (this.activeLab === 'read') {
      return pageId === 42 ? 'Orders · chứa OrderId 4201' : 'Dữ liệu khác đã cache';
    }

    if (this.activeLab === 'write') {
      return pageId === 7 ? 'Accounts · chứa Account Id 17' : 'Dữ liệu khác đã cache';
    }

    if (pageId >= 1 && pageId <= 3) {
      return `Đơn hàng mới · nhóm ${String.fromCharCode(64 + pageId)}`;
    }
    if (pageId >= 20 && pageId <= 25) {
      return 'Đơn hàng lịch sử · report';
    }
    return 'Dữ liệu mở rộng của workload';
  }

  trackByIndex(index: number): number {
    return index;
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
    this.initializeRuntimeState();
    this.currentStepIndex = Math.max(-1, Math.min(stepIndex, this.steps.length - 1));

    for (let index = 0; index <= this.currentStepIndex; index += 1) {
      this.applyStep(index);
    }

    this.activeNodes = this.currentStep?.activeNodes ?? [];
  }

  private initializeRuntimeState(): void {
    this.activeNodes = [];
    this.accessHistory = [];
    this.currentPageId = null;
    this.currentAccess = null;
    this.evictedPageId = null;
    this.logicalReads = 0;
    this.physicalReads = 0;
    this.evictions = 0;
    this.walBuffered = false;
    this.walDurable = false;
    this.commitAcknowledged = false;
    this.dataPageDurable = false;
    this.recency = [];

    if (this.activeLab === 'read') {
      const initialPages = this.readMode === 'warm' ? [11, 42, 18, null] : [11, 18, null, null];
      this.frames = initialPages.map(pageId => ({ pageId, state: 'normal' }));
      this.recency = initialPages.filter((pageId): pageId is number => pageId !== null);
      return;
    }

    if (this.activeLab === 'write') {
      this.frames = [
        { pageId: 3, state: 'normal' },
        { pageId: 7, state: 'normal' },
        { pageId: 11, state: 'normal' },
        { pageId: null, state: 'normal' },
      ];
      this.recency = [7, 3, 11];
      return;
    }

    this.frames = Array.from({ length: this.bufferCapacity }, () => ({
      pageId: null,
      state: 'normal',
    }));
  }

  private buildSteps(): SimulationStep[] {
    switch (this.activeLab) {
      case 'pressure':
        return this.pressureSequence.map((pageId, index) => ({
          title: `Truy cập ${index + 1}: Page #${pageId} · ${this.pageMeaning(pageId)}`,
          detail:
            'Buffer Manager kiểm tra page trong các frame; nếu miss, page mới được nạp và frame ít dùng gần đây nhất có thể bị thay thế.',
          activeNodes: ['query', 'buffer', 'storage'],
        }));
      case 'write':
        return [
          {
            title: 'Ứng dụng gửi lệnh UPDATE',
            detail: 'Transaction yêu cầu thay đổi dữ liệu thuộc Page #7.',
            activeNodes: ['query'],
          },
          {
            title: 'Buffer Manager tìm Page #7',
            detail: 'Page đã ở Buffer Pool, nên đây là cache hit và không cần physical read.',
            activeNodes: ['query', 'buffer'],
          },
          {
            title: 'Thay đổi bản sao trong RAM',
            detail:
              'Database sửa Page #7 trong Buffer Pool và đánh dấu Dirty. Data file lúc này vẫn chứa phiên bản cũ.',
            activeNodes: ['buffer'],
          },
          {
            title: 'Ghi log record vào WAL Buffer',
            detail:
              'Log record mô tả thay đổi được tạo trước khi data page được phép ghi xuống data file.',
            activeNodes: ['buffer', 'wal-buffer'],
          },
          {
            title: 'Flush WAL xuống log file',
            detail:
              'Log record được ghi bền vững. Recovery có đủ thông tin để redo thay đổi nếu tiến trình dừng đột ngột.',
            activeNodes: ['wal-buffer', 'wal-file'],
          },
          {
            title: 'Xác nhận COMMIT cho ứng dụng',
            detail:
              'COMMIT có thể được xác nhận sau khi WAL bền vững; Dirty Page chưa bắt buộc phải xuống data file.',
            activeNodes: ['wal-file', 'query'],
          },
          {
            title: 'Checkpoint flush Dirty Page',
            detail:
              'Background writer hoặc checkpoint ghi Page #7 xuống data file và page trở lại trạng thái clean.',
            activeNodes: ['buffer', 'data-file'],
          },
        ];
      case 'read':
      default:
        if (this.readMode === 'warm') {
          return [
            {
              title: 'Query yêu cầu Page #42',
              detail:
                'Execution engine phát sinh một logical read: yêu cầu truy cập một page logic.',
              activeNodes: ['query'],
            },
            {
              title: 'Buffer Pool tìm thấy Page #42',
              detail: 'Page đã có trong RAM. Đây là cache hit nên không phát sinh physical read.',
              activeNodes: ['query', 'buffer'],
            },
            {
              title: 'CPU đọc row và trả kết quả',
              detail: 'Execution engine đọc dữ liệu từ frame trong RAM rồi hoàn thành operator.',
              activeNodes: ['buffer', 'cpu'],
            },
          ];
        }
        return [
          {
            title: 'Query yêu cầu Page #42',
            detail: 'Execution engine phát sinh một logical read: yêu cầu truy cập một page logic.',
            activeNodes: ['query'],
          },
          {
            title: 'Buffer Pool không có Page #42',
            detail: 'Tra cứu page table thất bại. Cache miss buộc Buffer Manager yêu cầu I/O.',
            activeNodes: ['query', 'buffer'],
          },
          {
            title: 'Storage đọc Page #42',
            detail:
              'Một physical read lấy page từ data file. Đây thường là phần có latency lớn nhất của read path.',
            activeNodes: ['buffer', 'storage'],
          },
          {
            title: 'Page #42 được nạp vào một frame',
            detail:
              'Buffer Pool giữ bản sao của page trong RAM để các lần truy cập sau có thể cache hit.',
            activeNodes: ['storage', 'buffer'],
          },
          {
            title: 'CPU đọc row và trả kết quả',
            detail: 'Execution engine đọc dữ liệu từ frame trong RAM rồi hoàn thành operator.',
            activeNodes: ['buffer', 'cpu'],
          },
        ];
    }
  }

  private applyStep(index: number): void {
    if (this.activeLab === 'pressure') {
      this.applyPressureAccess(this.pressureSequence[index]);
      return;
    }

    if (this.activeLab === 'read') {
      this.applyReadStep(index);
      return;
    }

    this.applyWriteStep(index);
  }

  private applyReadStep(index: number): void {
    this.currentPageId = 42;

    if (this.readMode === 'warm') {
      if (index >= 1) {
        this.logicalReads = 1;
        this.currentAccess = 'hit';
        this.setFrameState(42, 'active');
      }
      return;
    }

    if (index >= 1) {
      this.logicalReads = 1;
      this.currentAccess = 'miss';
    }
    if (index >= 2) {
      this.physicalReads = 1;
    }
    if (index >= 3) {
      const emptyFrame = this.frames.find(frame => frame.pageId === null);
      if (emptyFrame) {
        emptyFrame.pageId = 42;
        emptyFrame.state = index === 3 ? 'loaded' : 'active';
      }
    }
  }

  private applyPressureAccess(pageId: number): void {
    this.frames.forEach(frame => (frame.state = 'normal'));
    this.currentPageId = pageId;
    this.logicalReads += 1;

    const recencyIndex = this.recency.indexOf(pageId);
    const hit = recencyIndex >= 0;
    let evictedPageId: number | null = null;

    if (hit) {
      this.recency.splice(recencyIndex, 1);
      this.recency.unshift(pageId);
      this.currentAccess = 'hit';
      this.setFrameState(pageId, 'active');
    } else {
      this.physicalReads += 1;
      this.currentAccess = 'miss';

      if (this.recency.length >= this.bufferCapacity) {
        evictedPageId = this.recency.pop() ?? null;
        if (evictedPageId !== null) {
          this.evictions += 1;
        }
      }

      const targetFrame =
        this.frames.find(frame => frame.pageId === evictedPageId) ??
        this.frames.find(frame => frame.pageId === null);
      if (targetFrame) {
        targetFrame.pageId = pageId;
        targetFrame.state = 'loaded';
      }
      this.recency.unshift(pageId);
    }

    this.evictedPageId = evictedPageId;
    this.accessHistory.push({ pageId, hit, evictedPageId });
  }

  private applyWriteStep(index: number): void {
    this.currentPageId = 7;
    if (index >= 1) {
      this.logicalReads = 1;
      this.currentAccess = 'hit';
      this.setFrameState(7, index >= 2 && index < 6 ? 'dirty' : 'active');
    }
    if (index >= 3) {
      this.walBuffered = true;
    }
    if (index >= 4) {
      this.walDurable = true;
    }
    if (index >= 5) {
      this.commitAcknowledged = true;
    }
    if (index >= 6) {
      this.dataPageDurable = true;
      this.setFrameState(7, 'active');
    }
  }

  private setFrameState(pageId: number, state: PageState): void {
    const frame = this.frames.find(item => item.pageId === pageId);
    if (frame) {
      frame.state = state;
    }
  }
}
