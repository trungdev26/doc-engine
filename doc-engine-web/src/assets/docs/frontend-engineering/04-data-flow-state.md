# Data flow và state trong feature

Frontend khó maintain thường không phải vì thiếu component, mà vì data flow mờ: không biết state nằm đâu, ai update, API load theo gì, form và URL ai là source of truth.

Phần này tập trung vào cách thiết kế flow dữ liệu cho feature production.

---

## 1. Một chiều trước

Flow dễ maintain:

```text
User event
-> component gọi facade/output
-> facade update URL/state hoặc gọi API
-> stream/state emit
-> template render lại
```

Flow khó maintain:

```text
Component A mutate service
-> service emit
-> Component B patch form
-> form emit
-> router navigate
-> Component A subscribe lại
```

Không phải lúc nào flow vòng cũng sai, nhưng nếu không kiểm soát được, bug sẽ rất khó tìm.

---

## 2. Chọn source of truth

Ví dụ list page:

```text
URL: ?keyword=abc&page=2
Form: keyword control
Service: query state
Component: keyword field
```

Nếu cả 4 đều "giữ query", query sẽ lệch.

Thiết kế rõ:

```text
URL là source of truth.
Form sync từ URL với emitEvent false.
User sửa form thì update URL.
API load theo URL.
```

Hoặc với form edit:

```text
Form là source of truth cho draft.
API detail chỉ là initial value.
Submit đọc form.getRawValue().
```

---

## 3. URL state cho list/filter

Facade:

```ts
query$ = this.route.queryParamMap.pipe(
  map(params => ({
    keyword: params.get('keyword') ?? '',
    status: params.get('status') ?? 'all',
    page: Number(params.get('page') ?? 1)
  })),
  distinctUntilChanged((a, b) =>
    a.keyword === b.keyword &&
    a.status === b.status &&
    a.page === b.page
  )
);
```

Load data:

```ts
result$ = this.query$.pipe(
  switchMap(query =>
    this.api.search(query).pipe(
      map(result => ({ status: 'success', query, result } as const)),
      startWith({ status: 'loading', query, result: null } as const),
      catchError(() => of({ status: 'error', query, result: null } as const))
    )
  )
);
```

Update query:

```ts
changeKeyword(keyword: string): void {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { keyword, page: 1 },
    queryParamsHandling: 'merge'
  });
}
```

---

## 4. Form sync với URL

Khi URL đổi, patch form:

```ts
this.route.queryParamMap.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(params => {
  this.form.patchValue(
    {
      keyword: params.get('keyword') ?? '',
      status: params.get('status') ?? 'all'
    },
    { emitEvent: false }
  );
});
```

Khi form đổi, update URL:

```ts
this.form.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  takeUntilDestroyed(this.destroyRef)
).subscribe(value => {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: {
      keyword: value.keyword || null,
      status: value.status === 'all' ? null : value.status,
      page: 1
    },
    queryParamsHandling: 'merge'
  });
});
```

`emitEvent: false` là điểm mấu chốt để tránh vòng lặp URL -> form -> URL.

---

## 5. Loading/error/empty state là state thật

Đừng chỉ giữ `data`.

```ts
type LoadState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };
```

Ví dụ:

```ts
ordersState$ = this.query$.pipe(
  switchMap(query =>
    this.api.search(query).pipe(
      map(data => ({ status: 'success', data, error: null } as const)),
      startWith({ status: 'loading', data: null, error: null } as const),
      catchError(() => of({ status: 'error', data: null, error: 'Không tải được dữ liệu' } as const))
    )
  )
);
```

UI cần biết trạng thái, không chỉ biết array.

---

## 6. Derived state không lưu riêng

Không tốt:

```ts
orders: Order[] = [];
hasOrders = false;
totalAmount = 0;
```

Tốt hơn:

```ts
vm$ = this.orders$.pipe(
  map(orders => ({
    orders,
    hasOrders: orders.length > 0,
    totalAmount: orders.reduce((sum, order) => sum + order.amount, 0)
  }))
);
```

Nếu derived state được lưu riêng, luôn có nguy cơ quên update.

---

## 7. Cache và invalidation

Cache chỉ tốt khi biết invalidation.

```ts
private refreshSubject = new Subject<void>();

departments$ = this.refreshSubject.pipe(
  startWith(void 0),
  switchMap(() => this.api.getDepartments()),
  shareReplay({ bufferSize: 1, refCount: true })
);

refresh(): void {
  this.refreshSubject.next();
}
```

Sau mutation:

```ts
createDepartment(input: CreateDepartmentInput): Observable<Department> {
  return this.api.createDepartment(input).pipe(
    tap(() => this.refresh())
  );
}
```

Trước khi cache, hỏi:

```text
Dữ liệu stale khi nào?
Ai có quyền sửa?
Sửa xong refresh cache nào?
Context user/tenant/branch đổi có phải clear không?
```

---

## 8. State service tối giản

```ts
interface OrderListState {
  selectedIds: string[];
  columnConfigOpen: boolean;
}

const initialState: OrderListState = {
  selectedIds: [],
  columnConfigOpen: false
};

@Injectable()
export class OrderListStateService {
  private stateSubject = new BehaviorSubject<OrderListState>(initialState);
  state$ = this.stateSubject.asObservable();

  selectedIds$ = this.state$.pipe(
    map(state => state.selectedIds),
    distinctUntilChanged()
  );

  toggleSelected(id: string): void {
    const state = this.stateSubject.value;
    const selectedIds = state.selectedIds.includes(id)
      ? state.selectedIds.filter(x => x !== id)
      : [...state.selectedIds, id];

    this.stateSubject.next({
      ...state,
      selectedIds
    });
  }
}
```

Không expose `BehaviorSubject` trực tiếp.

---

## 9. Checklist data flow/state

```text
[ ] Source of truth là gì?
[ ] State nào nằm ở URL?
[ ] State nào nằm trong form?
[ ] State nào nằm trong service/store?
[ ] Derived state có bị lưu duplicate không?
[ ] API load theo stream nào?
[ ] Mutation invalidate cache nào?
[ ] Loading/error/empty có rõ không?
[ ] Có vòng lặp form <-> URL không?
```
