# Angular Forms — Bản lưu trước khi tái cấu trúc

## 1. Tổng quan Angular Form

### 1.1. Angular Form là gì?

Angular Form là cơ chế Angular dùng để quản lý dữ liệu nhập liệu của người dùng.

Một form không chỉ có value, mà còn có nhiều trạng thái khác:

```text
- Value hiện tại là gì?
- Field có hợp lệ không?
- User đã sửa field chưa?
- User đã focus rồi blur chưa?
- Field có đang bị disabled không?
- Validator có lỗi gì không?
- Khi value đổi thì xử lý gì?
```

Nói dễ hiểu:

```text
HTML input chỉ là phần giao diện.
Angular Form là phần quản lý model, trạng thái, validation và luồng dữ liệu phía sau input đó.
```

Ví dụ:

```html
<input formControlName="fullName">
```

Phía sau input này là một `FormControl`.

---

### 1.2. Angular có mấy kiểu Form?

Angular có 2 hướng làm form chính:

```text
1. Template-driven Form
2. Reactive Form
```

---

### 1.3. Template-driven Form

Template-driven Form là cách làm form dựa nhiều vào HTML.

```html
<form #form="ngForm">
  <input
    name="fullName"
    [(ngModel)]="user.fullName"
    required
  >

  <button [disabled]="form.invalid">
    Submit
  </button>
</form>
```

Angular sẽ tự tạo các control phía sau dựa trên template.

```text
NgForm
└── NgModel
    └── FormControl
```

Ưu điểm:

```text
- Dễ học
- Code ít
- Phù hợp form đơn giản
```

Nhược điểm:

```text
- Logic validation nằm nhiều trong HTML
- Khó quản lý form lớn
- Khó test
- Khó xử lý dynamic form phức tạp
```

---

### 1.4. Reactive Form

Reactive Form là cách làm form dựa nhiều vào TypeScript.

```ts
form = this.fb.group({
  fullName: ['', Validators.required],
  age: [null]
});
```

HTML:

```html
<form [formGroup]="form">
  <input formControlName="fullName">

  <button [disabled]="form.invalid">
    Submit
  </button>
</form>
```

Mô hình phía sau:

```text
FormGroup
├── fullName: FormControl
└── age: FormControl
```

Ưu điểm:

```text
- Logic tập trung trong TypeScript
- Dễ maintain
- Dễ test
- Dễ làm dynamic form
- Dễ xử lý validation phức tạp
- Phù hợp dự án lớn
```

Nhược điểm:

```text
- Code nhiều hơn Template-driven Form
- Ban đầu học hơi khó hơn
```

---

### 1.5. Nên dùng Template-driven hay Reactive Form?

Với dự án thực tế, đặc biệt là hệ thống lớn, nên ưu tiên Reactive Form.

```text
Template-driven Form:
- Form đơn giản
- Ít logic
- Ít dynamic
- Dự án nhỏ

Reactive Form:
- Form nhiều field
- Validation phức tạp
- Có dynamic add/remove dòng
- Có custom component
- Có logic enable/disable field
- Có tính toán theo valueChanges
- Dễ test và maintain
```

Câu nhớ nhanh:

```text
Form càng lớn, càng nhiều nghiệp vụ, càng nên dùng Reactive Form.
```

---

## 2. Nền tảng Reactive Forms

### 2.1. AbstractControl là gì?

Angular Form được xây trên class nền tên là `AbstractControl`.

Các class quan trọng đều kế thừa từ `AbstractControl`:

```text
AbstractControl
├── FormControl
├── FormGroup
└── FormArray
```

Nghĩa là `FormControl`, `FormGroup`, `FormArray` đều có các thuộc tính chung như:

```text
- value
- valid
- invalid
- errors
- dirty
- pristine
- touched
- untouched
- disabled
- enabled
- valueChanges
- statusChanges
- updateValueAndValidity()
```

---

### 2.2. AbstractControl lifecycle

`AbstractControl lifecycle` là vòng đời Angular xử lý một control mỗi khi value, validator, disabled state hoặc trạng thái của control thay đổi.

Các class như:

```text
FormControl
FormGroup
FormArray
```

đều kế thừa từ `AbstractControl`, nên đều đi qua cơ chế lifecycle này.

Nói dễ hiểu:

```text
AbstractControl lifecycle
= Angular Form xử lý gì sau khi một control thay đổi.
```

Ví dụ khi user nhập vào input:

```text
User input
↓
FormControl nhận value mới
↓
Angular cập nhật value
↓
Chạy validator
↓
Tính lại status
↓
Emit valueChanges / statusChanges
↓
Thông báo lên FormGroup cha
```

---

#### 2.2.1. Vì sao cần học AbstractControl lifecycle?

Nếu chỉ học `FormControl`, `FormGroup`, `valueChanges` riêng lẻ thì dễ biết cách dùng nhưng khó debug.

Khi hiểu lifecycle, mình sẽ giải thích được các câu hỏi kiểu:

```text
Vì sao patchValue lại trigger valueChanges?

Vì sao setValidators rồi mà form chưa invalid?

Vì sao disable control xong field biến mất khỏi form.value?

Vì sao innerControl trong CVA phải setValue(..., { emitEvent: false })?

Vì sao FormGroup cha cũng bị tính lại khi FormControl con đổi?

Vì sao async validator làm status chuyển sang PENDING?
```

Câu nhớ:

```text
AbstractControl lifecycle là phần lõi để hiểu Angular Form chạy bên trong như thế nào.
```

---

#### 2.2.2. Lifecycle tổng quát khi value thay đổi

Ví dụ:

```ts
this.form.get('amount')?.setValue(100000);
```

Lifecycle tổng quát (đúng theo thứ tự trong `AbstractControl.updateValueAndValidity()` của `@angular/forms`):

```text
Value thay đổi
↓
Control cập nhật value nội bộ
↓
Control chạy sync validators
↓
Control tính errors từ kết quả sync validator
↓
Control tính status từ errors
    VALID / INVALID / DISABLED
↓
Nếu status là VALID (hoặc đang PENDING từ trước) và control có async validator
    ↓
    status bị ghi đè thành PENDING
    ↓
    Async validator bắt đầu chạy (bất đồng bộ, không block các bước dưới)
↓
Emit valueChanges nếu emitEvent !== false
↓
Emit statusChanges nếu emitEvent !== false
    (status lúc này là PENDING nếu control có async validator)
↓
Thông báo lên parent FormGroup / FormArray nếu onlySelf !== true
↓
Parent tính lại value/status
```

Lưu ý quan trọng hay bị hiểu sai: **status không "tính ra PENDING"** — `_calculateStatus()` chỉ trả về `VALID`/`INVALID`/`DISABLED`. `PENDING` là do `_runAsyncValidator()` **ghi đè trực tiếp** lên `status` ngay sau đó, trong cùng một lượt `updateValueAndValidity()` đồng bộ.

Vì vậy nếu control có async validator, `valueChanges`/`statusChanges` thực tế bắn ra **2 lần** cho một lần value đổi:

```text
Lần 1 (đồng bộ, ngay trong updateValueAndValidity):
  statusChanges emit PENDING

Lần 2 (bất đồng bộ, khi async validator resolve):
  async validator trả về errors
  ↓
  control.setErrors(errors) được gọi
  ↓
  status tính lại: VALID / INVALID
  ↓
  statusChanges emit VALID / INVALID
```

Tóm gọn:

```text
setValue / patchValue
↓
updateValueAndValidity
↓
validator
↓
status
↓
events
↓
parent update
```

---

#### 2.2.3. Lifecycle khi user nhập từ UI

Ví dụ:

```html
<input formControlName="amount">
```

Khi user nhập `100000`:

```text
User gõ vào input
↓
Input phát DOM event
↓
DefaultValueAccessor nghe event
↓
DefaultValueAccessor báo value mới cho FormControl
↓
FormControl cập nhật value
↓
FormControl chạy validator
↓
FormControl emit valueChanges
↓
FormControl báo lên FormGroup cha
↓
Template có thể được cập nhật qua Change Detection
```

Điểm quan trọng:

```text
Với input thường, Angular đã có CVA mặc định.

DefaultValueAccessor chính là cầu nối giữa input DOM và FormControl.
```

Nên với custom component, mình mới phải tự viết CVA.

---

#### 2.2.4. Lifecycle khi code setValue / patchValue

Ví dụ:

```ts
this.form.patchValue({
  amount: 100000
});
```

Luồng:

```text
Code gọi patchValue
↓
FormControl amount nhận value mới
↓
Control cập nhật value
↓
Control chạy validator
↓
Control emit valueChanges nếu emitEvent !== false
↓
Control báo lên FormGroup cha
↓
Nếu control đang nối với UI qua CVA
    ↓
    Angular gọi writeValue để cập nhật UI
```

Nếu dùng:

```ts
this.form.patchValue({
  amount: 100000
}, {
  emitEvent: false
});
```

Thì:

```text
Value vẫn đổi
Validator vẫn có thể được tính lại
UI vẫn có thể được cập nhật
Nhưng valueChanges / statusChanges không emit
```

Câu nhớ:

```text
emitEvent: false không có nghĩa là không update value.

Nó chỉ chặn việc emit event ra observable.
```

---

#### 2.2.5. updateValueAndValidity là gì?

`updateValueAndValidity()` là method yêu cầu Angular tính lại value và validation của control.

Ví dụ:

```ts
const phoneControl = this.form.get('phone');

phoneControl?.setValidators([Validators.required]);
phoneControl?.updateValueAndValidity();
```

Vì sao phải gọi?

```text
setValidators chỉ thay đổi danh sách validator.

updateValueAndValidity mới bắt Angular chạy lại validator và cập nhật status.
```

Nếu thiếu:

```ts
phoneControl?.setValidators([Validators.required]);
```

thì control có thể chưa chuyển sang `INVALID` ngay.

Đúng:

```ts
phoneControl?.setValidators([Validators.required]);
phoneControl?.updateValueAndValidity();
```

Flow:

```text
setValidators
↓
Danh sách validator thay đổi
↓
updateValueAndValidity
↓
Chạy validator mới
↓
Cập nhật errors
↓
Cập nhật status
↓
Emit statusChanges nếu cần
```

---

#### 2.2.6. Sync validator chạy khi nào?

Sync validator chạy khi Angular cần tính lại validity của control.

Các thời điểm hay gặp:

```text
- User nhập value mới
- setValue / patchValue
- reset
- enable / disable
- setValidators / addValidators / clearValidators rồi gọi updateValueAndValidity
- Parent FormGroup cần tính lại status
```

Ví dụ:

```ts
const ageControl = new FormControl(null, [Validators.required, Validators.min(18)]);
```

Khi value là `null`:

```text
Validator required lỗi
↓
errors = { required: true }
↓
status = INVALID
```

Khi value là `20`:

```text
Validator pass
↓
errors = null
↓
status = VALID
```

---

#### 2.2.7. Async validator chạy khi nào?

Async validator thường chạy sau khi sync validator đã xử lý.

Ví dụ:

```ts
username: [
  '',
  [Validators.required],
  [usernameExistValidator]
]
```

Luồng:

```text
User nhập username
↓
Sync validator chạy trước
↓
Nếu sync validator fail
    ↓
    status = INVALID
    async validator thường không cần chạy
↓
Nếu sync validator pass
    ↓
    status = PENDING
    chạy async validator
↓
API trả về
↓
errors = {...} hoặc null
↓
status = INVALID hoặc VALID
```

Ví dụ status:

```text
PENDING
↓
VALID
```

hoặc:

```text
PENDING
↓
INVALID
```

Câu nhớ:

```text
PENDING thường là dấu hiệu control đang chờ async validator.
```

---

#### 2.2.8. Status được tính như nào?

Một control thường có 4 status chính:

```text
VALID
INVALID
PENDING
DISABLED
```

Ý nghĩa:

```text
VALID:
Không có lỗi validation.

INVALID:
Có lỗi validation.

PENDING:
Đang chờ async validator.

DISABLED:
Control bị disable, không tham gia validation và không nằm trong form.value.
```

Với `FormGroup`, status thường được tổng hợp từ các control con:

```text
Nếu có control con INVALID
→ FormGroup INVALID

Nếu có control con PENDING
→ FormGroup PENDING

Nếu tất cả control con VALID
→ FormGroup VALID

Nếu control bị DISABLED
→ Control đó không tham gia tính validity như control enabled
```

Ví dụ:

```text
FormGroup
├── name: VALID
├── age: INVALID
└── email: VALID

=> FormGroup INVALID
```

---

#### 2.2.9. Parent update là gì?

Khi một `FormControl` con đổi value/status, Angular thường cập nhật cả `FormGroup` cha.

Ví dụ:

```ts
form = this.fb.group({
  quantity: [1],
  price: [100],
  total: [100]
});
```

Khi `quantity` đổi:

```text
quantity FormControl đổi value
↓
quantity chạy validator
↓
quantity emit valueChanges
↓
FormGroup cha tính lại form.value
↓
FormGroup cha tính lại status
↓
form.valueChanges emit
```

Nói dễ hiểu:

```text
Con đổi thì cha phải tính lại.
```

Vì `form.value` là tổng hợp value của các control con.

---

#### 2.2.10. onlySelf là gì trong lifecycle?

`onlySelf` dùng để nói với Angular:

```text
Chỉ update control hiện tại thôi,
đừng lan update lên parent ngay.
```

Ví dụ:

```ts
control.updateValueAndValidity({
  onlySelf: true
});
```

Nếu không có `onlySelf: true`:

```text
Control con update
↓
Parent FormGroup update
↓
Parent của parent cũng update
```

Nếu có `onlySelf: true`:

```text
Control con update
↓
Không lan lên parent
```

Dùng khi:

```text
- Form rất lớn
- Muốn update nhiều control con trước
- Sau đó mới update FormGroup cha một lần
- Muốn tối ưu tránh parent tính lại quá nhiều lần
```

Ví dụ:

```ts
this.form.get('a')?.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});

this.form.get('b')?.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});

this.form.updateValueAndValidity();
```

Ý tưởng:

```text
Update control con im lặng trước.
Sau đó update form cha một lần.
```

---

#### 2.2.11. emitEvent là gì trong lifecycle?

`emitEvent` quyết định Angular có emit qua observable hay không.

Các observable thường liên quan:

```text
valueChanges
statusChanges
events
```

Mặc định:

```text
emitEvent = true
```

Ví dụ:

```ts
this.form.get('amount')?.setValue(100000);
```

Thường sẽ làm:

```text
amount.valueChanges emit
form.valueChanges emit
statusChanges emit nếu status đổi
```

Nếu dùng:

```ts
this.form.get('amount')?.setValue(100000, {
  emitEvent: false
});
```

Thì:

```text
amount value vẫn đổi
form value vẫn đổi
validator vẫn có thể được tính
nhưng valueChanges/statusChanges không emit
```

Hay dùng khi:

```text
- Patch dữ liệu ban đầu từ API
- Auto tính field khác
- Tránh loop trong valueChanges
- Đồng bộ value vào innerControl trong CVA
- Bulk update nhiều field
```

Ví dụ tránh loop:

```ts
this.form.get('quantity')?.valueChanges.subscribe(() => {
  this.calculateTotal();
});

this.form.get('price')?.valueChanges.subscribe(() => {
  this.calculateTotal();
});

calculateTotal(): void {
  const quantity = this.form.get('quantity')?.value || 0;
  const price = this.form.get('price')?.value || 0;

  this.form.patchValue({
    total: quantity * price
  }, {
    emitEvent: false
  });
}
```

Câu nhớ:

```text
emitEvent: false không chặn update value.

Nó chỉ chặn phát sự kiện ra ngoài.
```

---

#### 2.2.12. updateOn ảnh hưởng lifecycle như nào?

Mặc định Angular update control theo `change`.

Có 3 mode:

```text
change
blur
submit
```

Ví dụ:

```ts
email: ['', {
  validators: [Validators.required, Validators.email],
  updateOn: 'blur'
}]
```

Nếu `updateOn: 'change'`:

```text
User gõ từng ký tự
↓
FormControl update từng lần
↓
Validator chạy từng lần
↓
valueChanges emit từng lần
```

Nếu `updateOn: 'blur'`:

```text
User gõ
↓
Control chưa update ngay theo từng phím
↓
User blur khỏi input
↓
FormControl update value
↓
Validator chạy
↓
valueChanges emit
```

Nếu `updateOn: 'submit'`:

```text
User nhập nhiều field
↓
Control chưa update/validate theo từng lần nhập như mặc định
↓
Submit form
↓
Angular update/validate
```

Dùng `updateOn: 'blur'` khi:

```text
- Field có async validator
- Muốn giảm số lần validate
- Muốn tránh gọi API liên tục
- Field không cần realtime validation
```

---

#### 2.2.13. Disabled ảnh hưởng lifecycle như nào?

Khi gọi:

```ts
this.form.get('age')?.disable();
```

Control sẽ:

```text
status = DISABLED
không tham gia validation
không xuất hiện trong form.value
```

Ví dụ:

```ts
form = this.fb.group({
  name: ['Trung'],
  age: [{ value: 30, disabled: true }]
});
```

```ts
console.log(this.form.value);
```

Kết quả:

```ts
{
  name: 'Trung'
}
```

Muốn lấy cả disabled field:

```ts
console.log(this.form.getRawValue());
```

Kết quả:

```ts
{
  name: 'Trung',
  age: 30
}
```

Điểm cần nhớ:

```text
Disabled không chỉ là khóa UI.

Disabled làm control bị loại khỏi validation và form.value.
```

Với CVA:

```ts
setDisabledState(isDisabled: boolean): void {
  if (isDisabled) {
    this.innerControl.disable({ emitEvent: false });
  } else {
    this.innerControl.enable({ emitEvent: false });
  }
}
```

---

#### 2.2.14. Lifecycle trong CVA liên quan gì?

CVA có 2 chiều:

```text
FormControl cha → Component
Component → FormControl cha
```

##### Chiều FormControl cha đẩy xuống component

Ví dụ:

```ts
this.form.patchValue({
  userId: 1
});
```

Luồng:

```text
FormControl cha update value
↓
Angular gọi writeValue(1)
↓
Custom component nhận value
↓
Custom component set vào UI nội bộ
```

Nếu component có `innerControl`:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });
}
```

Vì đây là value từ cha đẩy xuống.

Không nên để `innerControl.valueChanges` emit rồi gọi ngược lại `onChange`.

---

##### Chiều component báo value lên FormControl cha

User chọn trong select nội bộ:

```text
User chọn option
↓
innerControl value đổi
↓
innerControl.valueChanges emit
↓
component gọi this.onChange(value)
↓
FormControl cha nhận value mới
↓
FormControl cha đi qua lifecycle:
    update value
    validator
    status
    valueChanges
    parent update
```

Câu chốt:

```text
CVA không thay lifecycle của Angular Form.

CVA chỉ là cầu nối để value đi vào lifecycle đúng cách.
```

---

#### 2.2.15. Lifecycle khi thêm/xóa validator runtime

Ví dụ:

```ts
const taxCodeControl = this.form.get('taxCode');

if (customerType === 'COMPANY') {
  taxCodeControl?.setValidators([Validators.required]);
} else {
  taxCodeControl?.clearValidators();
}

taxCodeControl?.updateValueAndValidity();
```

Nếu không gọi:

```ts
taxCodeControl?.updateValueAndValidity();
```

thì Angular có thể chưa tính lại `errors/status` ngay theo validator mới.

Flow đúng:

```text
Điều kiện nghiệp vụ đổi
↓
setValidators / clearValidators
↓
updateValueAndValidity
↓
Control chạy lại validator
↓
errors/status cập nhật
↓
Parent FormGroup cập nhật nếu onlySelf !== true
```

Nếu không muốn emit event:

```ts
taxCodeControl?.updateValueAndValidity({
  emitEvent: false
});
```

Nếu không muốn lan lên parent ngay:

```ts
taxCodeControl?.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});
```

---

#### 2.2.16. Lifecycle khi FormArray thay đổi

Với FormArray:

```ts
items = this.fb.array([]);
```

Khi thêm control:

```ts
this.items.push(this.fb.group({
  productId: [null],
  quantity: [1],
  price: [0]
}));
```

Lifecycle:

```text
FormArray thêm control con
↓
FormArray tính lại value
↓
FormArray tính lại status
↓
Parent FormGroup tính lại nếu có
↓
valueChanges/statusChanges emit nếu không bị chặn
```

Khi xóa:

```ts
this.items.removeAt(index);
```

Lifecycle:

```text
Control con bị remove
↓
FormArray value thay đổi
↓
FormArray status tính lại
↓
Parent update
```

Điểm cần chú ý:

```text
FormArray nhiều dòng có thể gây nhiều lần update.

Nên dùng emitEvent: false trong một số thao tác bulk.
```

Ví dụ bulk add:

```ts
data.forEach(item => {
  this.items.push(this.createItemForm(item), {
    emitEvent: false
  });
});

this.items.updateValueAndValidity();
```

---

#### 2.2.17. Các lỗi hay gặp do không hiểu lifecycle

##### Lỗi 1: setValidators xong không thấy form invalid

Sai:

```ts
control.setValidators([Validators.required]);
```

Đúng:

```ts
control.setValidators([Validators.required]);
control.updateValueAndValidity();
```

---

##### Lỗi 2: patchValue trong valueChanges gây loop

Sai:

```ts
this.form.valueChanges.subscribe(value => {
  this.form.patchValue({
    total: value.quantity * value.price
  });
});
```

Đúng:

```ts
this.form.patchValue({
  total
}, {
  emitEvent: false
});
```

---

##### Lỗi 3: CVA innerControl quên emitEvent false

Sai:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value);
}
```

Đúng:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });
}
```

---

##### Lỗi 4: Disable field xong submit thiếu field

Nguyên nhân:

```text
Disabled field không nằm trong form.value.
```

Nếu cần lấy cả disabled field:

```ts
this.form.getRawValue();
```

---

##### Lỗi 5: Async validator làm form PENDING lâu

Nguyên nhân có thể:

```text
- API chưa trả về
- Observable không complete
- Gọi API quá nhiều
- Không handle lỗi API
```

Nên:

```text
- Dùng updateOn: 'blur'
- debounce nếu tự xử lý valueChanges
- catchError trả về null hoặc error hợp lệ
```

---

#### 2.2.18. Checklist debug AbstractControl lifecycle

Khi form chạy sai, debug theo thứ tự:

```text
1. Value có đổi thật không?
   control.value
   form.value
   form.getRawValue()

2. Control có disabled không?
   control.disabled
   control.status

3. Validator có đang được set không?
   control.errors
   control.validator

4. Có gọi updateValueAndValidity sau khi đổi validator không?

5. valueChanges có emit không?
   Có đang dùng emitEvent: false không?

6. Parent FormGroup có được update không?
   Có đang dùng onlySelf: true không?

7. Async validator có làm status PENDING không?

8. Với CVA:
   writeValue có chạy không?
   onChange có được gọi khi user thay đổi không?
   innerControl có bị emit ngược khi writeValue không?

9. Với disabled field:
   Có đang lấy form.value thay vì getRawValue không?
```

---

#### 2.2.19. Câu tổng kết

```text
AbstractControl lifecycle là luồng xử lý lõi của Angular Form.

Mỗi lần value/status/validator/disabled thay đổi,
Angular sẽ cập nhật value, chạy validator, tính status, emit event và cập nhật parent.

Muốn làm form lớn, CVA, dynamic validator, FormArray, performance tốt,
phải hiểu rõ các điểm sau:

- updateValueAndValidity
- emitEvent
- onlySelf
- updateOn
- disabled vs enabled
- valueChanges / statusChanges
- parent update
```

Câu nhớ nhanh:

```text
FormControl đổi không chỉ là đổi value.

Nó kéo theo validator, status, event và parent FormGroup.
```

---

### 2.3. FormControl là gì?

FormControl là object đại diện cho một field trong Angular Form.

Nếu input trên UI là:

```html
<input formControlName="amount">
```

thì phía sau nó là:

```ts
amount: FormControl
```

FormControl không chỉ lưu value, mà còn lưu toàn bộ trạng thái của field:

```text
- value: giá trị hiện tại
- valid / invalid: hợp lệ hay không
- dirty / pristine: user đã sửa chưa
- touched / untouched: user đã focus rồi blur chưa
- disabled / enabled: có bị disable không
- errors: lỗi validation
- valueChanges: Observable emit khi value đổi
- statusChanges: Observable emit khi trạng thái đổi
```

Nói dễ hiểu:

```text
<input> là ô nhập liệu trên màn hình.
FormControl là bộ não đứng sau ô nhập liệu đó.
```

Ví dụ:

```ts
const amountControl = new FormControl(null);
amountControl.setValue(100000);

console.log(amountControl.value);
// 100000
```

Khi gắn với Reactive Form:

```ts
form = new FormGroup({
  amount: new FormControl(null)
});
```

```html
<form [formGroup]="form">
  <input formControlName="amount">
</form>
```

Luồng hoạt động:

```text
User nhập vào input
↓
FormControl amount cập nhật value
↓
form.value cũng cập nhật
↓
valueChanges emit
↓
validator chạy lại
```

Điểm quan trọng:

```text
FormControl là nơi giữ value thật của field.
UI chỉ là nơi hiển thị và cho user thao tác.
```

---

### 2.4. FormControl khác gì biến thường?

Biến thường:

```ts
amount = null;
```

Chỉ lưu value.

FormControl:

```ts
amountControl = new FormControl(null);
```

Lưu nhiều thứ hơn:

```ts
amountControl.value;
amountControl.valid;
amountControl.invalid;
amountControl.errors;
amountControl.dirty;
amountControl.touched;
amountControl.disabled;
amountControl.valueChanges;
amountControl.statusChanges;
```

Nói ngắn gọn:

```text
Biến thường chỉ giữ dữ liệu.
FormControl quản lý cả dữ liệu, trạng thái và validation của field.
```

---

### 2.5. FormGroup là gì?

FormGroup là object gom nhiều control lại thành một form hoặc một nhóm field.

```ts
form = new FormGroup({
  fullName: new FormControl(''),
  age: new FormControl(null)
});
```

Mô hình:

```text
FormGroup
├── fullName: FormControl
└── age: FormControl
```

Khi lấy value:

```ts
console.log(this.form.value);
```

Kết quả:

```ts
{
  fullName: 'Trung',
  age: 30
}
```

---

### 2.6. Nested FormGroup

FormGroup có thể lồng FormGroup khác.

```ts
form = new FormGroup({
  fullName: new FormControl(''),
  address: new FormGroup({
    provinceId: new FormControl(null),
    districtId: new FormControl(null)
  })
});
```

Mô hình:

```text
FormGroup
├── fullName: FormControl
└── address: FormGroup
    ├── provinceId: FormControl
    └── districtId: FormControl
```

HTML:

```html
<form [formGroup]="form">
  <input formControlName="fullName">

  <div formGroupName="address">
    <input formControlName="provinceId">
    <input formControlName="districtId">
  </div>
</form>
```

---

### 2.7. FormArray là gì?

FormArray dùng khi số lượng phần tử thay đổi động.

Ví dụ:

```text
- Danh sách số điện thoại
- Danh sách dịch vụ
- Danh sách hàng hóa
- Danh sách người phụ thuộc
- Danh sách file upload
```

Code:

```ts
phones = new FormArray([
  new FormControl('')
]);
```

Thêm phần tử:

```ts
this.phones.push(new FormControl(''));
```

Xóa phần tử:

```ts
this.phones.removeAt(index);
```

Ví dụ trong FormGroup:

```ts
form = this.fb.group({
  fullName: [''],
  phones: this.fb.array([])
});

get phones(): FormArray {
  return this.form.get('phones') as FormArray;
}

addPhone(): void {
  this.phones.push(this.fb.control(''));
}

removePhone(index: number): void {
  this.phones.removeAt(index);
}
```

HTML:

```html
<div formArrayName="phones">
  <div *ngFor="let phone of phones.controls; let i = index">
    <input [formControlName]="i">
    <button type="button" (click)="removePhone(i)">Xóa</button>
  </div>
</div>

<button type="button" (click)="addPhone()">Thêm số điện thoại</button>
```

---

### 2.8. FormBuilder là gì?

`FormBuilder` là helper giúp tạo form ngắn gọn hơn.

Không dùng FormBuilder:

```ts
form = new FormGroup({
  fullName: new FormControl(''),
  age: new FormControl(null)
});
```

Dùng FormBuilder:

```ts
form = this.fb.group({
  fullName: [''],
  age: [null]
});
```

Inject:

```ts
constructor(private fb: FormBuilder) {}
```

---

## 3. Quản lý value và state

### 3.1. setValue và patchValue

Angular Form có 2 cách set value hay dùng:

```text
- setValue()
- patchValue()
```

#### 3.1.1. setValue

`setValue` yêu cầu truyền đủ toàn bộ field.

```ts
form = this.fb.group({
  fullName: [''],
  age: [null]
});
```

Đúng:

```ts
this.form.setValue({
  fullName: 'Trung',
  age: 30
});
```

Sai:

```ts
this.form.setValue({
  fullName: 'Trung'
});
```

Vì thiếu `age`.

#### 3.1.2. patchValue

`patchValue` cho phép cập nhật một phần.

```ts
this.form.patchValue({
  fullName: 'Trung'
});
```

Không lỗi dù thiếu `age`.

#### 3.1.3. Khi nào dùng gì?

```text
setValue:
- Khi muốn chắc chắn object truyền vào đủ cấu trúc form
- Nếu thiếu field thì báo lỗi ngay

patchValue:
- Khi chỉ muốn update một phần form
- Khi dữ liệu API trả về không đủ field
- Khi update từng field riêng lẻ
```

Trong thực tế dùng `patchValue` nhiều hơn.

---

### 3.2. reset

`reset` đưa form về trạng thái ban đầu.

```ts
this.form.reset();
```

Có thể reset kèm value:

```ts
this.form.reset({
  fullName: '',
  age: null
});
```

Sau reset:

```text
- value được reset
- dirty về false
- touched về false
- form trở lại pristine/untouched
```

---

### 3.3. value và getRawValue

`form.value` không lấy các disabled control.

```ts
form = this.fb.group({
  name: ['Trung'],
  age: [{ value: 30, disabled: true }]
});

console.log(form.value);
```

Kết quả:

```ts
{
  name: 'Trung'
}
```

Muốn lấy cả disabled field:

```ts
console.log(form.getRawValue());
```

Kết quả:

```ts
{
  name: 'Trung',
  age: 30
}
```

---

### 3.4. dirty và pristine

`dirty` nghĩa là user đã thay đổi value của control.

```text
Ban đầu:
dirty = false
pristine = true

User sửa value:
dirty = true
pristine = false
```

Ví dụ dùng để cảnh báo:

```text
Bạn có thay đổi chưa lưu, có chắc muốn rời trang?
```

---

### 3.5. touched và untouched

`touched` nghĩa là user đã focus vào field rồi blur ra.

```text
User click vào input
↓
User click ra ngoài
↓
control.touched = true
```

Hay dùng để hiển thị lỗi validation:

```html
<div *ngIf="control.touched && control.invalid">
  Field không hợp lệ
</div>
```

---

### 3.6. valid, invalid và errors

Control có validator thì Angular tính trạng thái:

```ts
name = new FormControl('', Validators.required);
```

Ban đầu:

```ts
name.valid;
// false

name.invalid;
// true

name.errors;
// { required: true }
```

Sau khi nhập value:

```ts
name.setValue('Trung');
```

Kết quả:

```ts
name.valid;
// true

name.invalid;
// false

name.errors;
// null
```

---

### 3.7. disabled và enabled

Disable control:

```ts
this.form.get('amount')?.disable();
```

Enable control:

```ts
this.form.get('amount')?.enable();
```

Điểm quan trọng:

```text
Control disabled sẽ không tham gia validation.
Control disabled cũng không xuất hiện trong form.value.
```

---

## 4. Observable, validation và options nâng cao

### 4.1. valueChanges

`valueChanges` là Observable emit mỗi khi value thay đổi.

```ts
this.form.get('keyword')?.valueChanges.subscribe(value => {
  console.log(value);
});
```

User nhập:

```text
a
ab
abc
```

Emit:

```text
a
ab
abc
```

Ứng dụng thực tế:

```text
- Search realtime
- Tính tổng tiền
- Auto fill dữ liệu
- Enable/disable field khác
- Validate logic phụ thuộc field khác
```

Ví dụ search có debounce:

```ts
this.form.get('keyword')?.valueChanges
  .pipe(
    debounceTime(300),
    distinctUntilChanged()
  )
  .subscribe(keyword => {
    this.search(keyword);
  });
```

---

### 4.2. statusChanges

`statusChanges` emit khi trạng thái validation đổi.

Các trạng thái hay gặp:

```text
VALID
INVALID
PENDING
DISABLED
```

Ví dụ:

```ts
this.form.statusChanges.subscribe(status => {
  console.log(status);
});
```

---

### 4.3. Validator built-in

Angular có sẵn nhiều validator:

```ts
Validators.required
Validators.min(10)
Validators.max(100)
Validators.email
Validators.pattern(...)
Validators.minLength(3)
Validators.maxLength(50)
```

Ví dụ:

```ts
form = this.fb.group({
  email: ['', [Validators.required, Validators.email]],
  age: [null, [Validators.min(18)]]
});
```

---

### 4.4. Custom Validator

Custom validator là function nhận vào `AbstractControl` và trả về:

```text
null nếu hợp lệ
object lỗi nếu không hợp lệ
```

Ví dụ:

```ts
export function ageValidator(control: AbstractControl) {
  const value = control.value;

  if (value == null) {
    return null;
  }

  return value < 18
    ? { underAge: true }
    : null;
}
```

Dùng:

```ts
form = this.fb.group({
  age: [null, ageValidator]
});
```

Kiểm tra lỗi:

```html
<div *ngIf="form.get('age')?.errors?.['underAge']">
  Tuổi phải lớn hơn hoặc bằng 18
</div>
```

---

### 4.5. Validator phụ thuộc nhiều field

Ví dụ validate ngày bắt đầu phải nhỏ hơn ngày kết thúc.

```ts
export function dateRangeValidator(group: AbstractControl) {
  const fromDate = group.get('fromDate')?.value;
  const toDate = group.get('toDate')?.value;

  if (!fromDate || !toDate) {
    return null;
  }

  return fromDate <= toDate
    ? null
    : { invalidDateRange: true };
}
```

Dùng ở FormGroup:

```ts
form = this.fb.group({
  fromDate: [null],
  toDate: [null]
}, {
  validators: [dateRangeValidator]
});
```

---

### 4.6. Async Validator

Async Validator dùng khi cần validate bất đồng bộ, ví dụ gọi API.

Ví dụ kiểm tra username đã tồn tại chưa:

```ts
export function usernameExistValidator(service: UserService): AsyncValidatorFn {
  return (control: AbstractControl) => {
    if (!control.value) {
      return of(null);
    }

    return service.checkUsername(control.value).pipe(
      map(exists => exists ? { usernameExists: true } : null)
    );
  };
}
```

Dùng:

```ts
form = this.fb.group({
  username: [
    '',
    [Validators.required],
    [usernameExistValidator(this.userService)]
  ]
});
```

Flow:

```text
User nhập username
↓
Sync validator chạy trước
↓
Nếu pass, async validator chạy
↓
Control status = PENDING
↓
API trả về
↓
VALID hoặc INVALID
```

---

### 4.7. updateValueAndValidity

`updateValueAndValidity()` dùng để bắt Angular tính lại value và validation.

Ví dụ thay đổi validator động:

```ts
const phoneControl = this.form.get('phone');

phoneControl?.setValidators([Validators.required]);
phoneControl?.updateValueAndValidity();
```

Nếu không gọi `updateValueAndValidity`, validator mới có thể chưa chạy ngay.

---

### 4.8. Dynamic Validator

Ví dụ chọn loại khách hàng là công ty thì bắt buộc nhập mã số thuế.

```ts
this.form.get('customerType')?.valueChanges.subscribe(type => {
  const taxCodeControl = this.form.get('taxCode');

  if (type === 'COMPANY') {
    taxCodeControl?.setValidators([Validators.required]);
  } else {
    taxCodeControl?.clearValidators();
    taxCodeControl?.reset();
  }

  taxCodeControl?.updateValueAndValidity();
});
```

---

### 4.9. emitEvent

Nhiều method có option `emitEvent`.

```ts
this.form.patchValue({
  amount: 100000
}, {
  emitEvent: false
});
```

Nghĩa là:

```text
Value vẫn đổi,
nhưng valueChanges không emit.
```

Hay dùng khi:

```text
- Patch dữ liệu init form
- Tránh trigger logic valueChanges không cần thiết
- Tránh loop khi auto tính toán field
```

Ví dụ loop dễ gặp:

```ts
this.form.get('quantity')?.valueChanges.subscribe(() => {
  this.calculateTotal();
});

this.form.get('price')?.valueChanges.subscribe(() => {
  this.calculateTotal();
});

calculateTotal(): void {
  const quantity = this.form.get('quantity')?.value || 0;
  const price = this.form.get('price')?.value || 0;

  this.form.patchValue({
    total: quantity * price
  }, {
    emitEvent: false
  });
}
```

---

### 4.10. onlySelf

`onlySelf` nghĩa là chỉ cập nhật control hiện tại, không lan lên parent.

```ts
control.updateValueAndValidity({
  onlySelf: true
});
```

Bình thường khi một FormControl đổi value/status, FormGroup cha cũng tính lại.

Nếu dùng `onlySelf: true`, Angular hạn chế lan truyền lên cha.

Thực tế ít dùng hơn `emitEvent`, nhưng cần biết khi tối ưu form phức tạp.

---

### 4.11. updateOn

Mặc định Angular update FormControl theo event `change`.

Có thể cấu hình:

```text
change
blur
submit
```

Ví dụ update khi blur:

```ts
form = this.fb.group({
  email: ['', {
    validators: [Validators.required, Validators.email],
    updateOn: 'blur'
  }]
});
```

Ý nghĩa:

```text
User đang gõ thì chưa update/validate liên tục.
Khi blur khỏi input thì mới update/validate.
```

Dùng khi:

```text
- Field gọi async validator
- Muốn giảm số lần validate
- Muốn tránh call API liên tục
```

---

### 4.12. markAsTouched và markAllAsTouched

Khi submit form mà muốn hiển thị lỗi toàn bộ field:

```ts
submit(): void {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  // submit
}
```

`markAsTouched` dùng cho một control:

```ts
this.form.get('email')?.markAsTouched();
```

`markAllAsTouched` dùng cho toàn bộ cây form:

```ts
this.form.markAllAsTouched();
```

---

### 4.13. Validation nâng cao trong Angular Form

Validation trong Angular Form không chỉ là `required`, `min`, `max`.

Ở dự án thực tế, validation thường liên quan đến nghiệp vụ:

```text
- Field A bắt buộc khi Field B có giá trị nhất định
- Ngày bắt đầu phải nhỏ hơn ngày kết thúc
- Số lượng xuất không được lớn hơn tồn kho
- Mã khách hàng không được trùng
- Danh sách dịch vụ không được có dòng trùng
- Tổng tiền không được vượt hạn mức
- Nếu chọn loại khách hàng là công ty thì bắt buộc nhập mã số thuế
```

Nói dễ hiểu:

```text
Validator là nơi biến rule nghiệp vụ thành rule kiểm tra dữ liệu trong form.
```

---

#### 4.13.1. Validator có mấy loại?

Trong Angular Form thường có 4 nhóm validator chính:

```text
1. Built-in Validator
   Validator có sẵn của Angular.

2. Custom Validator cho một field
   Kiểm tra logic riêng của một FormControl.

3. Cross-field Validator
   Kiểm tra logic liên quan nhiều field trong cùng FormGroup.

4. Async Validator
   Kiểm tra bất đồng bộ, thường là gọi API.
```

Ví dụ:

```text
Built-in:
- required
- min
- max
- email
- pattern

Custom field validator:
- tuổi phải >= 18
- số lượng phải là số nguyên dương

Cross-field validator:
- fromDate <= toDate
- password và confirmPassword phải giống nhau

Async validator:
- username đã tồn tại chưa
- mã khách hàng có bị trùng không
```

---

#### 4.13.2. Bản chất của Validator

Validator là một function nhận vào `AbstractControl`.

Nếu hợp lệ thì trả về:

```ts
null
```

Nếu không hợp lệ thì trả về object mô tả lỗi:

```ts
{
  errorName: true
}
```

Ví dụ:

```ts
export function positiveNumberValidator(control: AbstractControl) {
  const value = control.value;

  if (value == null || value === '') {
    return null;
  }

  return value > 0
    ? null
    : { positiveNumber: true };
}
```

Dùng:

```ts
quantity: [null, [positiveNumberValidator]]
```

Khi lỗi:

```ts
control.errors
```

sẽ là:

```ts
{
  positiveNumber: true
}
```

Câu nhớ:

```text
Validator không trả về true/false.

Validator trả về null nếu hợp lệ,
và trả về object lỗi nếu không hợp lệ.
```

---

#### 4.13.3. Tại sao lỗi validator là object?

Vì một control có thể có nhiều lỗi cùng lúc.

Ví dụ:

```ts
name: ['', [
  Validators.required,
  Validators.minLength(3)
]]
```

Nếu value rỗng, errors có thể là:

```ts
{
  required: true
}
```

Nếu value là `"ab"`:

```ts
{
  minlength: {
    requiredLength: 3,
    actualLength: 2
  }
}
```

Với custom validator, mình cũng có thể trả thêm thông tin:

```ts
export function maxQuantityValidator(max: number): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value;

    if (value == null) {
      return null;
    }

    return value <= max
      ? null
      : {
          maxQuantity: {
            max,
            actual: value
          }
        };
  };
}
```

Khi lỗi:

```ts
{
  maxQuantity: {
    max: 100,
    actual: 120
  }
}
```

Lợi ích:

```text
UI có thể hiển thị message chi tiết hơn.
```

---

#### 4.13.4. Custom Validator có tham số

Nhiều validator cần truyền tham số.

Ví dụ validate số lượng không vượt quá tồn kho:

```ts
export function stockValidator(stock: number): ValidatorFn {
  return (control: AbstractControl) => {
    const quantity = control.value;

    if (quantity == null) {
      return null;
    }

    return quantity <= stock
      ? null
      : {
          exceedStock: {
            stock,
            actual: quantity
          }
        };
  };
}
```

Dùng:

```ts
quantity: [null, [
  Validators.required,
  stockValidator(100)
]]
```

Nếu nhập `120`, lỗi là:

```ts
{
  exceedStock: {
    stock: 100,
    actual: 120
  }
}
```

Hiển thị lỗi:

```html
<div *ngIf="form.get('quantity')?.errors?.['exceedStock'] as error">
  Số lượng xuất không được vượt quá tồn kho.
  Tồn hiện tại: {{ error.stock }},
  số lượng nhập: {{ error.actual }}.
</div>
```

---

#### 4.13.5. Validator cho một field

Dùng khi rule chỉ phụ thuộc vào chính field đó.

Ví dụ tuổi phải từ 18 trở lên:

```ts
export function adultValidator(control: AbstractControl) {
  const age = control.value;

  if (age == null) {
    return null;
  }

  return age >= 18
    ? null
    : { underAge: true };
}
```

Dùng:

```ts
form = this.fb.group({
  age: [null, [Validators.required, adultValidator]]
});
```

HTML:

```html
<div *ngIf="form.get('age')?.errors?.['underAge']">
  Tuổi phải từ 18 trở lên
</div>
```

Pattern:

```text
Nếu rule chỉ liên quan đến một field
→ đặt validator ở FormControl đó.
```

---

#### 4.13.6. Cross-field Validator là gì?

Cross-field Validator là validator kiểm tra nhiều field cùng lúc.

Ví dụ:

```text
fromDate phải nhỏ hơn hoặc bằng toDate
```

Rule này không thể đặt riêng ở `fromDate` hoặc `toDate`.

Nó phải đặt ở `FormGroup`.

Ví dụ:

```ts
export function dateRangeValidator(group: AbstractControl) {
  const fromDate = group.get('fromDate')?.value;
  const toDate = group.get('toDate')?.value;

  if (!fromDate || !toDate) {
    return null;
  }

  return fromDate <= toDate
    ? null
    : { invalidDateRange: true };
}
```

Dùng:

```ts
form = this.fb.group({
  fromDate: [null, Validators.required],
  toDate: [null, Validators.required]
}, {
  validators: [dateRangeValidator]
});
```

Lỗi nằm ở FormGroup:

```ts
form.errors
```

có thể là:

```ts
{
  invalidDateRange: true
}
```

HTML:

```html
<div *ngIf="form.errors?.['invalidDateRange']">
  Từ ngày phải nhỏ hơn hoặc bằng đến ngày
</div>
```

Câu nhớ:

```text
Rule liên quan nhiều field
→ đặt validator ở FormGroup.
```

---

#### 4.13.7. Cross-field Validator set lỗi vào field con có nên không?

Có 2 cách xử lý lỗi cross-field.

##### Cách 1: Lỗi nằm ở FormGroup

Ví dụ:

```ts
return { invalidDateRange: true };
```

Ưu điểm:

```text
- Đúng bản chất vì lỗi thuộc về quan hệ giữa nhiều field
- Ít can thiệp vào errors của field con
- Dễ maintain hơn
```

Nhược điểm:

```text
- UI cần check form.errors
- Không highlight trực tiếp một field cụ thể nếu không xử lý thêm
```

---

##### Cách 2: Set lỗi vào field con

Ví dụ muốn lỗi hiển thị ngay dưới `toDate`.

```ts
export function dateRangeValidator(group: AbstractControl) {
  const fromDateControl = group.get('fromDate');
  const toDateControl = group.get('toDate');

  const fromDate = fromDateControl?.value;
  const toDate = toDateControl?.value;

  if (!fromDate || !toDate) {
    return null;
  }

  if (fromDate > toDate) {
    toDateControl?.setErrors({
      ...toDateControl.errors,
      invalidDateRange: true
    });

    return { invalidDateRange: true };
  }

  if (toDateControl?.errors?.['invalidDateRange']) {
    const errors = { ...toDateControl.errors };
    delete errors['invalidDateRange'];

    toDateControl.setErrors(
      Object.keys(errors).length ? errors : null
    );
  }

  return null;
}
```

Cách này phải rất cẩn thận vì `setErrors` có thể ghi đè lỗi khác.

Ví dụ field `toDate` đang có lỗi `required`, nếu mình set errors không đúng sẽ làm mất lỗi `required`.

Câu khuyên dùng:

```text
Nếu mới học hoặc muốn code sạch:
ưu tiên để lỗi cross-field ở FormGroup.

Chỉ set lỗi vào field con khi UI thật sự cần highlight field đó.
```

---

#### 4.13.8. Dynamic Validator là gì?

Dynamic Validator là validator thay đổi theo điều kiện nghiệp vụ.

Ví dụ:

```text
Nếu customerType = COMPANY
→ taxCode bắt buộc

Nếu customerType = PERSONAL
→ taxCode không bắt buộc
```

Code:

```ts
ngOnInit(): void {
  this.form.get('customerType')?.valueChanges.subscribe(type => {
    const taxCodeControl = this.form.get('taxCode');

    if (type === 'COMPANY') {
      taxCodeControl?.setValidators([
        Validators.required,
        Validators.pattern(/^[0-9]{10,13}$/)
      ]);
    } else {
      taxCodeControl?.clearValidators();
      taxCodeControl?.reset(null, {
        emitEvent: false
      });
    }

    taxCodeControl?.updateValueAndValidity();
  });
}
```

Điểm quan trọng:

```text
setValidators / clearValidators chỉ thay đổi danh sách validator.

Muốn Angular chạy lại validator mới,
phải gọi updateValueAndValidity().
```

---

#### 4.13.9. setValidators, addValidators, clearValidators khác gì?

##### setValidators

Ghi đè toàn bộ validator hiện tại.

```ts
control.setValidators([Validators.required]);
```

Nếu trước đó có validator khác, nó sẽ bị thay thế.

---

##### addValidators

Thêm validator mới, không xóa validator cũ.

```ts
control.addValidators([Validators.required]);
```

Dùng khi muốn bổ sung rule mà vẫn giữ rule cũ.

---

##### clearValidators

Xóa toàn bộ sync validators.

```ts
control.clearValidators();
```

Sau khi dùng các hàm trên, thường cần:

```ts
control.updateValueAndValidity();
```

Câu nhớ:

```text
Đổi validator xong
→ gọi updateValueAndValidity.
```

---

#### 4.13.10. Dynamic Validator và emitEvent

Khi thay đổi validator động, đôi khi không muốn `valueChanges/statusChanges` emit quá nhiều.

Ví dụ:

```ts
taxCodeControl?.updateValueAndValidity({
  emitEvent: false
});
```

Ý nghĩa:

```text
Validator vẫn chạy lại.
errors/status vẫn được cập nhật.
Nhưng valueChanges/statusChanges không emit ra ngoài.
```

Nếu đang update nhiều field cùng lúc:

```ts
controlA.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});

controlB.updateValueAndValidity({
  onlySelf: true,
  emitEvent: false
});

this.form.updateValueAndValidity();
```

Ý tưởng:

```text
Update các control con im lặng trước.
Sau đó update FormGroup cha một lần.
```

---

#### 4.13.11. Validator cho FormArray

FormArray thường cần validate các rule kiểu:

```text
- Phải có ít nhất một dòng
- Không được có dòng trùng sản phẩm
- Tổng số lượng phải lớn hơn 0
- Mỗi dòng phải đủ thông tin
```

Ví dụ validate FormArray phải có ít nhất một item:

```ts
export function minArrayLengthValidator(min: number): ValidatorFn {
  return (control: AbstractControl) => {
    const formArray = control as FormArray;

    return formArray.length >= min
      ? null
      : {
          minArrayLength: {
            min,
            actual: formArray.length
          }
        };
  };
}
```

Dùng:

```ts
items = this.fb.array([], [
  minArrayLengthValidator(1)
]);
```

HTML:

```html
<div *ngIf="items.errors?.['minArrayLength']">
  Cần có ít nhất một dòng
</div>
```

---

#### 4.13.12. Validator không cho trùng sản phẩm trong FormArray

Ví dụ FormArray gồm nhiều dòng hàng hóa:

```ts
items = this.fb.array([
  this.fb.group({
    productId: [null, Validators.required],
    quantity: [1, Validators.required]
  })
]);
```

Validator:

```ts
export function duplicateProductValidator(control: AbstractControl) {
  const formArray = control as FormArray;

  const productIds = formArray.controls
    .map(group => group.get('productId')?.value)
    .filter(productId => productId != null);

  const uniqueIds = new Set(productIds);

  return uniqueIds.size === productIds.length
    ? null
    : { duplicateProduct: true };
}
```

Dùng:

```ts
items = this.fb.array([], [
  duplicateProductValidator
]);
```

Khi có sản phẩm trùng:

```ts
items.errors
```

là:

```ts
{
  duplicateProduct: true
}
```

Câu nhớ:

```text
Rule liên quan toàn bộ danh sách
→ đặt validator ở FormArray.
```

---

#### 4.13.13. Async Validator là gì?

Async Validator dùng khi cần kiểm tra bất đồng bộ.

Thường là gọi API.

Ví dụ:

```text
- Username đã tồn tại chưa?
- Mã khách hàng có trùng không?
- Mã phiếu có hợp lệ trên server không?
- Số thẻ BHYT có tồn tại không?
```

Async validator trả về:

```text
Observable<ValidationErrors | null>
```

hoặc:

```text
Promise<ValidationErrors | null>
```

Ví dụ:

```ts
export function usernameExistsValidator(
  userService: UserService
): AsyncValidatorFn {
  return (control: AbstractControl) => {
    const username = control.value;

    if (!username) {
      return of(null);
    }

    return userService.exists(username).pipe(
      map(exists => {
        return exists
          ? { usernameExists: true }
          : null;
      }),
      catchError(() => of(null))
    );
  };
}
```

Dùng:

```ts
username: [
  '',
  [Validators.required],
  [usernameExistsValidator(this.userService)]
]
```

---

#### 4.13.14. Async Validator và trạng thái PENDING

Khi async validator chạy:

```text
Control status = PENDING
```

Flow:

```text
User nhập username
↓
Sync validator chạy
↓
Nếu sync validator pass
↓
Async validator chạy
↓
status = PENDING
↓
API trả về
↓
status = VALID hoặc INVALID
```

UI có thể hiển thị loading:

```html
<div *ngIf="form.get('username')?.pending">
  Đang kiểm tra username...
</div>
```

Câu nhớ:

```text
PENDING thường nghĩa là control đang chờ async validator hoàn thành.
```

---

#### 4.13.15. Async Validator nên dùng updateOn: blur

Nếu async validator gọi API mỗi lần user gõ, rất dễ gọi API quá nhiều.

Ví dụ không tối ưu:

```text
User gõ: trung
↓
t
tr
tru
trun
trung
↓
Có thể gọi API nhiều lần
```

Nên dùng:

```ts
username: ['', {
  validators: [Validators.required],
  asyncValidators: [usernameExistsValidator(this.userService)],
  updateOn: 'blur'
}]
```

Flow:

```text
User gõ username
↓
Chưa gọi API liên tục
↓
User blur khỏi input
↓
Async validator mới chạy
```

Dùng khi:

```text
- Check trùng mã
- Check username/email
- Check mã voucher
- Check số giấy tờ
```

---

#### 4.13.16. Async Validator phải complete

Async validator cần Observable hoàn thành.

Nếu Observable không complete, control có thể bị `PENDING` lâu.

Ví dụ nên dùng API HTTP vì HTTP Observable tự complete.

Nếu tự tạo stream, nên đảm bảo có kết thúc.

Ví dụ:

```ts
return this.userService.exists(username).pipe(
  take(1),
  map(exists => exists ? { usernameExists: true } : null),
  catchError(() => of(null))
);
```

Câu nhớ:

```text
Async validator không trả kết quả xong
→ control có thể bị PENDING.
```

---

#### 4.13.17. Error message reusable

Trong form lớn, không nên viết message lỗi rải rác khắp HTML.

Có thể tạo helper:

```ts
getErrorMessage(control: AbstractControl | null): string | null {
  if (!control || !control.errors) {
    return null;
  }

  const errors = control.errors;

  if (errors['required']) {
    return 'Trường này là bắt buộc';
  }

  if (errors['email']) {
    return 'Email không hợp lệ';
  }

  if (errors['minlength']) {
    return `Tối thiểu ${errors['minlength'].requiredLength} ký tự`;
  }

  if (errors['exceedStock']) {
    return `Số lượng không được vượt quá tồn kho ${errors['exceedStock'].stock}`;
  }

  return 'Dữ liệu không hợp lệ';
}
```

HTML:

```html
<div class="error" *ngIf="control.touched && control.invalid">
  {{ getErrorMessage(control) }}
</div>
```

Pattern tốt hơn trong dự án lớn:

```text
Tách error message thành service/helper riêng.
Không hard-code message validation ở quá nhiều chỗ.
```

---

#### 4.13.18. Khi nào hiển thị lỗi?

Không nên hiển thị lỗi ngay từ lúc form vừa mở.

Thường dùng điều kiện:

```text
control.invalid && (control.touched || control.dirty)
```

Ví dụ:

```html
<div *ngIf="control.invalid && (control.touched || control.dirty)">
  {{ getErrorMessage(control) }}
</div>
```

Khi submit, nếu muốn show tất cả lỗi:

```ts
submit(): void {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  const dto = this.form.getRawValue();
  this.save(dto);
}
```

Câu nhớ:

```text
Khi user chưa tương tác, không nên show lỗi quá sớm.

Khi submit, markAllAsTouched để show toàn bộ lỗi.
```

---

#### 4.13.19. Validation ở Form hay ở Backend?

Frontend validation giúp UX tốt hơn.

Backend validation đảm bảo an toàn dữ liệu.

Không nên chỉ validate ở frontend.

```text
Frontend validation:
- Báo lỗi nhanh cho user
- Giảm request sai
- Tăng trải nghiệm nhập liệu

Backend validation:
- Là lớp bảo vệ cuối cùng
- Không tin dữ liệu từ client
- Đảm bảo rule nghiệp vụ nhất quán
```

Ví dụ:

```text
Frontend check số lượng xuất <= tồn kho hiện tại.

Backend vẫn phải check lại vì tồn kho có thể đổi do user khác vừa thao tác.
```

Câu nhớ:

```text
Frontend validation là để hỗ trợ người dùng.

Backend validation là để bảo vệ hệ thống.
```

---

#### 4.13.20. Checklist thiết kế validation trong form lớn

Khi thiết kế validation cho form lớn, nên tự hỏi:

```text
1. Rule này thuộc một field hay nhiều field?

2. Nếu một field:
   đặt validator ở FormControl.

3. Nếu nhiều field:
   đặt validator ở FormGroup.

4. Nếu cả danh sách:
   đặt validator ở FormArray.

5. Nếu cần gọi API:
   dùng Async Validator hoặc xử lý valueChanges riêng.

6. Rule có thay đổi theo điều kiện không?
   dùng dynamic validator.

7. Sau khi đổi validator runtime,
   đã gọi updateValueAndValidity chưa?

8. Có cần chặn emit event không?
   dùng emitEvent: false.

9. Có field disabled không?
   submit dùng form.value hay getRawValue?

10. Error message hiển thị ở đâu?
    field-level hay form-level?

11. Có cần markAllAsTouched khi submit không?

12. Rule này backend có validate lại không?
```

---

#### 4.13.21. Câu tổng kết

```text
Validation nâng cao trong Angular Form là cách đưa rule nghiệp vụ vào form.

Một field thì validate ở FormControl.

Nhiều field thì validate ở FormGroup.

Danh sách thì validate ở FormArray.

Cần gọi API thì dùng Async Validator.

Rule thay đổi theo điều kiện thì dùng dynamic validator.

Đổi validator runtime xong phải nhớ updateValueAndValidity.
```

Câu nhớ nhanh:

```text
Đừng chỉ hỏi "field này required không?"

Hãy hỏi:
"Rule nghiệp vụ này thuộc field, group, array hay server?"
```

---

## 5. Typed Forms

### 5.1. Typed Forms

Angular hỗ trợ Typed Forms để form có type rõ hơn.

```ts
form = new FormGroup({
  fullName: new FormControl<string>(''),
  age: new FormControl<number | null>(null)
});
```

Khi đó:

```ts
const fullName = this.form.controls.fullName.value;
// string | null tùy cách khai báo
```

Dùng NonNullable:

```ts
form = new FormGroup({
  fullName: new FormControl('', { nonNullable: true })
});
```

Khi đó `fullName.value` là `string`, không phải `string | null`.

Với FormBuilder:

```ts
form = this.fb.nonNullable.group({
  fullName: '',
  email: ''
});
```

Typed Forms giúp:

```text
- Giảm lỗi runtime
- Dễ autocomplete
- Dễ maintain form lớn
```

---

### 5.2. FormRecord

`FormRecord` phù hợp khi key động nhưng cùng kiểu control.

Ví dụ object quyền theo mã chức năng:

```ts
permissions = new FormRecord<FormControl<boolean>>({});

addPermission(code: string): void {
  this.permissions.addControl(code, new FormControl(false, { nonNullable: true }));
}
```

Khi value:

```ts
{
  CREATE_ORDER: true,
  DELETE_ORDER: false
}
```

Dùng khi số lượng field động và key không cố định.

---

# ControlValueAccessor

---

## 6. ControlValueAccessor cơ bản

### 6.1. Hiểu đúng về FormControl trước khi học CVA

Trước khi học CVA, cần hiểu lại FormControl cho đúng.

FormControl không phải một "biến chứa value" đơn giản.

FormControl là:

```text
- Một object
- Lưu value
- Lưu status (valid/invalid, dirty/pristine, touched/untouched...)
- Có thể lắng nghe thay đổi qua valueChanges
- Có thể bị set value từ bên ngoài (setValue/patchValue)
- Có thể báo value mới ra ngoài khi có ai đó thay đổi nó
```

Nói cách khác, FormControl có 2 chiều giao tiếp:

```text
1. Ai đó gọi setValue/patchValue
   → FormControl đổi value
   → Cần có cách "đẩy" value mới này ra UI

2. User thao tác trên UI
   → Value đổi
   → Cần có cách "báo" value mới này về FormControl
```

Với `<input>` thường, Angular đã viết sẵn 2 chiều này (DefaultValueAccessor).

Với custom component, Angular không biết UI bên trong component trông như thế nào, nên không thể tự nối 2 chiều đó.

CVA chính là chỗ mình tự viết 2 chiều giao tiếp này cho custom component.

```text
FormControl (model, đã có sẵn)
   ↕  2 chiều giao tiếp (CVA tự viết)
Custom Component (UI, tự định nghĩa)
```

Hiểu đúng FormControl trước, thì học CVA chỉ còn là: viết code nối 2 chiều giao tiếp đó cho đúng.

---

### 6.2. ControlValueAccessor là gì?

ControlValueAccessor, viết tắt là CVA, là interface giúp Angular Form giao tiếp với custom component.

Angular Form hiểu input thường:

```html
<input formControlName="name">
```

Nhưng với custom component:

```html
<app-money-input formControlName="amount"></app-money-input>
```

Angular không tự biết:

```text
- Gán value vào component kiểu gì?
- Khi user nhập thì lấy value mới như nào?
- Khi user blur thì mark touched ra sao?
- Khi form disable thì component disable kiểu gì?
```

CVA sinh ra để giải quyết việc này.

Mô hình:

```text
FormControl
   ↕
ControlValueAccessor
   ↕
Custom Component UI
```

Nói dễ hiểu:

```text
FormControl là model.
Custom component là UI.
CVA là adapter đứng giữa.
```

---

### 6.3. Vì sao nz-select, nz-date-picker dùng được formControlName?

Vì nội bộ các component như:

```html
<nz-select formControlName="departmentId"></nz-select>
<nz-date-picker formControlName="birthDate"></nz-date-picker>
<nz-input-number formControlName="price"></nz-input-number>
```

đều implement ControlValueAccessor.

Chúng có logic tương tự:

```text
- writeValue()
- registerOnChange()
- registerOnTouched()
- setDisabledState()
```

Nên Angular Form có thể điều khiển được chúng như input thường.

---

### 6.4. Interface ControlValueAccessor

CVA có 4 hàm chính:

```ts
export interface ControlValueAccessor {
  writeValue(obj: any): void;

  registerOnChange(fn: any): void;

  registerOnTouched(fn: any): void;

  setDisabledState?(isDisabled: boolean): void;
}
```

Ý nghĩa:

```text
writeValue:
FormControl đẩy value xuống component.

registerOnChange:
Angular đưa callback để component báo value mới lên FormControl.

registerOnTouched:
Angular đưa callback để component báo user đã touched.

setDisabledState:
FormControl điều khiển disabled/enabled của component.
```

---

## 7. CVA dưới góc nhìn luồng dữ liệu

### 7.1. Đẩy value xuống và báo value lên trong Angular Form

Trong Angular Form luôn có 2 chiều dữ liệu:

```text
1. FormControl → Component
   = đẩy value xuống

2. Component → FormControl
   = báo value lên
```

Đây là phần rất quan trọng khi học ControlValueAccessor.

---

### 7.2. Đẩy value xuống là gì?

Đẩy value xuống nghĩa là:

```text
FormControl chủ động đưa giá trị hiện tại của nó xuống UI component.
```

Ví dụ:

```ts
this.form.patchValue({
  amount: 100000
});
```

Lúc này `FormControl amount` có value mới là `100000`.

Nếu field đó đang dùng custom component:

```html
<app-money-input formControlName="amount"></app-money-input>
```

Angular sẽ gọi vào CVA:

```ts
writeValue(100000)
```

Flow:

```text
form.patchValue({ amount: 100000 })
↓
FormControl amount đổi value
↓
Angular gọi CVA.writeValue(100000)
↓
app-money-input cập nhật UI
↓
Màn hình hiển thị 100,000
```

Nói ngắn gọn:

```text
FormControl là nguồn dữ liệu.
Component chỉ nhận value và render ra UI.
```

---

### 7.3. Báo value lên là gì?

Báo value lên nghĩa là:

```text
User thao tác trong UI component,
component phải báo giá trị mới ngược lại cho FormControl.
```

Ví dụ user nhập trong component:

```text
200000
```

Component phải gọi:

```ts
this.onChange(200000);
```

Flow:

```text
User nhập 200000 trong app-money-input
↓
Component parse value = 200000
↓
Component gọi this.onChange(200000)
↓
FormControl amount nhận value mới
↓
amount.valueChanges emit
↓
validator chạy lại
↓
form.value cập nhật
```

Nói ngắn gọn:

```text
Component/UI là nơi phát sinh thay đổi.
FormControl nhận lại value mới.
```

---

### 7.4. So sánh đẩy value xuống và báo value lên

| Nội dung | Đẩy value xuống | Báo value lên |
|---|---|---|
| Nguồn thay đổi | Code / FormControl | User thao tác UI |
| Chiều dữ liệu | FormControl → Component | Component → FormControl |
| CVA dùng hàm nào | writeValue() | onChange() |
| Ai gọi | Angular Forms gọi component | Component gọi lại Angular Forms |
| Ví dụ | setValue, patchValue, init form | user nhập, chọn option, xóa file |
| Mục tiêu | Render value ra UI | Cập nhật value thật trong FormControl |

Câu nhớ nhanh:

```text
Đẩy value xuống:
FormControl là nguồn sự thật.
Component chỉ hiển thị.
Dùng writeValue.

Báo value lên:
User/UI là nơi phát sinh thay đổi.
Component phải báo lại cho FormControl.
Dùng this.onChange(value).
```

---

### 7.5. writeValue là gì?

`writeValue` là hàm Angular gọi khi FormControl muốn đẩy value xuống component.

Ví dụ bên ngoài:

```ts
this.form.patchValue({
  amount: 100000
});
```

Angular gọi vào component:

```ts
writeValue(100000)
```

Component nhận value và hiển thị:

```ts
writeValue(value: number | null): void {
  this.value = value;
  this.displayValue = value != null ? value.toLocaleString('en-US') : '';
}
```

Flow:

```text
FormControl → writeValue → Component UI
```

Điểm quan trọng:

```text
writeValue chỉ nhận value từ FormControl xuống.
Không gọi onChange trong writeValue.
```

---

### 7.6. registerOnChange là gì?

`registerOnChange` là hàm Angular gọi để truyền callback cho component.

Callback này dùng để component báo value mới lên FormControl khi user thay đổi value.

```ts
registerOnChange(fn: any): void {
  this.onChange = fn;
}
```

Nói dễ hiểu:

```text
Angular đưa cho component một callback.
Component lưu callback đó lại.
Khi user thay đổi value trong UI,
component gọi callback đó để báo value mới lên FormControl.
```

---

### 7.7. Bản chất hàm onChange là gì?

Trong CVA hay có đoạn:

```ts
private onChange = (value: any) => {};
```

Bản chất `onChange` là:

```text
Một callback do Angular Form đưa cho component,
để component gọi lại khi user thay đổi value.
```

Nó không phải hàm đặc biệt bắt buộc phải tên là `onChange`.

Đây chỉ là biến function mình tự khai báo để giữ callback Angular truyền vào.

Ví dụ:

```ts
private onChange = (value: number | null) => {};

registerOnChange(fn: any): void {
  this.onChange = fn;
}
```

Ban đầu `onChange` là function rỗng:

```ts
private onChange = (value: any) => {};
```

Mục đích là tránh lỗi nếu component gọi trước khi Angular kịp truyền callback.

Sau đó Angular gọi:

```ts
registerOnChange(fn)
```

và truyền vào function thật.

Mình lưu lại:

```ts
this.onChange = fn;
```

Từ lúc đó:

```ts
this.onChange(value);
```

chính là gọi vào function nội bộ của Angular Form.

Flow:

```text
User nhập value mới
↓
Component gọi this.onChange(value)
↓
Angular Form nhận callback
↓
FormControl.value được cập nhật
↓
Validator chạy lại
↓
valueChanges emit
↓
form.value cập nhật
```

Câu nhớ nhanh:

```text
registerOnChange(fn)
= Angular đưa callback cho component.

onChange
= biến component dùng để giữ callback đó.

this.onChange(value)
= component báo value mới lên FormControl.
```

Hoặc:

```text
onChange là cái loa để component thông báo:
"FormControl ơi, value mới đây này."
```

Một cách hình dung khác, dễ nhớ hơn:

```text
FormControl       = sổ dữ liệu chính
Custom component  = nhân viên nhập liệu
registerOnChange  = Angular phát cho nhân viên 1 số hotline
onChange          = chính số hotline đó
this.onChange(value) = nhân viên gọi hotline báo số liệu mới
```

Diễn giải:

```text
- Nhân viên (component) ngồi trực tiếp nhận thông tin từ user.
- Nhân viên không tự sửa được sổ dữ liệu chính (FormControl).
- Nhân viên chỉ có thể gọi vào hotline để báo: "Số liệu mới là X".
- Tổng đài (Angular Form) nhận tin, tự tay ghi vào sổ dữ liệu chính,
  rồi báo cho toàn bộ hệ thống (validator, valueChanges...) biết.
```

Vì vậy:

```text
- Trước khi registerOnChange được gọi, nhân viên chưa có số hotline
  → gọi this.onChange(value) lúc này không tới đâu cả (function rỗng).

- Sau khi registerOnChange được gọi, nhân viên có số hotline thật
  → this.onChange(value) sẽ tới đúng tổng đài Angular Form.
```

Có thể đặt tên khác:

```ts
private propagateChange = (value: any) => {};

registerOnChange(fn: any): void {
  this.propagateChange = fn;
}

handleInput(value: any): void {
  this.propagateChange(value);
}
```

Vẫn đúng.

Angular không quan tâm biến tên gì.

Angular chỉ quan tâm component có implement `registerOnChange(fn)` và có gọi callback đó khi user đổi value hay không.

---

### 7.8. registerOnChange không trực tiếp update value

Nhiều người nhầm rằng `registerOnChange` là nơi xử lý value.

Thực tế không phải.

```ts
registerOnChange(fn: any): void {
  this.onChange = fn;
}
```

Hàm này chỉ làm nhiệm vụ:

```text
Nhận callback từ Angular Forms
và lưu callback đó lại.
```

Sau này, khi user nhập/chọn/xóa dữ liệu, component mới gọi:

```ts
this.onChange(value);
```

Lúc đó FormControl mới nhận value mới.

Ví dụ đời thường:

```text
Angular nói với component:

"Khi nào user nhập value mới,
em gọi anh qua số điện thoại này nhé."

registerOnChange(fn) chính là lúc Angular đưa số điện thoại.

this.onChange(value) chính là lúc component gọi lại cho Angular.
```

Flow đúng:

```text
Angular gọi registerOnChange(fn)
↓
Component lưu fn vào this.onChange
↓
User thao tác trong component
↓
Component gọi this.onChange(value)
↓
FormControl cha nhận value mới
↓
valueChanges emit
↓
validator chạy lại
```

Câu nhớ nhanh:

```text
registerOnChange không phải nơi cập nhật value.
registerOnChange chỉ là nơi Angular đưa callback cho component.
Component chỉ báo value lên FormControl khi gọi this.onChange(value).
```

---

## 8. Case production: CVA dùng inner FormControl

### 8.1. Case production: CVA dùng inner FormControl với component nội bộ

Đây là pattern rất thực tế khi custom component bên ngoài implement `ControlValueAccessor`, nhưng bên trong lại dùng một component nhập liệu khác.

Ví dụ component nhập liệu bên trong có thể là:

```text
- nz-select
- nz-date-picker
- nz-input-number
- lib-select nội bộ
- lib-date-picker nội bộ
- lib-money-input nội bộ
- lib-user-picker nội bộ
- lib-product-picker nội bộ
```

Trong phần này lấy `nz-select` làm ví dụ để dễ hình dung.

Bên ngoài dùng:

```html
<app-user-select formControlName="userId"></app-user-select>
```

Nhìn từ form cha:

```text
app-user-select được coi như một FormControl duy nhất.
```

Nhưng bên trong `app-user-select`, mình dùng một control nội bộ:

```html
<nz-select [formControl]="innerControl"></nz-select>
```

Nếu là thư viện nội bộ, có thể là:

```html
<lib-select [formControl]="innerControl"></lib-select>
```

Mô hình:

```text
Form cha
└── userId: FormControl
        ↓
        app-user-select: CVA custom component
        ↓
        innerControl: FormControl nội bộ
        ↓
        Component UI nội bộ
        ví dụ: nz-select / lib-select / lib-user-picker
```

Nói dễ hiểu:

```text
Form cha chỉ biết app-user-select là một field.
app-user-select tự quản lý component UI bên trong bằng innerControl.
CVA là cầu nối giữa FormControl cha và innerControl bên trong.
```

#### 8.1.1. Vì sao dùng inner FormControl?

Thay vì bind trực tiếp kiểu:

```html
<nz-select
  [ngModel]="value"
  (ngModelChange)="handleChange($event)"
>
</nz-select>
```

mình có thể dùng Reactive Form nội bộ:

```ts
innerControl = new FormControl<number | null>(null);
```

Template:

```html
<nz-select
  [formControl]="innerControl"
  [nzDisabled]="disabled"
  (nzBlur)="handleBlur()"
  nzPlaceHolder="Chọn người dùng"
>
  <nz-option
    *ngFor="let user of users"
    [nzValue]="user.id"
    [nzLabel]="user.name"
  ></nz-option>
</nz-select>
```

Nếu dùng component nội bộ:

```html
<lib-select
  [formControl]="innerControl"
  [disabled]="disabled"
  (blur)="handleBlur()"
>
</lib-select>
```

Cách này hay hơn khi component bắt đầu phức tạp.

Ưu điểm:

```text
- Sạch theo Reactive Form
- Dễ quản lý valueChanges
- Dễ disable / enable
- Dễ mở rộng validator nội bộ
- Dễ debounce search
- Dễ nâng cấp thành inner FormGroup sau này
```

#### 8.1.2. Code form cha

```ts
form = this.fb.group({
  userId: [null]
});
```

```html
<form [formGroup]="form">
  <app-user-select formControlName="userId"></app-user-select>
</form>
```

Khi submit:

```ts
submit(): void {
  console.log(this.form.value);
}
```

Kết quả mong muốn:

```ts
{
  userId: 1
}
```

Form cha không cần biết bên trong `app-user-select` dùng `nz-select`, `lib-select`, search API, dropdown, loading hay logic gì.

#### 8.1.3. Code app-user-select dùng inner FormControl

```ts
import {
  Component,
  forwardRef,
  OnDestroy,
  OnInit
} from '@angular/core';

import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

import {
  Subject,
  takeUntil
} from 'rxjs';

type UserOption = {
  id: number;
  name: string;
};

@Component({
  selector: 'app-user-select',
  template: `
    <nz-select
      [formControl]="innerControl"
      [nzDisabled]="disabled"
      (nzBlur)="handleBlur()"
      nzPlaceHolder="Chọn người dùng"
    >
      <nz-option
        *ngFor="let user of users"
        [nzValue]="user.id"
        [nzLabel]="user.name"
      ></nz-option>
    </nz-select>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UserSelectComponent),
      multi: true
    }
  ]
})
export class UserSelectComponent
  implements ControlValueAccessor, OnInit, OnDestroy {

  innerControl = new FormControl<number | null>(null);

  disabled = false;

  users: UserOption[] = [
    { id: 1, name: 'Trung' },
    { id: 2, name: 'Linh' }
  ];

  private destroy$ = new Subject<void>();

  private onChange = (value: number | null) => {};
  private onTouched = () => {};

  ngOnInit(): void {
    this.innerControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        this.onChange(value);
      });
  }

  writeValue(value: number | null): void {
    this.innerControl.setValue(value, {
      emitEvent: false
    });
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;

    if (isDisabled) {
      this.innerControl.disable({
        emitEvent: false
      });
    } else {
      this.innerControl.enable({
        emitEvent: false
      });
    }
  }

  handleBlur(): void {
    this.onTouched();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

#### 8.1.4. Luồng Form cha đẩy value xuống

Ví dụ form cha gọi:

```ts
this.form.patchValue({
  userId: 1
});
```

Luồng chạy:

```text
form cha patchValue userId = 1
↓
Angular gọi writeValue(1) của app-user-select
↓
app-user-select gọi innerControl.setValue(1, { emitEvent: false })
↓
component UI nội bộ nhận value từ innerControl
↓
UI hiển thị user có id = 1
```

Trong `writeValue`, phải dùng:

```ts
this.innerControl.setValue(value, {
  emitEvent: false
});
```

Vì đây là chiều:

```text
Form cha → custom component → innerControl → component UI nội bộ
```

Mình chỉ muốn cập nhật UI nội bộ.

Không muốn `innerControl.valueChanges` emit rồi gọi ngược lại `onChange`.

#### 8.1.5. Luồng user chọn option trong component nội bộ

Khi user chọn một option trong `nz-select` hoặc `lib-select`:

```text
User chọn user id = 2
↓
component UI nội bộ cập nhật innerControl value = 2
↓
innerControl.valueChanges emit 2
↓
component gọi this.onChange(2)
↓
FormControl userId ở form cha cập nhật value = 2
↓
form cha valueChanges emit
↓
validator của form cha chạy lại nếu có
```

Đây là chiều:

```text
component UI nội bộ
↓
innerControl
↓
custom component CVA
↓
FormControl cha
```

Nói ngắn gọn:

```text
User thay đổi bên trong component
→ innerControl phát valueChanges
→ component gọi onChange(value)
→ form cha nhận value mới
```

#### 8.1.6. Vì sao emitEvent: false rất quan trọng?

Sai dễ gặp:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value);
}
```

Nếu viết như vậy, khi form cha patch value xuống:

```text
Form cha patchValue
↓
Angular gọi writeValue
↓
innerControl.setValue
↓
innerControl.valueChanges emit
↓
this.onChange(value)
↓
Form cha nhận lại chính value vừa đẩy xuống
```

Luồng bị vòng lại:

```text
Form cha
↓
Component
↓
Form cha
```

Hậu quả:

```text
- valueChanges emit thừa
- validator có thể chạy thừa
- logic subscribe ở form cha bị gọi không cần thiết
- dễ tạo loop nếu form cha valueChanges lại patchValue tiếp
```

Đúng:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });
}
```

Câu nhớ:

```text
Trong writeValue, nếu setValue/patchValue vào innerControl,
thường phải dùng emitEvent: false.
```

#### 8.1.7. Vì sao disable cũng nên dùng emitEvent: false?

Khi form cha gọi:

```ts
this.form.get('userId')?.disable();
```

Angular gọi:

```ts
setDisabledState(true)
```

Trong component:

```ts
setDisabledState(isDisabled: boolean): void {
  this.disabled = isDisabled;

  if (isDisabled) {
    this.innerControl.disable({
      emitEvent: false
    });
  } else {
    this.innerControl.enable({
      emitEvent: false
    });
  }
}
```

Lý do:

```text
Disable / enable là lệnh từ FormControl cha đẩy xuống component.
Mình chỉ muốn thay đổi trạng thái UI nội bộ.
Không muốn innerControl emit valueChanges/statusChanges không cần thiết.
```

#### 8.1.8. So sánh innerControl với ngModel bên trong CVA

Có 2 cách hay dùng.

##### 8.1.8.1. Cách 1: Dùng ngModel nội bộ

```html
<nz-select
  [ngModel]="value"
  (ngModelChange)="handleChange($event)"
>
</nz-select>
```

```ts
handleChange(value: number | null): void {
  this.value = value;
  this.onChange(value);
}
```

Cách này đơn giản, phù hợp component nhỏ.

##### 8.1.8.2. Cách 2: Dùng inner FormControl

```html
<nz-select [formControl]="innerControl"></nz-select>
```

```ts
ngOnInit(): void {
  this.innerControl.valueChanges.subscribe(value => {
    this.onChange(value);
  });
}
```

Cách này phù hợp hơn khi component có logic nhiều hơn.

Ví dụ:

```text
- Có search API
- Có loading
- Có debounce
- Có clear option
- Có disable theo điều kiện
- Có validator nội bộ
- Có thể mở rộng thành nhiều field
```

Câu chốt:

```text
Component đơn giản:
ngModel nội bộ vẫn ổn.

Component có nghiệp vụ:
inner FormControl sạch và dễ mở rộng hơn.
```

#### 8.1.9. Lưu ý không đặt formControlName trực tiếp vào component nội bộ

Không nên viết:

```html
<nz-select formControlName="userId"></nz-select>
```

hoặc:

```html
<lib-select formControlName="userId"></lib-select>
```

bên trong `app-user-select`.

Vì `formControlName` cần một `FormGroup` cha trong template.

Nếu component không có `[formGroup]`, Angular sẽ báo lỗi:

```text
formControlName must be used with a parent formGroup directive
```

Ngoài ra, nếu truyền cả FormGroup cha vào component để dùng `formControlName` bên trong, component sẽ bị phụ thuộc vào cấu trúc form cha.

Như vậy mất ý nghĩa đóng gói của CVA.

Đúng hơn:

```html
<app-user-select formControlName="userId"></app-user-select>
```

Bên trong:

```html
<nz-select [formControl]="innerControl"></nz-select>
```

hoặc:

```html
<lib-select [formControl]="innerControl"></lib-select>
```

#### 8.1.10. Pattern với component select có search API

Ví dụ component chọn user có search API.

Template:

```html
<nz-select
  [formControl]="innerControl"
  [nzDisabled]="disabled"
  [nzShowSearch]="true"
  [nzServerSearch]="true"
  [nzLoading]="loading"
  (nzOnSearch)="searchUsers($event)"
  (nzBlur)="handleBlur()"
  nzPlaceHolder="Tìm người dùng"
>
  <nz-option
    *ngFor="let user of users"
    [nzValue]="user.id"
    [nzLabel]="user.name"
  ></nz-option>
</nz-select>
```

Component:

```ts
searchText$ = new Subject<string>();

users: UserOption[] = [];
loading = false;

ngOnInit(): void {
  this.innerControl.valueChanges
    .pipe(takeUntil(this.destroy$))
    .subscribe(value => {
      this.onChange(value);
    });

  this.searchText$
    .pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    )
    .subscribe(keyword => {
      this.loadUsers(keyword);
    });
}

searchUsers(keyword: string): void {
  this.searchText$.next(keyword);
}

loadUsers(keyword: string): void {
  this.loading = true;

  // Gọi API thật ở đây
  // this.userService.search(keyword).subscribe(...)
}
```

Ý tưởng: `innerControl` quản lý selected value (qua `onChange`), `searchText$` chỉ quản lý keyword để gọi API — không trộn hai luồng này với nhau.

> Trường hợp `writeValue` nhận selected value nhưng `users` (options) chưa load xong — selected option không có label để hiển thị — được giải thích chi tiết ở **9.2. CVA + Async data**, bao gồm pattern `ensureSelectedOptionLoaded` và merge selected option vào options.

#### 8.1.11. Pattern lưu object hay lưu id?

Có 2 kiểu thiết kế value.

##### 8.1.11.1. Kiểu 1: FormControl lưu id

```ts
userId: [null]
```

Component emit:

```ts
this.onChange(userId);
```

Form value:

```ts
{
  userId: 1
}
```

Phù hợp khi backend chỉ cần id.

##### 8.1.11.2. Kiểu 2: FormControl lưu object

```ts
user: [null]
```

Component emit:

```ts
this.onChange(selectedUser);
```

Form value:

```ts
{
  user: {
    id: 1,
    name: 'Trung'
  }
}
```

Phù hợp khi form cần giữ nhiều thông tin hiển thị.

Tuy nhiên trong hệ thống nghiệp vụ lớn, thường nên lưu id ở form chính:

```text
Form chính nên lưu value tối giản, ổn định, dễ submit.
Option object chỉ nên dùng để hiển thị nội bộ nếu không cần submit nguyên object.
```

#### 8.1.12. Câu chốt

```text
CVA dùng inner FormControl
= Bên ngoài component là một FormControl của form cha
= Bên trong component có một FormControl nội bộ để điều khiển UI control bên trong
= writeValue đẩy value từ form cha xuống innerControl
= innerControl.valueChanges báo user change lên form cha qua onChange
= Trong writeValue và setDisabledState nên dùng emitEvent: false
```

Nói ngắn hơn:

```text
Form cha không nói chuyện trực tiếp với component UI nội bộ.
Form cha nói chuyện với custom component qua CVA.
Custom component nói chuyện với UI control nội bộ qua innerControl.
```

---

## 9. CVA nâng cao trong production

### 9.1. CVA + Validator: custom component vừa là form control, vừa tự validate

Có những custom component không chỉ nhận và trả value, mà còn tự có rule validation nội bộ.

Ví dụ:

```html
<app-date-range-picker formControlName="dateRange"></app-date-range-picker>
```

Value bên ngoài là:

```ts
{
  fromDate: '2026-06-01',
  toDate: '2026-06-15'
}
```

Component cần tự validate rule:

```text
fromDate phải nhỏ hơn hoặc bằng toDate
```

Hoặc:

```html
<app-file-upload formControlName="attachments"></app-file-upload>
```

Component cần tự validate:

```text
- Không quá 5 file
- Mỗi file không quá 10MB
- Chỉ cho phép pdf/png/jpg
```

Lúc này component nên implement thêm `Validator`.

---

#### 9.1.1. CVA bình thường chỉ xử lý value

Một CVA cơ bản chỉ làm nhiệm vụ:

```text
writeValue:
FormControl cha đẩy value xuống component.

onChange:
Component báo value mới lên FormControl cha.

onTouched:
Component báo user đã touched.

setDisabledState:
FormControl cha điều khiển disabled.
```

Nhưng CVA cơ bản chưa tự báo lỗi validation.

Nếu muốn custom component tự validate, cần thêm:

```ts
Validator
```

---

#### 9.1.2. Component implement cả ControlValueAccessor và Validator

Ví dụ `app-date-range-picker`:

```ts
import {
  Component,
  forwardRef
} from '@angular/core';

import {
  AbstractControl,
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator
} from '@angular/forms';

type DateRangeValue = {
  fromDate: Date | null;
  toDate: Date | null;
};

@Component({
  selector: 'app-date-range-picker',
  template: `
    <input
      type="date"
      [value]="formatDate(value.fromDate)"
      (change)="changeFromDate($event)"
      (blur)="markTouched()"
    />

    <input
      type="date"
      [value]="formatDate(value.toDate)"
      (change)="changeToDate($event)"
      (blur)="markTouched()"
    />
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateRangePickerComponent),
      multi: true
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => DateRangePickerComponent),
      multi: true
    }
  ]
})
export class DateRangePickerComponent
  implements ControlValueAccessor, Validator {

  value: DateRangeValue = {
    fromDate: null,
    toDate: null
  };

  private onChange = (value: DateRangeValue) => {};
  private onTouched = () => {};
  private onValidatorChange = () => {};

  writeValue(value: DateRangeValue | null): void {
    this.value = value ?? {
      fromDate: null,
      toDate: null
    };
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  validate(control: AbstractControl): ValidationErrors | null {
    const { fromDate, toDate } = this.value;

    if (!fromDate || !toDate) {
      return null;
    }

    return fromDate <= toDate
      ? null
      : { invalidDateRange: true };
  }

  registerOnValidatorChange(fn: () => void): void {
    this.onValidatorChange = fn;
  }

  changeFromDate(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.value = {
      ...this.value,
      fromDate: input.value ? new Date(input.value) : null
    };

    this.onChange(this.value);
    this.onValidatorChange();
  }

  changeToDate(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.value = {
      ...this.value,
      toDate: input.value ? new Date(input.value) : null
    };

    this.onChange(this.value);
    this.onValidatorChange();
  }

  markTouched(): void {
    this.onTouched();
  }

  formatDate(date: Date | null): string {
    if (!date) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }
}
```

---

#### 9.1.3. NG_VALIDATORS là gì?

Muốn Angular biết component này có validator nội bộ, phải khai báo provider:

```ts
{
  provide: NG_VALIDATORS,
  useExisting: forwardRef(() => DateRangePickerComponent),
  multi: true
}
```

Nếu `NG_VALUE_ACCESSOR` giúp component trở thành form control, thì `NG_VALIDATORS` giúp component trở thành validator.

```text
NG_VALUE_ACCESSOR
→ Component biết nhận/trả value với Angular Form.

NG_VALIDATORS
→ Component biết tự báo valid/invalid cho Angular Form.
```

---

#### 9.1.4. validate() là gì?

`validate()` là hàm Angular gọi để hỏi component:

```text
Hiện tại value của component có hợp lệ không?
```

Nếu hợp lệ:

```ts
return null;
```

Nếu lỗi:

```ts
return { invalidDateRange: true };
```

Flow:

```text
User đổi fromDate / toDate
↓
Component cập nhật value
↓
Component gọi onChange(value)
↓
FormControl cha nhận value mới
↓
Angular gọi validate()
↓
Nếu validate trả error object
↓
FormControl cha invalid
```

Bên ngoài dùng như form control bình thường:

```ts
form = this.fb.group({
  dateRange: [null]
});
```

HTML:

```html
<app-date-range-picker formControlName="dateRange"></app-date-range-picker>

<div *ngIf="form.get('dateRange')?.errors?.['invalidDateRange']">
  Từ ngày phải nhỏ hơn hoặc bằng đến ngày
</div>
```

---

#### 9.1.5. registerOnValidatorChange dùng khi nào?

`registerOnValidatorChange` dùng để Angular đưa callback cho component.

Component gọi callback này khi điều kiện validation nội bộ thay đổi.

Ví dụ:

```ts
private onValidatorChange = () => {};

registerOnValidatorChange(fn: () => void): void {
  this.onValidatorChange = fn;
}
```

Khi user đổi value:

```ts
this.onChange(this.value);
this.onValidatorChange();
```

Ý nghĩa:

```text
onChange(value)
→ Báo value mới lên FormControl cha.

onValidatorChange()
→ Báo Angular chạy lại validate().
```

Câu nhớ:

```text
onChange báo value đổi.

onValidatorChange báo rule/validation state cần được tính lại.
```

---

#### 9.1.6. Khi nào cần CVA + Validator?

Nên dùng khi validation là trách nhiệm nội bộ của component.

Ví dụ:

```text
app-date-range-picker
- fromDate <= toDate

app-file-upload
- file size
- file type
- max file count

app-money-input
- không âm
- không vượt hạn mức

app-password-input
- độ mạnh mật khẩu

app-product-picker
- bắt buộc chọn đủ productId + unitId

app-time-range-picker
- giờ bắt đầu < giờ kết thúc
```

Không nên đẩy hết rule nội bộ ra form cha nếu component cần tái sử dụng nhiều nơi.

---

#### 9.1.7. Câu chốt

```text
CVA giúp custom component trở thành FormControl.

Validator giúp custom component tự báo lỗi validation.

Nếu component vừa quản lý value, vừa có rule hợp lệ riêng,
thì có thể implement cả ControlValueAccessor và Validator.
```

---

### 9.2. CVA + Async data: writeValue chạy trước khi options load xong

Đây là case rất hay gặp với các component dạng select/search-select.

Ví dụ bên ngoài form cha dùng:

```html
<app-user-select formControlName="userId"></app-user-select>
```

Bên trong `app-user-select` có thể dùng:

```html
<nz-select [formControl]="innerControl"></nz-select>
```

Hoặc component nội bộ:

```html
<lib-select [formControl]="innerControl"></lib-select>
```

Bản chất vấn đề:

```text
Form cha đã có value.

Nhưng component select bên trong chưa có danh sách options.

=> writeValue chạy trước, options load sau.
```

---

#### 9.2.1. Ví dụ thực tế

Ở màn sửa thông tin, API detail trả về:

```ts
{
  userId: 10
}
```

Form cha patch value:

```ts
this.form.patchValue({
  userId: 10
});
```

Angular gọi vào CVA:

```ts
writeValue(10)
```

Trong component:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });
}
```

Nhưng tại thời điểm đó:

```ts
users = [];
```

Tức là select đang có value `10`, nhưng chưa có option tương ứng:

```ts
{
  id: 10,
  name: 'Nguyễn Văn A'
}
```

---

#### 9.2.2. Vì sao select có value nhưng không hiển thị label?

FormControl thường lưu value tối giản:

```ts
userId: 10
```

Nhưng UI select cần hiển thị label:

```text
Nguyễn Văn A
```

Muốn hiển thị label, select cần tìm trong options:

```ts
users = [
  {
    id: 10,
    name: 'Nguyễn Văn A'
  }
];
```

Vấn đề là:

```text
FormControl biết id.

Select muốn hiển thị label.

Label lại nằm trong options.

Nếu options chưa load thì select chưa biết hiển thị chữ gì.
```

Câu nhớ:

```text
writeValue chỉ đưa selected value xuống component.

writeValue không đảm bảo options đã có sẵn để render label.
```

---

#### 9.2.3. Pattern xử lý: ensureSelectedOptionLoaded

Với select/search-select dùng API, component nên có cơ chế đảm bảo option đang được chọn luôn tồn tại trong danh sách options.

Pattern:

```text
writeValue nhận selected value
↓
set value vào innerControl với emitEvent: false
↓
kiểm tra options hiện tại có option tương ứng chưa
↓
nếu chưa có thì gọi API getById để lấy label
↓
merge selected option vào options
↓
select hiển thị đúng label
```

Ví dụ:

```ts
writeValue(value: number | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });

  if (value != null) {
    this.ensureSelectedOptionLoaded(value);
  }
}
```

Hàm kiểm tra option đã có chưa:

```ts
private hasOption(id: number): boolean {
  return this.users.some(user => user.id === id);
}
```

Hàm load selected option:

```ts
private ensureSelectedOptionLoaded(id: number): void {
  if (this.hasOption(id)) {
    return;
  }

  this.loadingSelected = true;

  this.userService.getById(id)
    .pipe(take(1))
    .subscribe({
      next: user => {
        this.selectedOption = user;
        this.users = this.mergeSelectedOption(this.users);
        this.loadingSelected = false;
      },
      error: () => {
        this.loadingSelected = false;
      }
    });
}
```

Hàm merge để tránh duplicate:

```ts
private mergeSelectedOption(options: UserOption[]): UserOption[] {
  if (!this.selectedOption) {
    return options;
  }

  const exists = options.some(
    option => option.id === this.selectedOption!.id
  );

  if (exists) {
    return options;
  }

  return [this.selectedOption, ...options];
}
```

---

#### 9.2.4. Search API và selected option là 2 luồng khác nhau

Với server-side select, thường có 2 loại API:

```text
1. search(keyword)
   Dùng khi user gõ để tìm options.

2. getById(id)
   Dùng để lấy option đang được chọn khi writeValue nhận id.
```

Không nên chỉ dựa vào `search('')`.

Vì danh sách search mặc định có thể không chứa selected value.

Ví dụ:

```text
userId = 10 đang được chọn.

Nhưng search('') chỉ trả 20 user mới nhất.

User id = 10 không nằm trong 20 user đó.

=> Select vẫn không có label để hiển thị.
```

---

#### 9.2.5. Khi search trả về options mới, đừng làm mất selected option

Một lỗi khác rất hay gặp:

```ts
this.users = usersFromSearch;
```

Nếu `usersFromSearch` không chứa selected user hiện tại, select có thể mất label.

Nên giữ lại selected option:

```ts
private selectedOption: UserOption | null = null;

private mergeSelectedOption(options: UserOption[]): UserOption[] {
  if (!this.selectedOption) {
    return options;
  }

  const exists = options.some(
    option => option.id === this.selectedOption!.id
  );

  if (exists) {
    return options;
  }

  return [this.selectedOption, ...options];
}
```

Câu nhớ:

```text
Options search có thể thay đổi liên tục.

Nhưng option đang được chọn nên được giữ lại để select hiển thị đúng label.
```

---

#### 9.2.6. Vì sao không gọi onChange trong writeValue?

Trong `writeValue`, mình đang nhận value từ form cha đẩy xuống.

Đây là chiều:

```text
FormControl cha
↓
CVA component
↓
innerControl
↓
component select nội bộ
```

Vì vậy trong `writeValue` chỉ nên sync UI nội bộ:

```ts
this.innerControl.setValue(value, {
  emitEvent: false
});
```

Không được gọi:

```ts
this.onChange(value);
```

Câu nhớ:

```text
writeValue là đồng bộ value từ cha xuống.

onChange chỉ dùng khi user thay đổi value từ UI.
```

---

#### 9.2.7. Câu chốt

```text
FormControl giữ id.

Select hiển thị label.

Muốn có label thì phải có option.

writeValue có id nhưng chưa có option
→ select có thể trống.

Pattern production:
writeValue
↓
innerControl.setValue(value, { emitEvent: false })
↓
ensureSelectedOptionLoaded(value)
↓
merge selected option vào options
↓
UI hiển thị đúng label
```

---

### 9.3. CVA + object value: FormControl lưu object thay vì id

Thông thường select hay lưu id:

```ts
form = this.fb.group({
  userId: [null]
});
```

Value submit:

```ts
{
  userId: 10
}
```

Nhưng có trường hợp FormControl lưu cả object:

```ts
form = this.fb.group({
  user: [null as UserOption | null]
});
```

Value:

```ts
{
  user: {
    id: 10,
    name: 'Nguyễn Văn A'
  }
}
```

---

#### 9.3.1. Khi nào lưu object?

Lưu object hữu ích khi UI cần nhiều thông tin của option sau khi chọn.

Ví dụ chọn sản phẩm:

```ts
{
  id: 1,
  name: 'Paracetamol',
  unitId: 2,
  unitName: 'Hộp',
  price: 150000,
  stock: 20
}
```

Nếu form chỉ lưu `productId`, sau đó muốn hiển thị giá/tồn kho/đơn vị thì phải tìm lại object trong options.

Nếu lưu object, component cha có thể dùng ngay:

```ts
const product = this.form.get('product')?.value;

console.log(product.price);
console.log(product.stock);
```

---

#### 9.3.2. Code CVA emit object

Template:

```html
<lib-select
  [formControl]="innerControl"
  [options]="users"
  (blur)="handleBlur()">
</lib-select>
```

Component:

```ts
type UserOption = {
  id: number;
  name: string;
};

innerControl = new FormControl<UserOption | null>(null);

private onChange = (value: UserOption | null) => {};
private onTouched = () => {};

ngOnInit(): void {
  this.innerControl.valueChanges.subscribe(value => {
    this.onChange(value);
  });
}

writeValue(value: UserOption | null): void {
  this.innerControl.setValue(value, {
    emitEvent: false
  });
}
```

Form cha:

```ts
form = this.fb.group({
  user: [null as UserOption | null]
});
```

---

#### 9.3.3. Vấn đề compare object

Khi lưu object, select cần biết object nào đang được chọn.

Vấn đề là hai object có cùng `id` nhưng khác reference:

```ts
const a = { id: 1, name: 'Trung' };
const b = { id: 1, name: 'Trung' };

a === b;
// false
```

Nếu select so sánh bằng reference, UI có thể không nhận ra selected option.

Cần dùng compare function nếu component hỗ trợ.

Ví dụ ý tưởng:

```ts
compareUser = (a: UserOption | null, b: UserOption | null): boolean => {
  return a?.id === b?.id;
};
```

Template tùy thư viện:

```html
<lib-select
  [formControl]="innerControl"
  [compareWith]="compareUser">
</lib-select>
```

Câu nhớ:

```text
Lưu object thì phải quan tâm compare object.

Không nên mặc định nghĩ hai object cùng id là bằng nhau.
```

---

#### 9.3.4. Ưu và nhược điểm của object value

Ưu điểm:

```text
- Có sẵn label và metadata để hiển thị
- Ít phải lookup lại option
- Hợp với modal picker hoặc product picker
```

Nhược điểm:

```text
- Form value nặng hơn
- Submit thường phải map lại về id
- Dễ lệch data nếu object cũ
- Cần compare function
- Khó serialize nếu object phức tạp
```

Pattern thực tế:

```text
Nếu backend chỉ cần id:
Form chính thường nên lưu id.

Nếu UI cần giữ nhiều metadata trong quá trình nhập:
Có thể lưu object, nhưng trước submit nên map lại DTO gọn.
```

---

#### 9.3.5. Câu chốt

```text
CVA không bắt buộc chỉ emit primitive.

onChange có thể emit string, number, object, array, hoặc custom structure.

Quan trọng là form cha và component thống nhất value shape.
```

---

### 9.4. CVA + multiple select: FormControl lưu array

Với multiple select, FormControl thường lưu array.

Ví dụ lưu array id:

```ts
form = this.fb.group({
  userIds: [[] as number[]]
});
```

Value:

```ts
{
  userIds: [1, 2, 3]
}
```

Hoặc lưu array object:

```ts
form = this.fb.group({
  users: [[] as UserOption[]]
});
```

Value:

```ts
{
  users: [
    { id: 1, name: 'Trung' },
    { id: 2, name: 'Linh' }
  ]
}
```

---

#### 9.4.1. Code CVA multiple select lưu array id

```ts
type UserOption = {
  id: number;
  name: string;
};

innerControl = new FormControl<number[]>([]);

users: UserOption[] = [];

private onChange = (value: number[]) => {};
private onTouched = () => {};

ngOnInit(): void {
  this.innerControl.valueChanges.subscribe(value => {
    this.onChange(value ?? []);
  });
}

writeValue(value: number[] | null): void {
  this.innerControl.setValue(value ?? [], {
    emitEvent: false
  });
}

setDisabledState(isDisabled: boolean): void {
  if (isDisabled) {
    this.innerControl.disable({ emitEvent: false });
  } else {
    this.innerControl.enable({ emitEvent: false });
  }
}
```

Template ví dụ:

```html
<lib-multi-select
  [formControl]="innerControl"
  [options]="users"
  (blur)="handleBlur()">
</lib-multi-select>
```

---

#### 9.4.2. Luồng user chọn nhiều option

```text
User chọn id = 1
↓
innerControl value = [1]
↓
innerControl.valueChanges emit [1]
↓
component gọi onChange([1])
↓
FormControl cha nhận [1]

User chọn thêm id = 2
↓
innerControl value = [1, 2]
↓
onChange([1, 2])
↓
FormControl cha cập nhật
```

---

#### 9.4.3. Lưu ý khi dùng array

Array là reference type.

Không nên mutate trực tiếp:

```ts
this.value.push(3);
this.onChange(this.value);
```

Nên tạo array mới:

```ts
const nextValue = [...this.value, 3];
this.value = nextValue;
this.onChange(nextValue);
```

Lý do:

```text
- Dễ debug hơn
- Tốt hơn với OnPush
- Tránh lỗi component không nhận ra thay đổi reference
```

---

#### 9.4.4. Validate multiple select

Ví dụ bắt buộc chọn ít nhất một item:

```ts
export function minSelectedValidator(min: number): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value as unknown[] | null;

    const length = value?.length ?? 0;

    return length >= min
      ? null
      : {
          minSelected: {
            min,
            actual: length
          }
        };
  };
}
```

Dùng ở form cha:

```ts
form = this.fb.group({
  userIds: [[], [minSelectedValidator(1)]]
});
```

Hoặc component CVA tự implement `Validator` nếu rule thuộc về component.

---

#### 9.4.5. Câu chốt

```text
Multiple select là CVA với value dạng array.

writeValue nhận array từ form cha.

User chọn/bỏ chọn thì component emit array mới qua onChange.

Nên tránh mutate array trực tiếp.
```

---

### 9.5. CVA + file upload: value là File[], url[] hoặc attachment[]

File upload là một trong những case CVA phức tạp nhất, vì UI không chỉ có value mà còn có trạng thái upload.

Một component upload có thể dùng như:

```html
<app-file-upload formControlName="attachments"></app-file-upload>
```

Form value có thể là:

```ts
File[]
```

hoặc:

```ts
string[]
```

hoặc:

```ts
AttachmentDto[]
```

Ví dụ:

```ts
type AttachmentDto = {
  id?: number;
  fileName: string;
  url?: string;
  file?: File;
  status: 'existing' | 'new' | 'uploading' | 'uploaded' | 'error';
};
```

---

#### 9.5.1. Nên xác định value shape trước

Trước khi viết CVA file upload, phải trả lời:

```text
FormControl sẽ lưu cái gì?
```

Các kiểu thường gặp:

```text
1. File[]
   Lưu file mới chọn, submit multipart.

2. string[]
   Lưu danh sách url sau khi upload xong.

3. AttachmentDto[]
   Lưu cả file cũ, file mới, trạng thái upload.
```

Với hệ thống nghiệp vụ lớn, `AttachmentDto[]` thường dễ mở rộng hơn.

Ví dụ:

```ts
type AttachmentValue = {
  id?: number;
  fileName: string;
  url?: string;
  file?: File;
  status: 'existing' | 'new' | 'uploading' | 'uploaded' | 'error';
};
```

---

#### 9.5.2. Code CVA file upload cơ bản

```ts
type AttachmentValue = {
  id?: number;
  fileName: string;
  url?: string;
  file?: File;
  status: 'existing' | 'new' | 'uploading' | 'uploaded' | 'error';
};

@Component({
  selector: 'app-file-upload',
  template: `
    <input
      type="file"
      multiple
      [disabled]="disabled"
      (change)="handleFileChange($event)"
      (blur)="markTouched()"
    />

    <div *ngFor="let file of value; let i = index">
      {{ file.fileName }} - {{ file.status }}
      <button type="button" (click)="removeFile(i)" [disabled]="disabled">
        Xóa
      </button>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => FileUploadComponent),
      multi: true
    }
  ]
})
export class FileUploadComponent implements ControlValueAccessor {
  value: AttachmentValue[] = [];
  disabled = false;

  private onChange = (value: AttachmentValue[]) => {};
  private onTouched = () => {};

  writeValue(value: AttachmentValue[] | null): void {
    this.value = value ?? [];
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    const newAttachments: AttachmentValue[] = files.map(file => ({
      fileName: file.name,
      file,
      status: 'new'
    }));

    this.value = [
      ...this.value,
      ...newAttachments
    ];

    this.onChange(this.value);
    this.onTouched();

    input.value = '';
  }

  removeFile(index: number): void {
    this.value = this.value.filter((_, i) => i !== index);

    this.onChange(this.value);
    this.onTouched();
  }

  markTouched(): void {
    this.onTouched();
  }
}
```

---

#### 9.5.3. File cũ và file mới

Ở màn edit, API có thể trả file cũ:

```ts
[
  {
    id: 1,
    fileName: 'ket-qua.pdf',
    url: 'https://...',
    status: 'existing'
  }
]
```

Form cha patch xuống:

```ts
this.form.patchValue({
  attachments: existingFiles
});
```

Angular gọi:

```ts
writeValue(existingFiles)
```

Component hiển thị file cũ.

Khi user chọn thêm file mới:

```text
value = [
  existing file,
  new file
]
```

Khi submit, backend có thể cần biết:

```text
- File cũ nào giữ lại
- File cũ nào xóa
- File mới nào upload thêm
```

Vì vậy file upload thường cần thiết kế value shape kỹ hơn input/select bình thường.

---

#### 9.5.4. File upload có nên tự upload bên trong component không?

Có 2 hướng:

```text
Hướng 1:
Component chỉ giữ File[] hoặc AttachmentDto[].
Submit form rồi parent upload.

Hướng 2:
Component tự upload ngay khi user chọn file.
FormControl lưu url/id sau upload.
```

Không có một đáp án đúng cho mọi hệ thống.

Pattern thường dùng:

```text
Nếu form submit một lần:
Component giữ File[], parent submit multipart.

Nếu upload độc lập:
Component tự upload, value là AttachmentDto[] chứa url/id.
```

---

#### 9.5.5. Câu chốt

```text
File upload là CVA phức tạp vì value không chỉ là string/number.

Cần thiết kế rõ value shape:
File[], url[] hay AttachmentDto[].

Phải phân biệt file cũ, file mới, file bị xóa, file upload lỗi.

Không nên viết file upload CVA nếu chưa rõ backend muốn nhận dữ liệu kiểu gì.
```

---

### 9.6. CVA + modal picker: mở modal chọn data rồi emit value lên form

Modal picker là case rất thực tế.

Ví dụ:

```html
<app-product-picker formControlName="productId"></app-product-picker>
```

UI không phải select trực tiếp, mà là:

```text
Input readonly
Button "Chọn"
Modal danh sách sản phẩm
User chọn một sản phẩm
Component emit productId lên form
```

---

#### 9.6.1. Mô hình

```text
Form cha
└── productId: FormControl
        ↓
        app-product-picker: CVA
        ↓
        Modal chọn sản phẩm
        ↓
        User chọn product
```

Form cha không cần biết modal hoạt động thế nào.

Form cha chỉ cần nhận:

```ts
productId: 100
```

---

#### 9.6.2. Code CVA modal picker lưu id

```ts
type ProductOption = {
  id: number;
  name: string;
  code: string;
};

@Component({
  selector: 'app-product-picker',
  template: `
    <div class="picker">
      <input
        [value]="selectedProduct?.name ?? ''"
        readonly
        [disabled]="disabled"
        (blur)="markTouched()"
      />

      <button
        type="button"
        [disabled]="disabled"
        (click)="openPicker()">
        Chọn
      </button>

      <button
        type="button"
        [disabled]="disabled || !value"
        (click)="clear()">
        Xóa
      </button>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ProductPickerComponent),
      multi: true
    }
  ]
})
export class ProductPickerComponent implements ControlValueAccessor {
  value: number | null = null;
  selectedProduct: ProductOption | null = null;
  disabled = false;

  private onChange = (value: number | null) => {};
  private onTouched = () => {};

  writeValue(value: number | null): void {
    this.value = value;

    if (value != null) {
      this.loadSelectedProduct(value);
    } else {
      this.selectedProduct = null;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  openPicker(): void {
    if (this.disabled) {
      return;
    }

    // Ví dụ giả lập modal trả về product
    const selectedProduct: ProductOption = {
      id: 100,
      code: 'SP001',
      name: 'Sản phẩm A'
    };

    this.selectedProduct = selectedProduct;
    this.value = selectedProduct.id;

    this.onChange(selectedProduct.id);
    this.onTouched();
  }

  clear(): void {
    this.value = null;
    this.selectedProduct = null;

    this.onChange(null);
    this.onTouched();
  }

  markTouched(): void {
    this.onTouched();
  }

  private loadSelectedProduct(id: number): void {
    // Gọi API getById nếu cần hiển thị label khi writeValue chạy
    // this.productService.getById(id).subscribe(product => {
    //   this.selectedProduct = product;
    // });
  }
}
```

---

#### 9.6.3. Modal picker và async selected label

Modal picker cũng gặp vấn đề giống select:

```text
writeValue nhận productId
nhưng component chưa có productName để hiển thị
```

Nên trong `writeValue` thường cần:

```ts
if (value != null) {
  this.loadSelectedProduct(value);
}
```

Câu nhớ:

```text
Modal picker lưu id thì vẫn cần cách load label theo id khi mở màn edit.
```

---

#### 9.6.4. Modal picker lưu object

Nếu muốn form giữ cả object:

```ts
form = this.fb.group({
  product: [null as ProductOption | null]
});
```

Component có thể emit object:

```ts
this.onChange(selectedProduct);
```

Ưu điểm:

```text
- Parent có đủ thông tin product
- Không cần load label lại
```

Nhược điểm:

```text
- Submit phải map về productId nếu backend chỉ cần id
- Cần thống nhất value shape
```

---

#### 9.6.5. Câu chốt

```text
Modal picker cũng là một CVA bình thường.

Khác biệt chỉ là UI chọn value nằm trong modal.

User chọn trong modal
→ component gọi onChange(value)
→ FormControl cha cập nhật.
```

---

### 9.7. CVA + OnPush: khi nào cần markForCheck trong writeValue

Khi custom component dùng:

```ts
changeDetection: ChangeDetectionStrategy.OnPush
```

CVA vẫn hoạt động bình thường, nhưng có một điểm cần chú ý:

```text
writeValue có thể cập nhật value nội bộ,
nhưng UI của component OnPush có thể chưa render lại ngay nếu component không được mark.
```

---

#### 9.7.1. Vấn đề thường gặp

Component:

```ts
@Component({
  selector: 'app-money-input',
  template: `
    <span>{{ displayValue }}</span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true
    }
  ]
})
export class MoneyInputComponent implements ControlValueAccessor {
  displayValue = '';

  writeValue(value: number | null): void {
    this.displayValue = value != null
      ? value.toLocaleString('en-US')
      : '';
  }

  registerOnChange(fn: any): void {}
  registerOnTouched(fn: any): void {}
}
```

Form cha gọi:

```ts
this.form.patchValue({
  amount: 100000
});
```

Angular gọi:

```ts
writeValue(100000)
```

`displayValue` đã đổi, nhưng với `OnPush`, có trường hợp UI không cập nhật đúng lúc.

---

#### 9.7.2. Pattern: markForCheck trong writeValue

Nên inject `ChangeDetectorRef`:

```ts
constructor(private cdr: ChangeDetectorRef) {}
```

Trong `writeValue`:

```ts
writeValue(value: number | null): void {
  this.displayValue = value != null
    ? value.toLocaleString('en-US')
    : '';

  this.cdr.markForCheck();
}
```

Ý nghĩa:

```text
markForCheck()
→ Đánh dấu component OnPush này cần được check ở lần Change Detection tiếp theo.
```

---

#### 9.7.3. Khi nào cần markForCheck?

Nên dùng trong CVA OnPush khi:

```text
- writeValue cập nhật biến hiển thị trên template
- writeValue chạy do form cha patchValue
- selected option load async xong mới cập nhật label
- component có loading state nội bộ
- component dùng innerControl nhưng còn hiển thị thêm display text ngoài control
```

Ví dụ async selected option:

```ts
private ensureSelectedOptionLoaded(id: number): void {
  this.loadingSelected = true;
  this.cdr.markForCheck();

  this.userService.getById(id)
    .pipe(take(1))
    .subscribe(user => {
      this.selectedOption = user;
      this.loadingSelected = false;

      this.cdr.markForCheck();
    });
}
```

---

#### 9.7.4. markForCheck khác detectChanges như nào?

`markForCheck()`:

```text
Đánh dấu component cần được check ở chu kỳ Change Detection tiếp theo.
An toàn hơn, hợp với OnPush.
```

`detectChanges()`:

```text
Chạy Change Detection ngay cho component hiện tại và cây con.
Mạnh hơn, nhưng dễ dùng sai nếu gọi lung tung.
```

Trong CVA OnPush, thường ưu tiên:

```ts
this.cdr.markForCheck();
```

Chỉ dùng `detectChanges()` khi thật sự cần render ngay và hiểu rõ ngữ cảnh.

---

#### 9.7.5. User input trong component có cần markForCheck không?

Khi user thao tác trực tiếp trong component:

```text
click
input
change
blur
```

Angular thường đã có DOM event làm trigger Change Detection.

Ví dụ:

```ts
handleInput(value: number): void {
  this.value = value;
  this.onChange(value);
}
```

Thường không cần `markForCheck` cho case này.

Nhưng với value từ bên ngoài đẩy xuống qua `writeValue`, hoặc async callback nội bộ, `markForCheck` giúp chắc chắn UI được cập nhật.

---

#### 9.7.6. Câu chốt

```text
CVA + OnPush vẫn hoạt động bình thường.

Nhưng khi writeValue hoặc async callback cập nhật biến hiển thị trong component,
nên gọi markForCheck để UI được check lại.

writeValue là chiều FormControl cha đẩy xuống,
không phải user event trong component,
nên đừng quá phụ thuộc vào event để UI tự update.
```

---

## 10. Các hàm còn lại và lỗi hay gặp trong CVA

### 10.1. registerOnTouched là gì?

`registerOnTouched` là hàm Angular gọi để truyền callback cho component.

Callback này dùng để component báo rằng user đã touched control.

```ts
private onTouched = () => {};

registerOnTouched(fn: any): void {
  this.onTouched = fn;
}
```

Khi blur:

```ts
handleBlur(): void {
  this.onTouched();
}
```

Flow:

```text
User focus vào component
↓
User blur ra ngoài
↓
Component gọi this.onTouched()
↓
FormControl.touched = true
```

Nếu không gọi `onTouched`, những UI kiểu này có thể không hoạt động đúng:

```html
<div *ngIf="control.touched && control.invalid">
  Field không hợp lệ
</div>
```

---

### 10.2. setDisabledState là gì?

`setDisabledState` là hàm Angular gọi khi FormControl bị disable hoặc enable.

Ví dụ bên ngoài:

```ts
this.form.get('amount')?.disable();
```

Angular gọi:

```ts
setDisabledState(true)
```

Component xử lý:

```ts
setDisabledState(isDisabled: boolean): void {
  this.disabled = isDisabled;
}
```

HTML:

```html
<input
  [disabled]="disabled"
  [value]="value"
>
```

Flow:

```text
FormControl.disable()
↓
Angular gọi setDisabledState(true)
↓
Component disable input bên trong
```

---

### 10.3. Code CVA đơn giản

```ts
import {
  Component,
  forwardRef
} from '@angular/core';

import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

@Component({
  selector: 'app-money-input',
  template: `
    <input
      [value]="displayValue"
      [disabled]="disabled"
      (input)="handleInput($event)"
      (blur)="handleBlur()"
    />
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true
    }
  ]
})
export class MoneyInputComponent implements ControlValueAccessor {
  value: number | null = null;
  displayValue = '';
  disabled = false;

  private onChange = (value: number | null) => {};
  private onTouched = () => {};

  writeValue(value: number | null): void {
    this.value = value;
    this.displayValue = value != null ? value.toLocaleString('en-US') : '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const rawValue = input.value;

    const numericValue = rawValue
      ? Number(rawValue.replace(/,/g, ''))
      : null;

    this.value = numericValue;
    this.displayValue = rawValue;

    this.onChange(numericValue);
  }

  handleBlur(): void {
    this.displayValue = this.value != null
      ? this.value.toLocaleString('en-US')
      : '';

    this.onTouched();
  }
}
```

Dùng bên ngoài:

```ts
form = this.fb.group({
  amount: [null]
});
```

```html
<form [formGroup]="form">
  <app-money-input formControlName="amount"></app-money-input>
</form>
```

---

### 10.4. Provider NG_VALUE_ACCESSOR

Muốn Angular biết component này là form control custom, phải khai báo provider:

```ts
providers: [
  {
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MoneyInputComponent),
    multi: true
  }
]
```

Ý nghĩa:

```text
provide: NG_VALUE_ACCESSOR
→ Đăng ký component này như một value accessor.

useExisting: forwardRef(() => MoneyInputComponent)
→ Dùng chính instance component hiện tại.

multi: true
→ Cho phép có nhiều value accessor trong Angular.
```

Nếu thiếu provider này, Angular không biết component là form control.

Lỗi thường gặp:

```text
No value accessor for form control with name: 'amount'
```

---

### 10.5. Lỗi hay gặp: gọi onChange trong writeValue

Sai:

```ts
writeValue(value: number | null): void {
  this.value = value;
  this.onChange(value);
}
```

Lý do sai:

```text
writeValue là chiều FormControl → Component.
onChange là chiều Component → FormControl.
```

Nếu gọi `onChange` trong `writeValue`, luồng sẽ thành:

```text
FormControl
↓
Component
↓
FormControl
```

Tức là FormControl set value xuống component, component lại báo ngược chính value đó lên FormControl.

Hậu quả:

```text
- valueChanges emit thừa
- validator chạy thừa
- form bị update vòng lại
- khó phân biệt value do user nhập hay do code patchValue
- dễ tạo loop nếu trong valueChanges lại patchValue tiếp
```

Đúng:

```ts
writeValue(value: number | null): void {
  this.value = value;
}
```

Chỉ gọi `onChange` khi user thực sự thay đổi value từ UI:

```ts
handleInput(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);

  this.value = value;
  this.onChange(value);
}
```

Câu hỏi cần tự check:

```text
Value này đến từ đâu?

Nếu đến từ form.patchValue / setValue / init form:
→ dùng writeValue, không gọi onChange.

Nếu đến từ user thao tác trong component:
→ update UI nội bộ, rồi gọi onChange.
```

---

### 10.6. Lỗi hay gặp: quên gọi onChange

Nếu user nhập nhưng component không gọi:

```ts
this.onChange(value);
```

thì:

```text
UI bên trong component có thể đổi
nhưng FormControl bên ngoài không biết gì.
```

Hậu quả:

```text
- form.value không đổi
- valueChanges không emit
- validator không chạy lại
- submit lấy value cũ
```

---

### 10.7. Lỗi hay gặp: quên gọi onTouched

Nếu không gọi:

```ts
this.onTouched();
```

khi blur, thì:

```text
FormControl.touched không đổi thành true.
```

Hậu quả:

```text
- Error message phụ thuộc touched không hiển thị
- UX validation sai
```

---

### 10.8. Lỗi hay gặp: disable FormControl nhưng UI vẫn bấm được

Nếu không implement:

```ts
setDisabledState(isDisabled: boolean): void {
  this.disabled = isDisabled;
}
```

thì khi bên ngoài gọi:

```ts
this.form.get('amount')?.disable();
```

FormControl đã disabled, nhưng input/button bên trong component có thể vẫn thao tác được.

---

### 10.9. CVA với object value

Không phải CVA lúc nào cũng trả primitive như string/number.

Ví dụ date range:

```ts
type DateRangeValue = {
  from: Date | null;
  to: Date | null;
};
```

Component:

```ts
value: DateRangeValue = {
  from: null,
  to: null
};

selectFromDate(date: Date): void {
  this.value = {
    ...this.value,
    from: date
  };

  this.onChange(this.value);
}
```

Nên tránh mutation trực tiếp:

```ts
this.value.from = date;
this.onChange(this.value);
```

Nên dùng immutable object:

```ts
this.value = {
  ...this.value,
  from: date
};

this.onChange(this.value);
```

Lý do:

```text
- Dễ debug
- Ít lỗi tham chiếu object
- Tốt hơn với OnPush
```

---

## 11. Case production: CVA wrap inner FormGroup

### 11.1. CVA wrap FormGroup bên trong

Trong thực tế, custom component không phải lúc nào cũng chỉ có một input.

Ví dụ:

```html
<app-address-picker formControlName="address"></app-address-picker>
```

Bên trong `app-address-picker` có nhiều field:

```text
- Tỉnh / thành phố
- Quận / huyện
- Phường / xã
- Địa chỉ chi tiết
```

Bên ngoài Angular Form vẫn nhìn nó như một FormControl duy nhất:

```ts
address: FormControl
```

Nhưng bên trong component có thể dùng một FormGroup riêng:

```ts
innerForm = this.fb.group({
  provinceId: [null],
  districtId: [null],
  wardId: [null],
  street: ['']
});
```

#### 11.1.1. Khi user đổi value bên trong

Component subscribe `innerForm.valueChanges`:

```ts
ngOnInit(): void {
  this.innerForm.valueChanges.subscribe(value => {
    this.onChange(value);
  });
}
```

Flow:

```text
User chọn tỉnh / huyện / xã
↓
innerForm đổi value
↓
innerForm.valueChanges emit
↓
component gọi this.onChange(value)
↓
FormControl address bên ngoài cập nhật
```

#### 11.1.2. Khi FormControl bên ngoài patchValue xuống

Ví dụ bên ngoài gọi:

```ts
this.form.patchValue({
  address: {
    provinceId: 1,
    districtId: 10,
    wardId: 100,
    street: 'Nguyễn Trãi'
  }
});
```

Angular gọi:

```ts
writeValue(value)
```

Trong `writeValue`, component cần patch vào `innerForm`.

Sai dễ gặp:

```ts
writeValue(value: any): void {
  this.innerForm.patchValue(value);
}
```

Vì `patchValue` sẽ làm `innerForm.valueChanges` emit, sau đó gọi `this.onChange(value)`, dẫn đến báo ngược không cần thiết.

Đúng hơn:

```ts
writeValue(value: any): void {
  if (value) {
    this.innerForm.patchValue(value, { emitEvent: false });
  } else {
    this.innerForm.reset({}, { emitEvent: false });
  }
}
```

Điểm quan trọng:

```text
writeValue là chiều FormControl → Component.

Khi patch vào innerForm trong writeValue,
nên dùng emitEvent: false để không báo ngược lại FormControl.
```

#### 11.1.3. Code mẫu CVA wrap FormGroup

```ts
export class AddressPickerComponent implements ControlValueAccessor, OnInit {
  innerForm = this.fb.group({
    provinceId: [null],
    districtId: [null],
    wardId: [null],
    street: ['']
  });

  private onChange = (value: any) => {};
  private onTouched = () => {};

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.innerForm.valueChanges.subscribe(value => {
      this.onChange(value);
    });
  }

  writeValue(value: any): void {
    if (value) {
      this.innerForm.patchValue(value, { emitEvent: false });
    } else {
      this.innerForm.reset({}, { emitEvent: false });
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.innerForm.disable({ emitEvent: false });
    } else {
      this.innerForm.enable({ emitEvent: false });
    }
  }

  markTouched(): void {
    this.onTouched();
  }
}
```

Câu chốt:

```text
innerForm.valueChanges → gọi this.onChange(value)
writeValue → patchValue(..., { emitEvent: false })
disable/enable → cũng nên dùng emitEvent: false
```

---

## 12. Angular Form, Change Detection và OnPush

### 12.1. CVA và OnPush

Nếu custom component dùng:

```ts
changeDetection: ChangeDetectionStrategy.OnPush
```

thì CVA vẫn hoạt động bình thường.

Nhưng cần chú ý `writeValue`.

Ví dụ:

```ts
constructor(private cdr: ChangeDetectorRef) {}

writeValue(value: number | null): void {
  this.value = value;
  this.cdr.markForCheck();
}
```

Lý do:

```text
writeValue có thể được gọi khi bên ngoài patchValue.

Với OnPush, component có thể cần được markForCheck để template đọc lại value.
```

Khi user input trong chính component, DOM event thường đã trigger change detection.

Nhưng khi value từ ngoài đẩy xuống component, `markForCheck()` giúp UI chắc chắn được cập nhật.

---

### 12.2. Angular Form và Change Detection

Khi user nhập vào input thường:

```text
User input event
↓
DefaultValueAccessor nghe input event
↓
FormControl cập nhật value
↓
valueChanges emit
↓
Validator chạy
↓
Angular Change Detection cập nhật template
```

Điểm cần hiểu:

```text
Không phải bản thân FormControl làm toàn app chạy Change Detection.

DOM event / async task được Zone.js bắt mới là nguyên nhân thường làm Angular chạy Change Detection.
```

Ví dụ:

```ts
this.form.patchValue({
  amount: 100000
});
```

`patchValue` cập nhật FormControl và có thể cập nhật UI thông qua CVA.

Nhưng việc Change Detection chạy hay không còn liên quan đến context gọi code đó:

```text
- Gọi trong Angular event handler
- Gọi trong HTTP response
- Gọi trong setTimeout
- Gọi ngoài Angular zone
- Component OnPush hay Default
```

Câu nhớ:

```text
FormControl quản lý value và state.
Change Detection quyết định template được check và render lại khi nào.
```

---

### 12.3. Reactive Form với OnPush

Với component OnPush, nếu template bind trực tiếp form control:

```html
<input formControlName="amount">
```

thì user input vẫn hoạt động bình thường vì DOM event xuất phát trong component.

Nhưng khi custom CVA nhận value từ ngoài qua `writeValue`, có thể cần:

```ts
this.cdr.markForCheck();
```

Đặc biệt với custom component hiển thị value phức tạp.

---

## 13. Dynamic Form và pattern thực tế

### 13.1. Dynamic Form

Dynamic Form là form được tạo dựa trên cấu hình.

Ví dụ config:

```ts
fields = [
  {
    key: 'fullName',
    label: 'Họ tên',
    type: 'text',
    required: true
  },
  {
    key: 'age',
    label: 'Tuổi',
    type: 'number',
    required: false
  }
];
```

Build form:

```ts
buildForm(fields: any[]): FormGroup {
  const group: Record<string, FormControl> = {};

  fields.forEach(field => {
    const validators = [];

    if (field.required) {
      validators.push(Validators.required);
    }

    group[field.key] = new FormControl(null, validators);
  });

  return new FormGroup(group);
}
```

HTML render dynamic:

```html
<div *ngFor="let field of fields">
  <label>{{ field.label }}</label>

  <input
    *ngIf="field.type === 'text'"
    [formControlName]="field.key"
  >

  <input
    *ngIf="field.type === 'number'"
    type="number"
    [formControlName]="field.key"
  >
</div>
```

Dynamic Form hay dùng cho:

```text
- Form cấu hình theo nghiệp vụ
- Form khảo sát
- Form hồ sơ động
- Form nhập liệu nhiều loại phiếu
```

---

### 13.2. Pattern tính toán field trong form

Ví dụ:

```text
quantity × price = total
```

Code:

```ts
ngOnInit(): void {
  combineLatest([
    this.form.get('quantity')!.valueChanges.pipe(startWith(this.form.get('quantity')!.value)),
    this.form.get('price')!.valueChanges.pipe(startWith(this.form.get('price')!.value))
  ]).subscribe(([quantity, price]) => {
    const total = (quantity || 0) * (price || 0);

    this.form.patchValue({
      total
    }, {
      emitEvent: false
    });
  });
}
```

Điểm quan trọng:

```text
Khi patch total, nên dùng emitEvent: false
để tránh tạo vòng lặp valueChanges không cần thiết.
```

---

### 13.3. Pattern enable/disable field theo field khác

Ví dụ chọn loại khách hàng thì mới cho nhập mã số thuế:

```ts
ngOnInit(): void {
  this.form.get('customerType')?.valueChanges.subscribe(type => {
    const taxCodeControl = this.form.get('taxCode');

    if (type === 'COMPANY') {
      taxCodeControl?.enable();
      taxCodeControl?.setValidators([Validators.required]);
    } else {
      taxCodeControl?.disable();
      taxCodeControl?.clearValidators();
      taxCodeControl?.reset();
    }

    taxCodeControl?.updateValueAndValidity();
  });
}
```

---

### 13.4. Pattern unsubscribe valueChanges

Không nên subscribe mà không unsubscribe trong component sống/nghỉ nhiều lần.

Pattern:

```ts
private destroy$ = new Subject<void>();

ngOnInit(): void {
  this.form.valueChanges
    .pipe(takeUntil(this.destroy$))
    .subscribe(value => {
      console.log(value);
    });
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

Hoặc Angular mới có thể dùng `takeUntilDestroyed`.

---

## 14. Lỗi production thường gặp

Checklist nhanh các lỗi hay gặp khi làm Angular Form, kèm cách fix:

- **`patchValue` trong `valueChanges` gây loop**
  Subscribe `valueChanges` rồi `patchValue` field khác → tự kích hoạt lại `valueChanges`.
  Fix: `this.form.patchValue(value, { emitEvent: false })`.

- **Disabled field không có trong `form.value`**
  `form.value` bỏ qua các control đang `disabled`.
  Fix: dùng `this.form.getRawValue()` nếu cần lấy cả field disabled.

- **Custom component thiếu CVA**
  Lỗi `No value accessor for form control with name: 'xxx'`.
  Fix: component dùng `formControlName`/`formControl` phải implement `ControlValueAccessor` và provide `NG_VALUE_ACCESSOR`.

- **FormArray render không dùng `trackBy`**
  `*ngFor` trên `formArray.controls` không có `trackBy` dễ gây re-render/mất focus khi thêm/xóa dòng.
  Fix: thêm `trackBy: trackByIndex` với `trackByIndex(index: number) { return index; }`.

- **Async validator gọi API quá nhiều**
  Validate mỗi lần gõ phím gây spam API.
  Fix: `updateOn: 'blur'`, debounce ở custom logic, hoặc cache kết quả nếu cần.

---

## 15. Checklist và tư duy thiết kế form lớn

### 15.1. Checklist học Angular Form

```text
Cơ bản:
- FormControl
- FormGroup
- FormArray
- setValue
- patchValue
- reset
- valueChanges
- statusChanges

Validation:
- Built-in Validator
- Custom Validator
- Cross-field Validator
- Async Validator
- updateValueAndValidity

Trạng thái:
- dirty / pristine
- touched / untouched
- valid / invalid
- disabled / enabled
- errors

Nâng cao:
- emitEvent
- onlySelf
- updateOn
- Typed Forms
- Dynamic Form
- ControlValueAccessor
- CVA với inner FormControl
- CVA với inner FormGroup
- CVA với OnPush
- Form performance
```

---

### 15.2. Checklist debug Angular Form

Khi form lỗi, hỏi theo thứ tự:

```text
1. FormControl có tồn tại không?
2. formControlName có đúng tên không?
3. Control có bị disabled không?
4. Có đang lấy form.value thay vì getRawValue không?
5. Validator nằm ở control hay group?
6. Có quên updateValueAndValidity không?
7. valueChanges có bị loop không?
8. patchValue có cần emitEvent: false không?
9. Custom component đã implement CVA chưa?
10. CVA có gọi onChange khi user đổi value không?
11. CVA có gọi onTouched khi blur không?
12. CVA có setDisabledState không?
13. Nếu OnPush, writeValue có cần markForCheck không?
```

---

### 15.3. Tư duy thiết kế form lớn trong production

```text
1. Form lớn nên dùng Reactive Form.
2. Logic form nên nằm ở TypeScript, không nhồi hết vào HTML.
3. Field phức tạp nên đóng gói thành custom component + CVA.
4. Component có nhiều field con có thể dùng inner FormGroup.
5. Component wrap UI control nội bộ có thể dùng inner FormControl.
6. Dữ liệu submit nên tối giản, ổn định, dễ map API.
7. valueChanges phải kiểm soát emitEvent để tránh loop.
8. Async validator phải tránh gọi API quá nhiều.
9. FormArray nhiều dòng phải chú ý performance và trackBy.
10. OnPush cần hiểu rõ khi nào UI render lại.
```

---

### 15.4. Câu tổng kết

```text
Angular Form không chỉ là lấy dữ liệu từ input.

Angular Form là hệ thống quản lý value, state, validation và luồng dữ liệu giữa UI và model.

Reactive Form giúp đưa logic form về TypeScript, dễ kiểm soát hơn trong dự án lớn.

ControlValueAccessor giúp custom component trở thành một form control thật sự.

Muốn hiểu Angular Form sâu, phải hiểu rõ 2 chiều:

FormControl → Component:
Dùng writeValue để đẩy value xuống UI.

Component → FormControl:
Dùng onChange để báo value mới lên FormControl.
```
