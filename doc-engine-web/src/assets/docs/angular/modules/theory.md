# Module trong Angular

## 1. Vấn đề trước khi có module: global scope và thứ tự script

Trước ES2015, JavaScript không có cú pháp `import`/`export`. Mọi file được nạp qua thẻ `<script>` và chạy chung một global scope — biến hay hàm khai báo ở file này mặc nhiên nhìn thấy được, và có thể bị ghi đè, bởi bất kỳ file nào khác trên trang.

```html
<script src="format-date.js"></script>
<script src="app.js"></script>
```

```js
// format-date.js
function formatDate(d) { return d.toISOString(); }
```

```js
// app.js
console.log(formatDate(new Date())); // chạy được vì format-date.js load trước
```

Đoạn code trên chạy đúng, nhưng không có gì trong `app.js` nói rằng nó cần `formatDate`. Sự phụ thuộc chỉ tồn tại ở thứ tự hai thẻ `<script>` trong HTML. Đảo thứ tự hai thẻ, hoặc một file khác cũng định nghĩa hàm tên `formatDate`, chương trình lỗi hoặc chạy sai mà không có compiler nào cảnh báo trước. Hai vấn đề cốt lõi: xung đột tên trong một global scope dùng chung, và dependency chỉ được biểu diễn ngầm qua thứ tự nạp file.

Cộng đồng JavaScript tự chế ra nhiều cách giải quyết trước khi ngôn ngữ có cú pháp module chính thức:

- **IIFE + namespace object**: bọc code trong một hàm gọi ngay `(function () { ... })()` để tạo scope riêng, rồi gán phần cần công khai vào một object toàn cục duy nhất (`window.MyApp = {...}`). Giảm xung đột tên nhưng vẫn dựa vào một global namespace và vẫn phải xếp thứ tự script thủ công.
- **CommonJS** (Node.js, 2009): `module.exports = ...` và `const x = require('./x')`. Dependency được khai báo tường minh trong code thay vì suy ra từ thứ tự thẻ `<script>`, nhưng `require` là một lời gọi hàm chạy đồng bộ, phù hợp server đọc file từ đĩa, không phù hợp browser phải tải file qua mạng.
- **AMD** (RequireJS): `define(['./x'], function (x) { ... })`. Bất đồng bộ, chạy được trên browser trước khi có bundler, nhưng cú pháp cồng kềnh và cần một loader riêng.

Không giải pháp nào trở thành chuẩn ngôn ngữ; mỗi cách cần một thư viện loader riêng, và code viết cho CommonJS không tương thích thẳng với AMD.

## 2. ES6 chuẩn hoá module: `import` và `export`

ES2015 (ES6) đưa `import` và `export` thành cú pháp gốc của JavaScript, không cần loader riêng. Hai thay đổi nền tảng so với thời global scope:

- Mỗi file là một module có scope riêng theo mặc định. Biến, hàm, class khai báo trong file không tự lộ ra ngoài trừ khi được `export` tường minh.
- `import`/`export` là cấu trúc tĩnh: trình biên dịch phân tích được toàn bộ dependency graph chỉ bằng cách đọc code, không cần chạy chương trình. Đây là khác biệt so với `require()`, vốn là một lời gọi hàm bình thường và chỉ biết được giá trị trả về lúc runtime.

```ts
// format-date.ts
export function formatDate(date: Date): string {
  return date.toISOString();
}
```

```ts
// app.ts
import { formatDate } from './format-date';

console.log(formatDate(new Date()));
```

Dòng `import` trong `app.ts` khai báo rõ: file này cần đúng symbol `formatDate` từ file `format-date.ts`. Xoá từ khoá `export` khỏi `formatDate`, dòng `import` báo lỗi ngay lúc biên dịch — không phải đợi đến khi chạy chương trình mới phát hiện thiếu, khác hẳn với ví dụ script tag ở mục 1.

### Vì sao phải khai `import`/`export` tường minh

- `export` là ranh giới: file quyết định phần nào là public API cho module khác dùng, phần nào là chi tiết nội bộ. Không export nghĩa là symbol đó chỉ tồn tại trong scope của chính file, dù đứng ngay cạnh cũng không truy cập được.
- `import` là khai báo phụ thuộc: trình biên dịch không suy luận bạn cần gì, nó chỉ biết một symbol có mặt trong file hiện tại khi có dòng `import` tương ứng. Thiếu `import`, symbol không tồn tại trong scope hiện tại dù file kia có export đúng.
- Vì cấu trúc này tĩnh, bundler (Webpack, esbuild, Rollup, Angular CLI) dựng được dependency graph chính xác để loại bỏ code không ai import tới (tree-shaking), sắp xếp thứ tự đóng gói theo đúng phụ thuộc, và báo lỗi biên dịch nếu tên tham chiếu sai thay vì để lỗi rơi xuống runtime.

Nói cách khác, "phải import mới dùng được" không phải một quy tắc cần học thuộc, mà là hệ quả trực tiếp của việc mỗi file có scope riêng: giá trị export từ module khác không tự nhiên xuất hiện trong file hiện tại nếu không được khai báo.

## 3. Vì sao Angular cần thêm NgModule, dù ES6 đã có `import`/`export`

ES6 module giải quyết việc chia sẻ giá trị JavaScript — class, function, const — giữa các file ở cấp ngôn ngữ. Template của Angular lại tham chiếu component, directive, pipe qua **selector dạng chuỗi** trong HTML, ví dụ `<app-order-row>`, `*ngIf`, `date`. Những chuỗi này không phải một biểu thức TypeScript, nên trình biên dịch TypeScript không thể tự suy ra "`app-order-row` trong template này ứng với class nào" — thông tin đó nằm ngoài phạm vi mà `import`/`export` diễn tả được.

`@NgModule` là registry riêng để trình biên dịch của Angular (khác với trình biên dịch TypeScript) biết: những component/directive/pipe nào (`declarations`) được phép xuất hiện trong template của nhau, và tập nào được công khai cho module khác dùng (`exports`). Đây là lớp metadata bổ sung, nằm trên cả ES module lẫn class TypeScript, phục vụ riêng bài toán biên dịch template.

```ts
@NgModule({
  declarations: [OrderListComponent, OrderRowComponent],
})
export class OrdersModule {}
```

`OrderListComponent` vẫn có thể `import { OrderRowComponent } from './order-row.component'` ở cấp TypeScript như bình thường. Nhưng nếu `OrderRowComponent` không nằm trong `declarations` của cùng NgModule — hoặc không được export từ một NgModule mà `OrdersModule` import — Angular compiler báo lỗi "is not a known element" khi biên dịch template, dù `import` TypeScript vẫn hợp lệ. Hai cơ chế độc lập với nhau: `import` TypeScript cho biết class có tồn tại; khai báo trong NgModule cho biết selector có được phép dùng trong template hay không.

Standalone component (mục 9) xoá bỏ registry trung gian này bằng cách để mỗi component tự liệt kê selector nó cần ngay trong `imports` của chính `@Component`, gộp lại hai lớp import từng tách biệt ở trên.

---

## 4. Các lớp nghĩa của "module" trong hệ sinh thái Angular

| Khái niệm | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| JavaScript/TypeScript module | Một file có `import` hoặc `export`, theo cơ chế ES6 ở mục 2. | `order-api.service.ts` export `OrderApiService` |
| Angular NgModule | Class có `@NgModule`, registry cho compiler biết ở mục 3. | `OrdersModule` |
| Standalone dependency graph | Component/directive/pipe tự khai báo dependency trong `imports`. | `OrderListComponent` với `standalone: true` |
| Feature module | Boundary theo capability nghiệp vụ, không bắt buộc phải là `@NgModule`. | vùng `orders/`, `patients/` |
| ES bundle/chunk | Đơn vị code do bundler tạo và tải về runtime. | lazy chunk của route `/orders` |

Một feature có thể đồng thời là một thư mục, một lazy route, một NgModule và một bundle chunk — nhưng các khái niệm này **không đồng nghĩa**. Khi thiết kế hoặc review, cần nói rõ đang bàn về layer nào.

```text
Feature: Orders
  source boundary     -> src/app/features/orders/
  routing boundary    -> /orders
  loading boundary    -> lazy chunk
  Angular composition -> NgModule hoặc standalone imports
```

---

## 5. Mục đích thật của việc module hóa

Module hóa không phải để tạo thêm thư mục. Nó tạo boundary giúp:

- Cô lập nghiệp vụ và giảm phụ thuộc giữa các feature.
- Giới hạn phạm vi thay đổi, test và review.
- Tổ chức quyền sở hữu route, UI, state và data access.
- Lazy load theo hành vi người dùng.
- Cho phép nhiều nhóm phát triển song song mà ít va chạm.

Một cách kiểm tra đơn giản: nếu xoá hoặc thay thế feature `Orders`, các phần khác của app có cần biết chi tiết bên trong nó không? Càng ít cần biết, boundary càng tốt.

---

## 6. Cấu trúc feature khuyến nghị

Đây là ví dụ module theo **nghiệp vụ**, áp dụng được cho cả NgModule lẫn standalone:

```text
features/
  orders/
    pages/              # component gắn với route
    components/         # UI chỉ dùng trong Orders
    data-access/        # API, repository, facade
    models/             # type, DTO, mapper
    state/              # state dành cho feature nếu cần
    orders.routes.ts    # route ownership
    orders.module.ts    # chỉ có khi dùng NgModules
```

Quy tắc dependency nên đi một chiều:

```text
pages -> components + state/data-access -> shared/core
```

`shared` và `core` không được import ngược lại feature. Vi phạm chiều này thường dẫn đến circular dependency và "shared" bị biến thành thùng chứa mọi thứ.

---

## 7. Các loại module/boundary thường dùng

### 7.1. Core (application-wide)

Nơi đặt infrastructure toàn app: app shell, authentication, HTTP interceptor, logging, error handler, configuration. Đây không phải nơi đặt logic nghiệp vụ `Orders` hay `Patients`.

Service global hiện đại thường dùng:

```ts
@Injectable({ providedIn: 'root' })
export class SessionService {}
```

### 7.2. Shared (reusable, không sở hữu nghiệp vụ)

Nơi đặt UI thuần và utility thật sự dùng lại: `ButtonComponent`, `EmptyStateComponent`, `DateFormatPipe`, directive accessibility. Thành phần shared phải có API rõ ràng và không biết route/business của feature gọi nó.

Không đưa feature-specific component vào shared chỉ vì nó được dùng hai lần. Khi đó nên cân nhắc một bounded feature chung hoặc một package/library riêng.

### 7.3. Feature

Một feature sở hữu use case đầu-cuối, ví dụ quản lý đơn hàng. Nó nên đóng gói page, route con, state và API adapter liên quan. Đây là boundary quan trọng nhất với ứng dụng business lớn.

### 7.4. Cross-cutting

Những concern cắt ngang như authorization, observability, localization, notification. Chúng thường có API dùng từ feature nhưng không phụ thuộc feature cụ thể.

---

## 8. NgModules: cơ chế hoạt động và cách tổ chức

NgModules là cơ chế composition truyền thống của Angular. Dù Angular hiện khuyến nghị standalone cho dự án mới, NgModules vẫn xuất hiện ở nhiều codebase production, thư viện nội bộ và ứng dụng được xây dựng trước Angular 15 — cần hiểu đúng để đọc, sửa và migrate an toàn.

### 8.1. Metadata và luồng tư duy

Một `@NgModule` là metadata cho Angular biết một vùng của ứng dụng gồm những gì và phụ thuộc vào đâu — registry đã giới thiệu ở mục 3.

```ts
@NgModule({
  declarations: [],
  imports: [],
  exports: [],
  providers: [],
  bootstrap: [],
})
export class AppModule {}
```

| Metadata | Vai trò |
| --- | --- |
| `declarations` | Khai báo component, directive, pipe thuộc module. Chỉ được khai ở đúng một module. |
| `imports` | Nhận các export từ module khác. |
| `exports` | Công khai declaration hoặc module đã import cho module dùng mình. |
| `providers` | Đăng ký dependency injection scope. |
| `bootstrap` | Component khởi động ứng dụng; thường chỉ có ở `AppModule`. |

```text
AppModule
  ├─ CoreModule       -> singleton, hạ tầng toàn app
  ├─ SharedModule     -> UI dùng lại, pipe/directive dùng lại
  └─ FeatureModule    -> nghiệp vụ theo feature
       └─ FeatureRoutingModule
```

> `declarations` là quyền sở hữu template, còn `imports`/`exports` là quyền sử dụng. Không nhầm hai khái niệm này.

### 8.2. Tạo và dùng một module

Ví dụ feature quản lý bệnh nhân:

```ts
// patients.module.ts
@NgModule({
  declarations: [PatientListComponent, PatientDetailComponent],
  imports: [CommonModule, PatientsRoutingModule, SharedModule],
})
export class PatientsModule {}
```

`PatientListComponent` chỉ được khai báo **một lần duy nhất** trong toàn bộ ứng dụng. Nếu cần dùng component đó bên ngoài `PatientsModule`, export nó:

```ts
@NgModule({
  declarations: [PatientBadgeComponent],
  imports: [CommonModule],
  exports: [PatientBadgeComponent],
})
export class PatientsModule {}
```

Module import `PatientsModule` giờ có thể dùng `<app-patient-badge>` trong template của các declaration thuộc nó.

`BrowserModule` chỉ import ở `AppModule`: nó bao gồm infrastructure chạy trong browser và đã export `CommonModule`. Feature module phải import `CommonModule` để dùng `*ngIf`, `*ngFor`, `AsyncPipe`... — không import `BrowserModule` vào feature module.

```ts
@NgModule({
  imports: [CommonModule], // đúng
})
export class OrdersModule {}
```

### 8.3. Chia module hợp lý

**AppModule** nên mỏng: bootstrap, router root và hạ tầng ở cấp ứng dụng. Không biến nó thành nơi khai báo toàn bộ màn hình.

**Feature module** bao một capability nghiệp vụ như `OrdersModule`, `PatientsModule`, `BillingModule`. Nó sở hữu page, component nội bộ, state và route của feature.

```text
orders/
  orders.module.ts
  orders-routing.module.ts
  pages/
  components/
  data-access/
```

**SharedModule** chứa UI thuần dùng lại: button, empty state, pipe, directive và các Angular module được dùng lặp lại.

```ts
@NgModule({
  declarations: [EmptyStateComponent, VndCurrencyPipe],
  imports: [CommonModule, ReactiveFormsModule],
  exports: [CommonModule, ReactiveFormsModule, EmptyStateComponent, VndCurrencyPipe],
})
export class SharedModule {}
```

Không đưa service có state vào `SharedModule.providers` — lý do cụ thể được minh họa ở mục 8.5.

**CoreModule** dành cho dịch vụ singleton và component shell: interceptor, auth facade, logger, layout, global error handler.

```ts
@NgModule({
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
  ],
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parent: CoreModule | null) {
    if (parent) throw new Error('CoreModule chỉ được import bởi AppModule.');
  }
}
```

Với Angular hiện đại, ưu tiên `@Injectable({ providedIn: 'root' })` cho singleton. `CoreModule` vẫn hữu ích khi dự án legacy cần gom cấu hình module-based.

### 8.4. Routing và lazy loading với NgModules

Tách route của feature để giữ boundary rõ ràng:

```ts
// orders-routing.module.ts
const routes: Routes = [
  { path: '', component: OrderListPageComponent },
  { path: ':id', component: OrderDetailPageComponent },
];

@NgModule({ imports: [RouterModule.forChild(routes)], exports: [RouterModule] })
export class OrdersRoutingModule {}
```

Ở root router, lazy-load module:

```ts
const routes: Routes = [
  {
    path: 'orders',
    loadChildren: () => import('./features/orders/orders.module').then(m => m.OrdersModule),
  },
];
```

`RouterModule.forRoot()` chỉ gọi một lần tại root vì nó đăng ký router service, location strategy và initial navigation. Mọi feature routing module dùng `RouterModule.forChild()`.

### 8.5. Provider scope và injector hierarchy

Provider không chỉ là "nơi đăng ký service"; nó quyết định **vòng đời instance**.

| Cách đăng ký | Số instance / scope |
| --- | --- |
| `providedIn: 'root'` | Một instance cho root injector. |
| `providers` trong eager module | Thường được nâng vào root injector; không tạo feature-local scope như nhiều người nghĩ. |
| `providers` trong lazy module | Một instance cho injector của lazy feature. |
| `providers` trong component | Một instance cho mỗi cây component đó. |

Ví dụ một facade có state đặt trong lazy `OrdersModule` sẽ bị hủy khi lazy route không còn được giữ sống; đó có thể là mong muốn hoặc một bug tuỳ business flow. Cần xác định rõ state sống theo **application**, **feature route**, hay **component instance** trước khi chọn provider scope.

**Minh họa injector hierarchy:**

```text
Root injector (bootstrap, providedIn: 'root')
  ├─ Lazy injector: OrdersModule     (providers khai trong OrdersModule)
  │    └─ Component injector: OrderDetailPageComponent (providers khai trong @Component)
  └─ Lazy injector: PatientsModule   (providers khai trong PatientsModule)
```

Mỗi lazy module có injector con riêng, là con của root injector nhưng độc lập với injector của lazy module khác. Provider khai trong `OrdersModule` chỉ resolve được bên trong nhánh `OrdersModule`; `PatientsModule` không nhìn thấy nó dù cả hai đều là "con" của root.

**Cạm bẫy kinh điển: provider đặt trong SharedModule.**

```ts
@NgModule({
  providers: [DraftFormStateService], // sai: state service đặt trong module dùng để export UI
  declarations: [EmptyStateComponent],
  exports: [EmptyStateComponent],
})
export class SharedModule {}
```

Nếu cả `OrdersModule` và `PatientsModule` đều lazy và đều import `SharedModule`, Angular tạo **một instance `DraftFormStateService` riêng cho mỗi nơi import** — vì mỗi lazy module có injector riêng, và provider bị kéo vào injector đó theo từng lần import. Hai instance dùng chung tên class nhưng không chia sẻ state với nhau: lỗi rất khó phát hiện vì code compile và chạy bình thường, chỉ sai ở hành vi runtime (ví dụ người dùng tưởng draft đã lưu, nhưng qua feature khác lại thấy mất).

Cách sửa: chuyển `DraftFormStateService` sang `providedIn: 'root'` nếu cần singleton toàn app, hoặc cấp provider tường minh ở đúng module cần scope đó. Không đặt service có state trong `providers` của một module chỉ có nhiệm vụ export UI dùng lại.

**Multi-provider token.** Một số token cho phép nhiều provider cùng đóng góp giá trị, dùng cờ `multi: true`:

```ts
@NgModule({
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: LoggingInterceptor, multi: true },
  ],
})
export class CoreModule {}
```

Angular gom tất cả provider cùng token thành một mảng thay vì ghi đè lẫn nhau. Interceptor, `NG_VALIDATORS`, `APP_INITIALIZER` đều dùng cơ chế multi-provider này. Nếu quên `multi: true`, provider khai sau sẽ **ghi đè** provider khai trước thay vì cộng dồn — lỗi phổ biến khi thêm interceptor thứ hai mà không kiểm tra kỹ token cũ.

Nguyên tắc review provider scope:

1. Service có state global: `providedIn: 'root'` hoặc cấu hình root rõ ràng.
2. State chỉ phục vụ một feature lazy: provider ở lazy feature hoặc route provider.
3. State tạm của một widget: provider tại component.
4. Không đăng ký cùng token ở nhiều scope nếu không chủ đích override.

### 8.6. `forRoot()` / `forChild()` cho thư viện module-based

Pattern này tách declaration dùng chung với provider singleton:

```ts
@NgModule({ declarations: [AuditPanelComponent], exports: [AuditPanelComponent] })
export class AuditModule {
  static forRoot(config: AuditConfig): ModuleWithProviders<AuditModule> {
    return {
      ngModule: AuditModule,
      providers: [
        { provide: AUDIT_CONFIG, useValue: config },
        AuditService,
      ],
    };
  }
}
```

```ts
// AppModule: đăng ký singleton một lần
imports: [AuditModule.forRoot({ endpoint: '/api/audit' })]

// Feature modules: chỉ dùng declaration/export
imports: [AuditModule]
```

`forRoot()` phù hợp khi library cần cấu hình và singleton. Trong code mới, có thể thay bằng provider function như `provideAudit(config)` để hợp với standalone API; đừng dùng cả hai cùng lúc cho một token.

### 8.7. Circular imports giữa các NgModule

Khi hai feature module cần dùng component/service của nhau (ví dụ `OrdersModule` hiển thị `PatientBadgeComponent` từ `PatientsModule`, và `PatientsModule` hiển thị `RecentOrdersComponent` từ `OrdersModule`), TypeScript báo lỗi tham chiếu vòng vì hai file import lẫn nhau trước khi class được định nghĩa xong.

```ts
@NgModule({
  imports: [forwardRef(() => PatientsModule)],
})
export class OrdersModule {}
```

`forwardRef()` trì hoãn việc resolve tham chiếu đến khi Angular thực sự cần dùng, giúp qua được lỗi khai báo vòng ở compile-time. Đây là cách chữa triệu chứng, không phải giải pháp kiến trúc — dependency hai chiều giữa hai feature module là dấu hiệu boundary vẽ sai (xem mục 12 và 13). Hướng xử lý bền hơn là tách phần dùng chung (ví dụ `PatientBadgeComponent`) ra `shared/` hoặc một feature thứ ba trung lập, để cả hai module cùng phụ thuộc một chiều vào nó thay vì phụ thuộc lẫn nhau.

### 8.8. Testing component thuộc NgModule

`TestBed` build một NgModule ảo cho mỗi test, nên cấu hình test phải phản ánh đúng những gì component thật sự cần.

```ts
TestBed.configureTestingModule({
  declarations: [OrderListPageComponent, OrderRowComponent],
  imports: [CommonModule, SharedModule],
  providers: [{ provide: OrderApiService, useValue: fakeOrderApiService }],
});
```

Vài điểm khác biệt so với test standalone component:

- Component thuộc NgModule phải được khai trong `declarations` của testing module — quên khai sẽ báo lỗi "component is not part of any NgModule", dễ nhầm với lỗi thiếu import.
- Muốn thay thế một child component phức tạp bằng stub để cô lập unit test, dùng `schemas: [NO_ERRORS_SCHEMA]` hoặc `overrideComponent`, thay vì import toàn bộ cây dependency thật.
- Service có `providedIn: 'root'` vẫn nhận instance thật trong test trừ khi bị override qua `providers` của `TestBed.configureTestingModule` — chỗ này nhiều người assume sai là "khai providers thì tự động override mọi thứ".

Component standalone gọn hơn ở bước này: `TestBed.configureTestingModule({ imports: [OrderListPageComponent] })` là đủ, vì component tự mang theo dependency của nó, không cần khai `declarations` riêng.

---

## 9. Standalone: composition đi thẳng vào component

Standalone bỏ registry trung gian của NgModule đã mô tả ở mục 3 và mục 8. Component tự liệt kê chính xác thứ nó cần trong `imports` của chính nó.

```ts
@Component({
  standalone: true,
  imports: [CommonModule, RouterLink, OrderRowComponent],
  templateUrl: './order-list.page.html',
})
export class OrderListPageComponent {}
```

```text
OrderListPageComponent ── imports -> CommonModule, RouterLink, OrderRowComponent
```

Đọc một file là biết đủ dependency của nó, không cần lần theo module trung gian. Đây là lý do Angular khuyến nghị standalone cho code mới: dependency graph phẳng hơn và dễ truy vết hơn.

Bootstrap và cấu hình hạ tầng cũng đổi theo, thay vì `bootstrapModule`/`*Module.forRoot()`:

```ts
bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient()],
});
```

---

## 10. NgModule và Standalone: so sánh và quyết định thực tế

| | NgModule | Standalone |
| --- | --- | --- |
| Nơi khai dependency | Ở module, dùng chung cho nhiều component | Ngay tại component/directive/pipe |
| Truy vết dependency | Phải mở module mới biết | Đọc trực tiếp component |
| Thêm một component nhỏ | Phải sửa `declarations` của module | Không cần đụng file khác |
| Bootstrap ứng dụng | `bootstrapModule(AppModule)` với `bootstrap: [AppComponent]` | `bootstrapApplication(AppComponent, { providers: [...] })` |
| Cấu hình router/HTTP | `RouterModule.forRoot()`, `HttpClientModule` | `provideRouter()`, `provideHttpClient()` |
| Provider scope | Theo injector của module (root hoặc lazy) | Theo injector của route/component, khai khi bootstrap hoặc trong route |

Hai mô hình **tương thích hai chiều**: một NgModule có thể `imports` một standalone component, và một standalone component có thể `imports` một NgModule đã có `exports`. Nhờ vậy migration làm được từng feature một, không cần rewrite toàn bộ app cùng lúc.

```ts
@Component({
  standalone: true,
  imports: [CommonModule, SharedModule],
  templateUrl: './order-list.component.html',
})
export class OrderListComponent {}

@NgModule({ imports: [OrderListComponent] })
export class OrdersModule {}
```

Quyết định thực tế theo tình huống:

| Tình huống | Lựa chọn khuyến nghị |
| --- | --- |
| Dự án mới | Standalone components + `provideRouter`, `provideHttpClient`. |
| Feature mới trong app NgModule | Có thể standalone, import vào NgModule hoặc lazy-load bằng `loadComponent`. |
| App legacy ổn định | Giữ NgModules, cải thiện boundary/lazy loading trước. |
| Migration lớn | Làm dần theo feature, có test và đo bundle; không rewrite toàn bộ. |

---

## 11. Route và loading boundary

Feature boundary thường nên đi cùng route boundary. Với standalone, `loadChildren` trả về mảng routes thay vì một `NgModule`:

```ts
export const routes: Routes = [
  {
    path: 'orders',
    loadChildren: () => import('./features/orders/orders.routes').then(m => m.ORDERS_ROUTES),
  },
];
```

```ts
export const ORDERS_ROUTES: Routes = [
  { path: '', component: OrderListPageComponent },
  { path: ':id', component: OrderDetailPageComponent },
];
```

Lazy loading là ranh giới tải code, không phải một giải pháp kiến trúc tự động. Hãy lazy-load feature đủ lớn hoặc ít được truy cập; đo bundle và Core Web Vitals thay vì tạo lazy chunk cho mọi component nhỏ.

Nếu dùng NgModules, `loadChildren` có thể trả về `OrdersModule` (xem mục 8.4). Nếu dùng standalone, nó trả về mảng routes như ví dụ trên.

---

## 12. Thiết kế boundary bằng ownership

Trước khi tạo module mới, trả lời năm câu hỏi:

1. Feature này sở hữu use case và route nào?
2. State sống theo application, feature route hay component?
3. API/data model nào là chi tiết nội bộ, API nào được phép dùng lại?
4. Dependency có chiều nào? Có import ngược từ shared/core vào feature không?
5. Boundary này có đáng trở thành lazy chunk hoặc library độc lập không?

Ví dụ `OrderFacade` chỉ phục vụ flow đơn hàng thì đặt trong `orders/data-access`, không đưa vào `core`. `NotificationService` không biết order là gì thì đặt ở cross-cutting/core. Khác biệt nằm ở ownership, không nằm ở tên file.

Tách library khi phần code có contract ổn định, tái sử dụng bởi nhiều app/feature độc lập, hoặc cần version/build boundary riêng. Không tách chỉ để tránh import tương đối dài; library quá sớm làm tăng chi phí versioning và dependency management.

---

## 13. Anti-pattern và lỗi thường gặp

| Anti-pattern | Hậu quả | Hướng xử lý |
| --- | --- | --- |
| `AppModule`/root imports mọi feature | Bundle đầu lớn, composition rối | Lazy load theo feature, giữ root mỏng |
| `SharedModule` chứa mọi thứ (kể cả provider stateful) | Coupling ngầm, circular dependency, service bị nhân bản instance (xem mục 8.5) | Chỉ giữ primitive/UI thật sự generic; provider stateful chuyển sang `providedIn: 'root'` |
| Core gọi trực tiếp feature service | Phá dependency direction | Đảo dependency qua token, event hoặc API abstract |
| Module tách theo technical layer toàn cục | Một use case phải chạm quá nhiều nơi | Ưu tiên feature-first, technical folders nằm trong feature |
| Export cả folder qua barrel không kiểm soát | Public API vô tình phình to | Export có chủ đích, cấm import internal |

| Triệu chứng lỗi NgModule | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `NG6001` / declaration conflict | Component được declare ở hai module. | Giữ declaration tại một module; export nếu cần tái sử dụng. |
| Không nhận `ngIf`, `ngFor`, `formGroup` | Thiếu `CommonModule` hoặc Forms module ở đúng module. | Import `CommonModule`, `FormsModule`/`ReactiveFormsModule` tại nơi có template. |
| Service tạo nhiều instance ngoài dự kiến | Provider bị đăng ký ở component/lazy module/SharedModule ngoài dự kiến. | Inspect injector scope, gom provider về scope cần thiết (xem mục 8.5). |
| Router hoạt động lạ | Dùng `forRoot()` nhiều lần. | Chỉ root dùng `forRoot`; feature dùng `forChild`. |
| Lỗi tham chiếu vòng khi build | Hai feature module import lẫn nhau, hoặc shared/core import ngược feature. | Đảo chiều dependency, hoặc tách phần dùng chung ra module trung lập (xem mục 8.7). |

---

## 14. Checklist review

- Mỗi feature có owner, route và public API rõ ràng.
- Mỗi component/directive/pipe có đúng một nơi declaration (trừ standalone).
- Dependency luôn chảy từ feature xuống shared/core, không chảy ngược.
- `SharedModule` không chứa service stateful trong `providers`.
- `BrowserModule` chỉ xuất hiện ở root module; `RouterModule.forRoot` đúng một lần.
- State/provider nằm ở scope đúng với vòng đời business.
- Chỉ lazy-load khi có lý do performance hoặc phân tách triển khai rõ ràng.
- Không tạo module chỉ để chứa một file; dùng module để tạo boundary có ý nghĩa.
- Với code mới, ưu tiên standalone; với code cũ, cải thiện boundary trước khi migration, có test regression và theo dõi bundle.

---

## 15. Bài tập tự kiểm tra

1. Tạo `InventoryModule` với list page và detail page; tách `InventoryRoutingModule` bằng `forChild`.
2. Tạo `SharedModule` export một `StatusBadgeComponent` và `ReactiveFormsModule`; sử dụng nó từ hai feature module.
3. Đặt `DraftOrderService` ở component provider, sau đó chuyển nó sang root và quan sát khác biệt về dữ liệu khi đổi route.
4. Tạo tình huống hai feature module import lẫn nhau, quan sát lỗi circular, rồi tách phần dùng chung ra module trung lập để hết cần `forwardRef`.
5. Chuyển một page trong feature module sang standalone, lazy-load bằng `loadComponent`, nhưng vẫn tái sử dụng `SharedModule`.

Nếu giải thích được vì sao instance của mỗi service sống ở scope đó, bạn đã nắm phần quan trọng nhất của module hóa Angular ở mức production.

---

## 16. Lộ trình học tiếp

1. Nắm bài này để hiểu cả nguồn gốc cơ chế module của JavaScript, lý do Angular thêm NgModule, lẫn tầng khái niệm boundary/ownership ở trên nó.
2. Học Router để thiết kế lazy route và preload strategy.
3. Học Dependency Injection để kiểm soát scope của service/state ở mức sâu hơn injector hierarchy.

Điểm mấu chốt: module tốt không phải module có nhiều file, mà là boundary giúp đội ngũ thay đổi một capability với ít tác động ngoài ý muốn nhất.
