import { Component, OnDestroy } from '@angular/core';

type PlanScenario = 'access' | 'lookup' | 'cardinality' | 'spill';
type PlanNodeStatus = 'normal' | 'warning' | 'success';

interface ScenarioOption {
  id: PlanScenario;
  label: string;
  description: string;
  caseTitle: string;
  context: string;
  symptom: string;
  question: string;
}

interface ScenarioFact {
  label: string;
  value: string;
}

interface PlanNode {
  id: string;
  label: string;
  operation: string;
  estimatedRows: number;
  actualRows: number;
  costPercent: number;
  x: number;
  y: number;
  width: number;
  status: PlanNodeStatus;
  detail: string;
}

interface PlanEdge {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PlanMetrics {
  logicalReads: number;
  rowsReturned: number;
  lookupCount: number;
  spillMb: number;
  estimateRatio: number;
}

interface PlanModel {
  nodes: PlanNode[];
  edges: PlanEdge[];
  executionOrder: string[];
  metrics: PlanMetrics;
  decision: string;
  query: string;
  warning: string | null;
}

interface ExecutionStep {
  nodeId: string;
  title: string;
  detail: string;
  visitedNodeIds: string[];
}

const TABLE_ROWS = 1_000_000;
const ROWS_PER_PAGE = 100;
const JOIN_THRESHOLD = 5_000;

@Component({
  selector: 'app-execution-plan-demo',
  templateUrl: './execution-plan-demo.component.html',
  styleUrls: ['./execution-plan-demo.component.scss'],
})
export class ExecutionPlanDemoComponent implements OnDestroy {
  readonly scenarios: ScenarioOption[] = [
    {
      id: 'access',
      label: 'Access Path',
      description: 'Optimizer lựa chọn Index Lookup hay Table Scan theo selectivity.',
      caseTitle: 'API danh sách đơn hàng theo trạng thái',
      context:
        'Bảng Orders phục vụ màn hình vận hành. Cùng một câu SQL được dùng cho nhiều trạng thái có phân bố dữ liệu rất khác nhau.',
      symptom:
        'Trạng thái Pending trả ít row và chạy nhanh, nhưng Completed trả phần lớn bảng và có lúc optimizer vẫn chọn access path không phù hợp.',
      question:
        'Khi nào Index Lookup còn rẻ hơn Table Scan, và vì sao có Index không đồng nghĩa optimizer luôn sử dụng Index?',
    },
    {
      id: 'lookup',
      label: 'Table Lookup',
      description: 'Lookup ít có lợi, lookup nhiều có thể trở thành operator đắt nhất.',
      caseTitle: 'Màn hình lịch sử đơn hàng theo khách hàng',
      context:
        'Index trên khachHangId định vị đơn hàng nhanh nhưng không chứa trangThai và tongTien mà API cần trả về.',
      symptom:
        'Khách hàng ít đơn chạy nhanh. Khách hàng lớn tạo hàng nghìn Table Lookup, khiến operator tưởng nhỏ trở thành phần tốn I/O nhất plan.',
      question:
        'Lookup count bao nhiêu bắt đầu trở nên nguy hiểm, và Covering Index loại bỏ lookup với chi phí ghi như thế nào?',
    },
    {
      id: 'cardinality',
      label: 'Cardinality & Join',
      description: 'Estimate sai làm Nested Loop hoặc Hash Join được chọn không phù hợp.',
      caseTitle: 'Tenant lớn tái sử dụng plan của tenant nhỏ',
      context:
        'Một query join Orders với Customers dùng chung plan cache. Statistics hoặc parameter ban đầu khiến optimizer ước lượng số row rất thấp.',
      symptom:
        'Plan chọn Nested Loop theo estimate 1.000 row nhưng tenant lớn trả 50.000 row, làm số iteration và lượng dữ liệu đọc tăng mạnh.',
      question:
        'Độ lệch Estimated Rows và Actual Rows đã làm thay đổi join strategy ra sao, và cần kiểm tra Statistics hay Data Skew ở đâu?',
    },
    {
      id: 'spill',
      label: 'Memory Spill',
      description: 'Sort vượt Memory Budget phải ghi dữ liệu tạm xuống storage.',
      caseTitle: 'Báo cáo đơn hàng phải sắp xếp tập dữ liệu lớn',
      context:
        'Query báo cáo ORDER BY CreatedAt không nhận được thứ tự sẵn có từ Index nên cần Sort toàn bộ tập kết quả trong bộ nhớ.',
      symptom:
        'Memory Budget thấp hơn lượng dữ liệu thực tế. Sort ghi phần vượt quá xuống storage tạm, làm latency và I/O tăng đột biến.',
      question:
        'Actual Rows, row width và Memory Budget kết hợp thế nào để tạo Spill, và thay đổi nào loại bỏ được temporary I/O?',
    },
  ];

  activeScenario: PlanScenario = 'access';

  hasIndex = true;
  selectivityPercent = 2;

  lookupRows = 500;
  coveringIndex = false;

  estimatedRows = 1_000;
  actualRows = 50_000;

  sortRows = 80_000;
  memoryGrantMb = 24;
  rowSizeKb = 1;

  speedMs = 850;
  currentStepIndex = -1;
  isPlaying = false;

  plan: PlanModel = this.buildPlan();
  steps: ExecutionStep[] = this.buildSteps(this.plan);

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stop();
  }

  get currentStep(): ExecutionStep | null {
    return this.currentStepIndex >= 0 ? this.steps[this.currentStepIndex] : null;
  }

  get activeScenarioInfo(): ScenarioOption {
    return this.scenarios.find(scenario => scenario.id === this.activeScenario)!;
  }

  get scenarioNumber(): number {
    return this.scenarios.findIndex(scenario => scenario.id === this.activeScenario) + 1;
  }

  get scenarioFacts(): ScenarioFact[] {
    switch (this.activeScenario) {
      case 'lookup':
        return [
          { label: 'Index hiện có', value: 'khachHangId + row locator' },
          { label: 'Rows phù hợp', value: this.lookupRows.toLocaleString('en-US') },
          { label: 'Cột còn thiếu', value: 'trangThai, tongTien' },
        ];
      case 'cardinality':
        return [
          { label: 'Estimated Rows', value: this.estimatedRows.toLocaleString('en-US') },
          { label: 'Actual Rows', value: this.actualRows.toLocaleString('en-US') },
          {
            label: 'Độ lệch',
            value: `${(this.actualRows / Math.max(this.estimatedRows, 1)).toFixed(1)}×`,
          },
        ];
      case 'spill':
        return [
          { label: 'Actual Rows', value: this.sortRows.toLocaleString('en-US') },
          { label: 'Row Size', value: `${this.rowSizeKb} KB` },
          { label: 'Memory Budget', value: `${this.memoryGrantMb} MB` },
        ];
      case 'access':
      default:
        return [
          { label: 'Orders', value: '1,000,000 rows' },
          { label: 'Mật độ page', value: '100 rows/page' },
          { label: 'Selectivity', value: `${this.selectivityPercent}%` },
        ];
    }
  }

  get progressPercent(): number {
    return this.steps.length ? ((this.currentStepIndex + 1) / this.steps.length) * 100 : 0;
  }

  get joinChosen(): string {
    return this.estimatedRows <= JOIN_THRESHOLD ? 'Nested Loop' : 'Hash Join';
  }

  get idealJoin(): string {
    return this.actualRows <= JOIN_THRESHOLD ? 'Nested Loop' : 'Hash Join';
  }

  get requiredMemoryMb(): number {
    return (this.sortRows * this.rowSizeKb) / 1024;
  }

  selectScenario(scenario: PlanScenario): void {
    if (this.activeScenario === scenario) {
      return;
    }
    this.activeScenario = scenario;
    this.rebuild();
  }

  updateHasIndex(enabled: boolean): void {
    this.hasIndex = enabled;
    this.rebuild();
  }

  updateSelectivity(value: number): void {
    this.selectivityPercent = value;
    this.rebuild();
  }

  updateLookupRows(value: number): void {
    this.lookupRows = value;
    this.rebuild();
  }

  updateCoveringIndex(enabled: boolean): void {
    this.coveringIndex = enabled;
    this.rebuild();
  }

  updateEstimatedRows(value: number): void {
    this.estimatedRows = value;
    this.rebuild();
  }

  updateActualRows(value: number): void {
    this.actualRows = value;
    this.rebuild();
  }

  updateSortRows(value: number): void {
    this.sortRows = value;
    this.rebuild();
  }

  updateMemoryGrant(value: number): void {
    this.memoryGrantMb = value;
    this.rebuild();
  }

  updateRowSize(value: number): void {
    this.rowSizeKb = value;
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
    return this.currentStep?.nodeId === nodeId;
  }

  isNodeVisited(nodeId: string): boolean {
    return this.currentStep?.visitedNodeIds.includes(nodeId) ?? false;
  }

  isEdgeVisited(edge: PlanEdge): boolean {
    const visited = this.currentStep?.visitedNodeIds ?? [];
    return visited.includes(edge.from) && visited.includes(edge.to);
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  formatRows(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
    }
    return Math.round(value).toString();
  }

  private rebuild(): void {
    this.stop();
    this.plan = this.buildPlan();
    this.steps = this.buildSteps(this.plan);
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

  private buildPlan(): PlanModel {
    switch (this.activeScenario) {
      case 'lookup':
        return this.buildLookupPlan();
      case 'cardinality':
        return this.buildCardinalityPlan();
      case 'spill':
        return this.buildSpillPlan();
      case 'access':
      default:
        return this.buildAccessPlan();
    }
  }

  private buildAccessPlan(): PlanModel {
    const rowsReturned = Math.max(1, Math.round((TABLE_ROWS * this.selectivityPercent) / 100));
    const useIndexLookup = this.hasIndex && this.selectivityPercent <= 15;
    const accessReads = useIndexLookup
      ? 3 + Math.ceil(rowsReturned / ROWS_PER_PAGE)
      : Math.ceil(TABLE_ROWS / ROWS_PER_PAGE);
    const accessLabel = useIndexLookup ? 'Index Lookup' : 'Table Scan';
    const accessCost = useIndexLookup ? 34 : 82;
    const nodes: PlanNode[] = [
      this.node(
        'access',
        accessLabel,
        useIndexLookup ? 'ix_orders_status' : 'orders',
        rowsReturned,
        useIndexLookup ? rowsReturned : TABLE_ROWS,
        accessCost,
        70,
        145,
        useIndexLookup ? 'success' : 'warning',
        useIndexLookup
          ? 'Index định vị vùng khóa phù hợp và chỉ đọc các leaf page cần thiết.'
          : 'Database đọc toàn bộ bảng rồi mới áp dụng predicate.',
      ),
      this.node(
        'filter',
        'Filter',
        `trangThai = 'PENDING'`,
        rowsReturned,
        rowsReturned,
        useIndexLookup ? 24 : 13,
        400,
        145,
        'normal',
        'Predicate loại các row không phù hợp khỏi luồng dữ liệu.',
      ),
      this.node(
        'result',
        'SELECT',
        'Result',
        rowsReturned,
        rowsReturned,
        5,
        730,
        145,
        'success',
        'Trả tập kết quả về application.',
      ),
    ];

    return {
      nodes,
      edges: [
        this.edge('access', 'filter', 250, 190, 400, 190),
        this.edge('filter', 'result', 580, 190, 730, 190),
      ],
      executionOrder: ['access', 'filter', 'result'],
      metrics: {
        logicalReads: accessReads,
        rowsReturned,
        lookupCount: 0,
        spillMb: 0,
        estimateRatio: 1,
      },
      decision: useIndexLookup
        ? `Optimizer chọn Index Lookup vì predicate trả khoảng ${this.selectivityPercent}% bảng.`
        : this.hasIndex
          ? `Optimizer chọn Table Scan vì ${this.selectivityPercent}% bảng làm Index Lookup và random access đắt hơn Scan.`
          : 'Không có Index phù hợp; Table Scan là access path khả dụng.',
      query: `SELECT id, trangThai, createdAt FROM orders WHERE trangThai = 'PENDING';`,
      warning:
        !useIndexLookup && this.selectivityPercent <= 15
          ? 'Thiếu Index phù hợp cho predicate có selectivity cao.'
          : null,
    };
  }

  private buildLookupPlan(): PlanModel {
    const lookupCost = Math.min(88, 18 + Math.log10(Math.max(this.lookupRows, 10)) * 15);
    const coveringReads = 3 + Math.ceil(this.lookupRows / ROWS_PER_PAGE);
    const lookupReads = 3 + this.lookupRows;

    if (this.coveringIndex) {
      const nodes: PlanNode[] = [
        this.node(
          'covering-seek',
          'Covering Index Access',
          'Covering Index',
          this.lookupRows,
          this.lookupRows,
          41,
          180,
          145,
          'success',
          'Index chứa đủ cột output; không cần quay lại table.',
        ),
        this.node(
          'result',
          'SELECT',
          'Result',
          this.lookupRows,
          this.lookupRows,
          5,
          650,
          145,
          'success',
          'Trả kết quả trực tiếp từ Index.',
        ),
      ];

      return {
        nodes,
        edges: [this.edge('covering-seek', 'result', 360, 190, 650, 190)],
        executionOrder: ['covering-seek', 'result'],
        metrics: {
          logicalReads: coveringReads,
          rowsReturned: this.lookupRows,
          lookupCount: 0,
          spillMb: 0,
          estimateRatio: 1,
        },
        decision: 'Covering Index cung cấp toàn bộ cột cần thiết và loại bỏ Table Lookup.',
        query: `SELECT id, trangThai, tongTien FROM orders WHERE khachHangId = 42;`,
        warning: null,
      };
    }

    const nodes: PlanNode[] = [
      this.node(
        'seek',
        'Index Lookup',
        'ix_orders_customer',
        this.lookupRows,
        this.lookupRows,
        18,
        70,
        70,
        'success',
        'Index Lookup trả key và row locator cho các row phù hợp.',
      ),
      this.node(
        'lookup',
        'Table Lookup',
        'orders',
        this.lookupRows,
        this.lookupRows,
        Math.round(lookupCost),
        70,
        245,
        this.lookupRows > 1_000 ? 'warning' : 'normal',
        `Mỗi row locator tạo một lần truy cập về table để lấy trangThai và tongTien.`,
      ),
      this.node(
        'loops',
        'Nested Loop',
        `${this.formatRows(this.lookupRows)} iterations`,
        this.lookupRows,
        this.lookupRows,
        12,
        430,
        155,
        this.lookupRows > 1_000 ? 'warning' : 'normal',
        'Nested Loop gọi Table Lookup một lần cho mỗi row từ Index Lookup.',
      ),
      this.node(
        'result',
        'SELECT',
        'Result',
        this.lookupRows,
        this.lookupRows,
        5,
        760,
        155,
        'success',
        'Trả các cột đã được hoàn thiện sau Lookup.',
      ),
    ];

    return {
      nodes,
      edges: [
        this.edge('seek', 'loops', 250, 115, 430, 185),
        this.edge('lookup', 'loops', 250, 290, 430, 215),
        this.edge('loops', 'result', 610, 200, 760, 200),
      ],
      executionOrder: ['seek', 'lookup', 'loops', 'result'],
      metrics: {
        logicalReads: lookupReads,
        rowsReturned: this.lookupRows,
        lookupCount: this.lookupRows,
        spillMb: 0,
        estimateRatio: 1,
      },
      decision: `Nested Loop thực hiện ${this.formatRows(this.lookupRows)} Table Lookup để lấy cột còn thiếu.`,
      query: `SELECT id, trangThai, tongTien FROM orders WHERE khachHangId = 42;`,
      warning:
        this.lookupRows > 1_000
          ? 'Lookup count cao tạo nhiều random page access; Covering Index hoặc query shape khác cần được đánh giá.'
          : null,
    };
  }

  private buildCardinalityPlan(): PlanModel {
    const chosenJoin = this.joinChosen;
    const idealJoin = this.idealJoin;
    const mismatch = chosenJoin !== idealJoin;
    const ratio = Math.max(this.actualRows / Math.max(this.estimatedRows, 1), 1);
    const joinCost = mismatch ? 78 : 42;
    const nodes: PlanNode[] = [
      this.node(
        'orders',
        'Index Lookup',
        'orders.trangThai',
        this.estimatedRows,
        this.actualRows,
        22,
        55,
        70,
        ratio >= 10 ? 'warning' : 'normal',
        'Cardinality estimate của predicate trở thành đầu vào cho quyết định chọn Join.',
      ),
      this.node(
        'customers',
        'Table Scan',
        'customers',
        10_000,
        10_000,
        16,
        55,
        245,
        'normal',
        'Input còn lại của phép Join.',
      ),
      this.node(
        'join',
        chosenJoin,
        mismatch ? `Ideal: ${idealJoin}` : 'Join phù hợp',
        this.estimatedRows,
        this.actualRows,
        joinCost,
        430,
        155,
        mismatch ? 'warning' : 'success',
        mismatch
          ? `${chosenJoin} được chọn từ estimate ${this.formatRows(this.estimatedRows)}, nhưng actual ${this.formatRows(this.actualRows)} phù hợp hơn với ${idealJoin}.`
          : `${chosenJoin} phù hợp với cả estimated và actual cardinality.`,
      ),
      this.node(
        'result',
        'SELECT',
        'Result',
        this.estimatedRows,
        this.actualRows,
        5,
        760,
        155,
        'success',
        'Trả kết quả sau phép Join.',
      ),
    ];

    return {
      nodes,
      edges: [
        this.edge('orders', 'join', 235, 115, 430, 185),
        this.edge('customers', 'join', 235, 290, 430, 215),
        this.edge('join', 'result', 610, 200, 760, 200),
      ],
      executionOrder: ['orders', 'customers', 'join', 'result'],
      metrics: {
        logicalReads: mismatch
          ? Math.ceil(this.actualRows / 8) + 1_000
          : Math.ceil(this.actualRows / 50) + 150,
        rowsReturned: this.actualRows,
        lookupCount: chosenJoin === 'Nested Loop' ? this.actualRows : 0,
        spillMb: 0,
        estimateRatio: this.actualRows / Math.max(this.estimatedRows, 1),
      },
      decision: `Optimizer chọn ${chosenJoin} từ estimate ${this.formatRows(this.estimatedRows)} row.`,
      query: `SELECT o.id, c.ten FROM orders o JOIN customers c ON c.id = o.khachHangId WHERE o.trangThai = 'PENDING';`,
      warning: mismatch
        ? `Actual Rows phù hợp hơn với ${idealJoin}; cần kiểm tra Statistics, Data Skew và predicate correlation.`
        : null,
    };
  }

  private buildSpillPlan(): PlanModel {
    const requiredMemory = this.requiredMemoryMb;
    const spillMb = Math.max(0, requiredMemory - this.memoryGrantMb);
    const hasSpill = spillMb > 0;
    const estimatedSortRows = Math.round((this.memoryGrantMb * 1024) / this.rowSizeKb);
    const nodes: PlanNode[] = [
      this.node(
        'scan',
        'Table Scan',
        'orders',
        estimatedSortRows,
        this.sortRows,
        28,
        70,
        145,
        'normal',
        'Đọc tập dữ liệu đầu vào cho phép sắp xếp.',
      ),
      this.node(
        'sort',
        'Sort',
        hasSpill ? `Spill ${spillMb.toFixed(1)} MB` : 'In-memory',
        estimatedSortRows,
        this.sortRows,
        hasSpill ? 79 : 38,
        400,
        145,
        hasSpill ? 'warning' : 'success',
        hasSpill
          ? `Sort cần ${requiredMemory.toFixed(1)} MB nhưng Memory Budget chỉ có ${this.memoryGrantMb} MB; phần vượt quá ghi xuống storage tạm.`
          : `Memory Budget ${this.memoryGrantMb} MB đủ cho ${requiredMemory.toFixed(1)} MB dữ liệu sắp xếp.`,
      ),
      this.node(
        'result',
        'SELECT',
        'Ordered Result',
        estimatedSortRows,
        this.sortRows,
        5,
        730,
        145,
        'success',
        'Trả tập kết quả theo thứ tự yêu cầu.',
      ),
    ];

    return {
      nodes,
      edges: [
        this.edge('scan', 'sort', 250, 190, 400, 190),
        this.edge('sort', 'result', 580, 190, 730, 190),
      ],
      executionOrder: ['scan', 'sort', 'result'],
      metrics: {
        logicalReads: Math.ceil(this.sortRows / ROWS_PER_PAGE) + Math.ceil(spillMb * 16),
        rowsReturned: this.sortRows,
        lookupCount: 0,
        spillMb,
        estimateRatio: this.sortRows / Math.max(estimatedSortRows, 1),
      },
      decision: `Sort cần ${requiredMemory.toFixed(1)} MB; Memory Budget hiện tại là ${this.memoryGrantMb} MB.`,
      query: `SELECT id, khachHangId, tongTien FROM orders ORDER BY createdAt DESC;`,
      warning: hasSpill
        ? 'Sort Spill làm tăng I/O tạm và latency; cần kiểm tra estimate, row width, Index order hoặc Memory Budget.'
        : null,
    };
  }

  private buildSteps(plan: PlanModel): ExecutionStep[] {
    const visited: string[] = [];
    return plan.executionOrder.map(nodeId => {
      visited.push(nodeId);
      const node = plan.nodes.find(item => item.id === nodeId)!;
      return {
        nodeId,
        title: `${node.label} · ${node.operation}`,
        detail: node.detail,
        visitedNodeIds: [...visited],
      };
    });
  }

  private node(
    id: string,
    label: string,
    operation: string,
    estimatedRows: number,
    actualRows: number,
    costPercent: number,
    x: number,
    y: number,
    status: PlanNodeStatus,
    detail: string,
  ): PlanNode {
    return {
      id,
      label,
      operation,
      estimatedRows: Math.max(1, Math.round(estimatedRows)),
      actualRows: Math.max(1, Math.round(actualRows)),
      costPercent,
      x,
      y,
      width: 180,
      status,
      detail,
    };
  }

  private edge(from: string, to: string, x1: number, y1: number, x2: number, y2: number): PlanEdge {
    return { from, to, x1, y1, x2, y2 };
  }
}
