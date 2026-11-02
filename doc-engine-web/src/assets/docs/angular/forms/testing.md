# Kiểm thử Angular Forms

## 1. Kiểm thử theo contract

Form có nhiều lớp:

```text
Validator
Control tree
Template binding
Submit workflow
ControlValueAccessor
Accessibility
```

Không phải test nào cũng cần render DOM. Chọn mức test nhỏ nhất chứng minh được contract.

---

## 2. Unit test validator

```ts
describe('noWhitespaceValidator', () => {
  it('trả whitespace error khi chỉ có khoảng trắng', () => {
    const control = new FormControl('   ');

    expect(noWhitespaceValidator(control))
      .toEqual({ whitespace: true });
  });

  it('trả null khi có nội dung', () => {
    const control = new FormControl('Angular');

    expect(noWhitespaceValidator(control))
      .toBeNull();
  });
});
```

Validator test nên có:

```text
- null/empty value.
- boundary value.
- valid value.
- invalid value.
- error key và payload.
- Không sửa control value.
```

### Cross-field validator

```ts
it('invalid khi fromDate lớn hơn toDate', () => {
  const form = new FormGroup(
    {
      fromDate: new FormControl(
        new Date('2026-02-02')
      ),
      toDate: new FormControl(
        new Date('2026-02-01')
      )
    },
    {
      validators: [dateRangeValidator]
    }
  );

  expect(form.getError('dateRange')).toBeTruthy();
  expect(form.controls.fromDate.errors).toBeNull();
  expect(form.controls.toDate.errors).toBeNull();
});
```

Test cũng chứng minh error thuộc group, không bị gắn sai vào child.

---

## 3. Test form factory

```ts
describe('createPatientForm', () => {
  it('tạo default value đúng', () => {
    const form = createPatientForm();

    expect(form.getRawValue()).toEqual({
      code: '',
      fullName: '',
      active: true
    });
  });

  it('fullName required', () => {
    const form = createPatientForm();

    form.controls.fullName.setValue('');

    expect(
      form.controls.fullName.hasError('required')
    ).toBeTrue();
  });

  it('reset non-nullable control về initial value', () => {
    const form = createPatientForm();

    form.controls.active.setValue(false);
    form.reset();

    expect(form.controls.active.value).toBeTrue();
  });
});
```

Factory test nhanh hơn component test và bảo vệ typed control tree, defaults cùng validators.

---

## 4. Test value và state

```ts
it('disabled code không có trong value nhưng có trong raw value', () => {
  const form = createPatientForm();

  form.controls.code.disable();

  expect(form.value.code).toBeUndefined();
  expect(form.getRawValue().code).toBe('');
});
```

```ts
it('markAllAsTouched đánh dấu descendants', () => {
  const form = createPatientForm();

  form.markAllAsTouched();

  expect(form.controls.fullName.touched).toBeTrue();
});
```

Không test private method của Angular. Test behavior public mà application dựa vào.

---

## 5. Test valueChanges

```ts
it('không emit khi patch với emitEvent false', () => {
  const control = new FormControl('');
  const values: Array<string | null> = [];

  control.valueChanges.subscribe(value => {
    values.push(value);
  });

  control.setValue('A', {
    emitEvent: false
  });

  expect(control.value).toBe('A');
  expect(values).toEqual([]);
});
```

Với luồng RxJS có debounce/switchMap, dùng `fakeAsync()` hoặc marble test khi timing là contract quan trọng.

---

## 6. Test async validator

```ts
it('invalid khi username đã tồn tại', fakeAsync(() => {
  userService.exists.and.returnValue(
    of(true).pipe(delay(100))
  );

  const control = new FormControl(
    'admin',
    {
      asyncValidators: [
        usernameAvailableValidator(userService)
      ]
    }
  );

  expect(control.pending).toBeTrue();

  tick(100);

  expect(control.hasError('usernameTaken')).toBeTrue();
  expect(control.status).toBe('INVALID');
}));
```

Các case:

```text
[ ] Sync validator fail thì async policy đúng.
[ ] Status chuyển PENDING.
[ ] Async emit null → VALID.
[ ] Async emit errors → INVALID.
[ ] API error theo đúng policy.
[ ] Value đổi nhanh không dùng kết quả cũ.
```

---

## 7. Component integration test

Host component:

```ts
@Component({
  template: `
    <form
      [formGroup]="form"
      (ngSubmit)="submit()"
    >
      <label for="email">Email</label>
      <input
        id="email"
        formControlName="email"
      />

      <p
        *ngIf="
          form.controls.email.invalid &&
          form.controls.email.touched
        "
      >
        Email không hợp lệ.
      </p>

      <button type="submit">Lưu</button>
    </form>
  `
})
class HostComponent {
  form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.email
      ]
    })
  });

  submit = jasmine.createSpy('submit');
}
```

Test qua DOM:

```ts
it('hiển thị lỗi sau blur', () => {
  const input =
    fixture.nativeElement.querySelector('input');

  input.value = 'invalid';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('blur'));
  fixture.detectChanges();

  expect(
    fixture.nativeElement.textContent
  ).toContain('Email không hợp lệ');
});
```

Test DOM event thay vì gọi trực tiếp handler nếu mục tiêu là chứng minh template đã kết nối đúng với Angular Forms.

---

## 8. Test submit workflow

```text
[ ] Invalid form gọi markAllAsTouched.
[ ] Invalid/PENDING không gọi API.
[ ] Valid form map đúng request DTO.
[ ] Double click không tạo request thứ hai.
[ ] submitting được reset khi success và error.
[ ] Field errors từ backend được map đúng.
[ ] Business error xuất hiện ở form summary.
[ ] Success reset hoặc update snapshot đúng.
```

Không chỉ assert `form.valid`. Submit test cần chứng minh boundary giữa form model và API request.

---

## 9. Test ControlValueAccessor

Test CVA qua một host `FormControl`:

```ts
@Component({
  template: `
    <app-rating [formControl]="control" />
  `
})
class RatingHostComponent {
  control = new FormControl<number | null>(null);
}
```

### Model đẩy xuống

```ts
it('hiển thị value từ FormControl', () => {
  fixture.componentInstance.control.setValue(4);
  fixture.detectChanges();

  const selected = fixture.nativeElement
    .querySelector('[aria-checked="true"]');

  expect(selected.textContent.trim()).toBe('4');
});
```

### User báo value lên

```ts
it('cập nhật FormControl khi user chọn', () => {
  const buttons =
    fixture.nativeElement.querySelectorAll('button');

  buttons[4].click();
  fixture.detectChanges();

  expect(
    fixture.componentInstance.control.value
  ).toBe(5);
});
```

### Disabled

```ts
it('vô hiệu hóa interaction', () => {
  fixture.componentInstance.control.disable();
  fixture.detectChanges();

  const buttons =
    fixture.nativeElement.querySelectorAll('button');

  expect(
    Array.from(buttons)
      .every((button: any) => button.disabled)
  ).toBeTrue();
});
```

### CVA contract matrix

```text
[ ] writeValue cập nhật UI nhưng không emit ngược.
[ ] User interaction gọi onChange đúng một lần.
[ ] Blur gọi onTouched.
[ ] Disabled đồng bộ UI và interaction.
[ ] null/default value render đúng.
[ ] OnPush render external value.
[ ] Inner FormControl không tạo loop.
[ ] Subscription cleanup khi destroy.
```

---

## 10. Accessibility test

Kiểm tra:

```text
- Label liên kết đúng control.
- aria-invalid phản ánh error đang hiển thị.
- aria-describedby trỏ tới error/hint tồn tại.
- Custom CVA dùng role và keyboard phù hợp.
- Disabled state được thông báo.
- Submit lỗi đưa focus tới summary hoặc field.
```

Automated accessibility test hữu ích nhưng không thay thế kiểm tra keyboard và screen reader flow thủ công.

---

## 11. Test matrix tổng thể

| Phạm vi | Điều cần chứng minh |
| --- | --- |
| Validator | Error key, payload và boundary |
| Form factory | Shape, defaults, nullability |
| Control tree | Value/status propagation |
| Dynamic form | Add/remove/reorder và identity |
| Observable | Event count, timing và cleanup |
| Submit | DTO, pending, double submit, errors |
| CVA | Hai chiều dữ liệu, touched, disabled |
| Accessibility | Label, ARIA, keyboard, focus |

Test tốt bảo vệ contract của form với người dùng và API, không khóa implementation vào từng private method.
