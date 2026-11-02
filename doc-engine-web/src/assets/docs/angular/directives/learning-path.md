# Angular Directive

> Đây là trang nên đọc đầu tiên.
>
> Mục tiêu không phải ghi nhớ mọi API của `@Directive()`, mà là xây dựng đúng mental model, viết được directive có contract rõ ràng và biết khi nào **không nên** dùng directive.

Tài liệu trong chủ đề này được chia thành ba vai trò:

| Tài liệu | Dùng khi nào |
| --- | --- |
| **Lộ trình học** — trang hiện tại | Học lần đầu theo thứ tự từ cơ bản đến chuyên sâu |
| **Lý thuyết chi tiết** | Tra cứu API, ví dụ attribute/structural/forms/testing |
| **Thiết kế production** | Review thiết kế, SSR, binding collision, performance và kiến trúc |
| **Ví dụ minh họa** | Xây dựng luồng Enter-to-focus với native input và `nz-select` |

Project đang sử dụng Angular 17 theo mô hình NgModule. Directive tự viết trong các ví dụ cơ bản dùng `standalone: false`. Khi ví dụ dùng `hostDirectives`, directive được compose phải là standalone theo yêu cầu của Directive Composition API.

---

## 1. Lộ trình học

Các phần được sắp xếp tuần tự từ nền tảng, cách xây dựng directive, structural directive, Angular Forms và kiểm thử đến thiết kế ở cấp độ hệ thống.

### Mức cơ bản

```text
Directive giải quyết bài toán gì?
        ↓
Angular gắn directive vào element nào?
        ↓
Input đi vào directive bằng cách nào?
        ↓
Directive phản ánh state lên host ra sao?
        ↓
Directive phát semantic event ra ngoài thế nào?
```

Sau level này, bạn cần tự viết được một attribute directive nhỏ.

### Mức ứng dụng

```text
Thiết kế public API rõ ràng
        ↓
Quản lý lifecycle và cleanup
        ↓
Làm việc với TemplateRef/ViewContainerRef
        ↓
Tích hợp Angular Forms
        ↓
Test thông qua contract quan sát được
```

Sau level này, bạn cần viết được directive dùng trong production và biết phân tích trade-off.

### Mức chuyên sâu

```text
Vì sao directive là boundary phù hợp?
Khi nào component/service tốt hơn?
API có gây coupling ngầm không?
Có chạy an toàn với SSR/hydration không?
Có tạo listener/observer theo từng instance không?
Host binding của ai thắng khi xung đột?
Directive có che giấu business workflow không?
```

Năng lực chuyên sâu không được đo bằng số lượng API biết dùng, mà bằng chất lượng quyết định và khả năng dự đoán hệ quả.

---

## 2. Kiến thức nền tảng

### 2.1. Directive giải quyết vấn đề gì?

Giả sử nhiều màn hình đều cần highlight một field khi invalid.

Nếu viết trực tiếp trong từng component:

```html
<input
  [class.app-invalid-field]="nameControl.invalid && nameControl.touched"
  [attr.aria-invalid]="nameControl.invalid && nameControl.touched"
/>
```

Logic này có thể xuất hiện ở hàng chục template. Mỗi nơi có nguy cơ dùng khác class, quên ARIA hoặc sửa không đồng bộ.

Directive đóng gói **hành vi gắn với element**:

```html
<input
  [appHighlightInvalid]="nameControl.invalid"
  [touched]="nameControl.touched"
/>
```

Mental model đầu tiên:

> Component quản lý use case của màn hình. Directive bổ sung một hành vi có thể tái sử dụng cho host element.

Directive không nên tự thực hiện toàn bộ nghiệp vụ chỉ vì nó đang lắng nghe sự kiện trên một element.

Ví dụ, directive sau che giấu quá nhiều việc:

```html
<button [appDeletePatient]="patientId">
  Xóa bệnh nhân
</button>
```

Nếu `appDeletePatient` tự gọi API xóa, cập nhật store, hiển thị thông báo rồi chuyển trang, người đọc template không nhìn thấy luồng xử lý đó. Directive cũng bị gắn chặt với nghiệp vụ bệnh nhân nên khó tái sử dụng và khó kiểm thử.

Nên để directive xử lý hành vi UI dùng chung, sau đó phát một sự kiện có ý nghĩa:

```html
<button
  [appConfirmAction]="deleteMessage"
  (confirmed)="deletePatient(patientId)"
>
  Xóa bệnh nhân
</button>
```

```ts
deletePatient(patientId: string): void {
  this.patientService.delete(patientId).subscribe(() => {
    this.patientStore.remove(patientId);
    this.router.navigate(['/patients']);
  });
}
```

Trong thiết kế này:

```text
Directive
→ Hiển thị bước xác nhận và phát sự kiện confirmed.

Component hoặc facade
→ Thực hiện use case xóa bệnh nhân.

Service
→ Gọi API.
```

Điều này không có nghĩa directive tuyệt đối không được inject service. Directive vẫn có thể dùng service phục vụ chính hành vi UI của nó, chẳng hạn overlay, focus manager hoặc analytics. Điểm quan trọng là không giấu một use case nghiệp vụ lớn sau một attribute tưởng như chỉ mô tả hành vi giao diện.

---

### 2.2. Xây dựng directive đầu tiên

#### Bước 1: Viết directive

```ts
import { Directive, Input } from '@angular/core';

@Directive({
  selector: '[appHighlightInvalid]',
  standalone: false,
  host: {
    '[class.app-invalid-field]': 'invalid && touched',
    '[attr.aria-invalid]': 'invalid && touched'
  }
})
export class HighlightInvalidDirective {
  @Input('appHighlightInvalid') invalid = false;
  @Input() touched = false;
}
```

#### Bước 2: Khai báo và export

```ts
@NgModule({
  declarations: [HighlightInvalidDirective],
  exports: [HighlightInvalidDirective]
})
export class SharedDirectivesModule {}
```

Feature module import `SharedDirectivesModule` trước khi template của feature dùng directive.

#### Bước 3: Sử dụng

```html
<input
  [appHighlightInvalid]="control.invalid"
  [touched]="control.touched"
/>
```

#### Bước 4: Đọc luồng chạy

```text
Angular biên dịch template
        ↓
Element có appHighlightInvalid khớp selector
        ↓
Angular tạo một HighlightInvalidDirective instance
        ↓
Gán input invalid và touched
        ↓
Đánh giá host bindings
        ↓
Thêm/bỏ class và cập nhật aria-invalid
```

Nếu ba input cùng sử dụng directive, Angular tạo ba instance độc lập.

---

### 2.3. Năm khái niệm cốt lõi

#### Selector

```ts
selector: '[appHighlightInvalid]'
```

Selector trả lời:

> Element nào sẽ có một instance của directive này?

```html
<input appHighlightInvalid />
```

Tên selector là public API. Đổi selector có thể làm hỏng mọi template đang dùng nó.

#### Host element

Trong:

```html
<input appHighlightInvalid />
```

`input` là host element. Directive không có template riêng; nó làm việc với host đã tồn tại.

#### Input

```ts
@Input('appHighlightInvalid') invalid = false;
```

```html
<input [appHighlightInvalid]="control.invalid" />
```

Gần tương đương:

```ts
directive.invalid = component.control.invalid;
```

Selector quyết định directive có được tạo. Input quyết định directive nhận dữ liệu gì. Hai việc liên quan về cú pháp nhưng khác vai trò.

#### Host binding

```ts
host: {
  '[class.app-invalid-field]': 'invalid && touched',
  '[attr.aria-invalid]': 'invalid && touched'
}
```

Hãy đọc object `host` giống binding trong template:

```text
Directive state
     ↓
Host class / style / attribute / property
```

Ưu tiên cách declarative này khi chỉ cần đồng bộ state lên host. Chỉ dùng `ElementRef` hoặc `Renderer2` khi bài toán thực sự cần thao tác imperative.

#### Output

Directive hỏi xác nhận không nên tự quyết định nghiệp vụ xóa:

```ts
@Directive({
  selector: '[appConfirmAction]',
  standalone: false,
  host: {
    '(click)': 'confirm($event)'
  }
})
export class ConfirmActionDirective {
  @Input('appConfirmAction') message = 'Bạn có chắc muốn tiếp tục?';
  @Output() confirmed = new EventEmitter<void>();

  confirm(event: MouseEvent): void {
    event.preventDefault();

    if (window.confirm(this.message)) {
      this.confirmed.emit();
    }
  }
}
```

```html
<button
  [appConfirmAction]="deleteMessage"
  (confirmed)="deletePatient()"
>
  Xóa
</button>
```

Ranh giới trách nhiệm:

```text
Directive: xác nhận và phát confirmed
Component: biết patient nào cần xóa
Service: gọi API
```

---

### 2.4. Lựa chọn abstraction phù hợp

| Câu hỏi | Lựa chọn thường phù hợp |
| --- | --- |
| Có layout/template riêng? | Component |
| Bổ sung hành vi trực tiếp cho host? | Attribute directive |
| Quyết định một template có được render? | Structural directive hoặc built-in control flow |
| Chuyển đổi dữ liệu khi hiển thị? | Pipe |
| Gọi API, cache, state hoặc business workflow? | Service/facade/store |
| Tạo custom form control hoàn chỉnh? | Component + ControlValueAccessor |

Một phép thử nhanh:

> Nếu bỏ host element khỏi câu mô tả mà use case vẫn còn nguyên, logic đó có thể không thuộc directive.

Ví dụ:

```text
"Button này cần hỏi xác nhận trước khi phát action"
→ Gắn trực tiếp với host, directive hợp lý.

"Hệ thống cần duyệt bệnh nhân và cập nhật lịch sử"
→ Business workflow, không thuộc directive.
```

---

### 2.5. Kiểm tra kiến thức nền tảng

Bạn đã nắm được phần nền tảng khi giải thích và làm được:

```text
[ ] Selector và input khác nhau thế nào?
[ ] Host element là gì?
[ ] Vì sao component cũng là một dạng directive đặc biệt?
[ ] Vì sao ưu tiên host binding cho class/attribute?
[ ] Vì sao output nên mang ý nghĩa semantic?
[ ] Khi nào phải chọn component hoặc service thay vì directive?
[ ] Tự viết và sử dụng được appHighlightInvalid.
```

Nếu chưa chắc các câu trên, chưa cần học structural directive.

---

## 3. Xây dựng directive cho production

### 3.1. Thiết kế input

#### Attribute tĩnh và property binding

```html
<input appHighlight="false" />
```

Giá trị có thể là chuỗi `'false'`.

```html
<input [appHighlight]="false" />
```

Giá trị là boolean `false`.

Với boolean/number input, dùng transform:

```ts
@Input({
  alias: 'appHighlight',
  transform: booleanAttribute
})
active = false;

@Input({ transform: numberAttribute })
delay = 0;
```

API tốt cần:

```text
- Có default hợp lý.
- Tên đọc tự nhiên trong template.
- Kiểu dữ liệu rõ.
- Chuẩn hóa attribute value nếu cần.
- Không yêu cầu consumer biết implementation.
```

#### Input setter và ngOnChanges

Input setter phù hợp khi một input tự quyết định một phản ứng nhỏ:

```ts
@Input()
set disabled(value: boolean) {
  this.applyDisabledState(value);
}
```

`ngOnChanges` phù hợp khi kết quả phụ thuộc nhiều input:

```ts
ngOnChanges(): void {
  this.visible = this.allowed && !this.hidden;
}
```

Không dùng `ngDoCheck` để dò thay đổi nếu input binding đã mô tả được dependency.

---

### 3.2. Event và output

DOM event mô tả điều vừa xảy ra:

```text
click
keydown
mouseenter
input
```

Directive output nên mô tả ý nghĩa sau khi directive xử lý:

```text
confirmed
outsideClicked
becameVisible
validationRequested
```

Consumer không nên phải biết directive dùng `document:click`, `pointerdown` hay `focusout` bên trong.

Cẩn thận với event propagation:

```text
preventDefault()
→ Ngăn hành vi mặc định.

stopPropagation()
→ Ngăn event bubble lên ancestor.
```

Không gọi `stopPropagation()` như thói quen. Nó có thể làm hỏng analytics, dropdown manager hoặc handler ở component cha.

---

### 3.3. Lifecycle và quản lý tài nguyên

Quy tắc production quan trọng:

> Directive tạo resource thì directive phải chịu trách nhiệm hủy resource.

Resource bao gồm:

```text
- setTimeout / setInterval
- subscription
- Renderer2.listen
- IntersectionObserver / ResizeObserver / MutationObserver
- listener gắn trực tiếp lên document/window
- instance của thư viện DOM bên ngoài
```

Luồng lifecycle thường gặp:

```text
constructor
→ inject dependency, chưa xử lý business behavior

ngOnChanges
→ input được gán hoặc thay đổi

ngOnInit
→ khởi tạo logic không cần view hoàn tất

ngAfterViewInit
→ host/view đã khởi tạo

ngOnDestroy
→ teardown resource
```

Với RxJS:

```ts
private readonly destroyRef = inject(DestroyRef);

source$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(value => {
    // ...
  });
```

Với `Renderer2.listen()`:

```ts
private removeListener?: () => void;

ngOnInit(): void {
  this.removeListener = this.renderer.listen(
    'document',
    'click',
    event => this.handleDocumentClick(event)
  );
}

ngOnDestroy(): void {
  this.removeListener?.();
}
```

---

### 3.4. ElementRef và Renderer2

`ElementRef` là wrapper chứa tham chiếu tới host:

```ts
constructor(
  private readonly elementRef: ElementRef<HTMLInputElement>
) {}
```

Phù hợp khi cần:

```text
- focus
- đọc bounding rectangle
- kết nối browser observer
- tích hợp thư viện DOM
```

Không nên dùng nó để biến directive thành jQuery:

```ts
host.style.color = 'red';
host.classList.add('active');
host.setAttribute('aria-busy', 'true');
```

Nếu thay đổi có thể biểu diễn từ state, dùng `host` metadata. Nếu cần thao tác imperative, cân nhắc `Renderer2`. Nếu cần browser API, phải kiểm tra các vấn đề SSR và hydration được trình bày trong phần chuyên sâu.

---

### 3.5. Bài thực hành

Nên học theo thứ tự:

#### Bài 1: Highlight field không hợp lệ

Học:

```text
selector → input → host class → ARIA
```

#### Bài 2: Xác nhận hành động

Học:

```text
host event → preventDefault → semantic output → responsibility boundary
```

#### Bài 3: Phát hiện click bên ngoài

Học:

```text
ElementRef → document listener → contains() → cleanup → instance cost
```

#### Bài 4: Phát hiện element trong viewport

Học:

```text
browser observer → NgZone → output → disconnect → SSR concern
```

Không copy một lab vào production trước khi hoàn thành test matrix của lab đó.

---

## 4. Structural directive

### 4.1. Cơ chế hoạt động

Attribute directive làm việc với host đã tồn tại.

Structural directive quản lý việc một embedded view có tồn tại:

```text
TemplateRef
→ bản thiết kế của template chưa render

ViewContainerRef
→ vị trí có thể chèn/xóa view

EmbeddedViewRef
→ instance đã render từ TemplateRef
```

```html
<button *appHasPermission="'Patients.Delete'">
  Xóa
</button>
```

Được hiểu gần giống:

```html
<ng-template [appHasPermission]="'Patients.Delete'">
  <button>Xóa</button>
</ng-template>
```

Directive thực tế làm việc với `ng-template`, không phải một button luôn tồn tại rồi bị ẩn bằng CSS.

---

### 4.2. Ví dụ cơ bản

```ts
@Directive({
  selector: '[appShow]',
  standalone: false
})
export class ShowDirective {
  private hasView = false;

  constructor(
    private readonly templateRef: TemplateRef<unknown>,
    private readonly viewContainer: ViewContainerRef
  ) {}

  @Input()
  set appShow(condition: boolean) {
    if (condition && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
      return;
    }

    if (!condition && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
```

`hasView` tránh tạo nhiều view giống nhau hoặc clear container không cần thiết.

Không tự viết `appIf` hoặc `appLoop` chỉ để đổi tên `@if`, `@for`, `ngIf` hoặc `ngFor`. Structural directive chỉ có giá trị khi nó đóng gói domain rule thực sự:

```text
- permission
- feature flag
- deferred rendering có policy riêng
- template outlet có context đặc thù
```

Ẩn UI bằng permission directive không phải authorization. Backend vẫn phải kiểm tra quyền.

---

### 4.3. Microsyntax, template context và type checking

```html
<div *appRepeat="3; let value; let i = index">
  {{ i }} — {{ value }}
</div>
```

Context:

```ts
interface RepeatContext {
  $implicit: number;
  index: number;
}
```

`$implicit` được đọc bằng `let value`; property có tên được đọc bằng `let i = index`.

Template context guard giúp compiler hiểu kiểu:

```ts
static ngTemplateContextGuard(
  directive: RepeatDirective,
  context: unknown
): context is RepeatContext {
  return true;
}
```

Guard này là contract cho template type checker, không phải runtime validation.

---

## 5. Tích hợp với Angular Forms

### 5.1. Phân biệt ba nhóm bài toán

```text
Thay đổi interaction/giao diện input
→ Attribute directive

Bổ sung validation
→ Validator directive

Tạo một custom control hoàn chỉnh
→ Component + ControlValueAccessor
```

Việc sửa `input.value` không đảm bảo `FormControl.value` đã đồng bộ đúng. Numeric/trim/mask directive phải kiểm tra:

```text
- DefaultValueAccessor
- input/composition events
- caret/selection
- emitEvent và valueChanges
- paste, mobile keyboard và IME
- validation vẫn chạy độc lập
```

Nếu control phải nhận value, báo value mới, báo touched và nhận disabled state, hãy dùng ControlValueAccessor thay vì cố mở rộng một behavior directive thành custom form control.

---

## 6. Kiểm thử directive

### 6.1. Kiểm thử thông qua public contract

Directive consumer quan sát được:

```text
- class/style/attribute/property trên host
- output payload
- view được tạo hoặc xóa
- form value/validation state
- resource được cleanup
```

Test bằng host component:

```ts
@Component({
  template: `
    <input
      [appHighlightInvalid]="invalid"
      [touched]="touched"
    />
  `
})
class HostComponent {
  invalid = false;
  touched = false;
}
```

Test nên thay đổi input qua host component rồi `detectChanges()`. Với event, trigger trên DOM thật của fixture thay vì gọi trực tiếp private method của directive.

### 6.2. Danh sách tình huống cần kiểm thử

```text
[ ] Default khi không truyền input
[ ] Mỗi nhánh state chính
[ ] Input đổi sau lần render đầu
[ ] Mouse và keyboard
[ ] Output đúng payload và đúng số lần
[ ] Host class/property/ARIA
[ ] Embedded view tạo/xóa đúng
[ ] Timer/listener/observer/subscription được cleanup
[ ] FormControl đồng bộ nếu directive can thiệp value
[ ] SSR-safe nếu directive dùng browser API
```

---

## 7. Thiết kế ở cấp độ hệ thống

### 7.1. Câu hỏi khi review

Trước khi approve một directive, hỏi:

```text
1. Behavior có thật sự thuộc host element không?
2. Directive có một trách nhiệm chính không?
3. Tên selector/input/output có đọc tự nhiên trong template không?
4. Có che giấu API call, navigation hoặc state workflow không?
5. Có coupling ngầm với directive khác không?
6. Có binding collision với component hoặc consumer không?
7. Có resource theo từng instance và cleanup đầy đủ không?
8. Có an toàn với keyboard, screen reader và semantic HTML không?
9. Có dùng window/document/nativeElement trong SSR không?
10. Có test contract và failure paths không?
```

### 7.2. Nội dung chuyên sâu

Sau khi hoàn thành lộ trình này:

1. Đọc **Lý thuyết chi tiết** để xem toàn bộ ví dụ về forms, composition và testing.
2. Đọc **Thiết kế production** để học sâu:

```text
- binding collision và quyền sở hữu host
- provider/injector boundary
- SSR và hydration
- listener/observer cost
- hostDirectives và coupling
- production review workflow
```

3. Đọc **Ví dụ minh họa** để xem cách ghép selector, input, HostListener, dependency injection, lifecycle và component thư viện vào một bài toán hoàn chỉnh.

---

### 7.3. Kết quả cần đạt

#### Mức cơ bản

```text
Tự viết được attribute directive nhỏ.
Giải thích được selector/input/host/output.
Không đưa business workflow vào directive.
```

#### Mức ứng dụng

```text
Thiết kế API ổn định.
Cleanup đầy đủ.
Viết được structural/validator directive khi có lý do.
Test thông qua host contract.
```

#### Mức chuyên sâu

```text
Chứng minh được vì sao directive là abstraction phù hợp.
Dự đoán được collision, lifecycle, SSR và performance risk.
Thiết kế composition không tạo coupling ngầm.
Review được directive như một public API của hệ thống.
```

Directive giỏi không phải directive làm nhiều việc. Directive giỏi là một behavior nhỏ, dễ nhìn thấy trong template, dễ dự đoán, dễ test và không làm mờ kiến trúc của ứng dụng.
