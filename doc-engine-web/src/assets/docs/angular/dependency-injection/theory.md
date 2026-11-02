# Angular Dependency Injection

> Dependency Injection trong Angular không chỉ là cách inject một service vào component.
> Nó là cơ chế để Angular quản lý **cách tạo object**, **vị trí đăng ký dependency**, **số lượng instance**, **vòng đời của state/resource**, và **khả năng thay thế implementation** khi ứng dụng phát triển.

Tài liệu này đi theo một luồng thống nhất:

```text
Vì sao cần DI
→ Angular cần những metadata nào
→ Token, Provider và Injector phối hợp ra sao
→ Provider được đăng ký ở đâu
→ Scope quyết định lifecycle như thế nào
→ Cách inject dependency
→ Cách thiết kế service và state
→ Các case study thực tế
→ Cách chẩn đoán và review lỗi DI
```

Các khái niệm trong tài liệu được áp dụng vào một bài toán chung: xây dựng feature `patient-queue` — màn hình hàng chờ khám bệnh.

```text
- Hiển thị danh sách bệnh nhân đang chờ theo từng phòng khám.
- Cập nhật realtime khi có bệnh nhân mới vào hàng hoặc được gọi khám.
- Bắt đầu từ một service đơn giản, phát triển dần thành kiến trúc có API, state, facade và realtime handler.
```

---

## 1. Tổng quan về Dependency Injection

### 1.1. Vì sao Dependency Injection ra đời

Giả sử `PatientQueueComponent` cần tải dữ liệu hàng chờ khám bệnh — cách viết trực tiếp nhất là để component tự tạo ra service mà nó cần dùng:

```ts
export class PatientQueueComponent {
  private readonly queueService = new PatientQueueService();
}
```

Cách này trông đơn giản, nhưng component vừa nhận thêm một trách nhiệm mới: tự tạo ra `PatientQueueService`.

Vấn đề lộ rõ ngay khi `PatientQueueService` cần thêm dependency của riêng nó:

```ts
export class PatientQueueService {
  constructor(private readonly http: HttpClient) {}
}
```

Component không thể chỉ gọi:

```ts
new PatientQueueService();
```

nữa — nó phải biết cách tạo `HttpClient` trước, rồi mới tạo được `PatientQueueService`.

```text
PatientQueueComponent
→ tự tạo PatientQueueService
→ tự tạo HttpClient
→ tự tạo HttpBackend
→ tự cấu hình interceptor
→ tự quản lý lifecycle
```

Việc khởi tạo cứ thế kéo dài theo từng tầng dependency, và đây không còn là việc của một component chỉ có nhiệm vụ hiển thị hàng chờ. Cách làm này gây ra nhiều vấn đề:

```text
1. Coupling cao
   Component phụ thuộc trực tiếp vào implementation cụ thể.

2. Khó thay implementation
   Không thể dễ dàng đổi API thật thành mock hoặc adapter khác.

3. Khó test
   Test phải sử dụng dependency thật hoặc can thiệp vào code production.

4. Không quản lý được scope
   Không rõ object được dùng chung hay tạo mới.

5. Không quản lý được lifecycle
   Không rõ ai chịu trách nhiệm cleanup timer, subscription, connection.

6. Dependency chain bị phân tán
   Mỗi class tự tạo dependency khiến việc khởi tạo hệ thống khó kiểm soát.
```

Dependency Injection ra đời để giải quyết đúng nhóm vấn đề này: tách việc "class cần gì" ra khỏi việc "thứ đó được tạo ra bằng cách nào", và giao việc tạo dependency cho một cơ chế chung thay vì để từng class tự lo.

---

### 1.2. Dependency là gì?

**Dependency** là một object hoặc capability mà class cần dùng, nhưng không tự mình tạo ra — như `PatientQueueComponent` cần `PatientQueueService` để tải dữ liệu hàng chờ ở ví dụ trên. `PatientQueueService` chính là một dependency của `PatientQueueComponent`.

Một class thường cần nhiều hơn một dependency:

```ts
export class PatientQueueComponent {
  constructor(
    private readonly queueService: PatientQueueService,
    private readonly notificationService: NotificationService
  ) {}
}
```

```text
PatientQueueService
→ tải và xử lý dữ liệu hàng chờ.

NotificationService
→ hiển thị thông báo cho người dùng.
```

Dependency không nhất thiết luôn là service nghiệp vụ. Nó có thể là:

```text
- HttpClient
- Router
- Logger
- Configuration object
- API base URL
- Feature flag
- Factory function
- Plugin list
- Storage adapter
- State store
```

---

### 1.3. DI thay đổi trách nhiệm như thế nào?

Angular DI chính là lời giải cho vấn đề ở [§1.1](#11-vì-sao-dependency-injection-ra-đời):

```text
- Class không còn tự tạo dependency, mà chỉ khai báo mình cần gì.
- Việc tạo ra và cung cấp dependency đó thuộc về Angular.
```

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {
  constructor(
    private readonly queueService: PatientQueueService
  ) {}
}
```

Component chỉ khai báo:

```text
Tôi cần PatientQueueService.
```

Angular chịu trách nhiệm:

```text
- Token cần resolve là gì?
- Provider nằm ở injector nào?
- Dùng implementation nào?
- Instance đã tồn tại chưa?
- Có cần tạo instance mới không?
- Instance này sống bao lâu?
- Những dependency của PatientQueueService được tạo như thế nào?
```

DI đảo ngược quyền kiểm soát việc tạo object:

```text
Không dùng DI:
Class chủ động tạo dependency.

Dùng DI:
Class khai báo dependency.
Framework tạo và cung cấp dependency.
```

Đây là một dạng của **Inversion of Control** (đảo ngược quyền điều khiển): thông thường class tự quyết định cách tạo dependency, nhưng ở đây quyền đó được chuyển giao cho framework — class chỉ còn quyết định mình cần gì.

---

### 1.4. DI mang lại giá trị gì?

DI không tự động làm kiến trúc tốt. Nhưng nó tạo ra nền tảng để thiết kế kiến trúc tốt hơn.

```text
- Dependency được thể hiện rõ.
- Implementation có thể thay thế.
- State và resource có lifecycle rõ.
- Component có thể mỏng hơn.
- Service dễ test độc lập.
- Feature có thể tự quản lý scope.
- Global resource không bị tạo lặp ngoài ý muốn.
- Các boundary hạ tầng dễ tách khỏi business logic.
```

Điểm quan trọng nhất:

> Giá trị của DI không nằm ở việc bỏ từ khóa `new`.
> Giá trị nằm ở việc đưa quyền quản lý dependency về một composition mechanism thống nhất.

---

## 2. Mô hình hoạt động của Angular DI

Angular DI xoay quanh bốn khái niệm:

```text
Token
Provider
Injector
Injection context
```

---

### 2.1. Token

Token là key mà Angular dùng để tìm dependency.

Ví dụ:

```ts
constructor(
  private readonly queueService: PatientQueueService
) {}
```

Ở đây `PatientQueueService` có hai vai trò:

```text
TypeScript type
→ giúp compiler kiểm tra kiểu.

Runtime DI token
→ giúp Angular tìm provider.
```

Vì `class` còn tồn tại ở runtime, Angular có thể sử dụng chính class làm token.

---

### 2.2. Provider

Provider là cấu hình trả lời câu hỏi:

```text
Khi có code cần token X,
Angular phải cung cấp giá trị nào?
```

Ví dụ:

```ts
providers: [
  {
    provide: QueueApi,
    useClass: HttpQueueApi
  }
]
```

Có thể đọc thành:

```text
Khi cần QueueApi,
hãy tạo hoặc trả về HttpQueueApi.
```

Provider không chỉ dùng để ánh xạ class. Nó có thể trả về:

```text
- Một class instance
- Một object cấu hình
- Một primitive value
- Kết quả của factory
- Instance của token khác
- Danh sách nhiều implementation
```

---

### 2.3. Injector

Injector là runtime container lưu provider và quản lý instance.

Mental model đơn giản:

```text
Class cần token X
→ hỏi injector hiện tại
→ injector tìm provider của X
→ tạo hoặc trả instance đã cache
```

Angular không chỉ có một injector duy nhất. Injector có cấu trúc phân cấp.

```text
Environment Injector / Root Injector
└── Route Injector
    └── Component Element Injector
        └── Child Component Element Injector
```

Do đó cùng một token có thể có nhiều instance tại các nhánh injector khác nhau.

---

### 2.4. Dependency resolution flow

Ví dụ:

```ts
@Injectable()
export class PatientQueueFacade {
  constructor(
    private readonly api: PatientQueueApi,
    private readonly state: PatientQueueState
  ) {}
}
```

Khi Angular cần tạo `PatientQueueFacade`:

```text
1. Tìm provider của PatientQueueFacade.
2. Đọc metadata để biết constructor cần PatientQueueApi và PatientQueueState.
3. Resolve PatientQueueApi.
4. Resolve PatientQueueState.
5. Tạo PatientQueueFacade với hai dependency đã resolve.
6. Cache instance theo injector chứa provider của PatientQueueFacade.
7. Trả instance cho consumer.
```

Nếu `PatientQueueApi` tiếp tục cần `HttpClient`, Angular lặp lại quy trình cho đến khi resolve toàn bộ dependency graph.

---

### 2.5. Instance được cache theo provider và injector

Giả sử provider nằm ở route:

```ts
{
  path: 'patient-queue',
  providers: [PatientQueueState]
}
```

Trong route injector đó:

```text
Lần resolve đầu:
→ Angular tạo PatientQueueState.

Những lần resolve sau:
→ Angular trả lại cùng instance.
```

Nhưng route khác provide cùng token:

```ts
{
  path: 'patient-queue-monitor',
  providers: [PatientQueueState]
}
```

Sẽ có instance khác.

```text
Route A Injector → PatientQueueState instance A
Route B Injector → PatientQueueState instance B
```

Vì vậy câu:

```text
Service Angular là singleton.
```

không chính xác trong mọi trường hợp.

Cách nói chính xác hơn:

> Một provider thường có một instance được cache trong phạm vi injector chứa provider đó.

---

## 3. `@Injectable()` và metadata

### 3.1. `@Injectable()` là gì?

`@Injectable()` là decorator cung cấp metadata để Angular có thể tạo class thông qua DI.

```ts
@Injectable()
export class PatientQueueService {
  constructor(
    private readonly http: HttpClient
  ) {}
}
```

Metadata giúp Angular biết:

```text
- Class này tham gia DI.
- Constructor cần những dependency nào.
- Class có default provider thông qua providedIn hay không.
```

---

### 3.2. Vì sao Angular cần metadata?

TypeScript type information không phải lúc nào cũng còn nguyên sau khi compile.

Angular compiler cần tạo factory tương đương với mental model:

```ts
function PatientQueueService_Factory() {
  return new PatientQueueService(
    inject(HttpClient)
  );
}
```

Bạn không viết factory này bằng tay. Angular compiler tạo dựa trên metadata.

---

### 3.3. `@Injectable()` không đồng nghĩa đã có provider

Ví dụ:

```ts
@Injectable()
export class PatientQueueState {}
```

Class này có metadata để Angular tạo được instance.

Nhưng nếu không có:

```text
- providedIn
- providers ở route
- providers ở component
- providers ở application config
```

thì Angular vẫn không biết injector nào chịu trách nhiệm cung cấp nó.

Khi inject:

```ts
constructor(
  private readonly state: PatientQueueState
) {}
```

có thể gặp:

```text
NullInjectorError: No provider for PatientQueueState
```

Phân biệt:

```text
@Injectable()
→ Angular biết cách tạo class.

providedIn/providers
→ Angular biết đăng ký provider ở đâu.
```

---

### 3.4. `@Injectable({ providedIn: 'root' })`

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthService {}
```

Đoạn code trên thực hiện hai việc:

```text
1. Đánh dấu AuthService có thể được DI tạo.
2. Đăng ký default provider tại root environment injector.
```

Có thể hiểu gần tương đương:

```ts
@Injectable()
export class AuthService {}

bootstrapApplication(AppComponent, {
  providers: [AuthService]
});
```

Tuy nhiên `providedIn: 'root'` có lợi thế tree-shakable provider: nếu service không được sử dụng, build optimizer có thể loại bỏ nó tốt hơn.

---

### 3.5. Khi nào nên dùng `providedIn: 'root'`?

Phù hợp với service thật sự thuộc phạm vi application:

```text
- Authentication
- Current user/session
- Permission
- Global application config
- Global logger
- Toast/notification
- Shared cache có key đúng
- Một physical WebSocket connection dùng chung
```

Không nên dùng theo thói quen cho mọi service.

Các service sau thường cần scope hẹp hơn:

```text
- Feature state
- Wizard state
- Modal state
- Filter state
- Selection state
- Feature workflow
- Feature realtime handler
```

---

### 3.6. Có class không inject dependency thì cần `@Injectable()` không?

Ví dụ:

```ts
export class QueueMapper {
  map(dto: QueueDto): QueueVm {
    return {
      id: dto.id,
      name: dto.patientName
    };
  }
}
```

Nếu class chỉ được tạo thủ công:

```ts
const mapper = new QueueMapper();
```

thì không cần `@Injectable()`.

Nếu muốn Angular tạo thông qua provider:

```ts
providers: [QueueMapper]
```

nên đánh dấu rõ:

```ts
@Injectable()
export class QueueMapper {}
```

Điều này giúp code nhất quán và an toàn khi sau này class có thêm constructor dependency.

---

## 4. Provider và các cách đăng ký dependency

### 4.1. Provider tại root

Cách phổ biến:

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthService {}
```

Hoặc application-level providers:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    AuthService
  ]
});
```

Root provider sống theo application instance.

---

### 4.2. Provider tại route

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [
      PatientQueueApi,
      PatientQueueState,
      PatientQueueFacade
    ],
    loadComponent: () =>
      import('./patient-queue.page')
        .then(m => m.PatientQueuePage)
  }
];
```

Route provider phù hợp khi:

```text
- State chỉ thuộc feature.
- Rời feature muốn giải phóng state.
- Các page con cần dùng chung một instance.
- Không muốn global service giữ dữ liệu màn hình.
```

---

### 4.3. Provider tại component

```ts
@Component({
  selector: 'app-room-filter',
  providers: [RoomFilterState],
  templateUrl: './room-filter.component.html'
})
export class RoomFilterComponent {}
```

Mỗi instance `RoomFilterComponent` có một `RoomFilterState` riêng.

Phù hợp với:

```text
- Local form state
- Modal state
- Wizard state
- Table selection
- Filter instance
- Local cache
```

---

### 4.4. Provider shorthand

```ts
providers: [PatientQueueState]
```

là dạng rút gọn của:

```ts
providers: [
  {
    provide: PatientQueueState,
    useClass: PatientQueueState
  }
]
```

Token và implementation giống nhau nên Angular cho phép viết rút gọn.

---

### 4.5. Override provider

Provider gần consumer hơn có thể override provider ở tầng cha.

Root:

```ts
@Injectable({
  providedIn: 'root'
})
export class LoggerService {}
```

Feature:

```ts
{
  path: 'debug',
  providers: [
    {
      provide: LoggerService,
      useClass: DebugLoggerService
    }
  ]
}
```

Trong route `debug`:

```text
inject(LoggerService)
→ nhận DebugLoggerService.
```

Ngoài route:

```text
inject(LoggerService)
→ nhận root LoggerService.
```

Đây là cơ chế hữu ích, nhưng cũng là nguyên nhân gây bug nhiều instance khi override ngoài ý muốn.

---

## 5. Các loại Provider

### 5.1. `useClass`

Dùng khi token cần ánh xạ tới một implementation class.

```ts
export abstract class QueueApi {
  abstract getQueue(
    roomId: number
  ): Observable<QueueDto[]>;
}
```

Implementation:

```ts
@Injectable()
export class HttpQueueApi implements QueueApi {
  private readonly http = inject(HttpClient);

  getQueue(roomId: number): Observable<QueueDto[]> {
    return this.http.get<QueueDto[]>(
      `/api/rooms/${roomId}/queue`
    );
  }
}
```

Provider:

```ts
providers: [
  {
    provide: QueueApi,
    useClass: HttpQueueApi
  }
]
```

Consumer:

```ts
@Injectable()
export class PatientQueueFacade {
  constructor(
    private readonly api: QueueApi
  ) {}
}
```

Lợi ích:

```text
Production → HttpQueueApi
Testing    → FakeQueueApi
Offline    → LocalQueueApi
```

---

### 5.2. Khi nào abstraction là cần thiết?

Không cần tạo interface/abstract class cho mọi service.

Không cần thiết:

```ts
export class PatientQueueMapper {}
export interface IPatientQueueMapper {}
```

nếu:

```text
- Chỉ có một implementation.
- Không có boundary cần thay thế.
- Test có thể dùng class thật.
```

Abstraction hữu ích khi:

```text
- External integration.
- Có nhiều implementation.
- Cần switch theo môi trường.
- Cần plugin/strategy.
- Đây là boundary giữa business và infrastructure.
```

DI không đồng nghĩa mọi class phải có interface một-một.

---

### 5.3. `useValue`

Dùng để cung cấp một value có sẵn.

```ts
export interface QueueConfig {
  refreshIntervalMs: number;
  maxRetry: number;
}

export const QUEUE_CONFIG =
  new InjectionToken<QueueConfig>('QUEUE_CONFIG');
```

Provider:

```ts
providers: [
  {
    provide: QUEUE_CONFIG,
    useValue: {
      refreshIntervalMs: 5000,
      maxRetry: 3
    }
  }
]
```

Inject:

```ts
@Injectable()
export class QueuePollingService {
  constructor(
    @Inject(QUEUE_CONFIG)
    private readonly config: QueueConfig
  ) {}
}
```

Phù hợp với:

```text
- Static config
- Feature flag
- Default options
- Primitive values
- Prebuilt object
```

Cẩn thận với object mutable:

```ts
this.config.maxRetry = 100;
```

Vì mọi consumer có thể đang nhận cùng reference.

Nên ưu tiên immutable config:

```ts
export interface QueueConfig {
  readonly refreshIntervalMs: number;
  readonly maxRetry: number;
}
```

---

### 5.4. `useFactory`

Dùng khi giá trị cần logic khởi tạo.

```ts
export function queueConfigFactory(
  env: EnvironmentService
): QueueConfig {
  return {
    refreshIntervalMs: env.production ? 10000 : 3000,
    maxRetry: env.production ? 5 : 1
  };
}
```

Provider:

```ts
providers: [
  {
    provide: QUEUE_CONFIG,
    useFactory: queueConfigFactory,
    deps: [EnvironmentService]
  }
]
```

Luồng:

```text
Angular cần QUEUE_CONFIG
→ resolve EnvironmentService
→ gọi queueConfigFactory(env)
→ cache kết quả trong injector
→ trả QueueConfig
```

Cách viết bằng `inject()`:

```ts
providers: [
  {
    provide: QUEUE_CONFIG,
    useFactory: () => {
      const env = inject(EnvironmentService);

      return {
        refreshIntervalMs: env.production ? 10000 : 3000,
        maxRetry: env.production ? 5 : 1
      };
    }
  }
]
```

Dùng khi phụ thuộc:

```text
- Environment
- Runtime config
- Platform browser/server
- Feature flag
- Tenant configuration
- Existing dependency
```

Không nên đặt side effect lớn trong factory:

```text
- Gọi API
- Mở WebSocket
- Tạo subscription dài hạn
- Ghi dữ liệu
```

Factory nên tập trung vào việc tạo value/object.

---

### 5.5. `useExisting`

Dùng để alias token này sang token khác và giữ cùng instance.

```ts
@Injectable()
export class DefaultLoggerService {
  log(message: string): void {
    console.log(message);
  }
}
```

Provider:

```ts
providers: [
  DefaultLoggerService,
  {
    provide: LoggerService,
    useExisting: DefaultLoggerService
  }
]
```

Kết quả:

```text
inject(DefaultLoggerService)
inject(LoggerService)

→ cùng một instance.
```

Khác với:

```ts
providers: [
  DefaultLoggerService,
  {
    provide: LoggerService,
    useClass: DefaultLoggerService
  }
]
```

Cách này có thể tạo hai instance:

```text
Token DefaultLoggerService
→ instance A.

Token LoggerService
→ instance B.
```

Câu chốt:

```text
useExisting
→ alias tới instance đã có.

useClass
→ tạo instance cho token đang provide.
```

---

### 5.6. Multi provider

Dùng khi nhiều provider cùng đóng góp vào một token.

```ts
export interface QueuePlugin {
  handle(event: QueueEvent): void;
}

export const QUEUE_PLUGINS =
  new InjectionToken<QueuePlugin[]>('QUEUE_PLUGINS');
```

Đăng ký:

```ts
providers: [
  {
    provide: QUEUE_PLUGINS,
    useClass: QueueAuditPlugin,
    multi: true
  },
  {
    provide: QUEUE_PLUGINS,
    useClass: QueueNotificationPlugin,
    multi: true
  }
]
```

Inject:

```ts
@Injectable()
export class QueuePluginPipeline {
  constructor(
    @Inject(QUEUE_PLUGINS)
    private readonly plugins: QueuePlugin[]
  ) {}

  handle(event: QueueEvent): void {
    for (const plugin of this.plugins) {
      plugin.handle(event);
    }
  }
}
```

Phù hợp với:

```text
- Plugin architecture
- Interceptor pipeline
- Validator list
- Event handler list
- Feature extension point
```

Nếu thứ tự plugin quan trọng, phải document rõ thứ tự đăng ký hoặc bổ sung priority:

```ts
export interface QueuePlugin {
  readonly priority: number;
  handle(event: QueueEvent): void;
}
```

---

### 5.7. Bảng chọn Provider

| Nhu cầu | Provider |
| --- | --- |
| Chọn implementation class | `useClass` |
| Cung cấp value có sẵn | `useValue` |
| Tạo value bằng logic | `useFactory` |
| Hai token dùng chung một instance | `useExisting` |
| Nhiều implementation cùng đóng góp | `multi: true` |

---

## 6. `InjectionToken`

### 6.1. Vì sao không thể inject trực tiếp TypeScript interface?

Trong Angular DI, mỗi dependency phải có một **token tồn tại ở runtime** để Angular dùng làm key tra cứu provider.

Với class, Angular có thể dùng chính class đó làm token:

```ts
@Injectable()
export class PatientQueueApi {}
```

Inject:

```ts
constructor(
  private readonly api: PatientQueueApi
) {}
```

Ở đây `PatientQueueApi` vẫn tồn tại sau khi TypeScript được biên dịch sang JavaScript.

Có thể hình dung JavaScript sau khi build vẫn còn:

```js
class PatientQueueApi {}
```

Do đó Angular có thể dùng object class `PatientQueueApi` để tìm provider tương ứng.

---

Với interface thì khác.

```ts
export interface AppConfig {
  apiUrl: string;
  realtimeUrl: string;
}
```

Interface chỉ phục vụ việc kiểm tra kiểu trong lúc viết và build code.

Sau khi TypeScript biên dịch sang JavaScript, interface bị loại bỏ hoàn toàn:

```ts
// TypeScript
interface AppConfig {
  apiUrl: string;
}
```

```js
// JavaScript sau khi build
// Không còn AppConfig
```

Cơ chế này được gọi là **type erasure**.

Nói đơn giản:

```text
Class
→ còn tồn tại lúc ứng dụng chạy.

Interface
→ chỉ tồn tại lúc TypeScript kiểm tra kiểu,
  sau khi build thì biến mất.
```

Trong khi đó, Angular DI hoạt động lúc ứng dụng đang chạy.

Angular cần thực hiện logic tương tự:

```text
Consumer cần token X
→ tìm provider đã đăng ký cho token X
→ trả dependency tương ứng.
```

Nếu viết:

```ts
constructor(
  private readonly config: AppConfig
) {}
```

thì tại runtime Angular không còn thấy `AppConfig`.

Nó chỉ còn biết constructor có một tham số, nhưng không có runtime token để tra provider.

Vì vậy interface không thể được sử dụng trực tiếp làm Angular DI token.

---

Điểm cần phân biệt:

```text
TypeScript type
→ dùng để kiểm tra kiểu lúc compile.

Angular DI token
→ dùng để tìm provider lúc runtime.
```

Class có thể đóng cả hai vai trò:

```ts
constructor(
  private readonly api: PatientQueueApi
) {}
```

Trong khi interface chỉ làm được vai trò TypeScript type:

```ts
constructor(
  private readonly config: AppConfig
) {}
```

Do đó, với interface, Angular cần một object khác tồn tại ở runtime để đại diện cho nó.

Object đó chính là `InjectionToken`.

---

### 6.2. Tạo và sử dụng `InjectionToken`

Giả sử ứng dụng có cấu hình:

```ts
export interface AppConfig {
  readonly apiUrl: string;
  readonly realtimeUrl: string;
}
```

`AppConfig` giúp TypeScript kiểm tra cấu trúc dữ liệu, nhưng không thể làm DI token vì nó không tồn tại ở runtime.

Ta tạo một `InjectionToken`:

```ts
export const APP_CONFIG =
  new InjectionToken<AppConfig>('APP_CONFIG');
```

Dòng code này gồm ba phần khác nhau:

```text
APP_CONFIG
→ biến chứa token runtime thực sự.

<AppConfig>
→ kiểu dữ liệu mà token sẽ cung cấp.

'APP_CONFIG'
→ chuỗi mô tả để debug.
```

#### Token thật sự là gì?

Token thật sự là object được tạo bởi:

```ts
new InjectionToken<AppConfig>('APP_CONFIG')
```

Angular dùng chính object này để so khớp provider và consumer.

Chuỗi `'APP_CONFIG'` chỉ là tên mô tả, giúp thông báo lỗi dễ đọc hơn.

Nó không phải key thực sự.

Ví dụ:

```ts
const TOKEN_A =
  new InjectionToken<string>('API_URL');

const TOKEN_B =
  new InjectionToken<string>('API_URL');
```

Mặc dù có cùng description:

```text
API_URL
```

nhưng đây vẫn là hai token khác nhau:

```ts
TOKEN_A !== TOKEN_B;
```

Vì mỗi lần gọi `new InjectionToken()` sẽ tạo một object mới.

---

#### Đăng ký provider cho token

Sau khi có token, cần nói cho Angular biết giá trị nào sẽ được cung cấp khi có code inject `APP_CONFIG`.

```ts
providers: [
  {
    provide: APP_CONFIG,
    useValue: {
      apiUrl: 'https://api.example.com',
      realtimeUrl: 'wss://api.example.com/realtime'
    }
  }
]
```

Có thể đọc provider trên như sau:

```text
Khi có code yêu cầu token APP_CONFIG,
hãy trả về object cấu hình này.
```

---

#### Inject bằng constructor

```ts
@Injectable()
export class PatientQueueApi {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig
  ) {}

  getRooms() {
    return fetch(
      `${this.config.apiUrl}/patient-queue/rooms`
    );
  }
}
```

Trong đoạn code này:

```text
@Inject(APP_CONFIG)
→ nói cho Angular biết token cần resolve.

config: AppConfig
→ nói cho TypeScript biết kiểu dữ liệu của biến config.
```

Hai phần có vai trò khác nhau.

Angular dùng:

```ts
APP_CONFIG
```

để tìm provider.

TypeScript dùng:

```ts
AppConfig
```

để kiểm tra kiểu.

---

#### Inject bằng `inject()`

Với cách viết hiện đại:

```ts
@Injectable()
export class PatientQueueApi {
  private readonly config =
    inject(APP_CONFIG);

  getRooms() {
    return fetch(
      `${this.config.apiUrl}/patient-queue/rooms`
    );
  }
}
```

Vì `APP_CONFIG` đã được khai báo là:

```ts
InjectionToken<AppConfig>
```

nên TypeScript tự suy ra:

```ts
this.config
```

có kiểu `AppConfig`.

Do đó không cần viết thêm:

```ts
@Inject(APP_CONFIG)
```

---

#### Luồng resolve hoàn chỉnh

Khi Angular tạo `PatientQueueApi`:

```text
1. Angular thấy PatientQueueApi cần APP_CONFIG.
2. APP_CONFIG được dùng làm runtime token.
3. Angular tìm provider của APP_CONFIG trong injector tree.
4. Provider dùng useValue để trả object cấu hình.
5. Object được truyền vào PatientQueueApi.
6. TypeScript đảm bảo object đó có cấu trúc AppConfig.
```

Mental model:

```text
AppConfig
→ chỉ là contract về kiểu.

APP_CONFIG
→ runtime token để Angular tìm provider.

Provider
→ giá trị thực tế được trả về.
```

---

#### Khi nào cần dùng `InjectionToken`?

Dùng `InjectionToken` khi dependency không có class runtime để làm token:

```text
- Interface
- Config object
- String
- Number
- Boolean
- Function
- Array
- Plugin list
- Browser API abstraction
```

Ví dụ primitive:

```ts
export const API_BASE_URL =
  new InjectionToken<string>('API_BASE_URL');
```

```ts
providers: [
  {
    provide: API_BASE_URL,
    useValue: 'https://api.example.com'
  }
]
```

```ts
private readonly apiBaseUrl =
  inject(API_BASE_URL);
```

Ví dụ function:

```ts
export type QueueIdGenerator = () => string;

export const QUEUE_ID_GENERATOR =
  new InjectionToken<QueueIdGenerator>(
    'QUEUE_ID_GENERATOR'
  );
```

```ts
providers: [
  {
    provide: QUEUE_ID_GENERATOR,
    useValue: () => crypto.randomUUID()
  }
]
```

---

Câu chốt:

```text
Interface mô tả dependency có hình dạng như thế nào.

InjectionToken đại diện cho dependency đó tại runtime.

Provider quyết định giá trị thực tế nào được trả về khi token được inject.
```

---

### 6.3. Token identity

Hai token có cùng description vẫn khác nhau.

```ts
const TOKEN_A = new InjectionToken<string>('API_URL');
const TOKEN_B = new InjectionToken<string>('API_URL');
```

```text
TOKEN_A !== TOKEN_B
```

Nếu provide `TOKEN_A` nhưng inject `TOKEN_B`, Angular báo không có provider.

Rule:

```text
Một token phải được định nghĩa và export từ một nơi duy nhất.
Không tạo lại token theo description ở nhiều file.
```

---

### 6.4. Default provider của token

```ts
export const QUEUE_CONFIG =
  new InjectionToken<QueueConfig>('QUEUE_CONFIG', {
    providedIn: 'root',
    factory: () => ({
      refreshIntervalMs: 5000,
      maxRetry: 3
    })
  });
```

Token có thể tự cung cấp default value ở root.

Factory có thể inject dependency:

```ts
export const QUEUE_CONFIG =
  new InjectionToken<QueueConfig>('QUEUE_CONFIG', {
    providedIn: 'root',
    factory: () => {
      const env = inject(EnvironmentService);

      return {
        refreshIntervalMs: env.production ? 10000 : 3000,
        maxRetry: 3
      };
    }
  });
```

Provider tại route/component vẫn có thể override default value.

---

### 6.5. Khi nào nên dùng `InjectionToken`?

```text
- Interface-like contract
- Primitive value
- Configuration object
- Function
- Array/plugin list
- Browser global abstraction
- Optional capability
```

Ví dụ function:

```ts
export type QueueIdGenerator = () => string;

export const QUEUE_ID_GENERATOR =
  new InjectionToken<QueueIdGenerator>('QUEUE_ID_GENERATOR');
```

Provider:

```ts
{
  provide: QUEUE_ID_GENERATOR,
  useValue: () => crypto.randomUUID()
}
```

---

## 7. Injector Hierarchy, Scope và Lifecycle

### 7.1. Scope là gì?

Scope là phạm vi mà một provider có hiệu lực.

Scope quyết định:

```text
- Consumer nào nhìn thấy provider.
- Bao nhiêu instance được tạo.
- Instance được dùng chung với ai.
- State sống bao lâu.
- Resource cleanup ở thời điểm nào.
```

---

### 7.2. Root scope

```ts
@Injectable({
  providedIn: 'root'
})
export class CurrentUserService {}
```

Đặc điểm:

```text
- Một provider trong root injector.
- Dùng chung trong application instance.
- Thường sống đến khi app bị destroy/reload.
```

Phù hợp với:

```text
- CurrentUserService
- PermissionService
- AppConfigService
- LoggerService
- Global notification service
- Physical WebSocket connection
```

Rủi ro:

```text
- Feature state không reset.
- Object lớn bị giữ quá lâu.
- Subscription global không cleanup.
- State tenant/user cũ bị giữ khi đổi context.
```

---

### 7.3. Route scope

```ts
{
  path: 'patient-queue',
  providers: [
    PatientQueueState,
    PatientQueueFacade
  ]
}
```

Đặc điểm:

```text
- Dùng chung trong route subtree.
- Tách biệt với route khác.
- Phù hợp với feature lifecycle.
```

Phù hợp với:

```text
- Feature state
- Feature facade
- Feature workflow
- Feature cache
- Realtime handler theo màn hình
```

Route scope thường là lựa chọn tốt hơn root cho state màn hình.

---

### 7.4. Component scope

```ts
@Component({
  providers: [RoomFilterState]
})
export class RoomFilterComponent {}
```

Mỗi component instance có injector riêng.

Nếu template render:

```html
<app-room-filter></app-room-filter>
<app-room-filter></app-room-filter>
<app-room-filter></app-room-filter>
```

thì có:

```text
RoomFilterState instance A
RoomFilterState instance B
RoomFilterState instance C
```

Phù hợp với state độc lập theo instance.

---

### 7.5. Resolution từ gần đến xa

Giả sử:

```text
Root Injector
└── Route Injector
    └── Parent Component Injector
        └── Child Component Injector
```

Child cần token `QueueState`.

Angular tìm:

```text
1. Child component injector
2. Parent component injector
3. Route injector
4. Root injector
```

Provider gần nhất thắng.

---

### 7.6. Shadowing provider

Root có:

```ts
@Injectable({
  providedIn: 'root'
})
export class SelectedRoomState {}
```

Component khai báo lại:

```ts
@Component({
  providers: [SelectedRoomState]
})
export class RoomListComponent {}
```

Khi đó:

```text
RoomListComponent
→ dùng instance component.

Component khác ngoài subtree
→ dùng instance root.
```

Đây là nguyên nhân điển hình của lỗi:

```text
Service đã set dữ liệu nhưng component khác không nhận.
```

Thực tế hai component đang sử dụng hai instance khác nhau.

---

### 7.7. Lazy loading

Với kiến trúc NgModule cũ:

```ts
@NgModule({
  providers: [FeatureStateService]
})
export class PatientQueueModule {}
```

Nếu module lazy-loaded, provider thuộc lazy injector.

Điều này đúng với feature state, nhưng sai nếu vô tình provide lại service global:

```text
- AuthService
- CurrentUserService
- PermissionService
- WebSocketConnectionService
```

Hậu quả có thể là:

```text
- Auth state tách đôi.
- Permission cache không đồng bộ.
- WebSocket mở nhiều connection.
- Interceptor dùng token khác component.
```

---

### 7.8. `providedIn: 'root'` không phải singleton tuyệt đối

Câu nói:

```text
providedIn: 'root' = singleton.
```

chỉ đúng trong phạm vi đơn giản.

Cách hiểu chính xác:

```text
Provider mặc định được đăng ký ở root injector.
Root injector cache một instance cho provider đó.
```

Nhưng có thể có instance khác nếu:

```text
- Token bị provide lại ở route.
- Token bị provide lại ở component.
- Có nhiều Angular application bootstrap trên cùng page.
- Có platform-level/environment injector đặc biệt.
```

Do đó khi debug, phải kiểm tra **cây provider thực tế**, không chỉ nhìn `providedIn`.

---

### 7.9. Scope quyết định lifecycle của state

```ts
@Injectable()
export class PatientQueueState {
  readonly rooms = signal<RoomQueueVm[]>([]);
}
```

Signal không tự biết state nên sống bao lâu.

Nếu service ở root:

```text
rooms sống theo app.
```

Nếu service ở route:

```text
rooms sống theo feature route.
```

Nếu service ở component:

```text
rooms sống theo component instance.
```

Điều này áp dụng tương tự với:

```text
- BehaviorSubject
- ReplaySubject
- Signal
- Local cache
- Selected item
- Filter
- Form state
```

---

### 7.10. Scope và resource

Service có thể sở hữu resource:

```text
- WebSocket
- Timer
- DOM listener
- BroadcastChannel
- IndexedDB transaction
- Long-lived subscription
```

Scope phải phù hợp với resource.

Ví dụ:

```text
Physical WebSocket connection
→ root.

Feature-specific WebSocket subscription
→ route/component.

Polling chỉ khi modal mở
→ component.

App-wide online/offline listener
→ root.
```

---

## 8. Cách inject dependency

### 8.1. Constructor injection

```ts
@Injectable()
export class PatientQueueFacade {
  constructor(
    private readonly api: PatientQueueApi,
    private readonly state: PatientQueueState
  ) {}
}
```

Ưu điểm:

```text
- Dependency tập trung ở constructor.
- Dễ nhìn dependency graph.
- Phù hợp với class thuần.
- Dễ tạo class trực tiếp trong unit test.
```

Nhược điểm:

```text
- Constructor dài nếu class có quá nhiều dependency.
```

Constructor dài thường không phải lỗi của DI, mà là tín hiệu class đang ôm quá nhiều trách nhiệm.

---

### 8.2. `inject()`

```ts
@Injectable()
export class PatientQueueFacade {
  private readonly api = inject(PatientQueueApi);
  private readonly state = inject(PatientQueueState);
}
```

Phù hợp với:

```text
- Functional guard
- Functional interceptor
- Provider factory
- Field initializer
- Helper được tạo trong injection context
```

Ví dụ interceptor:

```ts
export const authInterceptor: HttpInterceptorFn = (
  request,
  next
) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getToken();

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};
```

---

### 8.3. Injection context

`inject()` chỉ hoạt động trong injection context hợp lệ.

Hợp lệ:

```text
- Constructor/factory do Angular gọi.
- Class field initializer của object do Angular tạo.
- Provider factory.
- Functional guard/interceptor.
- runInInjectionContext().
```

Không hợp lệ:

```ts
export function calculateQueue(): void {
  const api = inject(PatientQueueApi);
}
```

Nếu function được gọi như function thông thường, Angular không biết injector hiện tại là gì.

Thiết kế tốt hơn:

```ts
export function calculateQueue(
  api: PatientQueueApi
): void {
  // pure logic
}
```

Hoặc inject ở boundary rồi truyền dependency xuống.

---

### 8.4. `runInInjectionContext`

Trong trường hợp framework/library cần chạy function trong injector cụ thể:

```ts
runInInjectionContext(injector, () => {
  const service = inject(PatientQueueService);
  service.load();
});
```

Không nên dùng để thay thế constructor injection trong application code thông thường.

---

### 8.5. Resolution modifiers

#### `optional`

Cách hiện đại:

```ts
const logger = inject(LoggerService, {
  optional: true
});
```

Khi không có provider:

```text
logger = null
```

Dùng khi capability thực sự optional.

Không nên dùng optional để che lỗi cấu hình provider bắt buộc.

---

#### `self`

```ts
const control = inject(NgControl, {
  self: true
});
```

Chỉ tìm tại injector hiện tại.

Phù hợp khi directive yêu cầu provider nằm trên cùng element.

---

#### `skipSelf`

```ts
const parentContainer = inject(ControlContainer, {
  skipSelf: true
});
```

Bỏ qua injector hiện tại và tìm từ cha.

Phù hợp với nested form hoặc context từ parent.

---

#### `host`

Giới hạn lookup theo host boundary.

Thường dùng trong directive/component composition nâng cao. Khi dùng phải hiểu rõ host boundary, tránh dùng theo thử-sai.

---

## 9. Thiết kế service và state với DI

### 9.1. DI không tự đảm bảo Single Responsibility

Một service vẫn có thể phình to dù dùng DI.

```ts
@Injectable()
export class PatientQueueService {
  // gọi HTTP
  // giữ state
  // nghe WebSocket
  // map DTO
  // kiểm tra quyền
  // show toast
  // điều hướng
}
```

DI chỉ giúp tạo và cung cấp object. Việc chia trách nhiệm vẫn là quyết định thiết kế.

---

### 9.2. Tách service theo vai trò

Một feature có thể tách thành:

```text
PatientQueueApi
→ giao tiếp HTTP.

PatientQueueState
→ giữ state và state transition.

PatientQueueRealtimeHandler
→ map realtime event thành state update.

PatientQueueMapper
→ map DTO thành ViewModel.

PatientQueueFacade
→ expose use case cho component.
```

---

### 9.3. API service

```ts
@Injectable()
export class PatientQueueApi {
  private readonly http = inject(HttpClient);

  getRooms(): Observable<RoomQueueDto[]> {
    return this.http.get<RoomQueueDto[]>(
      '/api/patient-queue/rooms'
    );
  }
}
```

API service nên tập trung vào:

```text
- Endpoint
- Request/response type
- Query parameter
- HTTP concern cụ thể
```

Không nên giữ UI state hoặc trực tiếp show toast.

---

### 9.4. State service với Signal

```ts
@Injectable()
export class PatientQueueState {
  private readonly roomsState =
    signal<RoomQueueVm[]>([]);

  private readonly loadingState =
    signal(false);

  private readonly errorState =
    signal<string | null>(null);

  readonly rooms = this.roomsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  setLoading(value: boolean): void {
    this.loadingState.set(value);
  }

  setRooms(rooms: RoomQueueVm[]): void {
    this.roomsState.set(rooms);
  }

  setError(message: string | null): void {
    this.errorState.set(message);
  }

  updateWaitingCount(
    roomId: number,
    waitingCount: number
  ): void {
    this.roomsState.update(rooms =>
      rooms.map(room =>
        room.id === roomId
          ? { ...room, waitingCount }
          : room
      )
    );
  }

  reset(): void {
    this.roomsState.set([]);
    this.loadingState.set(false);
    this.errorState.set(null);
  }
}
```

State service nên:

```text
- Không expose writable signal trực tiếp.
- Cung cấp method transition rõ ràng.
- Không để component tự mutate state.
- Có reset nếu lifecycle yêu cầu.
```

---

### 9.5. State service với RxJS

```ts
@Injectable()
export class PatientQueueState {
  private readonly roomsSubject =
    new BehaviorSubject<RoomQueueVm[]>([]);

  readonly rooms$ =
    this.roomsSubject.asObservable();

  setRooms(rooms: RoomQueueVm[]): void {
    this.roomsSubject.next(rooms);
  }

  updateWaitingCount(
    roomId: number,
    waitingCount: number
  ): void {
    const rooms = this.roomsSubject.value;

    this.roomsSubject.next(
      rooms.map(room =>
        room.id === roomId
          ? { ...room, waitingCount }
          : room
      )
    );
  }
}
```

RxJS hay Signal không quyết định scope. Provider scope mới quyết định state lifetime.

---

### 9.6. Facade

```ts
@Injectable()
export class PatientQueueFacade {
  private readonly api = inject(PatientQueueApi);
  private readonly state = inject(PatientQueueState);
  private readonly mapper = inject(PatientQueueMapper);

  readonly rooms = this.state.rooms;
  readonly loading = this.state.loading;
  readonly error = this.state.error;

  load(): void {
    this.state.setLoading(true);
    this.state.setError(null);

    this.api.getRooms().subscribe({
      next: dtos => {
        this.state.setRooms(
          dtos.map(dto => this.mapper.toVm(dto))
        );
        this.state.setLoading(false);
      },
      error: () => {
        this.state.setError(
          'Không thể tải danh sách hàng chờ.'
        );
        this.state.setLoading(false);
      }
    });
  }
}
```

Facade có nhiệm vụ:

```text
- Gom use case cho UI.
- Phối hợp API, state, mapper, realtime.
- Giảm số dependency component phải biết.
```

Facade không nên trở thành service khổng lồ mới. Nếu facade chứa quá nhiều use case không liên quan, cần tách theo workflow/page.

---

### 9.7. Route-level composition

```ts
export const patientQueueRoutes: Routes = [
  {
    path: '',
    providers: [
      PatientQueueApi,
      PatientQueueState,
      PatientQueueMapper,
      PatientQueueRealtimeHandler,
      PatientQueueFacade
    ],
    loadComponent: () =>
      import('./patient-queue.page')
        .then(m => m.PatientQueuePage)
  }
];
```

Đây là composition boundary của feature:

```text
Feature cần service nào
→ đăng ký tại route.

Feature bị destroy
→ state/handler/facade được giải phóng theo route.
```

---

### 9.8. Component chỉ phụ thuộc facade

```ts
@Component({
  selector: 'app-patient-queue-page',
  standalone: true,
  template: `
    @if (facade.loading()) {
      <p>Đang tải...</p>
    }

    @for (room of facade.rooms(); track room.id) {
      <app-room-queue-card [room]="room" />
    }
  `
})
export class PatientQueuePage
  implements OnInit {
  readonly facade = inject(PatientQueueFacade);

  ngOnInit(): void {
    this.facade.load();
  }
}
```

Component không cần biết:

```text
- Endpoint nào được gọi.
- DTO map ra sao.
- State lưu bằng Signal hay RxJS.
- Event realtime tên gì.
- Retry logic nằm ở đâu.
```

---

### 9.9. Circular dependency

Sai:

```text
AuthService
→ inject PermissionService.

PermissionService
→ inject AuthService.
```

Đừng xử lý ngay bằng:

```text
- inject() muộn
- Injector.get()
- forwardRef
- Lazy wrapper
```

Trước tiên xem đây có phải dấu hiệu responsibilities bị trộn không.

Refactor:

```text
AuthService ──────┐
                  ├→ AuthState
PermissionService ┘
```

Hoặc:

```text
AuthService
→ publish auth event.

PermissionService
→ derive permission từ current user state.
```

Circular dependency thường là vấn đề thiết kế, không chỉ là lỗi container.

---

### 9.10. Service Locator anti-pattern

Không nên:

```ts
@Injectable()
export class OrderService {
  constructor(
    private readonly injector: Injector
  ) {}

  create(): void {
    const logger =
      this.injector.get(LoggerService);

    const api =
      this.injector.get(OrderApi);
  }
}
```

Dependency bị ẩn khỏi constructor.

Hậu quả:

```text
- Không nhìn thấy contract thật của class.
- Test dễ thiếu setup.
- Class có thể resolve dependency tùy ý.
- Coupling chuyển từ service cụ thể sang container.
```

`Injector` phù hợp ở framework/integration boundary đặc biệt, không phải cách inject mặc định.

---

## 10. Case Studies

## 10.1. Case Study 1 — Một WebSocket connection dùng chung

### 10.1.1. Bài toán

Ứng dụng có nhiều feature cần realtime:

```text
- Hàng chờ khám bệnh
- Thông báo
- Đơn hàng
- Kết quả xét nghiệm
```

Yêu cầu:

```text
- Chỉ duy trì một physical WebSocket connection.
- Mỗi feature chỉ xử lý event của mình.
- Rời feature phải cleanup listener và leave room.
- Logout phải đóng connection.
- Reconnect không tạo connection trùng.
```

---

### 10.1.2. Sai lầm thường gặp

#### Mỗi component tự mở connection

```ts
@Component({
  providers: [WebSocketConnectionService]
})
export class PatientQueuePage {}
```

Hậu quả:

```text
- Mỗi component tạo socket riêng.
- Duplicate event.
- Reconnect chồng chéo.
- Server giữ nhiều session không cần thiết.
```

#### Một root service ôm toàn bộ nghiệp vụ

```ts
@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  updateQueue(): void {}
  updateOrder(): void {}
  updateNotification(): void {}
  updateLabResult(): void {}
}
```

Hậu quả:

```text
- Service global phình to.
- Không cleanup logic theo feature.
- Feature coupling với nhau.
- Test khó tách.
```

---

### 10.1.3. Tách connection và feature handler

```text
Root scope:
WebSocketConnectionService
→ quản lý physical connection.

Feature scope:
PatientQueueRealtimeHandler
→ xử lý event hàng chờ.

Feature scope:
OrderRealtimeHandler
→ xử lý event đơn hàng.
```

---

### 10.1.4. Connection service

```ts
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface RealtimeMessage<T = unknown> {
  readonly type: string;
  readonly payload: T;
}

@Injectable({
  providedIn: 'root'
})
export class WebSocketConnectionService {
  private socket: WebSocket | null = null;

  private readonly messagesSubject =
    new Subject<RealtimeMessage>();

  private readonly statusSubject =
    new BehaviorSubject<ConnectionStatus>(
      'disconnected'
    );

  readonly messages$ =
    this.messagesSubject.asObservable();

  readonly status$ =
    this.statusSubject.asObservable();

  private manuallyClosed = false;
  private reconnectAttempt = 0;
  private reconnectSubscription?: Subscription;

  connect(url: string): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.manuallyClosed = false;
    this.statusSubject.next('connecting');

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.statusSubject.next('connected');
    };

    socket.onmessage = event => {
      try {
        const message =
          JSON.parse(event.data) as RealtimeMessage;

        this.messagesSubject.next(message);
      } catch (error) {
        console.error(
          'Invalid realtime message',
          error
        );
      }
    };

    socket.onerror = error => {
      console.error('WebSocket error', error);
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
      }

      this.statusSubject.next('disconnected');

      if (!this.manuallyClosed) {
        this.scheduleReconnect(url);
      }
    };
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.reconnectSubscription?.unsubscribe();
    this.reconnectSubscription = undefined;

    this.socket?.close();
    this.socket = null;

    this.statusSubject.next('disconnected');
  }

  send<T>(
    type: string,
    payload: T
  ): boolean {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    this.socket.send(
      JSON.stringify({ type, payload })
    );

    return true;
  }

  ofType<T>(
    type: string
  ): Observable<RealtimeMessage<T>> {
    return this.messages$.pipe(
      filter(
        (
          message
        ): message is RealtimeMessage<T> =>
          message.type === type
      )
    );
  }

  private scheduleReconnect(
    url: string
  ): void {
    this.statusSubject.next('reconnecting');
    this.reconnectAttempt += 1;

    const delayMs = Math.min(
      1000 * 2 ** (this.reconnectAttempt - 1),
      30000
    );

    this.reconnectSubscription?.unsubscribe();

    this.reconnectSubscription =
      timer(delayMs).subscribe(() => {
        if (!this.manuallyClosed) {
          this.connect(url);
        }
      });
  }
}
```

Điểm thiết kế:

```text
- Root scope để toàn app dùng chung connection.
- connect() idempotent ở client level.
- Reconnect có backoff.
- disconnect() dành cho logout/app shutdown.
- Expose message stream, không biết nghiệp vụ.
```

---

### 10.1.5. Feature realtime handler

```ts
export interface RoomQueueUpdatedPayload {
  readonly roomId: number;
  readonly waitingCount: number;
}

@Injectable()
export class PatientQueueRealtimeHandler {
  private readonly connection =
    inject(WebSocketConnectionService);

  private readonly state =
    inject(PatientQueueState);

  private readonly destroyRef =
    inject(DestroyRef);

  private started = false;

  start(roomIds: number[]): void {
    if (this.started) {
      return;
    }

    this.started = true;

    this.connection.send(
      'PatientQueue.JoinRooms',
      { roomIds }
    );

    this.connection
      .ofType<RoomQueueUpdatedPayload>(
        'PatientQueue.RoomUpdated'
      )
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(message => {
        this.state.updateWaitingCount(
          message.payload.roomId,
          message.payload.waitingCount
        );
      });

    this.destroyRef.onDestroy(() => {
      this.connection.send(
        'PatientQueue.LeaveRooms',
        { roomIds }
      );
    });
  }
}
```

Handler ở route scope:

```text
- Không mở physical connection.
- Chỉ join room và xử lý event feature.
- Tự cleanup khi route bị destroy.
- Có guard tránh start nhiều lần.
```

---

### 10.1.6. Bootstrap connection

```ts
@Injectable({
  providedIn: 'root'
})
export class RealtimeBootstrapService {
  private readonly connection =
    inject(WebSocketConnectionService);

  private readonly auth =
    inject(AuthService);

  private readonly config =
    inject(APP_CONFIG);

  start(): void {
    const token = this.auth.accessToken();

    if (!token) {
      return;
    }

    const url =
      `${this.config.realtimeUrl}` +
      `?access_token=${encodeURIComponent(token)}`;

    this.connection.connect(url);
  }

  stop(): void {
    this.connection.disconnect();
  }
}
```

Lifecycle:

```text
Login thành công
→ start connection.

Mở patient-queue
→ join room và subscribe feature event.

Rời patient-queue
→ leave room, cleanup feature listener.

Feature khác
→ vẫn sử dụng connection root.

Logout
→ disconnect physical connection.
```

---

### 10.1.7. Kết luận case

> Connection dùng chung không có nghĩa toàn bộ realtime logic phải global.

```text
Infrastructure resource
→ root scope.

Business event handling
→ feature scope.

Local UI state
→ component scope khi cần.
```

---

## 10.2. Case Study 2 — Set state nhưng component khác không nhận

### 10.2.1. Hiện tượng

`RoomListComponent`:

```ts
this.selectedRoomState.select(roomId);
```

`RoomDetailComponent`:

```ts
this.selectedRoomState.selectedRoomId$
  .subscribe(...);
```

Nhưng detail không nhận giá trị.

---

### 10.2.2. Nguyên nhân

Root service:

```ts
@Injectable({
  providedIn: 'root'
})
export class SelectedRoomState {}
```

Nhưng list component provide lại:

```ts
@Component({
  providers: [SelectedRoomState]
})
export class RoomListComponent {}
```

Kết quả:

```text
RoomListComponent
→ SelectedRoomState instance B.

RoomDetailComponent
→ SelectedRoomState instance A từ root.
```

Hai bên không giao tiếp vì khác instance.

---

### 10.2.3. Cách debug

Thêm instance id:

```ts
@Injectable({
  providedIn: 'root'
})
export class SelectedRoomState {
  readonly instanceId =
    crypto.randomUUID();

  constructor() {
    console.log(
      'SelectedRoomState',
      this.instanceId
    );
  }
}
```

Nếu thấy nhiều id ngoài dự kiến, kiểm tra:

```text
- Component providers
- Route providers
- Lazy module providers
- SharedModule providers
- TestBed override
```

---

### 10.2.4. Cách sửa

Nếu state cần dùng chung toàn app:

```text
Giữ root provider.
Xóa provider tại component/route.
```

Nếu chỉ dùng chung trong feature:

```text
Xóa providedIn: 'root'.
Provide tại route chung của list và detail.
```

---

## 10.3. Case Study 3 — Filter không reset khi quay lại màn hình

### 10.3.1. Hiện tượng

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueFilterState {
  keyword = signal('');
  roomId = signal<number | null>(null);
}
```

Người dùng rời màn hình rồi quay lại, filter cũ vẫn còn.

---

### 10.3.2. Phân tích

Đây không mặc định là bug.

Câu hỏi nghiệp vụ:

```text
Quay lại màn hình có cần giữ filter không?
```

Nếu có:

```text
Root scope có thể đúng.
```

Nếu không:

```text
Filter state nên scoped theo route.
```

---

### 10.3.3. Sửa bằng route provider

```ts
@Injectable()
export class PatientQueueFilterState {
  readonly keyword = signal('');
  readonly roomId = signal<number | null>(null);
}
```

```ts
{
  path: 'patient-queue',
  providers: [
    PatientQueueFilterState
  ]
}
```

Rời route:

```text
Route injector destroy.
Filter state được giải phóng.
Quay lại route tạo state mới.
```

---

## 10.4. Case Study 4 — Multi provider cho validation pipeline

### 10.4.1. Bài toán

Trước khi gọi bệnh nhân, hệ thống cần chạy nhiều validation:

```text
- Phiếu chưa bị hủy.
- Phòng còn hoạt động.
- Bệnh nhân chưa được gọi ở phòng khác.
- Người dùng có quyền thao tác.
```

Không muốn một service trung tâm phải biết tất cả validator.

---

### 10.4.2. Contract

```ts
export interface CallPatientValidator {
  readonly order: number;

  validate(
    context: CallPatientContext
  ): ValidationResult;
}

export const CALL_PATIENT_VALIDATORS =
  new InjectionToken<CallPatientValidator[]>(
    'CALL_PATIENT_VALIDATORS'
  );
```

---

### 10.4.3. Provider

```ts
providers: [
  {
    provide: CALL_PATIENT_VALIDATORS,
    useClass: TicketActiveValidator,
    multi: true
  },
  {
    provide: CALL_PATIENT_VALIDATORS,
    useClass: RoomActiveValidator,
    multi: true
  },
  {
    provide: CALL_PATIENT_VALIDATORS,
    useClass: PermissionValidator,
    multi: true
  }
]
```

---

### 10.4.4. Pipeline

```ts
@Injectable()
export class CallPatientValidationPipeline {
  private readonly validators =
    inject(CALL_PATIENT_VALIDATORS)
      .slice()
      .sort((a, b) => a.order - b.order);

  validate(
    context: CallPatientContext
  ): ValidationResult {
    for (const validator of this.validators) {
      const result =
        validator.validate(context);

      if (!result.valid) {
        return result;
      }
    }

    return {
      valid: true
    };
  }
}
```

Lợi ích:

```text
- Feature tự đăng ký validator.
- Không sửa pipeline trung tâm.
- Dễ test từng validator.
- Có extension point rõ.
```

---

## 10.5. Case Study 5 — Circular dependency giữa Auth và Permission

### 10.5.1. Thiết kế ban đầu

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(
    private readonly permission:
      PermissionService
  ) {}
}

@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  constructor(
    private readonly auth:
      AuthService
  ) {}
}
```

---

### 10.5.2. Vấn đề thực sự

Hai service đang cùng sở hữu user context.

```text
AuthService cần permission để xử lý login.
PermissionService cần auth để lấy user.
```

Responsibility chưa được tách rõ.

---

### 10.5.3. Tách state chung

```ts
@Injectable({
  providedIn: 'root'
})
export class SessionState {
  private readonly userState =
    signal<User | null>(null);

  readonly user =
    this.userState.asReadonly();

  setUser(user: User | null): void {
    this.userState.set(user);
  }
}
```

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly session =
    inject(SessionState);
}
```

```ts
@Injectable({
  providedIn: 'root'
})
export class PermissionService {
  private readonly session =
    inject(SessionState);

  can(permission: string): boolean {
    return this.session
      .user()
      ?.permissions.includes(permission)
      ?? false;
  }
}
```

Dependency graph:

```text
AuthService ───────┐
                   ├→ SessionState
PermissionService ─┘
```

---

## 11. Testing, troubleshooting và review

### 11.1. Unit test class trực tiếp

Không nhất thiết dùng `TestBed` cho mọi service.

```ts
const api = new FakePatientQueueApi();
const state = new PatientQueueState();
const mapper = new PatientQueueMapper();

const facade = new PatientQueueFacade(
  api,
  state,
  mapper
);
```

Phù hợp khi service dùng constructor injection và không phụ thuộc Angular runtime đặc biệt.

---

### 11.2. Override provider trong TestBed

```ts
TestBed.configureTestingModule({
  providers: [
    PatientQueueFacade,
    PatientQueueState,
    {
      provide: PatientQueueApi,
      useValue: {
        getRooms: () => of(mockRooms)
      }
    }
  ]
});
```

DI giúp test thay external dependency mà không sửa production code.

---

### 11.3. Test scope

Khi logic phụ thuộc vào component provider:

```ts
@Component({
  providers: [RoomFilterState]
})
export class RoomFilterComponent {}
```

Test nên verify hai component instance có state độc lập nếu đó là requirement.

---

### 11.4. `NullInjectorError`

Thông báo:

```text
NullInjectorError: No provider for X
```

Checklist:

```text
1. X có provider không?
2. Provider có nằm trong injector tree của consumer không?
3. Token import có đúng object không?
4. InjectionToken có bị tạo lại không?
5. Provider có nằm ở lazy route khác không?
6. Class có metadata phù hợp không?
7. Có dùng interface làm token trực tiếp không?
```

---

### 11.5. Service bị tạo nhiều instance

Dấu hiệu:

```text
- Constructor log nhiều lần.
- State set ở nơi này nhưng nơi khác không thấy.
- WebSocket mở nhiều connection.
- Cache bị miss ngoài dự kiến.
- Event xử lý nhiều lần.
```

Kiểm tra:

```text
- providers ở component
- providers ở route
- lazy module
- SharedModule
- provider override
- nhiều bootstrap application
```

---

### 11.6. Memory leak

DI không tự gây leak, nhưng scope sai có thể giữ object lâu hơn cần thiết.

Kiểm tra service có:

```text
- Subscription không cleanup
- Timer
- WebSocket
- DOM listener
- Cache object lớn
- BehaviorSubject giữ dữ liệu cũ
- Closure giữ component/reference
```

Nguyên tắc:

```text
Resource thuộc lifecycle nào
→ service sở hữu resource nên có scope tương ứng.

Root resource
→ cleanup ở logout/app destroy.

Feature resource
→ cleanup khi route destroy.

Component resource
→ cleanup khi component destroy.
```

Sử dụng:

```ts
takeUntilDestroyed(inject(DestroyRef))
```

cho subscription gắn với lifecycle của service/component.

---

### 11.7. Component inject quá nhiều service

```ts
constructor(
  private readonly api: PatientQueueApi,
  private readonly state: PatientQueueState,
  private readonly realtime: PatientQueueRealtimeHandler,
  private readonly permission: PermissionService,
  private readonly toast: ToastService,
  private readonly router: Router
) {}
```

Đây là dấu hiệu component đang phối hợp quá nhiều use case.

Refactor:

```ts
constructor(
  readonly facade: PatientQueueFacade
) {}
```

Không phải constructor dài nào cũng cần facade, nhưng UI component không nên trở thành orchestration service.

---

### 11.8. Factory provider quá phức tạp

Dấu hiệu:

```text
- Factory dài hàng chục dòng.
- Có nhiều if/else nghiệp vụ.
- Mở resource.
- Gọi API.
- Tạo subscription.
```

Factory nên tạo dependency, không nên trở thành workflow.

Refactor logic vào:

```text
- Configuration service
- Strategy resolver
- Bootstrap service
- Dedicated factory class
```

---

### 11.9. Checklist khi tạo service

```text
1. Service chịu trách nhiệm gì?
2. Service có giữ state không?
3. State thuộc app, feature hay component?
4. Consumer nào phải dùng chung instance?
5. Khi nào instance nên bị destroy?
6. Service có sở hữu resource không?
7. Resource cleanup ở đâu?
8. Có cần nhiều implementation không?
9. Có cần runtime token không?
10. Có cần InjectionToken cho config không?
11. Có nguy cơ provider bị shadow không?
12. Có dependency vòng tròn không?
13. Test có thể thay dependency dễ không?
14. Component có đang biết quá nhiều service không?
```

---

### 11.10. Checklist review provider scope

```text
Root provider:
- Có thật sự là app-wide không?
- Có mutable state theo user/tenant không?
- Có reset đúng khi logout/đổi tenant không?
- Có thread/event/subscription dài hạn không?

Route provider:
- Các page con có cùng nằm dưới route provider không?
- Rời route có thật sự destroy route injector không?
- Route reuse strategy có giữ lại route không?

Component provider:
- Có cố ý tạo instance riêng không?
- Child component có cần dùng chung instance này không?
- Component được render nhiều lần có gây resource lặp không?
```

---

### 11.11. Checklist review InjectionToken

```text
- Token được export từ một nơi duy nhất?
- Description có rõ để debug?
- Generic type có chính xác?
- Config có readonly không?
- Default factory có side effect không?
- Provider override có chủ đích không?
- Multi provider có thống nhất multi: true không?
- Thứ tự multi provider có được xác định không?
```

---

### 11.12. Checklist review kiến trúc service

```text
- API service có chỉ tập trung HTTP không?
- State service có expose readonly state không?
- State transition có method rõ ràng không?
- Facade có orchestration vừa phải không?
- Realtime handler có tách khỏi connection không?
- Mapper có pure không?
- UI có phụ thuộc implementation hạ tầng không?
- Có service locator không?
- Có circular dependency không?
- Scope có khớp lifecycle dữ liệu không?
```

---

## 12. Tổng kết

### 12.1. Các khái niệm cốt lõi

```text
Dependency
→ thứ class cần để hoạt động.

Token
→ key runtime dùng để lookup dependency.

Provider
→ cấu hình cách cung cấp dependency cho token.

Injector
→ nơi lưu provider, tạo và cache instance.

@Injectable()
→ metadata để Angular có thể tạo class qua DI.

InjectionToken
→ runtime token cho dependency không có class runtime.
```

---

### 12.2. Scope

```text
Root
→ dùng chung theo application.

Route
→ dùng chung theo feature/route.

Component
→ instance riêng theo component subtree.
```

Scope quyết định:

```text
- Số lượng instance
- Lifetime
- State lifetime
- Resource ownership
- Cleanup boundary
```

---

### 12.3. Provider types

```text
useClass
→ chọn implementation class.

useValue
→ cung cấp value có sẵn.

useFactory
→ tạo dependency bằng logic.

useExisting
→ alias tới instance của token khác.

multi: true
→ nhiều provider đóng góp vào một token.
```

---

### 12.4. Tư duy quan trọng nhất

Khi tạo service, không chỉ hỏi:

```text
Inject như thế nào?
```

Cần hỏi:

```text
- Service này thuộc boundary nào?
- Ai phải dùng chung instance?
- Nó nên sống bao lâu?
- State khi nào phải reset?
- Nó có sở hữu resource không?
- Có cần thay implementation không?
- Provider đặt ở đâu để phản ánh đúng lifecycle?
```

Chốt lại:

> Angular DI là công cụ quản lý dependency graph và object lifetime.
> Khi token, provider, injector và scope được thiết kế đúng, component mỏng hơn, state rõ lifecycle hơn, resource được tái sử dụng đúng chỗ, và hệ thống dễ test cũng như mở rộng hơn.
