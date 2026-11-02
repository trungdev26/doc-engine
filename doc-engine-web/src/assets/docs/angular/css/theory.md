# Angular CSS trong ứng dụng thực tế

## 1. CSS trong Angular nên được hiểu như một phần của component API

Trong Angular, CSS không nên được xem là phần “trang trí” nằm ngoài logic component. CSS là một phần trong thiết kế component, cùng với template và TypeScript.

Một component thường có ba phần:

```text
component.ts
-> state, input, output, lifecycle, computed value

component.html
-> DOM structure, binding, directive, projection

component.scss
-> layout, visual state, responsive rule, style boundary
```

Một component tốt cần trả lời được các câu hỏi:

```text
Component này nhận state từ đâu?
State đó được expose ra DOM bằng class, attribute, input hay style binding?
Style này thuộc chính component, thuộc page cha, hay thuộc thư viện UI bên trong component?
Có đang để parent biết quá nhiều về DOM nội bộ của child không?
Có đang dùng global CSS hoặc ::ng-deep làm mất boundary của component không?
```

Luồng trách nhiệm nên rõ như sau:

```text
TypeScript quyết định state.
Template biểu diễn state ra DOM.
SCSS quyết định state đó nhìn như thế nào.
```

Ví dụ:

```ts
@Component({
  selector: 'app-patient-card',
  templateUrl: './patient-card.component.html',
  styleUrls: ['./patient-card.component.scss']
})
export class PatientCardComponent {
  @Input() patient!: Patient;
  @Input() selected = false;
}
```

```html
<article class="patient-card" [class.patient-card--selected]="selected">
  <div class="patient-card__main">
    <h3 class="patient-card__name">{{ patient.name }}</h3>
    <p class="patient-card__code">{{ patient.code }}</p>
  </div>
</article>
```

```scss
:host {
  display: block;
}

.patient-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-default);
}

.patient-card--selected {
  border-color: var(--color-primary);
  background: var(--surface-selected);
}

.patient-card__main {
  min-width: 0;
}

.patient-card__name {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Trong ví dụ trên:

```text
selected
-> state của component

[class.patient-card--selected]
-> cách template biểu diễn state ra DOM

.patient-card--selected
-> visual rule tương ứng với state selected
```

Không nên đưa màu, spacing, border, font size của design system trực tiếp vào template nếu các giá trị đó có thể quản lý bằng class hoặc CSS variables.

---

## 2. Các nơi khai báo style trong Angular

Angular có nhiều nơi để khai báo style. Mỗi nơi nên có phạm vi sử dụng rõ ràng.

---

### 2.1. Global styles

Thường nằm ở:

```text
src/styles.scss
```

Dùng cho:

```text
- reset CSS
- font global
- CSS variables/token
- layout root của app
- utility class dùng toàn app
- override thư viện ở phạm vi global có chủ đích
```

Ví dụ:

```scss
:root {
  --color-primary: #2563eb;
  --color-danger: #dc2626;
  --text-default: #111827;
  --text-muted: #6b7280;
  --surface-default: #ffffff;
  --surface-subtle: #f9fafb;
  --surface-selected: #eff6ff;
  --border-default: #e5e7eb;
}

html,
body {
  min-height: 100%;
}

body {
  margin: 0;
  color: var(--text-default);
  background: var(--surface-default);
}
```

Global styles ảnh hưởng toàn app nên cần được kiểm soát chặt. Không nên đưa selector quá chung như `.title`, `.content`, `.box` vào global nếu không có quy ước rõ.

---

### 2.2. Component stylesheet

Đây là nơi viết CSS chính cho component.

```ts
@Component({
  selector: 'app-order-row',
  templateUrl: './order-row.component.html',
  styleUrls: ['./order-row.component.scss']
})
export class OrderRowComponent {}
```

Nên đặt ở component stylesheet:

```text
- layout nội bộ component
- visual state của component
- responsive rule của component
- style cho host element bằng :host
- override thư viện bên trong component, nhưng phải có scope rõ
```

---

### 2.3. Inline style

Ví dụ:

```html
<div style="color: red; font-weight: 600">
  Dữ liệu không hợp lệ
</div>
```

Inline style nên hạn chế vì:

```text
- khó tái sử dụng
- khó theme
- khó review
- template bị lẫn visual detail
- khó thay đổi đồng bộ khi design system đổi
```

Chỉ nên dùng inline style cho case rất nhỏ, tạm thời, hoặc phục vụ debug.

---

### 2.4. Style binding

Style binding dùng khi giá trị style thật sự là dữ liệu động.

Ví dụ progress bar:

```html
<div class="progress__bar" [style.width.%]="percent"></div>
```

Ví dụ vị trí động:

```html
<div class="marker" [style.transform]="markerTransform"></div>
```

Dùng style binding cho giá trị đo lường hoặc tính toán động như `%`, `px`, `transform`, `grid-template-columns`. Không nên dùng style binding để rải màu hoặc spacing thuộc design system.

---

### 2.5. Class binding

Class binding thường là cách ưu tiên để biểu diễn UI state.

```html
<tr class="order-row" [class.order-row--selected]="selected"></tr>
```

Style tương ứng nằm trong SCSS:

```scss
.order-row--selected {
  background: var(--surface-selected);
}
```

Cách này giúp template chỉ thể hiện state, còn chi tiết visual nằm trong stylesheet.

---

## 3. View Encapsulation

`ViewEncapsulation` là cơ chế Angular dùng để kiểm soát phạm vi ảnh hưởng của style trong component.

Có ba mode chính:

| Mode | Ý nghĩa | Khi dùng |
|---|---|---|
| `Emulated` | Angular giả lập scope style bằng attribute | Mặc định, dùng cho đa số component |
| `None` | Style của component trở thành global | Chỉ dùng khi thật sự muốn global |
| `ShadowDom` | Dùng Shadow DOM thật của browser | Web component hoặc cần isolation mạnh |

---

### 3.1. `ViewEncapsulation.Emulated`

Đây là mode mặc định.

```ts
@Component({
  selector: 'app-order-row',
  templateUrl: './order-row.component.html',
  styleUrls: ['./order-row.component.scss'],
  encapsulation: ViewEncapsulation.Emulated
})
export class OrderRowComponent {}
```

Nếu SCSS có:

```scss
.status {
  color: var(--color-success);
}
```

Angular sẽ scope selector đó bằng attribute nội bộ, có thể hiểu tương tự:

```html
<span class="status" _ngcontent-abc>Hoàn thành</span>
```

```css
.status[_ngcontent-abc] {
  color: var(--color-success);
}
```

Ý nghĩa:

```text
Style trong component chủ yếu áp dụng cho template của component đó.
Style không tự tràn sang component khác có cùng class name.
```

Đây là mode nên dùng mặc định trong app Angular nghiệp vụ.

---

### 3.2. `ViewEncapsulation.None`

```ts
@Component({
  selector: 'app-markdown-theme',
  templateUrl: './markdown-theme.component.html',
  styleUrls: ['./markdown-theme.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class MarkdownThemeComponent {}
```

Khi dùng `None`, style trong component sẽ được đưa ra phạm vi global.

Ví dụ trong component có:

```scss
.title {
  color: red;
}
```

Thì mọi `.title` ở toàn app đều có thể bị ảnh hưởng.

Chỉ dùng `ViewEncapsulation.None` khi:

```text
- component chủ động cung cấp style global
- cần style nội dung HTML động hoặc markdown
- cần global override có chủ đích và đã đặt selector đủ cụ thể
```

Không nên dùng `ViewEncapsulation.None` chỉ vì muốn style của component cha ăn vào component con. Nếu cần truyền biến thể style giữa cha và con, ưu tiên `@Input`, class API hoặc CSS variables.

---

### 3.3. `ViewEncapsulation.ShadowDom`

```ts
@Component({
  selector: 'app-user-card',
  templateUrl: './user-card.component.html',
  styleUrls: ['./user-card.component.scss'],
  encapsulation: ViewEncapsulation.ShadowDom
})
export class UserCardComponent {}
```

`ShadowDom` dùng Shadow DOM thật của browser.

Ưu điểm:

```text
- cô lập CSS mạnh hơn
- CSS bên ngoài khó ảnh hưởng vào component
- CSS trong component khó ảnh hưởng ra ngoài
```

Nhược điểm:

```text
- khó override UI library
- theme global cần thiết kế kỹ hơn
- cần hiểu rõ Shadow DOM, slot, custom properties
```

Trong app Angular nghiệp vụ thông thường, `Emulated` vẫn là lựa chọn mặc định phù hợp hơn.

---
s
## 4. `:host`: Style cho host element của component

### 4.1. Host element là gì?

Mỗi Angular component có một selector.

```ts
@Component({
  selector: 'app-patient-table',
  templateUrl: './patient-table.component.html',
  styleUrls: ['./patient-table.component.scss']
})
export class PatientTableComponent {}
```

Khi component được dùng trong template cha:

```html
<section class="patient-page">
  <app-patient-table [patients]="patients"></app-patient-table>
</section>
```

thì element sau là **host element** của `PatientTableComponent`:

```html
<app-patient-table></app-patient-table>
```

`Host element` là element đại diện cho component trong DOM của component cha.

Trong stylesheet của `PatientTableComponent`, selector `:host` dùng để style chính host element đó.

```scss
:host {
  display: block;
}
```

Nói cách khác:

```text
:host
-> style vào <app-patient-table>

.patient-table
-> style vào element có class patient-table bên trong template của PatientTableComponent
```

---

### 4.2. Phân biệt host element và element bên trong template

Giả sử `PatientTableComponent` có template:

```html
<!-- patient-table.component.html -->
<div class="patient-table">
  <div class="patient-table__row">
    Nguyễn Văn A
  </div>
</div>
```

Khi render, DOM có thể hiểu như sau:

```html
<app-patient-table>
  <div class="patient-table">
    <div class="patient-table__row">
      Nguyễn Văn A
    </div>
  </div>
</app-patient-table>
```

Nếu viết:

```scss
.patient-table {
  border: 1px solid var(--border-default);
  border-radius: 6px;
  overflow: auto;
}
```

rule này style cho:

```html
<div class="patient-table"></div>
```

Nó không style trực tiếp cho:

```html
<app-patient-table></app-patient-table>
```

Nếu muốn style cho chính `<app-patient-table>`, dùng `:host`:

```scss
:host {
  display: block;
}
```

Khi đọc CSS của component, nên tách hai lớp trách nhiệm:

```text
:host
-> host element của component khi component xuất hiện trong parent

Class bên trong template
-> DOM nội bộ mà component tự render
```

---

### 4.3. Parent layout và host element

Parent quyết định vị trí của component trong layout tổng thể.

```html
<section class="order-page">
  <app-order-filter></app-order-filter>
  <app-order-table></app-order-table>
</section>
```

```scss
.order-page {
  display: grid;
  gap: 16px;
}
```

Child component quyết định host element của nó có đặc tính layout gì.

```scss
/* order-table.component.scss */
:host {
  display: block;
}
```

Child component cũng quyết định layout nội bộ của nó.

```scss
.order-table {
  overflow: auto;
  border: 1px solid var(--border-default);
}

.order-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
}
```

Phân chia trách nhiệm:

```text
Parent:
- component nào nằm trước/sau
- khoảng cách giữa các vùng lớn
- vùng nào chiếm phần còn lại của màn hình

Child với :host:
- host element của component là block, inline, flex, grid hay loại box khác
- host có cần width/height/min-width/min-height/overflow không

Child với class nội bộ:
- DOM bên trong component được layout như thế nào
```

---

### 4.4. `:host` với trạng thái hoặc variant của host

`:host` có thể nhận selector điều kiện.

Ví dụ parent truyền class vào component:

```html
<app-patient-table class="is-compact"></app-patient-table>
```

Trong `patient-table.component.scss`:

```scss
:host(.is-compact) {
  .patient-table__row {
    min-height: 32px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
}
```

Ý nghĩa:

```text
Nếu host element <app-patient-table> có class is-compact
thì áp dụng style compact cho row bên trong component.
```

Pattern này phù hợp khi biến thể chỉ là style/layout nhẹ.

Nếu biến thể là API chính thức của component, nên dùng `@Input` rõ nghĩa hơn.

```html
<app-patient-table density="compact"></app-patient-table>
```

```ts
@Input() density: 'default' | 'compact' = 'default';
```

```html
<div class="patient-table" [class.patient-table--compact]="density === 'compact'">
  ...
</div>
```

```scss
.patient-table--compact {
  .patient-table__row {
    min-height: 32px;
  }
}
```

So sánh:

```text
Class trên host
-> phù hợp với biến thể layout nhẹ, do parent áp vào nơi sử dụng

@Input
-> phù hợp với biến thể là API chính thức, có ý nghĩa nghiệp vụ/UI rõ và dùng lại nhiều nơi
```

---

### 4.5. Component tự thêm class lên host bằng `@HostBinding`

Nếu trạng thái thuộc về chính component, component có thể tự bind class lên host.

Ví dụ `SidePanelComponent` có trạng thái `collapsed`:

```ts
@Component({
  selector: 'app-side-panel',
  templateUrl: './side-panel.component.html',
  styleUrls: ['./side-panel.component.scss']
})
export class SidePanelComponent {
  @Input() collapsed = false;

  @HostBinding('class.is-collapsed')
  get isCollapsed(): boolean {
    return this.collapsed;
  }
}
```

SCSS:

```scss
:host {
  display: block;
  width: 280px;
  transition: width 160ms ease;
}

:host(.is-collapsed) {
  width: 64px;
}
```

Khi `collapsed = true`, DOM host có thể hiểu như sau:

```html
<app-side-panel class="is-collapsed"></app-side-panel>
```

Luồng trách nhiệm:

```text
collapsed
-> state của component

@HostBinding('class.is-collapsed')
-> đưa state thành class trên host

:host(.is-collapsed)
-> style host theo state đó
```

---

### 4.6. Ví dụ hoàn chỉnh

Page dùng table:

```html
<section class="patient-page">
  <app-patient-table
    class="patient-page__table is-compact"
    [patients]="patients">
  </app-patient-table>
</section>
```

Page SCSS:

```scss
.patient-page {
  display: grid;
  gap: 16px;
  min-height: 100%;
}

.patient-page__table {
  min-height: 0;
}
```

`PatientTableComponent` template:

```html
<div class="patient-table">
  <div class="patient-table__row" *ngFor="let patient of patients">
    <span class="patient-table__name">{{ patient.name }}</span>
    <span class="patient-table__code">{{ patient.code }}</span>
  </div>
</div>
```

`PatientTableComponent` SCSS:

```scss
:host {
  display: block;
  min-width: 0;
}

:host(.is-compact) {
  .patient-table__row {
    min-height: 32px;
    padding-top: 4px;
    padding-bottom: 4px;
  }
}

.patient-table {
  overflow: auto;
  border: 1px solid var(--border-default);
  border-radius: 6px;
}

.patient-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 12px;
  min-height: 40px;
  padding: 8px 12px;
}

.patient-table__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Đọc theo lớp trách nhiệm:

```text
.patient-page
-> layout của màn hình

.patient-page__table
-> class mà page áp vào host để table tham gia layout page

:host
-> style chính host element <app-patient-table>

:host(.is-compact)
-> style khi host có variant compact

.patient-table / .patient-table__row
-> layout nội bộ của table component
```

---

### 4.7. Checklist khi dùng `:host`

```text
[ ] Style này đang muốn áp vào host element hay element bên trong template?
[ ] Host element của component nên là block, inline, inline-flex, flex hay grid?
[ ] Component này là khối UI lớn hay inline UI nhỏ?
[ ] Variant trên host chỉ là layout nhẹ hay nên thành @Input?
[ ] State thuộc component có nên bind lên host bằng @HostBinding không?
[ ] Parent có đang override sâu vào DOM nội bộ của child thay vì dùng host/class/input API không?
```

Tóm tắt:

```text
:host
-> selector cho host element của component hiện tại

:host(.is-active)
-> selector cho host element khi host có class is-active

@HostBinding('class.xxx')
-> component tự gắn class lên host theo state

Parent
-> quyết định component nằm ở đâu trong layout

Child với :host
-> quyết định host element của component tham gia layout như thế nào

Child với class nội bộ
-> quyết định DOM bên trong component hiển thị như thế nào
```

---

## 5. `:host-context`: style theo ngữ cảnh bên ngoài

`:host-context(...)` dùng khi component cần áp style dựa trên một selector ở ancestor bên ngoài component.

Ví dụ:

```html
<body class="theme-dark">
  <app-patient-card></app-patient-card>
</body>
```

Trong `patient-card.component.scss`:

```scss
:host {
  display: block;
  background: var(--surface-default);
  color: var(--text-default);
}

:host-context(.theme-dark) {
  border-color: var(--border-default);
}
```

Ý nghĩa:

```text
Nếu host element của component nằm trong một ancestor match .theme-dark,
thì rule :host-context(.theme-dark) được áp dụng.
```

Ví dụ cụ thể:

```html
<div class="theme-dark">
  <app-product-card></app-product-card>
</div>
```

```scss
:host {
  display: block;
  background: #fff;
  color: #222;
}

:host-context(.theme-dark) {
  background: #141414;
  color: #f5f5f5;
}

:host-context(.theme-dark) .price {
  color: #73d13d;
}
```

Dùng cho:

```text
- component cần đổi style theo theme/context bên ngoài
- layout khác nhau khi component nằm trong vùng cụ thể
- dark mode cục bộ theo một container
```

Tuy nhiên, nếu theme áp dụng toàn app, cách ổn định hơn thường là dùng CSS variables ở `:root` hoặc `body.theme-dark`.

```scss
:root {
  --surface-default: #ffffff;
  --text-default: #111827;
}

body.theme-dark {
  --surface-default: #111827;
  --text-default: #f9fafb;
}

.panel {
  background: var(--surface-default);
  color: var(--text-default);
}
```

Khi dùng CSS variables, component không cần biết app đang ở theme nào. Component chỉ dùng token.

---

## 6. `::ng-deep`: Override xuyên qua component boundary

`::ng-deep` là selector dùng trong Angular component stylesheet để làm cho rule đi xuyên qua boundary của style encapsulation.

Nói đơn giản: CSS bình thường trong component bị Angular scope lại. `::ng-deep` làm cho phần selector phía sau nó có thể tác động sâu xuống DOM bên trong component con hoặc UI library.

Hay gặp nhất khi override ng-zorro / Ant Design Angular.

---

### 6.1. Vì sao đôi khi CSS thường không ăn vào ng-zorro?

Ví dụ component dùng `nz-table`:

```html
<div class="patient-table">
  <nz-table nzSize="small" [nzData]="patients">
    ...
  </nz-table>
</div>
```

`nz-table` render ra DOM thật có các class của Ant Design như:

```text
.ant-table
.ant-table-cell
.ant-table-thead
```

Nếu trong `patient-table.component.scss` viết:

```scss
.ant-table-cell {
  padding: 6px 8px;
}
```

Rule này có thể không áp dụng như mong muốn vì `.ant-table-cell` là DOM nằm bên trong component của thư viện, không phải DOM trực tiếp thuộc template của component hiện tại.

Khi bắt buộc phải override DOM do thư viện render ra, có thể dùng:

```scss
:host ::ng-deep .patient-table .ant-table-cell {
  padding: 6px 8px;
}
```

Đọc selector từ trái sang phải:

```text
:host
-> bắt đầu từ host element của component hiện tại

::ng-deep
-> cho phép selector đi xuyên qua boundary component style

.patient-table .ant-table-cell
-> chỉ áp dụng cho .ant-table-cell nằm trong wrapper .patient-table
```

---

### 6.2. `::ng-deep` làm mất boundary như thế nào?

Với `ViewEncapsulation.Emulated`, Angular thường scope selector bằng attribute nội bộ.

Ví dụ component SCSS:

```scss
.title {
  color: red;
}
```

Có thể hiểu sau compile tương tự:

```css
.title[_ngcontent-abc] {
  color: red;
}
```

Nhờ vậy, `.title` chỉ ăn trong component hiện tại.

Nhưng khi viết:

```scss
::ng-deep .ant-picker {
  background: transparent;
}
```

ý nghĩa là yêu cầu Angular cho selector đi xuyên qua scope boundary. Vì selector không có phần scope cụ thể phía trước, rule này rất dễ hoạt động giống global override đối với `.ant-picker`.

Đây là lý do `::ng-deep` phải luôn được dùng có ngữ cảnh rõ.

---

### 6.3. Lỗi thường gặp: `::ng-deep` không có scope gây leak global

Cần tránh:

```scss
::ng-deep .ant-select-selector,
::ng-deep .ant-input-number,
::ng-deep .ant-picker {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}
```

Vấn đề của selector này:

```text
- bắt đầu ngay bằng ::ng-deep
- không có :host phía trước
- không có wrapper cụ thể như .field .ctrl
- selector đích là class rất phổ biến của Ant Design
- có !important nên càng khó bị rule khác override lại
```

Hậu quả có thể xảy ra:

```text
Component A được render.
Style của Component A được inject vào <head>.
Rule ::ng-deep .ant-picker tồn tại trong page/session.
Component B ở màn khác render nz-date-picker.
.ant-picker trong Component B cũng bị ăn background: transparent, border: none, box-shadow: none.
```

Case này thường xuất hiện khi component chứa style bị force render, nằm trong tab, modal, drawer, route cache, hoặc được render sẵn theo điều kiện nghiệp vụ. Người debug dễ nhầm vì lỗi xuất hiện ở component B, nhưng nguyên nhân lại nằm ở style của component A.

---

### 6.4. Pattern đúng: luôn scope override

Thay vì viết global deep selector:

```scss
::ng-deep .ant-picker {
  background: transparent;
}
```

hãy scope bằng host và wrapper cụ thể:

```scss
:host ::ng-deep .patient-filter .ant-picker {
  background: transparent;
}
```

Hoặc nếu trong template có vùng field cụ thể:

```html
<div class="field">
  <div class="ctrl">
    <nz-date-picker></nz-date-picker>
  </div>
</div>
```

SCSS:

```scss
:host ::ng-deep .field .ctrl .ant-picker {
  background: transparent;
}
```

Cũng có thể viết wrapper đứng trước `::ng-deep`:

```scss
.field .ctrl ::ng-deep .ant-picker {
  background: transparent;
}
```

Cách đọc:

```text
.field .ctrl
-> chỉ bắt đầu từ vùng field/control trong component hiện tại

::ng-deep
-> xuyên xuống DOM do component con hoặc thư viện render

.ant-picker
-> element cần override
```

Nếu component lớn hoặc class `.field .ctrl` quá chung, thêm wrapper riêng của component:

```html
<div class="vip12-reception-details">
  ...
</div>
```

```scss
.vip12-reception-details .field .ctrl ::ng-deep .ant-select-selector,
.vip12-reception-details .field .ctrl ::ng-deep .ant-input-number,
.vip12-reception-details .field .ctrl ::ng-deep .ant-picker {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;
}
```

---

### 6.5. So sánh selector sai và selector đúng

Không nên:

```scss
::ng-deep .ant-picker {
  background: transparent;
}
```

Vì selector này không nói rõ `.ant-picker` thuộc component nào, vùng nào, chức năng nào.

Tốt hơn:

```scss
:host ::ng-deep .patient-filter .ant-picker {
  background: transparent;
}
```

Tốt hơn nữa nếu cần giới hạn theo vùng cụ thể:

```scss
:host ::ng-deep .patient-filter .date-range-control .ant-picker {
  background: transparent;
}
```

Với case form field:

```scss
.field .ctrl ::ng-deep .ant-picker {
  background: transparent;
}
```

Hoặc có wrapper component riêng:

```scss
.vip12-reception-details .field .ctrl ::ng-deep .ant-picker {
  background: transparent;
}
```

Nguyên tắc:

```text
Selector càng động vào class phổ biến của UI library,
càng phải có scope cụ thể ở phía trước.
```

---

### 6.6. Khi nào không nên dùng `::ng-deep`?

Không nên dùng `::ng-deep` để sửa component nội bộ nếu có thể thiết kế API rõ hơn.

Không nên:

```scss
:host ::ng-deep app-status-badge .label {
  font-size: 12px;
}
```

Nên thiết kế API cho `StatusBadgeComponent`:

```html
<app-status-badge size="small"></app-status-badge>
```

```ts
@Input() size: 'small' | 'default' = 'default';
```

```html
<span class="badge" [class.badge--small]="size === 'small'">
  {{ label }}
</span>
```

```scss
.badge--small {
  font-size: 12px;
}
```

`::ng-deep` phù hợp hơn khi đối tượng bị override là DOM của thư viện UI mà mình không kiểm soát được.

---

### 6.7. Nguyên tắc dùng `::ng-deep`

```text
[ ] Kiểm tra API/theme token của thư viện trước khi override CSS.
[ ] Nếu phải dùng ::ng-deep, luôn scope bằng :host hoặc wrapper cụ thể.
[ ] Không viết ::ng-deep đứng đầu selector rồi trỏ thẳng vào class phổ biến như .ant-picker.
[ ] Không dùng ::ng-deep để che việc component con thiếu API.
[ ] Hạn chế !important.
[ ] Khi upgrade ng-zorro/Ant Design Angular, review lại các selector override.
[ ] Nếu override được dùng toàn app có chủ đích, cân nhắc đưa vào styles.scss với selector/global convention rõ ràng.
```

---

## 7. Class binding và `ngClass`

Class binding là cách phổ biến để biểu diễn trạng thái UI trong Angular.

Ví dụ:

```html
<tr
  class="order-row"
  [class.order-row--selected]="order.id === selectedOrderId"
  [class.order-row--disabled]="order.locked">
  <td>{{ order.code }}</td>
  <td>{{ order.customerName }}</td>
</tr>
```

```scss
.order-row--selected {
  background: var(--surface-selected);
}

.order-row--disabled {
  color: var(--text-disabled);
  pointer-events: none;
}
```

Dùng `ngClass` khi có nhiều trạng thái:

```html
<span
  class="status-badge"
  [ngClass]="{
    'status-badge--success': status === 'completed',
    'status-badge--warning': status === 'pending',
    'status-badge--danger': status === 'failed'
  }">
  {{ statusLabel }}
</span>
```

```scss
.status-badge--success {
  color: var(--color-success);
}

.status-badge--warning {
  color: var(--color-warning);
}

.status-badge--danger {
  color: var(--color-danger);
}
```

Nếu mapping phức tạp, đưa về component:

```ts
readonly statusClassMap: Record<OrderStatus, string> = {
  completed: 'status-badge--success',
  pending: 'status-badge--warning',
  failed: 'status-badge--danger'
};

get statusClass(): string {
  return this.statusClassMap[this.status];
}
```

```html
<span class="status-badge" [ngClass]="statusClass">
  {{ statusLabel }}
</span>
```

Tránh gọi function tạo class object trong list lớn:

```html
<tr [ngClass]="getRowClass(row)"></tr>
```

Nếu function tạo object mới, Angular có thể phải xử lý nhiều hơn trong mỗi lần change detection. Với list lớn, nên chuẩn bị sẵn class trong view model:

```ts
rowsVm$ = this.rows$.pipe(
  map(rows =>
    rows.map(row => ({
      ...row,
      rowClass: row.locked ? 'order-row--disabled' : ''
    }))
  )
);
```

Nguyên tắc:

```text
State UI có tên rõ -> class binding.
Nhiều trạng thái -> ngClass hoặc class map.
List lớn -> tránh function tạo object mới trong template.
```

---

## 8. Style binding và `ngStyle`

Style binding phù hợp khi giá trị style là dữ liệu động thật sự.

Ví dụ progress:

```html
<div class="progress">
  <div class="progress__bar" [style.width.%]="percent"></div>
</div>
```

```scss
.progress {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-subtle);
}

.progress__bar {
  height: 100%;
  background: var(--color-primary);
}
```

Ví dụ grid columns động:

```html
<div class="summary-grid" [style.grid-template-columns]="gridTemplate">
  <app-summary-card *ngFor="let item of items" [item]="item"></app-summary-card>
</div>
```

```ts
get gridTemplate(): string {
  return `repeat(${this.columnCount}, minmax(0, 1fr))`;
}
```

Không nên dùng style binding cho màu thuộc design system:

```html
<!-- Không nên -->
<span [style.color]="hasError ? '#ff0000' : '#222222'"></span>
```

Nên dùng class:

```html
<span class="message" [class.message--error]="hasError"></span>
```

```scss
.message {
  color: var(--text-default);
}

.message--error {
  color: var(--color-danger);
}
```

Nguyên tắc:

```text
State UI -> class binding.
Giá trị đo lường/dynamic thật sự -> style binding.
Màu/spacing/font thuộc design system -> SCSS/token.
```

---

## 9. Input-driven style và component API

Khi component có nhiều kiểu hiển thị, nên biểu diễn variant bằng API rõ ràng thay vì để parent override sâu vào DOM nội bộ.

Ví dụ button:

```ts
type ButtonTone = 'primary' | 'danger' | 'neutral';

@Component({
  selector: 'app-action-button',
  templateUrl: './action-button.component.html',
  styleUrls: ['./action-button.component.scss']
})
export class ActionButtonComponent {
  @Input() tone: ButtonTone = 'neutral';

  get toneClass(): string {
    return `action-button--${this.tone}`;
  }
}
```

```html
<button class="action-button" [ngClass]="toneClass" type="button">
  <ng-content></ng-content>
</button>
```

```scss
.action-button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 4px;
}

.action-button--primary {
  background: var(--color-primary);
  color: white;
}

.action-button--danger {
  background: var(--color-danger);
  color: white;
}

.action-button--neutral {
  background: var(--surface-default);
  border-color: var(--border-default);
}
```

Sử dụng:

```html
<app-action-button tone="primary">Lưu</app-action-button>
<app-action-button tone="danger">Xóa</app-action-button>
```

Lợi ích:

```text
- Parent không cần biết DOM bên trong button.
- Variant được quản lý trong component.
- Khi đổi design system, sửa tập trung một nơi.
```

Cần tránh:

```scss
/* page cha override sâu vào nội bộ component con */
:host ::ng-deep app-action-button button {
  background: red;
}
```

Nếu nhu cầu là một biến thể hợp lệ, hãy thiết kế API:

```html
<app-action-button tone="danger"></app-action-button>
```

---

## 10. Page layout và component layout

Một lỗi phổ biến là component con tự đặt `margin-bottom` để tạo khoảng cách với component khác.

Không nên:

```scss
/* app-order-filter.component.scss */
:host {
  display: block;
  margin-bottom: 16px;
}
```

Vì component con không nên giả định bên ngoài nó có gì.

Nên để page quyết định khoảng cách giữa các vùng lớn:

```html
<section class="order-list-page">
  <header class="order-list-page__header">
    <h1>Đơn hàng</h1>
    <button nz-button nzType="primary">Tạo mới</button>
  </header>

  <app-order-filter></app-order-filter>

  <app-order-table class="order-list-page__table"></app-order-table>
</section>
```

```scss
:host {
  display: block;
  min-height: 100%;
}

.order-list-page {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 16px;
  min-height: 100%;
}

.order-list-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.order-list-page__table {
  min-height: 0;
}
```

Phân chia trách nhiệm:

```text
Page:
- quyết định các block lớn nằm ở đâu
- khoảng cách giữa filter/table/header
- layout tổng thể của màn hình

Component con:
- định nghĩa host element bằng :host
- xử lý layout nội bộ của nó
- không tự áp margin ngoài để điều khiển page
```

---

## 11. Reactive Forms và CSS state

Angular tự thêm các class trạng thái cho control:

```text
ng-valid
ng-invalid
ng-touched
ng-dirty
ng-pristine
ng-pending
```

Ví dụ:

```html
<label class="field">
  <span class="field__label">Tên bệnh nhân</span>

  <input
    class="field__control"
    nz-input
    [formControl]="nameControl" />

  <span
    class="field__error"
    *ngIf="nameControl.invalid && nameControl.touched">
    Vui lòng nhập tên bệnh nhân
  </span>
</label>
```

```scss
.field {
  display: grid;
  gap: 6px;
}

.field__label {
  font-weight: 500;
}

.field__control.ng-invalid.ng-touched {
  border-color: var(--color-danger);
}

.field__control.ng-pending {
  background-image: linear-gradient(
    90deg,
    transparent,
    rgba(37, 99, 235, 0.12),
    transparent
  );
}

.field__error {
  color: var(--color-danger);
  font-size: 12px;
}
```

Với form submit, có thể bind class lên form:

```html
<form class="patient-form" [class.patient-form--submitted]="submitted" [formGroup]="form">
  ...
</form>
```

```scss
.patient-form--submitted {
  .ng-invalid {
    border-color: var(--color-danger);
  }
}
```

Lưu ý:

```text
- Không chỉ dựa vào màu để báo lỗi.
- Error message nên có vùng layout ổn định.
- Pending state nên hiển thị rõ nếu async validation chậm.
```

---

## 12. Responsive trong Angular component

Responsive không chỉ nằm ở page. Component nào sở hữu layout nội bộ thì component đó nên xử lý responsive cho layout nội bộ.

Ví dụ filter component:

```html
<form class="filter" [formGroup]="form">
  <input nz-input formControlName="keyword" placeholder="Tìm kiếm" />
  <nz-select formControlName="status"></nz-select>
  <nz-select formControlName="branchId"></nz-select>
  <button nz-button nzType="primary">Lọc</button>
</form>
```

```scss
:host {
  display: block;
}

.filter {
  display: grid;
  grid-template-columns: minmax(220px, 2fr) repeat(2, minmax(160px, 1fr)) auto;
  gap: 12px;
  align-items: start;
}

@media (max-width: 900px) {
  .filter {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .filter {
    grid-template-columns: 1fr;
  }
}
```

Với text dài trong flex/grid, cần chú ý `min-width: 0` ở item chứa text:

```scss
.patient-summary {
  display: flex;
  gap: 12px;
}

.patient-summary__content {
  min-width: 0;
}

.patient-summary__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

---

## 13. Theme bằng CSS variables

CSS variables phù hợp để theme mà component không cần biết theme cụ thể.

Global style:

```css
:root {
  --color-primary: #2563eb;
  --color-danger: #dc2626;
  --text-default: #111827;
  --text-muted: #6b7280;
  --surface-default: #ffffff;
  --surface-subtle: #f9fafb;
  --surface-selected: #eff6ff;
  --border-default: #e5e7eb;
}

body.theme-dark {
  --text-default: #f9fafb;
  --text-muted: #d1d5db;
  --surface-default: #111827;
  --surface-subtle: #1f2937;
  --surface-selected: #1e3a8a;
  --border-default: #374151;
}
```

Angular service đổi theme:

```ts
@Injectable({ providedIn: 'root' })
export class ThemeService {
  setTheme(theme: 'light' | 'dark'): void {
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }
}
```

Component chỉ dùng token:

```scss
.panel {
  background: var(--surface-default);
  border: 1px solid var(--border-default);
  color: var(--text-default);
}
```

Không nên rải màu literal trong nhiều component nếu màu đó thuộc visual system.

---

## 14. Override ng-zorro / Ant Design Angular

Với UI library, kiểm tra API chính thức trước khi override CSS.

Ví dụ với `nz-table`, nếu mục tiêu chỉ là giảm spacing, có thể dùng API của thư viện trước:

```html
<nz-table nzSize="small" [nzData]="rows"></nz-table>
```

Nếu API chính thức không đủ và bắt buộc phải override DOM do ng-zorro render ra, đặt component thư viện trong wrapper có scope rõ:

```html
<div class="patient-table">
  <nz-table nzSize="small" [nzData]="rows"></nz-table>
</div>
```

SCSS:

```scss
:host ::ng-deep .patient-table .ant-table-thead > tr > th {
  font-weight: 600;
  background: var(--surface-subtle);
}

:host ::ng-deep .patient-table .ant-table-cell {
  padding: 6px 8px;
}
```

Trong trường hợp này, `::ng-deep` chỉ phục vụ override DOM do ng-zorro render ra bên trong `.patient-table`.

Quy tắc:

```text
- bắt đầu selector từ :host hoặc wrapper cụ thể
- scope bằng class chức năng như .patient-table, .patient-filter, .date-range-control
- không override selector rộng như .ant-table-cell toàn app
- hạn chế !important
- review lại khi upgrade ng-zorro
```

Cần tránh:

```scss
::ng-deep .ant-table-cell {
  padding: 4px;
}
```

Selector này có thể ảnh hưởng mọi table trong app.

---

## 15. Content projection và style API

Khi build component có `<ng-content>`, component nên định nghĩa rõ các vùng mà caller được phép truyền nội dung vào.

Sử dụng:

```html
<app-section-card>
  <ng-container card-title>Thông tin bệnh nhân</ng-container>
  <ng-container card-actions>
    <button nz-button nzType="primary">Lưu</button>
  </ng-container>

  <app-patient-form [form]="form"></app-patient-form>
</app-section-card>
```

Template của `SectionCardComponent`:

```html
<section class="section-card">
  <header class="section-card__header">
    <div class="section-card__title">
      <ng-content select="[card-title]"></ng-content>
    </div>
    <div class="section-card__actions">
      <ng-content select="[card-actions]"></ng-content>
    </div>
  </header>

  <div class="section-card__body">
    <ng-content></ng-content>
  </div>
</section>
```

SCSS:

```scss
:host {
  display: block;
}

.section-card {
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--surface-default);
}

.section-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-card__actions {
  display: flex;
  gap: 8px;
}
```

Caller không cần biết DOM nội bộ của card để chỉnh header/body. Component expose vùng projection như một phần của style API.

---

## 16. CSS và Change Detection

Angular chạy change detection nhiều lần. Template style/class binding nên tránh tạo object mới không cần thiết trong list lớn.

Tránh:

```html
<tr *ngFor="let row of rows" [ngStyle]="{ color: row.danger ? 'red' : 'inherit' }"></tr>
```

Nên dùng class binding:

```html
<tr
  *ngFor="let row of rows; trackBy: trackById"
  class="risk-row"
  [class.risk-row--danger]="row.danger">
</tr>
```

```scss
.risk-row--danger {
  color: var(--color-danger);
}
```

```ts
trackById(_: number, row: RowVm): string {
  return row.id;
}
```

Với `OnPush`, class binding vẫn update khi:

```text
- input reference đổi
- event trong component chạy
- async pipe emit
- signal thay đổi
```

Nếu parent mutate object cũ, UI có thể không update như kỳ vọng. Cập nhật immutable giúp input reference thay đổi rõ:

```ts
this.rows = this.rows.map(row =>
  row.id === id ? { ...row, selected: true } : row
);
```

---

## 17. DOM measurement

Một số layout cần đo DOM, ví dụ chart, virtual area, sticky header. Không đo DOM trong constructor.

Template:

```html
<div class="chart-host" #chartHost></div>
```

Component:

```ts
export class ChartPanelComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartHost') chartHost!: ElementRef<HTMLElement>;

  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.resizeObserver = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      this.resizeChart(width);
    });

    this.resizeObserver.observe(this.chartHost.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private resizeChart(width: number): void {
    // update chart size
  }
}
```

SCSS:

```scss
:host {
  display: block;
  min-height: 0;
}

.chart-host {
  width: 100%;
  min-height: 240px;
}
```

Lưu ý:

```text
- DOM thật chỉ chắc chắn có sau ngAfterViewInit.
- Observer/listener phải cleanup.
- Nếu callback chạy dày, cân nhắc runOutsideAngular.
```

---

## 18. Animation

Animation đơn giản có thể làm bằng CSS.

Template:

```html
<aside class="drawer" [class.drawer--open]="open">
  <ng-content></ng-content>
</aside>
```

SCSS:

```scss
.drawer {
  transform: translateX(100%);
  opacity: 0;
  transition: transform 180ms ease, opacity 180ms ease;
}

.drawer--open {
  transform: translateX(0);
  opacity: 1;
}
```

Tránh animation layout property nếu hiệu ứng chạy thường xuyên:

```scss
/* Hạn chế */
.panel {
  transition: width 200ms ease;
}
```

Ưu tiên:

```text
transform
opacity
```

Tôn trọng người dùng giảm chuyển động:

```scss
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 19. Accessibility liên quan đến CSS

Không xóa focus outline nếu không thay bằng focus style khác.

```scss
.icon-button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

Template icon button:

```html
<button
  type="button"
  class="icon-button"
  aria-label="Xóa dòng"
  (click)="remove(row)">
  <span nz-icon nzType="delete"></span>
</button>
```

CSS không được làm mất thông tin quan trọng.

```scss
.table-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Nếu text bị cắt, bổ sung tooltip hoặc `title` khi nội dung quan trọng:

```html
<td class="table-cell" [title]="patient.fullAddress">
  {{ patient.fullAddress }}
</td>
```

Checklist accessibility:

```text
[ ] Focus state nhìn thấy được bằng keyboard.
[ ] Text quan trọng không bị cắt mà không có cách xem đầy đủ.
[ ] Màu lỗi/thành công không phải tín hiệu duy nhất.
[ ] Disabled state vẫn đọc được.
[ ] Hover-only interaction có cách dùng bằng keyboard/touch.
```

---

## 20. List page

Bài toán: màn hình danh sách có filter, table, loading, empty, error.

Template:

```html
<section class="list-page">
  <header class="list-page__header">
    <h1 class="list-page__title">Bệnh nhân</h1>
    <button nz-button nzType="primary">Thêm mới</button>
  </header>

  <app-patient-filter
    [query]="vm.query"
    (queryChange)="facade.changeQuery($event)">
  </app-patient-filter>

  <nz-alert
    *ngIf="vm.error"
    nzType="error"
    nzShowIcon
    [nzMessage]="vm.error">
  </nz-alert>

  <app-loading *ngIf="vm.loading"></app-loading>

  <app-empty-state *ngIf="!vm.loading && vm.items.length === 0"></app-empty-state>

  <app-patient-table
    class="list-page__table"
    *ngIf="!vm.loading && vm.items.length > 0"
    [patients]="vm.items">
  </app-patient-table>
</section>
```

SCSS:

```scss
:host {
  display: block;
  min-height: 100%;
}

.list-page {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  gap: 16px;
  min-height: 100%;
}

.list-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.list-page__title {
  margin: 0;
}

.list-page__table {
  min-height: 0;
}

@media (max-width: 560px) {
  .list-page__header {
    align-items: stretch;
    flex-direction: column;
  }
}
```

Điểm cần chú ý:

```text
- Page điều phối state loading/error/empty.
- Component con tự xử lý layout nội bộ.
- Page dùng gap để kiểm soát khoảng cách giữa các block.
- Responsive nằm ở nơi sở hữu layout.
- Table nhận class từ page để tham gia đúng layout page.
```

---

## 21. Checklist review Angular CSS

```text
Component boundary:
[ ] Style có nằm đúng component sở hữu UI không?
[ ] Parent có override sâu vào DOM con không?
[ ] Variant có cần thành @Input hoặc class API không?

Host element:
[ ] Style này cần áp vào host hay DOM nội bộ?
[ ] Host element nên là block, inline-flex, flex, grid hay giữ mặc định?
[ ] Component có tự gắn class lên host bằng @HostBinding khi cần không?

Template binding:
[ ] Class binding có rõ nghĩa không?
[ ] Có dùng inline style cho màu/spacing hệ thống không?
[ ] Có gọi function tạo object style/class trong list lớn không?

Encapsulation:
[ ] ViewEncapsulation.None có thật sự cần thiết không?
[ ] Có dùng ::ng-deep không?
[ ] ::ng-deep đã có :host hoặc wrapper scope chưa?
[ ] Selector override có trỏ vào class phổ biến của UI library không?

Layout:
[ ] Page layout và component layout có tách rõ không?
[ ] Parent có dùng gap thay vì child tự margin ngoài không?
[ ] Text dài có làm vỡ flex/grid không?

Forms:
[ ] Invalid/touched/pending state hiển thị rõ không?
[ ] Error text có layout ổn khi dài không?

Accessibility:
[ ] Focus state còn không?
[ ] Text bị ellipsis có cách xem đầy đủ không?
[ ] Màu sắc có phải tín hiệu duy nhất không?

Performance:
[ ] Có transition all không?
[ ] Có animate width/height/top/left thường xuyên không?
[ ] List lớn có trackBy và class binding đơn giản không?
```

---

## 22. Lộ trình học

### 22.1. Nền tảng

```text
- component styleUrls
- ViewEncapsulation.Emulated
- :host
- class binding
- ngClass
- style binding
- form state classes
```

### 22.2. Áp dụng trong dự án

```text
- input-driven variant
- page layout vs component layout
- responsive component
- CSS variables cho theme
- override ng-zorro có scope
- content projection và style API
```

### 22.3. Thiết kế UI architecture

```text
- quy ước token màu/spacing/typography
- chiến lược theme
- giảm global override
- kiểm soát ::ng-deep
- review CSS theo boundary, binding, accessibility, performance
- chuẩn hóa component API để tránh parent override sâu
```

---

## 23. Tóm tắt

Khi viết CSS trong Angular, không chỉ nhìn selector đúng hay sai. Cần nhìn cả boundary và API của component.

Các câu hỏi quan trọng:

```text
Style này thuộc page hay component con?
State này nên bind bằng class hay style binding?
Host element của component cần style gì?
Variant này nên là class trên host hay @Input?
Có đang dùng ::ng-deep làm mất boundary không?
Override UI library đã có scope đủ chặt chưa?
Theme có dùng token thay vì màu rải rác không?
Template có tạo object style/class quá nhiều lần không?
Focus, contrast và keyboard interaction có được giữ không?
```

Một cách viết CSS tốt trong Angular là:

```text
Rõ host element.
Rõ DOM nội bộ.
Rõ page layout.
Rõ component API.
Rõ phạm vi override.
Rõ state và visual state.
```

Khi những phần này rõ, UI dễ mở rộng hơn, ít phải sửa bằng global CSS hoặc `::ng-deep` khó kiểm soát hơn.
