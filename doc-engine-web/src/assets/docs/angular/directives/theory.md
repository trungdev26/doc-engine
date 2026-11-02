# Angular Directive

> Directive là cơ chế giúp Angular gắn thêm hành vi, trạng thái hoặc quy tắc render vào một phần tử trong template.
>
> Hiểu đúng directive không chỉ là biết viết `@Directive()`. Quan trọng hơn là hiểu Angular nhận diện directive như thế nào, directive tương tác với host element ra sao, khi nào nên dùng directive và khi nào nên chọn component hoặc service.

Tài liệu sử dụng Angular theo mô hình **NgModule**. Các directive thông thường trong tài liệu được khai báo với `standalone: false` và export qua module dùng chung. Riêng directive dùng trong `hostDirectives` phải là standalone theo yêu cầu của Directive Composition API.

---

## 1. Tổng quan về directive

### 1.1. Bài toán directive giải quyết

Trong một ứng dụng Angular, nhiều phần tử có thể cần lặp lại cùng một hành vi:

```text
- Input tự động focus khi màn hình mở.
- Field invalid được thêm class và aria-invalid.
- Input chỉ cho phép nhập số.
- Button phải hỏi xác nhận trước khi thực hiện.
- Nội dung chỉ được render khi người dùng có quyền.
- Element phát sự kiện khi xuất hiện trong viewport.
```

Nếu không có directive, những hành vi này thường bị viết lặp trong nhiều component:

```ts
export class PatientFormComponent {
  ngAfterViewInit(): void {
    this.nameInput.nativeElement.focus();
  }
}
```

Sau đó component khác lại viết một đoạn tương tự. Khi số lượng màn hình tăng lên, logic UI bị phân tán, khó thống nhất và khó sửa đồng bộ.

Directive cho phép đóng gói hành vi đó thành một đơn vị riêng:

```html
<input appAutoFocus />
```

Template chỉ cần khai báo **phần tử này có hành vi gì**. Phần cài đặt được directive quản lý.

### 1.2. Directive là gì?

Directive là một class TypeScript được đánh dấu bằng decorator `@Directive()`.

```ts
import { Directive } from '@angular/core';

@Directive({
  selector: '[appExample]',
  standalone: false
})
export class ExampleDirective {}
```

Decorator cung cấp metadata để Angular biết:

```text
- Class này là một directive.
- Directive được kích hoạt bởi selector nào.
- Directive có host binding hoặc host listener nào.
- Directive có được sử dụng độc lập hay thuộc NgModule.
```

Khi Angular biên dịch template sau:

```html
<button appExample>Thao tác</button>
```

Angular thực hiện theo luồng tư duy sau:

```text
Angular đọc template
        ↓
Tìm các directive có selector khớp với element
        ↓
Tạo instance của directive
        ↓
Inject dependency vào directive
        ↓
Gán giá trị cho các input
        ↓
Thiết lập host binding và event listener
        ↓
Quản lý lifecycle cùng với host element
```

Phần tử `<button>` được gọi là **host element** của directive.

```text
<button appExample>
   ↑
Host element của ExampleDirective
```

Một instance directive chỉ gắn với một host cụ thể. Nếu template có ba element sử dụng `appExample`, Angular tạo ba instance directive khác nhau.

```html
<button appExample>Nút 1</button>
<button appExample>Nút 2</button>
<button appExample>Nút 3</button>
```

```text
Button 1 → ExampleDirective instance A
Button 2 → ExampleDirective instance B
Button 3 → ExampleDirective instance C
```

### 1.3. Component cũng là một directive

`@Component()` là một dạng directive đặc biệt có template riêng.

```text
Directive
├── Component
│   └── Có template riêng
├── Attribute Directive
│   └── Thay đổi hành vi hoặc trạng thái của host
└── Structural Directive
    └── Tạo, xóa hoặc lặp một khối view
```

| Loại | Có template riêng | Vai trò chính | Ví dụ |
| --- | --- | --- | --- |
| Component | Có | Biểu diễn một vùng UI hoàn chỉnh | `app-patient-card` |
| Attribute Directive | Không | Bổ sung hành vi, class, style, attribute hoặc event cho host | `appAutoFocus` |
| Structural Directive | Không | Quyết định một khối template có được render hay không | `*ngIf`, `*appHasPermission` |

### 1.4. Chọn Directive, Component, Service hay Pipe

```text
Có một vùng UI với layout riêng?
→ Component

Có hành vi gắn trực tiếp lên một host element?
→ Attribute Directive

Quản lý việc một template có được render hay không?
→ Structural Directive hoặc built-in control flow

Có nghiệp vụ, API, cache hoặc state chia sẻ?
→ Service

Chỉ chuyển đổi dữ liệu để hiển thị?
→ Pipe
```

Ví dụ bài toán xóa hồ sơ:

```text
Component
- Biết hồ sơ nào đang được xóa.
- Quản lý loading, success và error.
- Gọi service xóa hồ sơ.

Directive
- Chuẩn hóa hành vi hỏi xác nhận.
- Emit sự kiện khi người dùng đồng ý.

Service
- Gọi API.
- Không phụ thuộc DOM.
```

Không nên biến directive thành nơi chứa toàn bộ workflow:

```ts
@Directive({
  selector: '[appDeletePatient]',
  standalone: false
})
export class DeletePatientDirective {
  // Không nên tự đọc patientId, gọi API,
  // điều hướng và hiển thị notification tại đây.
}
```

Directive nên trả lời câu hỏi:

> Host element này cần có thêm hành vi gì?

Nó không nên âm thầm quyết định toàn bộ nghiệp vụ của màn hình.

---

## 2. Attribute directive

Attribute directive thay đổi hành vi hoặc trạng thái của một host element đã tồn tại. Nó không sở hữu template riêng và không tự tạo một khối UI mới.

Phần này đi từ directive tối giản đến một directive hoàn chỉnh.

### 2.1. Tạo directive và sử dụng trong NgModule

```bash
ng generate directive shared/directives/highlight --standalone=false
```

Directive ban đầu:

```ts
import { Directive } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: false
})
export class HighlightDirective {}
```

Khai báo trong module dùng chung:

```ts
import { NgModule } from '@angular/core';
import { HighlightDirective } from './highlight.directive';

@NgModule({
  declarations: [HighlightDirective],
  exports: [HighlightDirective]
})
export class SharedDirectivesModule {}
```

Feature module muốn dùng directive cần import module này:

```ts
@NgModule({
  imports: [SharedDirectivesModule]
})
export class PatientModule {}
```

Luồng visibility:

```text
HighlightDirective
      ↓ declarations
SharedDirectivesModule
      ↓ exports
PatientModule import SharedDirectivesModule
      ↓
Template thuộc PatientModule sử dụng được appHighlight
```

Nếu directive đã được khai báo nhưng không được export, template ngoài module chứa nó sẽ không sử dụng được.

### 2.2. Selector của directive

> **Vì nhiều nơi có thể phụ thuộc vào tên này, việc thay đổi selector có thể làm hỏng các template đang sử dụng directive.**

```ts
@Directive({
  selector: '[appHighlight]',
  standalone: false
})
```

Dấu `[]` biểu thị attribute selector.

```html
<input appHighlight />
```

Angular không coi `appHighlight` là một HTML attribute vô nghĩa. Nó dùng attribute này để xác định rằng `HighlightDirective` phải được khởi tạo trên element đó.

Một số selector thường gặp:

```ts
// Mọi element có attribute appAutoFocus
selector: '[appAutoFocus]'

// Chỉ input có attribute appNumericInput
selector: 'input[appNumericInput]'

// Button có attribute appConfirmAction
selector: 'button[appConfirmAction]'

// Element đồng thời có hai attribute
selector: '[appTooltip][tooltipText]'
```

Nên dùng prefix riêng của ứng dụng:

```text
appAutoFocus
appHighlightInvalid
appConfirmAction
```

Prefix giúp giảm nguy cơ trùng selector với directive của thư viện khác.

Tên selector nên mô tả **ý định** thay vì chi tiết implementation:

```text
Tốt: appNumericInput
Kém rõ: appKeydownFilter
```

Consumer cần biết directive làm gì, không cần biết bên trong nó dùng `keydown`, `beforeinput` hay một cơ chế khác.

### 2.3. Attribute thuần và property binding

Xét directive sau:

```ts
import { Directive, Input } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: false
})
export class HighlightDirective {
  @Input() appHighlight = false;
}
```

`selector: '[appHighlight]'` là điều kiện để Angular nhận ra element nào cần gắn `HighlightDirective`. `@Input() appHighlight` là nơi directive nhận dữ liệu từ template. Vì cả selector và input cùng tên `appHighlight`, template có hai cách viết trên cùng một element, và chúng cho kết quả khác nhau.

**Cách 1 — chỉ viết attribute thuần, không có giá trị:**

```html
<input appHighlight />
```

Angular thấy attribute `appHighlight` khớp selector nên vẫn tạo và gắn `HighlightDirective` vào `<input>` bình thường. Nhưng vì template không gán giá trị nào cho nó, input `appHighlight` bên trong directive giữ nguyên giá trị mặc định đã khai (`false`).

**Cách 2 — property binding, có gán một biểu thức:**

```ts
export class PatientFormComponent {
  isInvalid = true;
}
```

```html
<input [appHighlight]="isInvalid" />
```

Cặp dấu ngoặc vuông báo cho Angular: "đây là một biểu thức, hãy đánh giá nó". Angular tính giá trị của `isInvalid` rồi gán kết quả vào input `appHighlight` của directive — gần tương đương với `directive.appHighlight = component.isInvalid`. Khi `isInvalid` đổi giá trị ở lần change detection sau, Angular gán lại và directive nhận giá trị mới.

Tóm lại:

| Template | Directive có được gắn không | Giá trị input nhận được |
| --- | --- | --- |
| `<input appHighlight />` | Có | Giá trị mặc định khai trong directive |
| `<input [appHighlight]="isInvalid" />` | Có | Kết quả của biểu thức `isInvalid`, cập nhật theo change detection |

Selector quyết định directive **có được gắn hay không**; property binding chỉ quyết định **input nhận giá trị gì**. Hai việc này độc lập với nhau.

Tên input không bắt buộc phải trùng với selector. Có thể tách riêng bằng alias, để tên công khai trong template khác với tên property dùng bên trong class:

```ts
@Directive({ selector: '[appHighlight]' })
export class HighlightDirective {
  @Input('appHighlight') active = false;
}
```

```html
<input [appHighlight]="control.invalid" />
```

`appHighlight` là tên template dùng để truyền giá trị vào; `active` là tên property mà code bên trong directive thao tác (`this.active`). Alias giúp API bên ngoài đọc tự nhiên trong template, còn code bên trong vẫn dùng tên rõ nghĩa cho logic.

### 2.4. Property binding và attribute tĩnh

Đây là điểm rất dễ gây nhầm.

```html
<input [appHighlight]="false" />
```

Angular đánh giá biểu thức `false`, directive nhận boolean:

```ts
false
```

Trong khi đó:

```html
<input appHighlight="false" />
```

Angular có thể truyền chuỗi:

```ts
'false'
```

Chuỗi `'false'` vẫn là truthy trong JavaScript.

Với boolean input, nên dùng transform:

```ts
import { booleanAttribute, Directive, Input } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: false
})
export class HighlightDirective {
  @Input({ alias: 'appHighlight', transform: booleanAttribute })
  active = false;
}
```

Sử dụng:

```html
<input appHighlight />
<input appHighlight="true" />
<input [appHighlight]="isInvalid" />
```

Transform giúp chuẩn hóa giá trị đầu vào thành boolean theo quy ước của Angular.

Với number input có thể dùng `numberAttribute`:

```ts
@Input({ transform: numberAttribute })
delay = 0;
```

### 2.5. Host element, ElementRef và nativeElement

**Host element** là element đang chứa directive trong template:

```html
<input appHighlight />
```

```text
Host element = input
```

Ví dụ:

```html
<button appConfirmAction>Xóa</button>
```

```text
button
├── Vẫn là button do Angular render
└── Đồng thời là host của ConfirmActionDirective
```

Nếu directive được đặt trên một component:

```html
<app-patient-card appHighlight />
```

thì host của directive là element `<app-patient-card>`, không phải các element bên trong template của `PatientCardComponent`.

Có thể hình dung quá trình Angular render theo cách đơn giản:

```text
Angular compiler đọc template
        ↓
Đối chiếu selector và sinh render instructions
        ↓
Runtime thực thi instructions
        ↓
Tạo hoặc cập nhật element trong DOM
        ↓
Tạo directive instance trên element đã khớp
        ↓
Gán input, thiết lập host binding và event listener
        ↓
Các lần change detection sau cập nhật những binding này
```

Angular không đợi trang render xong rồi mới quét toàn bộ DOM để tìm directive. Selector đã được Angular compiler đối chiếu khi biên dịch template; runtime sử dụng thông tin đó để tạo element và directive tương ứng.

Khi directive cần tham chiếu tới host, Angular có thể inject `ElementRef`:

```ts
import { Directive, ElementRef } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: false
})
export class HighlightDirective {
  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>
  ) {
    console.log(this.elementRef.nativeElement);
  }
}
```

Các khái niệm:

```text
ElementRef
= wrapper Angular cung cấp để tham chiếu tới element

nativeElement
= element cụ thể được renderer tạo ra;
  trong trình duyệt thường là DOM element thật
```

Với ví dụ trên:

```ts
this.elementRef.nativeElement
```

là một `HTMLInputElement`.

Có thể gọi:

```ts
this.elementRef.nativeElement.focus();
```

`ElementRef` phù hợp khi cần:

```text
- Focus element.
- Đọc kích thước hoặc vị trí.
- Kết nối với API trình duyệt.
- Tích hợp thư viện DOM bên ngoài.
```

Không nên biến directive thành code thao tác DOM kiểu jQuery:

```ts
this.elementRef.nativeElement.style.backgroundColor = 'red';
this.elementRef.nativeElement.classList.add('invalid');
this.elementRef.nativeElement.setAttribute('aria-invalid', 'true');
```

Đoạn này chạy được trong browser, nhưng class, style và attribute nên được thể hiện qua host binding hoặc `Renderer2` để contract rõ ràng hơn.

### 2.6. Thay đổi host bằng Renderer2

`Renderer2` cung cấp API trừu tượng để thao tác với element:

```ts
import { Directive, ElementRef, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: false
})
export class HighlightDirective {
  constructor(
    elementRef: ElementRef<HTMLElement>,
    renderer: Renderer2
  ) {
    renderer.addClass(elementRef.nativeElement, 'app-highlight');
  }
}
```

Một số API thường dùng:

```ts
renderer.addClass(element, 'active');
renderer.removeClass(element, 'active');
renderer.setStyle(element, 'cursor', 'pointer');
renderer.removeStyle(element, 'cursor');
renderer.setAttribute(element, 'aria-invalid', 'true');
renderer.removeAttribute(element, 'aria-invalid');
renderer.setProperty(element, 'disabled', true);
```

Phân biệt:

```text
setAttribute
- Thay đổi HTML attribute.
- Giá trị thường là string.
- Phù hợp với aria-*, role, data-*.

setProperty
- Thay đổi property của DOM object.
- Có thể là boolean, number hoặc object.
- Phù hợp với disabled, value, checked.
```

Ví dụ:

```ts
renderer.setAttribute(button, 'aria-disabled', 'true');
renderer.setProperty(button, 'disabled', true);
```

`aria-disabled` giúp công cụ hỗ trợ hiểu trạng thái. Property `disabled` thực sự vô hiệu hóa button.

### 2.7. Lắng nghe event từ host

Directive thường cần phản ứng khi host phát event như `click`, `mouseenter`, `input` hoặc `keydown`.

`@HostListener()` là method decorator dùng để khai báo:

> Khi event xác định xảy ra trên host element, Angular sẽ gọi method này của directive.

Cú pháp:

```ts
@HostListener(eventName, args?)
methodName(...args): void {
  // Xử lý event
}
```

Trong đó:

```text
eventName
→ Tên event cần lắng nghe, ví dụ click hoặc mouseenter.

args
→ Danh sách dữ liệu Angular lấy từ event rồi truyền vào method.

methodName
→ Method được Angular gọi khi event xảy ra.
```

Ví dụ hover:

```ts
import { Directive, HostListener } from '@angular/core';

@Directive({
  selector: '[appHoverable]',
  standalone: false
})
export class HoverableDirective {
  isHovered = false;

  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.isHovered = true;
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.isHovered = false;
  }
}
```

Với mỗi instance `HoverableDirective`, Angular đăng ký các listener tương ứng trên host của instance đó:

```text
Host phát mouseenter
        ↓
Angular gọi onMouseEnter()
        ↓
isHovered = true
```

Không cần tự gọi `addEventListener()` và cũng không cần tự gỡ listener này trong `ngOnDestroy`; Angular quản lý listener đã được khai báo bằng `@HostListener()` theo vòng đời của directive.

Mặc định method không nhận event object. Muốn nhận event, truyền `'$event'` trong tham số thứ hai của decorator:

```ts
@HostListener('click', ['$event'])
onClick(event: MouseEvent): void {
  console.log(event.target);
}
```

Luồng truyền dữ liệu:

```text
Browser tạo MouseEvent
        ↓
Angular nhận event
        ↓
'$event' yêu cầu truyền toàn bộ event object
        ↓
onClick(event) được gọi
```

Có thể lấy một phần dữ liệu từ event:

```ts
@HostListener('input', ['$event.target.value'])
onInput(value: string): void {
  console.log(value);
}
```

`@HostListener()` mặc định nghe trên host. Tiền tố `document:`, `window:` hoặc `body:` dùng để nghe event toàn cục:

```ts
@HostListener('document:keydown.escape')
onEscape(): void {
  // Xử lý Escape
}
```

Trong `document:keydown.escape`:

```text
document:
→ Nguồn phát event.

keydown
→ Tên event.

.escape
→ Chỉ phản ứng với phím Escape.
```

Chỉ dùng global listener khi hành vi thật sự cần nó. Mỗi instance directive có thể tạo một global listener riêng, vì vậy cần cân nhắc nếu directive xuất hiện nhiều lần trong một danh sách.

### 2.8. HostBinding và đồng bộ state lên host

Directive có state nội bộ:

```ts
isHovered = false;
```

Nếu muốn state này tự động thay đổi class, style, attribute hoặc property của host, có thể dùng `@HostBinding()`.

`@HostBinding()` là property decorator dùng để khai báo:

> Giá trị của property hoặc getter trong directive sẽ được Angular binding lên một phần cụ thể của host element.

Cú pháp:

```ts
@HostBinding(hostPropertyName)
directiveProperty = value;
```

Ví dụ:

```ts
import {
  Directive,
  HostBinding,
  HostListener
} from '@angular/core';

@Directive({
  selector: '[appHoverable]',
  standalone: false
})
export class HoverableDirective {
  @HostBinding('class.app-hoverable')
  readonly hoverable = true;

  @HostBinding('class.app-hoverable--active')
  isHovered = false;

  @HostBinding('attr.aria-expanded')
  get ariaExpanded(): string {
    return String(this.isHovered);
  }

  @HostListener('mouseenter')
  onMouseEnter(): void {
    this.isHovered = true;
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    this.isHovered = false;
  }
}
```

Có thể đọc các binding trên như sau:

```text
hoverable = true
→ Host luôn có class app-hoverable.

isHovered = false
→ Host chưa có class app-hoverable--active.

isHovered = true
→ Angular thêm class app-hoverable--active.

ariaExpanded
→ Giá trị getter được gán vào attribute aria-expanded.
```

Khi `onMouseEnter()` thay đổi `isHovered`, Angular cập nhật các host binding trong change detection tiếp theo. Directive không cần tự gọi `classList.add()` hoặc `setAttribute()`.

Một số dạng binding thường gặp:

```ts
@HostBinding('class.active')
active = false;

@HostBinding('style.width.px')
width = 200;

@HostBinding('attr.aria-busy')
ariaBusy = 'false';

@HostBinding('tabIndex')
tabIndex = 0;
```

Phân biệt:

```text
class.active
→ Thêm hoặc bỏ một CSS class.

style.width.px
→ Gán style và tự thêm đơn vị px.

attr.aria-busy
→ Gán HTML attribute.

tabIndex
→ Gán DOM property.
```

#### Cách viết bằng host metadata

Các `@HostBinding()` và `@HostListener()` trên có thể viết tập trung trong `host` metadata:

```ts
import { Directive } from '@angular/core';

@Directive({
  selector: '[appHoverable]',
  standalone: false,
  host: {
    '[class.app-hoverable]': 'true',
    '[class.app-hoverable--active]': 'isHovered',
    '[attr.aria-expanded]': 'isHovered',
    '(mouseenter)': 'onMouseEnter()',
    '(mouseleave)': 'onMouseLeave()'
  }
})
export class HoverableDirective {
  isHovered = false;

  onMouseEnter(): void {
    this.isHovered = true;
  }

  onMouseLeave(): void {
    this.isHovered = false;
  }
}
```

Có thể đọc `host` metadata giống binding trong template:

```text
[class.app-hoverable]          → luôn thêm class app-hoverable
[class.app-hoverable--active]  → thêm class khi isHovered = true
[attr.aria-expanded]           → gán attribute theo isHovered
(mouseenter)                   → gọi onMouseEnter()
(mouseleave)                   → gọi onMouseLeave()
```

Hai cách có cùng mục đích:

```text
@HostBinding / @HostListener
→ Đặt decorator ngay cạnh property hoặc method liên quan.

host metadata
→ Gom toàn bộ contract với host trong @Directive().
```

Với code mới, `host` metadata thường dễ review hơn vì class, attribute và event của host nằm cùng một nơi. `@HostBinding()` và `@HostListener()` vẫn cần hiểu rõ vì chúng xuất hiện phổ biến trong các codebase Angular.

### 2.9. Phản ứng khi input thay đổi

Angular có thể cập nhật input nhiều lần trong vòng đời directive:

```html
<input [appHighlight]="control.invalid && control.touched" />
```

Khi trạng thái control thay đổi, Angular gán lại input.

Có hai cách phổ biến để phản ứng.

#### Input setter

```ts
private active = false;

@Input('appHighlight')
set highlight(value: boolean) {
  this.active = value;
  this.updateHost();
}
```

Phù hợp khi mỗi input có logic xử lý riêng và tương đối đơn giản.

#### ngOnChanges

```ts
export class HighlightDirective implements OnChanges {
  @Input('appHighlight') invalid = false;
  @Input() touched = false;

  ngOnChanges(): void {
    this.updateHost();
  }
}
```

Phù hợp khi kết quả phụ thuộc nhiều input.

Ví dụ hoàn chỉnh:

```ts
import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  Renderer2
} from '@angular/core';

@Directive({
  selector: '[appHighlightInvalid]',
  standalone: false
})
export class HighlightInvalidDirective implements OnChanges {
  @Input('appHighlightInvalid') invalid = false;
  @Input() touched = false;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2
  ) {}

  ngOnChanges(): void {
    const shouldHighlight = this.invalid && this.touched;
    const host = this.elementRef.nativeElement;

    if (shouldHighlight) {
      this.renderer.addClass(host, 'app-invalid-field');
      this.renderer.setAttribute(host, 'aria-invalid', 'true');
      return;
    }

    this.renderer.removeClass(host, 'app-invalid-field');
    this.renderer.setAttribute(host, 'aria-invalid', 'false');
  }
}
```

Sử dụng với Reactive Forms:

```html
<input
  formControlName="patientName"
  [appHighlightInvalid]="patientNameControl.invalid"
  [touched]="patientNameControl.touched"
/>
```

Điểm quan trọng:

```text
Directive không tự quyết định FormControl nào invalid.
Component/template truyền state vào directive.
Directive chỉ chuyển state đó thành biểu hiện trên host.
```

### 2.10. Phát sự kiện bằng output

Directive có thể emit một sự kiện semantic cho component.

Ví dụ confirm action:

```ts
import {
  Directive,
  EventEmitter,
  HostListener,
  Input,
  Output
} from '@angular/core';

@Directive({
  selector: 'button[appConfirmAction]',
  standalone: false
})
export class ConfirmActionDirective {
  @Input('appConfirmAction') message = 'Bạn có chắc muốn tiếp tục?';
  @Output() confirmed = new EventEmitter<void>();

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    event.preventDefault();

    const accepted = window.confirm(this.message);

    if (accepted) {
      this.confirmed.emit();
    }
  }
}
```

Sử dụng:

```html
<button
  type="button"
  [appConfirmAction]="'Xóa hồ sơ ' + patient.name + '?'"
  (confirmed)="deletePatient(patient.id)"
>
  Xóa
</button>
```

Luồng trách nhiệm:

```text
Người dùng click button
        ↓
Directive hỏi xác nhận
        ↓
Người dùng đồng ý
        ↓
Directive emit confirmed
        ↓
Component gọi deletePatient(id)
        ↓
Service gọi API
```

Directive không biết `patient.id`, không tự gọi API và không quản lý loading.

Trong ứng dụng thật, có thể inject dialog service thay cho `window.confirm`:

```ts
constructor(
  private readonly confirmDialog: ConfirmDialogService
) {}
```

Nhưng boundary vẫn giữ nguyên: directive quản lý interaction confirm, component sở hữu nghiệp vụ.

### 2.11. Event propagation

Các API thường gặp:

```ts
event.preventDefault();
event.stopPropagation();
event.stopImmediatePropagation();
```

Ý nghĩa:

```text
preventDefault()
→ Chặn hành vi mặc định của browser.

stopPropagation()
→ Chặn event bubble lên parent.

stopImmediatePropagation()
→ Chặn cả listener khác trên cùng element.
```

Không nên chặn propagation chỉ để “cho chắc”. Ví dụ một directive tracking click khác có thể cần nhận cùng event.

Thiết kế an toàn hơn là consumer chỉ sử dụng output semantic:

```html
<button
  [appConfirmAction]="message"
  (confirmed)="deleteItem()"
>
  Xóa
</button>
```

Tránh gắn đồng thời cả `(click)` và `(confirmed)` cho cùng một action nếu không có mục đích rõ ràng.

---

## 3. Các attribute directive thường gặp

Phần này áp dụng các khái niệm trên vào những bài toán thường gặp.

### 3.1. Tự động focus

Bài toán: tự focus một input khi màn hình hoặc modal được render.

Phiên bản cơ bản:

```ts
import {
  AfterViewInit,
  Directive,
  ElementRef
} from '@angular/core';

@Directive({
  selector: '[appAutoFocus]',
  standalone: false
})
export class AutoFocusDirective implements AfterViewInit {
  constructor(
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngAfterViewInit(): void {
    this.elementRef.nativeElement.focus();
  }
}
```

Sử dụng:

```html
<input appAutoFocus />
```

Tại sao không focus trong constructor?

```text
Constructor
- Dùng để inject dependency.
- Host có thể chưa hoàn tất quá trình render.

ngAfterViewInit
- View đã được khởi tạo.
- Phù hợp hơn cho thao tác focus.
```

Phiên bản có điều kiện và delay:

```ts
import {
  AfterViewInit,
  booleanAttribute,
  Directive,
  ElementRef,
  Input,
  numberAttribute,
  OnDestroy
} from '@angular/core';

@Directive({
  selector: '[appAutoFocus]',
  standalone: false
})
export class AutoFocusDirective implements AfterViewInit, OnDestroy {
  @Input({ alias: 'appAutoFocus', transform: booleanAttribute })
  enabled = true;

  @Input({ transform: numberAttribute })
  autoFocusDelay = 0;

  private timerId?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  ngAfterViewInit(): void {
    if (!this.enabled) {
      return;
    }

    this.timerId = setTimeout(() => {
      this.elementRef.nativeElement.focus();
    }, this.autoFocusDelay);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
  }
}
```

Sử dụng:

```html
<input
  [appAutoFocus]="isDialogOpened"
  [autoFocusDelay]="100"
/>
```

Delay chỉ nên dùng khi thực sự cần chờ animation hoặc thư viện modal hoàn tất render. Không dùng delay như một cách che giấu lỗi lifecycle.

### 3.2. Khóa element khi đang xử lý

Bài toán: ngăn người dùng click lặp khi một thao tác đang xử lý.

```ts
import {
  booleanAttribute,
  Directive,
  Input
} from '@angular/core';

@Directive({
  selector: 'button[appDisableWhileProcessing]',
  standalone: false,
  host: {
    '[disabled]': 'processing',
    '[attr.aria-busy]': 'processing',
    '[class.is-processing]': 'processing'
  }
})
export class DisableWhileProcessingDirective {
  @Input({
    alias: 'appDisableWhileProcessing',
    transform: booleanAttribute
  })
  processing = false;
}
```

Sử dụng:

```html
<button
  type="button"
  [appDisableWhileProcessing]="isSaving"
  (click)="save()"
>
  Lưu
</button>
```

Directive này không tự tạo loading state. Component vẫn là nguồn sự thật:

```ts
isSaving = false;
```

```text
Component quản lý processing state
        ↓
Truyền state vào directive
        ↓
Directive phản ánh state lên host
```

### 3.3. Giới hạn dữ liệu nhập dạng số

Bài toán: chỉ cho phép nhập chữ số.

Không nên chỉ dùng `keydown`, vì người dùng còn có thể:

```text
- Paste bằng chuột.
- Nhập từ mobile keyboard.
- Dùng speech input.
- Kéo thả text.
- Sử dụng input method khác.
```

Một cách xử lý dựa trên event `input`:

```ts
import {
  Directive,
  ElementRef,
  HostListener,
  Input
} from '@angular/core';

@Directive({
  selector: 'input[appNumericInput]',
  standalone: false
})
export class NumericInputDirective {
  @Input() allowDecimal = false;

  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>
  ) {}

  @HostListener('input')
  onInput(): void {
    const input = this.elementRef.nativeElement;
    const normalized = this.normalize(input.value);

    if (normalized === input.value) {
      return;
    }

    input.value = normalized;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private normalize(value: string): string {
    if (!this.allowDecimal) {
      return value.replace(/\D+/g, '');
    }

    const sanitized = value.replace(/[^\d.]+/g, '');
    const [integerPart, ...decimalParts] = sanitized.split('.');

    return decimalParts.length > 0
      ? `${integerPart}.${decimalParts.join('')}`
      : integerPart;
  }
}
```

Sử dụng:

```html
<input
  appNumericInput
  [allowDecimal]="true"
  formControlName="amount"
/>
```

Lưu ý:

```text
Numeric input directive chỉ hỗ trợ trải nghiệm nhập liệu.
Nó không thay thế validation.
```

Form vẫn nên có validator phù hợp:

```ts
amount: new FormControl<number | null>(null, [
  Validators.required,
  Validators.min(0)
])
```

### 3.4. Phát hiện click bên ngoài

Bài toán: đóng dropdown khi người dùng click ra bên ngoài.

```ts
import {
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  Output
} from '@angular/core';

@Directive({
  selector: '[appClickOutside]',
  standalone: false
})
export class ClickOutsideDirective {
  @Output() appClickOutside = new EventEmitter<void>();

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  @HostListener('document:click', ['$event.target'])
  onDocumentClick(target: EventTarget | null): void {
    if (!(target instanceof Node)) {
      return;
    }

    const clickedInside = this.elementRef.nativeElement.contains(target);

    if (!clickedInside) {
      this.appClickOutside.emit();
    }
  }
}
```

Sử dụng:

```html
<div
  class="dropdown"
  (appClickOutside)="closeDropdown()"
>
  ...
</div>
```

Nếu có hàng trăm instance, mỗi instance đều nghe `document:click`. Khi đó nên cân nhắc một service hoặc event manager dùng chung thay vì tạo quá nhiều global listener.

---

## 4. Structural directive

Attribute directive làm việc trên một host đã tồn tại. Structural directive khác ở chỗ nó quản lý **một khối template có được tạo thành view và đưa vào DOM hay không**.

### 4.1. Từ `*ngIf` đến `ng-template`

Template quen thuộc:

```html
<p *ngIf="patient.isActive">
  Đang hoạt động
</p>
```

Dấu `*` là cú pháp rút gọn. Angular hiểu gần tương đương:

```html
<ng-template [ngIf]="patient.isActive">
  <p>Đang hoạt động</p>
</ng-template>
```

Điểm quan trọng:

```text
<p> không luôn tồn tại trong DOM rồi bị ẩn bằng CSS.

Khi điều kiện false:
- View có thể không được tạo hoặc bị remove.

Khi điều kiện true:
- Angular tạo một embedded view từ ng-template.
- View được chèn vào vị trí tương ứng.
```

### 4.2. TemplateRef là gì?

`TemplateRef` đại diện cho một khối template chưa được render.

Có thể hình dung:

```text
TemplateRef
= bản thiết kế của một khối UI
= blueprint
= chưa phải DOM element thật
```

Ví dụ:

```html
<ng-template #loadingTemplate>
  <p>Đang tải dữ liệu...</p>
</ng-template>
```

`loadingTemplate` chưa xuất hiện trên DOM chỉ vì nó được khai báo. Angular chỉ render khi có lệnh tạo view từ template đó.

### 4.3. ViewContainerRef là gì?

`ViewContainerRef` đại diện cho một vị trí Angular có thể:

```text
- Chèn view.
- Xóa view.
- Di chuyển view.
- Truy cập các view đang chứa.
```

Có thể hình dung:

```text
TemplateRef       = bản thiết kế
ViewContainerRef  = vị trí đặt bản render
EmbeddedView      = kết quả được tạo từ bản thiết kế
```

Luồng:

```text
TemplateRef
    ↓ createEmbeddedView
Embedded View
    ↓ insert into
ViewContainerRef
    ↓
DOM
```

### 4.4. Ví dụ cơ bản

Bài toán: render nội dung khi điều kiện true.

```ts
import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';

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

Sử dụng:

```html
<p *appShow="patient.isActive">
  Đang hoạt động
</p>
```

Angular hiểu gần giống:

```html
<ng-template [appShow]="patient.isActive">
  <p>Đang hoạt động</p>
</ng-template>
```

Constructor nhận được `TemplateRef` vì directive thực tế được gắn trên `ng-template` sau khi Angular desugar cú pháp `*`.

Biến `hasView` giúp tránh tạo view lặp:

```text
condition vẫn true
→ Không gọi createEmbeddedView thêm lần nữa.

condition vẫn false
→ Không clear container không cần thiết.
```

Nếu bỏ kiểm tra trạng thái, directive có thể tạo nhiều bản view giống nhau hoặc gây DOM churn.

### 4.5. Vì sao một element chỉ có một `*`

Đoạn sau không hợp lệ:

```html
<li
  *ngFor="let item of items"
  *ngIf="item.visible"
>
  {{ item.name }}
</li>
```

Mỗi dấu `*` muốn chuyển element thành một `ng-template` riêng. Angular không biết directive nào sở hữu template bên ngoài và directive nào nằm bên trong.

Cách đúng:

```html
<ng-container *ngFor="let item of items">
  <li *ngIf="item.visible">
    {{ item.name }}
  </li>
</ng-container>
```

`ng-container` chỉ nhóm template, không tạo DOM element thật.

Với built-in control flow:

```html
@for (item of items; track item.id) {
  @if (item.visible) {
    <li>{{ item.name }}</li>
  }
}
```

### 4.6. Kiểm tra quyền hiển thị

Bài toán: chỉ render action khi người dùng có permission.

Permission service:

```ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly permissions = new Set<string>([
    'Patients.View',
    'Patients.Update'
  ]);

  has(permission: string): boolean {
    return this.permissions.has(permission);
  }
}
```

Directive:

```ts
import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';
import { PermissionService } from './permission.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: false
})
export class HasPermissionDirective {
  private hasView = false;

  constructor(
    private readonly templateRef: TemplateRef<unknown>,
    private readonly viewContainer: ViewContainerRef,
    private readonly permissionService: PermissionService
  ) {}

  @Input()
  set appHasPermission(permission: string) {
    const allowed = this.permissionService.has(permission);
    this.updateView(allowed);
  }

  private updateView(allowed: boolean): void {
    if (allowed && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
      return;
    }

    if (!allowed && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
```

Sử dụng:

```html
<button
  *appHasPermission="'Patients.Delete'"
  type="button"
>
  Xóa bệnh nhân
</button>
```

Luồng:

```text
Angular lấy template của button
        ↓
Truyền permission vào directive
        ↓
Directive hỏi PermissionService
        ↓
Có quyền  → createEmbeddedView()
Không có  → clear()
```

Lưu ý bảo mật:

```text
Ẩn button bằng directive chỉ là kiểm soát UI.
Backend vẫn phải kiểm tra quyền khi xử lý request.
```

Người dùng có thể gọi API trực tiếp mà không đi qua giao diện.

### 4.7. Template thay thế

Mở rộng directive để hỗ trợ nội dung thay thế:

```ts
import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';

@Directive({
  selector: '[appHasPermission]',
  standalone: false
})
export class HasPermissionDirective {
  @Input('appHasPermission') permission = '';
  @Input() appHasPermissionElse?: TemplateRef<unknown>;

  constructor(
    private readonly templateRef: TemplateRef<unknown>,
    private readonly viewContainer: ViewContainerRef,
    private readonly permissionService: PermissionService
  ) {}

  ngOnChanges(): void {
    this.viewContainer.clear();

    const allowed = this.permissionService.has(this.permission);
    const selectedTemplate = allowed
      ? this.templateRef
      : this.appHasPermissionElse;

    if (selectedTemplate) {
      this.viewContainer.createEmbeddedView(selectedTemplate);
    }
  }
}
```

Sử dụng dạng đầy đủ để dễ hiểu:

```html
<ng-template
  [appHasPermission]="'Patients.Delete'"
  [appHasPermissionElse]="noPermission"
>
  <button type="button">Xóa</button>
</ng-template>

<ng-template #noPermission>
  <span>Bạn không có quyền thực hiện thao tác này.</span>
</ng-template>
```

### 4.8. Context của template và `let-`

Structural directive có thể truyền dữ liệu vào embedded view.

Ví dụ directive lặp một số lần:

```ts
interface RepeatContext {
  $implicit: number;
  index: number;
}

@Directive({
  selector: '[appRepeat]',
  standalone: false
})
export class RepeatDirective {
  constructor(
    private readonly templateRef: TemplateRef<RepeatContext>,
    private readonly viewContainer: ViewContainerRef
  ) {}

  @Input()
  set appRepeat(count: number) {
    this.viewContainer.clear();

    for (let index = 0; index < count; index++) {
      this.viewContainer.createEmbeddedView(this.templateRef, {
        $implicit: index + 1,
        index
      });
    }
  }
}
```

Sử dụng:

```html
<div *appRepeat="3; let number; let i = index">
  Lần {{ number }}, index {{ i }}
</div>
```

Ý nghĩa:

```text
$implicit
→ Được lấy bằng `let number`.

index
→ Được lấy bằng `let i = index`.
```

Kết quả:

```text
Lần 1, index 0
Lần 2, index 1
Lần 3, index 2
```

### 4.9. Template type guard

Để Angular template type checking hiểu context, directive có thể khai báo guard:

```ts
static ngTemplateContextGuard(
  directive: RepeatDirective,
  context: unknown
): context is RepeatContext {
  return true;
}
```

Đây là contract cho compiler, không phải validation runtime.

### 4.10. Khi nào nên tự viết Structural Directive?

Phù hợp:

```text
- Permission.
- Feature flag.
- Role-based rendering.
- Deferred rendering theo domain rule.
- Template outlet có context đặc thù.
```

Không nên tự viết:

```text
- appIf chỉ để thay tên ngIf.
- appLoop chỉ để thay ngFor.
- Directive khiến template khó đọc hơn built-in control flow.
```

Với điều kiện và vòng lặp thông thường, ưu tiên `@if` và `@for` hoặc các directive built-in sẵn có.

---

## 5. Tích hợp với Angular Forms

Directive xuất hiện rất nhiều trên input, nhưng không phải mọi directive gắn trên input đều là form control.

Cần phân biệt ba bài toán:

```text
Thay đổi giao diện hoặc interaction của input
→ Attribute Directive

Bổ sung quy tắc validation
→ Validator Directive

Tạo một control UI tùy chỉnh tương thích formControlName
→ Component + ControlValueAccessor
```

### 5.1. DOM value và FormControl value là hai nguồn trạng thái

Giả sử directive sửa trực tiếp:

```ts
input.value = input.value.trim();
```

Điều này chắc chắn thay đổi giá trị hiển thị trên DOM. Nhưng Angular Forms còn có model riêng:

```text
DOM input.value
        ↕
Angular FormControl.value
```

Hai giá trị cần được đồng bộ thông qua value accessor và event thích hợp.

Một directive chỉ đổi DOM mà không thông báo cho Angular Forms có thể tạo tình trạng:

```text
Input đang hiển thị: "Nguyen Van A"
FormControl vẫn giữ: "  Nguyen Van A  "
```

### 5.2. Trim On Blur Directive

Phiên bản chỉ thao tác DOM:

```ts
@Directive({
  selector: 'input[appTrimOnBlur]',
  standalone: false
})
export class TrimOnBlurDirective {
  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>
  ) {}

  @HostListener('blur')
  onBlur(): void {
    const input = this.elementRef.nativeElement;
    input.value = input.value.trim();
  }
}
```

Phiên bản đồng bộ với Angular Forms bằng `NgControl`:

```ts
import {
  Directive,
  ElementRef,
  HostListener,
  Optional,
  Self
} from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'input[appTrimOnBlur]',
  standalone: false
})
export class TrimOnBlurDirective {
  constructor(
    private readonly elementRef: ElementRef<HTMLInputElement>,
    @Optional() @Self() private readonly ngControl: NgControl | null
  ) {}

  @HostListener('blur')
  onBlur(): void {
    const input = this.elementRef.nativeElement;
    const trimmedValue = input.value.trim();

    if (trimmedValue === input.value) {
      return;
    }

    input.value = trimmedValue;
    this.ngControl?.control?.setValue(trimmedValue);
    this.ngControl?.control?.markAsTouched();
  }
}
```

`@Self()` yêu cầu Angular chỉ tìm `NgControl` trên chính host hiện tại.

`@Optional()` cho phép directive vẫn hoạt động khi input không thuộc Angular Form.

Cần quyết định rõ `setValue` có phát event hay không:

```ts
control.setValue(trimmedValue, { emitEvent: true });
```

Nếu trim kích hoạt logic phụ thuộc `valueChanges`, việc emit là hợp lý. Nếu đang trong một luồng đặc biệt cần tránh gọi lại, có thể dùng `emitEvent: false`, nhưng phải hiểu trade-off.

### 5.3. Validator directive

Validator directive bổ sung một rule validation vào Angular Forms.

Ví dụ kiểm tra tuổi tối thiểu:

```ts
import { Directive, Input, numberAttribute } from '@angular/core';
import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator
} from '@angular/forms';

@Directive({
  selector: '[appMinimumAge]',
  standalone: false,
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: MinimumAgeDirective,
      multi: true
    }
  ]
})
export class MinimumAgeDirective implements Validator {
  @Input({ alias: 'appMinimumAge', transform: numberAttribute })
  minimumAge = 18;

  validate(control: AbstractControl): ValidationErrors | null {
    const age = Number(control.value);

    if (control.value === null || control.value === '') {
      return null;
    }

    if (!Number.isFinite(age)) {
      return {
        minimumAge: {
          requiredAge: this.minimumAge,
          actualAge: control.value,
          reason: 'not-a-number'
        }
      };
    }

    if (age >= this.minimumAge) {
      return null;
    }

    return {
      minimumAge: {
        requiredAge: this.minimumAge,
        actualAge: age
      }
    };
  }
}
```

Sử dụng với template-driven form:

```html
<input
  name="age"
  ngModel
  [appMinimumAge]="18"
  #ageModel="ngModel"
/>

@if (ageModel.errors?.['minimumAge']) {
  <p>Tuổi phải từ 18 trở lên.</p>
}
```

### 5.4. NG_VALIDATORS và multi-provider

Angular Forms cần thu thập nhiều validator cho một control:

```text
required
minimumAge
pattern
custom business rule
```

`NG_VALIDATORS` là DI token đại diện cho danh sách các synchronous validator.

```ts
providers: [
  {
    provide: NG_VALIDATORS,
    useExisting: MinimumAgeDirective,
    multi: true
  }
]
```

Có thể đọc như sau:

```text
provide: NG_VALIDATORS
→ Đăng ký với hệ thống validator của Angular Forms.

useExisting: MinimumAgeDirective
→ Sử dụng chính instance directive hiện tại làm validator.

multi: true
→ Thêm directive vào danh sách validator.
→ Không ghi đè các validator khác.
```

Thiếu `multi: true` có thể làm hỏng cơ chế multi-provider.

### 5.5. Input validator thay đổi và registerOnValidatorChange

Nếu `minimumAge` có thể thay đổi runtime:

```html
<input [appMinimumAge]="ageRequirement" />
```

Angular Forms cần biết rule đã thay đổi để validate lại.

```ts
export class MinimumAgeDirective implements Validator {
  private onValidatorChange?: () => void;
  private requiredAge = 18;

  @Input({ alias: 'appMinimumAge', transform: numberAttribute })
  set minimumAge(value: number) {
    this.requiredAge = value;
    this.onValidatorChange?.();
  }

  validate(control: AbstractControl): ValidationErrors | null {
    // Validation sử dụng this.requiredAge
    return null;
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }
}
```

Luồng:

```text
Input minimumAge thay đổi
        ↓
Directive gọi onValidatorChange()
        ↓
Angular Forms chạy validate lại
```

### 5.6. Async validator directive

Ví dụ kiểm tra username đã tồn tại:

```ts
import { Directive, inject } from '@angular/core';
import {
  AbstractControl,
  AsyncValidator,
  NG_ASYNC_VALIDATORS,
  ValidationErrors
} from '@angular/forms';
import { catchError, map, Observable, of } from 'rxjs';

@Directive({
  selector: '[appUsernameAvailable]',
  standalone: false,
  providers: [
    {
      provide: NG_ASYNC_VALIDATORS,
      useExisting: UsernameAvailableDirective,
      multi: true
    }
  ]
})
export class UsernameAvailableDirective implements AsyncValidator {
  private readonly userService = inject(UserService);

  validate(
    control: AbstractControl
  ): Observable<ValidationErrors | null> {
    const username = String(control.value ?? '').trim();

    if (!username) {
      return of(null);
    }

    return this.userService.exists(username).pipe(
      map(exists => exists ? { usernameTaken: true } : null),
      catchError(() => of(null))
    );
  }
}
```

Async validator cần lưu ý:

```text
- Không gọi API nếu value rỗng hoặc chưa đủ điều kiện.
- FormControl nên debounce ở luồng phù hợp nếu API tốn kém.
- Phải xác định cách xử lý lỗi mạng.
- Backend vẫn phải kiểm tra trùng lặp khi submit.
```

### 5.7. Cross-field validator directive

Một validator có thể gắn trên `FormGroup` để so sánh nhiều field.

Ví dụ password và confirm password:

```ts
import { Directive } from '@angular/core';
import {
  AbstractControl,
  NG_VALIDATORS,
  ValidationErrors,
  Validator
} from '@angular/forms';

@Directive({
  selector: '[appPasswordMatch]',
  standalone: false,
  providers: [
    {
      provide: NG_VALIDATORS,
      useExisting: PasswordMatchDirective,
      multi: true
    }
  ]
})
export class PasswordMatchDirective implements Validator {
  validate(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (!password || !confirmPassword) {
      return null;
    }

    return password === confirmPassword
      ? null
      : { passwordMismatch: true };
  }
}
```

Sử dụng:

```html
<form
  [formGroup]="form"
  appPasswordMatch
>
  <input type="password" formControlName="password" />
  <input type="password" formControlName="confirmPassword" />
</form>
```

Validation error thuộc `FormGroup`, không mặc định thuộc riêng field nào:

```ts
form.errors?.['passwordMismatch']
```

### 5.8. Khi nào cần ControlValueAccessor?

Directive không phải lựa chọn phù hợp nếu cần tạo một form control UI hoàn chỉnh như:

```text
- Date picker riêng.
- Select có modal tìm kiếm.
- Upload control.
- Multi-select phức tạp.
- Composite input gồm nhiều field.
```

Khi control phải:

```text
- Nhận value từ FormControl.
- Báo value mới về FormControl.
- Báo touched.
- Nhận disabled state.
```

thì cần `ControlValueAccessor`, thường được cài đặt trong một component có template riêng.

---

## 6. Lifecycle, dependency injection và cleanup

Directive có lifecycle gắn với host element.

### 6.1. Luồng lifecycle cơ bản

```text
Angular tạo directive instance
        ↓
Inject dependency
        ↓
Gán input đầu tiên
        ↓
ngOnChanges
        ↓
ngOnInit
        ↓
View hoàn tất khởi tạo
        ↓
ngAfterViewInit
        ↓
Input có thể tiếp tục thay đổi
        ↓
Host bị destroy
        ↓
ngOnDestroy
```

Không phải directive nào cũng cần tất cả hook.

| Nhu cầu | Hook phù hợp |
| --- | --- |
| Phản ứng khi input đổi | Input setter hoặc `ngOnChanges` |
| Khởi tạo một lần sau input đầu tiên | `ngOnInit` |
| Focus hoặc đo host sau khi view render | `ngAfterViewInit` |
| Dọn listener, timer, observer, subscription | `ngOnDestroy` |

### 6.2. Constructor không phải lifecycle hook

Constructor chủ yếu dùng cho dependency injection:

```ts
constructor(
  private readonly elementRef: ElementRef<HTMLElement>,
  private readonly renderer: Renderer2
) {}
```

Không nên đặt logic phụ thuộc input trong constructor vì input chưa được Angular gán.

```ts
constructor() {
  console.log(this.someInput); // Có thể vẫn là default value.
}
```

### 6.3. Cleanup tài nguyên

Nếu directive tạo resource tồn tại bên ngoài vòng đời Angular, nó phải dọn resource khi host bị destroy.

Ví dụ listener thủ công:

```ts
@Directive({
  selector: '[appWindowResize]',
  standalone: false
})
export class WindowResizeDirective implements OnInit, OnDestroy {
  private listener?: () => void;

  ngOnInit(): void {
    this.listener = () => {
      console.log(window.innerWidth);
    };

    window.addEventListener('resize', this.listener);
  }

  ngOnDestroy(): void {
    if (this.listener) {
      window.removeEventListener('resize', this.listener);
    }
  }
}
```

Quên cleanup có thể dẫn tới:

```text
- Memory leak.
- Callback chạy sau khi component đã bị destroy.
- Logic bị thực thi nhiều lần khi màn hình mở lại.
- Giữ tham chiếu tới DOM element không còn sử dụng.
```

### 6.4. Renderer2.listen và hàm teardown

```ts
export class EscapeKeyDirective implements OnInit, OnDestroy {
  private unlisten?: () => void;

  constructor(
    private readonly renderer: Renderer2
  ) {}

  ngOnInit(): void {
    this.unlisten = this.renderer.listen(
      'document',
      'keydown',
      (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          // Xử lý
        }
      }
    );
  }

  ngOnDestroy(): void {
    this.unlisten?.();
  }
}
```

`renderer.listen()` trả về một hàm teardown. Directive cần gọi hàm đó trong `ngOnDestroy`.

### 6.5. Subscription và takeUntilDestroyed

```ts
import {
  DestroyRef,
  Directive,
  inject
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Directive({
  selector: '[appObserveState]',
  standalone: false
})
export class ObserveStateDirective {
  private readonly destroyRef = inject(DestroyRef);
  private readonly stateService = inject(StateService);

  constructor() {
    this.stateService.state$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        // Cập nhật hành vi directive
      });
  }
}
```

Điểm cốt lõi không phải bắt buộc dùng đúng một kỹ thuật cleanup. Điểm cốt lõi là resource phải kết thúc cùng vòng đời directive.

### 6.6. Theo dõi viewport bằng IntersectionObserver

Bài toán: phát sự kiện khi element vào hoặc rời viewport.

```ts
import {
  Directive,
  ElementRef,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  Output
} from '@angular/core';

@Directive({
  selector: '[appInViewport]',
  standalone: false
})
export class InViewportDirective implements OnInit, OnDestroy {
  @Output() appInViewport = new EventEmitter<boolean>();

  private observer?: IntersectionObserver;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) {}

  ngOnInit(): void {
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        const visible = entries[0]?.isIntersecting ?? false;

        this.zone.run(() => {
          this.appInViewport.emit(visible);
        });
      });

      this.observer.observe(this.elementRef.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
```

Tại sao có `runOutsideAngular()`?

```text
IntersectionObserver có thể callback nhiều lần.
Nếu mọi callback đều khiến Angular kiểm tra toàn bộ UI,
có thể tạo change detection không cần thiết.
```

Khi cần emit event để component cập nhật giao diện, directive quay lại Angular zone bằng `zone.run()`.

Không phải directive nào cũng cần tối ưu theo cách này. Chỉ dùng khi event tần suất cao hoặc đã đo được vấn đề hiệu năng.

### 6.7. Inject service vào directive

Directive tham gia hệ thống DI giống component và service.

```ts
@Directive({
  selector: '[appTrackClick]',
  standalone: false
})
export class TrackClickDirective {
  constructor(
    private readonly analytics: AnalyticsService
  ) {}

  @HostListener('click')
  onClick(): void {
    this.analytics.track('element_clicked');
  }
}
```

Cần tránh inject quá nhiều service nghiệp vụ vào directive. Nếu directive cần biết hàng loạt thông tin màn hình, gọi nhiều API và điều phối nhiều action, boundary có thể đang sai.

---

## 7. Composition và thiết kế public API

Một directive tốt không chỉ chạy đúng. Nó cần có public API dễ hiểu trong template.

### 7.1. Một directive nên có một trách nhiệm chính

Tốt:

```text
appAutoFocus
appClickOutside
appHighlightInvalid
```

Không tốt:

```text
appInputBehavior
- trim
- uppercase
- numeric
- validate
- track analytics
- auto focus
```

Một directive quá nhiều hành vi tạo ra nhiều input khó hiểu và coupling cao.

Có thể compose các directive độc lập:

```html
<input
  appAutoFocus
  appTrimOnBlur
  appNumericInput
/>
```

Nhưng nếu các directive phụ thuộc thứ tự thực thi của nhau, cần xem lại thiết kế. Angular không nên bị sử dụng như một hệ thống pipeline ngầm dựa vào thứ tự attribute trong template.

### 7.2. exportAs để template truy cập directive instance

Directive:

```ts
@Directive({
  selector: '[appToggle]',
  exportAs: 'appToggle',
  standalone: false
})
export class ToggleDirective {
  opened = false;

  toggle(): void {
    this.opened = !this.opened;
  }
}
```

Template:

```html
<div appToggle #toggle="appToggle">
  <button type="button" (click)="toggle.toggle()">
    Bật/tắt
  </button>

  @if (toggle.opened) {
    <p>Nội dung đang mở</p>
  }
</div>
```

Phân biệt:

```html
#element
```

thường tham chiếu tới element hoặc component mặc định.

```html
#toggle="appToggle"
```

tham chiếu trực tiếp tới instance directive có `exportAs: 'appToggle'`.

Chỉ export những state hoặc method thật sự là public contract. Không để template can thiệp sâu vào implementation nội bộ.

### 7.3. hostDirectives

`hostDirectives` cho phép một component hoặc directive tự động áp dụng directive khác lên host của nó.

Directive hành vi:

```ts
import { Directive } from '@angular/core';

@Directive({
  standalone: true,
  host: {
    '[attr.tabindex]': '0',
    '[class.keyboard-focusable]': 'true'
  }
})
export class KeyboardFocusableDirective {}
```

Component sử dụng:

```ts
import { Component } from '@angular/core';
import { KeyboardFocusableDirective } from './keyboard-focusable.directive';

@Component({
  selector: 'app-patient-card',
  templateUrl: './patient-card.component.html',
  standalone: false,
  hostDirectives: [KeyboardFocusableDirective]
})
export class PatientCardComponent {}
```

Consumer chỉ viết:

```html
<app-patient-card />
```

Nhưng Angular tự áp dụng behavior của `KeyboardFocusableDirective` lên host `<app-patient-card>`.

Luồng:

```text
Component khai báo hostDirectives
        ↓
Angular tạo directive trên host component
        ↓
Consumer không cần tự viết attribute
        ↓
Behavior trở thành một phần mặc định của component
```

Dùng `hostDirectives` khi behavior là phần bắt buộc của component.

Không nên dùng khi consumer cần chủ động quyết định có bật behavior hay không. Khi đó attribute tường minh thường dễ đọc hơn:

```html
<app-patient-card appTrackVisibility />
```

### 7.4. Expose input/output của host directive

```ts
@Directive({
  standalone: true
})
export class TooltipDirective {
  @Input() tooltipText = '';
  @Output() tooltipOpened = new EventEmitter<void>();
}
```

Component có thể expose API:

```ts
@Component({
  selector: 'app-icon-button',
  template: `<ng-content />`,
  standalone: false,
  hostDirectives: [
    {
      directive: TooltipDirective,
      inputs: ['tooltipText'],
      outputs: ['tooltipOpened']
    }
  ]
})
export class IconButtonComponent {}
```

Consumer:

```html
<app-icon-button
  tooltipText="Xóa hồ sơ"
  (tooltipOpened)="trackTooltip()"
>
  Xóa
</app-icon-button>
```

Điều này biến input/output của host directive thành một phần public API của component. Chỉ expose những gì consumer thật sự cần.

### 7.5. Inject directive trên cùng host

Nếu hai directive nằm trên cùng host, một directive có thể inject directive kia.

```ts
@Directive({
  selector: '[appSelectable]',
  standalone: false
})
export class SelectableDirective {
  selected = false;
}
```

```ts
@Directive({
  selector: '[appSelectionIndicator]',
  standalone: false
})
export class SelectionIndicatorDirective {
  constructor(
    @Host() @Optional()
    private readonly selectable: SelectableDirective | null
  ) {}
}
```

Cần dùng coupling kiểu này có chủ đích. Nếu nhiều directive liên kết chặt chẽ, khó sử dụng độc lập và cần biết thứ tự/state nội bộ của nhau, có thể một component hoặc directive tổng hợp sẽ phù hợp hơn.

---

## 8. Kiểm thử directive

Directive nên được test thông qua contract mà consumer quan sát được:

```text
- DOM class.
- Attribute.
- Property.
- Output event.
- View có được render hay không.
- Cleanup có hoạt động không.
```

Không nên phụ thuộc quá sâu vào implementation như số lần gọi private method.

### 8.1. Kiểm thử attribute directive bằng host component

Directive cần test:

```ts
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

Host component:

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

Test:

```ts
describe('HighlightInvalidDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [
        HostComponent,
        HighlightInvalidDirective
      ]
    });
  });

  it('không highlight khi field chưa touched', () => {
    const fixture = TestBed.createComponent(HostComponent);

    fixture.componentInstance.invalid = true;
    fixture.componentInstance.touched = false;
    fixture.detectChanges();

    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');

    expect(input.classList.contains('app-invalid-field')).toBeFalse();
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });

  it('highlight khi invalid và touched', () => {
    const fixture = TestBed.createComponent(HostComponent);

    fixture.componentInstance.invalid = true;
    fixture.componentInstance.touched = true;
    fixture.detectChanges();

    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');

    expect(input.classList.contains('app-invalid-field')).toBeTrue();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});
```

### 8.2. Kiểm thử event và output

```ts
@Component({
  template: `
    <button appToggle (toggled)="onToggled($event)">
      Toggle
    </button>
  `
})
class ToggleHostComponent {
  lastValue?: boolean;

  onToggled(value: boolean): void {
    this.lastValue = value;
  }
}
```

Test cần trigger event trên DOM thay vì gọi trực tiếp method directive nếu muốn kiểm tra contract thực tế:

```ts
const button: HTMLButtonElement =
  fixture.nativeElement.querySelector('button');

button.click();
fixture.detectChanges();

expect(fixture.componentInstance.lastValue).toBeTrue();
```

### 8.3. Kiểm thử structural directive

```ts
@Component({
  template: `
    <p *appShow="visible">Nội dung</p>
  `
})
class ShowHostComponent {
  visible = false;
}
```

Test:

```ts
it('không render khi condition false', () => {
  const fixture = TestBed.createComponent(ShowHostComponent);
  fixture.detectChanges();

  expect(fixture.nativeElement.querySelector('p')).toBeNull();
});

it('render khi condition true', () => {
  const fixture = TestBed.createComponent(ShowHostComponent);

  fixture.componentInstance.visible = true;
  fixture.detectChanges();

  const paragraph = fixture.nativeElement.querySelector('p');

  expect(paragraph?.textContent).toContain('Nội dung');
});
```

### 8.4. Kiểm thử cleanup

Với observer hoặc listener, cần kiểm tra resource được hủy khi fixture destroy.

Ví dụ mock `IntersectionObserver` và spy `disconnect()`:

```text
fixture.destroy()
→ directive.ngOnDestroy()
→ observer.disconnect()
```

### 8.5. Danh sách tình huống cần kiểm thử

```text
[ ] Giá trị mặc định khi không truyền input.
[ ] Mỗi nhánh trạng thái chính.
[ ] Input thay đổi sau lần render đầu tiên.
[ ] Mouse và keyboard event quan trọng.
[ ] Output đúng payload.
[ ] Host class, property và ARIA attribute.
[ ] Structural view được tạo và xóa đúng.
[ ] Timer, listener, observer, subscription được cleanup.
[ ] Tương tác với Angular Forms nếu directive can thiệp value.
```

---

## 9. Thiết kế directive trong dự án thực tế

### 9.1. Cấu trúc thư mục

Một cách tổ chức:

```text
shared/
└── directives/
    ├── auto-focus/
    │   ├── auto-focus.directive.ts
    │   └── auto-focus.directive.spec.ts
    ├── click-outside/
    │   ├── click-outside.directive.ts
    │   └── click-outside.directive.spec.ts
    ├── highlight-invalid/
    │   ├── highlight-invalid.directive.ts
    │   └── highlight-invalid.directive.spec.ts
    ├── has-permission/
    │   ├── has-permission.directive.ts
    │   └── has-permission.directive.spec.ts
    └── shared-directives.module.ts
```

Module:

```ts
const DIRECTIVES = [
  AutoFocusDirective,
  ClickOutsideDirective,
  HighlightInvalidDirective,
  HasPermissionDirective
];

@NgModule({
  declarations: [...DIRECTIVES],
  exports: [...DIRECTIVES]
})
export class SharedDirectivesModule {}
```

Chỉ đưa directive vào shared nếu nó thật sự dùng chung. Directive chỉ có ý nghĩa trong một feature nên đặt gần feature đó để tránh shared module trở thành nơi chứa mọi thứ.

### 9.2. Accessibility

Directive có thể làm UI đẹp hơn nhưng không được phá semantic HTML.

Không nên:

```html
<div appClickable>Xóa</div>
```

Một `div` không tự có:

```text
- Keyboard activation.
- Focus behavior.
- Button semantics cho screen reader.
- Disabled state chuẩn.
```

Nên dùng:

```html
<button type="button" appConfirmAction>
  Xóa
</button>
```

Directive nên đồng bộ ARIA với state thật:

```ts
host: {
  '[attr.aria-expanded]': 'opened',
  '[attr.aria-busy]': 'processing',
  '[attr.aria-invalid]': 'invalid'
}
```

ARIA không thay thế semantic element đúng.

### 9.3. Security

Không gán HTML chưa tin cậy:

```ts
this.elementRef.nativeElement.innerHTML = userInput;
```

Directive không nên tự bypass sanitization nếu chưa có lý do và review bảo mật rõ ràng.

Permission directive chỉ kiểm soát hiển thị. Authorization thật phải nằm ở backend.

### 9.4. Performance

Các nguồn chi phí thường gặp:

```text
- Global event listener trên mỗi instance.
- DOM measurement liên tục.
- Logic nặng trong ngDoCheck.
- Tạo và xóa embedded view không cần thiết.
- Observer không cleanup.
- Directive xuất hiện hàng nghìn lần trong list.
```

Một số nguyên tắc:

```text
- Không dùng ngDoCheck để dò thay đổi nếu input binding giải quyết được.
- Giữ state để tránh create/clear view lặp.
- Dùng track trong @for.
- Throttle/debounce event tần suất cao khi cần.
- Chỉ runOutsideAngular sau khi hiểu và đo được vấn đề.
- Không query DOM toàn cục cho mỗi instance.
```

### 9.5. Directive không nên che giấu side effect lớn

Template sau nhìn có vẻ đơn giản:

```html
<button appApprovePatient>Duyệt</button>
```

Nhưng nếu directive âm thầm:

```text
- Gọi API.
- Update store.
- Điều hướng.
- Mở modal.
- Push analytics.
```

thì người đọc template không thể đoán luồng ứng dụng.

Tốt hơn:

```html
<button
  [appConfirmAction]="confirmMessage"
  (confirmed)="approvePatient()"
>
  Duyệt
</button>
```

Business action vẫn hiện rõ trong component.

### 9.6. Checklist trước khi tạo directive mới

```text
1. Hành vi có gắn trực tiếp với host element không?
2. Có được sử dụng ở nhiều nơi không?
3. Có cần template riêng không?
4. Có đang giấu business workflow không?
5. Public input/output có dễ hiểu trong template không?
6. Directive có cần phối hợp ngầm với directive khác không?
7. Có listener, timer, observer hoặc subscription cần cleanup không?
8. Có ảnh hưởng accessibility không?
9. Có làm DOM churn hoặc change detection không cần thiết không?
10. Có thể test thông qua DOM/output rõ ràng không?
```

---

## 10. Tình huống: Chuẩn hóa trạng thái form field

Bài toán: nhiều form cần cùng một quy tắc hiển thị:

```text
- Field invalid và đã touched → thêm class invalid.
- Field valid và đã touched → thêm class valid.
- Đồng bộ aria-invalid.
- Không lặp logic class trong mọi template.
```

Directive:

```ts
import {
  Directive,
  OnDestroy,
  OnInit,
  Optional,
  Self
} from '@angular/core';
import { NgControl } from '@angular/forms';
import { merge, Subscription } from 'rxjs';

@Directive({
  selector: '[appFormFieldState]',
  standalone: false,
  host: {
    '[class.app-field--invalid]': 'isInvalid',
    '[class.app-field--valid]': 'isValid',
    '[attr.aria-invalid]': 'isInvalid'
  }
})
export class FormFieldStateDirective implements OnInit, OnDestroy {
  isInvalid = false;
  isValid = false;

  private subscription?: Subscription;

  constructor(
    @Optional() @Self()
    private readonly ngControl: NgControl | null
  ) {}

  ngOnInit(): void {
    const control = this.ngControl?.control;

    if (!control) {
      return;
    }

    this.updateState();

    this.subscription = merge(
      control.statusChanges,
      control.valueChanges
    ).subscribe(() => {
      this.updateState();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private updateState(): void {
    const control = this.ngControl?.control;

    if (!control) {
      this.isInvalid = false;
      this.isValid = false;
      return;
    }

    this.isInvalid = control.invalid && control.touched;
    this.isValid = control.valid && control.touched;
  }
}
```

Sử dụng:

```html
<input
  appFormFieldState
  formControlName="patientName"
/>
```

Ưu điểm:

```text
- Template gọn hơn.
- Quy ước class thống nhất.
- Directive tự tìm NgControl trên host.
- Component không phải lặp điều kiện class.
```

Điểm cần cân nhắc:

`markAsTouched()` không phải lúc nào cũng phát `valueChanges` hoặc `statusChanges` theo cách mong muốn. Nếu cần phản ứng chính xác với mọi thay đổi touched state, ứng dụng có thể cần một cơ chế form submit state hoặc directive integration rõ hơn thay vì chỉ dựa vào hai observable trên.

Một phiên bản đơn giản và dễ dự đoán hơn là truyền state từ template:

```html
<input
  [appHighlightInvalid]="control.invalid"
  [touched]="control.touched || submitted"
/>
```

Đây là trade-off:

```text
Directive tự inject NgControl
→ Template gọn hơn nhưng directive phụ thuộc Forms sâu hơn.

Template truyền state
→ Verbose hơn nhưng nguồn dữ liệu rõ ràng và dễ kiểm soát.
```

---

## 11. Tình huống: Permission cập nhật theo Observable

Trong ứng dụng thực tế, permission có thể được tải bất đồng bộ hoặc thay đổi khi người dùng chuyển tenant/role.

Permission service:

```ts
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly permissionsSubject =
    new BehaviorSubject<ReadonlySet<string>>(new Set());

  readonly permissions$ = this.permissionsSubject.asObservable();

  setPermissions(permissions: string[]): void {
    this.permissionsSubject.next(new Set(permissions));
  }

  has(permission: string): Observable<boolean> {
    return this.permissions$.pipe(
      map(permissions => permissions.has(permission)),
      distinctUntilChanged()
    );
  }
}
```

Directive:

```ts
import {
  DestroyRef,
  Directive,
  inject,
  Input,
  TemplateRef,
  ViewContainerRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, switchMap } from 'rxjs';

@Directive({
  selector: '[appHasPermission]',
  standalone: false
})
export class HasPermissionDirective {
  private readonly destroyRef = inject(DestroyRef);
  private readonly permissionService = inject(PermissionService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  private readonly permissionSubject =
    new ReplaySubject<string>(1);

  private hasView = false;

  @Input()
  set appHasPermission(permission: string) {
    this.permissionSubject.next(permission);
  }

  constructor() {
    this.permissionSubject
      .pipe(
        distinctUntilChanged(),
        switchMap(permission => this.permissionService.has(permission)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(allowed => {
        this.updateView(allowed);
      });
  }

  private updateView(allowed: boolean): void {
    if (allowed && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
      return;
    }

    if (!allowed && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
```

Luồng:

```text
Template truyền permission name
        ↓
Directive switch sang permission observable tương ứng
        ↓
Permission state thay đổi
        ↓
Directive nhận allowed mới
        ↓
Tạo hoặc xóa embedded view
```

`distinctUntilChanged()` giúp tránh xử lý lại khi permission name hoặc kết quả không đổi.

`switchMap()` đảm bảo khi input permission đổi, subscription cũ được thay thế bằng permission mới.

`takeUntilDestroyed()` kết thúc subscription khi directive bị destroy.

---

## 12. Tổng kết

```text
Directive là một class được Angular gắn vào element khớp selector.

Host element
→ Element hoặc component mà directive đang tác động.

Attribute Directive
→ Bổ sung hành vi hoặc trạng thái cho host đã tồn tại.

Structural Directive
→ Quản lý việc tạo và xóa embedded view.

TemplateRef
→ Bản thiết kế của một khối template chưa render.

ViewContainerRef
→ Vị trí Angular có thể chèn hoặc xóa view.

Input
→ Dữ liệu từ template đi vào directive.

Output
→ Sự kiện semantic từ directive phát ra component.

ElementRef
→ Tham chiếu tới host element.

Renderer2 / host binding
→ Thay đổi class, style, attribute hoặc property của host.
```

Cách chọn nhanh:

```text
Có template và layout riêng?
→ Component

Gắn một hành vi nhỏ lên host?
→ Attribute Directive

Quản lý việc render một khối template?
→ Structural Directive hoặc built-in control flow

Bổ sung validation cho Angular Forms?
→ Validator Directive

Tạo custom form control hoàn chỉnh?
→ Component + ControlValueAccessor

Có nghiệp vụ, API hoặc state dùng chung?
→ Service
```

Một directive tốt thường có các đặc điểm:

```text
- Selector rõ ràng.
- Một trách nhiệm chính.
- Input/output dễ hiểu.
- Không giấu business workflow.
- Không thao tác DOM tùy tiện.
- Cleanup đầy đủ.
- Tôn trọng accessibility.
- Có thể kiểm thử qua DOM, output hoặc rendered view.
```

Directive không cần phức tạp mới có giá trị. Giá trị lớn nhất của directive là biến một hành vi UI lặp lại thành một contract nhỏ, rõ ràng và nhất quán trong toàn bộ ứng dụng.
