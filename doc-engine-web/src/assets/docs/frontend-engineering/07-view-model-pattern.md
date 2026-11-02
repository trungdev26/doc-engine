# ViewModel Pattern và vm$

`vm$` là một pattern rất hay dùng trong Angular production. Nó giúp gom toàn bộ dữ liệu mà template cần vào một stream duy nhất, thay vì để template tự ghép nhiều observable, nhiều flag, nhiều permission và nhiều derived state rải rác.

`vm$` thường là viết tắt của:

```text
ViewModel Observable
```

---

## 1. vm$ là gì?

ViewModel là object được thiết kế riêng cho UI render.

Observable là stream dữ liệu theo thời gian.

Vậy:

```text
vm$ = Observable phát ra ViewModel cho template
```

Ví dụ:

```ts
vm$ = combineLatest({
  orders: this.orders$,
  loading: this.loading$,
  error: this.error$,
  query: this.query$,
  permissions: this.permissions$
}).pipe(
  map(({ orders, loading, error, query, permissions }) => ({
    orders,
    loading,
    error,
    query,
    hasData: orders.length > 0,
    canCreate: permissions.includes('Order.Create')
  }))
);
```

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <app-loading *ngIf="vm.loading"></app-loading>

  <nz-alert
    *ngIf="vm.error"
    nzType="error"
    [nzMessage]="vm.error">
  </nz-alert>

  <app-order-table
    *ngIf="vm.hasData"
    [orders]="vm.orders"
    [query]="vm.query"
    [canCreate]="vm.canCreate">
  </app-order-table>
</ng-container>
```

Dấu `$` chỉ là quy ước: biến này là Observable.

```text
vm  -> object ViewModel hiện tại
vm$ -> stream phát ra ViewModel
```

---

## 2. Vì sao cần vm$?

Không dùng `vm$`, template dễ bị nhiều async pipe rải rác:

```html
<app-loading *ngIf="loading$ | async"></app-loading>

<nz-alert
  *ngIf="error$ | async as error"
  [nzMessage]="error">
</nz-alert>

<app-order-table
  [orders]="orders$ | async"
  [query]="query$ | async"
  [canCreate]="canCreate$ | async">
</app-order-table>
```

Vấn đề:

```text
- template khó đọc
- nhiều async pipe cho các stream liên quan
- derived state như hasData/canCreate bị tính trong template
- khó đảm bảo các phần state đồng bộ với nhau
- khó test logic render
```

Với `vm$`, template đọc một object:

```html
<ng-container *ngIf="vm$ | async as vm">
  ...
</ng-container>
```

Logic gom state nằm ở TypeScript, dễ đọc và dễ test hơn.

---

## 3. ViewModel khác DTO thế nào?

DTO là dữ liệu từ API.

```ts
export interface OrderDto {
  id: string;
  code: string;
  customerName: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED';
  createdAt: string;
  totalAmount: number;
}
```

ViewModel là dữ liệu đã chuẩn bị cho UI.

```ts
export interface OrderRowVm {
  id: string;
  code: string;
  customerName: string;
  statusText: string;
  statusColor: 'blue' | 'green' | 'red';
  createdAtText: string;
  totalAmountText: string;
  canApprove: boolean;
  canCancel: boolean;
}
```

Mapper:

```ts
function toOrderRowVm(order: OrderDto, permissions: OrderPermissions): OrderRowVm {
  return {
    id: order.id,
    code: order.code,
    customerName: order.customerName,
    statusText: getStatusText(order.status),
    statusColor: getStatusColor(order.status),
    createdAtText: formatDate(order.createdAt),
    totalAmountText: order.totalAmount.toLocaleString('vi-VN'),
    canApprove: permissions.canApprove && order.status === 'PENDING',
    canCancel: permissions.canCancel && order.status === 'PENDING'
  };
}
```

Template không cần biết status code, format tiền, format ngày hoặc permission rule phức tạp.

---

## 4. vm$ page-level

Page-level `vm$` gom toàn bộ state của màn hình.

```ts
export interface OrderListVm {
  query: OrderListQuery;
  orders: OrderRowVm[];
  total: number;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  canCreate: boolean;
}
```

Tạo `vm$` từ state:

```ts
vm$ = combineLatest({
  state: this.state$,
  permissions: this.permissions$
}).pipe(
  map(({ state, permissions }) => {
    const orders = state.status === 'success'
      ? state.result.items.map(order => toOrderRowVm(order, permissions))
      : [];

    return {
      query: state.query,
      orders,
      total: state.status === 'success' ? state.result.totalCount : 0,
      loading: state.status === 'loading',
      error: state.status === 'error' ? state.error : null,
      hasData: orders.length > 0,
      canCreate: permissions.canCreate
    };
  })
);
```

Page component:

```ts
export class OrderListPageComponent {
  vm$ = this.facade.vm$;

  constructor(public facade: OrderListFacade) {}
}
```

---

## 5. vm$ component-level

Không phải `vm$` chỉ dùng cho page. Component con cũng có thể có `vm$` nếu nó phải derive nhiều input.

Ví dụ filter component:

```ts
private querySubject = new ReplaySubject<OrderListQuery>(1);

@Input() set query(value: OrderListQuery) {
  this.querySubject.next(value);
}

vm$ = this.querySubject.pipe(
  map(query => ({
    keyword: query.keyword,
    status: query.status,
    hasActiveFilter:
      !!query.keyword ||
      query.status !== 'all' ||
      !!query.fromDate ||
      !!query.toDate
  }))
);
```

Nhưng đừng lạm dụng. Nếu component chỉ render vài input đơn giản, không cần `vm$`.

---

## 6. LoadState -> vm$

Một pattern rất sạch là tách `LoadState` và `ViewModel`.

State:

```ts
type OrderListState =
  | { status: 'loading'; query: OrderListQuery; result: null; error: null }
  | { status: 'success'; query: OrderListQuery; result: PagedResult<OrderDto>; error: null }
  | { status: 'error'; query: OrderListQuery; result: null; error: string };
```

VM:

```ts
type OrderListVm = {
  query: OrderListQuery;
  rows: OrderRowVm[];
  total: number;
  loading: boolean;
  error: string | null;
  empty: boolean;
};
```

Mapper:

```ts
function toOrderListVm(state: OrderListState): OrderListVm {
  const rows = state.status === 'success'
    ? state.result.items.map(toOrderRowVm)
    : [];

  return {
    query: state.query,
    rows,
    total: state.status === 'success' ? state.result.totalCount : 0,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.error : null,
    empty: state.status === 'success' && rows.length === 0
  };
}
```

Lợi ích:

```text
State mô tả dữ liệu/async flow.
VM mô tả UI cần render.
```

---

## 7. vm$ và async pipe

`vm$` thường đi với `async pipe`.

```html
<ng-container *ngIf="vm$ | async as vm">
  ...
</ng-container>
```

Lợi ích:

```text
- Angular tự subscribe/unsubscribe
- OnPush component được markForCheck khi vm emit
- tránh subscribe thủ công chỉ để gán field
```

Không tốt:

```ts
vm: OrderListVm | null = null;

ngOnInit(): void {
  this.vm$.subscribe(vm => {
    this.vm = vm;
  });
}
```

Trừ khi có side effect đặc biệt, cứ để template dùng `async pipe`.

---

## 8. Những gì nên nằm trong vm?

Nên đưa vào `vm`:

```text
- dữ liệu đã map cho UI
- loading/error/empty flags
- permission flags
- query hiện tại
- disabled/submitting flags
- label/color đã tính
- derived state template cần dùng
```

Không nên đưa vào `vm`:

```text
- raw DTO nếu template không nên biết DTO
- function callback không ổn định
- state không liên quan đến render
- object quá lớn không cần thiết
- business service/API service
```

Ví dụ tốt:

```ts
{
  rows,
  loading,
  error,
  empty,
  canCreate,
  canApprove,
  query
}
```

---

## 9. vm$ không thay thế state management

`vm$` là output để render UI. Nó không nhất thiết là nơi lưu state.

```text
State source:
- URL
- form
- service/store
- API response
- permission service

vm$:
- combine/map các source đó thành shape cho template
```

Nói cách khác:

```text
State là dữ liệu gốc.
ViewModel là dữ liệu đã chuẩn bị cho view.
```

Đừng biến `vm$` thành nơi nhét mọi side effect.

---

## 10. Anti-pattern với vm$

### 10.1. vm$ quá to

Nếu `vm$` chứa mọi thứ của cả feature cha/con, nó cũng khó maintain.

Dấu hiệu:

```text
- interface VM dài hàng trăm dòng
- component con chỉ dùng 2 field nhưng nhận cả vm
- sửa một field làm nhiều component re-render
```

Tốt hơn:

```html
<app-order-filter [query]="vm.query"></app-order-filter>
<app-order-table [rows]="vm.rows" [loading]="vm.loading"></app-order-table>
```

Truyền phần component con cần, không truyền cả `vm` nếu không cần.

### 10.2. Tạo object mới quá nhiều ở template

Không tốt:

```html
<app-table [config]="{ loading: vm.loading, total: vm.total }"></app-table>
```

Tốt hơn:

```ts
tableConfig$ = this.vm$.pipe(
  map(vm => ({ loading: vm.loading, total: vm.total }))
);
```

Hoặc truyền primitive/input riêng.

### 10.3. Side effect trong map

Không tốt:

```ts
vm$ = this.state$.pipe(
  map(state => {
    if (state.status === 'error') {
      this.message.error(state.error);
    }

    return toVm(state);
  })
);
```

`map` nên transform data. Side effect nên ở `tap` hoặc action flow riêng.

---

## 11. Test vm mapper

Nếu mapper có rule đáng kể, test nó.

```ts
it('maps pending order to approvable row when user has permission', () => {
  const vm = toOrderRowVm(
    {
      id: '1',
      code: 'OD001',
      customerName: 'An',
      status: 'PENDING',
      createdAt: '2026-06-28',
      totalAmount: 100000
    },
    {
      canApprove: true,
      canCancel: true,
      canCreate: true
    }
  );

  expect(vm.statusText).toBe('Chờ duyệt');
  expect(vm.canApprove).toBe(true);
  expect(vm.totalAmountText).toBe('100.000');
});
```

Test mapper rẻ nhưng bắt được nhiều bug format/permission/status.

---

## 12. Checklist dùng vm$

```text
[ ] Template có nhiều async pipe rải rác không?
[ ] Có nhiều loading/error/permission/query cần render cùng nhau không?
[ ] Derived state có đang tính trong template không?
[ ] DTO có bị render trực tiếp quá nhiều không?
[ ] Mapper DTO -> VM có cần tách/test không?
[ ] vm$ có side effect không?
[ ] vm$ có quá to không?
[ ] Component con có nhận đúng phần nó cần không?
```

---

## 13. Tóm tắt

```text
vm$ = Observable<ViewModel>
```

Nó giúp:

```text
- gom state render vào một object
- template sạch hơn
- giảm async pipe rải rác
- đưa derived state về TypeScript
- hợp với OnPush
- dễ test mapping state -> UI
```

Nhớ phân biệt:

```text
DTO:
Dữ liệu backend trả về.

State:
Dữ liệu gốc/vòng đời feature.

ViewModel:
Dữ liệu đã chuẩn bị cho template.
```
