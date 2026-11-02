import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { StepHistoryEntry } from '../shared/step-history/step-history.component';

type AdvancedSqlLabId = 'cte' | 'window' | 'lateral';
type PipelinePhase = 'source' | 'operator' | 'result';
type CellValue = string | number;
type DemoRow = Record<string, CellValue>;

interface DemoColumn {
  key: string;
  label: string;
}

interface InputTable {
  name: string;
  columns: DemoColumn[];
  rows: DemoRow[];
}

interface DemoStep {
  title: string;
  detail: string;
  operation: string;
  actor: string;
  phase: PipelinePhase;
  resultRows: DemoRow[];
  stateLabel: string;
}

interface AdvancedSqlLab {
  id: AdvancedSqlLabId;
  eyebrow: string;
  title: string;
  description: string;
  problem: string;
  question: string;
  operatorLabel: string;
  query: string;
  resultColumns: DemoColumn[];
  inputTables: InputTable[];
  steps: DemoStep[];
}

@Component({
  selector: 'app-advanced-sql-demo',
  templateUrl: './advanced-sql-demo.component.html',
  styleUrls: ['./advanced-sql-demo.component.scss'],
})
export class AdvancedSqlDemoComponent implements OnDestroy {
  readonly labs: Record<AdvancedSqlLabId, AdvancedSqlLab> = {
    cte: this.buildCteLab(),
    window: this.buildWindowLab(),
    lateral: this.buildLateralLab(),
  };

  activeLab: AdvancedSqlLabId;
  currentStepIndex = -1;
  isPlaying = false;
  speedMs = 1000;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(route: ActivatedRoute) {
    this.activeLab = (route.snapshot.data['demoLab'] as AdvancedSqlLabId | undefined) ?? 'cte';
  }

  ngOnDestroy(): void {
    this.stop();
  }

  get lab(): AdvancedSqlLab {
    return this.labs[this.activeLab];
  }

  get currentStep(): DemoStep | null {
    return this.currentStepIndex >= 0 ? this.lab.steps[this.currentStepIndex] : null;
  }

  get resultRows(): DemoRow[] {
    return this.currentStep?.resultRows ?? [];
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.lab.steps.length) * 100;
  }

  get tokenPosition(): number {
    switch (this.currentStep?.phase) {
      case 'source':
        return 16;
      case 'operator':
        return 50;
      case 'result':
        return 84;
      default:
        return 16;
    }
  }

  get executedStepLog(): StepHistoryEntry[] {
    if (this.currentStepIndex < 0) return [];
    return this.lab.steps.slice(0, this.currentStepIndex + 1).map(step => ({
      actor: step.actor,
      operation: step.operation,
      title: step.title,
      note: step.detail,
      tone:
        step.phase === 'source' ? 'primary' : step.phase === 'operator' ? 'secondary' : 'neutral',
    }));
  }

  nextStep(): void {
    this.stop();
    if (this.currentStepIndex >= this.lab.steps.length - 1) {
      this.reset();
    }
    this.currentStepIndex += 1;
  }

  previousStep(): void {
    this.stop();
    this.currentStepIndex = Math.max(-1, this.currentStepIndex - 1);
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stop();
      return;
    }
    if (this.currentStepIndex >= this.lab.steps.length - 1) this.reset();
    this.isPlaying = true;
    this.timer = setInterval(() => {
      if (this.currentStepIndex >= this.lab.steps.length - 1) {
        this.stop();
        return;
      }
      this.currentStepIndex += 1;
    }, this.speedMs);
  }

  setSpeed(speedMs: number): void {
    this.speedMs = speedMs;
    if (this.isPlaying) {
      this.stop();
      this.togglePlay();
    }
  }

  reset(): void {
    this.stop();
    this.currentStepIndex = -1;
  }

  trackByIndex(index: number): number {
    return index;
  }

  private stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildCteLab(): AdvancedSqlLab {
    const rows: DemoRow[] = [
      { id: 1, name: 'Electronics', depth: 0, path: 'Electronics' },
      { id: 2, name: 'Computers', depth: 1, path: 'Electronics / Computers' },
      { id: 5, name: 'Accessories', depth: 1, path: 'Electronics / Accessories' },
      { id: 3, name: 'Laptops', depth: 2, path: 'Electronics / Computers / Laptops' },
      {
        id: 4,
        name: 'Ultrabooks',
        depth: 3,
        path: 'Electronics / Computers / Laptops / Ultrabooks',
      },
    ];
    return {
      id: 'cte',
      eyebrow: 'RECURSIVE QUERY LAB',
      title: 'Recursive CTE Execution',
      description:
        'Theo dõi anchor query, working set và từng vòng recursive cho đến khi không còn row mới.',
      problem: 'Duyệt toàn bộ cây category bắt đầu từ Electronics mà không biết trước số tầng.',
      question: 'Mỗi iteration nhận input nào, tạo row nào và điều kiện nào làm recursion dừng?',
      operatorLabel: 'Recursive Union',
      query: `WITH RECURSIVE "cayDanhMuc" AS (
  SELECT id, "danhMucChaId", "ten", 0 AS "doSau",
         "ten"::text AS "duongDan"
  FROM categories
  WHERE id = 1

  UNION ALL

  SELECT c.id, c."danhMucChaId", c."ten",
         t."doSau" + 1,
         t."duongDan" || ' / ' || c."ten"
  FROM categories c
  JOIN "cayDanhMuc" t ON c."danhMucChaId" = t.id
)
SELECT * FROM "cayDanhMuc" ORDER BY "duongDan";`,
      resultColumns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Category' },
        { key: 'depth', label: 'Depth' },
        { key: 'path', label: 'Path' },
      ],
      inputTables: [
        {
          name: 'categories',
          columns: [
            { key: 'id', label: 'ID' },
            { key: 'parent', label: 'Parent' },
            { key: 'name', label: 'Name' },
          ],
          rows: [
            { id: 1, parent: 'NULL', name: 'Electronics' },
            { id: 2, parent: 1, name: 'Computers' },
            { id: 3, parent: 2, name: 'Laptops' },
            { id: 4, parent: 3, name: 'Ultrabooks' },
            { id: 5, parent: 1, name: 'Accessories' },
          ],
        },
      ],
      steps: [
        {
          title: 'Anchor query chọn node gốc',
          detail: 'Predicate id = 1 tạo working set đầu tiên gồm Electronics.',
          operation: 'ANCHOR',
          actor: 'Categories',
          phase: 'source',
          resultRows: rows.slice(0, 1),
          stateLabel: 'Working set: ID 1',
        },
        {
          title: 'Iteration 1 tìm con trực tiếp',
          detail: 'Join "danhMucChaId" = 1 tạo Computers và Accessories ở độ sâu 1.',
          operation: 'RECURSE #1',
          actor: 'Recursive Union',
          phase: 'operator',
          resultRows: rows.slice(0, 3),
          stateLabel: 'Thêm 2 rows',
        },
        {
          title: 'Iteration 2 mở rộng Computers',
          detail: 'Working set của vòng trước dẫn đến Laptops ở "doSau" = 2.',
          operation: 'RECURSE #2',
          actor: 'Recursive Union',
          phase: 'operator',
          resultRows: rows.slice(0, 4),
          stateLabel: 'Thêm 1 row',
        },
        {
          title: 'Iteration 3 mở rộng Laptops',
          detail: 'Laptops dẫn đến Ultrabooks và "duongDan" được nối thêm một segment.',
          operation: 'RECURSE #3',
          actor: 'Recursive Union',
          phase: 'operator',
          resultRows: rows,
          stateLabel: 'Thêm 1 row',
        },
        {
          title: 'Iteration 4 không tạo row mới',
          detail: 'Ultrabooks không có node con nên working set rỗng và recursion kết thúc.',
          operation: 'STOP',
          actor: 'Result',
          phase: 'result',
          resultRows: rows,
          stateLabel: 'Hoàn tất · 5 rows',
        },
      ],
    };
  }

  private buildWindowLab(): AdvancedSqlLab {
    const sourceRows: DemoRow[] = [
      { customer: 'A', order: '#104', amount: 700 },
      { customer: 'A', order: '#101', amount: 500 },
      { customer: 'A', order: '#103', amount: 200 },
      { customer: 'B', order: '#105', amount: 600 },
      { customer: 'B', order: '#102', amount: 300 },
    ];
    const rankedRows: DemoRow[] = [
      { customer: 'A', order: '#104', amount: 700, rank: 1, running: 700 },
      { customer: 'A', order: '#101', amount: 500, rank: 2, running: 1200 },
      { customer: 'A', order: '#103', amount: 200, rank: 3, running: 1400 },
      { customer: 'B', order: '#105', amount: 600, rank: 1, running: 600 },
      { customer: 'B', order: '#102', amount: 300, rank: 2, running: 900 },
    ];
    return {
      id: 'window',
      eyebrow: 'ANALYTICAL SQL LAB',
      title: 'Window Functions Execution',
      description:
        'Quan sát partition, ordering và window frame tạo ranking cùng running total mà không làm mất row.',
      problem: 'Xếp hạng Order theo từng Customer và tính doanh thu lũy kế theo giá trị giảm dần.',
      question:
        'Window function giữ nguyên cardinality bằng cách nào trong khi GROUP BY thu gọn row?',
      operatorLabel: 'WindowAgg',
      query: `SELECT "khachHangId",
       id AS "donHangId",
       "tongTien",
       ROW_NUMBER() OVER (
         PARTITION BY "khachHangId"
         ORDER BY "tongTien" DESC, id
       ) AS "thuHang",
       SUM("tongTien") OVER (
         PARTITION BY "khachHangId"
         ORDER BY "tongTien" DESC, id
         ROWS BETWEEN UNBOUNDED PRECEDING
                  AND CURRENT ROW
       ) AS "tongLuyKe"
FROM orders;`,
      resultColumns: [
        { key: 'customer', label: 'Customer' },
        { key: 'order', label: 'Order' },
        { key: 'amount', label: 'Amount' },
        { key: 'rank', label: 'Rank' },
        { key: 'running', label: 'Running total' },
      ],
      inputTables: [
        {
          name: 'orders',
          columns: [
            { key: 'customer', label: 'Customer' },
            { key: 'order', label: 'Order' },
            { key: 'amount', label: 'Amount' },
          ],
          rows: sourceRows,
        },
      ],
      steps: [
        {
          title: 'Đọc các Order hợp lệ',
          detail: 'Source scan trả năm row; chưa có aggregation hay ranking.',
          operation: 'SCAN',
          actor: 'Orders',
          phase: 'source',
          resultRows: [],
          stateLabel: 'Input: 5 rows',
        },
        {
          title: 'Chia partition theo Customer',
          detail: 'Các row A và B tạo hai phạm vi xử lý độc lập.',
          operation: 'PARTITION',
          actor: 'WindowAgg',
          phase: 'operator',
          resultRows: [],
          stateLabel: '2 partitions',
        },
        {
          title: 'Sắp xếp trong từng partition',
          detail: 'Amount DESC và Order ID làm tie-breaker để thứ tự ổn định.',
          operation: 'SORT',
          actor: 'WindowAgg',
          phase: 'operator',
          resultRows: [],
          stateLabel: 'A: 3 rows · B: 2 rows',
        },
        {
          title: 'Tính ROW_NUMBER và SUM frame',
          detail: 'Mỗi row nhận rank và tổng từ đầu partition đến row hiện tại.',
          operation: 'WINDOW',
          actor: 'WindowAgg',
          phase: 'operator',
          resultRows: rankedRows,
          stateLabel: '5 rows được annotate',
        },
        {
          title: 'Trả kết quả không đổi cardinality',
          detail: 'Input và output đều có năm row; window chỉ bổ sung giá trị phân tích.',
          operation: 'OUTPUT',
          actor: 'Result',
          phase: 'result',
          resultRows: rankedRows,
          stateLabel: 'Output: 5 rows',
        },
      ],
    };
  }

  private buildLateralLab(): AdvancedSqlLab {
    const resultRows: DemoRow[] = [
      { customer: 'An', order: '#105', created: '12:30', amount: 900 },
      { customer: 'An', order: '#102', created: '10:15', amount: 400 },
      { customer: 'Bình', order: '#106', created: '13:10', amount: 700 },
      { customer: 'Bình', order: '#103', created: '11:00', amount: 300 },
    ];
    return {
      id: 'lateral',
      eyebrow: 'CORRELATED FROM LAB',
      title: 'LATERAL JOIN Execution',
      description:
        'Theo dõi mỗi Customer truyền ID vào subquery, index lookup và dừng sớm sau hai Order.',
      problem: 'Lấy hai Order gần nhất cho từng Customer trong một tập Customer đã được lọc.',
      question:
        'Vì sao index theo ("khachHangId", "createdAt" DESC) quyết định hiệu năng của LATERAL?',
      operatorLabel: 'Nested Loop + Limit',
      query: `SELECT c."ten",
       recent.id AS "donHangId",
       recent."createdAt",
       recent."tongTien"
FROM customers c
CROSS JOIN LATERAL (
  SELECT o.id, o."createdAt", o."tongTien"
  FROM orders o
  WHERE o."khachHangId" = c.id
  ORDER BY o."createdAt" DESC
  LIMIT 2
) recent
WHERE c."dangHoatDong" = true;`,
      resultColumns: [
        { key: 'customer', label: 'Customer' },
        { key: 'order', label: 'Order' },
        { key: 'created', label: 'Created at' },
        { key: 'amount', label: 'Amount' },
      ],
      inputTables: [
        {
          name: 'customers',
          columns: [
            { key: 'id', label: 'ID' },
            { key: 'name', label: 'Name' },
            { key: 'active', label: 'Active' },
          ],
          rows: [
            { id: 1, name: 'An', active: 'true' },
            { id: 2, name: 'Bình', active: 'true' },
          ],
        },
        {
          name: 'orders · index order',
          columns: [
            { key: 'customer', label: 'Customer ID' },
            { key: 'order', label: 'Order' },
            { key: 'created', label: 'Created' },
          ],
          rows: [
            { customer: 1, order: '#105', created: '12:30' },
            { customer: 1, order: '#102', created: '10:15' },
            { customer: 1, order: '#101', created: '09:00' },
            { customer: 2, order: '#106', created: '13:10' },
            { customer: 2, order: '#103', created: '11:00' },
          ],
        },
      ],
      steps: [
        {
          title: 'Đọc Customer An',
          detail: 'Outer relation cung cấp "khachHangId" = 1 cho subquery LATERAL.',
          operation: 'OUTER ROW',
          actor: 'Customers',
          phase: 'source',
          resultRows: [],
          stateLabel: 'Correlation key: 1',
        },
        {
          title: 'Index lookup Order của An',
          detail: 'Index bắt đầu tại "khachHangId" = 1 và đã có thứ tự "createdAt" DESC.',
          operation: 'INDEX SCAN',
          actor: 'Lateral subquery',
          phase: 'operator',
          resultRows: resultRows.slice(0, 2),
          stateLabel: 'Đọc 2 index entries rồi dừng',
        },
        {
          title: 'Đọc Customer Bình',
          detail: 'Nested Loop chuyển sang outer row tiếp theo với correlation key = 2.',
          operation: 'OUTER ROW',
          actor: 'Customers',
          phase: 'source',
          resultRows: resultRows.slice(0, 2),
          stateLabel: 'Correlation key: 2',
        },
        {
          title: 'Index lookup Order của Bình',
          detail: 'Subquery chạy theo key mới và LIMIT tiếp tục dừng sau hai row.',
          operation: 'INDEX SCAN',
          actor: 'Lateral subquery',
          phase: 'operator',
          resultRows,
          stateLabel: 'Đọc 2 index entries rồi dừng',
        },
        {
          title: 'Nested Loop trả kết quả',
          detail: 'Hai outer rows tạo bốn result rows mà không scan toàn bộ Orders.',
          operation: 'OUTPUT',
          actor: 'Result',
          phase: 'result',
          resultRows,
          stateLabel: '2 customers · 4 orders',
        },
      ],
    };
  }
}
