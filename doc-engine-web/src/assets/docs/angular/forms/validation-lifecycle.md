# Validation và lifecycle trong Angular Forms

## 1. Validation thuộc control tree

Validator nhận một control và trả về:

```text
null
→ Hợp lệ.

ValidationErrors
→ Không hợp lệ.
```

Error nằm ở control nào thì status của control đó bị ảnh hưởng. Parent tổng hợp status từ các control con:

```text
FormControl invalid
        ↓
FormGroup cha invalid
        ↓
FormGroup cấp cao hơn invalid
```

Validator nên được đặt ở level sở hữu rule:

```text
Rule của một value
→ FormControl.

Rule so sánh nhiều field
→ FormGroup.

Rule của cả danh sách
→ FormArray.

Rule cần dữ liệu authoritative
→ Backend, có thể kết hợp async validator.
```

---

## 2. Built-in validators

```ts
email = new FormControl('', {
  nonNullable: true,
  validators: [
    Validators.required,
    Validators.email,
    Validators.maxLength(200)
  ]
});
```

Một số validator thường gặp:

```text
required
requiredTrue
email
min / max
minLength / maxLength
pattern
```

Kiểm tra error:

```ts
email.hasError('required');
email.getError('maxlength');
```

`getError()` trả payload của error:

```ts
{
  requiredLength: 200,
  actualLength: 230
}
```

Payload giúp UI tạo message có dữ liệu thay vì chỉ biết true/false.

---

## 3. Custom validator

Validator nên là hàm thuần:

```ts
export function noWhitespaceValidator(
  control: AbstractControl
): ValidationErrors | null {
  const value = String(control.value ?? '');

  return value.trim().length > 0
    ? null
    : { whitespace: true };
}
```

Sử dụng:

```ts
fullName = new FormControl('', {
  nonNullable: true,
  validators: [
    Validators.required,
    noWhitespaceValidator
  ]
});
```

Đặc điểm của validator tốt:

```text
- Không sửa value.
- Không gọi setValue hoặc patchValue.
- Không phát side effect.
- Không phụ thuộc state toàn cục khó kiểm soát.
- Error key ổn định.
- Payload đủ để hiển thị hoặc debug.
```

### 3.1. Validator có tham số

```ts
export function minimumAgeValidator(
  minimumAge: number
): ValidatorFn {
  return control => {
    const birthDate = control.value as Date | null;

    if (!birthDate) {
      return null;
    }

    const age = calculateAge(birthDate);

    return age >= minimumAge
      ? null
      : {
          minimumAge: {
            required: minimumAge,
            actual: age
          }
        };
  };
}
```

Validator factory đóng gói configuration nhưng vẫn trả về một validator thuần.

---

## 4. Cross-field validation

Rule phụ thuộc nhiều field nên đặt trên `FormGroup`:

```ts
export const dateRangeValidator: ValidatorFn = control => {
  const fromDate = control.get('fromDate')?.value as Date | null;
  const toDate = control.get('toDate')?.value as Date | null;

  if (!fromDate || !toDate) {
    return null;
  }

  return fromDate <= toDate
    ? null
    : {
        dateRange: {
          fromDate,
          toDate
        }
      };
};
```

```ts
period = new FormGroup(
  {
    fromDate: new FormControl<Date | null>(null),
    toDate: new FormControl<Date | null>(null)
  },
  {
    validators: [dateRangeValidator]
  }
);
```

Error nằm trên group:

```ts
this.period.hasError('dateRange');
```

Không nên gọi `child.setErrors()` bên trong group validator. Cách đó dễ:

```text
- Ghi đè error khác của child.
- Tạo vòng validation khó đoán.
- Làm rule group bị phân tán sang child.
```

UI vẫn có thể highlight field liên quan dựa trên error của group.

---

## 5. Validation cho FormArray

Ví dụ không cho phép trùng mã sản phẩm:

```ts
export const uniqueProductValidator: ValidatorFn = control => {
  const array = control as FormArray;
  const productIds = array.controls
    .map(row => row.get('productId')?.value)
    .filter((value): value is number => value != null);

  const uniqueIds = new Set(productIds);

  return uniqueIds.size === productIds.length
    ? null
    : { duplicateProduct: true };
};
```

```ts
items = new FormArray([], {
  validators: [uniqueProductValidator]
});
```

Rule “danh sách có ít nhất một dòng” cũng thuộc array:

```ts
export function minItemsValidator(minimum: number): ValidatorFn {
  return control => {
    const array = control as FormArray;

    return array.length >= minimum
      ? null
      : {
          minItems: {
            required: minimum,
            actual: array.length
          }
        };
  };
}
```

---

## 6. Dynamic validators

Validator có thể thay đổi theo state nghiệp vụ:

```ts
updateTaxCodeRules(customerType: 'personal' | 'company'): void {
  const taxCode = this.form.controls.taxCode;

  if (customerType === 'company') {
    taxCode.setValidators([
      Validators.required,
      Validators.pattern(/^\d{10}$/)
    ]);
  } else {
    taxCode.clearValidators();
  }

  taxCode.updateValueAndValidity();
}
```

Phân biệt:

```text
setValidators()
→ Thay thế toàn bộ sync validators hiện tại.

addValidators()
→ Giữ validator cũ và bổ sung validator mới.

removeValidators()
→ Xóa đúng function reference đã được thêm.

clearValidators()
→ Xóa toàn bộ sync validators.
```

Sau khi thay đổi validator, gọi:

```ts
control.updateValueAndValidity();
```

để tính lại errors và status.

Nếu đang cập nhật nhiều control trong một batch:

```ts
control.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});

form.updateValueAndValidity();
```

Chỉ dùng batch optimization khi đã hiểu event mà consumer cần nhận.

---

## 7. Async validator

Async validator trả về:

```ts
Promise<ValidationErrors | null>
```

hoặc:

```ts
Observable<ValidationErrors | null>
```

Ví dụ kiểm tra username:

```ts
export function usernameAvailableValidator(
  userService: UserService
): AsyncValidatorFn {
  return control => {
    const username = String(control.value ?? '').trim();

    if (!username) {
      return of(null);
    }

    return userService.exists(username).pipe(
      map(exists =>
        exists
          ? { usernameTaken: true }
          : null
      ),
      catchError(() => of(null)),
      take(1)
    );
  };
}
```

```ts
username = new FormControl('', {
  nonNullable: true,
  validators: [Validators.required],
  asyncValidators: [
    usernameAvailableValidator(this.userService)
  ],
  updateOn: 'blur'
});
```

### 7.1. PENDING có ý nghĩa gì?

```text
Sync validators chạy
        ↓
Nếu sync result cho phép chạy async validator
        ↓
status = PENDING
        ↓
Async validator emit errors hoặc null
        ↓
status được tính lại
        ↓
VALID hoặc INVALID
```

Observable cần **emit một kết quả validation**. Nếu stream không bao giờ emit, control có thể giữ `PENDING`.

`take(1)` thường phù hợp với validator chỉ cần một kết quả. HTTP Observable vốn complete sau response, nhưng `take(1)` vẫn làm intent rõ ràng với stream tự tạo.

### 7.2. Request cũ

Khi value đổi và validation chạy lại, Angular hủy subscription async validator trước đó. Backend vẫn nên chịu được request trùng hoặc response đến muộn; frontend không được dùng validation như authorization.

### 7.3. Xử lý lỗi hạ tầng

Quyết định rõ khi API validation lỗi:

```text
catchError(() => of(null))
→ Không chặn form vì lỗi kiểm tra tạm thời.

catchError(() => of({ validationUnavailable: true }))
→ Chặn submit và yêu cầu thử lại.
```

Không có lựa chọn đúng cho mọi use case. Rule phải phù hợp mức độ rủi ro của dữ liệu.

---

## 8. Hiển thị validation error

Không nên hiển thị error ngay khi form vừa render:

```ts
shouldShowError(control: AbstractControl): boolean {
  return control.invalid && (
    control.touched ||
    this.submitted
  );
}
```

Submit lần đầu:

```ts
submit(): void {
  this.submitted = true;
  this.form.markAllAsTouched();

  if (this.form.invalid) {
    return;
  }

  // Submit
}
```

Error message nên dựa vào error key:

```html
<p
  *ngIf="shouldShowError(form.controls.email)"
  id="email-error"
  role="alert"
>
  <ng-container
    *ngIf="form.controls.email.hasError('required')"
  >
    Email là bắt buộc.
  </ng-container>

  <ng-container
    *ngIf="form.controls.email.hasError('email')"
  >
    Email không đúng định dạng.
  </ng-container>
</p>
```

Kết nối input với message:

```html
<input
  formControlName="email"
  [attr.aria-invalid]="shouldShowError(form.controls.email)"
  aria-describedby="email-error"
/>
```

---

## 9. valueChanges và statusChanges

```ts
control.valueChanges.subscribe(value => {
  // Value mới
});

control.statusChanges.subscribe(status => {
  // VALID, INVALID, PENDING hoặc DISABLED
});
```

Khi child control thay đổi, child emit trước khi parent hoàn tất aggregate update:

```text
Child cập nhật
→ Child valueChanges/statusChanges
→ Parent tính lại value/status
→ Parent valueChanges/statusChanges
```

Nếu cần aggregate value mới, subscribe tại parent:

```ts
this.form.valueChanges.subscribe(value => {
  // Aggregate value đã được cập nhật
});
```

Không subscribe child rồi đọc ngay `form.value` nếu logic phụ thuộc chắc chắn vào aggregate event của parent.

---

## 10. Lifecycle khi value thay đổi

Mental model rút gọn của `updateValueAndValidity()`:

```text
Control cập nhật value
        ↓
Chạy sync validators
        ↓
Gán errors
        ↓
Tính status
        ↓
Nếu đủ điều kiện, chạy async validator
và chuyển status sang PENDING
        ↓
Emit valueChanges và statusChanges
        ↓
Nếu onlySelf không phải true,
parent cập nhật value và status
```

Khi async validator emit:

```text
Angular nhận errors hoặc null
        ↓
Tính lại status của control và ancestors
        ↓
statusChanges emit kết quả mới
```

`valueChanges` không phát lần thứ hai chỉ vì async validation hoàn thành.

`_calculateStatus()` có thể trả về:

```text
DISABLED
INVALID
PENDING
VALID
```

Parent có thể `PENDING` vì một descendant đang chạy async validator.

---

## 11. emitEvent

Nhiều API nhận option:

```ts
control.setValue(value, {
  emitEvent: false
});
```

`emitEvent: false`:

```text
- Vẫn cập nhật value.
- Vẫn chạy validation.
- Vẫn cập nhật state cần thiết.
- Không emit valueChanges/statusChanges cho thao tác đó.
```

Ứng dụng phổ biến:

```ts
this.form.controls.total.setValue(total, {
  emitEvent: false
});
```

để tránh một derived value kích hoạt lại subscription tạo ra nó.

Không dùng `emitEvent: false` như cách chữa mọi loop. Trước tiên phải xác định ownership của value và hướng data flow.

---

## 12. onlySelf

```ts
control.updateValueAndValidity({
  onlySelf: true
});
```

`onlySelf: true` giới hạn propagation lên parent trong thao tác đó:

```text
Control hiện tại cập nhật
→ Parent chưa được yêu cầu tính lại từ lời gọi này
```

Phù hợp khi cập nhật một batch control rồi chủ động update parent một lần. Dùng sai có thể khiến parent value/status tạm thời không đồng bộ với child.

---

## 13. updateOn

```ts
updateOn: 'change' | 'blur' | 'submit'
```

```text
change
→ Cập nhật theo input event.

blur
→ Hoãn cập nhật cho tới khi control blur.

submit
→ Hoãn cập nhật cho tới khi form submit.
```

`updateOn: 'blur'` thường hữu ích với async validator để tránh gọi API theo từng ký tự. Không dùng nó chỉ để che một validator quá nặng hoặc API thiếu thiết kế phù hợp.

Group có thể đặt default cho descendants:

```ts
form = new FormGroup(
  {
    username: new FormControl(''),
    email: new FormControl('')
  },
  {
    updateOn: 'blur'
  }
);
```

Control có option riêng có thể override strategy được kế thừa.

---

## 14. Disabled trong lifecycle

```ts
control.disable();
```

Mặc định có thể làm:

```text
- Control chuyển DISABLED.
- Parent tính lại aggregate value/status.
- valueChanges/statusChanges emit.
```

Có thể tắt event:

```ts
control.disable({
  emitEvent: false
});
```

Disabled không xóa value nội bộ. Khi enable lại, control chạy validation và tham gia aggregate state của parent.

---

## 15. Cleanup subscription

```ts
private readonly destroyRef = inject(DestroyRef);

ngOnInit(): void {
  this.form.controls.customerType.valueChanges
    .pipe(
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe(customerType => {
      this.updateTaxCodeRules(customerType);
    });
}
```

Không phải mọi subscription đều cần viết tay; template `async` pipe tự quản lý lifecycle. Subscription trong component/service phải có ownership và teardown rõ ràng.

---

## 16. Checklist debug

```text
[ ] Error nằm ở control, group hay array?
[ ] Validator có đang sửa value hoặc tạo side effect không?
[ ] Dynamic validator đã gọi updateValueAndValidity chưa?
[ ] Async validator có emit kết quả không?
[ ] Form có đang PENDING không?
[ ] updateOn là change, blur hay submit?
[ ] emitEvent có bị tắt không?
[ ] onlySelf có ngăn parent cập nhật không?
[ ] Control có đang disabled không?
[ ] Logic đang subscribe child nhưng đọc aggregate parent quá sớm không?
[ ] Subscription có được cleanup không?
```
