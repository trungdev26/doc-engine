import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MarkdownDocComponent } from './base/components/markdown-doc/markdown-doc.component';
import { IndicatorsTableComponent } from './features/change-detection/components/indicators-table.component';
import { ClusterDemoComponent } from './features/system-design/cluster/cluster-demo.component';
import { ClusterTheoryComponent } from './features/system-design/cluster/cluster-theory.component';
import { LoadParameterDemoComponent } from './features/system-design/load-parameter/load-parameter-demo.component';
import { IdempotencyDemoComponent } from './features/system-design/idempotency/idempotency-demo.component';
import { StorageIoDemoComponent } from './features/database/storage-io/storage-io-demo.component';
import { IndexDemoComponent } from './features/database/index/index-demo.component';
import { ExecutionPlanDemoComponent } from './features/database/execution-plan/execution-plan-demo.component';
import { TransactionDemoComponent } from './features/database/transactions/transaction-demo.component';
import { IsolationAnomaliesDemoComponent } from './features/database/isolation-anomalies/isolation-anomalies-demo.component';
import { AdvancedSqlDemoComponent } from './features/database/advanced-sql/advanced-sql-demo.component';
import { withMenuRouteTitles } from './layout/shell/menu-route-titles';

const routes: Routes = [
  { path: '', redirectTo: 'angular/change-detection/theory', pathMatch: 'full' },
  {
    path: 'angular/modules',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/modules/theory.md' },
      },
    ],
  },
  {
    path: 'angular/decorators',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/decorators/theory.md' },
      },
    ],
  },
  {
    path: 'angular/change-detection',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/change-detection/theory.md' },
      },
      { path: 'demo', component: IndicatorsTableComponent },
    ],
  },
  {
    path: 'angular/base-component-pattern',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/base-component-pattern/theory.md' },
      },
    ],
  },
  {
    path: 'angular/component-lifecycle',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/component-lifecycle/theory.md' },
      },
    ],
  },
  {
    path: 'angular/css',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/css/theory.md' },
      },
    ],
  },
  {
    path: 'angular/forms',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/forms/theory.md' },
      },
      {
        path: 'validation-lifecycle',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/forms/validation-lifecycle.md',
        },
      },
      {
        path: 'dynamic-production',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/forms/dynamic-production.md',
        },
      },
      {
        path: 'control-value-accessor',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/forms/control-value-accessor.md',
        },
      },
      {
        path: 'testing',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/forms/testing.md',
        },
      },
    ],
  },
  {
    path: 'angular/router',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/router/theory.md' },
      },
      {
        path: 'guard-case-studies',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/router/guard-case-studies.md' },
      },
    ],
  },
  {
    path: 'angular/rxjs',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/rxjs/theory.md' },
      },
    ],
  },
  {
    path: 'angular/state-management',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/state-management/theory.md' },
      },
    ],
  },
  {
    path: 'angular/dependency-injection',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/dependency-injection/theory.md' },
      },
    ],
  },
  {
    path: 'angular/http',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/http/theory.md' },
      },
    ],
  },
  {
    path: 'angular/directives',
    children: [
      {
        path: 'learning-path',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/directives/learning-path.md',
        },
      },
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/directives/theory.md' },
      },
      {
        path: 'production-senior',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/directives/production-senior.md',
        },
      },
      {
        path: 'examples',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/directives/examples.md',
        },
      },
    ],
  },
  {
    path: 'angular/case-studies',
    children: [
      {
        path: 'authenticate-shared-global',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/angular/case-studies/authenticate-shared-global.md',
        },
      },
    ],
  },
  {
    path: 'system-design',
    children: [
      { path: '', redirectTo: 'roadmap', pathMatch: 'full' },
      {
        path: 'roadmap',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/00-roadmap.md' },
      },
    ],
  },
  {
    path: 'system-design/data-storage-strategy',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/data-storage-strategy/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/cache',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/cache/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/idempotency',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/idempotency/theory.md' },
      },
      { path: 'demo', component: IdempotencyDemoComponent },
    ],
  },
  {
    path: 'system-design/data-consistency-patterns',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/data-consistency-patterns/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/authenticate',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/authenticate/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/multi-tenancy',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/multi-tenancy/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/load-parameter',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/load-parameter/theory.md' },
      },
      { path: 'demo', component: LoadParameterDemoComponent },
    ],
  },
  {
    path: 'system-design/cluster',
    children: [
      { path: 'theory', component: ClusterTheoryComponent },
      { path: 'demo', component: ClusterDemoComponent },
    ],
  },
  {
    path: 'system-design/case-studies',
    children: [
      {
        path: 'cache-refresh-multi-source',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/cache-refresh-multi-source.md',
        },
      },
      {
        path: 'clinic-queue-current-load',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/clinic-queue-current-load.md',
        },
      },
      {
        path: 'hsm-signing-multi-department-result',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/hsm-signing-multi-department-result.md',
        },
      },
      {
        path: 'food-ordering-correctness',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/food-ordering-correctness.md',
        },
      },
    ],
  },
  {
    path: 'design-patterns',
    children: [
      {
        path: 'foundation',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/foundation.md' },
      },
      {
        path: 'creational',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/creational.md' },
      },
      {
        path: 'structural',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/structural.md' },
      },
      {
        path: 'behavioral',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/behavioral.md' },
      },
      {
        path: 'case-studies/payment-provider-selection',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/case-studies/payment-provider-selection.md' },
      },
    ],
  },
  {
    path: 'frontend-engineering',
    children: [
      {
        path: 'javascript-advanced',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/00-roadmap.md',
        },
      },
      {
        path: 'javascript-runtime-scope-closure',
        component: MarkdownDocComponent,
        data: {
          docSrc:
            'assets/docs/frontend-engineering/javascript-advanced/01-runtime-scope-closure.md',
        },
      },
      {
        path: 'javascript-this-prototype',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/02-this-prototype.md',
        },
      },
      {
        path: 'javascript-reference-immutability',
        component: MarkdownDocComponent,
        data: {
          docSrc:
            'assets/docs/frontend-engineering/javascript-advanced/03-reference-immutability.md',
        },
      },
      {
        path: 'javascript-event-loop-async',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/04-event-loop-async.md',
        },
      },
      {
        path: 'javascript-event-loop-async-demo',
        loadComponent: () =>
          import('./features/frontend-engineering/event-loop-async/event-loop-async-demo.component').then(
            module => module.EventLoopAsyncDemoComponent,
          ),
      },
      {
        path: 'javascript-race-cancellation',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/05-race-cancellation.md',
        },
      },
      {
        path: 'javascript-memory-performance',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/06-memory-performance.md',
        },
      },
      {
        path: 'javascript-events',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/07-javascript-events.md',
        },
      },
      {
        path: 'javascript-date',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/08-date.md',
        },
      },
      {
        path: 'javascript-number',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/javascript-advanced/09-number.md',
        },
      },
      {
        path: 'code-like-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/code-like-senior.md' },
      },
      {
        path: 'mindset-principles',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/01-mindset-principles.md' },
      },
      {
        path: 'boundary-architecture',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/02-boundary-architecture.md' },
      },
      {
        path: 'component-design',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/03-component-design.md' },
      },
      {
        path: 'data-flow-state',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/04-data-flow-state.md' },
      },
      {
        path: 'production-quality',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/05-production-quality.md' },
      },
      {
        path: 'review-refactor',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/06-review-refactor.md' },
      },
      {
        path: 'view-model-pattern',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/07-view-model-pattern.md' },
      },
      {
        path: 'case-order-list-production',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/01-order-list-production.md',
        },
      },
      {
        path: 'case-multi-step-form-production',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/02-multi-step-form-production.md',
        },
      },
      {
        path: 'case-unsaved-changes-detection',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/03-unsaved-changes-detection.md',
        },
      },
    ],
  },
  {
    path: 'backend-engineering',
    children: [
      {
        path: 'code-like-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/code-like-senior.md' },
      },

      {
        path: 'review-code-middle-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/review-code-middle-senior.md' },
      },
      {
        path: 'architecture-layering',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/02-architecture-layering.md' },
      },
      {
        path: 'system-design-thinking',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/03-system-design-thinking.md' },
      },
      {
        path: 'observability-debug-production',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/04-observability-debug-production.md' },
      },
      {
        path: 'ddd-tactical-design',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/05-ddd-tactical-design.md' },
      },
      {
        path: 'case-studies/food-delivery-backend-foundation-design',
        component: MarkdownDocComponent,
        data: {
          docSrc:
            'assets/docs/backend-engineering/case-studies/food-delivery-backend-foundation-design.md',
        },
      },
    ],
  },
  {
    path: 'dotnet-core',
    children: [
      {
        path: 'roadmap-competency',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/00-roadmap-competency.md' },
      },
      {
        path: 'aspnet-core-mechanics',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/01-aspnet-core-mechanics.md' },
      },
      {
        path: 'runtime-advanced-engineering',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/03-runtime-advanced-engineering.md' },
      },
      {
        path: 'task-thread-process',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/task-thread-process.md' },
      },
      {
        path: 'garbage-collector',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/garbage-collector.md' },
      },
      {
        path: 'rabbitmq-reliable-messaging',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/rabbitmq-reliable-messaging.md' },
      },
      {
        path: 'dependency-injection',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/dependency-injection.md' },
      },
      {
        path: 'aspnet-request-pipeline',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/aspnet-request-pipeline.md' },
      },
      {
        path: 'middleware',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/middleware.md' },
      },
      {
        path: 'ef-core-production-patterns',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/ef-core-production-patterns.md' },
      },
      {
        path: 'ef-dapper-shared-transaction',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/ef-dapper-shared-transaction.md' },
      },
      {
        path: 'background-services-workers',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/background-services-workers.md' },
      },
      {
        path: 'hangfire',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/hangfire.md' },
      },
      {
        path: 'controller-api-design',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/dotnet-core/controller-api-design.md' },
      },
      {
        path: 'case-studies/multi-instance-code-generation',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/dotnet-core/case-studies/multi-instance-code-generation.md',
        },
      },
      {
        path: 'case-studies/inventory-balance-recalculation',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/dotnet-core/case-studies/inventory-balance-recalculation.md',
        },
      },
    ],
  },
  {
    path: 'security',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/security/theory.md' },
      },
    ],
  },
  {
    path: 'database/index',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/index/theory.md' },
      },
      { path: 'demo', component: IndexDemoComponent },
    ],
  },
  {
    path: 'database/execution-plan',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/execution-plan/theory.md' },
      },
      { path: 'demo', component: ExecutionPlanDemoComponent },
    ],
  },
  {
    path: 'database/query-tuning-workflow',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/query-tuning-workflow/theory.md' },
      },
    ],
  },
  {
    path: 'database/transactions',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/transactions/theory.md' },
      },
      {
        path: 'demo',
        component: TransactionDemoComponent,
        data: { demoLabs: ['boundary'] },
      },
    ],
  },
  {
    path: 'database/acid/theory',
    component: MarkdownDocComponent,
    data: { docSrc: 'assets/docs/database/acid/theory.md' },
  },
  {
    path: 'database/isolation-levels/theory',
    component: MarkdownDocComponent,
    data: { docSrc: 'assets/docs/database/isolation-levels/theory.md' },
  },
  {
    path: 'database/locking-deadlock',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/locking-deadlock/theory.md' },
      },
      {
        path: 'demo',
        component: TransactionDemoComponent,
        data: { demoLabs: ['deadlock'] },
      },
    ],
  },
  {
    path: 'database/concurrency-control-patterns',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/concurrency-control-patterns/theory.md' },
      },
      {
        path: 'demo',
        component: TransactionDemoComponent,
        data: { demoLabs: ['lost-update', 'outbox'] },
      },
    ],
  },
  {
    path: 'database/mysql-innodb-concurrency',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/mysql-innodb-concurrency/theory.md' },
      },
    ],
  },
  {
    path: 'database/isolation-anomalies/demo',
    component: IsolationAnomaliesDemoComponent,
  },
  {
    path: 'database/advanced-sql',
    children: [
      {
        path: 'cte/theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/advanced-sql/cte-recursive-cte.md' },
      },
      {
        path: 'window-functions/theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/advanced-sql/window-functions.md' },
      },
      {
        path: 'lateral-join/theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/advanced-sql/lateral-join.md' },
      },
      {
        path: 'production-patterns/theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/advanced-sql/production-query-patterns.md' },
      },
      {
        path: 'cte/demo',
        component: AdvancedSqlDemoComponent,
        data: { demoLab: 'cte' },
      },
      {
        path: 'window-functions/demo',
        component: AdvancedSqlDemoComponent,
        data: { demoLab: 'window' },
      },
      {
        path: 'lateral-join/demo',
        component: AdvancedSqlDemoComponent,
        data: { demoLab: 'lateral' },
      },
    ],
  },
  {
    path: 'database/storage-io',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/storage-io/theory.md' },
      },
      { path: 'demo', component: StorageIoDemoComponent },
    ],
  },
  {
    path: 'network/tcp-ip',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/network/tcp-ip/theory.md' },
      },
    ],
  },
  {
    path: 'network/firewall',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/network/firewall/theory.md' },
      },
    ],
  },
  { path: '**', redirectTo: 'angular/change-detection/theory' },
];

@NgModule({
  imports: [RouterModule.forRoot(withMenuRouteTitles(routes))],
  exports: [RouterModule],
})
export class AppRoutingModule {}
