# ControlValueAccessor

## 1. Bài toán

Angular đã biết cách kết nối các native control:

```html
<input formControlName="fullName" />
<select formControlName="provinceId"></select>
```

Với component tự viết:

```html
<app-rating formControlName="rating" />
```

Angular cần biết:

```text
- Đẩy value từ FormControl xuống component bằng cách nào?
- Nhận value mới từ component bằng cách nào?
- Khi nào control được coi là touched?
- Khi FormControl disabled, UI phải thay đổi ra sao?
```

`ControlValueAccessor` là adapter giữa Angular Forms và một control giao diện.

```text
FormControl
    ↕ ControlValueAccessor
Custom component
```

Các component thư viện như `nz-select`, `nz-date-picker` dùng được với `formControlName` vì thư viện đã cung cấp value accessor.

---

## 2. Contract

```ts
interface ControlValueAccessor {
  writeValue(value: unknown): void;

  registerOnChange(
    fn: (value: unknown) => void
  ): void;

  registerOnTouched(
    fn: () => void
  ): void;

  setDisabledState?(
    isDisabled: boolean
  ): void;
}
```

Hai hướng dữ liệu phải tách biệt:

```text
FormControl → Component
→ writeValue()

User → Component → FormControl
→ callback nhận từ registerOnChange()
```

Quy tắc quan trọng:

> `writeValue()` cập nhật UI từ model; nó không được gọi `onChange()`.

Nếu `writeValue()` gọi `onChange()`, một lần `setValue()` từ form cha có thể bị phản hồi ngược thành user change, tạo duplicate event hoặc loop.

---

## 3. Ví dụ rating control

```ts
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  forwardRef,
  inject
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

@Component({
  selector: 'app-rating',
  template: `
    <div
      class="rating"
      role="radiogroup"
      [attr.aria-disabled]="disabled"
    >
      <button
        *ngFor="let option of options"
        type="button"
        role="radio"
        [attr.aria-checked]="option === value"
        [disabled]="disabled"
        (click)="select(option)"
        (blur)="markTouched()"
      >
        {{ option }}
      </button>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(
        () => RatingComponent
      ),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RatingComponent
  implements ControlValueAccessor {

  private readonly cdr = inject(ChangeDetectorRef);

  readonly options = [1, 2, 3, 4, 5];

  value: number | null = null;
  disabled = false;

  private onChange:
    (value: number | null) => void = () => {};

  private onTouched:
    () => void = () => {};

  writeValue(value: number | null): void {
    this.value = value;
    this.cdr.markForCheck();
  }

  registerOnChange(
    fn: (value: number | null) => void
  ): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  select(value: number): void {
    if (this.disabled) {
      return;
    }

    this.value = value;
    this.onChange(value);
  }

  markTouched(): void {
    this.onTouched();
  }
}
```

---

## 4. Luồng dữ liệu

### Form cha set value

```ts
form.controls.rating.setValue(4);
```

```text
FormControl nhận 4
        ↓
Angular gọi writeValue(4)
        ↓
Component cập nhật UI
        ↓
Không gọi onChange
```

### Người dùng chọn value

```text
User click rating 5
        ↓
Component cập nhật local value
        ↓
Component gọi onChange(5)
        ↓
FormControl nhận 5
        ↓
valueChanges emit
```

### Người dùng rời control

```text
Blur hoặc interaction tương đương
        ↓
Component gọi onTouched()
        ↓
FormControl chuyển touched
```

`onTouched()` không có nghĩa value đã đổi. Nó mô tả interaction boundary.

---

## 5. NG_VALUE_ACCESSOR

```ts
providers: [
  {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(
      () => RatingComponent
    ),
    multi: true
  }
]
```

```text
NG_VALUE_ACCESSOR
→ Token Angular Forms dùng để tìm value accessor.

useExisting
→ Dùng chính component instance hiện tại.

forwardRef
→ Tham chiếu class trước khi khai báo class hoàn tất.

multi: true
→ Không ghi đè các value accessor khác.
```

Thiếu provider có thể dẫn tới:

```text
No value accessor for form control...
```

---

## 6. Disabled state

Form cha:

```ts
form.controls.rating.disable();
```

Angular gọi:

```ts
setDisabledState(true);
```

Component phải đồng bộ cả:

```text
- Visual state.
- Native disabled property nếu có.
- Chặn mouse/keyboard interaction.
- ARIA phù hợp.
```

Không chỉ đổi CSS rồi vẫn cho phép click.

---

## 7. CVA dùng inner FormControl

Component wrap một control thư viện có thể dùng inner control:

```ts
@Component({
  selector: 'app-user-select',
  template: `
    <nz-select
      [formControl]="innerControl"
      (nzBlur)="markTouched()"
    >
      ...
    </nz-select>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(
        () => UserSelectComponent
      ),
      multi: true
    }
  ]
})
export class UserSelectComponent
  implements ControlValueAccessor {

  private readonly destroyRef = inject(DestroyRef);

  readonly innerControl =
    new FormControl<number | null>(null);

  private onChange:
    (value: number | null) => void = () => {};

  private onTouched = () => {};

  constructor() {
    this.innerControl.valueChanges
      .pipe(
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(value => {
        this.onChange(value);
      });
  }

  writeValue(value: number | null): void {
    this.innerControl.setValue(value, {
      emitEvent: false
    });
  }

  registerOnChange(
    fn: (value: number | null) => void
  ): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    if (disabled) {
      this.innerControl.disable({
        emitEvent: false
      });
    } else {
      this.innerControl.enable({
        emitEvent: false
      });
    }
  }

  markTouched(): void {
    this.onTouched();
  }
}
```

`emitEvent: false` ở `writeValue()` ngăn model-to-view update bị subscription hiểu nhầm là user-to-model update.

---

## 8. Async options

`writeValue()` có thể chạy trước khi options load:

```text
Form cha write userId = 42
        ↓
Component chưa có option user 42
        ↓
Select giữ value nhưng chưa có label
```

Search result và selected option là hai luồng khác nhau:

```text
Search options
→ Danh sách đang hiển thị.

Selected option
→ Entity cần để render label của value hiện tại.
```

Pattern:

```ts
private ensureSelectedUserLoaded(
  userId: number | null
): void {
  if (
    userId == null ||
    this.optionMap.has(userId)
  ) {
    return;
  }

  this.userService.getById(userId)
    .pipe(take(1))
    .subscribe(user => {
      this.optionMap.set(user.id, user);
      this.cdr.markForCheck();
    });
}

writeValue(userId: number | null): void {
  this.innerControl.setValue(userId, {
    emitEvent: false
  });

  this.ensureSelectedUserLoaded(userId);
}
```

Không gọi `onChange()` sau khi tải label. Value của form không đổi.

---

## 9. Value shape

Trước khi viết CVA, xác định value contract:

```text
Primitive id
→ number | null

Object
→ UserOption | null

Multiple
→ readonly number[]

Upload
→ readonly AttachmentValue[]

Composite
→ DateRangeValue | null
```

Ưu tiên value nhỏ và ổn định. Component có thể cần object để hiển thị nhưng form chỉ cần id.

Nếu dùng object value, phải có equality policy rõ:

```html
<nz-select
  [compareWith]="compareUser"
/>
```

```ts
compareUser(
  left: UserOption,
  right: UserOption
): boolean {
  return left?.id === right?.id;
}
```

Không dựa vào object reference khi options được tải lại từ API.

---

## 10. CVA kết hợp Validator

CVA không tự động đồng nghĩa với validator. Nếu component sở hữu rule nội tại, có thể implement `Validator`:

```ts
providers: [
  {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(
      () => DateRangePickerComponent
    ),
    multi: true
  },
  {
    provide: NG_VALIDATORS,
    useExisting: forwardRef(
      () => DateRangePickerComponent
    ),
    multi: true
  }
]
```

```ts
validate(): ValidationErrors | null {
  const value = this.value;

  if (!value?.from || !value?.to) {
    return null;
  }

  return value.from <= value.to
    ? null
    : { dateRange: true };
}
```

Khi input cấu hình validator thay đổi, gọi callback nhận từ:

```ts
registerOnValidatorChange(fn: () => void): void {
  this.onValidatorChange = fn;
}
```

Rule nghiệp vụ của màn hình vẫn nên được truyền từ form cha thay vì nhúng hết vào shared component.

---

## 11. Composite control

Một section có nhiều field không mặc định phải là CVA.

Chọn CVA khi:

```text
- Consumer nhìn component như một value duy nhất.
- Có value contract ổn định.
- Touched/disabled/validation có thể tổng hợp rõ.
```

Truyền FormGroup từ cha khi:

```text
- Các field vẫn là phần tường minh của form cha.
- Error cần hiển thị theo từng child control.
- Section chỉ giúp chia layout.
- Consumer cần thao tác trực tiếp từng field.
```

Không dùng CVA chỉ để tránh truyền một `FormGroup` input.

---

## 12. OnPush

`writeValue()` và `setDisabledState()` có thể được Angular gọi từ ngoài event của component. Với `OnPush`, gọi:

```ts
this.cdr.markForCheck();
```

sau khi cập nhật local state giúp template được kiểm tra trong change-detection cycle phù hợp.

Không dùng `detectChanges()` theo phản xạ. `markForCheck()` thường đúng boundary hơn và tránh chạy change detection đồng bộ lồng nhau.

---

## 13. Các lỗi thường gặp

```text
Gọi onChange trong writeValue
→ Duplicate event hoặc loop.

Quên gọi onChange khi user sửa
→ FormControl cha không nhận value.

Quên gọi onTouched
→ touched/updateOn blur không hoạt động đúng.

Không implement setDisabledState
→ Form disabled nhưng UI vẫn tương tác.

Subscription innerControl không cleanup
→ Resource leak.

Không dùng emitEvent: false trong writeValue
→ Model update bị phản hồi ngược.

Value contract không rõ
→ Lẫn id, object và label.

CVA sở hữu cả workflow API
→ Shared control bị coupling với màn hình.
```

---

## 14. Checklist

```text
[ ] Value type có rõ và ổn định không?
[ ] writeValue chỉ cập nhật UI/local state?
[ ] User interaction có gọi onChange đúng một lần?
[ ] Blur/interaction boundary có gọi onTouched?
[ ] Disabled chặn cả visual và interaction?
[ ] Provider có multi: true?
[ ] Inner subscription có cleanup?
[ ] Async label tách khỏi value?
[ ] Object value có equality policy?
[ ] OnPush update có markForCheck khi cần?
[ ] Rule thuộc component hay form cha?
[ ] Component có thật sự là một value duy nhất?
```
