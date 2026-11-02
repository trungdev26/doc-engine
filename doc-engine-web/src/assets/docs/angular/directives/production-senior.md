# Thiết kế Angular Directive trong production

> Tài liệu này dành cho người đã viết được attribute/structural directive và muốn thiết kế, review hoặc vận hành directive trong production.

Ở mức chuyên sâu, người viết directive cần đặt thêm các câu hỏi:

```text
Không chỉ hỏi "code có chạy không?"

Phải hỏi:
- Ai sở hữu behavior này?
- Public contract có ổn định không?
- Khi compose thì binding nào thắng?
- Resource được tạo theo scope nào?
- Browser API có an toàn với SSR/hydration không?
- Chi phí tăng thế nào khi có 10.000 instance?
- Template có còn nói rõ business flow không?
```

---

## 1. Thiết kế public API

Selector, input, output và host behavior đều là contract.

```ts
@Directive({
  selector: '[appTooltip]',
  standalone: false
})
export class TooltipDirective {
  @Input({ alias: 'appTooltip', required: true })
  text!: string;

  @Input()
  placement: 'top' | 'right' | 'bottom' | 'left' = 'top';

  @Output()
  opened = new EventEmitter<void>();
}
```

Review API bằng cách chỉ nhìn template:

```html
<button
  appTooltip="Xóa hồ sơ"
  placement="top"
  (opened)="trackTooltipOpened()"
>
  Xóa
</button>
```

Consumer phải đoán càng ít thì API càng tốt.

### Dấu hiệu API yếu

```text
- Tên selector chung chung: appBehavior, appHandler.
- Nhiều boolean input tạo tổ hợp state khó hiểu.
- Output lặp lại DOM event thay vì semantic event.
- Consumer phải biết method nội bộ qua exportAs.
- Thay đổi một input âm thầm gọi API hoặc điều hướng.
- Directive yêu cầu một directive khác nhưng selector không biểu đạt dependency.
```

---

## 2. Quyền sở hữu host và xung đột binding

Một host có thể nhận binding từ nhiều nguồn:

```text
Consumer template
Component host bindings
Attribute directive
hostDirectives được compose
```

Ví dụ:

```html
<app-action-button
  class="consumer-class"
  [attr.aria-disabled]="pageLocked"
  appPermissionState
/>
```

Trong khi component và directive cũng cùng ghi:

```ts
host: {
  '[attr.aria-disabled]': 'disabled'
}
```

Đây không chỉ là câu hỏi “giá trị cuối là gì”. Nó là lỗi thiết kế ownership:

> Nếu nhiều abstraction cùng sở hữu một host property, contract đang mơ hồ.

### Quy tắc thiết kế

```text
1. Mỗi host property quan trọng nên có một owner.
2. Consumer override phải là chủ đích và được document.
3. Không compose các directive cùng điều khiển disabled/tabindex/role
   nếu chưa định nghĩa precedence.
4. Class additive thường dễ compose hơn property độc quyền.
5. ARIA phải phản ánh state thật, không phải state riêng của từng directive.
```

Khi phát hiện collision, các hướng xử lý:

```text
- Hợp nhất behavior vào một component có state owner rõ ràng.
- Một directive điều phối và expose state cho directive còn lại.
- Đổi host property để mỗi directive sở hữu contract khác nhau.
- Bỏ implicit composition, yêu cầu consumer truyền state tường minh.
```

Không dựa vào thứ tự attribute trong HTML như một pipeline.

---

## 3. Dependency injection và phạm vi provider

Mỗi directive instance có injection context. Directive cũng có thể khai báo provider:

```ts
@Directive({
  selector: '[appSelectionGroup]',
  standalone: false,
  providers: [SelectionCoordinator]
})
export class SelectionGroupDirective {}
```

Provider này được scope theo element/injector chứa directive. Nó phù hợp khi mỗi group cần coordinator độc lập.

Directive con có thể tìm coordinator từ ancestor:

```ts
constructor(
  @Optional()
  private readonly coordinator: SelectionCoordinator | null
) {}
```

### Câu hỏi review DI

```text
- Dependency cần singleton toàn app hay theo từng host/group?
- @Self có cần thiết để không lấy nhầm provider từ ancestor?
- @Optional có đang che giấu cấu hình thiếu?
- Hai directive trên cùng host có coupling bắt buộc không?
- Directive có inject quá nhiều service nghiệp vụ không?
```

Nếu directive inject repository/API client, router, store, notification và modal service cùng lúc, boundary gần như chắc chắn đang quá lớn.

---

## 4. Composition API

`hostDirectives` phù hợp khi behavior là phần bắt buộc của component:

```ts
@Directive({
  standalone: true,
  host: {
    '[attr.tabindex]': '0'
  }
})
export class KeyboardFocusableDirective {}

@Component({
  selector: 'app-patient-card',
  standalone: false,
  hostDirectives: [KeyboardFocusableDirective],
  templateUrl: './patient-card.component.html'
})
export class PatientCardComponent {}
```

Consumer không cần tự thêm attribute.

### Nên dùng khi

```text
- Behavior là invariant của component.
- Directive độc lập và có một trách nhiệm.
- Ownership host binding không xung đột.
- Input/output cần expose đã được chọn rõ.
```

### Không nên dùng khi

```text
- Consumer cần bật/tắt behavior tùy ngữ cảnh.
- Composition che giấu behavior quan trọng.
- Nhiều host directive phụ thuộc state/thứ tự của nhau.
- Component trở thành một "túi mixin" khó dự đoán.
```

Expose input/output có chọn lọc:

```ts
hostDirectives: [
  {
    directive: TooltipDirective,
    inputs: ['tooltipText: helpText'],
    outputs: ['tooltipOpened: helpOpened']
  }
]
```

Alias ở component boundary giúp component sở hữu ngôn ngữ API của chính nó. Không expose toàn bộ API chỉ vì directive có sẵn.

---

## 5. SSR và hydration

Các API sau là tín hiệu cần review:

```text
window
document
localStorage
matchMedia
IntersectionObserver
ResizeObserver
MutationObserver
HTMLElement.focus()
getBoundingClientRect()
```

Server không có đầy đủ browser environment. Ngoài ra, mutation DOM trước hoặc trong hydration có thể làm DOM thực tế khác với DOM Angular mong đợi.

### Nguyên tắc

```text
1. Ưu tiên host binding vì state vẫn nằm trong render model của Angular.
2. Không đọc layout trong constructor.
3. Browser-only observer/listener phải được guard.
4. DOM mutation không cần thiết trước hydration nên được tránh.
5. Cleanup vẫn bắt buộc khi route/view bị destroy ở browser.
```

Ví dụ guard:

```ts
import {
  afterNextRender,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  PLATFORM_ID
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
  selector: '[appAutoFocus]',
  standalone: false
})
export class AutoFocusDirective {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    afterNextRender(() => {
      this.elementRef.nativeElement.focus();
    });
  }
}
```

`afterNextRender` phù hợp với DOM work cần chạy sau render ở browser. Vẫn phải xem xét UX: autofocus có thể gây khó chịu hoặc làm screen reader mất ngữ cảnh.

---

## 6. Xử lý event ở quy mô lớn

Một directive `appClickOutside` đơn giản thường tạo một document listener cho mỗi instance.

```text
10 dropdown
→ thường không đáng kể.

5.000 row action
→ 5.000 document listeners có thể là thiết kế sai.
```

Các lựa chọn:

```text
Attribute directive riêng
→ đơn giản, isolation tốt, phù hợp số lượng nhỏ.

Shared event service/manager
→ một global listener, phân phối tới active instances.

Event delegation ở container
→ phù hợp danh sách lớn và DOM có cấu trúc ổn định.

Component quản lý overlay tập trung
→ phù hợp dropdown/menu/modal có lifecycle phức tạp.
```

Không tối ưu theo cảm giác. Đo:

```text
- số instance
- event frequency
- thời gian handler
- change-detection cycles
- listener/observer còn sống sau navigation
```

`runOutsideAngular()` chỉ giảm việc event kích hoạt change detection. Nó không làm handler nặng trở nên nhẹ và không thay thế cleanup.

---

## 7. Đo DOM và layout thrashing

Directive tooltip/resize/drag thường đọc và ghi layout:

```ts
const rect = host.getBoundingClientRect(); // read
host.style.top = `${rect.bottom}px`;       // write
```

Khi nhiều instance interleave read/write, browser có thể phải tính layout lặp lại.

Hướng xử lý:

```text
- Batch DOM reads trước DOM writes.
- Cache measurement khi geometry không đổi.
- Dùng ResizeObserver thay vì polling.
- Không đo trong ngDoCheck.
- Chỉ activate observer khi behavior đang dùng.
- Với overlay phức tạp, ưu tiên abstraction overlay chuyên dụng của project.
```

---

## 8. Vòng đời view trong structural directive

`ViewContainerRef.clear()` phá hủy view hiện tại. Nếu condition bật/tắt liên tục, tạo/hủy view có thể tốn chi phí và làm mất local state.

Người thiết kế phải quyết định:

```text
Destroy/recreate
→ giải phóng resource, reset state, đơn giản.

Detach/insert cached view
→ giữ state, giảm recreate, nhưng giữ memory/resource.

CSS hide
→ giữ toàn bộ component sống; không phải structural behavior.
```

Không có lựa chọn đúng cho mọi trường hợp. Quyết định dựa trên:

```text
- view có nặng không?
- state có cần giữ không?
- subscription/resource trong view có nên tiếp tục sống không?
- condition thay đổi thường xuyên không?
- hidden content có ảnh hưởng accessibility không?
```

---

## 9. Directive tích hợp với form

Directive thay đổi input value cần xử lý nhiều hơn regex:

```text
- IME/composition event
- caret và selection range
- paste/drop/speech/mobile input
- locale decimal separator
- negative/exponent format
- DefaultValueAccessor ordering
- duplicate input/valueChanges
- updateOn: change | blur | submit
- disabled/read-only state
- validator là lớp bảo vệ độc lập
```

Numeric input trong phần **Lý thuyết chi tiết** là ví dụ học event normalization, không phải currency/money control production.

Với dữ liệu tiền tệ hoặc masked input có nhiều rule, một component + ControlValueAccessor hoặc thư viện đã được project chuẩn hóa thường tạo boundary rõ hơn.

---

## 10. Accessibility

Directive không thể biến mọi element thành control đúng chuẩn chỉ bằng ARIA:

```html
<div appClickable>Xóa</div>
```

Nếu tự làm, directive phải tái tạo:

```text
- focusability
- Enter/Space activation
- role
- disabled semantics
- focus indication
- screen reader announcement
```

Phần lớn trường hợp, dùng `<button>` đúng semantic tốt hơn.

Review:

```text
[ ] Mouse behavior có keyboard equivalent?
[ ] Directive có làm mất focus hoặc focus ngoài dự kiến?
[ ] aria-* đồng bộ với state thật?
[ ] Hidden structural content thực sự không còn trong accessibility tree?
[ ] Color/class change có tín hiệu khác ngoài màu?
[ ] Disabled element có behavior và announcement nhất quán?
```

---

## 11. Ranh giới bảo mật

Không gán HTML không tin cậy:

```ts
host.innerHTML = userInput;
```

Không bypass sanitizer bên trong shared directive vì điều đó làm side effect bảo mật bị che giấu khỏi consumer.

Permission/feature directive chỉ quyết định UI:

```text
Frontend directive
→ convenience và UX

Backend authorization
→ security boundary thật
```

Mọi request nhạy cảm vẫn phải được authorize ở server.

---

## 12. Quan sát và debug

Directive có side effect khó thấy hơn component vì template chỉ có một attribute.

Với directive quan trọng:

```text
- Output semantic để component quan sát.
- Không log mọi DOM event trong production.
- Analytics nên nhận domain event đã được xác nhận.
- Có test chứng minh cleanup sau destroy/navigation.
- exportAs chỉ expose state hữu ích cho consumer/debug, không lộ internals.
```

Khi debug:

```text
1. Selector có match không?
2. Module/standalone import có visibility không?
3. Input thực nhận kiểu và giá trị gì?
4. Host binding có bị owner khác ghi đè không?
5. Event có bị prevent/stop ở nơi khác không?
6. Instance cũ có còn listener/subscription không?
7. Code có đang chạy ở server hay trước hydration không?
```

---

## 13. Bảng review production

| Dimension | Câu hỏi cần trả lời |
| --- | --- |
| Responsibility | Behavior có gắn trực tiếp với host không? |
| API | Selector/input/output có rõ nghĩa và typed không? |
| Ownership | Ai sở hữu disabled, role, tabindex, class và ARIA? |
| Composition | Có coupling hoặc precedence ngầm không? |
| Lifecycle | Tất cả resource có teardown không? |
| Platform | Có browser API và SSR/hydration guard không? |
| Performance | Chi phí theo instance và event frequency là gì? |
| Forms | DOM value và control value có nhất quán không? |
| Accessibility | Semantic, keyboard và focus có đúng không? |
| Security | Có HTML unsafe hoặc authorization giả không? |
| Testing | Test contract, updates, cleanup và platform risk chưa? |

---

## 14. Dấu hiệu cần refactor

Chuyển directive thành component khi:

```text
- Bắt đầu sở hữu layout/template.
- Có nhiều child element và interaction phức tạp.
- Phải quản lý focus, overlay, loading và error như một UI unit.
```

Chuyển logic sang service/facade khi:

```text
- Gọi API hoặc điều phối workflow.
- State được chia sẻ giữa nhiều host.
- Logic không còn phụ thuộc trực tiếp vào DOM.
```

Hợp nhất directive khi:

```text
- Nhiều directive bắt buộc đi cùng nhau.
- Chúng cùng sở hữu một state/property.
- Kết quả phụ thuộc thứ tự thực thi ngầm.
```

Giữ directive nhỏ khi:

```text
- Behavior gắn rõ với host.
- Contract đọc được ngay trong template.
- Có thể test độc lập qua DOM/output.
- Không che giấu business flow.
```

---

## 15. Kết luận

Directive production tốt có bốn đặc điểm:

```text
Visible
→ Người đọc template nhìn thấy behavior.

Bounded
→ Một trách nhiệm và ownership rõ.

Predictable
→ Input/output/lifecycle/platform behavior dự đoán được.

Composable
→ Có thể kết hợp mà không phụ thuộc thứ tự hoặc state ngầm.
```

Nếu một attribute nhỏ trong template kích hoạt cả một workflow lớn, vấn đề không nằm ở cú pháp. Vấn đề nằm ở boundary kiến trúc.
