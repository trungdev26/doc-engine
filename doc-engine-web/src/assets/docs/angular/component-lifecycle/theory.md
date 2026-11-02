# Vòng đời Component trong Angular từ cơ bản đến nâng cao

Tài liệu này giải thích vòng đời component trong Angular theo hướng từ cơ bản đến production: hook nào chạy khi nào, dùng để làm gì, tránh lỗi gì, phối hợp với `@Input`, template, content projection, `ViewChild`, RxJS, forms, Router, OnPush và cleanup như thế nào.

Mục tiêu middle/senior không phải là học thuộc tên hook, mà là biết đặt logic đúng thời điểm và đúng nơi.

---

## 1. Component lifecycle là gì?

Angular component không chỉ được "new lên rồi render". Nó đi qua nhiều bước:

```text
Tạo instance
-> resolve dependency
-> nhận input
-> chạy change detection
-> render template
-> init content/view
-> update khi input/state đổi
-> destroy khi component bị gỡ
```

Angular cung cấp các lifecycle hook để mình gắn logic vào những thời điểm đó.

Ví dụ:

```ts
export class PatientDetailComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    // load dữ liệu ban đầu
  }

  ngOnDestroy(): void {
    // cleanup subscription/timer/listener
  }
}
```

---

## 2. Thứ tự lifecycle hook

Vòng đời lần đầu của component thường theo thứ tự:

```text
constructor
ngOnChanges
ngOnInit
ngDoCheck
ngAfterContentInit
ngAfterContentChecked
ngAfterViewInit
ngAfterViewChecked
```

Khi component update:

```text
ngOnChanges nếu @Input reference/value đổi
ngDoCheck
ngAfterContentChecked
ngAfterViewChecked
```

Khi component bị destroy:

```text
ngOnDestroy
```

Bảng nhanh:

| Hook | Chạy khi nào | Dùng cho |
|---|---|---|
| `constructor` | class được tạo, DI sẵn sàng | inject dependency, init field đơn giản |
| `ngOnChanges` | input đổi, trước `ngOnInit` lần đầu | phản ứng theo `@Input` |
| `ngOnInit` | sau input lần đầu | init data, setup stream |
| `ngDoCheck` | mỗi lần Angular check component | custom change detection rất hạn chế |
| `ngAfterContentInit` | content projected vào component đã init | đọc `ContentChild` |
| `ngAfterContentChecked` | projected content được check | hiếm dùng |
| `ngAfterViewInit` | view và child view đã init | đọc `ViewChild`, DOM measurement |
| `ngAfterViewChecked` | view đã check | hiếm dùng, dễ gây loop |
| `ngOnDestroy` | component bị gỡ | cleanup |

---

## 3. constructor không phải nơi làm side effect lớn

`constructor` chạy khi class được tạo. Dependency injection đã sẵn sàng.

Phù hợp:

```ts
constructor(
  private api: PatientApiService,
  private route: ActivatedRoute
) {}
```

Hoặc init field đơn giản:

```ts
readonly columns = [
  { key: 'code', title: 'Mã' },
  { key: 'name', title: 'Tên' }
];
```

Không nên gọi API hoặc đụng DOM trong constructor:

```ts
constructor(private api: PatientApiService) {
  this.api.getPatients().subscribe(); // không nên
}
```

Lý do:

```text
- input chưa chắc đã có
- view chưa init
- khó test
- side effect xảy ra quá sớm
```

Rule:

```text
constructor để khai báo dependency.
ngOnInit/facade để bắt đầu workflow.
ngAfterViewInit để đụng view/DOM.
```

---

## 4. ngOnChanges

`ngOnChanges` chạy khi `@Input` thay đổi. Nó cũng chạy trước `ngOnInit` trong lần đầu nếu component có input.

Ví dụ:

```ts
@Input() patientId!: string;

ngOnChanges(changes: SimpleChanges): void {
  if (changes['patientId']) {
    this.loadPatient(this.patientId);
  }
}
```

`SimpleChange` có:

```text
previousValue
currentValue
firstChange
isFirstChange()
```

Ví dụ:

```ts
ngOnChanges(changes: SimpleChanges): void {
  const patientIdChange = changes['patientId'];

  if (!patientIdChange || patientIdChange.isFirstChange()) {
    return;
  }

  this.reload(patientIdChange.currentValue);
}
```

### Khi nào dùng ngOnChanges?

Dùng khi component con nhận input và cần derive state theo input:

```ts
@Input() query!: OrderListQuery;

ngOnChanges(): void {
  this.form.patchValue(this.query, { emitEvent: false });
}
```

Không nên dùng `ngOnChanges` để chứa workflow quá lớn. Nếu input đổi dẫn đến gọi API phức tạp, cân nhắc đưa vào facade hoặc dùng input setter/RxJS subject.

---

## 5. Input setter vs ngOnChanges

Input setter phù hợp khi chỉ quan tâm một input:

```ts
private patientIdSubject = new ReplaySubject<string>(1);

@Input() set patientId(value: string) {
  this.patientIdSubject.next(value);
}

patient$ = this.patientIdSubject.pipe(
  distinctUntilChanged(),
  switchMap(id => this.api.getPatient(id))
);
```

`ngOnChanges` phù hợp khi cần so sánh nhiều input cùng lúc:

```ts
@Input() fromDate!: string;
@Input() toDate!: string;

ngOnChanges(changes: SimpleChanges): void {
  if (changes['fromDate'] || changes['toDate']) {
    this.reloadRange(this.fromDate, this.toDate);
  }
}
```

Rule:

```text
Một input -> setter có thể gọn.
Nhiều input liên quan -> ngOnChanges rõ hơn.
Stream theo input -> setter + Subject/RxJS thường sạch.
```

---

## 6. ngOnInit

`ngOnInit` chạy một lần sau khi Angular set input lần đầu.

Phù hợp:

```text
- setup stream
- load initial data
- init form từ route/data
- subscribe có cleanup
- gọi facade.init()
```

Ví dụ:

```ts
ngOnInit(): void {
  this.patient$ = this.route.paramMap.pipe(
    map(params => params.get('id')),
    filter((id): id is string => !!id),
    distinctUntilChanged(),
    switchMap(id => this.api.getPatient(id))
  );
}
```

Hoặc với facade:

```ts
ngOnInit(): void {
  this.facade.init();
}
```

### Lỗi hay gặp

Nếu component route có thể reuse:

```text
/patients/1 -> /patients/2
```

`ngOnInit` không nhất thiết chạy lại. Vì vậy đọc snapshot một lần có thể sai:

```ts
ngOnInit(): void {
  const id = this.route.snapshot.paramMap.get('id')!;
  this.load(id);
}
```

Tốt hơn nếu param có thể đổi trong cùng component:

```ts
patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')!),
  distinctUntilChanged(),
  switchMap(id => this.api.getPatient(id))
);
```

---

## 7. ngDoCheck

`ngDoCheck` chạy mỗi lần Angular check component. Đây là hook rất dễ bị lạm dụng.

Ví dụ:

```ts
ngDoCheck(): void {
  console.log('checked');
}
```

Không nên đặt logic nặng ở đây:

```ts
ngDoCheck(): void {
  this.rows = this.expensiveFilter(this.allRows); // nguy hiểm
}
```

Vì hook này có thể chạy rất nhiều lần.

Khi nào dùng?

```text
- debug change detection
- custom diff rất đặc biệt
- integration với code cũ không reactive
```

Đa số app production không cần `ngDoCheck`.

---

## 8. Content lifecycle

Content lifecycle liên quan đến content projection:

```html
<app-card>
  <app-card-title>Thông tin</app-card-title>
</app-card>
```

Trong `app-card`, phần bên trong là projected content.

Hook:

```text
ngAfterContentInit
ngAfterContentChecked
```

Ví dụ:

```ts
@ContentChild(CardTitleComponent) title!: CardTitleComponent;

ngAfterContentInit(): void {
  console.log(this.title);
}
```

Dùng khi xây component dạng layout/container có `<ng-content>`.

Không nên mutate state gây render ngược phức tạp trong `ngAfterContentChecked`.

---

## 9. View lifecycle

View lifecycle liên quan đến template của chính component và child view.

Hook:

```text
ngAfterViewInit
ngAfterViewChecked
```

Ví dụ `ViewChild`:

```ts
@ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

ngAfterViewInit(): void {
  this.searchInput.nativeElement.focus();
}
```

Template:

```html
<input #searchInput>
```

`ViewChild` thường chỉ chắc chắn có sau `ngAfterViewInit`, trừ một số case static query.

### DOM measurement

```ts
@ViewChild('container') container!: ElementRef<HTMLElement>;

ngAfterViewInit(): void {
  const width = this.container.nativeElement.getBoundingClientRect().width;
}
```

Phù hợp:

```text
- focus input
- đo kích thước DOM
- init chart/library cần element thật
```

---

## 10. ExpressionChangedAfterItHasBeenCheckedError

Lỗi này thường xảy ra khi state bị đổi sau khi Angular đã check view trong cùng cycle.

Ví dụ dễ gây lỗi:

```ts
ngAfterViewInit(): void {
  this.isReady = true;
}
```

Nếu template bind:

```html
<div *ngIf="isReady">Ready</div>
```

Angular dev mode có thể báo:

```text
ExpressionChangedAfterItHasBeenCheckedError
```

Cách nghĩ đúng:

```text
Vì sao state này phải đổi sau view init?
Nó có thể tính sớm hơn không?
Nó có phải derived state từ input không?
Nó có nên render bằng async stream không?
```

Không nên reflex thêm `detectChanges()` mọi nơi để che lỗi.

Một vài hướng xử lý:

```text
- tính state trước ngAfterViewInit nếu có thể
- dùng async source phù hợp
- dùng after render API nếu dự án Angular mới hỗ trợ
- chỉ dùng ChangeDetectorRef khi hiểu rõ trade-off
```

---

## 11. ngAfterViewChecked

`ngAfterViewChecked` chạy sau mỗi lần view được check. Nó có thể chạy rất nhiều lần.

Không nên:

```ts
ngAfterViewChecked(): void {
  this.recalculateLayout(); // nặng
}
```

Dùng rất hạn chế cho debug/integration đặc biệt.

Nếu cần phản ứng với size/DOM change, cân nhắc:

```text
- ResizeObserver
- IntersectionObserver
- event cụ thể
- chart/library API
```

Không biến `ngAfterViewChecked` thành nơi "vá UI".

---

## 12. ngOnDestroy

`ngOnDestroy` chạy khi component/directive/service scoped bị destroy.

Dùng để cleanup:

```text
- subscription thủ công
- setInterval/setTimeout
- DOM event listener
- WebSocket
- third-party library instance
- chart/editor instance
```

Ví dụ:

```ts
private destroy$ = new Subject<void>();

ngOnInit(): void {
  this.form.valueChanges.pipe(
    takeUntil(this.destroy$)
  ).subscribe();
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

Angular mới có `takeUntilDestroyed`:

```ts
constructor(private destroyRef: DestroyRef) {}

ngOnInit(): void {
  this.form.valueChanges.pipe(
    takeUntilDestroyed(this.destroyRef)
  ).subscribe();
}
```

---

## 13. DestroyRef

`DestroyRef` cho phép đăng ký cleanup gắn với lifecycle hiện tại.

```ts
constructor(private destroyRef: DestroyRef) {
  const intervalId = setInterval(() => {
    console.log('tick');
  }, 1000);

  this.destroyRef.onDestroy(() => {
    clearInterval(intervalId);
  });
}
```

Ưu điểm:

```text
- không cần tự tạo destroy$
- dùng được trong helper function nếu có injection context
- rõ cleanup nằm gần setup
```

Ví dụ helper:

```ts
function listenResize(callback: () => void): void {
  const destroyRef = inject(DestroyRef);

  window.addEventListener('resize', callback);

  destroyRef.onDestroy(() => {
    window.removeEventListener('resize', callback);
  });
}
```

---

## 14. Lifecycle và RxJS

Pattern tốt nhất thường là để template subscribe bằng `async pipe`:

```ts
patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')!),
  switchMap(id => this.api.getPatient(id))
);
```

Template:

```html
<ng-container *ngIf="patient$ | async as patient">
  {{ patient.name }}
</ng-container>
```

Không cần `ngOnDestroy` để unsubscribe vì `async pipe` tự cleanup.

Nếu subscribe thủ công vì side effect:

```ts
this.form.valueChanges.pipe(
  debounceTime(300),
  takeUntilDestroyed(this.destroyRef)
).subscribe(value => {
  this.autosave(value);
});
```

Rule:

```text
Render data -> async pipe.
Side effect -> subscribe thủ công + cleanup.
```

---

## 15. Lifecycle và Reactive Forms

Khởi tạo form có thể ở field hoặc constructor nếu không cần input:

```ts
form = this.fb.group({
  name: ['', Validators.required]
});
```

Nếu form cần input/API data:

```ts
ngOnInit(): void {
  this.api.getById(id).subscribe(data => {
    this.form.reset(toFormValue(data), { emitEvent: false });
    this.form.markAsPristine();
  });
}
```

Nếu component con nhận form qua input:

```ts
@Input() form!: FormGroup;
```

Không đọc `form` trong constructor vì input chưa set.

Nếu cần patch form khi input query đổi:

```ts
ngOnChanges(): void {
  this.form.patchValue(this.query, { emitEvent: false });
}
```

---

## 16. Lifecycle và Router reuse

Route component có thể không bị destroy khi chỉ param đổi.

```text
/orders/1
-> /orders/2
```

Nếu cùng route config, Angular có thể reuse component instance.

Không đủ:

```ts
ngOnInit(): void {
  const id = this.route.snapshot.paramMap.get('id')!;
  this.load(id);
}
```

Tốt hơn:

```ts
order$ = this.route.paramMap.pipe(
  map(params => params.get('id')!),
  distinctUntilChanged(),
  switchMap(id => this.api.getOrder(id))
);
```

Vòng đời component không phải lúc nào cũng trùng với vòng đời "resource id".

Senior cần phân biệt:

```text
Component lifecycle:
component instance sống/chết.

Route param lifecycle:
resource hiện tại đổi.
```

---

## 17. Lifecycle và OnPush

Lifecycle hook vẫn chạy với OnPush, nhưng change detection subtree có thể bị skip nếu không có signal check.

Các thứ thường trigger check OnPush:

```text
- @Input reference đổi
- event trong component
- async pipe emit
- markForCheck
- signal update trong template
```

Ví dụ lỗi:

```ts
@Input() patient!: Patient;

ngOnChanges(): void {
  // không chạy nếu cha mutate patient.name nhưng reference patient không đổi
}
```

Cha mutate:

```ts
this.patient.name = 'New name';
```

Tốt hơn:

```ts
this.patient = {
  ...this.patient,
  name: 'New name'
};
```

OnPush kéo theo tư duy immutable input.

---

## 18. Lifecycle và signals/effect

Nếu dùng Signals:

```ts
count = signal(0);
double = computed(() => this.count() * 2);
```

`effect` có lifecycle cleanup theo injection context:

```ts
constructor() {
  effect(() => {
    console.log(this.count());
  });
}
```

Nếu effect tạo side effect cần cleanup:

```ts
effect(onCleanup => {
  const id = setInterval(() => {
    console.log(this.count());
  }, 1000);

  onCleanup(() => clearInterval(id));
});
```

Không nên dùng `effect` để thay thế mọi lifecycle hook. Dùng khi logic thật sự reactive theo signal.

---

## 19. Lifecycle và third-party library

Ví dụ chart/editor cần DOM element.

```ts
@ViewChild('chart') chartEl!: ElementRef<HTMLElement>;

private chart: Chart | null = null;

ngAfterViewInit(): void {
  this.chart = new Chart(this.chartEl.nativeElement, {
    ...
  });
}

ngOnDestroy(): void {
  this.chart?.destroy();
}
```

Nếu library lắng nghe event/timer nội bộ, không destroy có thể leak memory.

Nếu library emit event dày:

```ts
this.ngZone.runOutsideAngular(() => {
  this.chart = initHeavyChart(this.chartEl.nativeElement);
});
```

Khi cần update Angular state:

```ts
this.ngZone.run(() => {
  this.selectedPoint = point;
});
```

---

## 20. Lifecycle của service theo DI scope

Service cũng có lifecycle nếu nó được provide trong scope có thể destroy.

Root service:

```ts
@Injectable({ providedIn: 'root' })
export class AppStateService {}
```

Sống gần như suốt vòng đời app.

Component-scoped service:

```ts
@Component({
  providers: [OrderFormFacade]
})
export class OrderFormPageComponent {}
```

`OrderFormFacade` sống cùng component instance. Khi component destroy, service scoped này cũng destroy nếu implement `OnDestroy`.

Route-level provider cũng có lifecycle theo route scope.

Điểm quan trọng:

```text
State cần reset khi rời page?
-> provide service ở component/route scope.

State toàn app?
-> providedIn root.
```

---

## 21. Hook nào nên tránh lạm dụng?

Thường dùng nhiều:

```text
ngOnInit
ngOnChanges
ngAfterViewInit
ngOnDestroy
```

Dùng hạn chế:

```text
ngDoCheck
ngAfterContentChecked
ngAfterViewChecked
```

Nếu code phụ thuộc nhiều vào checked hooks, thường là dấu hiệu data flow chưa rõ.

---

## 22. Production examples

### 22.1. Detail page theo route param

```ts
vm$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged(),
  switchMap(id =>
    this.api.getPatient(id).pipe(
      map(patient => ({ loading: false, patient, error: null })),
      startWith({ loading: true, patient: null, error: null }),
      catchError(() => of({ loading: false, patient: null, error: 'Không tải được dữ liệu' }))
    )
  )
);
```

Không cần `ngOnInit` nếu field stream khởi tạo được trực tiếp.

### 22.2. Filter component nhận query input

```ts
@Input() query!: PatientQuery;
@Output() queryChange = new EventEmitter<Partial<PatientQuery>>();

form = this.fb.group({
  keyword: [''],
  status: ['all']
});

ngOnChanges(): void {
  if (!this.query) {
    return;
  }

  this.form.patchValue(this.query, { emitEvent: false });
}
```

### 22.3. Autosave form

```ts
ngOnInit(): void {
  this.form.valueChanges.pipe(
    debounceTime(1000),
    switchMap(value => this.api.saveDraft(value).pipe(catchError(() => EMPTY))),
    takeUntilDestroyed(this.destroyRef)
  ).subscribe();
}
```

---

## 23. Lỗi thường gặp

- **Gọi API trong constructor**
  Input/view chưa sẵn sàng, side effect quá sớm.

- **Đọc route snapshot trong route có thể reuse**
  Param đổi nhưng data không reload.

- **Quên unsubscribe**
  Form valueChanges, interval, fromEvent, WebSocket giữ component sống lâu hơn cần.

- **Mutate input với OnPush**
  `ngOnChanges` không chạy vì reference không đổi.

- **Dùng ngAfterViewChecked để sửa UI**
  Dễ loop, tốn performance, che data flow sai.

- **Gọi detectChanges để che ExpressionChanged**
  Có thể hợp lệ trong vài case, nhưng trước hết phải hiểu vì sao state đổi muộn.

- **Không destroy third-party instance**
  Chart/editor/listener leak memory.

---

## 24. Checklist chọn hook

```text
Inject dependency?
-> constructor

Setup stream/load data sau input lần đầu?
-> ngOnInit

Phản ứng khi @Input đổi?
-> ngOnChanges hoặc input setter

Đọc ContentChild/projected content?
-> ngAfterContentInit

Đọc ViewChild/DOM element?
-> ngAfterViewInit

Cleanup subscription/timer/listener/library?
-> ngOnDestroy hoặc DestroyRef

Route param có thể đổi nhưng component reuse?
-> paramMap/queryParamMap observable, không chỉ snapshot

Logic chạy mỗi CD check?
-> tránh nếu có thể, đừng lạm dụng ngDoCheck/ngAfterViewChecked
```

---

## 25. Senior checklist khi review lifecycle

```text
[ ] Constructor có side effect không?
[ ] ngOnInit có subscribe thủ công không? Cleanup ở đâu?
[ ] Route param đổi có reload đúng không?
[ ] Input đổi có xử lý đúng không?
[ ] Có mutate @Input không?
[ ] ViewChild/DOM access có đúng hook không?
[ ] Third-party library có destroy không?
[ ] Có dùng checked hooks cho logic nặng không?
[ ] Có ExpressionChanged fix bằng detectChanges bừa không?
[ ] Service state có scope đúng vòng đời không?
[ ] OnPush có nhận reference mới/async pipe/signal đúng không?
```

---

## 26. Tóm tắt

```text
Lifecycle hook không phải nơi nhét logic tùy tiện.
Nó là điểm nối giữa code của mình và runtime Angular.
```

Nhớ các trục chính:

```text
constructor:
dependency only

ngOnInit:
init workflow/stream

ngOnChanges:
input changes

ngAfterViewInit:
ViewChild/DOM/third-party init

ngOnDestroy/DestroyRef:
cleanup
```

Middle/Senior không chỉ biết hook nào chạy trước. Họ biết logic nào nên gắn với lifecycle nào, logic nào nên chuyển sang stream/facade/state, và cleanup thế nào để component không để lại rác khi bị destroy.
