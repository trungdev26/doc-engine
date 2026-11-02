# Angular Decorator

> Decorator là cách Angular gắn metadata (siêu dữ liệu mô tả) lên class, property, method hoặc tham số constructor, để framework biết cách xử lý đoạn code đó mà không cần bạn viết thêm cấu hình ở nơi khác.

```text
Decorator không thay đổi logic bên trong class
              ↓
Nó chỉ đính kèm metadata: "class/property/method này có vai trò gì với Angular"
              ↓
Angular đọc metadata đó lúc compile để tạo code thật (component factory, DI, binding...)
```

---

## 1. Decorator là gì

Decorator là một tính năng của TypeScript (bắt nguồn từ một đề xuất của JavaScript), cho phép gắn một hàm đặc biệt ngay trước khai báo của class, property, method hoặc tham số, dùng cú pháp `@tenDecorator`.

```ts
@Component({
  selector: 'app-patient-card',
  templateUrl: './patient-card.component.html'
})
export class PatientCardComponent {}
```

Về bản chất, `@Component({...})` chỉ là một **function được gọi với class `PatientCardComponent` làm tham số**, ngay sau khi class được định nghĩa. TypeScript biên dịch đoạn trên gần tương đương với:

```ts
class PatientCardComponent {}
PatientCardComponent = Component({
  selector: 'app-patient-card',
  templateUrl: './patient-card.component.html'
})(PatientCardComponent);
```

`Component(...)` không sửa logic của `PatientCardComponent`. Nó gắn thêm một mẩu thông tin mô tả ("class này là một component, selector là gì, template ở đâu") vào class đó, để Angular đọc lại thông tin này khi cần dựng component. Đây là lý do decorator được gọi là cách khai báo **metadata** — dữ liệu mô tả một class, chứ không phải hành vi của class.

### 1.1. Vì sao Angular chọn decorator thay vì cấu hình rời

Không có decorator, Angular có thể yêu cầu khai báo metadata ở một nơi khác, ví dụ một file cấu hình JSON liệt kê "class nào là component, selector gì". Cách đó tách rời class khỏi thông tin mô tả nó, dễ lệch nhau khi refactor (đổi tên file class nhưng quên sửa file cấu hình).

Decorator gắn metadata **ngay tại nơi khai báo**, nên khi đọc một class, lập trình viên thấy toàn bộ thông tin quan trọng (nó là gì, phụ thuộc gì, ứng xử ra sao) ở đúng một chỗ.

### 1.2. Bốn vị trí decorator có thể gắn vào

| Loại decorator | Gắn ở đâu | Ví dụ trong Angular |
| --- | --- | --- |
| Class decorator | Ngay trên khai báo `class` | `@Component`, `@Directive`, `@NgModule`, `@Injectable`, `@Pipe` |
| Property decorator | Ngay trên một field của class | `@Input()`, `@Output()`, `@ViewChild()`, `@HostBinding()` |
| Method decorator | Ngay trên một method | `@HostListener()` |
| Parameter decorator | Ngay trên một tham số constructor | `@Inject()`, `@Optional()`, `@Self()`, `@SkipSelf()`, `@Host()` |

Phần còn lại của tài liệu đi qua từng loại, sau đó đến cơ chế Angular đọc metadata này, cách tự viết decorator riêng, và những lỗi thường gặp.

---

## 2. Class decorator

Class decorator mô tả **class này đóng vai trò gì trong ứng dụng Angular**. Đây là nhóm decorator quen thuộc nhất.

### 2.1. `@Component` và `@Directive`

```ts
@Directive({
  selector: '[appHighlight]'
})
export class HighlightDirective {}

@Component({
  selector: 'app-patient-card',
  templateUrl: './patient-card.component.html',
  styleUrls: ['./patient-card.component.scss']
})
export class PatientCardComponent {}
```

`@Component` thực chất mở rộng từ `@Directive`: mọi option của `@Directive` (selector, host, providers...) đều dùng được trong `@Component`, cộng thêm các option liên quan tới template (`templateUrl`, `styleUrls`, `changeDetection`...). Đây là lý do phần lý thuyết directive hay nói "component là một directive có template riêng".

### 2.2. `@NgModule`

```ts
@NgModule({
  declarations: [PatientCardComponent, HighlightDirective],
  imports: [CommonModule],
  exports: [PatientCardComponent]
})
export class PatientsModule {}
```

`@NgModule` mô tả một nhóm component/directive/pipe được biên dịch cùng nhau, và nó phụ thuộc/mở ra những gì cho module khác. Chi tiết cơ chế `declarations`/`imports`/`exports`/`providers` được trình bày đầy đủ ở tài liệu Module.

### 2.3. `@Injectable`

```ts
@Injectable({ providedIn: 'root' })
export class PatientApiService {
  constructor(private readonly http: HttpClient) {}
}
```

`@Injectable` đánh dấu một class là **có thể được Angular tạo instance và tiêm (inject) vào chỗ khác thông qua constructor**. `providedIn: 'root'` là chỗ khai báo scope: một instance duy nhất cho toàn ứng dụng, do injector gốc quản lý.

Một chi tiết dễ bị bỏ qua: mọi service có constructor nhận dependency (ví dụ `HttpClient`) đều cần `@Injectable()`, kể cả khi không dùng `providedIn` (service khai `providers` thủ công trong module/component). Thiếu decorator này, Angular không biết cách đọc danh sách tham số constructor để tiêm dependency — lỗi thường gặp là "no provider" dù bạn nghĩ mình đã khai đúng.

### 2.4. `@Pipe`

```ts
@Pipe({ name: 'vndCurrency' })
export class VndCurrencyPipe implements PipeTransform {
  transform(value: number): string {
    return `${value.toLocaleString('vi-VN')} đ`;
  }
}
```

`name` là tên dùng trong template (`{{ amount | vndCurrency }}`). Mặc định pipe là **pure**: Angular chỉ chạy lại `transform` khi tham chiếu input đổi (object mới, không phải object cũ bị mutate). Cần `pure: false` khi pipe phải phản ứng với thay đổi bên trong object/array mà tham chiếu không đổi — nhưng khi đó pipe chạy lại ở mọi vòng change detection, cần cân nhắc chi phí.

---

## 3. Property decorator

Property decorator mô tả **một field của class có vai trò đặc biệt gì với Angular**, thường liên quan tới binding giữa class và template/host element.

### 3.1. `@Input` và `@Output`

```ts
@Component({ selector: 'app-patient-card', templateUrl: './patient-card.component.html' })
export class PatientCardComponent {
  @Input() patient!: Patient;
  @Input('highlight') isHighlighted = false;

  @Output() selected = new EventEmitter<Patient>();
}
```

`@Input()` đánh dấu property này nhận giá trị từ property binding trong template cha (`[patient]="currentPatient"`). `@Output()` đánh dấu property này là một `EventEmitter` mà template cha có thể lắng nghe (`(selected)="onSelected($event)"`).

Giống input của directive (xem tài liệu Directive), `@Input('highlight')` cho phép tên bên ngoài (`highlight`) khác tên property bên trong (`isHighlighted`).

### 3.2. `@ViewChild` / `@ViewChildren`

```ts
@Component({ selector: 'app-patient-form', templateUrl: './patient-form.component.html' })
export class PatientFormComponent implements AfterViewInit {
  @ViewChild('nameInput') nameInputRef!: ElementRef<HTMLInputElement>;
  @ViewChildren(PatientRowComponent) rows!: QueryList<PatientRowComponent>;

  ngAfterViewInit(): void {
    this.nameInputRef.nativeElement.focus();
  }
}
```

`@ViewChild` lấy tham chiếu tới một phần tử/component nằm trong **template của chính component đó**. Giá trị chỉ sẵn sàng từ `ngAfterViewInit` trở đi — gọi nó trong `ngOnInit` sẽ nhận `undefined`, vì lúc đó view chưa được Angular dựng xong.

### 3.3. `@ContentChild` / `@ContentChildren`

```ts
@Component({ selector: 'app-panel', templateUrl: './panel.component.html' })
export class PanelComponent implements AfterContentInit {
  @ContentChild(PanelActionsDirective) actions?: PanelActionsDirective;

  ngAfterContentInit(): void {
    console.log('Có actions truyền vào panel:', !!this.actions);
  }
}
```

Khác với `@ViewChild` (tìm trong template riêng của component), `@ContentChild` tìm trong nội dung được **component cha truyền vào qua `<ng-content>`** (projected content). Giá trị sẵn sàng từ `ngAfterContentInit`.

### 3.4. `@HostBinding`

```ts
@Directive({ selector: '[appHoverable]' })
export class HoverableDirective {
  @HostBinding('class.app-hoverable--active') isHovered = false;
}
```

`@HostBinding` gắn giá trị của property lên một thuộc tính/class/style của host element. Đây là cách viết theo từng property riêng lẻ; như tài liệu Directive đã nói, khai báo `host: {...}` trong decorator chính thường được ưu tiên hơn cho code mới vì gom mọi binding vào một chỗ, nhưng `@HostBinding`/`@HostListener` vẫn tương đương về hành vi và còn phổ biến trong codebase hiện có.

---

## 4. Method decorator: `@HostListener`

```ts
@Directive({ selector: '[appConfirmAction]' })
export class ConfirmActionDirective {
  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    event.preventDefault();
  }
}
```

`@HostListener('click', ['$event'])` đăng ký method `onClick` làm handler cho event `click` của host element, và truyền `$event` (đối tượng event gốc của DOM) làm tham số đầu tiên. Angular tự gỡ listener này khi directive/component bị hủy — không cần tự viết `removeEventListener`.

Method decorator là loại ít gặp nhất trong bốn loại, vì phần lớn nhu cầu lắng nghe event của Angular đã được `@HostListener` bao phủ.

---

## 5. Parameter decorator: điều khiển Dependency Injection

Parameter decorator gắn trên tham số constructor, dùng để chỉnh cách Angular tìm dependency trong injector hierarchy (cây injector cha-con được nói chi tiết ở tài liệu Module, mục provider scope).

```ts
@Component({ selector: 'app-order-badge', templateUrl: './order-badge.component.html' })
export class OrderBadgeComponent {
  constructor(
    @Inject(ORDER_BADGE_CONFIG) private readonly config: OrderBadgeConfig,
    @Optional() private readonly analytics: AnalyticsService | null,
    @Self() private readonly localState: OrderBadgeStateService,
    @SkipSelf() private readonly parentFacade: OrderFacade,
    @Host() private readonly hostContext: OrderHostDirective
  ) {}
}
```

| Decorator | Ý nghĩa |
| --- | --- |
| `@Inject(token)` | Lấy dependency theo một token thủ công (bắt buộc khi dependency không phải class, ví dụ `InjectionToken`). |
| `@Optional()` | Nếu không tìm thấy provider, trả về `null` thay vì Angular ném lỗi "no provider". |
| `@Self()` | Chỉ tìm provider khai báo ngay tại injector của chính component/directive này, không tìm lên injector cha. |
| `@SkipSelf()` | Bỏ qua injector của chính nó, bắt đầu tìm từ injector cha trở lên. |
| `@Host()` | Dừng tìm kiếm ở injector của component host gần nhất, không tìm xa hơn lên injector gốc. |

`@Inject(token)` là decorator hay dùng nhất trong nhóm này, vì TypeScript chỉ tự suy ra token tiêm mặc định khi tham số có kiểu là một **class**. Với `InjectionToken` (dùng cho giá trị cấu hình, interface, hoặc primitive không phải class), bắt buộc phải khai `@Inject(...)` tường minh:

```ts
export const ORDER_BADGE_CONFIG = new InjectionToken<OrderBadgeConfig>('ORDER_BADGE_CONFIG');
```

`@Optional`, `@Self`, `@SkipSelf`, `@Host` ít dùng hơn, chủ yếu xuất hiện khi viết thư viện dùng lại hoặc directive cần biết ngữ cảnh injector (ví dụ một directive con cần đọc state từ đúng directive cha gần nhất, không lấy nhầm instance ở tầng khác).

---

## 6. Decorator hoạt động như thế nào bên dưới

Hiểu cơ chế này giúp lý giải được vì sao một số lỗi cấu hình xảy ra và tại sao Angular cần bước biên dịch riêng (AOT), không chỉ chạy TypeScript thuần.

### 6.1. TypeScript biên dịch decorator thành lời gọi hàm

Như phần 1 đã minh họa, decorator chỉ là cú pháp gọn cho một lời gọi hàm chạy ngay sau khi class được định nghĩa. Để dùng được cú pháp `@...`, `tsconfig.json` của project cần bật:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

`emitDecoratorMetadata` khiến TypeScript phát sinh thêm thông tin kiểu dữ liệu của constructor (nhờ thư viện `reflect-metadata`), để runtime có thể đọc được "tham số thứ nhất của constructor có kiểu `HttpClient`". Đây chính là cách Angular tự suy ra dependency cần tiêm mà không bắt bạn viết thủ công danh sách token ở mọi nơi.

### 6.2. Angular compiler đọc metadata để sinh code thật

Angular không "thông dịch" decorator lúc runtime như một framework chạy hoàn toàn động. Trình biên dịch Angular (AOT — Ahead-of-Time compiler) đọc metadata trong `@Component`, `@Directive`, `@NgModule`... ngay ở bước build, rồi sinh ra code TypeScript thuần (component factory, template render function, danh sách dependency cần tiêm...). Production build chạy code đã sinh sẵn này, không phải "diễn giải" decorator mỗi lần khởi động.

```text
Source: @Component({...}) class PatientCardComponent {}
              ↓ AOT compile (build time)
Generated: PatientCardComponent factory + render function + dependency list
              ↓ runtime
Angular chỉ gọi factory đã sinh sẵn, không đọc lại decorator lúc chạy
```

Hệ quả thực tế: metadata trong decorator phải là **giá trị Angular compiler đọc được lúc build** (chuỗi, số, mảng, object literal, tham chiếu tới symbol import được). Không đặt logic phức tạp, biểu thức phụ thuộc runtime, hay giá trị chỉ tính được lúc chạy vào bên trong `@Component({...})`.

---

## 7. Tự viết decorator riêng

Angular không giới hạn decorator ở các decorator có sẵn. TypeScript cho phép viết decorator riêng cho nhu cầu nội bộ, miễn là hiểu rõ decorator chỉ là một hàm nhận đối tượng cần trang trí làm tham số.

### 7.1. Property decorator ghi log khi giá trị đổi

```ts
function LogChanges(): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const privateKey = Symbol(String(propertyKey));

    Object.defineProperty(target, propertyKey, {
      get(this: Record<symbol, unknown>) {
        return this[privateKey];
      },
      set(this: Record<symbol, unknown>, value: unknown) {
        console.log(`[${String(propertyKey)}] đổi thành`, value);
        this[privateKey] = value;
      }
    });
  };
}

class PatientFormState {
  @LogChanges() name = '';
}
```

`LogChanges()` trả về một hàm nhận `target` (prototype của class) và `propertyKey` (tên property). Hàm đó định nghĩa lại property bằng `get`/`set` để chèn thêm hành vi log, mà vẫn giữ nguyên cách bên ngoài đọc/ghi property này (`state.name = 'Long'`).

### 7.2. Method decorator giới hạn tần suất gọi (debounce đơn giản)

```ts
function Debounce(delayMs: number): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    let timer: ReturnType<typeof setTimeout> | undefined;

    descriptor.value = function (this: unknown, ...args: unknown[]) {
      clearTimeout(timer);
      timer = setTimeout(() => original.apply(this, args), delayMs);
    };

    return descriptor;
  };
}

class SearchBoxComponent {
  @Debounce(300)
  onQueryChange(query: string): void {
    console.log('Tìm kiếm:', query);
  }
}
```

`descriptor.value` là hàm gốc của method. Method decorator thay `descriptor.value` bằng một hàm bọc ngoài (wrapper), ở đây trì hoãn việc gọi hàm gốc để tránh gọi liên tục khi người dùng gõ nhanh. Đây chính là kỹ thuật decorator dùng để thêm hành vi **xung quanh** một method mà không sửa code bên trong method đó.

### 7.3. Khi nào đáng viết decorator riêng

Decorator riêng hợp lý khi một hành vi lặp lại nhiều nơi và mang tính "khai báo" (giống `@Input`, `@HostListener`): logging, cache kết quả, giới hạn tần suất gọi, đo thời gian thực thi. Không nên dùng decorator riêng để giấu nghiệp vụ phức tạp — nếu hành vi cần nhiều tham số, phụ thuộc service, hoặc rẽ nhánh nghiệp vụ, một method/service tường minh dễ đọc và dễ test hơn một decorator "ma thuật".

---

## 8. Thứ tự áp dụng khi nhiều decorator cùng gắn một chỗ

Khi nhiều decorator gắn cùng một property/method, chúng được áp dụng **từ dưới lên trên**, dù đọc code thì mắt nhìn từ trên xuống.

```ts
class Example {
  @First()
  @Second()
  method(): void {}
}
```

Thứ tự thực thi khi build: `Second()` bọc `method` gốc trước, sau đó `First()` bọc kết quả của `Second()`. Với hầu hết decorator của Angular (`@Input`, `@Output`, `@HostListener`...), thứ tự không quan trọng vì chúng độc lập với nhau. Thứ tự chỉ thật sự đáng chú ý khi tự viết nhiều decorator riêng có bọc lẫn nhau (như `@Debounce` ở trên kết hợp thêm một decorator log khác) — khi đó cần biết rõ decorator nào bọc quanh decorator nào để đoán đúng hành vi cuối cùng.

---

## 9. Lỗi và ngộ nhận thường gặp

### 9.1. Thiếu `@Injectable()` trên service có dependency

```ts
// Thiếu @Injectable(): Angular không đọc được danh sách tham số constructor
export class PatientApiService {
  constructor(private readonly http: HttpClient) {}
}
```

Nếu service này không có constructor injecting gì cả, thiếu `@Injectable()` đôi khi vẫn chạy được vì Angular không cần tạo dependency nào. Nhưng đây là thói quen rủi ro: chỉ cần thêm một dependency vào constructor sau này, lỗi "no provider"/"Can't resolve all parameters" xuất hiện mà nguyên nhân thật (thiếu decorator) dễ bị bỏ qua vì trông như lỗi cấu hình provider.

### 9.2. Gọi `@ViewChild` quá sớm

```ts
@Component({ selector: 'app-patient-form', templateUrl: './patient-form.component.html' })
export class PatientFormComponent implements OnInit {
  @ViewChild('nameInput') nameInputRef!: ElementRef;

  ngOnInit(): void {
    this.nameInputRef.nativeElement.focus(); // lỗi: nameInputRef là undefined ở đây
  }
}
```

`@ViewChild` chỉ có giá trị từ `ngAfterViewInit`. Đây là lỗi runtime rất phổ biến với người mới quen decorator này, vì `ngOnInit` chạy trước khi Angular dựng xong view con.

### 9.3. Đặt logic runtime vào bên trong metadata decorator

```ts
// Sai: Angular compiler cần đọc được giá trị này lúc build, không phải lúc chạy
@Component({
  selector: 'app-patient-card',
  templateUrl: computeTemplateUrl() // lỗi hoặc hành vi không ổn định tùy cấu hình build
})
export class PatientCardComponent {}
```

Metadata trong `@Component`/`@NgModule`/`@Directive` nên là giá trị tĩnh, Angular compiler đọc được ngay lúc build (xem mục 6.2). Logic điều kiện, tính toán phụ thuộc runtime nên nằm trong class, không nằm trong object truyền cho decorator.

### 9.4. Quên rằng property decorator không hoạt động trên arrow function field theo cách mong đợi

```ts
class Example {
  @Debounce(300)
  onQueryChange = (query: string): void => {
    console.log(query);
  };
}
```

Arrow function gán cho một field (`onQueryChange = (query) => {...}`) là một **property**, không phải một **method** thật sự trên prototype. `MethodDecorator` như `@Debounce` ở mục 7.2 được thiết kế cho `PropertyDescriptor` của method trên prototype; áp dụng nó lên field kiểu arrow function có thể không nhận đúng `descriptor.value` như mong đợi. Khi viết decorator riêng, cần xác định rõ nó nhắm tới method trên prototype hay property field, và tài liệu hóa rõ cách dùng đúng.

---

## 10. Checklist khi làm việc với decorator

```text
[ ] Metadata trong decorator (@Component, @NgModule...) là giá trị tĩnh, không phụ thuộc runtime?
[ ] Mọi service có dependency trong constructor đều có @Injectable()?
[ ] @ViewChild/@ContentChild chỉ được đọc từ đúng lifecycle hook trở đi (AfterViewInit/AfterContentInit)?
[ ] InjectionToken luôn đi kèm @Inject() tường minh ở nơi dùng?
[ ] Decorator tự viết (nếu có) có tài liệu rõ: gắn cho property hay method, thứ tự bọc khi kết hợp nhiều decorator?
[ ] Không dùng decorator riêng để giấu nghiệp vụ phức tạp thay vì một service/method tường minh?
```

---

## 11. Kết luận

```text
Muốn mô tả class này là gì với Angular?         → Class decorator (@Component, @Directive, @NgModule, @Injectable, @Pipe).
Muốn mô tả một field nhận/phát dữ liệu?         → Property decorator (@Input, @Output, @ViewChild, @HostBinding...).
Muốn mô tả một method là event handler?         → Method decorator (@HostListener).
Muốn chỉnh cách một dependency được tìm thấy?   → Parameter decorator (@Inject, @Optional, @Self, @SkipSelf, @Host).
```

Decorator không phải cú pháp trang trí cho đẹp: nó là cách Angular biết cách biên dịch và nối dây (wiring) code của bạn mà không cần một tầng cấu hình rời rạc. Hiểu decorator ở mức "một hàm gắn metadata tĩnh vào class/property/method/parameter, được đọc lại lúc build" giúp tránh phần lớn lỗi cấu hình khó hiểu khi mới làm việc với Angular.
