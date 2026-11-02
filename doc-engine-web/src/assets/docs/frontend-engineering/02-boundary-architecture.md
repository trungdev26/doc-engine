# Boundary và kiến trúc feature

Boundary là đường ranh giữa các phần code. Boundary tốt giúp thay đổi một phần mà ít ảnh hưởng phần khác. Boundary kém làm mọi thứ dính nhau: sửa UI vỡ API, sửa permission vỡ form, sửa cache vỡ table.

Mục tiêu của phần này là biết feature nên chia thành page, component, facade, API service, state service và shared code như thế nào.

---

## 1. Bắt đầu từ feature boundary

Đừng bắt đầu bằng "tạo folder gì?". Bắt đầu bằng:

```text
Feature này thuộc domain nào?
Nó có route riêng không?
Nó có API riêng không?
Nó có state riêng không?
Nó có component reusable cho feature khác không?
```

Cấu trúc thường dùng:

```text
features/
  orders/
    pages/
      order-list/
      order-detail/
      order-edit/
    components/
      order-filter/
      order-table/
      order-status-tag/
    services/
      order-api.service.ts
      order-list.facade.ts
      order-detail.facade.ts
    models/
      order.dto.ts
      order.model.ts
      order-query.model.ts
      order.vm.ts
    mappers/
      order.mapper.ts
    order.routes.ts
```

Không cần tạo đủ ngay từ đầu. Nhưng khi feature lớn lên, đây là nơi code nên quay về.

---

## 2. Page component

Page component gắn với route. Nó điều phối layout cấp page và kết nối với facade.

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

Page component nên:

```text
- bind vm$
- chia layout page
- truyền data xuống presentational component
- nhận event và gọi facade
```

Không nên:

```text
- tự viết endpoint HTTP
- map DTO phức tạp
- chứa nhiều business rule
- cache data
- parse query params dài
```

---

## 3. Presentational component

Presentational component nhận input và emit output.

```ts
@Component({
  selector: 'app-order-table',
  templateUrl: './order-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrderTableComponent {
  @Input() orders: OrderRowVm[] = [];
  @Input() loading = false;
  @Input() page = 1;
  @Input() total = 0;

  @Output() pageChange = new EventEmitter<number>();
  @Output() openDetail = new EventEmitter<string>();

  trackById = (_: number, row: OrderRowVm) => row.id;
}
```

Nó không cần biết:

```text
- route hiện tại
- API endpoint
- global store
- query params
- permission source
```

Nếu presentational component bắt đầu inject nhiều service domain, nó đang trôi thành smart component.

---

## 4. Facade

Facade là lớp điều phối use case của page/feature.

Facade thường biết:

```text
- route/query params
- API service
- state service/store
- dialog/toast nếu thuộc workflow page
- mapper DTO -> VM
```

Ví dụ:

```ts
@Injectable()
export class OrderListFacade {
  private refreshSubject = new Subject<void>();

  query$ = this.route.queryParamMap.pipe(
    map(toOrderQuery),
    distinctUntilChanged(isSameOrderQuery)
  );

  state$ = combineLatest([
    this.query$,
    this.refreshSubject.pipe(startWith(void 0))
  ]).pipe(
    switchMap(([query]) => this.load(query)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  vm$ = this.state$.pipe(map(toOrderListVm));

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: OrderApiService
  ) {}

  changeQuery(patch: Partial<OrderQuery>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...patch, page: 1 },
      queryParamsHandling: 'merge'
    });
  }

  refresh(): void {
    this.refreshSubject.next();
  }

  private load(query: OrderQuery): Observable<OrderListState> {
    return this.api.search(query).pipe(
      map(result => ({ status: 'success', query, result, error: null } as const)),
      startWith({ status: 'loading', query, result: null, error: null } as const),
      catchError(() =>
        of({ status: 'error', query, result: null, error: 'Không tải được dữ liệu' } as const)
      )
    );
  }
}
```

Facade không phải pattern bắt buộc. Dùng khi component page bắt đầu có nhiều nguồn state/side effect.

---

## 5. API service

API service là boundary với backend.

```ts
@Injectable({ providedIn: 'root' })
export class OrderApiService {
  constructor(private http: HttpClient) {}

  search(query: OrderQuery): Observable<PagedResult<OrderDto>> {
    return this.http.get<PagedResult<OrderDto>>('/api/orders', {
      params: {
        keyword: query.keyword,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize
      }
    });
  }

  update(id: string, input: UpdateOrderInput): Observable<OrderDto> {
    return this.http.put<OrderDto>(`/api/orders/${id}`, input);
  }
}
```

API service nên ít UI concern.

Không nên:

```text
- show toast trong mọi API method
- navigate sau khi API xong
- giữ loading của page
- convert DTO sang table row VM
```

Các việc đó thuộc facade/page use case.

---

## 6. Mapper

Mapper giúp tách backend shape khỏi UI shape.

```ts
export function toOrderRowVm(order: OrderDto): OrderRowVm {
  return {
    id: order.id,
    code: order.code,
    customerName: order.customerName,
    statusText: getOrderStatusText(order.status),
    statusColor: getOrderStatusColor(order.status),
    totalAmountText: order.totalAmount.toLocaleString('vi-VN')
  };
}
```

Khi nào nên tách mapper?

```text
- template đang format nhiều
- nhiều component dùng cùng VM
- mapping có rule nghiệp vụ
- DTO backend không ổn định
- cần test mapping
```

Khi mapping chỉ là một dòng đơn giản, có thể để trong facade.

---

## 7. Shared boundary

Đừng đưa code vào shared quá sớm.

Phù hợp đưa shared:

```text
- UI primitive thật sự generic
- pipe/directive generic
- utility pure function không biết domain
- component dùng từ 2-3 feature và cùng lý do thay đổi
```

Không phù hợp:

```text
- component chỉ dùng trong Orders
- mapper riêng của Patient
- service gọi API domain cụ thể
- helper mơ hồ như CommonHelper
```

Rule thực tế:

```text
Nếu chỉ một feature dùng, để trong feature.
Khi feature thứ hai cần, xem có thật cùng lý do thay đổi không rồi mới đưa shared.
```

---

## 8. Dependency direction

Nên có hướng phụ thuộc rõ:

```text
page component
  -> facade
    -> api service
    -> state service/store
    -> mapper

presentational component
  -> model/vm type
```

Không nên:

```text
shared component -> feature service
api service -> component
presentational component -> router
mapper -> HttpClient
```

Khi dependency đi ngược, code bắt đầu khó reuse và khó test.

---

## 9. Checklist boundary

```text
[ ] Page component có mỏng không?
[ ] Component con có input/output rõ không?
[ ] API service có thuần HTTP không?
[ ] Mapping DTO -> VM nằm ở đâu?
[ ] Side effect chính nằm ở facade/use-case service chưa?
[ ] Shared code có thật sự shared không?
[ ] Có dependency đi ngược không?
[ ] Feature xóa đi có xóa được gọn không?
```
