# Order List System

Case này mô phỏng một task frontend production thường gặp: làm màn hình danh sách đơn hàng có filter, paging, action, permission, loading/error, refresh và cập nhật sau mutation.

Mục tiêu không phải chỉ đưa code mẫu, mà là luyện cách nghĩ như middle/senior trước khi code: hỏi gì, chia boundary ra sao, state nằm đâu, data flow thế nào, rủi ro production là gì.

---

## 1. Requirement thô

Product đưa yêu cầu:

```text
Làm màn hình danh sách đơn hàng.

User có thể:
- search theo mã đơn hoặc tên khách hàng
- filter theo trạng thái
- filter theo khoảng ngày tạo
- phân trang
- xem chi tiết đơn
- tạo đơn mới
- duyệt đơn
- hủy đơn

Yêu cầu thêm:
- user không có quyền thì không thấy action tương ứng
- refresh trình duyệt không mất filter
- copy URL gửi người khác phải mở đúng filter/page
- API có thể chậm hoặc lỗi
- sau khi duyệt/hủy, danh sách phải cập nhật
```

Nếu code ngay, rất dễ tạo một component khổng lồ. Senior sẽ dừng lại phân tích.

---

## 2. Câu hỏi cần làm rõ

Trước khi code, hỏi:

```text
1. Search theo keyword là search server hay client?
2. Filter ngày dùng createdDate hay confirmedDate?
3. Page/pageSize default là gì?
4. Có sort không?
5. Duyệt/hủy đơn có cần confirm dialog không?
6. Sau duyệt/hủy refresh cả list hay patch row local?
7. Permission keys là gì?
8. User thiếu quyền xem list thì vào route thế nào?
9. API response shape ra sao?
10. Trạng thái nào được phép duyệt/hủy?
```

Giả định cho case này:

```text
- Search/filter/paging đều ở server.
- Query state nằm trong URL.
- Duyệt/hủy cần confirm.
- Sau mutation refresh list từ API để chắc dữ liệu đúng.
- Permission:
  Order.View
  Order.Create
  Order.Approve
  Order.Cancel
```

---

## 3. Phân loại state

| State | Loại | Nơi đặt |
|---|---|---|
| `keyword` | URL state | query params |
| `status` | URL state | query params |
| `fromDate`, `toDate` | URL state | query params |
| `page`, `pageSize` | URL state | query params |
| danh sách đơn hàng | server state | facade stream |
| `loading/error` | UI load state | facade stream |
| quyền tạo/duyệt/hủy | shared client state | permission service |
| confirm dialog open/close | local UI flow | facade/dialog service |
| selected row hover/expanded | local UI state | table component nếu chỉ local |

Quyết định quan trọng:

```text
URL là source of truth cho list query.
Không giữ keyword/page/status rời rạc trong component và service cùng lúc.
```

---

## 4. Route/URL design

Route:

```text
/orders
```

Query params:

```text
/orders?keyword=abc&status=pending&fromDate=2026-06-01&toDate=2026-06-30&page=2&pageSize=20
```

Quy tắc:

```text
- Query param không có nghĩa là default.
- page luôn >= 1.
- pageSize giới hạn trong whitelist hoặc min/max.
- Date parse không hợp lệ thì bỏ qua/default.
```

Parser:

```ts
export type OrderStatusFilter = 'all' | 'pending' | 'approved' | 'cancelled';

export interface OrderListQuery {
  keyword: string;
  status: OrderStatusFilter;
  fromDate: string | null;
  toDate: string | null;
  page: number;
  pageSize: number;
}

export function toOrderListQuery(params: ParamMap): OrderListQuery {
  return {
    keyword: params.get('keyword') ?? '',
    status: parseStatus(params.get('status')),
    fromDate: params.get('fromDate'),
    toDate: params.get('toDate'),
    page: Math.max(1, Number(params.get('page') ?? 1)),
    pageSize: normalizePageSize(Number(params.get('pageSize') ?? 20))
  };
}

function parseStatus(value: string | null): OrderStatusFilter {
  const allowed: OrderStatusFilter[] = ['all', 'pending', 'approved', 'cancelled'];
  return allowed.includes(value as OrderStatusFilter) ? (value as OrderStatusFilter) : 'all';
}

function normalizePageSize(value: number): number {
  const allowed = [10, 20, 50, 100];
  return allowed.includes(value) ? value : 20;
}
```

---

## 5. Component boundary

Chia component:

```text
OrderListPageComponent
-> smart/page component, bind facade.vm$

OrderFilterComponent
-> presentational form filter

OrderTableComponent
-> presentational table

OrderStatusTagComponent
-> render status

OrderRowActionsComponent
-> render action theo permission + row state
```

Sơ đồ:

```text
OrderListPageComponent
  ├── OrderFilterComponent
  ├── OrderTableComponent
  │     ├── OrderStatusTagComponent
  │     └── OrderRowActionsComponent
  └── Pagination
```

Page component:

```ts
@Component({
  selector: 'app-order-list-page',
  templateUrl: './order-list-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderListFacade]
})
export class OrderListPageComponent {
  vm$ = this.facade.vm$;

  constructor(public facade: OrderListFacade) {}
}
```

Page template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <app-order-filter
    [query]="vm.query"
    (queryChange)="facade.changeFilter($event)">
  </app-order-filter>

  <button
    *ngIf="vm.canCreate"
    nz-button
    nzType="primary"
    (click)="facade.openCreate()">
    Tạo đơn
  </button>

  <app-order-table
    [orders]="vm.orders"
    [loading]="vm.loading"
    [error]="vm.error"
    [total]="vm.total"
    [page]="vm.query.page"
    [pageSize]="vm.query.pageSize"
    [permissions]="vm.permissions"
    (pageChange)="facade.changePage($event)"
    (openDetail)="facade.openDetail($event)"
    (approve)="facade.approve($event)"
    (cancel)="facade.cancel($event)">
  </app-order-table>
</ng-container>
```

---

## 6. API contract

DTO từ backend:

```ts
export interface OrderDto {
  id: string;
  code: string;
  customerName: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  createdAt: string;
  totalAmount: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
}
```

API service:

```ts
@Injectable({ providedIn: 'root' })
export class OrderApiService {
  constructor(private http: HttpClient) {}

  search(query: OrderListQuery): Observable<PagedResult<OrderDto>> {
    return this.http.get<PagedResult<OrderDto>>('/api/orders', {
      params: this.toParams(query)
    });
  }

  approve(orderId: string): Observable<OrderDto> {
    return this.http.post<OrderDto>(`/api/orders/${orderId}/approve`, {});
  }

  cancel(orderId: string): Observable<OrderDto> {
    return this.http.post<OrderDto>(`/api/orders/${orderId}/cancel`, {});
  }

  private toParams(query: OrderListQuery): Record<string, string> {
    return {
      keyword: query.keyword,
      status: query.status,
      page: String(query.page),
      pageSize: String(query.pageSize),
      ...(query.fromDate ? { fromDate: query.fromDate } : {}),
      ...(query.toDate ? { toDate: query.toDate } : {})
    };
  }
}
```

API service chỉ biết HTTP. Nó không show toast, không navigate, không giữ loading page.

---

## 7. ViewModel

Không render DTO trực tiếp nếu UI cần format/status/permission.

```ts
export interface OrderRowVm {
  id: string;
  code: string;
  customerName: string;
  status: OrderDto['status'];
  statusText: string;
  statusColor: 'blue' | 'green' | 'red';
  createdAtText: string;
  totalAmountText: string;
  canApproveByStatus: boolean;
  canCancelByStatus: boolean;
}

export function toOrderRowVm(order: OrderDto): OrderRowVm {
  return {
    id: order.id,
    code: order.code,
    customerName: order.customerName,
    status: order.status,
    statusText: getStatusText(order.status),
    statusColor: getStatusColor(order.status),
    createdAtText: formatDate(order.createdAt),
    totalAmountText: order.totalAmount.toLocaleString('vi-VN'),
    canApproveByStatus: order.status === 'PENDING',
    canCancelByStatus: order.status === 'PENDING'
  };
}
```

Permission cuối cùng cho action là kết hợp:

```text
permission user + trạng thái row
```

```ts
canShowApprove(row: OrderRowVm, permissions: OrderPermissions): boolean {
  return permissions.canApprove && row.canApproveByStatus;
}
```

---

## 8. Facade data flow

State shape:

```ts
type OrderListLoadState =
  | {
      status: 'loading';
      query: OrderListQuery;
      result: null;
      error: null;
    }
  | {
      status: 'success';
      query: OrderListQuery;
      result: PagedResult<OrderDto>;
      error: null;
    }
  | {
      status: 'error';
      query: OrderListQuery;
      result: null;
      error: string;
    };
```

Facade:

```ts
@Injectable()
export class OrderListFacade {
  private refreshSubject = new Subject<void>();

  query$ = this.route.queryParamMap.pipe(
    map(toOrderListQuery),
    distinctUntilChanged(isSameOrderListQuery)
  );

  permissions$ = combineLatest({
    canCreate: this.permission.has$('Order.Create'),
    canApprove: this.permission.has$('Order.Approve'),
    canCancel: this.permission.has$('Order.Cancel')
  });

  state$ = combineLatest([
    this.query$,
    this.refreshSubject.pipe(startWith(void 0))
  ]).pipe(
    switchMap(([query]) => this.loadOrders(query)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  vm$ = combineLatest({
    state: this.state$,
    permissions: this.permissions$
  }).pipe(
    map(({ state, permissions }) => toOrderListVm(state, permissions))
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: OrderApiService,
    private permission: PermissionService,
    private dialog: ConfirmDialogService,
    private message: MessageService
  ) {}

  changeFilter(patch: Partial<OrderListQuery>): void {
    this.patchQuery({ ...patch, page: 1 });
  }

  changePage(page: number): void {
    this.patchQuery({ page });
  }

  refresh(): void {
    this.refreshSubject.next();
  }

  openCreate(): void {
    this.router.navigate(['/orders/create']);
  }

  openDetail(orderId: string): void {
    this.router.navigate(['/orders', orderId]);
  }

  approve(orderId: string): void {
    this.dialog.confirm('Duyệt đơn hàng này?').pipe(
      filter(Boolean),
      exhaustMap(() => this.api.approve(orderId)),
      tap(() => this.message.success('Đã duyệt đơn hàng')),
      tap(() => this.refresh()),
      catchError(() => {
        this.message.error('Duyệt đơn hàng thất bại');
        return EMPTY;
      })
    ).subscribe();
  }

  cancel(orderId: string): void {
    this.dialog.confirm('Hủy đơn hàng này?').pipe(
      filter(Boolean),
      exhaustMap(() => this.api.cancel(orderId)),
      tap(() => this.message.success('Đã hủy đơn hàng')),
      tap(() => this.refresh()),
      catchError(() => {
        this.message.error('Hủy đơn hàng thất bại');
        return EMPTY;
      })
    ).subscribe();
  }

  private loadOrders(query: OrderListQuery): Observable<OrderListLoadState> {
    return this.api.search(query).pipe(
      map(result => ({ status: 'success', query, result, error: null } as const)),
      startWith({ status: 'loading', query, result: null, error: null } as const),
      catchError(() =>
        of({ status: 'error', query, result: null, error: 'Không tải được danh sách đơn hàng' } as const)
      )
    );
  }

  private patchQuery(query: Partial<OrderListQuery>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      queryParamsHandling: 'merge'
    });
  }
}
```

Vì sao `switchMap` khi load list?

```text
Query mới thắng query cũ.
Nếu user đổi filter nhanh, request cũ không được ghi đè result mới.
```

Vì sao `exhaustMap` khi approve/cancel?

```text
Một action đang chạy thì bỏ qua click mới trong dialog/action flow.
Tránh double submit.
```

---

## 9. VM mapper

```ts
export interface OrderListVm {
  query: OrderListQuery;
  orders: OrderRowVm[];
  total: number;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  permissions: OrderPermissions;
  canCreate: boolean;
}

export function toOrderListVm(
  state: OrderListLoadState,
  permissions: OrderPermissions
): OrderListVm {
  const orders = state.status === 'success'
    ? state.result.items.map(toOrderRowVm)
    : [];

  return {
    query: state.query,
    orders,
    total: state.status === 'success' ? state.result.totalCount : 0,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    hasData: orders.length > 0,
    permissions,
    canCreate: permissions.canCreate
  };
}
```

Lợi ích:

```text
- component/template ít logic
- permission + status rule rõ
- dễ test mapper
- đổi UI format không ảnh hưởng API service
```

---

## 10. OrderFilterComponent

Filter component nhận query hiện tại và emit patch.

```ts
@Component({
  selector: 'app-order-filter',
  templateUrl: './order-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderFilterComponent implements OnChanges {
  @Input() query!: OrderListQuery;
  @Output() queryChange = new EventEmitter<Partial<OrderListQuery>>();

  form = this.fb.group({
    keyword: [''],
    status: ['all'],
    fromDate: [null as Date | null],
    toDate: [null as Date | null]
  });

  constructor(private fb: FormBuilder) {}

  ngOnChanges(): void {
    if (!this.query) {
      return;
    }

    this.form.patchValue(
      {
        keyword: this.query.keyword,
        status: this.query.status,
        fromDate: this.query.fromDate ? new Date(this.query.fromDate) : null,
        toDate: this.query.toDate ? new Date(this.query.toDate) : null
      },
      { emitEvent: false }
    );
  }

  search(): void {
    const value = this.form.getRawValue();

    this.queryChange.emit({
      keyword: value.keyword ?? '',
      status: value.status as OrderStatusFilter,
      fromDate: value.fromDate ? toIsoDate(value.fromDate) : null,
      toDate: value.toDate ? toIsoDate(value.toDate) : null
    });
  }

  reset(): void {
    this.queryChange.emit({
      keyword: null as any,
      status: 'all',
      fromDate: null,
      toDate: null
    });
  }
}
```

Lưu ý:

```text
Filter component không tự navigate.
Nó chỉ emit queryChange.
Facade quyết định query params.
```

---

## 11. OrderTableComponent

```ts
@Component({
  selector: 'app-order-table',
  templateUrl: './order-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTableComponent {
  @Input() orders: OrderRowVm[] = [];
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() total = 0;
  @Input() page = 1;
  @Input() pageSize = 20;
  @Input() permissions!: OrderPermissions;

  @Output() pageChange = new EventEmitter<number>();
  @Output() openDetail = new EventEmitter<string>();
  @Output() approve = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<string>();

  trackById = (_: number, row: OrderRowVm) => row.id;

  canApprove(row: OrderRowVm): boolean {
    return this.permissions.canApprove && row.canApproveByStatus;
  }

  canCancel(row: OrderRowVm): boolean {
    return this.permissions.canCancel && row.canCancelByStatus;
  }
}
```

Table không gọi API, không tự đọc permission service, không biết router.

---

## 12. Loading/error/empty UX

Phải xử lý:

```text
1. First load loading
2. API error
3. Success nhưng items rỗng
4. Filter đang có nhưng không có kết quả
5. User bấm refresh
6. Mutation đang chạy
```

Tối thiểu:

```html
<nz-spin [nzSpinning]="loading">
  <nz-alert *ngIf="error" nzType="error" [nzMessage]="error"></nz-alert>

  <app-empty
    *ngIf="!loading && !error && orders.length === 0">
  </app-empty>

  <nz-table
    *ngIf="!error"
    [nzData]="orders"
    [nzLoading]="loading">
  </nz-table>
</nz-spin>
```

---

## 13. Mutation strategy: refresh hay patch local?

Sau approve/cancel có 2 hướng.

Refresh list:

```text
Ưu:
- chắc đúng theo backend
- đơn giản
- tránh thiếu field side effect

Nhược:
- thêm request
- UI có thể nháy loading nếu không xử lý khéo
```

Patch local:

```text
Ưu:
- nhanh
- ít request

Nhược:
- dễ stale nếu backend thay đổi nhiều field
- phải update total/count/summary/cache liên quan
```

Với task đầu tiên, chọn refresh list. Sau khi có vấn đề performance/UX rõ mới tối ưu patch local.

---

## 14. Production risks

```text
[ ] User đổi filter nhanh, request cũ ghi đè request mới
    -> dùng switchMap

[ ] User double click approve/cancel
    -> dùng exhaustMap/disable action

[ ] Refresh mất filter
    -> query state nằm trong URL

[ ] Permission chỉ ẩn UI nhưng backend không check
    -> backend vẫn phải authorization

[ ] API lỗi làm stream chết
    -> catchError trong inner stream

[ ] Date invalid từ URL
    -> parse/normalize query params

[ ] Table nhiều dòng render chậm
    -> paging server, trackBy, OnPush

[ ] Component quá dày
    -> page component + facade + presentational components
```

---

## 15. Implementation plan

Làm theo thứ tự:

```text
1. Tạo route /orders.
2. Tạo model: OrderDto, OrderListQuery, OrderRowVm.
3. Tạo OrderApiService.search/approve/cancel.
4. Tạo query parser từ queryParamMap.
5. Tạo OrderListFacade với query$, state$, vm$.
6. Tạo OrderListPageComponent bind vm$.
7. Tạo OrderFilterComponent.
8. Tạo OrderTableComponent + trackBy.
9. Thêm permission vào vm.
10. Thêm approve/cancel flow với confirm + refresh.
11. Test/verify loading/error/empty/permission/query URL.
```

---

## 16. Checklist review

```text
Route/URL:
[ ] Refresh giữ filter/page
[ ] Query params invalid được normalize
[ ] Back/forward hoạt động đúng

Data flow:
[ ] URL là source of truth cho query
[ ] Không duplicate keyword/page trong nhiều nơi
[ ] API load bằng switchMap

Component:
[ ] Page component mỏng
[ ] Filter không tự navigate
[ ] Table không tự gọi API
[ ] Row actions dựa trên permission + row state

State:
[ ] Loading/error/empty rõ
[ ] Mutation refresh/invalidate đúng
[ ] Permission nằm trong vm

Performance:
[ ] OnPush
[ ] trackBy
[ ] Không function nặng trong template

Security:
[ ] Frontend ẩn action theo quyền
[ ] Backend vẫn check quyền
```

---

## 17. Tư duy chốt

Task này không khó vì một dòng code nào. Nó khó vì nhiều concern nhỏ dính vào nhau:

```text
URL state
Form filter
API query
Permission
Table
Mutation
Refresh
Loading/error
Performance
```

Middle/Senior không cố nhét tất cả vào một component. Họ chọn source of truth, chia boundary, giữ data flow một chiều và xử lý production state ngay từ đầu.
