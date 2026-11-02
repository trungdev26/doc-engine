# Điều hướng focus giữa các form control bằng phím Enter

## 1. Bài toán

Một form nhập liệu cần hỗ trợ:

```text
- Nhấn Enter để chuyển focus sang control tiếp theo.
- Có thể sắp xếp control bằng thứ tự.
- Có thể chỉ định trực tiếp control đích.
- Bỏ qua control đang disabled hoặc bị ẩn.
- Hoạt động với input HTML và component của thư viện.
- Không làm hỏng hành vi bàn phím sẵn có của dropdown.
```

Ví dụ mong muốn:

```html
<form appEnterFocusGroup>
  <input
    appEnterNext
    enterFocusId="patientCode"
    [enterFocusOrder]="10"
  />

  <nz-select
    appEnterNext
    enterFocusId="province"
    [enterFocusOrder]="20"
  >
    ...
  </nz-select>

  <input
    appEnterNext
    enterFocusId="phone"
    [enterFocusOrder]="30"
  />
</form>
```

Luồng focus:

```text
patientCode
    ↓ Enter
province
    ↓ chọn option bằng Enter
phone
```

---

## 2. Quy ước hành vi

Trước khi viết code, cần xác định rõ Enter có ý nghĩa gì trên từng control:

| Control | Trạng thái | Hành vi khi nhấn Enter |
| --- | --- | --- |
| `input` | Bình thường | Chuyển sang control tiếp theo |
| `nz-select` | Dropdown đang đóng | Để `nz-select` mở dropdown |
| `nz-select` | Dropdown đang mở, mode mặc định | Chọn option; chỉ chuyển tiếp sau khi dropdown đã đóng |
| `nz-select` | Dropdown đang mở, mode `multiple` hoặc `tags` | Giữ focus để người dùng chọn tiếp |
| Control disabled/ẩn | Không thể focus | Bỏ qua |
| Đang dùng IME | `event.isComposing = true` | Không xử lý Enter |

Nguyên tắc quan trọng:

> Directive điều phối focus không được giành quyền xử lý Enter khi component thư viện vẫn đang sử dụng Enter cho hành vi nội bộ.

Nếu directive luôn gọi `preventDefault()` rồi chuyển focus ngay, `nz-select` có thể chưa kịp mở dropdown, chọn option hoặc cập nhật form value.

---

## 3. Thiết kế directive

Ví dụ gồm ba phần:

```text
EnterFocusGroupDirective
→ Quản lý danh sách control trong một vùng.
→ Tìm control tiếp theo theo id hoặc thứ tự.

EnterNextDirective
→ Được gắn trên từng control.
→ Lắng nghe phím Enter.
→ Điều phối focus nhưng không phụ thuộc thư viện UI.

EnterFocusAdapter
→ Mô tả cách focus và đọc trạng thái của một loại control.
→ Mỗi component thư viện có adapter riêng.
```

Quan hệ giữa các thành phần:

```text
EnterNextDirective
        ↓ sử dụng contract
EnterFocusAdapter
        ↑ được implement bởi
        ├── NzSelectEnterFocusAdapter
        ├── NzDatePickerEnterFocusAdapter
        ├── NzTimePickerEnterFocusAdapter
        └── Adapter cho component khác
```

`EnterNextDirective` không import trực tiếp `NzSelectComponent`, `NzDatePickerComponent` hoặc bất kỳ component thư viện nào.

Không dùng `document.querySelector()` để tìm control hoặc element nội bộ vì:

```text
- Selector có thể trùng giữa nhiều form.
- Khó bỏ qua control disabled hoặc ẩn.
- Phụ thuộc DOM toàn cục.
- Khó kiểm thử.
- Không biết cách focus component thư viện.
```

Group directive tạo một phạm vi focus độc lập cho từng form hoặc từng khu vực nhập liệu.

### Contract của adapter

```ts
import { InjectionToken } from '@angular/core';

export interface EnterFocusAdapter {
  focus(): void;
  isFocusable(): boolean;
  canAdvanceAfterEnter(event: KeyboardEvent): boolean;
}

export const ENTER_FOCUS_ADAPTER =
  new InjectionToken<EnterFocusAdapter>(
    'ENTER_FOCUS_ADAPTER'
  );
```

Ý nghĩa từng method:

```text
focus()
→ Đưa focus vào đúng element nội bộ của control.

isFocusable()
→ Cho biết control có đang enabled và có thể nhận focus không.

canAdvanceAfterEnter()
→ Cho biết component đã xử lý xong Enter và cho phép rời control chưa.
```

Native input không cần adapter riêng vì `EnterNextDirective` có thể gọi trực tiếp `HTMLElement.focus()`. Component thư viện chỉ cần cung cấp adapter khi focus target hoặc state machine nằm bên trong component.

---

## 4. Directive quản lý focus

```ts
import { Directive } from '@angular/core';
import type { EnterNextDirective } from './enter-next.directive';

@Directive({
  selector: '[appEnterFocusGroup]',
  standalone: false
})
export class EnterFocusGroupDirective {
  private readonly items: EnterNextDirective[] = [];

  register(item: EnterNextDirective): void {
    if (!this.items.includes(item)) {
      this.items.push(item);
    }
  }

  unregister(item: EnterNextDirective): void {
    const index = this.items.indexOf(item);

    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }

  moveFrom(current: EnterNextDirective): void {
    const explicitTarget = current.nextId
      ? this.items.find(item =>
          item.focusId === current.nextId &&
          item.isFocusable()
        )
      : undefined;

    if (explicitTarget) {
      explicitTarget.focus();
      return;
    }

    const orderedItems = [...this.items]
      .filter(item => item.isFocusable())
      .sort((left, right) => left.order - right.order);

    const currentIndex = orderedItems.indexOf(current);
    const nextItem = orderedItems[currentIndex + 1];

    nextItem?.focus();
  }
}
```

Hai cách tìm đích:

```text
nextId có giá trị
→ Tìm đúng control có focusId tương ứng.

nextId không có giá trị
→ Sắp xếp theo order và lấy control tiếp theo.
```

Nếu hai control có cùng `order`, thứ tự đăng ký được giữ nguyên. Trong code production, nên quy ước `order` không trùng để template dễ đọc và kết quả ổn định khi render có điều kiện.

---

## 5. Directive điều phối trên từng control

```ts
import {
  Directive,
  ElementRef,
  HostListener,
  inject,
  Input,
  numberAttribute,
  OnDestroy,
  OnInit
} from '@angular/core';
import {
  ENTER_FOCUS_ADAPTER,
  EnterFocusAdapter
} from './enter-focus-adapter';
import { EnterFocusGroupDirective } from './enter-focus-group.directive';

@Directive({
  selector: '[appEnterNext]',
  standalone: false
})
export class EnterNextDirective implements OnInit, OnDestroy {
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly group =
    inject(EnterFocusGroupDirective, { optional: true });

  private readonly adapter =
    inject<EnterFocusAdapter>(ENTER_FOCUS_ADAPTER, {
      optional: true,
      self: true
    });

  @Input()
  enterFocusId = '';

  @Input({
    transform: numberAttribute
  })
  enterFocusOrder = 0;

  @Input('appEnterNext')
  nextId = '';

  get focusId(): string {
    return this.enterFocusId;
  }

  get order(): number {
    return this.enterFocusOrder;
  }

  ngOnInit(): void {
    this.group?.register(this);
  }

  ngOnDestroy(): void {
    this.group?.unregister(this);
  }

  @HostListener('keydown.enter', ['$event'])
  onEnter(event: KeyboardEvent): void {
    if (
      event.isComposing ||
      event.shiftKey ||
      !this.group
    ) {
      return;
    }

    if (!this.adapter) {
      event.preventDefault();
      this.group.moveFrom(this);
      return;
    }

    queueMicrotask(() => {
      if (this.adapter?.canAdvanceAfterEnter(event)) {
        this.group?.moveFrom(this);
      }
    });
  }

  isFocusable(): boolean {
    if (this.adapter) {
      return this.adapter.isFocusable();
    }

    const element = this.host.nativeElement as
      HTMLElement & { disabled?: boolean };

    return (
      !element.disabled &&
      element.getClientRects().length > 0
    );
  }

  focus(): void {
    if (this.adapter) {
      this.adapter.focus();
      return;
    }

    this.host.nativeElement.focus();
  }
}
```

Directive lõi chỉ có hai nhánh:

```text
Có adapter
→ Giao việc focus và kiểm tra state cho adapter.

Không có adapter
→ Xử lý như native HTMLElement.
```

Khi dự án thêm component thư viện mới, code của `EnterNextDirective` không thay đổi.

### Adapter cho nz-select

```ts
import {
  Directive,
  forwardRef,
  inject
} from '@angular/core';
import { NzSelectComponent } from 'ng-zorro-antd/select';
import {
  ENTER_FOCUS_ADAPTER,
  EnterFocusAdapter
} from './enter-focus-adapter';

@Directive({
  selector: 'nz-select[appEnterNext]',
  standalone: false,
  providers: [
    {
      provide: ENTER_FOCUS_ADAPTER,
      useExisting: forwardRef(
        () => NzSelectEnterFocusAdapterDirective
      )
    }
  ]
})
export class NzSelectEnterFocusAdapterDirective
  implements EnterFocusAdapter {

  private readonly select =
    inject(NzSelectComponent, { self: true });

  focus(): void {
    this.select.focus();
  }

  isFocusable(): boolean {
    return !this.select.nzDisabled;
  }

  canAdvanceAfterEnter(): boolean {
    return !this.select.nzOpen;
  }
}
```

Selector:

```ts
selector: 'nz-select[appEnterNext]'
```

giúp Angular tự gắn adapter khi `appEnterNext` được dùng trên `nz-select`:

```html
<nz-select appEnterNext />
```

Consumer không phải viết thêm attribute như `appNzSelectFocusAdapter`.

### Vì sao adapter cần inject NzSelectComponent?

Trên native input:

```ts
this.host.nativeElement.focus();
```

là đủ vì host chính là element nhận focus.

Trên:

```html
<nz-select appEnterNext />
```

host là element `<nz-select>`, nhưng element thực sự nhận keyboard focus nằm trong template nội bộ của component thư viện. Gọi `focus()` trên custom element bên ngoài không đảm bảo focus đúng control.

Adapter gọi public method của `NzSelectComponent`:

```ts
focus(): void;
```

Adapter được đặt trên cùng element với `NzSelectComponent`, vì vậy có thể inject component bằng:

```ts
inject(NzSelectComponent, {
  self: true
});
```

`self: true` bảo đảm adapter lấy đúng `NzSelectComponent` trên host hiện tại.

### Adapter cho component khác

Mỗi component có state machine riêng nên adapter cũng có policy riêng. Ví dụ date picker:

```ts
@Directive({
  selector: 'nz-date-picker[appEnterNext]',
  standalone: false,
  providers: [
    {
      provide: ENTER_FOCUS_ADAPTER,
      useExisting: forwardRef(
        () => NzDatePickerEnterFocusAdapterDirective
      )
    }
  ]
})
export class NzDatePickerEnterFocusAdapterDirective
  implements EnterFocusAdapter {

  private readonly datePicker =
    inject(NzDatePickerComponent, { self: true });

  focus(): void {
    this.datePicker.focus();
  }

  isFocusable(): boolean {
    return !this.datePicker.nzDisabled;
  }

  canAdvanceAfterEnter(): boolean {
    return !this.datePicker.realOpenState;
  }
}
```

Tương tự, có thể bổ sung:

```text
NzTimePickerEnterFocusAdapterDirective
NzTreeSelectEnterFocusAdapterDirective
CompanyDateTimeEnterFocusAdapterDirective
```

Mỗi adapter nằm cạnh integration của thư viện tương ứng. Directive lõi và focus group vẫn độc lập với ng-zorro.

Không phải mọi component có prefix `nz-` đều nên được coi là một form control. Chẳng hạn `nz-calendar` hiển thị cả một lịch với nhiều phần tử có thể tương tác, nên cần xác định rõ focus target và keyboard flow của lịch trước khi viết adapter. Với date-time input, ng-zorro thường dùng `nz-date-picker` kết hợp `nzShowTime`; adapter của date picker có thể xử lý trường hợp này dựa trên trạng thái panel thực tế.

### Khai báo trong module

```ts
@NgModule({
  declarations: [
    EnterFocusGroupDirective,
    EnterNextDirective,
    NzSelectEnterFocusAdapterDirective,
    NzDatePickerEnterFocusAdapterDirective
  ],
  exports: [
    EnterFocusGroupDirective,
    EnterNextDirective
  ]
})
export class EnterFocusModule {}
```

Consumer chỉ sử dụng `appEnterFocusGroup` và `appEnterNext`. Các adapter được Angular kích hoạt tự động bằng selector nên không cần export để consumer gắn trực tiếp.

---

## 6. Khai báo theo thứ tự

```html
<form appEnterFocusGroup>
  <input
    nz-input
    appEnterNext
    enterFocusId="code"
    [enterFocusOrder]="10"
    placeholder="Mã bệnh nhân"
  />

  <input
    nz-input
    appEnterNext
    enterFocusId="name"
    [enterFocusOrder]="20"
    placeholder="Tên bệnh nhân"
  />

  <nz-select
    appEnterNext
    enterFocusId="province"
    [enterFocusOrder]="30"
    nzPlaceHolder="Chọn tỉnh/thành"
  >
    <nz-option
      nzValue="hcm"
      nzLabel="TP. Hồ Chí Minh"
    />
    <nz-option
      nzValue="hn"
      nzLabel="Hà Nội"
    />
  </nz-select>

  <input
    nz-input
    appEnterNext
    enterFocusId="phone"
    [enterFocusOrder]="40"
    placeholder="Số điện thoại"
  />
</form>
```

Khi một control bị ẩn bởi `*ngIf` hoặc disabled, `moveFrom()` bỏ qua control đó và chọn control khả dụng tiếp theo.

---

## 7. Chỉ định trực tiếp control đích

Không phải mọi form đều đi theo thứ tự tuyến tính.

```html
<form appEnterFocusGroup>
  <input
    [appEnterNext]="'companyTaxCode'"
    enterFocusId="customerType"
    [enterFocusOrder]="10"
  />

  <input
    appEnterNext
    enterFocusId="personalId"
    [enterFocusOrder]="20"
  />

  <input
    appEnterNext
    enterFocusId="companyTaxCode"
    [enterFocusOrder]="30"
  />
</form>
```

Với control `customerType`:

```text
nextId = companyTaxCode
→ Focus thẳng tới companyTaxCode.
→ Không dùng thứ tự 20.
```

Giá trị đích cũng có thể thay đổi theo state:

```html
<input
  [appEnterNext]="
    customerType === 'company'
      ? 'companyTaxCode'
      : 'personalId'
  "
  enterFocusId="customerType"
/>
```

---

## 8. Phối hợp với nz-select

### Hành vi của ng-zorro-antd 17.4.1

Trong phiên bản đang dùng ở project:

```text
nzSelect.focus()
→ Focus top control.
→ Không tự mở dropdown.

Click trên host
→ Toggle trạng thái nzOpen.

Enter khi nzOpen = false
→ nz-select mở dropdown.

Enter khi nzOpen = true và mode = default
→ Chọn option đang active.
→ nz-select đóng dropdown.

Enter khi mode = multiple hoặc tags
→ Chọn/thêm option.
→ Dropdown vẫn mở.
```

Vì vậy, khi focus chuyển từ input sang `nz-select`:

```text
Input trước nhận Enter
        ↓
Directive gọi nzSelect.focus()
        ↓
nz-select nhận focus nhưng dropdown vẫn đóng
        ↓
Người dùng nhấn Enter
        ↓
nz-select tự mở dropdown
```

Directive không nên gọi thêm `click()` hoặc tự dispatch một phím Enter sau `focus()`, vì chính các hành động đó mới có thể làm dropdown mở ngoài dự kiến.

### Vì sao kiểm tra nzOpen sau một microtask?

Event `keydown` phát sinh từ control bên trong `nz-select`, sau đó bubble lên host có `appEnterNext`.

```text
Người dùng nhấn Enter
        ↓
nz-select xử lý Enter của nó
        ↓
Event bubble tới EnterNextDirective
        ↓
Directive chờ microtask hiện tại hoàn tất
        ↓
Kiểm tra trạng thái nzOpen cuối cùng
```

Kết quả:

```text
nzOpen = true
→ Dropdown vẫn cần Enter.
→ Không chuyển focus.

nzOpen = false
→ Dropdown đã hoàn thành hành vi của nó.
→ Có thể chuyển sang control tiếp theo.
```

### Trường hợp mode mặc định

```text
Enter lần 1 khi dropdown đóng
→ nz-select mở dropdown.
→ Directive thấy nzOpen = true.
→ Giữ focus.

Enter lần 2 khi một option đang active
→ nz-select chọn option và đóng dropdown.
→ Directive thấy nzOpen = false.
→ Chuyển focus sang control tiếp theo.
```

### Trường hợp multiple hoặc tags

Ở hai mode này, Enter thường có nghĩa là chọn thêm giá trị và dropdown vẫn mở:

```text
Enter
→ Chọn option.
→ nzOpen vẫn true.
→ Directive giữ focus tại nz-select.
```

Đây là hành vi an toàn hơn việc tự đóng dropdown sau mỗi lựa chọn. Người dùng có thể:

```text
- Tiếp tục chọn option khác.
- Nhấn Escape để đóng.
- Nhấn Tab để chuyển focus theo hành vi chuẩn.
```

Nếu nghiệp vụ yêu cầu “chọn một giá trị trong multiple rồi chuyển ngay”, nên tạo một policy riêng và điều khiển `[nzOpen]` tường minh từ component. Không nên ép quy tắc đó vào hành vi mặc định của directive dùng chung.

---

## 9. Có cần gọi blur trước khi focus control tiếp theo?

Không cần gọi thủ công trong luồng bình thường:

```ts
nextElement.focus();
```

Khi browser chuyển focus sang element mới, element cũ tự mất focus.

Với `nz-select`, directive chỉ chuyển tiếp khi `nzOpen` đã là `false`. Điều này tránh trường hợp:

```text
Dropdown còn mở
→ Directive gọi blur()
→ Focus sang input khác
→ Overlay vẫn chưa nhận được yêu cầu đóng rõ ràng
```

Trong `ng-zorro-antd 17.4.1`, `blur()` làm top control mất focus nhưng không phải API biểu đạt trực tiếp hành động “đóng dropdown”. Trạng thái mở nên được quyết định qua flow bàn phím của select hoặc input/output `nzOpen`.

---

## 10. Những tình huống cần tránh

### Chuyển focus trên mọi phím Enter

```ts
@HostListener('keydown.enter')
onEnter(): void {
  this.focusNext();
}
```

Đoạn này bỏ qua dropdown state, IME và behavior của component thư viện.

### Query DOM toàn cục

```ts
document
  .querySelector('[data-order="2"]')
  ?.focus();
```

Nó có thể chọn nhầm control ở form khác và không hỗ trợ component có focus target nằm trong template nội bộ.

### Luôn gọi preventDefault trên nz-select

Nếu directive chạy trước hoặc chặn event của thư viện, select có thể không mở hoặc không chọn option.

### Dùng tabindex để mô tả toàn bộ workflow

`tabindex` quyết định thứ tự Tab của trình duyệt. Nó không mô tả các nhánh động như:

```text
Khách hàng cá nhân → focus CCCD.
Khách hàng công ty → focus mã số thuế.
```

Không thay đổi `tabindex` dương trên diện rộng chỉ để mô phỏng Enter flow; điều đó có thể làm thứ tự keyboard navigation khó dự đoán.

---

## 11. Kiểm thử

### Native input

```text
[ ] Enter chuyển sang control có order kế tiếp.
[ ] nextId được ưu tiên hơn order.
[ ] Control disabled được bỏ qua.
[ ] Control bị ẩn được bỏ qua.
[ ] Shift+Enter không chuyển.
[ ] Enter khi event.isComposing không chuyển.
[ ] Directive unregister khi control bị destroy.
```

### nz-select

```text
[ ] focus() đặt focus đúng vào control nội bộ.
[ ] Enter khi dropdown đóng chỉ mở dropdown.
[ ] Enter khi dropdown mở chọn option.
[ ] Mode default chuyển tiếp sau khi dropdown đóng.
[ ] Mode multiple/tags giữ focus khi dropdown còn mở.
[ ] Disabled select được bỏ qua.
[ ] Không dispatch click hoặc Enter nhân tạo sau focus().
```

### Nhiều focus group

```text
[ ] Control trong form A không nhảy sang form B.
[ ] Hai group có thể dùng cùng focusId mà không xung đột.
[ ] Control render động được đăng ký và hủy đúng.
```

---

## 12. Kết luận

Directive focus tốt không chỉ gọi:

```ts
element.focus();
```

Nó cần hiểu ba lớp:

```text
Focus flow của màn hình
→ Control nào đứng trước, đứng sau hoặc là đích trực tiếp?

Khả năng focus của control
→ Native element hay component thư viện?

State machine của control
→ Enter đang dùng để chuyển focus hay đang điều khiển dropdown?
```

Với component thư viện, hãy gọi public API như `focus()` và quan sát public state như `nzOpen`. Không tìm element nội bộ bằng CSS selector vì DOM bên trong thư viện có thể thay đổi khi nâng version.
