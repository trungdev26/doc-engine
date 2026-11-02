# Abstract Base Component Pattern trong Angular

Tài liệu này giải thích pattern đang được dùng trong `features/change-detection/components/`: ba component `cd-default`, `cd-onpush`, `cd-onpush-pipe` cùng hiển thị một dòng trong bảng chỉ số, nhưng mỗi component minh hoạ một chiến lược Change Detection khác nhau. Thay vì copy-paste markup và logic 3 lần, code dùng **một abstract base class (`@Directive()`) + một template chia sẻ qua `templateUrl`**.

Đây là pattern hay gặp trong codebase lớn (Angular Material/CDK dùng rất nhiều) — hiểu nó giúp đọc code thư viện dễ hơn và biết khi nào nên/không nên áp dụng.

---

## 1. Bài toán: nhiều biến thể, dùng chung phần lớn logic

Ba component:

- `IndicatorRowDefaultComponent` — Change Detection mặc định (Default)
- `IndicatorRowOnpushComponent` — `ChangeDetectionStrategy.OnPush`
- `IndicatorRowOnpushPipeComponent` — OnPush + tính risk score qua pure pipe

Cả ba đều cần:

- `@Input() data` — dữ liệu một chỉ số
- `renderCount` — đếm số lần render (phục vụ demo)
- `checkRender()` — gọi trong template để tăng counter
- `riskColor()` — map risk score sang màu tag

Nếu viết riêng từng component, 3 file sẽ gần như giống nhau 90%. Khi sửa một chỗ (ví dụ đổi cách tính `renderCount`), phải sửa cả 3 nơi → dễ lệch nhau.

---

## 2. Giải pháp: abstract base class với `@Directive()`

```ts
// indicator-row.base.ts
import { Directive, Input } from '@angular/core';
import { ChiSoMau } from '@features/change-detection/models/chi-so.model';
import { RenderCounterService } from '@base/services/render-counter.service';
import { riskColor } from '@features/change-detection/models/risk-score';

@Directive()
export class IndicatorRowBase {
  @Input() data!: ChiSoMau;
  renderCount = 0;

  constructor(protected readonly counter: RenderCounterService) {}

  checkRender(): string {
    this.renderCount++;
    this.counter.increment();
    return '';
  }

  riskColor(score: number): string {
    return riskColor(score);
  }
}
```

Các component cụ thể `extends` class này và chỉ khai báo phần khác biệt:

```ts
// indicator-row-default.component.ts — Default CD
@Component({
  selector: 'tr[app-indicator-row-default]',
  templateUrl: '../base/indicator-row.template.html',
})
export class IndicatorRowDefaultComponent extends IndicatorRowBase {
  riskScore = 0;

  override checkRender(): string {
    super.checkRender();
    this.riskScore = computeRiskScore(this.data);
    return '';
  }
}
```

```ts
// indicator-row-onpush.component.ts — chỉ khác changeDetection
@Component({
  selector: 'tr[app-indicator-row-onpush]',
  templateUrl: '../base/indicator-row.template.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorRowOnpushComponent extends IndicatorRowBase {
  riskScore = 0;

  override checkRender(): string {
    super.checkRender();
    this.riskScore = computeRiskScore(this.data);
    return '';
  }
}
```

```ts
// indicator-row-onpush-pipe.component.ts — tự template riêng, dùng pipe thay vì method
@Component({
  selector: 'tr[app-indicator-row-onpush-pipe]',
  templateUrl: './indicator-row-onpush-pipe.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndicatorRowOnpushPipeComponent extends IndicatorRowBase {}
```

Mỗi class con chỉ khai báo **đúng phần làm nó khác biệt** (selector, `changeDetection`, override method, template riêng). Phần chung (`data`, `renderCount`, `checkRender`, `riskColor`) nằm một nơi duy nhất.

---

## 3. Vì sao base class phải có `@Directive()`, không phải plain class?

Nếu viết `IndicatorRowBase` là một class TypeScript thuần (không decorator):

```ts
export class IndicatorRowBase {
  @Input() data!: ChiSoMau;
  constructor(protected readonly counter: RenderCounterService) {}
}
```

→ `@Input()` sẽ **không có tác dụng**, và Angular DI cũng không biết cách inject `RenderCounterService` vào constructor của class cha khi class con được Angular tạo ra.

Lý do: Angular compiler (Ivy) chỉ xử lý decorator metadata (`@Input`, `@Output`, lifecycle hooks, DI tokens...) trên các class có decorator Angular (`@Component`, `@Directive`, `@Injectable`...). `@Directive()` không có `selector` là cách Angular gọi **"abstract base class"** — nó báo cho compiler: *"class này có metadata Angular, nhưng không tự đứng thành một directive/component độc lập, chỉ để các class khác extend"*.

```text
Plain class           → @Input/@Output/DI bị bỏ qua, lỗi runtime khó hiểu
@Injectable()         → chỉ dùng cho service, không hiểu @Input/@Output
@Directive() (no selector) → đúng cách: giữ metadata, không tạo directive riêng
```

Quy tắc: **bất kỳ class nào dùng `@Input`, `@Output`, `@HostBinding`, `@ViewChild`... và được class `@Component` khác extend, đều phải có `@Directive()`** (hoặc `@Component()` nếu chính nó cũng là component dùng được).

---

## 4. Chia sẻ template qua `templateUrl`

```ts
templateUrl: '../base/indicator-row.template.html',
```

Hai component (`cd-default`, `cd-onpush`) cùng point tới **một file `.html`**. Đây không phải "shared component" — mỗi component vẫn được Angular compile thành một class riêng, với selector và `changeDetection` riêng. Chỉ có *nội dung template* (markup) được tái sử dụng ở mức **source file**.

```text
indicator-row.base.ts            → logic chung (state, methods)
indicator-row.template.html      → markup chung
indicator-row-default.component.ts   → extends base, dùng template chung
indicator-row-onpush.component.ts    → extends base, dùng template chung
indicator-row-onpush-pipe.component.ts → extends base, có template RIÊNG
```

Component thứ 3 có template riêng vì nó cần dùng pipe (`| riskScore`) thay vì gọi method `riskColor()` trực tiếp trong template — đây là sự khác biệt **cố ý** để minh hoạ ảnh hưởng của pure pipe lên Change Detection.

---

## 5. Override method — kế thừa có chọn lọc

```ts
override checkRender(): string {
  super.checkRender();           // giữ logic gốc (tăng renderCount, counter)
  this.riskScore = computeRiskScore(this.data);  // thêm hành vi riêng
  return '';
}
```

- `override` (TS 4.3+) bắt buộc khai báo rõ ràng khi ghi đè method của lớp cha — compiler sẽ báo lỗi nếu lớp cha đổi tên method mà quên cập nhật lớp con.
- `super.checkRender()` gọi lại implementation gốc, tránh duplicate logic tăng `renderCount`.

`IndicatorRowOnpushPipeComponent` **không override** `checkRender` — vì ở biến thể này, risk score được tính trong pipe (pure pipe tự cache kết quả), không cần tính lại trong `checkRender`. Đây chính là điểm khác biệt mà demo muốn thể hiện.

---

## 6. Khi nào nên dùng pattern này

Dùng abstract base + shared template khi:

- Có **nhiều biến thể của cùng một khái niệm UI** (cùng dữ liệu, cùng layout, khác nhau ở chiến lược/behaviour)
- Phần chung chiếm phần lớn, phần khác biệt nhỏ và rõ ràng (1-2 method, 1 config)
- Các biến thể **không cần tồn tại độc lập** — luôn đi cùng nhóm để so sánh/demo

Ví dụ thực tế ngoài demo này:

- Angular Material: `MatButton` / `MatAnchor` / `MatIconButton` đều extend một base class chứa logic ripple, disabled state, color theming chung.
- CDK: `_MatMenuTriggerBase`, `_MatTabBase`... pattern tương tự — base class chứa logic dùng chung giữa các theme/biến thể (Material vs custom).

---

## 7. Khi nào KHÔNG nên dùng — rủi ro của inheritance

```text
Rủi ro 1: Inheritance tạo coupling chặt
  → Sửa base class ảnh hưởng MỌI class con, có thể gây regression ở nơi
    không liên quan trực tiếp tới thay đổi.

Rủi ro 2: Khó test class con độc lập
  → Test phải setup luôn dependency của base (constructor, DI token).

Rủi ro 3: Lạm dụng để gộp các tính năng KHÔNG liên quan
  → Nếu hai component chỉ "tình cờ" giống nhau vài dòng nhưng bản chất
    khác use-case, ép vào base chung sẽ tạo abstraction sai, sau này
    phải tách ra lại (tốn công hơn không tách).
```

Nguyên tắc phân biệt:

```text
"Đây là CÙNG MỘT khái niệm, chỉ khác chiến lược/cấu hình"
  → Abstract base hợp lý (đúng như indicator-row ở trên)

"Đây là HAI tính năng khác nhau, chỉ trông giống nhau lúc này"
  → Không nên dùng base chung. Ưu tiên composition:
     tách phần dùng chung thành service/pipe/directive độc lập,
     mỗi component tự inject/dùng, không qua kế thừa.
```

---

## 8. Checklist khi review code dùng pattern này

1. Base class có decorator `@Directive()` (hoặc `@Component()`) không? Nếu dùng `@Input`/`@Output`/DI mà thiếu decorator → bug âm thầm.
2. Các class con có `override` đầy đủ khi ghi đè method/property không?
3. Phần chung trong base có thực sự *chung về bản chất*, hay chỉ trùng ngẫu nhiên?
4. Template chia sẻ qua `templateUrl` có còn đúng cho mọi class con không, hay đã có class con cần tách riêng (như `cd-onpush-pipe` ở trên)?
5. Nếu sửa base class — đã rà soát ảnh hưởng tới tất cả class con chưa?

---

## 9. Tư duy chốt

Abstract base component không phải "best practice nên dùng mọi nơi" — nó là công cụ cho **một bài toán cụ thể**: nhiều biến thể của cùng một khái niệm, chia sẻ phần lớn logic/markup, khác nhau ở vài điểm rõ ràng. Khi review hoặc thiết kế, luôn hỏi: *"Các class này có đang đại diện cho CÙNG MỘT thứ không, hay tôi đang gộp nhầm hai thứ khác nhau vào một base vì chúng tạm thời giống nhau?"*
