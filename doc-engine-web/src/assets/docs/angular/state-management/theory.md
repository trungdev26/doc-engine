# State Management trong Angular từ cơ bản đến nâng cao

Tài liệu này tập trung vào tư duy thiết kế state trong Angular production: khi nào để state trong component, khi nào đưa vào service, khi nào dùng URL, khi nào cần store, cách cache dữ liệu, invalidation, facade pattern và những lỗi state thường gặp ở dự án lớn.

Mục tiêu middle/senior không phải là "biết dùng thư viện store", mà là biết chọn đúng nơi đặt state, đúng vòng đời, đúng boundary và đúng mức phức tạp.

---

## 1. State là gì?

State là dữ liệu làm UI hiện tại có hình dạng như nó đang có.

Ví dụ trong màn hình danh sách bệnh nhân:

```text
- keyword đang search
- filter trạng thái
- page hiện tại
- danh sách bệnh nhân trả về từ API
- loading/error
- row nào đang selected
- modal thêm mới có mở không
- user hiện tại có quyền gì
```

Không phải state nào cũng giống nhau. Senior Angular thường bắt đầu bằng câu hỏi:

```text
State này thuộc loại gì?
Ai sở hữu nó?
Nó sống bao lâu?
Có cần share qua màn hình khác không?
Refresh có cần giữ không?
Có cần cache không?
Khi nào nó stale?
```

---

## 2. Các loại state trong Angular app

### 2.1. Local UI state

State chỉ phục vụ một component.

```ts
isModalOpen = false;
selectedTab = 'info';
expandedRowId: string | null = null;
```

Phù hợp để trong component nếu:

```text
- Chỉ component này dùng
- Không cần share
- Mất khi rời component cũng ổn
- Không cần deep link/share URL
```

### 2.2. Route/URL state

State nên nằm trong URL khi user cần refresh/share/back-forward vẫn giữ đúng màn hình.

```text
/patients?keyword=an&status=active&page=2
```

Phù hợp cho:

```text
- keyword
- filter
- sort
- page/pageSize
- selected tab quan trọng
- id của resource
```

URL là state public của màn hình. Nếu state quyết định "user đang xem gì", hãy cân nhắc đưa vào URL.

### 2.3. Server state

Dữ liệu đến từ backend.

```text
- danh sách bệnh nhân
- chi tiết phiếu khám
- cấu hình hệ thống
- quyền user
- danh mục tỉnh/huyện/xã
```

Server state có các vấn đề riêng:

```text
- loading/error
- cache
- stale data
- refresh
- optimistic update
- conflict
- pagination/filter
```

### 2.4. Client shared state

State do frontend sở hữu và cần nhiều nơi dùng.

```text
- current user
- selected branch/tenant
- theme
- sidebar collapsed
- draft form dùng qua nhiều step
- wizard progress
```

Loại này thường đặt trong service/store.

### 2.5. Derived state

State tính ra từ state khác.

```ts
hasData = patients.length > 0;
totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
canSubmit = form.valid && !saving;
```

Rule quan trọng:

```text
Nếu tính được từ state khác, đừng lưu riêng trừ khi có lý do rõ.
```

Lưu derived state riêng dễ gây lệch:

```text
patients thay đổi nhưng hasData quên update
items thay đổi nhưng totalAmount vẫn cũ
```

---

## 3. State nên đặt ở đâu?

### 3.1. Component field

```ts
export class PatientListComponent {
  isAdvancedFilterOpen = false;
}
```

Dùng khi state local, đơn giản, không cần share.

### 3.2. Form

Reactive Form tự là một state container cho dữ liệu nhập liệu.

```ts
form = this.fb.group({
  keyword: [''],
  status: ['all']
});
```

Không cần tạo thêm `keyword` field riêng nếu có thể đọc từ form.

### 3.3. URL

```ts
this.router.navigate([], {
  relativeTo: this.route,
  queryParams: { keyword, page: 1 },
  queryParamsHandling: 'merge'
});
```

Dùng cho state cần deep link, refresh, browser history.

### 3.4. Service + RxJS

```ts
@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  setUser(user: User | null): void {
    this.userSubject.next(user);
  }
}
```

Dùng cho shared state vừa phải, không cần store framework.

### 3.5. Store framework

Ví dụ NgRx, Signal Store, NGXS, Akita.

Dùng khi state phức tạp:

```text
- nhiều màn hình đọc/ghi cùng một state
- nhiều action tác động state
- cần devtools/time travel/logging
- cần effect phức tạp
- team lớn cần convention chặt
- entity cache nhiều loại dữ liệu
```

Không nên dùng store framework chỉ vì "cho senior". Senior là biết khi nào chưa cần.

---

## 4. Decision tree nhanh

```text
State chỉ dùng trong 1 component?
-> component field hoặc form

State cần refresh/share/back-forward?
-> URL query params/path params

State lấy từ API và chỉ dùng trong 1 màn hình?
-> component service hoặc component vm$

State lấy từ API và nhiều màn hình dùng lại?
-> service cache/facade/store

State do frontend sở hữu và nhiều nơi cần?
-> service state hoặc store

State có nhiều action, nhiều effect, nhiều entity?
-> cân nhắc NgRx/Signal Store
```

---

## 5. Local state trong component

### 5.1. Khi nào đủ?

```ts
export class PatientTableComponent {
  selectedRowId: string | null = null;
  isColumnConfigOpen = false;

  selectRow(row: PatientRow): void {
    this.selectedRowId = row.id;
  }
}
```

Đây là state local. Đưa nó vào global store sẽ làm code nặng hơn.

### 5.2. Local state với OnPush

Với `OnPush`, event trong component vẫn trigger check.

```ts
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientTableComponent {
  selectedId: string | null = null;

  select(id: string): void {
    this.selectedId = id;
  }
}
```

Nhưng nếu update state từ callback ngoài Angular zone hoặc từ subscription thủ công, có thể cần `markForCheck()`.

### 5.3. Tránh duplicate state

Không tốt:

```ts
patients: Patient[] = [];
hasPatients = false;

setPatients(patients: Patient[]): void {
  this.patients = patients;
  this.hasPatients = patients.length > 0;
}
```

Tốt hơn:

```ts
patients: Patient[] = [];

get hasPatients(): boolean {
  return this.patients.length > 0;
}
```

Hoặc nếu dùng stream:

```ts
vm$ = this.patients$.pipe(
  map(patients => ({
    patients,
    hasPatients: patients.length > 0
  }))
);
```

---

## 6. URL state

### 6.1. Vì sao URL là state quan trọng?

Màn hình list mà filter/page chỉ nằm trong component sẽ gặp vấn đề:

```text
- refresh mất filter
- copy link gửi người khác không đúng màn hình
- browser back không quay lại filter trước
- mở tab mới không giữ state
```

URL giúp state trở thành một phần của navigation.

### 6.2. Đồng bộ form filter với query params

Init form từ URL:

```ts
ngOnInit(): void {
  this.route.queryParamMap
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(params => {
      this.form.patchValue(
        {
          keyword: params.get('keyword') ?? '',
          status: params.get('status') ?? 'all'
        },
        { emitEvent: false }
      );
    });
}
```

Update URL khi form đổi:

```ts
this.form.valueChanges
  .pipe(
    debounceTime(300),
    distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    takeUntilDestroyed(this.destroyRef)
  )
  .subscribe(value => {
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

### 6.3. Load data từ query params

```ts
query$ = this.route.queryParamMap.pipe(
  map(params => ({
    keyword: params.get('keyword') ?? '',
    status: params.get('status') ?? 'all',
    page: Math.max(1, Number(params.get('page') ?? 1))
  })),
  distinctUntilChanged((a, b) =>
    a.keyword === b.keyword &&
    a.status === b.status &&
    a.page === b.page
  )
);

result$ = this.query$.pipe(
  switchMap(query => this.api.searchPatients(query))
);
```

Tư duy quan trọng:

```text
URL là source of truth cho list query.
Form chỉ là UI để chỉnh URL.
API load theo URL.
```

---

## 7. Server state

### 7.1. Server state khác client state thế nào?

Server state có source of truth ở backend. Frontend chỉ giữ bản copy tạm thời.

```text
Backend: dữ liệu thật
Frontend: cache/snapshot hiện tại
```

Vì vậy server state luôn có câu hỏi:

```text
- Dữ liệu này có stale không?
- Khi nào refresh?
- Sau create/update/delete thì cache nào cần invalidate?
- Có optimistic update không?
- Nếu API lỗi thì rollback thế nào?
```

### 7.2. Load state cơ bản

```ts
patientsState$ = this.query$.pipe(
  switchMap(query =>
    this.api.searchPatients(query).pipe(
      map(data => ({ status: 'success', data, error: null } as const)),
      startWith({ status: 'loading', data: null, error: null } as const),
      catchError(() =>
        of({ status: 'error', data: null, error: 'Không tải được dữ liệu' } as const)
      )
    )
  )
);
```

UI không nên chỉ có data. Cần state cho loading/error/empty.

### 7.3. Cache đơn giản bằng shareReplay

```ts
departments$ = this.http.get<Department[]>('/api/departments').pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Phù hợp với danh mục ít đổi.

### 7.4. Cache có refresh trigger

```ts
private refreshDepartmentsSubject = new Subject<void>();

departments$ = this.refreshDepartmentsSubject.pipe(
  startWith(void 0),
  switchMap(() => this.http.get<Department[]>('/api/departments')),
  shareReplay({ bufferSize: 1, refCount: true })
);

refreshDepartments(): void {
  this.refreshDepartmentsSubject.next();
}
```

### 7.5. Invalidation sau mutation

```ts
createDepartment(input: CreateDepartmentInput): Observable<Department> {
  return this.http.post<Department>('/api/departments', input).pipe(
    tap(() => this.refreshDepartments())
  );
}
```

Sau mutation, hỏi:

```text
Mutation này làm stale cache nào?
List nào cần refresh?
Detail nào cần update?
Count/badge/summary nào bị ảnh hưởng?
```

---

## 8. Service state bằng BehaviorSubject

### 8.1. State service tối giản

```ts
export interface PatientListState {
  keyword: string;
  status: string;
  page: number;
}

const initialState: PatientListState = {
  keyword: '',
  status: 'all',
  page: 1
};

@Injectable()
export class PatientListStateService {
  private stateSubject = new BehaviorSubject<PatientListState>(initialState);
  state$ = this.stateSubject.asObservable();

  patchState(patch: Partial<PatientListState>): void {
    this.stateSubject.next({
      ...this.stateSubject.value,
      ...patch
    });
  }
}
```

### 8.2. Selectors

Không nên bắt component nào cũng tự map state.

```ts
keyword$ = this.state$.pipe(
  map(state => state.keyword),
  distinctUntilChanged()
);

page$ = this.state$.pipe(
  map(state => state.page),
  distinctUntilChanged()
);
```

Selector giúp:

```text
- component ít biết shape state tổng
- tránh render lại khi phần state không liên quan đổi
- dễ refactor state bên trong service
```

### 8.3. Không expose BehaviorSubject

Không nên:

```ts
state$ = new BehaviorSubject(initialState);
```

Vì component ngoài có thể gọi `.next()` tùy ý.

Nên:

```ts
private stateSubject = new BehaviorSubject(initialState);
state$ = this.stateSubject.asObservable();
```

State chỉ đổi qua method có nghĩa nghiệp vụ:

```ts
changeKeyword(keyword: string): void {
  this.patchState({ keyword, page: 1 });
}

changePage(page: number): void {
  this.patchState({ page });
}
```

---

## 9. Facade pattern

### 9.1. Facade là gì?

Facade là lớp API đơn giản cho component dùng, che đi chi tiết state, API, cache, store.

```text
Component
-> Facade
   -> API service
   -> State service / Store
   -> Router
```

Component chỉ biết:

```ts
vm$ = this.facade.vm$;

search(keyword: string): void {
  this.facade.search(keyword);
}

refresh(): void {
  this.facade.refresh();
}
```

### 9.2. Ví dụ facade cho list

```ts
@Injectable()
export class PatientListFacade {
  private refreshSubject = new Subject<void>();

  query$ = this.route.queryParamMap.pipe(
    map(params => ({
      keyword: params.get('keyword') ?? '',
      page: Number(params.get('page') ?? 1)
    })),
    distinctUntilChanged((a, b) => a.keyword === b.keyword && a.page === b.page)
  );

  result$ = combineLatest([
    this.query$,
    this.refreshSubject.pipe(startWith(void 0))
  ]).pipe(
    switchMap(([query]) =>
      this.api.search(query).pipe(
        map(data => ({ status: 'success', data } as const)),
        startWith({ status: 'loading', data: null } as const),
        catchError(() => of({ status: 'error', data: null } as const))
      )
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  vm$ = this.result$.pipe(
    map(result => ({
      result,
      isLoading: result.status === 'loading',
      hasData: result.status === 'success' && result.data.items.length > 0
    }))
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: PatientApiService
  ) {}

  search(keyword: string): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { keyword, page: 1 },
      queryParamsHandling: 'merge'
    });
  }

  refresh(): void {
    this.refreshSubject.next();
  }
}
```

### 9.3. Lợi ích

```text
- Component mỏng
- Data flow tập trung
- Dễ test facade
- Có thể đổi implementation từ RxJS service sang NgRx/Signal Store mà component ít đổi
- Giảm duplicate logic giữa nhiều component cùng feature
```

---

## 10. ComponentStore / local feature store

Một số dự án dùng `@ngrx/component-store` cho state ở cấp feature/component. Ý tưởng chính:

```text
- state nằm trong store service scoped theo feature
- updater thay đổi state
- selector đọc state
- effect xử lý async
```

Ví dụ khái niệm:

```ts
interface PatientListState {
  query: PatientQuery;
  data: Patient[];
  loading: boolean;
  error: string | null;
}
```

```ts
readonly vm$ = this.select(state => ({
  data: state.data,
  loading: state.loading,
  error: state.error,
  hasData: state.data.length > 0
}));
```

Nên cân nhắc khi service + BehaviorSubject bắt đầu có quá nhiều selector/updater/effect tự chế.

---

## 11. NgRx global store

### 11.1. NgRx giải quyết gì?

NgRx đưa state về mô hình:

```text
Action -> Reducer -> State -> Selector -> Component
        -> Effect -> API -> Action
```

Phù hợp khi:

```text
- state lớn, nhiều feature dùng chung
- action nhiều và cần trace rõ
- async effect phức tạp
- team lớn cần convention mạnh
- cần devtools
- cần entity adapter/cache normalized
```

### 11.2. Thành phần chính

```text
Action
-> sự kiện có ý nghĩa: loadPatients, loadPatientsSuccess

Reducer
-> pure function cập nhật state

Selector
-> đọc/derive state

Effect
-> xử lý side effect như gọi API, router, storage
```

### 11.3. Ví dụ flow

```text
PatientListComponent init
-> dispatch loadPatients({ query })
-> effect gọi API
-> success action
-> reducer lưu data vào state
-> selector emit data
-> component render
```

### 11.4. Khi nào chưa nên dùng NgRx?

```text
- App nhỏ
- State chủ yếu local theo page
- Team chưa quen pattern
- Chỉ muốn cache một vài API đơn giản
- Dùng NgRx làm code dài hơn nhưng không giải quyết vấn đề thật
```

NgRx mạnh, nhưng chi phí ceremony cao. Senior không tự động chọn NgRx; senior chọn khi lợi ích vượt chi phí.

---

## 12. Signal Store và Signals

Angular hiện đại có Signals. Signals rất hợp cho local state và derived state đồng bộ.

```ts
readonly keyword = signal('');
readonly page = signal(1);

readonly query = computed(() => ({
  keyword: this.keyword(),
  page: this.page()
}));
```

### 12.1. Signals phù hợp khi nào?

```text
- state đồng bộ trong component/service
- derived state rõ
- muốn update granular
- local UI state
- feature state không quá phụ thuộc stream async phức tạp
```

### 12.2. RxJS vẫn mạnh khi nào?

```text
- event stream theo thời gian
- debounce/throttle
- cancel request bằng switchMap
- combine async sources
- WebSocket
- polling
- router/form/http flow
```

### 12.3. Interop

```ts
patient = toSignal(this.patient$, { initialValue: null });
patient$ = toObservable(this.patientSignal);
```

Tư duy thực tế:

```text
Signals tốt cho state hiện tại và derived state.
RxJS tốt cho event/async stream.
Hai thứ bổ sung nhau, không cần biến thành cuộc chiến tôn giáo.
```

---

## 13. Normalized state

### 13.1. Vấn đề duplicate entity

Không tốt:

```ts
patientsList: Patient[];
selectedPatient: Patient;
recentPatients: Patient[];
```

Cùng một patient có thể nằm ở nhiều nơi. Update một nơi quên nơi khác sẽ lệch dữ liệu.

### 13.2. Normalize

```ts
interface PatientState {
  entities: Record<string, Patient>;
  ids: string[];
  selectedId: string | null;
}
```

Selector:

```ts
patients = ids.map(id => entities[id]);
selectedPatient = selectedId ? entities[selectedId] : null;
```

Phù hợp khi:

```text
- entity xuất hiện ở nhiều màn hình/list
- update entity cần phản ánh nhiều nơi
- cache detail/list phức tạp
- store lớn
```

Không cần normalize mọi thứ. Với một list đơn giản, array là đủ.

---

## 14. Case production thường gặp

### 14.1. List page: URL là source of truth

Bài toán rất phổ biến: màn hình danh sách có filter, sort, paging và nút refresh.

```text
/orders?keyword=abc&status=confirmed&page=2&pageSize=20
```

Nguyên tắc:

```text
URL giữ query state.
Form chỉ là UI để sửa query state.
API load theo query state từ URL.
```

Facade mẫu:

```ts
type OrderQuery = {
  keyword: string;
  status: string;
  page: number;
  pageSize: number;
};

@Injectable()
export class OrderListFacade {
  private refreshSubject = new Subject<void>();

  query$ = this.route.queryParamMap.pipe(
    map(params => ({
      keyword: params.get('keyword') ?? '',
      status: params.get('status') ?? 'all',
      page: Math.max(1, Number(params.get('page') ?? 1)),
      pageSize: Math.min(100, Math.max(10, Number(params.get('pageSize') ?? 20)))
    })),
    distinctUntilChanged((a, b) =>
      a.keyword === b.keyword &&
      a.status === b.status &&
      a.page === b.page &&
      a.pageSize === b.pageSize
    )
  );

  state$ = combineLatest([
    this.query$,
    this.refreshSubject.pipe(startWith(void 0))
  ]).pipe(
    switchMap(([query]) =>
      this.api.searchOrders(query).pipe(
        map(result => ({ status: 'success', query, result, error: null } as const)),
        startWith({ status: 'loading', query, result: null, error: null } as const),
        catchError(() =>
          of({ status: 'error', query, result: null, error: 'Không tải được đơn hàng' } as const)
        )
      )
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  vm$ = this.state$.pipe(
    map(state => ({
      ...state,
      isLoading: state.status === 'loading',
      hasData: state.status === 'success' && state.result.items.length > 0,
      total: state.status === 'success' ? state.result.totalCount : 0
    }))
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: OrderApiService
  ) {}

  search(keyword: string): void {
    this.patchQuery({ keyword, page: 1 });
  }

  changeStatus(status: string): void {
    this.patchQuery({ status, page: 1 });
  }

  changePage(page: number): void {
    this.patchQuery({ page });
  }

  refresh(): void {
    this.refreshSubject.next();
  }

  private patchQuery(query: Partial<OrderQuery>): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: query,
      queryParamsHandling: 'merge'
    });
  }
}
```

Component mỏng:

```ts
export class OrderListComponent {
  vm$ = this.facade.vm$;

  constructor(public facade: OrderListFacade) {}
}
```

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <app-order-filter
    [keyword]="vm.query.keyword"
    [status]="vm.query.status"
    (keywordChange)="facade.search($event)"
    (statusChange)="facade.changeStatus($event)">
  </app-order-filter>

  <app-loading *ngIf="vm.isLoading"></app-loading>
  <nz-alert *ngIf="vm.status === 'error'" nzType="error" [nzMessage]="vm.error"></nz-alert>

  <app-order-table
    *ngIf="vm.status === 'success'"
    [orders]="vm.result.items"
    [total]="vm.total"
    [page]="vm.query.page"
    (pageChange)="facade.changePage($event)">
  </app-order-table>
</ng-container>
```

Trade-off:

```text
Ưu:
- refresh/share/back-forward đúng
- component ít logic
- API không phụ thuộc form nội bộ

Nhược:
- phải kiểm soát vòng lặp form <-> URL
- query object cần distinctUntilChanged
```

### 14.2. Danh mục dùng nhiều nơi: cache + invalidation

Bài toán: nhiều màn hình cần danh mục khoa/phòng, chi nhánh, trạng thái, loại dịch vụ.

Không nên để mỗi component tự gọi API danh mục.

```ts
@Injectable({ providedIn: 'root' })
export class CatalogStateService {
  private refreshDepartmentsSubject = new Subject<void>();
  private refreshStatusesSubject = new Subject<void>();

  departments$ = this.refreshDepartmentsSubject.pipe(
    startWith(void 0),
    switchMap(() => this.api.getDepartments()),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  orderStatuses$ = this.refreshStatusesSubject.pipe(
    startWith(void 0),
    switchMap(() => this.api.getOrderStatuses()),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(private api: CatalogApiService) {}

  refreshDepartments(): void {
    this.refreshDepartmentsSubject.next();
  }

  refreshOrderStatuses(): void {
    this.refreshStatusesSubject.next();
  }
}
```

Sau khi thêm/sửa/xóa danh mục:

```ts
createDepartment(input: CreateDepartmentInput): Observable<Department> {
  return this.api.createDepartment(input).pipe(
    tap(() => this.catalogState.refreshDepartments())
  );
}
```

Rule production:

```text
Danh mục ít đổi:
-> cache được.

Danh mục có màn hình quản trị sửa:
-> phải có invalidation.

Danh mục phụ thuộc chi nhánh/tenant:
-> context đổi phải refresh/cache theo key.
```

### 14.3. Detail + edit page: tránh stale data sau save

Bài toán:

```text
/orders/123
-> xem detail
-> mở edit
-> save
-> quay lại detail/list phải thấy dữ liệu mới
```

Facade detail:

```ts
@Injectable()
export class OrderDetailFacade {
  private refreshSubject = new Subject<void>();

  orderId$ = this.route.paramMap.pipe(
    map(params => params.get('id')),
    filter((id): id is string => !!id),
    distinctUntilChanged()
  );

  order$ = combineLatest([
    this.orderId$,
    this.refreshSubject.pipe(startWith(void 0))
  ]).pipe(
    switchMap(([id]) => this.api.getOrder(id)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  constructor(
    private route: ActivatedRoute,
    private api: OrderApiService
  ) {}

  refresh(): void {
    this.refreshSubject.next();
  }
}
```

Edit save:

```ts
save(input: UpdateOrderInput): Observable<Order> {
  return this.api.updateOrder(input.id, input).pipe(
    tap(updated => {
      this.orderListState.patchOrder(updated);
      this.orderDetailState.invalidate(input.id);
    })
  );
}
```

Nếu list đang cache entities:

```ts
patchOrder(order: Order): void {
  const state = this.stateSubject.value;

  this.stateSubject.next({
    ...state,
    entities: {
      ...state.entities,
      [order.id]: order
    }
  });
}
```

Hai hướng phổ biến:

```text
Refresh lại từ API:
- đơn giản, đúng dữ liệu backend
- tốn request hơn

Patch cache local:
- UI nhanh
- phải chắc data update đủ field
- dễ sai nếu nhiều cache liên quan
```

### 14.4. Current user / tenant / branch context

Bài toán production rất hay gặp: user đổi chi nhánh, tenant, phòng ban hoặc workspace.

```ts
type AppContext = {
  user: User;
  tenantId: string;
  branchId: string;
  permissions: string[];
};
```

State service:

```ts
@Injectable({ providedIn: 'root' })
export class AppContextState {
  private contextSubject = new BehaviorSubject<AppContext | null>(null);
  context$ = this.contextSubject.asObservable();

  branchId$ = this.context$.pipe(
    map(context => context?.branchId ?? null),
    distinctUntilChanged()
  );

  permissions$ = this.context$.pipe(
    map(context => context?.permissions ?? []),
    distinctUntilChanged((a, b) => a.join('|') === b.join('|'))
  );

  setContext(context: AppContext): void {
    this.contextSubject.next(context);
  }
}
```

Khi branch đổi:

```ts
this.appContext.branchId$
  .pipe(
    filter((branchId): branchId is string => !!branchId),
    takeUntilDestroyed(this.destroyRef)
  )
  .subscribe(() => {
    this.catalogState.refreshDepartments();
    this.dashboardState.refresh();
    this.patientListState.clear();
  });
```

Điểm senior cần nhớ:

```text
Context đổi không chỉ đổi một biến.
Nó làm stale rất nhiều cache.
```

Checklist khi context đổi:

```text
[ ] menu/permission
[ ] danh mục theo chi nhánh
[ ] dashboard
[ ] list/detail đang cache
[ ] form draft đang mở
[ ] websocket subscription
[ ] selected entity hiện tại có còn hợp lệ không
```

### 14.5. Multi-step wizard: draft state

Bài toán: form tạo hồ sơ có nhiều bước, user chuyển qua lại giữa các step.

```text
Step 1: thông tin chung
Step 2: chi tiết dịch vụ
Step 3: thanh toán
Step 4: xác nhận
```

State service scoped theo wizard:

```ts
type CreateOrderDraft = {
  customer: CustomerDraft | null;
  services: ServiceDraft[];
  payment: PaymentDraft | null;
};

const initialDraft: CreateOrderDraft = {
  customer: null,
  services: [],
  payment: null
};

@Injectable()
export class CreateOrderDraftState {
  private draftSubject = new BehaviorSubject<CreateOrderDraft>(initialDraft);
  draft$ = this.draftSubject.asObservable();

  customer$ = this.draft$.pipe(
    map(draft => draft.customer),
    distinctUntilChanged()
  );

  services$ = this.draft$.pipe(
    map(draft => draft.services),
    distinctUntilChanged()
  );

  patchDraft(patch: Partial<CreateOrderDraft>): void {
    this.draftSubject.next({
      ...this.draftSubject.value,
      ...patch
    });
  }

  reset(): void {
    this.draftSubject.next(initialDraft);
  }
}
```

Provider ở route/component cha để draft sống trong wizard, rời wizard thì tự mất:

```ts
@Component({
  selector: 'app-create-order-page',
  templateUrl: './create-order-page.component.html',
  providers: [CreateOrderDraftState]
})
export class CreateOrderPageComponent {}
```

Tư duy scope:

```text
providedIn root:
-> draft sống toàn app, dễ rò state qua lần tạo sau.

providers ở wizard shell:
-> draft sống đúng vòng đời workflow.
```

### 14.6. Master-detail: selection state

Bài toán: một màn hình có list bên trái, detail bên phải.

```text
/patients?selectedId=123
```

Nếu selected item là trạng thái quan trọng, nên đưa vào URL:

```ts
selectPatient(id: string): void {
  this.router.navigate([], {
    relativeTo: this.route,
    queryParams: { selectedId: id },
    queryParamsHandling: 'merge'
  });
}
```

Load selected detail:

```ts
selectedPatient$ = this.route.queryParamMap.pipe(
  map(params => params.get('selectedId')),
  distinctUntilChanged(),
  switchMap(id => (id ? this.api.getPatient(id) : of(null)))
);
```

Nếu selection chỉ là hover/temporary local UI, để component state là đủ.

### 14.7. Autosave draft

Bài toán: form dài, user nhập thì tự lưu nháp.

```ts
this.form.valueChanges.pipe(
  debounceTime(1000),
  distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  switchMap(value =>
    this.api.saveDraft(value).pipe(
      catchError(() => EMPTY)
    )
  ),
  takeUntilDestroyed(this.destroyRef)
).subscribe();
```

Nếu không muốn request cũ bị cancel vì backend cần lưu tuần tự, dùng `concatMap`:

```ts
this.form.valueChanges.pipe(
  debounceTime(1000),
  concatMap(value => this.api.saveDraft(value).pipe(catchError(() => EMPTY))),
  takeUntilDestroyed(this.destroyRef)
).subscribe();
```

Chọn operator theo nghiệp vụ:

```text
switchMap:
- latest draft thắng
- request cũ không cần nữa

concatMap:
- mọi bản draft phải lưu theo thứ tự
- chậm hơn nhưng không đảo thứ tự
```

---

## 15. Optimistic update

### 15.1. Optimistic update là gì?

UI cập nhật trước khi API thành công để cảm giác nhanh hơn.

Ví dụ toggle favorite:

```text
User click favorite
-> UI đổi ngay
-> gọi API
-> nếu lỗi thì rollback
```

### 15.2. Ví dụ đơn giản

```ts
toggleFavorite(patient: Patient): void {
  const previous = patient.isFavorite;

  this.patchPatient(patient.id, {
    isFavorite: !previous
  });

  this.api.setFavorite(patient.id, !previous).pipe(
    catchError(error => {
      this.patchPatient(patient.id, { isFavorite: previous });
      this.message.error('Không cập nhật được');
      return EMPTY;
    })
  ).subscribe();
}
```

Chỉ dùng optimistic update khi:

```text
- action có khả năng thành công cao
- rollback rõ
- conflict ít nguy hiểm
- UX cần phản hồi nhanh
```

Không nên optimistic cho nghiệp vụ nhạy cảm như thanh toán, duyệt hồ sơ, xuất kho nếu chưa thiết kế kỹ.

---

## 16. State và permissions

Permission thường là shared state.

```ts
canViewPatient$ = this.authState.permissions$.pipe(
  map(permissions => permissions.includes('Patient.View'))
);
```

Nhưng nhớ:

```text
Frontend permission state chỉ phục vụ UX.
Backend vẫn phải check quyền thật.
```

Khi user/branch/tenant đổi, nhiều cache phải invalidate:

```text
- current permissions
- menu
- danh mục theo chi nhánh
- dashboard
- dữ liệu list/detail
```

Đây là điểm hay bị thiếu trong thiết kế state.

---

## 17. Persistence state

### 17.1. localStorage/sessionStorage

Phù hợp:

```text
- theme
- sidebar collapsed
- last selected branch nếu nghiệp vụ cho phép
- token/session theo security policy
```

Không phù hợp:

```text
- dữ liệu nhạy cảm không mã hóa
- cache lớn
- state có vòng đời phức tạp
- source of truth nghiệp vụ
```

### 17.2. Hydration state

```ts
const saved = localStorage.getItem('sidebarCollapsed');
this.sidebarCollapsed.set(saved === 'true');

effect(() => {
  localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed()));
});
```

Cẩn thận khi state persist phụ thuộc user/tenant. Đổi user mà vẫn dùng state user cũ là bug khó chịu.

---

## 18. Anti-pattern state thường gặp

### 18.1. Global store cho mọi thứ

Không phải state nào cũng cần global.

```text
Modal open/close local
Dropdown expanded local
Input draft local
```

Đưa tất cả vào store làm code dài, coupling tăng, review khó hơn.

### 18.2. Duplicate source of truth

```ts
queryFromUrl: Query;
queryInService: Query;
queryInForm: Query;
```

Nếu cả 3 đều có quyền quyết định API query, bug sẽ đến sớm. Chọn một source of truth.

### 18.3. Mutate state trực tiếp

Không tốt:

```ts
this.stateSubject.value.patients.push(newPatient);
this.stateSubject.next(this.stateSubject.value);
```

Tốt hơn:

```ts
const state = this.stateSubject.value;

this.stateSubject.next({
  ...state,
  patients: [...state.patients, newPatient]
});
```

Immutable update giúp OnPush, selector và debug dễ hơn.

### 18.4. Derived state lưu rời

```ts
items = [];
total = 0;
count = 0;
```

Nếu `total` và `count` tính được từ `items`, hãy derive.

### 18.5. Cache không invalidation

```ts
departments$ = this.api.getDepartments().pipe(shareReplay(1));
```

Nếu có màn hình thêm/sửa/xóa department mà không refresh cache, UI stale.

### 18.6. Component biết quá nhiều

Component vừa đọc route, patch form, gọi API, cache, xử lý permission, build VM, mở modal, sync URL. Đây là dấu hiệu nên tách facade/state service.

---

## 19. Testing state

### 19.1. Test reducer/updater

```ts
it('changes keyword and resets page', () => {
  const service = new PatientListStateService();

  service.changeKeyword('an');

  service.state$.subscribe(state => {
    expect(state.keyword).toBe('an');
    expect(state.page).toBe(1);
  });
});
```

### 19.2. Test facade behavior

Nên test theo hành vi:

```text
- search keyword update URL đúng
- query params đổi thì gọi API đúng query
- API lỗi thì vm chuyển error
- refresh trigger gọi lại API
- mutation xong invalidates cache
```

### 19.3. Test selector

```ts
it('selects active patients', () => {
  const state = {
    patients: [
      { id: '1', active: true },
      { id: '2', active: false }
    ]
  };

  expect(selectActivePatients(state).length).toBe(1);
});
```

Selector pure function nên test rất rẻ.

---

## 20. Checklist thiết kế state cho feature mới

```text
Phân loại:
[ ] State nào là local UI state?
[ ] State nào nên nằm trong URL?
[ ] State nào là server state?
[ ] State nào là shared client state?
[ ] State nào là derived state?

Ownership:
[ ] Ai là source of truth?
[ ] Component nào/service nào sở hữu state?
[ ] Có duplicate source of truth không?

Data flow:
[ ] User action đi qua method/action rõ chưa?
[ ] API load theo query nào?
[ ] Mutation invalidate cache nào?
[ ] Loading/error/empty state đầy đủ chưa?

Architecture:
[ ] Component có quá dày không?
[ ] Có cần facade không?
[ ] Service + RxJS đủ chưa?
[ ] Có cần ComponentStore/NgRx/Signal Store không?

Performance:
[ ] Selector có distinctUntilChanged chưa?
[ ] OnPush có nhận reference mới không?
[ ] Cache có tránh API thừa không?
[ ] Cache có stale/invalidation không?

UX:
[ ] Refresh browser giữ đúng state cần giữ không?
[ ] Back/forward hoạt động đúng không?
[ ] Share link có đúng màn hình không?
[ ] Error có recovery/refresh không?
```

---

## 21. Lộ trình học State Management để lên middle/senior

### 21.1. Cơ bản

```text
- local component state
- Reactive Form là state container
- route/query params là state
- BehaviorSubject service
- async pipe
- immutable update
```

### 21.2. Middle

```text
- facade pattern
- vm$ pattern
- cache + refresh trigger
- loading/error state
- server state vs client state
- derived state
- URL sync cho list/search
```

### 21.3. Senior

```text
- chọn state boundary cho feature lớn
- normalized entity state
- invalidation strategy
- optimistic update và rollback
- permission/tenant/user context invalidation
- quyết định khi nào cần NgRx/Signal Store
- review anti-pattern state
- migration từ service state sang store mà ít ảnh hưởng component
```

---

## 22. Tóm tắt

```text
State Management không phải là chọn thư viện.

State Management là quyết định:
- state nào tồn tại
- nằm ở đâu
- ai sở hữu
- sống bao lâu
- stale khi nào
- update bằng action nào
- UI derive từ nó ra sao
```

Một Angular developer lên senior khi nhìn một feature có thể nói rõ:

```text
State này để local.
State này đưa vào URL.
Server state này cache ở facade, invalidate sau mutation X.
State này nhiều feature dùng, nên đưa vào shared store.
Derived state này không lưu riêng.
Component này đang quá dày, tách facade.
Chưa cần NgRx vì service + RxJS đủ.
```

Đó là năng lực thiết kế, không chỉ là syntax.
