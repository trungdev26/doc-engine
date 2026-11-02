# Multi-step Form Production

Case này mô phỏng một task frontend production rất hay gặp: làm màn hình tạo/sửa hồ sơ nhiều bước, có validation theo từng step, draft state, lưu nháp, submit chống double click và cảnh báo khi rời trang.

Mục tiêu không phải chỉ biết viết Reactive Form, mà là biết thiết kế form lớn sao cho không biến component thành một khối khó maintain.

---

## 1. Requirement thô

Product đưa yêu cầu:

```text
Làm màn hình tạo đơn hàng gồm 4 bước:

1. Thông tin khách hàng
2. Danh sách sản phẩm/dịch vụ
3. Thanh toán
4. Xác nhận

Yêu cầu:
- validate từng bước trước khi đi tiếp
- quay lại bước trước không mất dữ liệu
- có lưu nháp
- refresh có thể khôi phục draft
- rời trang khi có thay đổi chưa lưu thì hỏi confirm
- submit chống double click
- dùng custom money input
- create/edit mode càng reuse được càng tốt
```

Nếu code ngay trong một component, rất dễ có:

```text
- một FormGroup khổng lồ
- nhiều boolean điều khiển step
- valueChanges rải rác
- submit logic dài
- draft/localStorage/API lẫn với template
- validation khó debug
```

---

## 2. Câu hỏi cần làm rõ

Trước khi code, hỏi:

```text
1. Lưu nháp là localStorage hay API draft?
2. Draft có theo user/tenant/branch không?
3. Refresh có bắt buộc restore draft không?
4. Edit mode có dùng chung flow với create không?
5. Mỗi step validate field nào?
6. Có được nhảy tự do giữa các step không?
7. Sản phẩm/dịch vụ lấy danh mục từ đâu?
8. Giá tiền tính ở frontend hay backend?
9. Submit xong chuyển về đâu?
10. Nếu submit lỗi validation backend, show ở field hay toast?
```

Giả định cho case này:

```text
- Draft lưu localStorage theo userId.
- Create mode có draft.
- Edit mode load từ API và không dùng localStorage draft.
- Chỉ được đi tiếp khi step hiện tại valid.
- Submit gọi API một lần ở bước xác nhận.
- Money input là custom CVA.
```

---

## 3. Phân loại state

| State | Loại | Nơi đặt |
|---|---|---|
| step hiện tại | workflow UI state | facade/state service |
| form customer | form state | Reactive Form |
| form items | form state | FormArray |
| payment | form state | Reactive Form |
| draft | persisted client state | draft service/localStorage |
| submitting | async UI state | facade submit flow |
| danh mục sản phẩm | server state/cache | catalog service |
| pending changes | derived state | form dirty + draft status |
| mode create/edit | route state | route params/data |

Quyết định quan trọng:

```text
Reactive Form là source of truth cho draft đang nhập.
Step state chỉ quyết định user đang nhìn step nào.
Draft persistence là snapshot của form, không phải source song song.
```

---

## 4. Route design

Create:

```text
/orders/create
```

Edit:

```text
/orders/:id/edit
```

Route config:

```ts
export const ORDER_ROUTES: Routes = [
  {
    path: 'create',
    component: OrderFormPageComponent,
    canDeactivate: [pendingChangesGuard],
    data: { mode: 'create' }
  },
  {
    path: ':id/edit',
    component: OrderFormPageComponent,
    canDeactivate: [pendingChangesGuard],
    data: { mode: 'edit' }
  }
];
```

Một component có thể dùng chung nếu create/edit flow đủ giống nhau. Nếu edit có nghiệp vụ khác nhiều, tách page riêng sẽ dễ maintain hơn.

---

## 5. Component boundary

Chia theo step:

```text
OrderFormPageComponent
  ├── OrderStepNavComponent
  ├── CustomerStepComponent
  ├── ItemsStepComponent
  │     └── MoneyInputComponent (CVA)
  ├── PaymentStepComponent
  └── ConfirmStepComponent
```

Vai trò:

```text
OrderFormPageComponent:
-> bind vm$, render step hiện tại, gọi facade.

OrderFormFacade:
-> init form, load edit data, restore draft, submit, save draft, step navigation.

Step components:
-> nhận FormGroup/FormArray tương ứng, render field, không tự submit API.

MoneyInputComponent:
-> custom form control qua CVA.
```

---

## 6. Form model

Form chính:

```ts
export type OrderFormValue = {
  customer: {
    customerId: string | null;
    customerName: string;
    phone: string;
  };
  items: Array<{
    productId: string | null;
    quantity: number;
    price: number;
  }>;
  payment: {
    method: 'cash' | 'bank' | 'debt';
    paidAmount: number;
    note: string;
  };
};
```

Build form:

```ts
@Injectable()
export class OrderFormBuilder {
  constructor(private fb: FormBuilder) {}

  build(): FormGroup {
    return this.fb.group({
      customer: this.fb.group({
        customerId: [null, Validators.required],
        customerName: ['', Validators.required],
        phone: ['', Validators.required]
      }),
      items: this.fb.array([this.createItemGroup()]),
      payment: this.fb.group({
        method: ['cash', Validators.required],
        paidAmount: [0, [Validators.required, Validators.min(0)]],
        note: ['']
      })
    });
  }

  createItemGroup(): FormGroup {
    return this.fb.group({
      productId: [null, Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      price: [0, [Validators.required, Validators.min(0)]]
    });
  }
}
```

Nếu typed forms đang dùng trong dự án, có thể type chặt hơn. Nhưng dù type mức nào, form shape phải rõ.

---

## 7. Step validation

Mỗi step validate một phần form.

```ts
export type OrderFormStep = 'customer' | 'items' | 'payment' | 'confirm';

const STEP_ORDER: OrderFormStep[] = ['customer', 'items', 'payment', 'confirm'];
```

Helper:

```ts
function getStepControl(form: FormGroup, step: OrderFormStep): AbstractControl {
  if (step === 'confirm') {
    return form;
  }

  return form.get(step)!;
}
```

Facade:

```ts
goNext(): void {
  const currentStep = this.stepSubject.value;
  const control = getStepControl(this.form, currentStep);

  if (control.invalid) {
    control.markAllAsTouched();
    return;
  }

  const currentIndex = STEP_ORDER.indexOf(currentStep);
  const nextStep = STEP_ORDER[currentIndex + 1];

  if (nextStep) {
    this.stepSubject.next(nextStep);
  }
}
```

Không nên validate toàn bộ form khi user mới ở step 1 nếu các step sau chưa nhập.

---

## 8. Draft state

Draft là snapshot của form.

```ts
export interface OrderDraft {
  version: 1;
  userId: string;
  updatedAt: string;
  value: OrderFormValue;
  step: OrderFormStep;
}
```

Draft service:

```ts
@Injectable({ providedIn: 'root' })
export class OrderDraftStorage {
  private readonly keyPrefix = 'order-create-draft';

  load(userId: string): OrderDraft | null {
    const raw = localStorage.getItem(this.getKey(userId));
    return raw ? JSON.parse(raw) : null;
  }

  save(userId: string, draft: OrderDraft): void {
    localStorage.setItem(this.getKey(userId), JSON.stringify(draft));
  }

  clear(userId: string): void {
    localStorage.removeItem(this.getKey(userId));
  }

  private getKey(userId: string): string {
    return `${this.keyPrefix}:${userId}`;
  }
}
```

Lưu theo `userId` để tránh user này nhìn thấy draft của user khác.

Nếu app có tenant/branch, key nên gồm cả tenant/branch:

```text
order-create-draft:{tenantId}:{branchId}:{userId}
```

---

## 9. Autosave draft

Autosave chỉ dùng ở create mode.

```ts
private setupAutosave(userId: string): void {
  combineLatest([
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    this.step$
  ]).pipe(
    debounceTime(800),
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(([value, step]) => {
    this.draftStorage.save(userId, {
      version: 1,
      userId,
      updatedAt: new Date().toISOString(),
      value: value as OrderFormValue,
      step
    });
  });
}
```

Nếu lưu draft qua API thay vì localStorage:

```text
switchMap:
-> latest draft thắng, request cũ có thể bỏ.

concatMap:
-> lưu tuần tự, không đảo thứ tự.
```

Chọn operator theo nghiệp vụ.

---

## 10. Restore draft

Khi vào create page:

```ts
initCreate(userId: string): void {
  const draft = this.draftStorage.load(userId);

  if (draft) {
    this.form.patchValue(draft.value, { emitEvent: false });
    this.stepSubject.next(draft.step);
  }

  this.setupAutosave(userId);
}
```

Nếu draft cũ quá lâu, có thể hỏi user:

```text
Bạn có bản nháp từ 2 ngày trước. Khôi phục?
```

Không nên tự restore draft cũ nhiều tuần mà không hỏi.

---

## 11. Edit mode init

Edit mode load từ API:

```ts
initEdit(orderId: string): void {
  this.api.getById(orderId).pipe(
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(order => {
    this.patchFormFromOrder(order);
    this.form.markAsPristine();
  });
}
```

Với `FormArray`, cần clear và add group theo data trước khi patch.

```ts
private patchFormFromOrder(order: OrderDto): void {
  const value = toOrderFormValue(order);
  const itemsArray = this.form.get('items') as FormArray;

  itemsArray.clear();
  value.items.forEach(() => itemsArray.push(this.formBuilder.createItemGroup()));

  this.form.patchValue(value, { emitEvent: false });
}
```

---

## 12. FormArray items

```ts
get itemsArray(): FormArray {
  return this.form.get('items') as FormArray;
}

addItem(): void {
  this.itemsArray.push(this.formBuilder.createItemGroup());
  this.form.markAsDirty();
}

removeItem(index: number): void {
  if (this.itemsArray.length <= 1) {
    return;
  }

  this.itemsArray.removeAt(index);
  this.form.markAsDirty();
}
```

Template cần `trackBy`:

```html
<div
  *ngFor="let itemControl of itemsArray.controls; let i = index; trackBy: trackByIndex"
  [formGroupName]="i">
  ...
</div>
```

```ts
trackByIndex = (index: number) => index;
```

---

## 13. Custom MoneyInput CVA

```ts
@Component({
  selector: 'app-money-input',
  template: `
    <input
      [disabled]="disabled"
      [value]="displayValue"
      (input)="handleInput($event)"
      (blur)="handleBlur()">
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoneyInputComponent implements ControlValueAccessor {
  value: number | null = null;
  displayValue = '';
  disabled = false;

  private onChange = (value: number | null) => {};
  private onTouched = () => {};

  writeValue(value: number | null): void {
    this.value = value;
    this.displayValue = value != null ? value.toLocaleString('vi-VN') : '';
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  handleInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const numericValue = raw ? Number(raw.replace(/\D/g, '')) : null;

    this.value = numericValue;
    this.displayValue = raw;
    this.onChange(numericValue);
  }

  handleBlur(): void {
    this.displayValue = this.value != null ? this.value.toLocaleString('vi-VN') : '';
    this.onTouched();
  }
}
```

Không gọi `onChange` trong `writeValue`. `writeValue` là chiều form -> component, không phải user input.

---

## 14. Pending changes guard

Component/facade expose method:

```ts
hasPendingChanges(): boolean {
  return this.form.dirty && !this.submitted;
}
```

Guard:

```ts
export interface PendingChangesComponent {
  hasPendingChanges(): boolean;
}

export const pendingChangesGuard: CanDeactivateFn<PendingChangesComponent> = component => {
  if (!component.hasPendingChanges()) {
    return true;
  }

  return confirm('Bạn có thay đổi chưa lưu. Rời khỏi trang?');
};
```

Production nên dùng dialog service thay `confirm()` nếu app có design system.

---

## 15. Submit flow

```ts
private submitSubject = new Subject<void>();

submitState$ = this.submitSubject.pipe(
  exhaustMap(() => {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return of({ status: 'invalid' } as const);
    }

    const input = toSubmitOrderInput(this.form.getRawValue() as OrderFormValue);

    return this.api.create(input).pipe(
      map(order => ({ status: 'success', order } as const)),
      startWith({ status: 'submitting' } as const),
      catchError(() => of({ status: 'error', error: 'Tạo đơn thất bại' } as const))
    );
  }),
  shareReplay({ bufferSize: 1, refCount: true })
);

submit(): void {
  this.submitSubject.next();
}
```

`exhaustMap` chống double submit: submit đang chạy thì click mới bị bỏ qua.

---

## 16. Mapping form -> API input

Không gửi raw form nếu API input cần shape khác.

```ts
export interface SubmitOrderInput {
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  paymentMethod: string;
  paidAmount: number;
  note?: string;
}

export function toSubmitOrderInput(value: OrderFormValue): SubmitOrderInput {
  return {
    customerId: value.customer.customerId!,
    items: value.items.map(item => ({
      productId: item.productId!,
      quantity: item.quantity,
      price: item.price
    })),
    paymentMethod: value.payment.method,
    paidAmount: value.payment.paidAmount,
    note: value.payment.note || undefined
  };
}
```

Mapper này nên test nếu nghiệp vụ quan trọng.

---

## 17. vm$

VM cho page:

```ts
vm$ = combineLatest({
  step: this.step$,
  totalAmount: this.totalAmount$,
  submitState: this.submitState$.pipe(startWith({ status: 'idle' } as const)),
  products: this.catalog.products$
}).pipe(
  map(({ step, totalAmount, submitState, products }) => ({
    step,
    products,
    totalAmount,
    submitting: submitState.status === 'submitting',
    submitError: submitState.status === 'error' ? submitState.error : null,
    canGoBack: STEP_ORDER.indexOf(step) > 0,
    canGoNext: step !== 'confirm'
  }))
);
```

Template chỉ đọc VM.

---

## 18. Production risks

```text
[ ] FormArray patch sai số lượng item
    -> clear/add controls theo data trước khi patch.

[ ] valueChanges loop khi patch derived field
    -> dùng emitEvent: false.

[ ] User refresh mất dữ liệu
    -> autosave draft nếu requirement cần.

[ ] User khác dùng chung máy thấy draft
    -> draft key gồm userId/tenant/branch.

[ ] Submit double click tạo 2 đơn
    -> exhaustMap + disable button.

[ ] Rời trang mất dữ liệu
    -> CanDeactivate pending changes guard.

[ ] Custom input không sync form
    -> CVA đúng: writeValue/onChange/onTouched/setDisabledState.

[ ] Edit mode bị local draft create đè
    -> tách init create/edit rõ ràng.
```

---

## 19. Implementation plan

```text
1. Tạo route create/edit + pendingChangesGuard.
2. Tạo form model và OrderFormBuilder.
3. Tạo OrderFormFacade scoped ở page.
4. Tạo step state và goNext/goBack.
5. Tạo step components nhận FormGroup/FormArray.
6. Tạo MoneyInput CVA.
7. Tạo draft storage service.
8. Init create restore draft + autosave.
9. Init edit load API + patch FormArray đúng.
10. Tạo submit flow bằng exhaustMap.
11. Tạo mapper form -> API input.
12. Verify validation từng step, refresh, submit, rời trang.
```

---

## 20. Checklist review

```text
Form:
[ ] Form shape rõ
[ ] Step validation đúng scope
[ ] FormArray patch đúng
[ ] Derived field tránh loop

State:
[ ] Reactive Form là source of truth cho draft
[ ] Step state tách riêng
[ ] Draft persistence không thành source song song

Flow:
[ ] Create/edit init tách rõ
[ ] Submit chống double click
[ ] Submit success clear draft
[ ] Pending changes guard đúng

Components:
[ ] Step components không tự gọi API submit
[ ] Custom money input là CVA
[ ] Template đọc vm, không xử lý logic nặng
```

---

## 21. Tư duy chốt

Form nhiều bước khó vì nó trộn nhiều concern:

```text
form state
workflow step
draft persistence
validation
custom controls
submit
route guard
create/edit mode
```

Middle/Senior không cố xử lý tất cả bằng vài boolean trong component. Họ chọn source of truth, scope state theo workflow, dùng Reactive Form đúng vai trò, và tách orchestration ra facade để step components chỉ tập trung render form.
