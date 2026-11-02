# Production quality: error, performance, permission, forms

Code production khác demo ở chỗ phải sống với dữ liệu lỗi, mạng chậm, user thao tác nhanh, permission thiếu, list lớn, form phức tạp và requirement đổi.

Phần này là checklist thực chiến để feature không chỉ chạy happy path.

---

## 1. UI state đầy đủ

Mỗi màn hình load data nên có:

```text
- loading
- success
- empty
- error
- retry/refresh nếu phù hợp
- permission denied nếu có phân quyền
```

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <app-loading *ngIf="vm.status === 'loading'"></app-loading>

  <nz-alert
    *ngIf="vm.status === 'error'"
    nzType="error"
    [nzMessage]="vm.error">
  </nz-alert>

  <app-empty *ngIf="vm.status === 'success' && !vm.hasData"></app-empty>

  <app-order-table
    *ngIf="vm.status === 'success' && vm.hasData"
    [orders]="vm.orders">
  </app-order-table>
</ng-container>
```

Không để user nhìn màn hình trắng khi API lỗi.

---

## 2. Submit state

Submit cần chống double click và có disabled/loading.

```ts
private submitSubject = new Subject<void>();

submitState$ = this.submitSubject.pipe(
  exhaustMap(() =>
    this.api.submit(this.form.getRawValue()).pipe(
      map(() => ({ status: 'success' } as const)),
      startWith({ status: 'submitting' } as const),
      catchError(() => of({ status: 'error', error: 'Lưu thất bại' } as const))
    )
  )
);

submit(): void {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  this.submitSubject.next();
}
```

`exhaustMap` phù hợp khi submit đang chạy thì bỏ qua click mới.

---

## 3. Permission

Frontend permission giúp UX tốt hơn, không thay thế backend authorization.

```ts
vm$ = combineLatest({
  orders: this.orders$,
  canCreate: this.permission.has$('Order.Create'),
  canApprove: this.permission.has$('Order.Approve')
});
```

Template:

```html
<button *ngIf="vm.canCreate" nz-button>Tạo đơn</button>
<button *ngIf="vm.canApprove" nz-button>Duyệt</button>
```

Checklist:

```text
[ ] Menu có ẩn theo quyền không?
[ ] Route có guard không?
[ ] Button/action có check quyền không?
[ ] Backend có check lại không?
[ ] User/tenant/branch đổi có reload permission không?
```

---

## 4. Form production

Form lớn cần kiểm soát value flow.

Checklist:

```text
[ ] Init form từ API dùng patchValue đúng chưa?
[ ] Derived field có tránh loop chưa?
[ ] Async validator có debounce/updateOn blur chưa?
[ ] Disabled field khi submit dùng getRawValue nếu cần chưa?
[ ] Custom component có CVA chưa?
[ ] Error message consistent chưa?
```

Ví dụ derived field:

```ts
combineLatest([
  this.form.get('quantity')!.valueChanges.pipe(startWith(this.form.get('quantity')!.value)),
  this.form.get('price')!.valueChanges.pipe(startWith(this.form.get('price')!.value))
]).pipe(
  map(([quantity, price]) => (quantity || 0) * (price || 0)),
  takeUntilDestroyed(this.destroyRef)
).subscribe(total => {
  this.form.patchValue({ total }, { emitEvent: false });
});
```

`emitEvent: false` tránh `valueChanges` loop.

---

## 5. Performance checklist

Các lỗi performance FE hay đến từ template và list.

```text
[ ] OnPush cho component presentational/list row
[ ] trackBy cho ngFor
[ ] Không gọi function nặng trong template
[ ] Không tạo object/array inline truyền xuống con
[ ] Debounce search/input
[ ] Virtual scroll hoặc paging cho list lớn
[ ] Lazy load route theo feature
[ ] Cache/shareReplay cho API đọc nhiều
```

Không tốt:

```html
<app-row
  *ngFor="let row of rows"
  [config]="{ editable: true }"
  [score]="calculateScore(row)">
</app-row>
```

Tốt hơn:

```html
<app-row
  *ngFor="let row of rows; trackBy: trackById"
  [config]="rowConfig"
  [row]="row">
</app-row>
```

```ts
readonly rowConfig = { editable: true };
trackById = (_: number, row: RowVm) => row.id;
```

---

## 6. API error strategy

Không phải error nào cũng xử lý giống nhau.

```text
401:
-> logout/refresh token/login

403:
-> forbidden/ẩn action

404:
-> not found/empty detail

400 validation:
-> show field errors nếu backend trả mapping

500/network:
-> show generic error + retry
```

Trong stream dài như search, catch error ở inner stream:

```ts
result$ = this.keyword$.pipe(
  switchMap(keyword =>
    this.api.search(keyword).pipe(
      catchError(() => of([]))
    )
  )
);
```

Nếu catch ở ngoài, stream search có thể chết sau một lỗi.

---

## 7. Accessibility tối thiểu

Senior FE không cần thành chuyên gia a11y ngay, nhưng nên có baseline:

```text
[ ] Button thật dùng button, link thật dùng a
[ ] Icon button có aria-label/title
[ ] Modal focus hợp lý
[ ] Form error liên kết với field
[ ] Keyboard thao tác được các control chính
[ ] Color không phải tín hiệu duy nhất
```

Ví dụ:

```html
<button
  type="button"
  aria-label="Xóa dòng"
  (click)="remove(row.id)">
  <span nz-icon nzType="delete"></span>
</button>
```

---

## 8. Production checklist trước khi xong feature

```text
Happy path:
[ ] Load data đúng
[ ] Submit đúng
[ ] Navigate đúng

Unhappy path:
[ ] API lỗi
[ ] Data rỗng
[ ] Permission thiếu
[ ] Network chậm
[ ] User click nhanh/double submit

Maintain:
[ ] Component không quá dày
[ ] Source of truth rõ
[ ] State không duplicate
[ ] Side effect có chỗ ở

Performance:
[ ] List có trackBy
[ ] Template không có function nặng
[ ] Search debounce
[ ] Không gọi API thừa
```
