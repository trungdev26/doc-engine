# Component design production

Component là nơi frontend dễ phình nhất. Ban đầu nó chỉ render UI, sau đó thêm API, thêm form, thêm permission, thêm loading, thêm modal, thêm mapping. Một thời gian sau component thành nơi chứa mọi thứ.

Phần này tập trung vào cách thiết kế component rõ contract, dễ đổi và ít lỗi performance.

---

## 1. Component có contract

Một component tốt có contract rõ:

```text
Input:
Component cần dữ liệu gì để render?

Output:
Component phát sự kiện gì ra ngoài?

Responsibility:
Component chịu trách nhiệm đến đâu?
```

Ví dụ:

```ts
@Component({
  selector: 'app-user-picker',
  templateUrl: './user-picker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserPickerComponent {
  @Input() users: UserOption[] = [];
  @Input() selectedUserId: string | null = null;
  @Input() disabled = false;

  @Output() selectedUserIdChange = new EventEmitter<string | null>();
}
```

Đọc class là biết component cần gì và phát gì.

---

## 2. Input không nên bị mutate

Không tốt:

```ts
@Input() users: UserOption[] = [];

select(user: UserOption): void {
  user.selected = true;
}
```

Component con đang mutate data của cha. Với OnPush, điều này còn dễ gây UI không cập nhật đúng.

Tốt hơn:

```ts
@Output() selectedUserIdChange = new EventEmitter<string>();

select(user: UserOption): void {
  this.selectedUserIdChange.emit(user.id);
}
```

Cha quyết định state mới:

```ts
selectedUserId = id;
```

Rule:

```text
Input đi xuống.
Event đi lên.
State mới được tạo ở owner.
```

---

## 3. Output nên là event nghiệp vụ, không phải event DOM lộ ra

Không rõ:

```ts
@Output() clicked = new EventEmitter<MouseEvent>();
```

Rõ hơn:

```ts
@Output() approve = new EventEmitter<string>();
@Output() cancel = new EventEmitter<string>();
@Output() pageChange = new EventEmitter<number>();
```

Output nên nói "đã xảy ra việc gì" theo ngôn ngữ feature.

---

## 4. Presentational component không tự gọi API

Không tốt:

```ts
export class OrderStatusTagComponent {
  @Input() orderId!: string;

  constructor(private api: OrderApiService) {}

  ngOnInit(): void {
    this.api.getStatus(this.orderId).subscribe(status => {
      this.status = status;
    });
  }
}
```

Component nhỏ nhưng tự gọi API. Nếu table có 100 row, có thể tạo 100 request.

Tốt hơn:

```ts
@Input() status!: OrderStatus;
```

Data được load ở page/facade, component chỉ render.

---

## 5. Smart component nên ít

Smart component biết facade/service/router/store. Presentational component chỉ render.

```text
Page component: smart
Feature shell: smart nếu cần
Table/filter/form field: presentational
```

Không cần cực đoan. Nhưng nếu mọi component đều inject service domain, data flow sẽ rất khó lần.

---

## 6. Template tránh logic nặng

Không tốt:

```html
<td>{{ calculateDebtWarning(patient) }}</td>
<td [class.danger]="isDanger(patient, config, currentUser)"></td>
```

Tốt hơn:

```html
<td>{{ patient.debtWarningText }}</td>
<td [class.danger]="patient.isDanger"></td>
```

Tính trong mapper/view model:

```ts
function toPatientRowVm(patient: PatientDto): PatientRowVm {
  return {
    id: patient.id,
    name: patient.name,
    debtWarningText: getDebtWarningText(patient),
    isDanger: isDangerPatient(patient)
  };
}
```

Template nên đọc dữ liệu, không xử lý nghiệp vụ.

---

## 7. Stable reference cho input object/array

Không tốt:

```html
<app-table
  [columns]="[
    { key: 'code', title: 'Mã' },
    { key: 'name', title: 'Tên' }
  ]">
</app-table>
```

Mỗi change detection tạo array/object mới.

Tốt hơn:

```ts
readonly columns: TableColumn[] = [
  { key: 'code', title: 'Mã' },
  { key: 'name', title: 'Tên' }
];
```

```html
<app-table [columns]="columns"></app-table>
```

Đặc biệt quan trọng với OnPush component.

---

## 8. trackBy cho list

```html
<app-order-row
  *ngFor="let order of orders; trackBy: trackByOrderId"
  [order]="order">
</app-order-row>
```

```ts
trackByOrderId = (_: number, order: OrderRowVm) => order.id;
```

Không có trackBy, Angular dễ destroy/recreate DOM/component nhiều hơn khi list đổi.

---

## 9. Local UI state trong component là bình thường

Không phải state nào cũng cần facade/store.

```ts
isColumnConfigOpen = false;
hoveredRowId: string | null = null;
expandedPanelId: string | null = null;
```

Để local nếu:

```text
- chỉ component dùng
- không cần share
- không cần refresh giữ lại
- không cần deep link
```

Đưa mọi thứ vào global state là over-engineering.

---

## 10. Component form custom nên dùng CVA khi nó là form control

Nếu component được dùng như một field:

```html
<app-money-input formControlName="amount"></app-money-input>
```

Nó nên implement `ControlValueAccessor`.

Sai hay gặp:

```text
- @Input value + @Output valueChange rồi bên ngoài tự nối với form
- writeValue gọi ngược onChange
- quên setDisabledState
- quên onTouched
```

CVA giúp component trở thành form control thật sự.

---

## 11. Checklist component

```text
[ ] Component này smart hay presentational?
[ ] Input/output có rõ contract không?
[ ] Có mutate input không?
[ ] Có tự gọi API không?
[ ] Template có function nặng không?
[ ] Có object/array inline truyền xuống con không?
[ ] List có trackBy không?
[ ] Local state có thật sự local không?
[ ] Nếu là form field, có cần CVA không?
```
