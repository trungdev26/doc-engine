import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Chart } from 'chart.js/auto';

type Severity = 'ok' | 'warn' | 'crit';
type LoadInputMode = 'scenario' | 'rps';
type InputTab = 'load' | 'backend' | 'infra' | 'whatif';

interface Recommendation {
  type: 'info' | 'warn';
  text: string;
}

interface UtilizationRow {
  label: string;
  hint: string;
  required: number;
  provisioned: number;
  unit: string;
  pct: number;
  status: Severity;
}

interface DerivationStep {
  label: string;
  formula: string;
  result: string;
}

interface VerdictIssue {
  type: 'crit' | 'warn';
  text: string;
}

interface InstanceProfile {
  id: string;
  label: string;
  subtitle: string;
  cpuCores: number;
  ramGb: number;
  rpsPerCore: number;
}

interface DesignOption {
  title: string;
  impact: string;
  tradeoff: string;
  priority: 'high' | 'medium' | 'low';
}

interface BottleneckSignal {
  label: string;
  status: Severity;
  detail: string;
}

interface GlossaryTerm {
  term: string;
  definition: string;
}

interface ScenarioValues {
  expectedClients: number;
  avgRequestsPerClientPerDay: number;
  trafficWindowHours: number;
  peakWindowMinutes: number;
  peakTrafficPercent: number;
  peakHours: number;
  peakStartHour: number;
  avgRequestSizeKB: number;
  writePercent: number;
  queriesPerRequest: number;
  avgRowsScannedPerQuery: number;
  cacheHitRatioPercent: number;
  cacheTtlSeconds: number;
  p95LatencyMs: number;
  safetyMarginPercent: number;
  appInstanceCount: number;
  appCpuCoresPerInstance: number;
  appRamGbPerInstance: number;
  rpsPerCpuCore: number;
  avgMemPerRequestMb: number;
  dbCpuCores: number;
  dbRamGb: number;
  dbMaxConnections: number;
  queriesPerSecondPerDbCore: number;
  redisMaxMemoryGb: number;
}

interface ScenarioPreset {
  id: string;
  label: string;
  subtitle: string;
  values: ScenarioValues;
}

const INSTANCE_PROFILES: InstanceProfile[] = [
  { id: 'small', label: 'Small', subtitle: '2 vCPU / 4 GB', cpuCores: 2, ramGb: 4, rpsPerCore: 100 },
  { id: 'medium', label: 'Medium', subtitle: '4 vCPU / 8 GB', cpuCores: 4, ramGb: 8, rpsPerCore: 130 },
  { id: 'large', label: 'Large', subtitle: '8 vCPU / 16 GB', cpuCores: 8, ramGb: 16, rpsPerCore: 160 },
  { id: 'compute', label: 'Compute', subtitle: '16 vCPU / 32 GB', cpuCores: 16, ramGb: 32, rpsPerCore: 190 },
];

const PRESETS: ScenarioPreset[] = [
  {
    id: 'clinic',
    label: 'Hàng chờ phòng khám',
    subtitle: 'Case study mục 10 — polling dày, query chưa có index tốt',
    values: {
      expectedClients: 500,
      avgRequestsPerClientPerDay: 1,
      trafficWindowHours: 8,
      peakWindowMinutes: 120,
      peakTrafficPercent: 60,
      peakHours: 2,
      peakStartHour: 0,
      avgRequestSizeKB: 5,
      writePercent: 5,
      queriesPerRequest: 3,
      avgRowsScannedPerQuery: 20_000,
      cacheHitRatioPercent: 0,
      cacheTtlSeconds: 60,
      p95LatencyMs: 150,
      safetyMarginPercent: 50,
      appInstanceCount: 2,
      appCpuCoresPerInstance: 2,
      appRamGbPerInstance: 4,
      rpsPerCpuCore: 150,
      avgMemPerRequestMb: 4,
      dbCpuCores: 4,
      dbRamGb: 16,
      dbMaxConnections: 100,
      queriesPerSecondPerDbCore: 2000,
      redisMaxMemoryGb: 4,
    },
  },
  {
    id: 'flash-sale',
    label: 'E-commerce Flash Sale',
    subtitle: 'Peak dồn 2 giờ, cache nặng, headroom 100%',
    values: {
      expectedClients: 200_000,
      avgRequestsPerClientPerDay: 50,
      trafficWindowHours: 24,
      peakWindowMinutes: 120,
      peakTrafficPercent: 70,
      peakHours: 2,
      peakStartHour: 0,
      avgRequestSizeKB: 80,
      writePercent: 15,
      queriesPerRequest: 4,
      avgRowsScannedPerQuery: 300,
      cacheHitRatioPercent: 85,
      cacheTtlSeconds: 30,
      p95LatencyMs: 250,
      safetyMarginPercent: 100,
      appInstanceCount: 6,
      appCpuCoresPerInstance: 4,
      appRamGbPerInstance: 8,
      rpsPerCpuCore: 120,
      avgMemPerRequestMb: 8,
      dbCpuCores: 16,
      dbRamGb: 64,
      dbMaxConnections: 500,
      queriesPerSecondPerDbCore: 3000,
      redisMaxMemoryGb: 8,
    },
  },
  {
    id: 'saas',
    label: 'SaaS B2B nội bộ',
    subtitle: 'Tải giờ hành chính, thiết kế cân bằng — ví dụ "đạt"',
    values: {
      expectedClients: 15_000,
      avgRequestsPerClientPerDay: 80,
      trafficWindowHours: 8,
      peakWindowMinutes: 480,
      peakTrafficPercent: 55,
      peakHours: 8,
      peakStartHour: 0,
      avgRequestSizeKB: 40,
      writePercent: 25,
      queriesPerRequest: 3,
      avgRowsScannedPerQuery: 800,
      cacheHitRatioPercent: 60,
      cacheTtlSeconds: 120,
      p95LatencyMs: 180,
      safetyMarginPercent: 50,
      appInstanceCount: 3,
      appCpuCoresPerInstance: 2,
      appRamGbPerInstance: 4,
      rpsPerCpuCore: 130,
      avgMemPerRequestMb: 5,
      dbCpuCores: 8,
      dbRamGb: 32,
      dbMaxConnections: 200,
      queriesPerSecondPerDbCore: 2500,
      redisMaxMemoryGb: 4,
    },
  },
  {
    id: 'mvp',
    label: 'Startup MVP',
    subtitle: 'Tải nhỏ — bài học: đừng over-engineer',
    values: {
      expectedClients: 1000,
      avgRequestsPerClientPerDay: 50,
      trafficWindowHours: 8,
      peakWindowMinutes: 180,
      peakTrafficPercent: 50,
      peakHours: 3,
      peakStartHour: 0,
      avgRequestSizeKB: 30,
      writePercent: 30,
      queriesPerRequest: 2,
      avgRowsScannedPerQuery: 200,
      cacheHitRatioPercent: 0,
      cacheTtlSeconds: 60,
      p95LatencyMs: 120,
      safetyMarginPercent: 50,
      appInstanceCount: 1,
      appCpuCoresPerInstance: 2,
      appRamGbPerInstance: 4,
      rpsPerCpuCore: 100,
      avgMemPerRequestMb: 5,
      dbCpuCores: 2,
      dbRamGb: 8,
      dbMaxConnections: 50,
      queriesPerSecondPerDbCore: 2000,
      redisMaxMemoryGb: 4,
    },
  },
];

const GLOSSARY: GlossaryTerm[] = [
  {
    term: 'CPU / Core / vCPU',
    definition:
      'CPU là bộ xử lý trung tâm, thực hiện các phép tính của request (parse, tính toán, serialize, mã hoá...). 1 core xử lý được 1 luồng việc tại 1 thời điểm. Cloud thường bán theo vCPU (virtual CPU) — là một phần thời gian xử lý được chia sẻ/ảo hoá từ core vật lý, không phải lúc nào cũng tương đương 1 core riêng biệt.',
  },
  {
    term: 'RAM (bộ nhớ)',
    definition:
      'Bộ nhớ tạm, tốc độ cao, chứa dữ liệu đang được xử lý: request đang chạy, cache, buffer pool của DB, session... RAM khác Storage (ổ đĩa): RAM mất dữ liệu khi tắt máy, đọc/ghi nhanh hơn disk rất nhiều. Hết RAM có thể khiến process bị OOM-kill hoặc phải swap ra disk, làm hệ thống chậm hẳn.',
  },
  {
    term: 'DB Connection',
    definition:
      'Một kết nối (giống 1 đường dây điện thoại) giữa app và database, dùng để gửi query và nhận kết quả. Mỗi connection tốn RAM phía DB (thường vài MB) và DB luôn có giới hạn max_connections. Vì vậy không nên mở connection tuỳ tiện cho mỗi request.',
  },
  {
    term: 'Connection Pool',
    definition:
      'Một tập connection DB được mở sẵn và tái sử dụng, thay vì mở/đóng connection mới cho mỗi request (việc bắt tay/handshake để mở connection mới khá tốn thời gian và CPU). App server giữ pool này và cho các request mượn connection khi cần.',
  },
  {
    term: 'Thread / Thread Pool',
    definition:
      'Thread là một luồng xử lý trong 1 process, cho phép xử lý nhiều việc song song. Thread pool giới hạn số request được xử lý đồng thời trong 1 instance — hết thread trống thì request mới phải xếp hàng chờ, dù CPU/RAM vẫn còn.',
  },
  {
    term: 'Concurrency (đang xử lý đồng thời)',
    definition:
      'Số request đang "nằm" trong hệ thống tại cùng một thời điểm (đã nhận nhưng chưa trả kết quả xong). Khác RPS (tốc độ request đi vào). Latency càng cao thì cùng một RPS sẽ tạo ra concurrency càng lớn — xem Little\'s Law ở mục 2.6 trong Lý thuyết.',
  },
  {
    term: 'Buffer Pool / Cache (phía Database)',
    definition:
      'Vùng RAM mà database dùng để giữ data/index hay dùng trong bộ nhớ, tránh phải đọc từ disk mỗi lần query (đọc RAM nhanh hơn đọc disk rất nhiều). RAM của DB càng thấp so với dữ liệu thực tế, buffer pool càng nhỏ, tỉ lệ phải đọc disk càng cao, latency càng tăng.',
  },
  {
    term: 'IOPS',
    definition:
      'Số lần đọc/ghi ổ đĩa mà hệ thống lưu trữ đáp ứng được trong 1 giây. Quan trọng nhất với DB khi buffer pool không đủ chứa working set, khiến DB phải đọc disk thường xuyên.',
  },
  {
    term: 'Instance / Node',
    definition:
      'Một máy chủ (VM, container, hoặc server vật lý) đang chạy 1 bản sao của ứng dụng hoặc database. "Scale ngang" (horizontal scaling) nghĩa là thêm instance; "scale dọc" (vertical scaling) nghĩa là tăng CPU/RAM của 1 instance sẵn có.',
  },
  {
    term: 'RPS (Requests Per Second)',
    definition:
      'Số request đi vào tầng API/application server trong 1 giây. Đo tải ở "cửa vào" hệ thống, chưa nói lên request đó nặng hay nhẹ phía sau (xem mục 2.2 trong Lý thuyết).',
  },
  {
    term: 'QPS (Queries Per Second)',
    definition:
      'Số query trong 1 giây, thường dùng cho tầng phía sau API: DB QPS (query xuống database), Cache QPS (request vào Redis)... Một API RPS có thể tạo ra nhiều DB QPS hơn nếu mỗi request chạy nhiều query (xem mục 2.3).',
  },
  {
    term: 'Read / Write Path',
    definition:
      'Read path là luồng đọc dữ liệu (không đổi state), thường có thể cache/scale dễ hơn. Write path là luồng ghi/thay đổi dữ liệu, cần correctness cao (transaction, unique constraint, idempotency) và không thể "giải quyết" chỉ bằng cache (xem mục 2.9).',
  },
  {
    term: 'KB / MB / GB / TB (đơn vị lưu trữ)',
    definition:
      '1 KB = 1024 byte, 1 MB = 1024 KB, 1 GB = 1024 MB, 1 TB = 1024 GB — mỗi bậc nhân thêm 1024 lần. Tool này tính storage bằng cách nhân dồn: kich thuoc 1 request (KB) x so request trong modeled window -> GB/window. Vì vậy một con số nhỏ mỗi request (vài chục KB) co the phinh thanh storage dang ke khi nhan voi volume du lon.',
  },
  {
    term: 'Redis / In-memory Cache',
    definition:
      'Redis là key-value store lưu dữ liệu trong RAM (khác DB lưu trên disk), dùng để trả kết quả rất nhanh mà không phải hỏi lại DB. Vì lưu trong RAM nên dung lượng luôn có giới hạn và đắt hơn disk nhiều — cần ước tính working set (dữ liệu đang được cache tại một thời điểm) để tránh cache đầy, phải evict liên tục (cache thrashing) làm giảm hit ratio.',
  },
  {
    term: 'Working Set',
    definition:
      'Phần dữ liệu thực sự được truy cập thường xuyên tại một thời điểm — nhỏ hơn nhiều so với tổng dữ liệu. Cache/buffer pool chỉ cần chứa đủ working set là hit ratio đã cao; ước tính working set sai là lý do phổ biến khiến Redis bị đầy hoặc DB phải đọc disk liên tục.',
  },
  {
    term: 'Headroom / Safety Margin',
    definition:
      'Phần capacity dự phòng cộng thêm trên mức tải ước tính (thường 30–100%) để chịu được sai số ước lượng, traffic đột biến, và degradation khi 1 node chết (N-1). Thiết kế chạm đúng 100% capacity nghĩa là không còn chỗ cho bất kỳ bất thường nào.',
  },
  {
    term: 'Utilization (mức sử dụng)',
    definition:
      'Tỉ lệ tài nguyên đang dùng so với tổng được cấp (%). Kinh nghiệm vận hành: dưới ~70% là vùng an toàn, 70–90% cần theo dõi/scale sớm, trên 90% là vùng nguy hiểm vì latency thường tăng phi tuyến khi tiến gần 100% (queueing theory).',
  },
];

@Component({
  selector: 'app-load-parameter-demo',
  templateUrl: './load-parameter-demo.component.html',
  styleUrls: ['./load-parameter-demo.component.scss'],
})
export class LoadParameterDemoComponent implements OnInit, AfterViewInit, OnDestroy {
  // --- Tải & peak ---
  expectedClients = 500;
  avgRequestsPerClientPerDay = 1;
  loadInputMode: LoadInputMode = 'scenario';
  directAvgRps = 0.02;
  directPeakRps = 0.04;
  trafficWindowHours = 8;
  peakWindowMinutes = 120;
  peakTrafficPercent = 60;
  peakHours = 3;
  peakStartHour = 0;
  avgRequestSizeKB = 50;
  writePercent = 20;

  // --- Chi phí backend & giả định ---
  queriesPerRequest = 3;
  avgRowsScannedPerQuery = 2000;
  cacheHitRatioPercent = 0;
  cacheTtlSeconds = 60;
  p95LatencyMs = 150;
  safetyMarginPercent = 50;

  // --- App fleet (giải pháp đang đề xuất) ---
  appInstanceCount = 2;
  appCpuCoresPerInstance = 2;
  appRamGbPerInstance = 4;
  rpsPerCpuCore = 100;
  avgMemPerRequestMb = 5;

  // --- Database & cache (giải pháp đang đề xuất) ---
  dbCpuCores = 4;
  dbRamGb = 16;
  dbMaxConnections = 100;
  queriesPerSecondPerDbCore = 2000;
  redisMaxMemoryGb = 4;

  readonly glossary = GLOSSARY;
  readonly presets = PRESETS;
  readonly instanceProfiles = INSTANCE_PROFILES;
  readonly inputTabOrder: InputTab[] = ['load', 'backend', 'infra', 'whatif'];
  activePresetId: string | null = null;
  activeProfileId = 'small';
  activeInputTab: InputTab = 'load';

  // Kết quả dạng mảng/object được tính 1 lần mỗi khi input đổi (recalculate) —
  // không dùng getter để tránh cấp phát mảng mới trên mọi change-detection tick.
  utilization: UtilizationRow[] = [];
  derivation: DerivationStep[] = [];
  recommendations: Recommendation[] = [];
  designOptions: DesignOption[] = [];
  bottlenecks: BottleneckSignal[] = [];
  verdictIssues: VerdictIssue[] = [];
  verdictStatus: Severity = 'ok';
  critCount = 0;
  warnCount = 0;
  designSummary = '';
  lastWhatIfLabel = '';

  @ViewChild('chartCanvas') private chartCanvas?: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;
  private recalcScheduled = false;

  // ===== Tải =====

  get modeledRequestsPerDay(): number {
    return Math.max(0, Math.round(this.expectedClients * this.avgRequestsPerClientPerDay));
  }

  get effectiveRequestsPerDay(): number {
    if (this.loadInputMode === 'rps') {
      return Math.max(0, Math.round(this.directAvgRps * this.trafficWindowHours * 3600));
    }
    return this.modeledRequestsPerDay;
  }

  get avgRps(): number {
    if (this.loadInputMode === 'rps') {
      return this.directAvgRps;
    }
    const windowSeconds = Math.max(1, this.trafficWindowHours * 3600);
    return this.effectiveRequestsPerDay / windowSeconds;
  }

  get peakRps(): number {
    if (this.loadInputMode === 'rps') {
      return this.directPeakRps;
    }
    const peakWindowSeconds = this.peakWindowMinutes * 60;
    if (peakWindowSeconds <= 0) {
      return 0;
    }
    return (this.effectiveRequestsPerDay * (this.peakTrafficPercent / 100)) / peakWindowSeconds;
  }

  get offPeakRps(): number {
    if (this.loadInputMode === 'rps') {
      return this.directAvgRps;
    }
    const offPeakSeconds = this.trafficWindowHours * 3600 - this.peakWindowMinutes * 60;
    if (offPeakSeconds <= 0) {
      return 0;
    }
    return (this.effectiveRequestsPerDay * (1 - this.peakTrafficPercent / 100)) / offPeakSeconds;
  }

  get readRps(): number {
    return this.peakRps * (1 - this.writePercent / 100);
  }

  get writeRps(): number {
    return this.peakRps * (this.writePercent / 100);
  }

  // ===== DB =====

  get peakDbQueryQps(): number {
    return this.peakRps * this.queriesPerRequest;
  }

  get peakWriteDbQueryQps(): number {
    return this.writeRps * this.queriesPerRequest;
  }

  // Cache chỉ giảm tải được cho read — write luôn phải chạm DB để đảm bảo correctness.
  get readDbQueryQpsAfterCache(): number {
    return this.readRps * this.queriesPerRequest * (1 - this.cacheHitRatioPercent / 100);
  }

  get dbQueryQpsAfterCache(): number {
    return this.readDbQueryQpsAfterCache + this.peakWriteDbQueryQps;
  }

  get rowsScannedPerSecond(): number {
    return this.dbQueryQpsAfterCache * this.avgRowsScannedPerQuery;
  }

  get dbQueryCapacity(): number {
    return this.dbCpuCores * this.queriesPerSecondPerDbCore;
  }

  get dbUtilizationPercent(): number {
    return this.dbQueryCapacity > 0 ? (this.designDbQps / this.dbQueryCapacity) * 100 : 999;
  }

  // ===== Concurrency, bandwidth, storage =====

  // Little's Law: concurrency ≈ throughput × latency
  get concurrentRequests(): number {
    return this.peakRps * (this.p95LatencyMs / 1000);
  }

  get peakBandwidthMbps(): number {
    return (this.peakRps * this.avgRequestSizeKB * 8) / 1024;
  }

  get storagePerWindowGB(): number {
    return (this.effectiveRequestsPerDay * (this.writePercent / 100) * this.avgRequestSizeKB) / (1024 * 1024);
  }

  // ===== Cache =====

  get cachedReadsPerSecond(): number {
    return this.readRps * (this.cacheHitRatioPercent / 100);
  }

  // Ước tính thô working set: read được cache giữ trong RAM suốt 1 TTL window.
  get estimatedCacheMemoryGb(): number {
    return (this.cachedReadsPerSecond * this.cacheTtlSeconds * this.avgRequestSizeKB) / (1024 * 1024);
  }

  // ===== Thiết kế (đã cộng headroom) =====

  private get safetyMargin(): number {
    return 1 + this.safetyMarginPercent / 100;
  }

  get designPeakRps(): number {
    return this.peakRps * this.safetyMargin;
  }

  get designConcurrentRequests(): number {
    return this.concurrentRequests * this.safetyMargin;
  }

  get designDbQps(): number {
    return this.dbQueryQpsAfterCache * this.safetyMargin;
  }

  get designCacheMemoryGb(): number {
    return this.estimatedCacheMemoryGb * this.safetyMargin;
  }

  get requiredAppCores(): number {
    return this.rpsPerCpuCore > 0 ? this.designPeakRps / this.rpsPerCpuCore : 0;
  }

  get providedAppCores(): number {
    return this.appInstanceCount * this.appCpuCoresPerInstance;
  }

  get requiredRamGbTotal(): number {
    return (this.designConcurrentRequests * this.avgMemPerRequestMb) / 1024;
  }

  get providedRamGbTotal(): number {
    return this.appInstanceCount * this.appRamGbPerInstance;
  }

  get requiredDbConnections(): number {
    return Math.max(1, Math.ceil(this.designConcurrentRequests));
  }

  get poolPerInstance(): number {
    return Math.max(1, Math.ceil(this.requiredDbConnections / Math.max(1, this.appInstanceCount)));
  }

  get fleetCapacityRps(): number {
    return this.appInstanceCount * this.appCpuCoresPerInstance * this.rpsPerCpuCore;
  }

  get minInstancesNeeded(): number {
    const byCpu = this.appCpuCoresPerInstance > 0 ? this.requiredAppCores / this.appCpuCoresPerInstance : 0;
    const byRam = this.appRamGbPerInstance > 0 ? this.requiredRamGbTotal / this.appRamGbPerInstance : 0;
    return Math.max(1, Math.ceil(Math.max(byCpu, byRam)));
  }

  get selectedProfile(): InstanceProfile {
    return this.instanceProfiles.find(profile => profile.id === this.activeProfileId) ?? this.instanceProfiles[0];
  }

  get autosizedInstanceCount(): number {
    const profile = this.selectedProfile;
    const requiredCores = profile.rpsPerCore > 0 ? this.designPeakRps / profile.rpsPerCore : 0;
    const byCpu = profile.cpuCores > 0 ? requiredCores / profile.cpuCores : 0;
    const byRam = profile.ramGb > 0 ? this.requiredRamGbTotal / profile.ramGb : 0;
    return Math.max(1, Math.ceil(Math.max(byCpu, byRam)));
  }

  get recommendedDbCores(): number {
    return Math.max(1, Math.ceil(this.designDbQps / Math.max(1, this.queriesPerSecondPerDbCore)));
  }

  get recommendedDbRamGb(): number {
    return Math.max(4, Math.ceil(this.recommendedDbCores * 4));
  }

  get recommendedDbMaxConnections(): number {
    return Math.max(50, Math.ceil(this.requiredDbConnections * 1.25));
  }

  get recommendedRedisMemoryGb(): number {
    return Math.max(1, Math.ceil(this.designCacheMemoryGb * 1.25));
  }

  get activeInputStep(): number {
    return this.inputTabOrder.indexOf(this.activeInputTab) + 1;
  }

  get decisionTitle(): string {
    if (this.verdictStatus === 'crit') {
      return 'Chưa nên chốt cấu hình hiện tại';
    }
    if (this.verdictStatus === 'warn') {
      return 'Capacity đủ, nhưng giả định còn rủi ro';
    }
    return 'Cấu hình đủ cho giả định hiện tại';
  }

  get decisionDetail(): string {
    if (this.verdictStatus === 'crit') {
      return `${this.critCount} giới hạn capacity bị vượt. Xử lý bottleneck trước khi tăng headroom hoặc chốt sizing.`;
    }
    if (this.verdictStatus === 'warn') {
      return `${this.warnCount} tín hiệu cần benchmark hoặc theo dõi trước khi triển khai production.`;
    }
    return 'Không có bottleneck cứng. Giữ kiến trúc đơn giản và dùng load test để xác nhận các giả định.';
  }

  get primaryRisk(): string {
    return this.bottlenecks.find(item => item.status !== 'ok')?.label ?? 'Sai số của benchmark và traffic model';
  }

  get nextDecisionAction(): string {
    return this.designOptions[0]?.title ?? 'Benchmark lại với dữ liệu production';
  }

  // ===== Lifecycle =====

  ngOnInit(): void {
    this.recalculate();
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  applyPreset(preset: ScenarioPreset): void {
    Object.assign(this, preset.values);
    this.loadInputMode = 'scenario';
    this.directAvgRps = this.avgRps;
    this.directPeakRps = this.peakRps;
    this.activePresetId = preset.id;
    this.syncActiveProfileFromCurrentShape();
    this.syncPeakHoursFromMinutes();
    this.recalculate();
    this.renderChart();
  }

  applyInstanceProfile(profile: InstanceProfile): void {
    this.activePresetId = null;
    this.activeProfileId = profile.id;
    this.appCpuCoresPerInstance = profile.cpuCores;
    this.appRamGbPerInstance = profile.ramGb;
    this.rpsPerCpuCore = profile.rpsPerCore;
    this.appInstanceCount = this.autosizedInstanceCount;
    this.recalculate();
    this.renderChart();
  }

  applyRecommendedInfrastructure(): void {
    this.activePresetId = null;
    const profile = this.selectedProfile;
    this.appCpuCoresPerInstance = profile.cpuCores;
    this.appRamGbPerInstance = profile.ramGb;
    this.rpsPerCpuCore = profile.rpsPerCore;
    this.appInstanceCount = this.autosizedInstanceCount;
    this.dbCpuCores = this.recommendedDbCores;
    this.dbRamGb = this.recommendedDbRamGb;
    this.dbMaxConnections = this.recommendedDbMaxConnections;
    if (this.cacheHitRatioPercent > 0) {
      this.redisMaxMemoryGb = this.recommendedRedisMemoryGb;
    }
    this.lastWhatIfLabel = `Đã auto-fit: ${this.appInstanceCount} ${profile.label} instance, DB ${this.dbCpuCores} vCPU / ${this.dbRamGb} GB`;
    this.recalculate();
    this.renderChart();
  }

  applyWhatIf(action: 'cache' | 'index' | 'latency' | 'headroom'): void {
    this.activePresetId = null;
    if (action === 'cache') {
      this.cacheHitRatioPercent = 70;
      this.cacheTtlSeconds = Math.max(this.cacheTtlSeconds, 60);
      this.lastWhatIfLabel = 'Đã set cache hit ratio = 70%';
    }
    if (action === 'index') {
      this.avgRowsScannedPerQuery = Math.max(50, Math.ceil(this.avgRowsScannedPerQuery / 10));
      this.lastWhatIfLabel = `Đã giảm rows scan/query còn ${this.fmt(this.avgRowsScannedPerQuery, 0)}`;
    }
    if (action === 'latency') {
      this.p95LatencyMs = 120;
      this.lastWhatIfLabel = 'Đã set p95 latency = 120ms';
    }
    if (action === 'headroom') {
      this.safetyMarginPercent = Math.max(this.safetyMarginPercent, 50);
      this.lastWhatIfLabel = 'Đã auto-fit hạ tầng với tối thiểu 50% headroom';
      this.applyRecommendedInfrastructure();
      return;
    }
    this.recalculate();
    this.renderChart();
  }

  // Slider bắn "input" nhiều lần/khung hình khi kéo — gộp lại tối đa 1 lần
  // tính toán + render chart mỗi animation frame.
  applyClientIntensity(requestsPerClientPerDay: number): void {
    this.avgRequestsPerClientPerDay = requestsPerClientPerDay;
    this.onTrafficModelChanged();
  }

  onTrafficModelChanged(): void {
    this.loadInputMode = 'scenario';
    this.onInputsChanged();
  }

  switchLoadInputMode(mode: LoadInputMode): void {
    const currentAvgRps = this.avgRps;
    const currentPeakRps = this.peakRps;
    this.loadInputMode = mode;
    if (mode === 'rps') {
      this.directAvgRps = Math.max(0, Number(currentAvgRps.toFixed(2)));
      this.directPeakRps = Math.max(this.directAvgRps, Number(currentPeakRps.toFixed(2)));
    }
    this.onInputsChanged();
  }

  onRpsInputsChanged(): void {
    this.loadInputMode = 'rps';
    if (this.directPeakRps < this.directAvgRps) {
      this.directPeakRps = this.directAvgRps;
    }
    this.onInputsChanged();
  }

  onInputsChanged(): void {
    this.activePresetId = null;
    this.trafficWindowHours = Math.max(1, this.trafficWindowHours || 1);
    this.peakWindowMinutes = Math.min(Math.max(1, this.peakWindowMinutes || 1), this.trafficWindowHours * 60);
    if (this.loadInputMode === 'scenario') {
      this.syncPeakHoursFromMinutes();
    }
    if (this.recalcScheduled) {
      return;
    }
    this.recalcScheduled = true;
    requestAnimationFrame(() => {
      this.recalcScheduled = false;
      this.recalculate();
      this.renderChart();
    });
  }

  trackByIndex(index: number): number {
    return index;
  }

  setInputTab(tab: InputTab): void {
    this.activeInputTab = tab;
  }

  moveInputStep(direction: -1 | 1): void {
    const currentIndex = this.inputTabOrder.indexOf(this.activeInputTab);
    const nextIndex = Math.min(this.inputTabOrder.length - 1, Math.max(0, currentIndex + direction));
    this.activeInputTab = this.inputTabOrder[nextIndex];
  }

  // ===== Tính toán tổng hợp =====

  private recalculate(): void {
    this.utilization = this.computeUtilization();
    this.recommendations = this.computeRecommendations();
    this.derivation = this.computeDerivation();
    this.bottlenecks = this.computeBottlenecks();
    this.designOptions = this.computeDesignOptions();

    const critIssues: VerdictIssue[] = this.utilization
      .filter(row => row.status === 'crit')
      .map(row => ({
        type: 'crit' as const,
        text: `${row.label}: cần ~${this.fmt(row.required)} ${row.unit} nhưng chỉ cấp ${this.fmt(row.provisioned)} ${row.unit} (${Math.round(row.pct)}%).`,
      }));
    const warnIssues: VerdictIssue[] = this.recommendations
      .filter(rec => rec.type === 'warn')
      .map(rec => ({ type: 'warn' as const, text: rec.text }));

    this.verdictIssues = [...critIssues, ...warnIssues];
    this.critCount = critIssues.length;
    this.warnCount = warnIssues.length;
    this.verdictStatus = this.critCount > 0 ? 'crit' : this.warnCount > 0 ? 'warn' : 'ok';
    this.designSummary = this.computeDesignSummary();
  }

  private statusOf(pct: number): Severity {
    if (pct > 100) {
      return 'crit';
    }
    return pct >= 70 ? 'warn' : 'ok';
  }

  private computeUtilization(): UtilizationRow[] {
    const rows: Array<Omit<UtilizationRow, 'pct' | 'status'>> = [
      {
        label: 'CPU App Fleet',
        hint: `${this.appInstanceCount} instance × ${this.appCpuCoresPerInstance} core, giả định ${this.rpsPerCpuCore} RPS/core`,
        required: this.requiredAppCores,
        provisioned: this.providedAppCores,
        unit: 'core',
      },
      {
        label: 'RAM App Fleet',
        hint: `~${Math.ceil(this.designConcurrentRequests)} request đồng thời × ${this.avgMemPerRequestMb} MB`,
        required: this.requiredRamGbTotal,
        provisioned: this.providedRamGbTotal,
        unit: 'GB',
      },
      {
        label: 'DB Throughput',
        hint: `capacity = ${this.dbCpuCores} core × ${this.fmt(this.queriesPerSecondPerDbCore, 0)} query/s/core`,
        required: this.designDbQps,
        provisioned: this.dbQueryCapacity,
        unit: 'query/s',
      },
      {
        label: 'DB Connections',
        hint: `pool theo Little's Law + headroom (~${this.poolPerInstance} conn/instance)`,
        required: this.requiredDbConnections,
        provisioned: this.dbMaxConnections,
        unit: 'conn',
      },
    ];

    if (this.cacheHitRatioPercent > 0) {
      rows.push({
        label: 'Redis Memory',
        hint: `working set ≈ read cache/s × TTL ${this.cacheTtlSeconds}s × size request`,
        required: this.designCacheMemoryGb,
        provisioned: this.redisMaxMemoryGb,
        unit: 'GB',
      });
    }

    return rows.map(row => {
      const pct = row.provisioned > 0 ? (row.required / row.provisioned) * 100 : 999;
      return { ...row, pct, status: this.statusOf(pct) };
    });
  }

  private computeRecommendations(): Recommendation[] {
    const items: Recommendation[] = [];
    const utilByLabel = new Map(this.utilization.map(row => [row.label, row]));
    const cpuRow = utilByLabel.get('CPU App Fleet');
    const ramRow = utilByLabel.get('RAM App Fleet');
    const dbRow = utilByLabel.get('DB Throughput');
    const connRow = utilByLabel.get('DB Connections');
    const redisRow = utilByLabel.get('Redis Memory');

    if (this.appInstanceCount < this.minInstancesNeeded) {
      items.push({
        type: 'warn',
        text: `Fleet đang khai báo ${this.appInstanceCount} instance nhưng tải thiết kế cần tối thiểu ${this.minInstancesNeeded} instance (${this.appCpuCoresPerInstance} vCPU / ${this.appRamGbPerInstance} GB mỗi instance). Thêm instance hoặc tăng cấu hình từng instance.`,
      });
    } else {
      items.push({
        type: 'info',
        text: `Fleet ${this.appInstanceCount} instance (tối thiểu cần ${this.minInstancesNeeded}) đủ cho tải thiết kế ${this.fmt(this.designPeakRps)} req/s — app server nên stateless để scale ngang được (xem Cluster demo).`,
      });
    }

    if (cpuRow && cpuRow.status !== 'ok') {
      items.push({
        type: 'warn',
        text: `CPU app fleet đang ở ${Math.round(cpuRow.pct)}% — latency sẽ tăng phi tuyến khi tiến gần 100%. Scale ngang thêm instance, tăng vCPU, hoặc giảm chi phí CPU/request (bớt serialize, nén, N+1 call).`,
      });
    }

    if (ramRow && ramRow.status !== 'ok') {
      items.push({
        type: 'warn',
        text: `RAM app fleet đang ở ${Math.round(ramRow.pct)}% — nguy cơ OOM/GC pressure. Tăng RAM/instance hoặc giảm memory/request (streaming thay vì buffer cả response, giảm payload).`,
      });
    }

    if (dbRow && dbRow.status !== 'ok') {
      items.push({
        type: 'warn',
        text: `DB throughput đang ở ${Math.round(dbRow.pct)}% capacity giả định — tối ưu query/index trước, sau đó cache/read model cho read path, rồi mới nghĩ tới read replica hay scale dọc DB (xem mục 6.2, 6.6).`,
      });
    }

    if (connRow && connRow.status !== 'ok') {
      items.push({
        type: 'warn',
        text: `Connection pool cần ~${this.requiredDbConnections} conn, chạm ${Math.round(connRow.pct)}% max_connections (${this.dbMaxConnections}). Hướng xử lý: connection pooler (PgBouncer/ProxySQL/RDS Proxy), tăng max_connections kèm RAM DB, hoặc giảm latency để giảm concurrency (Little's Law).`,
      });
    }

    if (redisRow && redisRow.status !== 'ok') {
      items.push({
        type: 'warn',
        text: `Redis working set ước tính ~${this.fmt(this.designCacheMemoryGb, 2)} GB đang ở ${Math.round(redisRow.pct)}% maxmemory — nguy cơ evict sớm làm giảm hit ratio (cache thrashing). Tăng RAM Redis, giảm TTL, hoặc chỉ cache key thực sự hot.`,
      });
    }

    if (this.cacheHitRatioPercent === 0 && this.peakDbQueryQps > 50) {
      items.push({
        type: 'warn',
        text: `Chưa có cache nhưng DB query QPS tại peak đã ~${this.fmt(this.peakDbQueryQps, 0)} query/s. Cân nhắc cache/read model cho read path (xem mục 6.2) — write path thì không giảm được bằng cache.`,
      });
    }

    if (this.rowsScannedPerSecond > 1_000_000) {
      items.push({
        type: 'warn',
        text: `Rows scanned/s ~${this.fmt(this.rowsScannedPerSecond, 0)} là quá cao — bottleneck nằm ở query plan/index, không phải hạ tầng. Thêm instance không giải quyết được query chậm (xem mục 2.10, 3.5).`,
      });
    }

    if (this.peakBandwidthMbps > 500) {
      items.push({
        type: 'warn',
        text: `Peak bandwidth ~${this.fmt(this.peakBandwidthMbps, 0)} Mbps outbound. Cân nhắc CDN cho static/semi-static content, nén response (gzip/brotli), giảm payload/request.`,
      });
    }

    items.push({
      type: 'info',
      text: `Write path ~${this.fmt(this.peakWriteDbQueryQps)} query/s không cache được — ưu tiên transaction/unique constraint/idempotency thay vì tối ưu qua cache (xem mục 2.9, 6.1).`,
    });

    if (this.peakRps > this.avgRps * 3) {
      items.push({
        type: 'info',
        text: `Peak cao gấp ~${(this.peakRps / (this.avgRps || 1)).toFixed(1)} lần average — nếu hạ tầng cố định theo peak sẽ lãng phí ngoài giờ. Cân nhắc autoscaling (theo metric hoặc theo lịch nếu peak dự đoán được).`,
      });
    }

    if (this.designConcurrentRequests > 200) {
      items.push({
        type: 'info',
        text: `~${Math.ceil(this.designConcurrentRequests)} request đồng thời tại peak — kiểm tra thread pool / async I/O của framework; xử lý sync blocking sẽ cạn thread trước khi cạn CPU (xem mục 2.6).`,
      });
    }

    if (this.storagePerWindowGB > 10) {
      items.push({
        type: 'info',
        text: `Storage trong model window ~${this.fmt(this.storagePerWindowGB, 1)} GB — nếu volume này lặp lại thường xuyên, cần tính retention, archive dữ liệu nguội và partition theo thời gian/tenant.`,
      });
    }

    items.push({
      type: 'info',
      text: `DB khai báo ${this.dbCpuCores} vCPU / ${this.dbRamGb} GB RAM — capacity thật của DB phụ thuộc buffer pool, working set và index, không suy tuyến tính từ CPU/RAM được. Con số "query/s per core" ở đây là giả định để ước lượng thô; luôn xác nhận bằng benchmark.`,
    });

    return items;
  }

  private computeBottlenecks(): BottleneckSignal[] {
    const rows: BottleneckSignal[] = this.utilization
      .filter(row => row.status !== 'ok')
      .map(row => ({
        label: row.label,
        status: row.status,
        detail: `${Math.round(row.pct)}% utilization: cần ${this.fmt(row.required)} ${row.unit}, đang có ${this.fmt(row.provisioned)} ${row.unit}.`,
      }));

    if (this.rowsScannedPerSecond > 1_000_000) {
      rows.unshift({
        label: 'Query plan / Index',
        status: 'crit',
        detail: `${this.fmt(this.rowsScannedPerSecond, 0)} rows/s: scale app không xử lý được, cần giảm rows scan trước.`,
      });
    }

    if (!rows.length) {
      rows.push({
        label: 'No hard bottleneck',
        status: 'ok',
        detail: 'Các tài nguyên chính đang nằm dưới ngưỡng cảnh báo với giả định hiện tại.',
      });
    }

    return rows;
  }

  private computeDesignOptions(): DesignOption[] {
    const options: DesignOption[] = [];
    const dbRow = this.utilization.find(row => row.label === 'DB Throughput');
    const cpuRow = this.utilization.find(row => row.label === 'CPU App Fleet');
    const connRow = this.utilization.find(row => row.label === 'DB Connections');
    const redisRow = this.utilization.find(row => row.label === 'Redis Memory');

    if (this.rowsScannedPerSecond > 1_000_000) {
      options.push({
        title: 'Tối ưu query/index trước',
        impact: `Giảm rows scan từ ${this.fmt(this.rowsScannedPerSecond, 0)} rows/s, thường hiệu quả hơn tăng máy.`,
        tradeoff: 'Cần xem execution plan, thêm/chỉnh index và benchmark lại.',
        priority: 'high',
      });
    }

    const readPathNeedsRelief =
      (dbRow !== undefined && dbRow.status !== 'ok') ||
      this.readRps >= 100 ||
      this.rowsScannedPerSecond >= 250_000;

    if (this.cacheHitRatioPercent < 70 && this.readRps > this.writeRps && readPathNeedsRelief) {
      options.push({
        title: 'Thêm cache/read model cho read path',
        impact: `Nếu hit 70%, DB QPS đọc giảm còn khoảng ${this.fmt(this.readRps * this.queriesPerRequest * 0.3)} query/s.`,
        tradeoff: 'Tăng complexity về invalidation, TTL và consistency.',
        priority: dbRow && dbRow.status !== 'ok' ? 'high' : 'medium',
      });
    }

    if (cpuRow && cpuRow.status !== 'ok') {
      options.push({
        title: 'Scale ngang app theo profile đã chọn',
        impact: `Dùng ${this.selectedProfile.label} cần khoảng ${this.autosizedInstanceCount} instance cho peak + headroom.`,
        tradeoff: 'Yêu cầu app stateless, health check và autoscaling policy đủ tốt.',
        priority: 'high',
      });
    }

    if (dbRow && dbRow.status !== 'ok') {
      options.push({
        title: 'Tăng DB throughput hoặc tách read',
        impact: `DB cần khoảng ${this.fmt(this.designDbQps)} query/s; với giả định hiện tại cần ~${this.recommendedDbCores} DB vCPU.`,
        tradeoff: 'Scale DB đắt, cần đo thực tế vì query/s/core chỉ là giả định.',
        priority: 'high',
      });
    }

    if (connRow && connRow.status !== 'ok') {
      options.push({
        title: 'Giảm áp lực connection pool',
        impact: `Đặt max_connections khoảng ${this.recommendedDbMaxConnections} hoặc dùng pooler/proxy.`,
        tradeoff: 'Tăng max_connections cần RAM DB; pooler cần cấu hình transaction/session mode đúng.',
        priority: 'medium',
      });
    }

    if (redisRow && redisRow.status !== 'ok') {
      options.push({
        title: 'Resize Redis hoặc giảm working set',
        impact: `Redis nên có khoảng ${this.recommendedRedisMemoryGb} GB nếu giữ TTL/cache như hiện tại.`,
        tradeoff: 'RAM cache đắt; có thể giảm TTL hoặc cache chọn lọc hot keys.',
        priority: 'medium',
      });
    }

    if (!options.length) {
      options.push({
        title: 'Giữ kiến trúc đơn giản và benchmark',
        impact: 'Hiện chưa thấy bottleneck cứng; ưu tiên load test để xác nhận giả định.',
        tradeoff: 'Không nên thêm cache/queue/replica nếu chưa có tín hiệu vận hành rõ.',
        priority: 'low',
      });
    }

    return options;
  }

  private computeDesignSummary(): string {
    const r = this.fmtRps.bind(this);
    const statusText =
      this.verdictStatus === 'crit'
        ? 'Chưa đạt capacity theo giả định hiện tại'
        : this.verdictStatus === 'warn'
          ? 'Có rủi ro cần theo dõi'
          : 'Đạt mức an toàn theo giả định hiện tại';
    const topBottlenecks = this.bottlenecks
      .filter(item => item.status !== 'ok')
      .slice(0, 3)
      .map(item => `- ${item.label}: ${item.detail}`)
      .join('\n');
    const optionText = this.designOptions
      .slice(0, 3)
      .map(item => `- ${item.title}: ${item.impact}`)
      .join('\n');

    return [
      `Design verdict: ${statusText}.`,
      '',
      'Assumptions:',
      this.loadInputMode === 'rps'
        ? `- Traffic input: average ${r(this.directAvgRps)} req/s, peak ${r(this.directPeakRps)} req/s.`
        : `- Scenario: ${this.fmt(this.expectedClients, 0)} lượt nghiệp vụ x ${this.fmt(this.avgRequestsPerClientPerDay, 0)} API call/lượt trong ${this.trafficWindowHours}h; ${this.peakTrafficPercent}% dồn vào ${this.peakWindowMinutes} phút cao điểm.`,
      `- Total request volume in modeled window: ${this.fmt(this.effectiveRequestsPerDay, 0)} requests.`,
      `- Peak: ${r(this.peakRps)} req/s, design peak sau ${this.safetyMarginPercent}% headroom: ${r(this.designPeakRps)} req/s.`,
      `- Backend cost: ${this.queriesPerRequest} DB query/request, cache hit ${this.cacheHitRatioPercent}%, p95 latency ${this.p95LatencyMs}ms.`,
      '',
      'Recommended sizing:',
      `- App: ${this.autosizedInstanceCount} x ${this.selectedProfile.label} (${this.selectedProfile.cpuCores} vCPU / ${this.selectedProfile.ramGb} GB).`,
      `- DB: ~${this.recommendedDbCores} vCPU, ~${this.recommendedDbRamGb} GB RAM, max_connections ~${this.recommendedDbMaxConnections}.`,
      this.cacheHitRatioPercent > 0 ? `- Redis: ~${this.recommendedRedisMemoryGb} GB maxmemory.` : '- Redis: chưa bắt buộc nếu chưa dùng cache.',
      '',
      topBottlenecks ? `Bottlenecks:\n${topBottlenecks}` : 'Bottlenecks:\n- Chưa thấy bottleneck cứng.',
      '',
      `Recommended actions:\n${optionText}`,
    ].join('\n');
  }

  private computeDerivation(): DerivationStep[] {
    const f = this.fmt.bind(this);
    const r = this.fmtRps.bind(this);
    if (this.loadInputMode === 'rps') {
      const steps: DerivationStep[] = [
        {
          label: 'Average RPS',
          formula: 'Nhap truc tiep theo gia dinh bai toan',
          result: `${r(this.avgRps)} req/s`,
        },
        {
          label: 'Peak RPS',
          formula: 'Nhap truc tiep theo peak QPS/RPS',
          result: `${r(this.peakRps)} req/s`,
        },
        {
          label: 'Volume uoc tinh',
          formula: `${r(this.avgRps)} req/s x ${this.trafficWindowHours}h x 3,600s`,
          result: `${f(this.effectiveRequestsPerDay, 0)} requests`,
        },
        {
          label: `Design RPS (headroom ${this.safetyMarginPercent}%)`,
          formula: `${r(this.peakRps)} x ${this.safetyMargin.toFixed(2)}`,
          result: `${r(this.designPeakRps)} req/s`,
        },
        {
          label: 'Read / Write RPS',
          formula: `${r(this.peakRps)} x ${100 - this.writePercent}% / ${this.writePercent}%`,
          result: `${r(this.readRps)} / ${r(this.writeRps)} req/s`,
        },
        {
          label: 'DB QPS before cache',
          formula: `${r(this.peakRps)} req/s x ${this.queriesPerRequest} query/request`,
          result: `${r(this.peakDbQueryQps)} query/s`,
        },
        {
          label: `DB QPS after cache (${this.cacheHitRatioPercent}% hit)`,
          formula: `read ${r(this.readDbQueryQpsAfterCache)} + write ${r(this.peakWriteDbQueryQps)}`,
          result: `${r(this.dbQueryQpsAfterCache)} query/s`,
        },
        {
          label: 'Rows scanned/s',
          formula: `${f(this.dbQueryQpsAfterCache)} query/s x ${f(this.avgRowsScannedPerQuery, 0)} rows`,
          result: `${f(this.rowsScannedPerSecond, 0)} rows/s`,
        },
        {
          label: "Concurrency (Little's Law)",
          formula: `${r(this.peakRps)} req/s x ${(this.p95LatencyMs / 1000).toFixed(2)}s, then headroom`,
          result: `${f(this.concurrentRequests)} -> ${f(this.designConcurrentRequests)} request`,
        },
        {
          label: 'Peak bandwidth',
          formula: `${r(this.peakRps)} req/s x ${this.avgRequestSizeKB} KB x 8 / 1,024`,
          result: `${f(this.peakBandwidthMbps)} Mbps`,
        },
        {
          label: 'Storage forecast',
          formula: `${f(this.effectiveRequestsPerDay, 0)} x ${this.writePercent}% write x ${this.avgRequestSizeKB} KB`,
          result: `${f(this.storagePerWindowGB)} GB / model window`,
        },
        {
          label: 'Min app instances',
          formula: `ceil(max(CPU: ${f(this.requiredAppCores)} core, RAM: ${f(this.requiredRamGbTotal)} GB) / instance shape)`,
          result: `${this.minInstancesNeeded} instance`,
        },
      ];

      if (this.cacheHitRatioPercent > 0) {
        steps.splice(7, 0, {
          label: 'Redis working set',
          formula: `${f(this.cachedReadsPerSecond)} read cache/s x ${this.cacheTtlSeconds}s TTL x ${this.avgRequestSizeKB} KB, then headroom`,
          result: `${f(this.estimatedCacheMemoryGb, 2)} -> ${f(this.designCacheMemoryGb, 2)} GB`,
        });
      }

      return steps;
    }

    const steps: DerivationStep[] = [
      {
        label: 'Requests từ scenario',
        formula: `${f(this.expectedClients, 0)} lượt nghiệp vụ × ${f(this.avgRequestsPerClientPerDay, 0)} API call/lượt`,
        result: `${f(this.modeledRequestsPerDay, 0)} requests`,
      },
      {
        label: 'Average RPS',
        formula: `${f(this.effectiveRequestsPerDay, 0)} / (${this.trafficWindowHours}h x 3,600s)`,
        result: `${r(this.avgRps)} req/s`,
      },
      {
        label: 'Peak RPS',
        formula: `${f(this.effectiveRequestsPerDay, 0)} x ${this.peakTrafficPercent}% / (${this.peakWindowMinutes}m x 60s)`,
        result: `${r(this.peakRps)} req/s`,
      },
      {
        label: `RPS thiết kế (headroom ${this.safetyMarginPercent}%)`,
        formula: `${r(this.peakRps)} × ${this.safetyMargin.toFixed(2)}`,
        result: `${r(this.designPeakRps)} req/s`,
      },
      {
        label: 'Read / Write RPS (peak)',
        formula: `${r(this.peakRps)} × ${100 - this.writePercent}% / ${this.writePercent}%`,
        result: `${r(this.readRps)} / ${r(this.writeRps)} req/s`,
      },
      {
        label: 'DB QPS trước cache',
        formula: `${r(this.peakRps)} req/s × ${this.queriesPerRequest} query/request`,
        result: `${r(this.peakDbQueryQps)} query/s`,
      },
      {
        label: `DB QPS sau cache (hit ${this.cacheHitRatioPercent}%)`,
        formula: `read ${r(this.readDbQueryQpsAfterCache)} + write ${r(this.peakWriteDbQueryQps)}`,
        result: `${r(this.dbQueryQpsAfterCache)} query/s`,
      },
      {
        label: 'Rows scanned/s',
        formula: `${f(this.dbQueryQpsAfterCache)} query/s × ${f(this.avgRowsScannedPerQuery, 0)} rows`,
        result: `${f(this.rowsScannedPerSecond, 0)} rows/s`,
      },
      {
        label: "Concurrency (Little's Law)",
        formula: `${r(this.peakRps)} req/s × ${(this.p95LatencyMs / 1000).toFixed(2)}s → × headroom`,
        result: `${f(this.concurrentRequests)} → ${f(this.designConcurrentRequests)} request`,
      },
      {
        label: 'Peak bandwidth (outbound)',
        formula: `${r(this.peakRps)} req/s × ${this.avgRequestSizeKB} KB × 8 / 1,024`,
        result: `${f(this.peakBandwidthMbps)} Mbps`,
      },
      {
        label: 'Storage phát sinh',
        formula: `${f(this.effectiveRequestsPerDay, 0)} x ${this.writePercent}% write x ${this.avgRequestSizeKB} KB`,
        result: `${f(this.storagePerWindowGB)} GB / model window`,
      },
      {
        label: 'Số instance tối thiểu',
        formula: `ceil(max(CPU: ${f(this.requiredAppCores)} core, RAM: ${f(this.requiredRamGbTotal)} GB) / cấu hình instance)`,
        result: `${this.minInstancesNeeded} instance`,
      },
    ];

    if (this.cacheHitRatioPercent > 0) {
      steps.splice(7, 0, {
        label: 'Redis working set',
        formula: `${f(this.cachedReadsPerSecond)} read cache/s × ${this.cacheTtlSeconds}s TTL × ${this.avgRequestSizeKB} KB → × headroom`,
        result: `${f(this.estimatedCacheMemoryGb, 2)} → ${f(this.designCacheMemoryGb, 2)} GB`,
      });
    }

    return steps;
  }

  private fmt(value: number, digits = 1): string {
    return value.toLocaleString('en-US', { maximumFractionDigits: digits });
  }

  private fmtRps(value: number): string {
    const digits = Math.abs(value) < 10 ? 3 : 1;
    return this.fmt(value, digits);
  }

  private syncActiveProfileFromCurrentShape(): void {
    const profile = this.instanceProfiles.find(
      item => item.cpuCores === this.appCpuCoresPerInstance && item.ramGb === this.appRamGbPerInstance,
    );
    this.activeProfileId = profile?.id ?? this.activeProfileId;
  }

  private syncPeakHoursFromMinutes(): void {
    this.peakHours = Math.max(1, Math.ceil(this.peakWindowMinutes / 60));
  }

  private get chartWindowHours(): number {
    return Math.max(1, Math.ceil(this.trafficWindowHours));
  }

  // ===== Chart =====

  private renderChart(): void {
    if (!this.chartCanvas) {
      return;
    }

    const hourly = this.buildChartData();
    const chartHours = this.chartWindowHours;
    const labels = Array.from({ length: chartHours }, (_, hour) => `T+${hour}h`);
    const avgLine = Array(chartHours).fill(this.chartValue(this.avgRps));
    const capacityLine = Array(chartHours).fill(this.chartValue(this.fleetCapacityRps));

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets[0].data = hourly;
      this.chart.data.datasets[1].data = avgLine;
      this.chart.data.datasets[2].data = capacityLine;
      this.chart.update();
      return;
    }

    this.chart = new Chart(this.chartCanvas.nativeElement, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'RPS theo giờ',
            data: hourly,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 8,
          },
          {
            label: 'Average RPS',
            data: avgLine,
            borderColor: '#94a3b8',
            borderDash: [6, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
          {
            label: 'Capacity fleet (CPU)',
            data: capacityLine,
            borderColor: '#dc2626',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'RPS' } },
          x: { title: { display: true, text: 'Giờ trong window' } },
        },
        plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 18 } } },
      },
    });
  }

  private buildChartData(): number[] {
    const chartHours = this.chartWindowHours;
    const peakStart = this.loadInputMode === 'scenario' ? Math.min(Math.max(0, this.peakStartHour), chartHours - 1) : 0;
    const peakDurationHours = this.loadInputMode === 'scenario' ? Math.max(1, Math.ceil(this.peakWindowMinutes / 60)) : 1;
    const peakEnd = Math.min(chartHours, peakStart + peakDurationHours);

    return Array.from({ length: chartHours }, (_, hour) => {
      const inPeak = hour >= peakStart && hour < peakEnd;
      return this.chartValue(inPeak ? this.peakRps : this.offPeakRps);
    });
  }

  private chartValue(value: number): number {
    return Math.abs(value) < 10 ? Number(value.toFixed(3)) : Math.round(value);
  }
}
