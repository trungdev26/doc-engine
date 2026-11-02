import { Component, OnDestroy } from '@angular/core';

type SimulationMode = 'scan' | 'seek' | 'lookup';

interface ModeOption {
  id: SimulationMode;
  label: string;
  description: string;
}

interface TreeNode {
  id: string;
  title: string;
  keys: string;
  x: number;
  y: number;
  width: number;
  kind: 'root' | 'branch' | 'leaf';
}

interface TreeEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DataPage {
  id: number;
  values: number[];
}

interface SimulationStep {
  title: string;
  detail: string;
  activeNodeId: string | null;
  activePageId: number | null;
  activeValue: number | null;
  visitedNodeIds: string[];
  visitedPageIds: number[];
  pagesRead: number;
  rowsExamined: number;
  lookups: number;
  found: boolean;
}

const PAGE_SIZE = 4;
const MAX_KEY = 32;

@Component({
  selector: 'app-index-demo',
  templateUrl: './index-demo.component.html',
  styleUrls: ['./index-demo.component.scss'],
})
export class IndexDemoComponent implements OnDestroy {
  readonly modes: ModeOption[] = [
    {
      id: 'scan',
      label: 'Table Scan',
      description: 'Đọc tuần tự từng page và kiểm tra từng row cho tới khi tìm thấy khóa.',
    },
    {
      id: 'seek',
      label: 'B+Tree Index Seek',
      description: 'Đi từ Root qua Branch tới Leaf Page chứa vùng khóa cần tìm.',
    },
    {
      id: 'lookup',
      label: 'Key Lookup',
      description: 'Đọc Nonclustered Index rồi quay về Data Page để lấy cột còn thiếu.',
    },
  ];

  readonly dataPages: DataPage[] = Array.from({ length: MAX_KEY / PAGE_SIZE }, (_, pageIndex) => ({
    id: pageIndex + 1,
    values: Array.from(
      { length: PAGE_SIZE },
      (_, rowIndex) => pageIndex * PAGE_SIZE + rowIndex + 1,
    ),
  }));

  readonly treeNodes: TreeNode[] = [
    { id: 'root', title: 'Root', keys: '17', x: 430, y: 18, width: 140, kind: 'root' },
    {
      id: 'branch-left',
      title: 'Branch',
      keys: '5 · 9 · 13',
      x: 190,
      y: 120,
      width: 180,
      kind: 'branch',
    },
    {
      id: 'branch-right',
      title: 'Branch',
      keys: '21 · 25 · 29',
      x: 630,
      y: 120,
      width: 180,
      kind: 'branch',
    },
    { id: 'leaf-1', title: 'Leaf P1', keys: '1–4', x: 18, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-2', title: 'Leaf P2', keys: '5–8', x: 141, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-3', title: 'Leaf P3', keys: '9–12', x: 264, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-4', title: 'Leaf P4', keys: '13–16', x: 387, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-5', title: 'Leaf P5', keys: '17–20', x: 510, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-6', title: 'Leaf P6', keys: '21–24', x: 633, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-7', title: 'Leaf P7', keys: '25–28', x: 756, y: 244, width: 104, kind: 'leaf' },
    { id: 'leaf-8', title: 'Leaf P8', keys: '29–32', x: 879, y: 244, width: 104, kind: 'leaf' },
  ];

  readonly treeEdges: TreeEdge[] = [
    { from: 'root', to: 'branch-left', x1: 500, y1: 78, x2: 280, y2: 120 },
    { from: 'root', to: 'branch-right', x1: 500, y1: 78, x2: 720, y2: 120 },
    { from: 'branch-left', to: 'leaf-1', x1: 280, y1: 180, x2: 70, y2: 244 },
    { from: 'branch-left', to: 'leaf-2', x1: 280, y1: 180, x2: 193, y2: 244 },
    { from: 'branch-left', to: 'leaf-3', x1: 280, y1: 180, x2: 316, y2: 244 },
    { from: 'branch-left', to: 'leaf-4', x1: 280, y1: 180, x2: 439, y2: 244 },
    { from: 'branch-right', to: 'leaf-5', x1: 720, y1: 180, x2: 562, y2: 244 },
    { from: 'branch-right', to: 'leaf-6', x1: 720, y1: 180, x2: 685, y2: 244 },
    { from: 'branch-right', to: 'leaf-7', x1: 720, y1: 180, x2: 808, y2: 244 },
    { from: 'branch-right', to: 'leaf-8', x1: 720, y1: 180, x2: 931, y2: 244 },
  ];

  activeMode: SimulationMode = 'seek';
  targetKey = 27;
  coveringIndex = false;
  speedMs = 700;
  currentStepIndex = -1;
  steps: SimulationStep[] = [];
  isPlaying = false;

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.rebuild();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  get currentStep(): SimulationStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  get pagesRead(): number {
    return this.currentStep?.pagesRead ?? 0;
  }

  get rowsExamined(): number {
    return this.currentStep?.rowsExamined ?? 0;
  }

  get lookups(): number {
    return this.currentStep?.lookups ?? 0;
  }

  get progressPercent(): number {
    return this.steps.length ? ((this.currentStepIndex + 1) / this.steps.length) * 100 : 0;
  }

  get queryText(): string {
    if (this.activeMode === 'lookup') {
      return `SELECT Id, Status, TotalAmount FROM Orders WHERE Id = ${this.targetKey};`;
    }
    return `SELECT * FROM Orders WHERE Id = ${this.targetKey};`;
  }

  get indexDefinition(): string {
    return this.coveringIndex
      ? 'IX_Orders_Id INCLUDE (Status, TotalAmount)'
      : 'IX_Orders_Id → row locator';
  }

  selectMode(mode: SimulationMode): void {
    if (this.activeMode === mode) {
      return;
    }
    this.activeMode = mode;
    this.rebuild();
  }

  setTarget(value: number): void {
    const normalized = Math.max(1, Math.min(MAX_KEY, Math.round(value || 1)));
    this.targetKey = normalized;
    this.rebuild();
  }

  setCoveringIndex(enabled: boolean): void {
    this.coveringIndex = enabled;
    this.rebuild();
  }

  setSpeed(ms: number): void {
    this.speedMs = ms;
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
      return;
    }
    this.currentStepIndex += 1;
  }

  reset(): void {
    this.stop();
    this.currentStepIndex = -1;
  }

  isNodeActive(nodeId: string): boolean {
    return this.currentStep?.activeNodeId === nodeId;
  }

  isNodeVisited(nodeId: string): boolean {
    return this.currentStep?.visitedNodeIds.includes(nodeId) ?? false;
  }

  isEdgeVisited(edge: TreeEdge): boolean {
    const visited = this.currentStep?.visitedNodeIds ?? [];
    return visited.includes(edge.from) && visited.includes(edge.to);
  }

  isPageActive(pageId: number): boolean {
    return this.currentStep?.activePageId === pageId;
  }

  isPageVisited(pageId: number): boolean {
    return this.currentStep?.visitedPageIds.includes(pageId) ?? false;
  }

  isValueActive(value: number): boolean {
    return this.currentStep?.activeValue === value;
  }

  trackById(_index: number, item: { id: number | string }): number | string {
    return item.id;
  }

  trackByValue(_index: number, value: number): number {
    return value;
  }

  private rebuild(): void {
    this.stop();
    this.steps = this.buildSteps();
    this.currentStepIndex = -1;
  }

  private play(): void {
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.currentStepIndex = -1;
    }
    this.isPlaying = true;
    this.advanceAutomatically();
    this.timer = setInterval(() => this.advanceAutomatically(), this.speedMs);
  }

  private advanceAutomatically(): void {
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.stop();
      return;
    }
    this.currentStepIndex += 1;
    if (this.currentStepIndex >= this.steps.length - 1) {
      this.stop();
    }
  }

  private stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildSteps(): SimulationStep[] {
    switch (this.activeMode) {
      case 'scan':
        return this.buildScanSteps();
      case 'lookup':
        return this.buildTreeSteps(true);
      case 'seek':
      default:
        return this.buildTreeSteps(false);
    }
  }

  private buildScanSteps(): SimulationStep[] {
    const steps: SimulationStep[] = [];
    const visitedPages: number[] = [];

    for (let value = 1; value <= this.targetKey; value += 1) {
      const pageId = Math.ceil(value / PAGE_SIZE);
      if (!visitedPages.includes(pageId)) {
        visitedPages.push(pageId);
      }
      const found = value === this.targetKey;
      steps.push({
        title: found ? `Tìm thấy Id = ${value}` : `Kiểm tra Id = ${value}`,
        detail: found
          ? `Table Scan dừng tại Data Page ${pageId} sau khi đã kiểm tra ${value} row.`
          : `Row không khớp predicate; tiếp tục đọc tuần tự trong Data Page ${pageId}.`,
        activeNodeId: null,
        activePageId: pageId,
        activeValue: value,
        visitedNodeIds: [],
        visitedPageIds: [...visitedPages],
        pagesRead: visitedPages.length,
        rowsExamined: value,
        lookups: 0,
        found,
      });
    }

    return steps;
  }

  private buildTreeSteps(includeLookup: boolean): SimulationStep[] {
    const pageId = Math.ceil(this.targetKey / PAGE_SIZE);
    const branchId = this.targetKey < 17 ? 'branch-left' : 'branch-right';
    const leafId = `leaf-${pageId}`;
    const leafOffset = ((this.targetKey - 1) % PAGE_SIZE) + 1;
    const visitedNodes: string[] = [];
    const visitedPages: number[] = [];
    const steps: SimulationStep[] = [];

    visitedNodes.push('root');
    steps.push({
      title: 'Đọc Root Page',
      detail:
        this.targetKey < 17
          ? `${this.targetKey} < 17, chọn nhánh bên trái.`
          : `${this.targetKey} ≥ 17, chọn nhánh bên phải.`,
      activeNodeId: 'root',
      activePageId: null,
      activeValue: null,
      visitedNodeIds: [...visitedNodes],
      visitedPageIds: [],
      pagesRead: 1,
      rowsExamined: 0,
      lookups: 0,
      found: false,
    });

    visitedNodes.push(branchId);
    steps.push({
      title: 'Đọc Branch Page',
      detail: `So sánh với các separator key để xác định Leaf Page ${pageId}.`,
      activeNodeId: branchId,
      activePageId: null,
      activeValue: null,
      visitedNodeIds: [...visitedNodes],
      visitedPageIds: [],
      pagesRead: 2,
      rowsExamined: 0,
      lookups: 0,
      found: false,
    });

    visitedNodes.push(leafId);
    steps.push({
      title: `Đọc Leaf Page ${pageId}`,
      detail: `Tìm khóa ${this.targetKey} tại vị trí ${leafOffset} trong Leaf Page.`,
      activeNodeId: leafId,
      activePageId: includeLookup ? null : pageId,
      activeValue: this.targetKey,
      visitedNodeIds: [...visitedNodes],
      visitedPageIds: includeLookup ? [] : [pageId],
      pagesRead: 3,
      rowsExamined: leafOffset,
      lookups: 0,
      found: !includeLookup || this.coveringIndex,
    });

    if (includeLookup && !this.coveringIndex) {
      steps.push({
        title: 'Đọc Row Locator',
        detail: `Nonclustered Index chỉ chứa khóa và locator; các cột Status, TotalAmount chưa có trong Leaf Page.`,
        activeNodeId: leafId,
        activePageId: null,
        activeValue: this.targetKey,
        visitedNodeIds: [...visitedNodes],
        visitedPageIds: [],
        pagesRead: 3,
        rowsExamined: leafOffset,
        lookups: 1,
        found: false,
      });

      visitedPages.push(pageId);
      steps.push({
        title: `Key Lookup tới Data Page ${pageId}`,
        detail: `Database dùng row locator để đọc Data Page và lấy Status, TotalAmount.`,
        activeNodeId: leafId,
        activePageId: pageId,
        activeValue: this.targetKey,
        visitedNodeIds: [...visitedNodes],
        visitedPageIds: [...visitedPages],
        pagesRead: 4,
        rowsExamined: leafOffset,
        lookups: 1,
        found: true,
      });
    }

    if (includeLookup && this.coveringIndex) {
      steps[steps.length - 1] = {
        ...steps[steps.length - 1],
        title: 'Trả kết quả trực tiếp từ Index',
        detail: `Included Columns đã chứa Status và TotalAmount; không phát sinh Key Lookup tới Data Page.`,
        found: true,
      };
    }

    return steps;
  }
}
