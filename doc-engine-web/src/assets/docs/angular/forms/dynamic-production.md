# Dynamic Forms và quy trình production

## 1. Dynamic form là control tree thay đổi theo runtime

Dynamic form không chỉ là render input từ một mảng cấu hình. Nó có thể bao gồm:

```text
- Thêm hoặc xóa row trong FormArray.
- Thêm hoặc xóa control theo loại nghiệp vụ.
- Enable/disable field theo permission hoặc state.
- Thay đổi validator.
- Tính derived value.
- Tải options bất đồng bộ.
```

Mỗi thay đổi phải giữ ba lớp đồng bộ:

```text
Control tree
Template
Business data
```

---

## 2. FormArray có typed row

```ts
interface OrderItemControls {
  id: FormControl<string>;
  productId: FormControl<number | null>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
}

type OrderItemGroup = FormGroup<OrderItemControls>;

items = new FormArray<OrderItemGroup>([]);
```

Factory tạo row:

```ts
private createItem(
  initial?: Partial<{
    id: string;
    productId: number | null;
    quantity: number;
    unitPrice: number;
  }>
): OrderItemGroup {
  return new FormGroup<OrderItemControls>({
    id: new FormControl(
      initial?.id ?? crypto.randomUUID(),
      { nonNullable: true }
    ),
    productId: new FormControl<number | null>(
      initial?.productId ?? null,
      Validators.required
    ),
    quantity: new FormControl(
      initial?.quantity ?? 1,
      {
        nonNullable: true,
        validators: [Validators.min(1)]
      }
    ),
    unitPrice: new FormControl(
      initial?.unitPrice ?? 0,
      {
        nonNullable: true,
        validators: [Validators.min(0)]
      }
    )
  });
}
```

Không rải logic khởi tạo row ở nhiều method. Factory giữ default value, validator và type nhất quán.

### 2.1. Identity của row

```ts
trackByControl(
  index: number,
  control: OrderItemGroup
): OrderItemGroup {
  return control;
}
```

Hoặc track bằng id ổn định:

```ts
trackByItemId(
  index: number,
  control: OrderItemGroup
): string {
  return control.controls.id.value;
}
```

Không track bằng index nếu row có thể được insert, remove hoặc reorder. Identity ổn định giúp giữ DOM, component con và focus đúng row.

---

## 3. Control có điều kiện

Có hai lựa chọn khác nhau:

### Giữ control và disable

```ts
taxCode.disable();
```

Phù hợp khi:

```text
- Field vẫn thuộc form model.
- Có thể bật lại và cần giữ value.
- Disabled state có ý nghĩa nghiệp vụ.
```

### Thêm hoặc xóa control

```ts
form.addControl(
  'companyName',
  new FormControl('', {
    nonNullable: true,
    validators: [Validators.required]
  })
);

form.removeControl('companyName');
```

Phù hợp khi field chỉ tồn tại trong một variant của form model.

Không dùng `*ngIf` để ẩn element nhưng bỏ quên control vẫn enabled và invalid trong form.

---

## 4. Field phụ thuộc field khác

Ví dụ province thay đổi thì district được reset và tải lại:

```ts
private readonly destroyRef = inject(DestroyRef);

readonly districts$ =
  this.form.controls.address.controls.provinceId.valueChanges.pipe(
    distinctUntilChanged(),
    tap(() => {
      this.form.controls.address.controls.districtId.reset(
        null,
        { emitEvent: false }
      );
    }),
    switchMap(provinceId =>
      provinceId == null
        ? of([])
        : this.locationService.getDistricts(provinceId)
    ),
    shareReplay({
      bufferSize: 1,
      refCount: true
    })
  );
```

`switchMap()` hủy subscription request cũ khi province thay đổi. Backend vẫn cần xử lý request an toàn; frontend cancellation không phải transaction.

Nếu observable được dùng bằng `async` pipe, template quản lý subscription. Nếu subscribe trong code, dùng `takeUntilDestroyed()`.

---

## 5. Derived value

Ví dụ total được tính từ quantity và unit price:

```ts
combineLatest([
  item.controls.quantity.valueChanges.pipe(
    startWith(item.controls.quantity.value)
  ),
  item.controls.unitPrice.valueChanges.pipe(
    startWith(item.controls.unitPrice.value)
  )
])
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(([quantity, unitPrice]) => {
    itemTotal.setValue(
      quantity * unitPrice,
      { emitEvent: false }
    );
  });
```

Trước khi tạo control `total`, hỏi:

```text
Total có phải user input không?
Có cần validate độc lập không?
Có cần submit không?
```

Nếu total luôn suy ra được, có thể để nó là view model thay vì form control. Không biến mọi giá trị hiển thị thành state của form.

---

## 6. Khởi tạo form từ API

Không truyền response tùy ý thẳng vào `patchValue()`:

```ts
this.form.patchValue(response);
```

Nên map qua boundary:

```ts
private applyPatient(
  patient: PatientDetailResponse
): void {
  this.form.reset({
    code: patient.code,
    fullName: patient.fullName,
    birthDate: patient.birthDate
      ? parseApiDate(patient.birthDate)
      : null
  });

  this.contacts.clear({
    emitEvent: false
  });

  patient.contacts.forEach(contact => {
    this.contacts.push(
      this.createContact(contact),
      { emitEvent: false }
    );
  });

  this.form.updateValueAndValidity({
    emitEvent: false
  });
}
```

Mapping tường minh xử lý:

```text
- Date string thành Date.
- null/default value.
- Field API không thuộc form.
- FormArray row factory.
- Disabled/permission state.
```

---

## 7. Quy trình submit

```ts
submit(): void {
  if (this.submitting) {
    return;
  }

  this.submitted = true;
  this.form.markAllAsTouched();
  this.form.updateValueAndValidity();

  if (this.form.invalid || this.form.pending) {
    this.focusFirstInvalidControl();
    return;
  }

  this.submitting = true;
  const request = this.toRequest();

  this.patientService.save(request)
    .pipe(
      finalize(() => {
        this.submitting = false;
      }),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next: result => {
        this.handleSaveSuccess(result);
      },
      error: error => {
        this.handleSaveError(error);
      }
    });
}
```

Luồng:

```text
Chặn double submit
        ↓
Đánh dấu submitted và touched
        ↓
Kiểm tra INVALID hoặc PENDING
        ↓
Map form model thành request DTO
        ↓
Gọi API
        ↓
Khôi phục submitting trong finalize
        ↓
Xử lý success hoặc server errors
```

Button:

```html
<button
  type="submit"
  [disabled]="submitting || form.pending"
>
  {{ submitting ? 'Đang lưu...' : 'Lưu' }}
</button>
```

Không chỉ dựa vào disabled button để chống double submit. Handler vẫn nên có guard.

---

## 8. Map request DTO

```ts
private toRequest(): SaveOrderRequest {
  const value = this.form.getRawValue();

  return {
    customerId: value.customerId,
    note: value.note.trim() || null,
    items: value.items.map(item => ({
      productId: requireValue(item.productId),
      quantity: item.quantity,
      unitPrice: item.unitPrice
    }))
  };
}
```

Submit boundary là nơi:

```text
- Trim/normalize nếu đó là contract.
- Chuyển Date thành API format.
- Loại UI-only state.
- Chuyển object selection thành id.
- Kiểm tra invariant cuối cùng.
```

Không để API service nhận trực tiếp `FormGroup`.

---

## 9. Validation error từ backend

Backend vẫn là nguồn xác thực cuối cùng:

```text
- Username vừa bị người khác sử dụng.
- Mã nghiệp vụ trùng.
- Record đã thay đổi.
- User mất permission.
```

Map field error:

```ts
private applyServerErrors(
  errors: Record<string, string>
): void {
  Object.entries(errors).forEach(([field, message]) => {
    const control = this.form.get(field);

    if (!control) {
      return;
    }

    control.setErrors({
      ...control.errors,
      server: message
    });

    control.markAsTouched();
  });
}
```

Manual error có thể bị validator ghi lại trong lần validation tiếp theo. Khi người dùng sửa field, thường nên xóa server error hoặc để submit mới xác nhận lại.

Không ép mọi backend error vào field:

```text
Field error
→ Hiển thị cạnh field.

Form/business error
→ Hiển thị summary.

Conflict/concurrency
→ Có flow refresh hoặc resolve riêng.
```

---

## 10. Focus field lỗi đầu tiên

Form model biết control nào invalid nhưng không sở hữu DOM. Component có thể:

```ts
private focusFirstInvalidControl(): void {
  requestAnimationFrame(() => {
    const element = this.host.nativeElement.querySelector<HTMLElement>(
      '[aria-invalid="true"], .ng-invalid[formControlName]'
    );

    element?.focus();
  });
}
```

Với component thư viện, query host có thể không focus đúng element nội bộ. Dự án lớn nên chuẩn hóa một focus adapter hoặc form-field component thay vì query DOM của thư viện.

Error summary cũng cần link/focus tới field tương ứng để hỗ trợ keyboard và screen reader.

---

## 11. Unsaved changes

Không dùng `form.dirty` như bằng chứng duy nhất rằng dữ liệu nghiệp vụ đã đổi:

```text
- Code patch value không tự động dirty.
- User sửa rồi trả lại giá trị cũ vẫn có thể dirty.
- Derived control có thể làm form dirty.
```

Nếu cần cảnh báo chính xác, so sánh normalized snapshot:

```ts
initialSnapshot = this.serializeForm();

hasUnsavedChanges(): boolean {
  return !deepEqual(
    this.initialSnapshot,
    this.serializeForm()
  );
}
```

`dirty` vẫn hữu ích cho UX, nhưng snapshot phù hợp hơn cho business decision.

---

## 12. Accessibility

```text
- Dùng label liên kết đúng input.
- Error message có id ổn định.
- aria-describedby trỏ tới hint/error.
- aria-invalid phản ánh trạng thái đang hiển thị.
- Submit lỗi nên focus summary hoặc field đầu tiên.
- Không chỉ dùng màu để biểu thị lỗi.
- Dynamic row thêm/xóa cần thông báo phù hợp.
```

Native semantic element luôn là nền tảng. ARIA bổ sung thông tin, không thay thế semantic HTML.

---

## 13. Performance

Các nguồn chi phí:

```text
- Subscription theo từng row không cleanup.
- Validator nặng chạy theo mỗi keypress.
- Async validator gọi API liên tục.
- Rebuild toàn bộ FormArray.
- Track row bằng index.
- Template gọi function nặng mỗi change detection.
- valueChanges ở root thực hiện deep work cho mọi field.
```

Hướng xử lý:

```text
- Track row bằng control/id ổn định.
- Subscribe gần source cần thiết.
- Dùng updateOn phù hợp.
- Dùng switchMap cho request phụ thuộc value.
- Batch control-tree mutation khi thực sự cần.
- Tách section lớn thành component có boundary rõ.
- Đo trước khi tối ưu.
```

---

## 14. Tổ chức form lớn

```text
feature/
├── patient-form.component.ts
├── patient-form.component.html
├── patient-form.factory.ts
├── patient-form.mapper.ts
├── patient.validators.ts
├── patient-form.types.ts
└── sections/
    ├── identity-section/
    ├── address-section/
    └── contacts-section/
```

Trách nhiệm:

```text
Factory
→ Tạo typed control tree và defaults.

Mapper
→ API response ↔ form model ↔ request DTO.

Validators
→ Pure validation rules.

Component
→ Điều phối load, submit và UI state.

Section component
→ Render một vùng, không tự sở hữu workflow toàn form.
```

Không mặc định biến mỗi section thành CVA. Nếu section chỉ thao tác một group thuộc form cha, truyền `FormGroup` typed hoặc dùng composition rõ ràng thường đơn giản hơn.

---

## 15. Checklist production

```text
[ ] Form model typed và nullability có chủ đích.
[ ] Form model được map tường minh với DTO.
[ ] Dynamic row có factory và identity ổn định.
[ ] Validator nằm đúng control/group/array.
[ ] Async request có cancellation policy.
[ ] Subscription có cleanup.
[ ] Submit chặn INVALID, PENDING và double click.
[ ] Backend errors được phân loại field/form/conflict.
[ ] Disabled fields có submit policy rõ.
[ ] Error UI hỗ trợ keyboard và screen reader.
[ ] Unsaved changes không chỉ dựa mù quáng vào dirty.
[ ] Form lớn có boundary factory/mapper/section rõ ràng.
```
