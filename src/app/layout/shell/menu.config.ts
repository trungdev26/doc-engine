export interface MenuItem {
  label: string;
  link?: string;
  open?: boolean;
  children?: MenuItem[];
}

export interface MenuGroup {
  title: string;
  link?: string;
  open?: boolean;
  disabled?: boolean;
  items?: MenuItem[];
}

export interface MenuSection {
  title: string;
  icon: string;
  open?: boolean;
  groups?: MenuGroup[];
  items?: MenuItem[];
}

const INDEX_PREFIX_PATTERN = /^(\d+(?:\.\d+)*)(?:\.\s*|\s+)/;

function removeIndexPrefix(value: string): string {
  return value.replace(INDEX_PREFIX_PATTERN, '').trim();
}

function addIndexPrefix(value: string, index: string): string {
  return `${index}. ${removeIndexPrefix(value)}`;
}

function addItemIndexes(
  items: MenuItem[] | undefined,
  parentIndex: string,
): MenuItem[] | undefined {
  return items?.map((item, index) => {
    const itemIndex = `${parentIndex}.${index + 1}`;

    return {
      ...item,
      label: addIndexPrefix(item.label, itemIndex),
      children: addItemIndexes(item.children, itemIndex),
    };
  });
}

const RESERVED_GROUP_TITLES = new Set(['Nâng cao', 'Ứng dụng']);

function groupFoundationContent(sections: MenuSection[]): MenuSection[] {
  return sections.map(section => {
    const reservedGroups = section.groups?.filter(group =>
      RESERVED_GROUP_TITLES.has(removeIndexPrefix(group.title)),
    );
    const foundationGroups = section.groups?.filter(
      group => !RESERVED_GROUP_TITLES.has(removeIndexPrefix(group.title)),
    );
    const alreadyGrouped =
      !section.items?.length &&
      foundationGroups?.length === 1 &&
      removeIndexPrefix(foundationGroups[0].title) === 'Nền tảng';

    if (alreadyGrouped) {
      return section;
    }

    const foundationItems: MenuItem[] = [
      ...(section.items ?? []),
      ...(foundationGroups ?? []).flatMap(group =>
        removeIndexPrefix(group.title) === 'Nền tảng'
          ? (group.items ?? [])
          : [{ label: group.title, link: group.link, open: group.open, children: group.items }],
      ),
    ];

    return {
      ...section,
      items: undefined,
      groups: [
        {
          title: 'Nền tảng',
          items: foundationItems,
        },
        ...(reservedGroups ?? []),
      ],
    };
  });
}

function addCascadingIndexes(sections: MenuSection[]): MenuSection[] {
  return sections.map(section => {
    const sectionItems = section.items?.map((item, index) => {
      const itemIndex = String(index + 1);

      return {
        ...item,
        label: addIndexPrefix(item.label, itemIndex),
        children: addItemIndexes(item.children, itemIndex),
      };
    });
    const groupIndexOffset = sectionItems?.length ?? 0;

    return {
      ...section,
      items: sectionItems,
      groups: section.groups?.map((group, index) => {
        const groupIndex = String(groupIndexOffset + index + 1);

        return {
          ...group,
          title: addIndexPrefix(group.title, groupIndex),
          items: addItemIndexes(group.items, groupIndex),
        };
      }),
    };
  });
}

const MENU_SECTION_ORDER = [
  'Frontend Engineering',
  'Backend Engineering',
  'Security',
  'Network',
  'System Design',
  'Design Patterns',
  'Database',
  'Angular',
  '.NET Core',
];

export const MENU_SECTIONS: MenuSection[] = addCascadingIndexes(
  groupFoundationContent([
    {
      title: 'Angular',
      icon: 'appstore',
      groups: [
        {
          title: '01. Module',
          items: [{ label: 'Lý thuyết', link: '/angular/modules/theory' }],
        },
        {
          title: '02. Decorator',
          items: [{ label: 'Lý thuyết', link: '/angular/decorators/theory' }],
        },
        {
          title: '03. Change Detection',
          items: [
            { label: 'Lý thuyết', link: '/angular/change-detection/theory' },
            { label: 'Demo', link: '/angular/change-detection/demo' },
          ],
        },
        {
          title: '04. Component Patterns',
          items: [{ label: 'Lý thuyết', link: '/angular/base-component-pattern/theory' }],
        },
        {
          title: '05. Component Lifecycle',
          items: [{ label: 'Lý thuyết', link: '/angular/component-lifecycle/theory' }],
        },
        {
          title: '06. CSS & Styling',
          items: [{ label: 'Lý thuyết', link: '/angular/css/theory' }],
        },
        {
          title: '07. Forms',
          items: [
            {
              label: '01. Nền tảng',
              link: '/angular/forms/theory',
            },
            {
              label: '02. Validation và lifecycle',
              link: '/angular/forms/validation-lifecycle',
            },
            {
              label: '03. Dynamic Forms và production',
              link: '/angular/forms/dynamic-production',
            },
            {
              label: '04. ControlValueAccessor',
              link: '/angular/forms/control-value-accessor',
            },
            {
              label: '05. Kiểm thử',
              link: '/angular/forms/testing',
            },
          ],
        },
        {
          title: '08. Router',
          items: [
            { label: 'Lý thuyết', link: '/angular/router/theory' },
            { label: 'Guards', link: '/angular/router/guard-case-studies' },
          ],
        },
        {
          title: '09. RxJS',
          items: [{ label: 'Lý thuyết', link: '/angular/rxjs/theory' }],
        },
        {
          title: '10. State Management',
          items: [{ label: 'Lý thuyết', link: '/angular/state-management/theory' }],
        },
        {
          title: '11. Dependency Injection',
          items: [{ label: 'Lý thuyết', link: '/angular/dependency-injection/theory' }],
        },
        {
          title: '12. HTTP & Interceptor',
          items: [{ label: 'Lý thuyết', link: '/angular/http/theory' }],
        },
        {
          title: '13. Directives',
          items: [
            {
              label: '01. Lộ trình học',
              link: '/angular/directives/learning-path',
            },
            {
              label: '02. Lý thuyết chi tiết',
              link: '/angular/directives/theory',
            },
            {
              label: '03. Thiết kế production',
              link: '/angular/directives/production-senior',
            },
            {
              label: '04. Ví dụ minh họa',
              link: '/angular/directives/examples',
            },
          ],
        },
        {
          title: 'Ứng dụng',
          items: [
            {
              label: '01. Authenticate Shared Global',
              link: '/angular/case-studies/authenticate-shared-global',
            },
          ],
        },
      ],
    },
    {
      title: '.NET Core',
      icon: 'tool',
      items: [
        {
          label: '00. Lộ trình & chuẩn năng lực',
          link: '/dotnet-core/roadmap-competency',
        },
      ],
      groups: [
        {
          title: '1. Nền tảng',
          items: [
            { label: 'Tổng quan', link: '/dotnet-core/aspnet-core-mechanics' },
            { label: 'Controller & API Design', link: '/dotnet-core/controller-api-design' },
            {
              label: 'ASP.NET Core Request Pipeline',
              link: '/dotnet-core/aspnet-request-pipeline',
            },
            { label: 'Dependency Injection', link: '/dotnet-core/dependency-injection' },
            { label: 'Middleware', link: '/dotnet-core/middleware' },
            { label: 'Hangfire', link: '/dotnet-core/hangfire' },
          ],
        },
        {
          title: '2. Nâng cao',
          items: [
            { label: 'Task, Thread và Process', link: '/dotnet-core/task-thread-process' },
            { label: 'Garbage Collector (GC)', link: '/dotnet-core/garbage-collector' },
            {
              label: 'RabbitMQ và Reliable Messaging',
              link: '/dotnet-core/rabbitmq-reliable-messaging',
            },
          ],
        },
        {
          title: '3. Ứng dụng',
          items: [
            {
              label: '01. Sinh mã nhiều instance',
              link: '/dotnet-core/case-studies/multi-instance-code-generation',
            },
          ],
        },
      ],
    },
    {
      title: 'System Design',
      icon: 'cluster',
      groups: [
        {
          title: '00. Learning Path',
          open: true,
          items: [{ label: 'Roadmap & Competency Matrix', link: '/system-design/roadmap' }],
        },
        {
          title: '01. Load Parameters',
          items: [
            { label: 'Lý thuyết', link: '/system-design/load-parameter/theory' },
            { label: 'Minh họa', link: '/system-design/load-parameter/demo' },
          ],
        },
        {
          title: '02. Data Storage',
          items: [{ label: 'Lý thuyết', link: '/system-design/data-storage-strategy/theory' }],
        },
        {
          title: '03. Idempotency',
          items: [
            { label: 'Lý thuyết', link: '/system-design/idempotency/theory' },
            { label: 'Minh họa', link: '/system-design/idempotency/demo' },
          ],
        },
        {
          title: '04. Data Consistency',
          items: [{ label: 'Lý thuyết', link: '/system-design/data-consistency-patterns/theory' }],
        },
        {
          title: 'Multi-Tenancy',
          items: [{ label: 'Lý thuyết', link: '/system-design/multi-tenancy/theory' }],
        },
        {
          title: '05. Cache',
          items: [{ label: 'Lý thuyết', link: '/system-design/cache/theory' }],
        },
        {
          title: '06. Cluster',
          items: [
            { label: 'Lý thuyết', link: '/system-design/cluster/theory' },
            { label: 'Minh họa', link: '/system-design/cluster/demo' },
          ],
        },
        {
          title: '07. Authentication',
          items: [{ label: 'Lý thuyết', link: '/system-design/authenticate/theory' }],
        },
        {
          title: 'Ứng dụng',
          items: [
            {
              label: '01. Refresh cache nhiều nguồn',
              link: '/system-design/case-studies/cache-refresh-multi-source',
            },
            {
              label: '02. Hàng chờ khám bệnh',
              link: '/system-design/case-studies/clinic-queue-current-load',
            },
            {
              label: '03. Ký số HSM đa phòng ban',
              link: '/system-design/case-studies/hsm-signing-multi-department-result',
            },
            {
              label: '04. Food Ordering Correctness',
              link: '/system-design/case-studies/food-ordering-correctness',
            },
          ],
        },
      ],
    },
    {
      title: 'Design Patterns',
      icon: 'apartment',
      groups: [
        {
          title: 'Nền tảng',
          items: [
            { label: 'Tư duy thiết kế', link: '/design-patterns/foundation' },
            { label: 'Creational Patterns', link: '/design-patterns/creational' },
            { label: 'Structural Patterns', link: '/design-patterns/structural' },
            { label: 'Behavioral Patterns', link: '/design-patterns/behavioral' },
          ],
        },
        {
          title: 'Ứng dụng',
          items: [
            {
              label: '01. System Design ThinkingPayment Provider Selection',
              link: '/design-patterns/case-studies/payment-provider-selection',
            },
          ],
        },
      ],
    },
    {
      title: 'Frontend Engineering',
      icon: 'code',
      groups: [
        {
          title: '01. JavaScript',
          items: [
            {
              label: '00. Lộ trình học',
              link: '/frontend-engineering/javascript-advanced',
            },
            {
              label: '01. Runtime, scope và closure',
              link: '/frontend-engineering/javascript-runtime-scope-closure',
            },
            {
              label: '02. this, function và prototype',
              link: '/frontend-engineering/javascript-this-prototype',
            },
            {
              label: '03. Reference và immutability',
              link: '/frontend-engineering/javascript-reference-immutability',
            },
            {
              label: '04. Event loop và async',
              children: [
                {
                  label: 'Lý thuyết',
                  link: '/frontend-engineering/javascript-event-loop-async',
                },
                {
                  label: 'Demo',
                  link: '/frontend-engineering/javascript-event-loop-async-demo',
                },
              ],
            },
            {
              label: '05. Race condition và cancellation',
              link: '/frontend-engineering/javascript-race-cancellation',
            },
            {
              label: '06. Memory và performance',
              link: '/frontend-engineering/javascript-memory-performance',
            },
            {
              label: '07. Event',
              link: '/frontend-engineering/javascript-events',
            },
            {
              label: '08. Date',
              link: '/frontend-engineering/javascript-date',
            },
            {
              label: '09. Number',
              link: '/frontend-engineering/javascript-number',
            },
          ],
        },
        {
          title: 'Học code tốt hơn',
          items: [
            { label: 'Tổng quan', link: '/frontend-engineering/code-like-senior' },
            { label: '01. Mindset & nguyên tắc', link: '/frontend-engineering/mindset-principles' },
            {
              label: '02. Boundary & kiến trúc',
              link: '/frontend-engineering/boundary-architecture',
            },
            { label: '03. Component design', link: '/frontend-engineering/component-design' },
            { label: '04. Data flow & state', link: '/frontend-engineering/data-flow-state' },
            { label: '05. Production quality', link: '/frontend-engineering/production-quality' },
            { label: '06. Review & refactor', link: '/frontend-engineering/review-refactor' },
            {
              label: '07. ViewModel pattern (vm$)',
              link: '/frontend-engineering/view-model-pattern',
            },
          ],
        },
        {
          title: 'Ứng dụng',
          items: [
            {
              label: '01. Order List System',
              link: '/frontend-engineering/case-order-list-production',
            },
            {
              label: '02. Multi-step Form Production',
              link: '/frontend-engineering/case-multi-step-form-production',
            },
            {
              label: '03. Unsaved Changes Detection',
              link: '/frontend-engineering/case-unsaved-changes-detection',
            },
          ],
        },
      ],
    },
    {
      title: 'Backend Engineering',
      icon: 'api',
      groups: [
        {
          title: 'Nền tảng',
          items: [
            {
              label: '01. Mindset & Clean Code',
              link: '/backend-engineering/code-like-senior',
            },
            {
              label: '02. Review code như Middle/Senior',
              link: '/backend-engineering/review-code-middle-senior',
            },
            {
              label: '03. Architecture & Layering',
              link: '/backend-engineering/architecture-layering',
            },
            {
              label: '04. System Design Thinking',
              link: '/backend-engineering/system-design-thinking',
            },
            {
              label: '05. Observability & Debug Production',
              link: '/backend-engineering/observability-debug-production',
            },
            {
              label: '06. DDD Tactical Design',
              link: '/backend-engineering/ddd-tactical-design',
            },
          ],
        },
        {
          title: 'Ứng dụng',
          items: [
            {
              label: 'Food Delivery Backend Foundation Design',
              link: '/backend-engineering/case-studies/food-delivery-backend-foundation-design',
            },
          ],
        },
      ],
    },
    {
      title: 'Security',
      icon: 'safety',
      groups: [
        {
          title: 'Nền tảng',
          items: [{ label: 'Lý thuyết', link: '/security/theory' }],
        },
      ],
    },
    {
      title: 'Database',
      icon: 'database',
      groups: [
        {
          title: '01. Index trong cơ sở dữ liệu',
          items: [
            { label: 'Lý thuyết', link: '/database/index/theory' },
            { label: 'Demo', link: '/database/index/demo' },
          ],
        },
        {
          title: '02. Execution Plans',
          items: [
            { label: 'Lý thuyết', link: '/database/execution-plan/theory' },
            { label: 'Demo', link: '/database/execution-plan/demo' },
          ],
        },
        {
          title: '03. Cơ chế lưu trữ, Buffer Pool và I/O',
          items: [
            { label: 'Lý thuyết', link: '/database/storage-io/theory' },
            { label: 'Demo', link: '/database/storage-io/demo' },
          ],
        },
        {
          title: '04. Phân tích và tối ưu truy vấn',
          items: [{ label: 'Lý thuyết', link: '/database/query-tuning-workflow/theory' }],
        },
        {
          title: '05. Transaction và Concurrency Control',
          items: [
            {
              label: 'Lý thuyết',
              children: [
                {
                  label: '01. Transaction',
                  link: '/database/transactions/theory',
                },
                {
                  label: '02. ACID',
                  link: '/database/acid/theory',
                },
                {
                  label: '03. Transaction Isolation',
                  link: '/database/isolation-levels/theory',
                },
                {
                  label: '04. Locking, Blocking và Deadlock',
                  link: '/database/locking-deadlock/theory',
                },
                {
                  label: '05. Concurrency Control Patterns',
                  link: '/database/concurrency-control-patterns/theory',
                },
                {
                  label: '06. MySQL InnoDB Concurrency Internals',
                  link: '/database/mysql-innodb-concurrency/theory',
                },
              ],
            },
            {
              label: 'Demo',
              children: [
                {
                  label: '01. Transaction Boundary',
                  link: '/database/transactions/demo',
                },
                {
                  label: '02. Isolation Anomalies',
                  link: '/database/isolation-anomalies/demo',
                },
                {
                  label: '03. Blocking, Deadlock và Lock Ordering',
                  link: '/database/locking-deadlock/demo',
                },
                {
                  label: '04. Transactional Outbox',
                  link: '/database/concurrency-control-patterns/demo',
                },
              ],
            },
          ],
        },
        {
          title: '06. Advanced SQL và Relational Query Patterns',
          items: [
            {
              label: 'Lý thuyết',
              children: [
                {
                  label: '01. CTE và Recursive CTE',
                  link: '/database/advanced-sql/cte/theory',
                },
                {
                  label: '02. Window Functions và Analytical SQL',
                  link: '/database/advanced-sql/window-functions/theory',
                },
                {
                  label: '03. LATERAL JOIN',
                  link: '/database/advanced-sql/lateral-join/theory',
                },
                {
                  label: '04. Relational Query Patterns',
                  link: '/database/advanced-sql/production-patterns/theory',
                },
              ],
            },
            {
              label: 'Demo',
              children: [
                {
                  label: '01. Recursive CTE Execution',
                  link: '/database/advanced-sql/cte/demo',
                },
                {
                  label: '02. Window Functions Execution',
                  link: '/database/advanced-sql/window-functions/demo',
                },
                {
                  label: '03. LATERAL JOIN Execution',
                  link: '/database/advanced-sql/lateral-join/demo',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'Network',
      icon: 'global',
      groups: [
        {
          title: 'TCP/IP',
          items: [{ label: 'Lý thuyết', link: '/network/tcp-ip/theory' }],
        },
        {
          title: 'Firewall',
          items: [{ label: 'Lý thuyết', link: '/network/firewall/theory' }],
        },
      ],
    },
  ]),
).sort(
  (left, right) => MENU_SECTION_ORDER.indexOf(left.title) - MENU_SECTION_ORDER.indexOf(right.title),
);
