import { Component, OnDestroy } from '@angular/core';
import { StepHistoryEntry } from '../../database/shared/step-history/step-history.component';

type ScenarioId = 'http-retry' | 'kafka-redelivery';
type NodeId =
  | 'client'
  | 'api'
  | 'redis'
  | 'payment-db'
  | 'producer'
  | 'kafka'
  | 'consumer'
  | 'inbox-db';
type StateTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface DiagramNode {
  id: NodeId;
  label: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: StateTone;
}

interface DiagramEdge {
  id: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
}

interface DiagramZone {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone: 'platform' | 'cache' | 'storage';
}

interface DiagramState {
  activeNode: NodeId | null;
  activeEdge: string | null;
  tokenX: number;
  tokenY: number;
  tokenLabel: string;
  tokenTone: StateTone;
  attempt: number;
  response: string;
  redisStatus: 'EMPTY' | 'PROCESSING' | 'SUCCESS' | 'HIT';
  redisResponse: string;
  dbIdempotencyStatus: 'EMPTY' | 'PROCESSING' | 'SUCCESS' | 'HIT';
  dbResponse: string;
  kafkaStatus: 'EMPTY' | 'STORED' | 'DELIVERING' | 'REDELIVERED' | 'COMMITTED';
  kafkaAttempt: number;
  consumerStatus: string;
  paymentIds: string[];
  processedEventIds: string[];
  outcome: string;
}

interface IdempotencyStep {
  title: string;
  detail: string;
  actor: string;
  operation: string;
  state: Partial<DiagramState>;
}

interface DiagramScenario {
  id: ScenarioId;
  label: string;
  description: string;
  question: string;
  architecture: string;
  zones: DiagramZone[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  steps: IdempotencyStep[];
}

const INITIAL_STATE: DiagramState = {
  activeNode: null,
  activeEdge: null,
  tokenX: 92,
  tokenY: 192,
  tokenLabel: 'READY',
  tokenTone: 'neutral',
  attempt: 0,
  response: 'Chưa có response',
  redisStatus: 'EMPTY',
  redisResponse: '—',
  dbIdempotencyStatus: 'EMPTY',
  dbResponse: '—',
  kafkaStatus: 'EMPTY',
  kafkaAttempt: 0,
  consumerStatus: 'Chưa poll message',
  paymentIds: [],
  processedEventIds: [],
  outcome: 'Chưa có kết quả',
};

@Component({
  selector: 'app-idempotency-demo',
  templateUrl: './idempotency-demo.component.html',
  styleUrls: ['./idempotency-demo.component.scss'],
})
export class IdempotencyDemoComponent implements OnDestroy {
  readonly idempotencyKey = 'payment:order-781:v1';
  readonly requestHash = 'sha256:8bf7…21ac';
  readonly eventId = 'payment.created:PAY-2041';
  readonly topic = 'payment-events';

  readonly scenarios: DiagramScenario[] = [this.buildHttpScenario(), this.buildKafkaScenario()];

  activeScenarioId: ScenarioId = 'http-retry';
  currentStepIndex = -1;
  speedMs = 1000;
  isPlaying = false;

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    this.stop();
  }

  get scenario(): DiagramScenario {
    return this.scenarios.find(item => item.id === this.activeScenarioId)!;
  }

  get currentStep(): IdempotencyStep | null {
    return this.currentStepIndex >= 0 ? this.scenario.steps[this.currentStepIndex] : null;
  }

  get state(): DiagramState {
    return this.scenario.steps
      .slice(0, this.currentStepIndex + 1)
      .reduce<DiagramState>((current, step) => ({ ...current, ...step.state }), {
        ...INITIAL_STATE,
      });
  }

  get progressPercent(): number {
    return ((this.currentStepIndex + 1) / this.scenario.steps.length) * 100;
  }

  get executedStepLog(): StepHistoryEntry[] {
    if (this.currentStepIndex < 0) return [];

    return this.scenario.steps.slice(0, this.currentStepIndex + 1).map(step => ({
      actor: step.actor,
      operation: step.operation,
      title: step.title,
      note: step.detail,
      tone:
        step.actor === 'Client' || step.actor === 'Producer'
          ? 'primary'
          : step.actor === 'Payment API' || step.actor === 'Consumer'
            ? 'secondary'
            : 'neutral',
    }));
  }

  get isFinalStep(): boolean {
    return this.currentStepIndex === this.scenario.steps.length - 1;
  }

  selectScenario(scenarioId: ScenarioId): void {
    if (scenarioId === this.activeScenarioId) return;
    this.activeScenarioId = scenarioId;
    this.reset();
  }

  previousStep(): void {
    this.stop();
    this.currentStepIndex = Math.max(-1, this.currentStepIndex - 1);
  }

  nextStep(): void {
    if (this.isFinalStep) {
      this.reset();
      return;
    }
    this.currentStepIndex += 1;
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stop();
      return;
    }

    if (this.isFinalStep) {
      this.currentStepIndex = -1;
    }

    this.isPlaying = true;
    this.nextStep();
    this.startAutoTimer();
  }

  setSpeed(speedMs: number): void {
    const wasPlaying = this.isPlaying;
    this.stop();
    this.speedMs = speedMs;

    if (wasPlaying && !this.isFinalStep) {
      this.isPlaying = true;
      this.startAutoTimer();
    }
  }

  reset(): void {
    this.stop();
    this.currentStepIndex = -1;
  }

  nodeClass(node: DiagramNode): Record<string, boolean> {
    return {
      active: this.state.activeNode === node.id,
      [`tone-${node.tone}`]: true,
    };
  }

  edgeClass(edge: DiagramEdge): Record<string, boolean> {
    return {
      active: this.state.activeEdge === edge.id,
    };
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isPlaying = false;
  }

  private startAutoTimer(): void {
    this.timer = setInterval(() => {
      if (this.isFinalStep) {
        this.stop();
        return;
      }
      this.currentStepIndex += 1;
    }, this.speedMs);
  }

  private buildHttpScenario(): DiagramScenario {
    return {
      id: 'http-retry',
      label: 'HTTP retry + Database',
      description:
        'Database giữ idempotency record và payment. Redis chỉ là fast-path có thể hết TTL hoặc mất dữ liệu.',
      question: 'Nếu Redis miss, API đọc source of truth nào để không charge lại?',
      architecture: 'Client → Payment API → Redis fast-path / Database source of truth',
      zones: [
        {
          id: 'payment-platform',
          label: 'PAYMENT PLATFORM',
          x: 268,
          y: 48,
          width: 772,
          height: 292,
          tone: 'platform',
        },
        {
          id: 'cache-zone',
          label: 'OPTIONAL FAST-PATH',
          x: 548,
          y: 72,
          width: 214,
          height: 140,
          tone: 'cache',
        },
        {
          id: 'storage-zone',
          label: 'SOURCE OF TRUTH',
          x: 796,
          y: 188,
          width: 226,
          height: 140,
          tone: 'storage',
        },
      ],
      nodes: [
        {
          id: 'client',
          label: 'Client',
          subtitle: 'Web / Mobile',
          x: 36,
          y: 146,
          width: 168,
          height: 96,
          tone: 'primary',
        },
        {
          id: 'api',
          label: 'Payment API',
          subtitle: 'Stateless service',
          x: 300,
          y: 146,
          width: 176,
          height: 96,
          tone: 'warning',
        },
        {
          id: 'redis',
          label: 'Redis',
          subtitle: 'Response cache',
          x: 570,
          y: 96,
          width: 170,
          height: 96,
          tone: 'danger',
        },
        {
          id: 'payment-db',
          label: 'Relational DB',
          subtitle: 'Idempotency + payment',
          x: 820,
          y: 212,
          width: 180,
          height: 96,
          tone: 'success',
        },
      ],
      edges: [
        {
          id: 'client-api',
          path: 'M204 194 L300 194',
          label: 'HTTPS',
          labelX: 252,
          labelY: 174,
        },
        {
          id: 'api-redis',
          path: 'M476 176 C512 176 528 144 570 144',
          label: 'GET / SET cache',
          labelX: 522,
          labelY: 128,
        },
        {
          id: 'api-db',
          path: 'M476 214 C604 314 706 276 820 260',
          label: 'transaction / fallback',
          labelX: 642,
          labelY: 326,
        },
      ],
      steps: [
        {
          actor: 'Client',
          operation: 'POST #1',
          title: 'Client gửi payment intent',
          detail: `Request mang Idempotency-Key ${this.idempotencyKey}. Key giữ nguyên cho mọi retry của cùng intent.`,
          state: {
            activeNode: 'client',
            activeEdge: 'client-api',
            tokenX: 252,
            tokenY: 194,
            tokenLabel: 'POST #1',
            tokenTone: 'primary',
            attempt: 1,
            response: 'Đang chờ',
          },
        },
        {
          actor: 'Payment API',
          operation: 'GET CACHE',
          title: 'API kiểm tra Redis fast-path',
          detail:
            'Redis chưa có cached response nên trả MISS. Cache miss không cho phép charge ngay; API phải đi tiếp tới database.',
          state: {
            activeNode: 'redis',
            activeEdge: 'api-redis',
            tokenX: 532,
            tokenY: 144,
            tokenLabel: 'MISS',
            tokenTone: 'danger',
          },
        },
        {
          actor: 'Payment API',
          operation: 'INSERT KEY',
          title: 'API claim key trong database',
          detail:
            'Unique constraint trên IdempotencyRequests claim key atomically. Database quyết định request nào sở hữu intent.',
          state: {
            activeNode: 'payment-db',
            activeEdge: 'api-db',
            tokenX: 782,
            tokenY: 260,
            tokenLabel: 'CLAIM KEY',
            tokenTone: 'success',
            dbIdempotencyStatus: 'PROCESSING',
          },
        },
        {
          actor: 'Payment API',
          operation: 'COMMIT TX',
          title: 'Database commit payment và idempotency result',
          detail:
            'PAY-2041 và IdempotencyRequests.SUCCESS được commit trong cùng transaction. Đây là trạng thái bền vững để retry.',
          state: {
            activeNode: 'payment-db',
            activeEdge: 'api-db',
            tokenX: 800,
            tokenY: 260,
            tokenLabel: 'COMMIT',
            tokenTone: 'success',
            dbIdempotencyStatus: 'SUCCESS',
            dbResponse: '201 · PAY-2041',
            paymentIds: ['PAY-2041'],
          },
        },
        {
          actor: 'Payment API',
          operation: 'SET CACHE',
          title: 'API cache response sau commit',
          detail:
            'Sau khi DB commit, API lưu response vào Redis để retry phổ biến không cần đọc DB. Redis không thay thế record bền vững.',
          state: {
            activeNode: 'redis',
            activeEdge: 'api-redis',
            tokenX: 532,
            tokenY: 144,
            tokenLabel: 'CACHE 201',
            tokenTone: 'danger',
            redisStatus: 'SUCCESS',
            redisResponse: '201 · PAY-2041',
          },
        },
        {
          actor: 'Network',
          operation: 'TIMEOUT',
          title: 'Response mất và cache hết TTL',
          detail:
            'Client không nhận response. Trước lần retry, cache entry hết TTL; DB vẫn giữ payment và idempotency result.',
          state: {
            activeNode: 'client',
            activeEdge: 'client-api',
            tokenX: 252,
            tokenY: 214,
            tokenLabel: 'TIMEOUT',
            tokenTone: 'warning',
            response: 'Timeout · chưa biết kết quả',
            redisStatus: 'EMPTY',
            redisResponse: '—',
          },
        },
        {
          actor: 'Client',
          operation: 'POST #2',
          title: 'Client retry cùng idempotency key',
          detail:
            'Client giữ nguyên key và payload. API nhận attempt thứ hai cho cùng payment intent.',
          state: {
            activeNode: 'api',
            activeEdge: 'client-api',
            tokenX: 252,
            tokenY: 194,
            tokenLabel: 'POST #2',
            tokenTone: 'primary',
            attempt: 2,
          },
        },
        {
          actor: 'Payment API',
          operation: 'GET CACHE',
          title: 'Redis miss ở lần retry',
          detail:
            'Redis không còn key. API không kết luận request chưa từng chạy; nó fallback sang IdempotencyRequests trong DB.',
          state: {
            activeNode: 'redis',
            activeEdge: 'api-redis',
            tokenX: 532,
            tokenY: 144,
            tokenLabel: 'MISS',
            tokenTone: 'danger',
          },
        },
        {
          actor: 'Payment API',
          operation: 'SELECT KEY',
          title: 'API lấy idempotency result từ database',
          detail:
            'Database trả SUCCESS và response PAY-2041. Request hash khớp nên API biết side effect đã commit.',
          state: {
            activeNode: 'payment-db',
            activeEdge: 'api-db',
            tokenX: 782,
            tokenY: 260,
            tokenLabel: 'DB HIT',
            tokenTone: 'success',
            dbIdempotencyStatus: 'HIT',
          },
        },
        {
          actor: 'Payment API',
          operation: 'REPLAY 201',
          title: 'API cache lại và replay response',
          detail:
            'API repopulate Redis rồi trả response đã lưu. Không có payment row thứ hai dù cache từng bị mất.',
          state: {
            activeNode: 'client',
            activeEdge: 'client-api',
            tokenX: 220,
            tokenY: 194,
            tokenLabel: '201 CACHED',
            tokenTone: 'success',
            redisStatus: 'SUCCESS',
            redisResponse: '201 · PAY-2041',
            response: '201 · PAY-2041 · replayed',
            outcome: '2 HTTP attempts → 1 payment row',
          },
        },
      ],
    };
  }

  private buildKafkaScenario(): DiagramScenario {
    return {
      id: 'kafka-redelivery',
      label: 'Kafka redelivery + Inbox',
      description:
        'Kafka lưu event theo partition/offset. Consumer ghi eventId vào bảng ProcessedMessages cùng business write trong một transaction.',
      question:
        'Consumer crash trước khi commit offset thì message được lấy lại thế nào mà không ghi trùng?',
      architecture: 'Producer → Kafka topic → Consumer → Inbox + business database',
      zones: [
        {
          id: 'async-pipeline',
          label: 'AT-LEAST-ONCE PROCESSING PIPELINE',
          x: 268,
          y: 48,
          width: 772,
          height: 292,
          tone: 'platform',
        },
      ],
      nodes: [
        {
          id: 'producer',
          label: 'Producer',
          subtitle: 'Payment service',
          x: 42,
          y: 142,
          width: 172,
          height: 100,
          tone: 'primary',
        },
        {
          id: 'kafka',
          label: 'Kafka',
          subtitle: 'Topic + partition',
          x: 314,
          y: 142,
          width: 172,
          height: 100,
          tone: 'warning',
        },
        {
          id: 'consumer',
          label: 'Consumer',
          subtitle: 'Accounting worker',
          x: 586,
          y: 142,
          width: 172,
          height: 100,
          tone: 'danger',
        },
        {
          id: 'inbox-db',
          label: 'Relational DB',
          subtitle: 'Inbox + ledger',
          x: 858,
          y: 142,
          width: 172,
          height: 100,
          tone: 'success',
        },
      ],
      edges: [
        {
          id: 'producer-kafka',
          path: 'M214 192 L314 192',
          label: 'produce',
          labelX: 264,
          labelY: 175,
        },
        {
          id: 'kafka-consumer',
          path: 'M486 192 L586 192',
          label: 'poll / redeliver',
          labelX: 536,
          labelY: 175,
        },
        {
          id: 'consumer-db',
          path: 'M758 192 L858 192',
          label: 'DB transaction',
          labelX: 808,
          labelY: 175,
        },
      ],
      steps: [
        {
          actor: 'Producer',
          operation: 'PRODUCE',
          title: 'Producer phát PaymentCreated',
          detail: `Event mang eventId ${this.eventId}. Identifier này ổn định khi Kafka hoặc producer gửi lại cùng event.`,
          state: {
            activeNode: 'producer',
            activeEdge: 'producer-kafka',
            tokenX: 264,
            tokenY: 192,
            tokenLabel: 'PRODUCE',
            tokenTone: 'primary',
          },
        },
        {
          actor: 'Kafka',
          operation: 'APPEND',
          title: 'Kafka lưu message',
          detail:
            'Broker append event vào payment-events, partition 2, offset 418. Message còn trong log sau khi consumer đọc.',
          state: {
            activeNode: 'kafka',
            activeEdge: 'producer-kafka',
            tokenX: 286,
            tokenY: 192,
            tokenLabel: 'P2 · O418',
            tokenTone: 'warning',
            kafkaStatus: 'STORED',
            kafkaAttempt: 1,
          },
        },
        {
          actor: 'Consumer',
          operation: 'POLL',
          title: 'Consumer lấy message từ Kafka',
          detail:
            'Poll không xóa message khỏi Kafka. Offset chỉ được xem là hoàn tất sau khi consumer commit.',
          state: {
            activeNode: 'consumer',
            activeEdge: 'kafka-consumer',
            tokenX: 536,
            tokenY: 192,
            tokenLabel: 'POLL #1',
            tokenTone: 'danger',
            kafkaStatus: 'DELIVERING',
            consumerStatus: 'Đang xử lý offset 418',
          },
        },
        {
          actor: 'Consumer',
          operation: 'DB TX',
          title: 'Consumer ghi Inbox và ledger',
          detail:
            'Một database transaction chèn eventId vào ProcessedMessages và ghi ledger PAY-2041. Unique constraint bảo vệ eventId.',
          state: {
            activeNode: 'inbox-db',
            activeEdge: 'consumer-db',
            tokenX: 808,
            tokenY: 192,
            tokenLabel: 'COMMIT TX',
            tokenTone: 'success',
            paymentIds: ['LEDGER-PAY-2041'],
            processedEventIds: [this.eventId],
            consumerStatus: 'Business write đã commit',
          },
        },
        {
          actor: 'Consumer',
          operation: 'CRASH',
          title: 'Consumer crash trước khi commit offset',
          detail:
            'Database đã commit nhưng Kafka chưa nhận offset commit. Sau rebalance, broker phải giao offset 418 lần nữa.',
          state: {
            activeNode: 'consumer',
            activeEdge: null,
            tokenX: 786,
            tokenY: 192,
            tokenLabel: 'CRASH',
            tokenTone: 'danger',
            consumerStatus: 'Crash · offset chưa commit',
          },
        },
        {
          actor: 'Kafka',
          operation: 'REDELIVER',
          title: 'Kafka giao lại cùng message',
          detail:
            'At-least-once delivery cho phép cùng partition/offset xuất hiện lại. Đây là hành vi bình thường, không phải broker hỏng.',
          state: {
            activeNode: 'kafka',
            activeEdge: 'kafka-consumer',
            tokenX: 536,
            tokenY: 192,
            tokenLabel: 'POLL #2',
            tokenTone: 'warning',
            kafkaStatus: 'REDELIVERED',
            kafkaAttempt: 2,
            consumerStatus: 'Nhận lại offset 418',
          },
        },
        {
          actor: 'Consumer',
          operation: 'INSERT EVENT',
          title: 'Consumer kiểm tra eventId trong DB',
          detail:
            'INSERT ProcessedMessages gặp unique conflict vì eventId đã tồn tại. Consumer suy ra business write của lần đầu đã commit.',
          state: {
            activeNode: 'inbox-db',
            activeEdge: 'consumer-db',
            tokenX: 808,
            tokenY: 192,
            tokenLabel: 'DUPLICATE',
            tokenTone: 'success',
            consumerStatus: 'Duplicate → no-op',
          },
        },
        {
          actor: 'Consumer',
          operation: 'COMMIT OFFSET',
          title: 'Consumer bỏ qua side effect và commit offset',
          detail:
            'Consumer không ghi ledger lần hai, sau đó commit offset 418. Kafka có thể dọn message theo retention độc lập.',
          state: {
            activeNode: 'kafka',
            activeEdge: 'kafka-consumer',
            tokenX: 536,
            tokenY: 192,
            tokenLabel: 'ACK O418',
            tokenTone: 'success',
            kafkaStatus: 'COMMITTED',
            consumerStatus: 'Offset 418 đã commit',
            outcome: '2 deliveries → 1 ledger row',
          },
        },
      ],
    };
  }
}
