# Unsaved Changes Detection

Case này xử lý một bài toán form production rất hay gặp: user sửa dữ liệu rồi rời trang thì cần cảnh báo, nhưng nếu user sửa rồi nhập lại đúng như ban đầu thì không nên cảnh báo.

Điểm chính: **không dùng mỗi `form.dirty` để quyết định có thay đổi chưa lưu**.

---

## 1. Requirement thô

Product yêu cầu:

```text
Khi user đang sửa form mà rời trang, nếu có thay đổi chưa lưu thì cảnh báo.

Ví dụ:
- Ban đầu input = "a"
- User nhập "b"
- Thoát trang
-> cảnh báo

Ví dụ khác:
- Ban đầu input = "a"
- User nhập "b"
- User nhập lại "a"
- Thoát trang
-> không cảnh báo
```

Nếu chỉ dùng `form.dirty`, case thứ hai sẽ sai.

---

## 2. Vì sao form.dirty không đủ?

`dirty` nói rằng control đã từng bị user thay đổi.

Nó không nói value hiện tại có khác value ban đầu hay không.

```text
Initial: "a"
Input:   "b"
Input:   "a"

form.dirty = true
current value = initial value
```

Vì vậy:

```text
dirty/touched:
-> dùng tốt cho validation UX

unsaved changes:
-> phải so sánh current value với baseline value
```

---

## 3. Ví dụ tối giản: a -> b -> a

Form đơn giản:

```ts
form = new FormGroup({
  name: new FormControl('a', { nonNullable: true })
});
```

Nếu chỉ dùng `dirty`:

```ts
console.log(this.form.dirty); // false

this.form.get('name')!.setValue('b');
console.log(this.form.dirty); // true

this.form.get('name')!.setValue('a');
console.log(this.form.dirty); // vẫn true
```

Nhưng về nghiệp vụ, sau khi nhập lại `"a"` thì không còn thay đổi chưa lưu.

Cách đúng hơn:

```ts
type SimpleFormValue = {
  name: string;
};

const baseline: SimpleFormValue = {
  name: 'a'
};

function normalize(value: SimpleFormValue): SimpleFormValue {
  return {
    name: value.name.trim()
  };
}

function hasUnsavedChanges(current: SimpleFormValue): boolean {
  return JSON.stringify(normalize(current)) !== JSON.stringify(normalize(baseline));
}
```

Diễn biến:

```ts
hasUnsavedChanges({ name: 'a' }); // false
hasUnsavedChanges({ name: 'b' }); // true
hasUnsavedChanges({ name: 'a' }); // false
```

Trong component:

```ts
private baseline!: SimpleFormValue;

init(): void {
  const initialValue = { name: 'a' };

  this.form.reset(initialValue, { emitEvent: false });
  this.baseline = normalize(initialValue);
  this.form.markAsPristine();
}

hasUnsavedChanges(): boolean {
  const current = normalize(this.form.getRawValue() as SimpleFormValue);
  return JSON.stringify(current) !== JSON.stringify(this.baseline);
}
```

Kết luận:

```text
dirty trả lời: user đã từng sửa chưa?
baseline compare trả lời: dữ liệu hiện tại có khác dữ liệu ban đầu không?
```

---

## 4. Câu hỏi cần làm rõ

Trước khi code, hỏi:

```text
1. So sánh value raw hay normalized?
2. Space đầu/cuối có tính là thay đổi không?
3. null và empty string có coi giống nhau không?
4. Date so sánh theo Date object hay ISO string?
5. Disabled field có tính vào thay đổi không?
6. FormArray đổi thứ tự có tính là thay đổi không?
7. Save thành công thì baseline update thế nào?
8. Autosave thành công có reset baseline không?
9. API trả data sau save có khác input không?
10. Có cần cảnh báo khi reload/đóng tab trình duyệt không?
```

Giả định trong case này:

```text
- Trim string trước khi so sánh.
- Empty string và null được normalize nhất quán theo field.
- Date so sánh bằng yyyy-MM-dd.
- Disabled field vẫn submit nên dùng getRawValue().
- Save thành công thì baseline lấy theo response backend.
```

---

## 5. Thiết kế đúng: baseline vs current

Ý tưởng:

```text
1. Khi init form, lưu baseline normalized value.
2. Khi cần kiểm tra, lấy current normalized value.
3. Deep compare baseline và current.
4. Nếu khác -> có unsaved changes.
5. Sau save thành công -> reset baseline.
```

Flow:

```text
API data / initial data
-> map to form value
-> form.reset(value)
-> baseline = normalize(value)

User edit
-> form value đổi

CanDeactivate
-> current = normalize(form.getRawValue())
-> compare current với baseline
```

---

## 6. Model ví dụ

```ts
export interface CustomerFormValue {
  name: string;
  phone: string;
  birthday: string | null;
  address: {
    provinceId: string | null;
    districtId: string | null;
    detail: string;
  };
  contacts: Array<{
    type: 'email' | 'phone';
    value: string;
  }>;
}
```

Form:

```ts
form = this.fb.group({
  name: ['', Validators.required],
  phone: [''],
  birthday: [null as string | null],
  address: this.fb.group({
    provinceId: [null as string | null],
    districtId: [null as string | null],
    detail: ['']
  }),
  contacts: this.fb.array([])
});
```

---

## 7. Normalize value trước khi so sánh

Không nên so sánh raw value trực tiếp nếu app có rule format.

```ts
function normalizeCustomerFormValue(value: CustomerFormValue): CustomerFormValue {
  return {
    name: value.name.trim(),
    phone: value.phone.trim(),
    birthday: value.birthday || null,
    address: {
      provinceId: value.address.provinceId || null,
      districtId: value.address.districtId || null,
      detail: value.address.detail.trim()
    },
    contacts: value.contacts.map(contact => ({
      type: contact.type,
      value: contact.value.trim()
    }))
  };
}
```

Ví dụ:

```text
" An " -> "An"
""     -> null ở field optional nếu rule yêu cầu
```

Normalize phải theo nghiệp vụ. Không tự trim mọi thứ nếu field cần giữ space.

---

## 8. Deep compare

Có thể dùng utility như `lodash.isequal` nếu dự án có sẵn. Nếu không, có thể dùng compare nhỏ cho plain data.

```ts
function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
```

Cách `JSON.stringify` chỉ ổn khi:

```text
- object là plain JSON data
- thứ tự key ổn định
- không có Date object/function/undefined phức tạp
```

Production tốt hơn nên có utility rõ:

```ts
function hasChanged<T>(current: T, baseline: T): boolean {
  return !isDeepEqual(current, baseline);
}
```

Nếu form có Date object, Map, Set, File, hoặc object phức tạp, cần normalize về JSON-safe shape trước.

---

## 9. UnsavedChangesTracker

Tách logic tracking ra service/class nhỏ để reuse.

```ts
export class UnsavedChangesTracker<T> {
  private baseline!: T;

  setBaseline(value: T): void {
    this.baseline = structuredClone(value);
  }

  hasChanges(current: T): boolean {
    return !isDeepEqual(current, this.baseline);
  }

  getBaseline(): T {
    return this.baseline;
  }
}
```

Nếu browser target chưa hỗ trợ `structuredClone`, dùng clone utility khác.

Trong Angular service/facade:

```ts
private changesTracker = new UnsavedChangesTracker<CustomerFormValue>();
```

---

## 10. Init form và baseline

Khi load dữ liệu ban đầu:

```ts
init(customer: CustomerDto): void {
  const formValue = toCustomerFormValue(customer);
  const normalized = normalizeCustomerFormValue(formValue);

  this.patchContacts(formValue.contacts);
  this.form.reset(formValue, { emitEvent: false });
  this.form.markAsPristine();

  this.changesTracker.setBaseline(normalized);
}
```

Với `FormArray`, cần tạo controls trước:

```ts
private patchContacts(contacts: CustomerFormValue['contacts']): void {
  const contactsArray = this.form.get('contacts') as FormArray;

  contactsArray.clear();
  contacts.forEach(contact => {
    contactsArray.push(this.createContactGroup(contact));
  });
}
```

Không nên chỉ `patchValue` vào FormArray nếu số lượng item thay đổi.

---

## 11. hasUnsavedChanges

```ts
hasUnsavedChanges(): boolean {
  const current = normalizeCustomerFormValue(
    this.form.getRawValue() as CustomerFormValue
  );

  return this.changesTracker.hasChanges(current);
}
```

Dùng `getRawValue()` nếu disabled field vẫn thuộc dữ liệu submit hoặc cần so sánh.

Dùng `form.value` nếu disabled field không thuộc dữ liệu nghiệp vụ.

Quyết định này phải theo business.

---

## 12. CanDeactivate guard

Interface:

```ts
export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
}
```

Guard:

```ts
export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = component => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }

  return confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang?');
};
```

Route:

```ts
{
  path: ':id/edit',
  component: CustomerEditPageComponent,
  canDeactivate: [unsavedChangesGuard]
}
```

Production nên thay `confirm()` bằng dialog service:

```ts
return dialog.confirm({
  title: 'Rời khỏi trang?',
  content: 'Bạn có thay đổi chưa lưu.'
});
```

---

## 13. Save thành công phải reset baseline

Sau khi save, baseline cũ không còn đúng.

```ts
save(): void {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  const input = toUpdateCustomerInput(
    this.form.getRawValue() as CustomerFormValue
  );

  this.api.updateCustomer(input).subscribe(savedCustomer => {
    const savedFormValue = toCustomerFormValue(savedCustomer);
    const normalized = normalizeCustomerFormValue(savedFormValue);

    this.patchContacts(savedFormValue.contacts);
    this.form.reset(savedFormValue, { emitEvent: false });
    this.form.markAsPristine();
    this.changesTracker.setBaseline(normalized);
  });
}
```

Vì sao lấy baseline từ response backend?

```text
Backend có thể trim, normalize, tính lại field, đổi format.
Baseline nên theo dữ liệu đã được backend chấp nhận.
```

---

## 14. Case user sửa rồi sửa lại như ban đầu

Initial:

```ts
baseline = {
  name: 'a'
}
```

User nhập `b`:

```ts
current = {
  name: 'b'
}

hasUnsavedChanges() -> true
```

User nhập lại `a`:

```ts
current = {
  name: 'a'
}

hasUnsavedChanges() -> false
```

Trong khi đó:

```text
form.dirty vẫn true
```

Đó là lý do `dirty` không đủ cho unsaved changes.

---

## 15. FormArray: thêm rồi xóa lại

Initial:

```ts
contacts = [
  { type: 'email', value: 'a@example.com' }
]
```

User thêm contact mới rồi xóa contact đó:

```text
FormArray từng dirty
Current contacts giống baseline
-> không cảnh báo
```

Nếu dùng baseline compare, case này đúng.

Nếu dùng `form.dirty`, sẽ cảnh báo sai.

---

## 16. Null, empty string và default value

Case dễ sai:

```text
Initial API: phone = null
Form input hiển thị: ''
Current raw value: ''
```

Nếu compare raw:

```text
null !== ''
-> cảnh báo sai
```

Normalize:

```ts
phone: value.phone.trim() || ''
```

Hoặc:

```ts
phone: value.phone.trim() || null
```

Chọn một chuẩn theo API/business, rồi dùng nhất quán cho baseline và current.

---

## 17. Date normalization

Không nên compare Date object trực tiếp.

```ts
function normalizeDate(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}
```

Nếu field là date-only, normalize về `yyyy-MM-dd`.

Nếu field là datetime có timezone, cần rule rõ hơn.

---

## 18. beforeunload khi đóng tab/reload

`CanDeactivate` chỉ bắt navigation trong Angular Router. Nếu user reload tab hoặc đóng browser, cần `beforeunload`.

```ts
@HostListener('window:beforeunload', ['$event'])
handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!this.hasUnsavedChanges()) {
    return;
  }

  event.preventDefault();
  event.returnValue = '';
}
```

Lưu ý:

```text
Browser hiện đại không cho custom message.
Chỉ hiện prompt mặc định.
```

---

## 19. Autosave thì baseline tính thế nào?

Nếu có autosave:

```text
User nhập
-> autosave API thành công
-> baseline nên cập nhật theo bản autosave đã lưu
```

```ts
autosave$ = this.form.valueChanges.pipe(
  debounceTime(1000),
  map(() => normalizeCustomerFormValue(this.form.getRawValue() as CustomerFormValue)),
  switchMap(value =>
    this.api.saveDraft(value).pipe(
      tap(savedDraft => {
        const savedValue = normalizeCustomerFormValue(toCustomerFormValue(savedDraft));
        this.changesTracker.setBaseline(savedValue);
        this.form.markAsPristine();
      })
    )
  )
);
```

Nếu autosave thất bại, không reset baseline.

---

## 20. Performance

Không cần deep compare mỗi keypress nếu form lớn.

Các cách dùng:

```text
1. Chỉ compare khi user định rời trang.
2. Nếu cần hiển thị "Có thay đổi chưa lưu", debounce valueChanges.
3. Normalize nhẹ, tránh xử lý nặng trong mỗi input.
```

Ví dụ stream hiển thị trạng thái:

```ts
hasUnsavedChanges$ = this.form.valueChanges.pipe(
  debounceTime(200),
  startWith(this.form.getRawValue()),
  map(() => this.hasUnsavedChanges()),
  distinctUntilChanged()
);
```

---

## 21. Production risks

```text
[ ] Dùng form.dirty nên cảnh báo sai khi user nhập lại như ban đầu
    -> baseline compare.

[ ] So sánh raw value làm null khác empty string
    -> normalize.

[ ] Date object compare sai
    -> normalize date.

[ ] FormArray patch sai hoặc order thay đổi
    -> normalize array rõ rule.

[ ] Save thành công nhưng baseline không reset
    -> lần sau vẫn cảnh báo.

[ ] Backend normalize data nhưng baseline lấy input cũ
    -> baseline nên lấy response.

[ ] Disabled fields bị bỏ qua ngoài ý muốn
    -> chọn form.value hoặc getRawValue theo nghiệp vụ.

[ ] Router guard không bắt đóng tab
    -> thêm beforeunload nếu cần.
```

---

## 22. Implementation plan

```text
1. Tạo normalize function cho form value.
2. Tạo deep equal utility hoặc dùng thư viện có sẵn.
3. Khi init form, reset form và set baseline normalized.
4. Implement hasUnsavedChanges bằng current normalized vs baseline.
5. Tạo CanDeactivate guard.
6. Sau save success, reset form và baseline bằng response backend.
7. Xử lý FormArray/Date/null/empty string.
8. Nếu cần, thêm beforeunload.
9. Test các case sửa rồi sửa lại như ban đầu.
```

---

## 23. Test cases nên có

```text
[ ] initial "a" -> current "b" => has changes
[ ] initial "a" -> current "b" -> current "a" => no changes
[ ] initial null -> current "" => tùy normalize, thường no changes
[ ] initial date object -> current same yyyy-MM-dd => no changes
[ ] FormArray add item => has changes
[ ] FormArray add item then remove => no changes
[ ] save success resets baseline
[ ] disabled field included/excluded đúng theo rule
```

Ví dụ unit test:

```ts
it('does not mark as changed when user restores original value', () => {
  const baseline = normalizeCustomerFormValue({
    name: 'a',
    phone: '',
    birthday: null,
    address: {
      provinceId: null,
      districtId: null,
      detail: ''
    },
    contacts: []
  });

  const current = normalizeCustomerFormValue({
    name: 'a',
    phone: '',
    birthday: null,
    address: {
      provinceId: null,
      districtId: null,
      detail: ''
    },
    contacts: []
  });

  expect(isDeepEqual(current, baseline)).toBe(true);
});
```

---

## 24. Tư duy chốt

```text
form.dirty = user đã từng sửa.

unsaved changes = dữ liệu hiện tại khác dữ liệu baseline đã lưu.
```

Hai khái niệm này khác nhau.

Middle/Senior không dùng `dirty` như câu trả lời cuối cùng cho "có thay đổi chưa lưu không". Họ lưu baseline, normalize value, deep compare, và reset baseline sau khi save thành công.
