# Cách viết code Frontend như Middle/Senior

Tài liệu này không phải bộ luật cứng. Nó là một hệ quy chiếu để viết frontend ổn định hơn: dễ đọc, dễ thay đổi, dễ test, ít side effect ẩn và không phụ thuộc quá nhiều vào cảm giác từng hôm.

Middle/Senior frontend không chỉ là biết nhiều framework API. Điểm khác biệt lớn hơn là biết đặt code đúng chỗ, kiểm soát data flow, nhận ra trade-off và giữ base code maintain được khi feature tăng lên.

---

## 1. Code tốt là gì?

Code tốt trong frontend production thường có 5 đặc điểm:

```text
1. Đọc được:
   Người khác nhìn vào hiểu flow chính mà không phải nhảy 20 file.

2. Đổi được:
   Business đổi một rule, chỉ sửa vùng liên quan.

3. Test được:
   Logic quan trọng không bị chôn trong template/lifecycle khó test.

4. Xóa được:
   Feature bỏ đi thì xóa được gọn, không kéo theo dây mơ rễ má.

5. Chạy được ổn:
   Loading/error/empty/performance/permission được nghĩ từ đầu.
```

Câu hỏi senior hay tự hỏi:

```text
Nếu 3 tháng nữa đổi requirement, code này sửa ở đâu?
Nếu người mới vào đọc, họ có hiểu data đi từ đâu đến đâu không?
Nếu API lỗi, UI có trạng thái rõ không?
Nếu feature lớn gấp đôi, cấu trúc này còn chịu được không?
```

---

## 2. Khác nhau giữa Junior, Middle và Senior khi viết code

### 2.1. Junior

Thường tập trung làm cho chạy:

```text
- gọi API trong component
- gán field trực tiếp
- xử lý nhiều thứ trong một file
- fix bug bằng thêm if/flag
- pattern dùng theo ví dụ thấy trên mạng
```

Không xấu. Đây là giai đoạn cần thiết. Nhưng nếu base code lớn lên, kiểu này dễ khó maintain.

### 2.2. Middle

Bắt đầu biết tách trách nhiệm:

```text
- component mỏng hơn
- service gọi API rõ hơn
- biết dùng RxJS/operator đúng chỗ
- biết tách component reusable
- biết loading/error state
- biết tránh duplicate state
- biết viết code theo feature boundary
```

Middle viết được feature ổn định nếu scope rõ.

### 2.3. Senior

Senior nghĩ theo hệ thống và trade-off:

```text
- chọn boundary trước khi code
- biết source of truth là gì
- biết state nào ở URL, service, store hay component
- biết side effect nằm ở đâu
- biết abstraction nào đáng tạo, abstraction nào nên chờ
- review được rủi ro tương lai
- thiết kế để team maintain được, không chỉ bản thân hiểu
```

Senior không phải lúc nào cũng viết code phức tạp hơn. Rất nhiều lúc senior chọn code đơn giản hơn, vì nó đủ tốt và dễ đổi.

---

## 3. Nguyên tắc nền: code theo lý do thay đổi

Một file/class/component nên gom những thứ có cùng lý do thay đổi.

Ví dụ component vừa:

```text
- đọc route params
- quản lý form
- gọi API
- cache data
- format view model
- mở modal
- xử lý permission
- sync query params
```

Component đó có quá nhiều lý do để thay đổi. Khi sửa permission có thể làm vỡ form. Khi sửa filter có thể làm vỡ cache.

Tách theo lý do thay đổi:

```text
Component:
-> render UI, nhận event, bind vm$

Facade:
-> điều phối route/form/state/API cho page

API service:
-> biết endpoint, DTO, HTTP

State service/store:
-> giữ state, selector, updater

Mapper:
-> map DTO sang ViewModel nếu logic đủ lớn
```

---

## 4. Feature boundary trước, file sau

Đừng bắt đầu bằng câu hỏi "tạo folder gì?". Bắt đầu bằng:

```text
Feature này thuộc domain nào?
Nó có route riêng không?
Nó có state riêng không?
Nó dùng API nào?
Nó share gì với feature khác?
```

Cấu trúc gợi ý:

```text
features/
  orders/
    pages/
      order-list/
      order-detail/
    components/
      order-filter/
      order-table/
      order-status-tag/
    services/
      order-api.service.ts
      order-list.facade.ts
    models/
      order.model.ts
      order-query.model.ts
      order.vm.ts
    order.routes.ts
```

Không cần máy móc tạo đủ folder ngay từ đầu. Nhưng khi feature lớn lên, boundary này giúp code không chảy lung tung vào `shared`.

---

## 5. Component nên làm gì?

Component tốt nên tập trung vào UI:

```text
- nhận input hoặc vm$
- render template
- phát event người dùng
- giữ local UI state nhỏ
- gọi facade method cho action lớn
```

Ví dụ tốt:

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

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <app-order-filter
    [query]="vm.query"
    (queryChange)="facade.changeQuery($event)">
  </app-order-filter>

  <app-order-table
    [orders]="vm.orders"
    [loading]="vm.loading"
    (pageChange)="facade.changePage($event)"
    (openDetail)="facade.openDetail($event)">
  </app-order-table>
</ng-container>
```

Component này không biết endpoint API, không tự parse query params, không tự quyết định cache.

---

## 6. Dấu hiệu component đang quá dày

Một component bắt đầu nguy hiểm khi:

```text
[ ] Có quá nhiều subscribe thủ công
[ ] Có nhiều biến loading/error/data rời rạc
[ ] Có nhiều method gọi API khác nhau
[ ] Có logic permission trong template dài
[ ] Có map DTO -> UI ngay trong subscribe
[ ] Có xử lý route query params lẫn form lẫn API
[ ] Có nhiều boolean điều khiển workflow
[ ] File dài nhưng khó tách vì mọi thứ phụ thuộc nhau
```

Ví dụ dễ mục:

```ts
ngOnInit(): void {
  this.route.queryParamMap.subscribe(params => {
    this.keyword = params.get('keyword') ?? '';
    this.loading = true;

    this.orderApi.search(this.keyword).subscribe({
      next: result => {
        this.orders = result.items.map(x => ({
          ...x,
          statusText: this.getStatusText(x.status)
        }));
        this.loading = false;
      },
      error: () => {
        this.error = 'Không tải được dữ liệu';
        this.loading = false;
      }
    });
  });
}
```

Tốt hơn:

```ts
vm$ = this.route.queryParamMap.pipe(
  map(params => ({ keyword: params.get('keyword') ?? '' })),
  distinctUntilChanged((a, b) => a.keyword === b.keyword),
  switchMap(query =>
    this.orderApi.search(query).pipe(
      map(result => ({
        query,
        orders: result.items.map(toOrderRowVm),
        loading: false,
        error: null
      })),
      startWith({ query, orders: [], loading: true, error: null }),
      catchError(() => of({ query, orders: [], loading: false, error: 'Không tải được dữ liệu' }))
    )
  )
);
```

Nếu đoạn này vẫn lớn, đưa vào facade.

---

## 7. Presentational component

Presentational component nên dễ dùng và ít biết business flow.

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

Nó không nên:

```text
- tự gọi API
- tự đọc router
- tự biết permission phức tạp
- mutate input
- tự quyết định global state
```

Input/output là contract. Contract càng rõ, component càng reusable.

---

## 8. Service và API client

API service nên mỏng, rõ endpoint, không ôm UI state.

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

  getById(id: string): Observable<OrderDto> {
    return this.http.get<OrderDto>(`/api/orders/${id}`);
  }
}
```

API service không nên:

```text
- mở modal
- navigate router
- show toast quá nhiều nơi
- giữ loading của page
- chứa logic render UI
```

Nếu cần điều phối UI flow, dùng facade/service cấp feature.

---

## 9. Facade dùng khi nào?

Facade đáng dùng khi page có từ 2-3 nguồn state trở lên:

```text
- route params/query params
- form
- API
- cache
- permission
- modal action
- refresh/invalidation
```

Facade gom orchestration lại:

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
    switchMap(([query]) => this.loadOrders(query)),
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

  private loadOrders(query: OrderQuery): Observable<OrderListState> {
    return this.api.search(query).pipe(
      map(result => ({ status: 'success', query, result, error: null } as const)),
      startWith({ status: 'loading', query, result: null, error: null } as const),
      catchError(() => of({ status: 'error', query, result: null, error: 'Không tải được dữ liệu' } as const))
    );
  }
}
```

Facade không phải bắt buộc cho mọi component. Nó hữu ích khi component page bắt đầu bị kéo nhiều hướng.

---

## 10. Data flow một chiều

Flow nên rõ:

```text
User event
-> component emit/call facade
-> facade update URL/state hoặc gọi API
-> state/vm$ emit
-> template render
```

Tránh flow vòng:

```text
component A mutate service
service update component B
component B emit ngược làm component A patch tiếp
```

Với form + URL:

```text
URL là source of truth
-> init form từ URL với emitEvent: false
-> user sửa form
-> update URL
-> query params đổi
-> load API
```

Điểm quan trọng là chọn source of truth. Nếu form, URL và service đều là source of truth, state sẽ lệch.

---

## 11. State: đừng lưu cái tính được

Không tốt:

```ts
orders: Order[] = [];
totalAmount = 0;
hasOrders = false;

setOrders(orders: Order[]): void {
  this.orders = orders;
  this.totalAmount = orders.reduce((sum, x) => sum + x.amount, 0);
  this.hasOrders = orders.length > 0;
}
```

Tốt hơn:

```ts
orders$ = this.api.search(query);

vm$ = this.orders$.pipe(
  map(orders => ({
    orders,
    totalAmount: orders.reduce((sum, x) => sum + x.amount, 0),
    hasOrders: orders.length > 0
  }))
);
```

Derived state nên derive. Lưu riêng chỉ khi có lý do performance hoặc business rõ.

---

## 12. Error/loading/empty là một phần của feature

Đừng chỉ code happy path.

State tốt:

```ts
type LoadState<T> =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };
```

Template nên có đủ:

```html
<app-loading *ngIf="vm.status === 'loading'"></app-loading>
<nz-alert *ngIf="vm.status === 'error'" nzType="error" [nzMessage]="vm.error"></nz-alert>
<app-empty *ngIf="vm.status === 'success' && !vm.hasData"></app-empty>
<app-table *ngIf="vm.status === 'success' && vm.hasData" [rows]="vm.rows"></app-table>
```

Checklist:

```text
[ ] Lần đầu load
[ ] API lỗi
[ ] Data rỗng
[ ] Refresh
[ ] Retry
[ ] Permission denied
[ ] Network chậm
```

---

## 13. Naming: code đọc như nghiệp vụ

Tên tốt làm code tự giải thích.

Không rõ:

```ts
handleData(data: any): void {}
process(item: any): void {}
flag = false;
```

Rõ hơn:

```ts
submitOrder(input: SubmitOrderInput): void {}
mapOrderToRowVm(order: OrderDto): OrderRowVm {}
isAdvancedFilterOpen = false;
```

Quy ước hữu ích:

```text
xxxDto    -> shape từ API
xxxVm     -> shape cho UI render
xxxInput  -> dữ liệu gửi API
xxxQuery  -> filter/paging/sort
xxxState  -> trạng thái nội bộ
xxxFacade -> orchestration cho page/feature
```

---

## 14. Mapping DTO sang ViewModel

Đừng để template tự hiểu DTO phức tạp.

API DTO:

```ts
type OrderDto = {
  id: string;
  code: string;
  customerName: string;
  status: 'NEW' | 'CONFIRMED' | 'CANCELLED';
  totalAmount: number;
};
```

ViewModel:

```ts
type OrderRowVm = {
  id: string;
  code: string;
  customerName: string;
  statusText: string;
  statusColor: 'blue' | 'green' | 'red';
  totalAmountText: string;
};
```

Mapper:

```ts
function toOrderRowVm(order: OrderDto): OrderRowVm {
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

Lợi ích:

```text
- template đơn giản
- format tập trung
- dễ test
- đổi UI không ảnh hưởng API model
```

---

## 15. Template sạch

Template không nên chứa business logic nặng.

Không tốt:

```html
<td>{{ calculateTotal(order.items) }}</td>
<td [class.warning]="isLate(order.deadline, order.status)"></td>
<button [disabled]="!canApprove(order, currentUser, permissions)">Duyệt</button>
```

Tốt hơn:

```html
<td>{{ order.totalText }}</td>
<td [class.warning]="order.isLate"></td>
<button [disabled]="!order.canApprove">Duyệt</button>
```

Tính trước trong VM:

```ts
function toOrderRowVm(order: OrderDto, permissions: Permission[]): OrderRowVm {
  return {
    ...,
    totalText: formatMoney(order.totalAmount),
    isLate: isOrderLate(order),
    canApprove: canApproveOrder(order, permissions)
  };
}
```

Template nên đọc dữ liệu, không nên là nơi xử lý nghiệp vụ.

---

## 16. RxJS: tránh nested subscribe

Không tốt:

```ts
this.route.paramMap.subscribe(params => {
  const id = params.get('id')!;

  this.api.getOrder(id).subscribe(order => {
    this.order = order;
  });
});
```

Tốt hơn:

```ts
order$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged(),
  switchMap(id => this.api.getOrder(id))
);
```

Nguyên tắc chọn operator:

```text
switchMap:
-> latest wins, search/detail/query params

exhaustMap:
-> submit chống double click

concatMap:
-> save tuần tự

mergeMap:
-> request độc lập chạy song song
```

---

## 17. Form production

Form lớn nên có thiết kế, không chỉ thêm `formControlName`.

Checklist:

```text
[ ] Form model có type rõ không?
[ ] Init data từ API dùng patchValue(..., { emitEvent: false }) khi cần không?
[ ] Derived field có tránh valueChanges loop không?
[ ] Async validator có debounce/updateOn blur không?
[ ] Disabled field khi submit dùng value hay getRawValue?
[ ] Custom component có CVA đúng không?
[ ] Error message có consistent không?
```

Ví dụ tính field:

```ts
combineLatest([
  this.form.get('quantity')!.valueChanges.pipe(startWith(this.form.get('quantity')!.value)),
  this.form.get('price')!.valueChanges.pipe(startWith(this.form.get('price')!.value))
]).pipe(
  map(([quantity, price]) => (quantity || 0) * (price || 0)),
  takeUntilDestroyed(this.destroyRef)
).subscribe(total => {
  this.form.patchValue({ total }, { emitEvent: false });
});
```

---

## 18. Permission trong frontend

Permission nên được xử lý nhất quán:

```ts
canCreateOrder$ = this.authState.permissions$.pipe(
  map(permissions => permissions.includes('Order.Create'))
);
```

Trong VM:

```ts
vm$ = combineLatest({
  orders: this.orders$,
  canCreate: this.permissionService.has$('Order.Create'),
  canApprove: this.permissionService.has$('Order.Approve')
});
```

Template:

```html
<button *ngIf="vm.canCreate" nz-button>Tạo đơn</button>
```

Nhớ:

```text
Frontend permission là UX.
Backend authorization mới là bảo mật thật.
```

---

## 19. Performance là thiết kế, không phải vá sau

Các thói quen tốt:

```text
[ ] OnPush cho presentational/list row component
[ ] trackBy cho list lớn
[ ] Không gọi function nặng trong template
[ ] Không tạo object/array inline truyền xuống component con
[ ] Debounce search/input
[ ] Virtual scroll/paging cho list lớn
[ ] Lazy load route theo feature
[ ] shareReplay/cache cho API đọc nhiều
```

Không tốt:

```html
<app-row
  *ngFor="let row of rows"
  [config]="{ editable: true }"
  [score]="calculateScore(row)">
</app-row>
```

Tốt hơn:

```html
<app-row
  *ngFor="let row of rows; trackBy: trackById"
  [config]="rowConfig"
  [row]="row">
</app-row>
```

---

## 20. Abstraction: khi nào nên tách?

Đừng tách chỉ vì hai đoạn code nhìn giống nhau. Tách khi chúng có cùng lý do thay đổi.

Nên tách khi:

```text
- Logic lặp lại từ 3 nơi trở lên và cùng mục đích
- Có rule nghiệp vụ quan trọng cần test riêng
- Component quá dài vì nhiều trách nhiệm
- Một khối code có thể đặt tên rõ ràng
- Tách ra làm call site dễ đọc hơn
```

Chưa nên tách khi:

```text
- Chỉ giống nhau về hình dạng
- Requirement còn chưa ổn định
- Abstraction làm người đọc phải nhảy file nhiều hơn
- Tên abstraction mơ hồ như Helper/Manager/Common
```

Ví dụ:

```text
Hai màn hình đều có nút "Lưu" không có nghĩa cần SaveButton chung.
Ba màn hình cùng xử lý money input với format/parse/validation giống nhau thì nên có MoneyInput/CVA chung.
```

---

## 21. Shared code: đừng biến shared thành bãi rác

`shared` chỉ nên chứa thứ thật sự dùng chung và ít phụ thuộc business cụ thể.

Phù hợp:

```text
- UI component generic
- pipe format
- directive nhỏ
- utility pure function
- layout primitive
```

Không phù hợp:

```text
- logic riêng của Orders
- mapper riêng của Patient
- component chỉ dùng bởi một feature
- service ôm quá nhiều domain
```

Rule:

```text
Nếu chỉ một feature dùng, để trong feature.
Khi feature thứ hai cần, xem có thật cùng lý do thay đổi không rồi mới đưa shared.
```

---

## 22. Testing: test thứ đáng sợ

Không phải mọi dòng code đều cần test bằng mọi giá. Nhưng logic quan trọng nên có test.

Nên test:

```text
- mapper DTO -> VM có rule
- guard/permission
- validator form
- facade data flow
- reducer/updater
- utility tính toán tiền/trạng thái
- bug từng xảy ra
```

Ít giá trị hơn:

```text
- test getter trivial
- test Angular binding quá đơn giản
- test implementation detail dễ đổi
```

Ví dụ test mapper:

```ts
it('maps cancelled order to red status', () => {
  const vm = toOrderRowVm({
    id: '1',
    code: 'OD001',
    customerName: 'An',
    status: 'CANCELLED',
    totalAmount: 100000
  });

  expect(vm.statusText).toBe('Đã hủy');
  expect(vm.statusColor).toBe('red');
  expect(vm.totalAmountText).toBe('100.000');
});
```

---

## 23. Code review như Middle/Senior

Review theo thứ tự:

```text
1. Correctness:
   Code có đúng nghiệp vụ không?

2. Edge cases:
   Empty/error/loading/permission/null handled chưa?

3. Data flow:
   Source of truth rõ không?

4. Boundary:
   Logic có nằm đúng chỗ không?

5. Maintainability:
   Requirement đổi thì sửa ở đâu?

6. Performance:
   Có vấn đề rõ với list lớn/template/API thừa không?

7. Style:
   Naming, format, consistency.
```

Đừng review style trước correctness. Code đẹp mà sai nghiệp vụ vẫn là sai.

---

## 24. Checklist trước khi merge feature

```text
Architecture:
[ ] Feature boundary rõ chưa?
[ ] Component page có quá dày không?
[ ] API service/facade/state có trách nhiệm rõ không?
[ ] Shared code có thật sự shared không?

Data:
[ ] Source of truth rõ chưa?
[ ] State nào ở URL/form/service/store đã hợp lý chưa?
[ ] Có duplicate derived state không?
[ ] Mutation có refresh/invalidate cache không?

UI states:
[ ] Loading
[ ] Error
[ ] Empty
[ ] Permission denied
[ ] Disabled/submitting state

Angular:
[ ] OnPush/trackBy cho list phù hợp chưa?
[ ] Có nested subscribe không?
[ ] Subscribe thủ công có cleanup không?
[ ] Template có function nặng không?

Forms:
[ ] Validator đúng chỗ chưa?
[ ] emitEvent false khi patch ngược chưa?
[ ] Submit dùng value/getRawValue đúng chưa?

Testing:
[ ] Logic nghiệp vụ quan trọng có test chưa?
[ ] Bug risk cao có test chưa?
```

---

## 25. Cách luyện để viết code có hệ thống hơn

### 25.1. Trước khi code, viết 5 dòng design

```text
1. Feature này có route/state/API gì?
2. Source of truth của filter/detail/form là gì?
3. Component nào là page, component nào là presentational?
4. Side effect nằm ở facade/service nào?
5. Loading/error/empty xử lý ra sao?
```

### 25.2. Sau khi code, tự review bằng checklist

Không cần làm nghi thức nặng. Chỉ cần 5 phút hỏi:

```text
Code này 3 tháng nữa mình đọc lại có hiểu không?
Nếu đổi API field, sửa ở đâu?
Nếu thêm permission, sửa ở đâu?
Nếu API lỗi, UI ra sao?
Nếu list 1000 dòng, có ổn không?
```

### 25.3. Refactor nhỏ, đều

Đừng chờ code mục nát mới refactor lớn.

```text
- đổi tên biến cho rõ
- tách mapper
- đưa API call ra service
- gom loading/error thành state
- thêm trackBy
- bỏ duplicate state
```

Senior codebase thường tốt lên nhờ nhiều refactor nhỏ đúng lúc.

---

## 26. Tóm tắt tư duy

```text
Junior hỏi: viết sao cho chạy?
Middle hỏi: viết sao cho rõ và ít bug?
Senior hỏi: viết sao cho team còn maintain được khi feature đổi?
```

Một câu chốt:

```text
Frontend senior không phải người dùng nhiều pattern nhất.
Frontend senior là người biết pattern nào đáng dùng, dùng ở đâu, và lúc nào nên giữ code đơn giản.
```

Hãy viết code theo 4 trục:

```text
Boundary rõ.
Data flow rõ.
State có source of truth.
UI state production đầy đủ.
```

Nếu giữ được 4 trục này, base code sẽ ổn định hơn rất nhiều.
