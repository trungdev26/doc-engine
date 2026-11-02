# Angular Forms

## 1. Form là một mô hình trạng thái

Một form không chỉ là nơi lấy giá trị từ các ô nhập liệu. Angular Forms quản lý đồng thời:

```text
Value
→ Dữ liệu hiện tại của control.

Validation
→ Dữ liệu có thỏa mãn các quy tắc hay không.

Interaction state
→ Người dùng đã sửa hoặc rời khỏi field chưa.

Control tree
→ Quan hệ giữa field, group và danh sách động.

Data flow
→ Dữ liệu đi từ model xuống UI và từ UI trở lại model.
```

Ví dụ:

```html
<input formControlName="fullName" />
```

Element `<input>` chỉ là phần giao diện. `FormControl` phía sau mới là object giữ value, validation errors và các trạng thái của field.

Mental model:

```text
Form model                     Giao diện

FormGroup
└── FormControl  ←──────────→  input
       value                   DOM value
       status                  class/error message
       errors
       touched
       dirty
```

Angular đồng bộ hai phía thông qua các directive như `formGroup`, `formControlName` và một value accessor phù hợp với control giao diện.

---

## 2. Template-driven Forms và Reactive Forms

Angular hỗ trợ hai cách xây dựng form.

### 2.1. Template-driven Forms

Form model chủ yếu được mô tả trong template:

```html
<form #userForm="ngForm" (ngSubmit)="submit()">
  <input
    name="fullName"
    [(ngModel)]="user.fullName"
    required
  />

  <button type="submit" [disabled]="userForm.invalid">
    Lưu
  </button>
</form>
```

Angular tạo `FormControl` phía sau các `NgModel`:

```text
NgForm
└── NgModel
    └── FormControl
```

Template-driven Forms phù hợp với form nhỏ, ít rule động và không cần điều phối nhiều luồng observable.

### 2.2. Reactive Forms

Form model được tạo tường minh trong TypeScript:

```ts
form = new FormGroup({
  fullName: new FormControl('', {
    nonNullable: true,
    validators: [Validators.required]
  }),
  email: new FormControl('', {
    nonNullable: true,
    validators: [Validators.email]
  })
});
```

```html
<form [formGroup]="form" (ngSubmit)="submit()">
  <input formControlName="fullName" />
  <input formControlName="email" />

  <button type="submit">Lưu</button>
</form>
```

Reactive Forms phù hợp khi cần:

```text
- Typed form model.
- Validation phức tạp hoặc thay đổi theo nghiệp vụ.
- FormArray và control động.
- valueChanges và statusChanges.
- Test form model độc lập với DOM.
- Custom form control bằng ControlValueAccessor.
```

Các phần tiếp theo tập trung vào Reactive Forms.

---

## 3. Thiết lập Reactive Forms

Với ứng dụng dùng NgModule, module chứa component form cần import `ReactiveFormsModule`:

```ts
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';

@NgModule({
  imports: [ReactiveFormsModule]
})
export class PatientModule {}
```

Nếu thiếu import, Angular không nhận ra các directive như:

```text
[formGroup]
formControlName
[formControl]
formArrayName
```

---

## 4. AbstractControl và control tree

`AbstractControl` là base class của các loại control chính:

```text
AbstractControl
├── FormControl
├── FormGroup
├── FormArray
└── FormRecord
```

Nó cung cấp contract chung:

```text
value
status
errors
valid / invalid
pending
enabled / disabled
pristine / dirty
touched / untouched
valueChanges
statusChanges
```

Không tạo `AbstractControl` trực tiếp. Ứng dụng sử dụng các class con tùy theo shape dữ liệu.

---

## 5. FormControl

`FormControl` biểu diễn một giá trị độc lập.

```ts
fullName = new FormControl('', {
  nonNullable: true
});
```

```html
<input [formControl]="fullName" />
```

Đọc và thay đổi value:

```ts
console.log(this.fullName.value);

this.fullName.setValue('Nguyễn Văn An');
this.fullName.reset();
```

### 5.1. Nullability

Control sau có value type là `string | null`:

```ts
name = new FormControl('');
```

Angular đưa `null` vào type vì:

```ts
this.name.reset();
```

mặc định reset value về `null`.

Khi dùng `nonNullable`:

```ts
name = new FormControl('', {
  nonNullable: true
});
```

value có type `string`, và:

```ts
this.name.setValue('An');
this.name.reset();
```

sẽ reset về initial value `''`, không phải `null`.

Đây vừa là lựa chọn type vừa là lựa chọn runtime behavior.

### 5.2. FormControlState

Có thể khởi tạo đồng thời value và disabled state:

```ts
code = new FormControl(
  {
    value: 'AUTO-001',
    disabled: true
  },
  {
    nonNullable: true
  }
);
```

Object `{ value, disabled }` là form state, không phải value thật của control.

```ts
this.code.value;
// 'AUTO-001'
```

---

## 6. FormGroup

`FormGroup` quản lý một object có tập key xác định trước:

```ts
patientForm = new FormGroup({
  code: new FormControl('', {
    nonNullable: true
  }),
  fullName: new FormControl('', {
    nonNullable: true
  }),
  birthDate: new FormControl<Date | null>(null)
});
```

Shape của value:

```ts
{
  code: string;
  fullName: string;
  birthDate: Date | null;
}
```

Template:

```html
<form [formGroup]="patientForm">
  <input formControlName="code" />
  <input formControlName="fullName" />
  <input formControlName="birthDate" />
</form>
```

`formControlName` tìm control theo tên trong `FormGroup` gần nhất do `[formGroup]` cung cấp.

Luồng:

```text
[formGroup]="patientForm"
        ↓
FormGroupDirective giữ group hiện tại
        ↓
formControlName="fullName"
        ↓
Tìm patientForm.controls.fullName
        ↓
Kết nối control với element
```

### 6.1. Truy cập control

Ưu tiên property typed:

```ts
this.patientForm.controls.fullName
```

Khi dùng path động hoặc nested path:

```ts
this.patientForm.get('address.city')
```

`get()` trả về `AbstractControl | null`, nên property typed thường an toàn hơn khi key đã biết lúc compile.

---

## 7. Nested FormGroup

Object lồng nhau được biểu diễn bằng group lồng nhau:

```ts
patientForm = new FormGroup({
  fullName: new FormControl('', {
    nonNullable: true
  }),
  address: new FormGroup({
    provinceId: new FormControl<number | null>(null),
    districtId: new FormControl<number | null>(null)
  })
});
```

```html
<form [formGroup]="patientForm">
  <input formControlName="fullName" />

  <section formGroupName="address">
    <input formControlName="provinceId" />
    <input formControlName="districtId" />
  </section>
</form>
```

Control tree:

```text
patientForm
├── fullName
└── address
    ├── provinceId
    └── districtId
```

Khi một control con thay đổi, group cha tính lại aggregate value và status.

---

## 8. FormArray

`FormArray` quản lý một danh sách control có cùng vai trò:

```ts
phones = new FormArray([
  new FormControl('', {
    nonNullable: true
  })
]);
```

Thêm và xóa:

```ts
addPhone(): void {
  this.phones.push(
    new FormControl('', {
      nonNullable: true
    })
  );
}

removePhone(index: number): void {
  this.phones.removeAt(index);
}
```

Đặt trong form:

```ts
patientForm = new FormGroup({
  fullName: new FormControl('', {
    nonNullable: true
  }),
  phones: this.phones
});
```

Template:

```html
<form [formGroup]="patientForm">
  <div formArrayName="phones">
    <div
      *ngFor="
        let control of phones.controls;
        let index = index;
        trackBy: trackByControl
      "
    >
      <input [formControlName]="index" />
      <button type="button" (click)="removePhone(index)">
        Xóa
      </button>
    </div>
  </div>
</form>
```

Track bằng identity của control:

```ts
trackByControl(
  index: number,
  control: AbstractControl
): AbstractControl {
  return control;
}
```

Không dùng index làm identity khi có thể thêm hoặc xóa ở giữa array. Index của các row phía sau thay đổi, còn instance control mới là identity ổn định.

---

## 9. FormRecord

`FormRecord` phù hợp khi key không biết trước nhưng các control có cùng type.

Ví dụ danh sách permission:

```ts
permissions = new FormRecord<FormControl<boolean>>({});

addPermission(code: string): void {
  this.permissions.addControl(
    code,
    new FormControl(false, {
      nonNullable: true
    })
  );
}
```

Value:

```ts
{
  'Patients.View': true,
  'Patients.Update': false
}
```

Phân biệt:

```text
FormGroup
→ Key biết trước và mỗi key có thể có type control khác nhau.

FormRecord
→ Key động và các value control cùng type.

FormArray
→ Dữ liệu có thứ tự, truy cập bằng index.
```

---

## 10. FormBuilder

`FormBuilder` giảm phần lặp khi tạo control tree:

```ts
private readonly fb = inject(FormBuilder);

patientForm = this.fb.group({
  code: this.fb.nonNullable.control(''),
  fullName: this.fb.nonNullable.control(''),
  birthDate: this.fb.control<Date | null>(null)
});
```

Khi phần lớn field không nhận `null`, dùng `NonNullableFormBuilder`:

```ts
private readonly fb = inject(NonNullableFormBuilder);

patientForm = this.fb.group({
  code: '',
  fullName: '',
  active: true
});
```

Không chọn FormBuilder chỉ để code ngắn. Dù dùng constructor trực tiếp hay builder, control tree và runtime behavior là như nhau.

---

## 11. Typed Forms

Typed Forms giúp TypeScript kiểm tra shape của form ngay khi compile:

```ts
interface PatientFormControls {
  code: FormControl<string>;
  fullName: FormControl<string>;
  birthDate: FormControl<Date | null>;
}

patientForm = new FormGroup<PatientFormControls>({
  code: new FormControl('', {
    nonNullable: true
  }),
  fullName: new FormControl('', {
    nonNullable: true
  }),
  birthDate: new FormControl<Date | null>(null)
});
```

Các lỗi được phát hiện sớm:

```ts
this.patientForm.controls.code.setValue(123);
// Type error

this.patientForm.patchValue({
  unknownField: true
});
// Type error
```

### 11.1. Form model không nhất thiết giống DTO

Form tối ưu cho interaction của UI:

```ts
interface PatientFormValue {
  fullName: string;
  birthDate: Date | null;
  address: {
    provinceId: number | null;
    districtId: number | null;
  };
}
```

Request DTO có thể cần format khác:

```ts
interface SavePatientRequest {
  fullName: string;
  birthDate: string | null;
  provinceId: number | null;
  districtId: number | null;
}
```

Map tường minh khi submit:

```ts
private toRequest(): SavePatientRequest {
  const value = this.patientForm.getRawValue();

  return {
    fullName: value.fullName.trim(),
    birthDate: value.birthDate
      ? formatDateForApi(value.birthDate)
      : null,
    provinceId: value.address.provinceId,
    districtId: value.address.districtId
  };
}
```

Không ép control tree phải giống DTO nếu điều đó làm UI khó quản lý.

---

## 12. setValue và patchValue

### 12.1. setValue

`setValue()` yêu cầu cung cấp đầy đủ shape:

```ts
this.patientForm.setValue({
  code: 'BN-001',
  fullName: 'Nguyễn Văn An',
  birthDate: null
});
```

Thiếu hoặc thừa key sẽ tạo lỗi.

Phù hợp khi:

```text
- Muốn bảo đảm dữ liệu khớp toàn bộ form.
- Khởi tạo form từ object có shape chính xác.
- Test cần phát hiện thiếu field.
```

### 12.2. patchValue

`patchValue()` cho phép cập nhật một phần:

```ts
this.patientForm.patchValue({
  fullName: 'Nguyễn Văn Bình'
});
```

Phù hợp khi:

```text
- Chỉ cập nhật một số field.
- Dữ liệu đến từ nhiều nguồn.
- Form có control động hoặc optional.
```

Không dùng `patchValue()` để âm thầm bỏ qua việc API và form sai contract. Mapping DTO rõ ràng vẫn là boundary an toàn hơn.

---

## 13. reset và default value

```ts
this.patientForm.reset();
```

Kết quả phụ thuộc nullability và initial value của từng control.

Control nullable:

```ts
new FormControl('An')
→ reset về null
```

Control non-nullable:

```ts
new FormControl('An', { nonNullable: true })
→ reset về 'An'
```

Có thể reset về state cụ thể:

```ts
this.patientForm.reset({
  code: 'AUTO-002',
  fullName: '',
  birthDate: null
});
```

`reset()` cũng đưa interaction state về:

```text
pristine
untouched
```

---

## 14. value và getRawValue

Control disabled không tham gia aggregate value của parent:

```ts
this.patientForm.controls.code.disable();

console.log(this.patientForm.value);
// Không chứa code
```

Muốn lấy cả disabled controls:

```ts
const rawValue = this.patientForm.getRawValue();
```

Phân biệt:

```text
form.value
→ Value tham gia vào form hiện tại.
→ Có thể thiếu disabled controls.

form.getRawValue()
→ Toàn bộ raw value, gồm disabled controls.
```

Không mặc định dùng `getRawValue()` cho mọi request. Disabled có thể mang nghĩa “không được phép gửi”. Quyết định submit field nào phải dựa trên contract của use case.

---

## 15. Interaction state

### 15.1. pristine và dirty

```text
pristine
→ Người dùng chưa thay đổi value qua UI.

dirty
→ Người dùng đã thay đổi value qua UI.
```

`setValue()` bằng code không tự động có nghĩa là người dùng đã sửa field.

Các method:

```ts
control.markAsDirty();
control.markAsPristine();
```

### 15.2. touched và untouched

```text
untouched
→ Control chưa được đánh dấu là đã rời focus.

touched
→ Value accessor đã báo control bị blur,
  hoặc code gọi markAsTouched().
```

Các method:

```ts
control.markAsTouched();
control.markAsUntouched();
form.markAllAsTouched();
```

### 15.3. valid, invalid và pending

```text
VALID
→ Không có validation error.

INVALID
→ Control hoặc descendant có error.

PENDING
→ Đang chờ async validation.

DISABLED
→ Control bị loại khỏi validation và aggregate value của parent.
```

`valid` và `invalid` không mô tả interaction. Một field có thể invalid nhưng vẫn pristine và untouched.

---

## 16. enabled và disabled

```ts
control.disable();
control.enable();
```

Disabled control:

```text
- Có status DISABLED.
- Không chạy validation như enabled control.
- Không tham gia aggregate value/status của parent.
- Vẫn giữ value nội bộ.
```

Không dùng disabled chỉ để che validation error. Disabled phải thể hiện control hiện không tham gia use case hoặc người dùng không được phép chỉnh sửa nó.

---

## 17. Ví dụ hoàn chỉnh

```ts
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  Validators
} from '@angular/forms';

interface ContactControls {
  type: FormControl<'phone' | 'email'>;
  value: FormControl<string>;
}

interface PatientControls {
  code: FormControl<string>;
  fullName: FormControl<string>;
  birthDate: FormControl<Date | null>;
  address: FormGroup<{
    provinceId: FormControl<number | null>;
    districtId: FormControl<number | null>;
  }>;
  contacts: FormArray<FormGroup<ContactControls>>;
}

export class PatientFormComponent {
  readonly form = new FormGroup<PatientControls>({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    birthDate: new FormControl<Date | null>(null),
    address: new FormGroup({
      provinceId: new FormControl<number | null>(null),
      districtId: new FormControl<number | null>(null)
    }),
    contacts: new FormArray<FormGroup<ContactControls>>([])
  });

  addContact(): void {
    this.form.controls.contacts.push(
      new FormGroup<ContactControls>({
        type: new FormControl<'phone' | 'email'>(
          'phone',
          { nonNullable: true }
        ),
        value: new FormControl('', {
          nonNullable: true
        })
      })
    );
  }

  removeContact(index: number): void {
    this.form.controls.contacts.removeAt(index);
  }

  trackByControl(
    index: number,
    control: AbstractControl
  ): AbstractControl {
    return control;
  }
}
```

Control tree:

```text
form
├── code
├── fullName
├── birthDate
├── address
│   ├── provinceId
│   └── districtId
└── contacts
    ├── FormGroup
    │   ├── type
    │   └── value
    └── FormGroup
        ├── type
        └── value
```

---

## 18. Tổng kết

```text
FormControl
→ Một giá trị.

FormGroup
→ Object có key xác định.

FormArray
→ Danh sách có thứ tự.

FormRecord
→ Object có key động và control cùng type.

Typed Forms
→ Kiểm tra shape và value type khi compile.

nonNullable
→ Loại null khỏi type và thay đổi reset behavior.

value
→ Aggregate value đang tham gia form.

getRawValue()
→ Raw value gồm cả disabled controls.
```

Khi đã hiểu control tree, value và interaction state, các chủ đề validation, lifecycle, dynamic forms và ControlValueAccessor sẽ trở thành phần mở rộng tự nhiên của cùng một mô hình.
