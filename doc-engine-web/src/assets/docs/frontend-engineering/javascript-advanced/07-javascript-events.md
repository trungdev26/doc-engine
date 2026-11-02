# Event

## 1. Event là gì?

Event là một thông báo cho biết **một việc vừa xảy ra**.

Ví dụ:

- người dùng click vào button;
- người dùng nhập nội dung;
- một form được submit;
- một phím được nhấn;
- một file được kéo vào vùng upload;
- cửa sổ thay đổi kích thước;
- trang hoàn thành việc tải DOM.

Browser tạo event object chứa thông tin về sự việc, sau đó chuyển event đó tới element liên quan. Code có thể đăng ký một function để phản ứng khi event xảy ra.

```text
Người dùng click
→ browser tạo click event
→ browser xác định element được click
→ browser gọi listener đã đăng ký
→ listener thực thi logic ứng dụng
```

Function được đăng ký để nhận event thường được gọi là:

- event listener;
- event handler;
- callback.

---

## 2. Ví dụ đầu tiên: click button

HTML:

```html
<button id="save-button" type="button">
  Lưu
</button>
```

TypeScript:

```ts
const saveButton =
  document.querySelector<HTMLButtonElement>('#save-button');

function handleSaveClick(): void {
  console.log('Người dùng vừa click nút Lưu');
}

saveButton?.addEventListener('click', handleSaveClick);
```

Giải thích từng bước:

```text
1. querySelector tìm button trong DOM.
2. addEventListener đăng ký một listener cho event click.
3. Code không gọi handleSaveClick ngay.
4. Khi người dùng click, browser gọi handleSaveClick.
```

### Truyền function, không gọi function

Đúng:

```ts
saveButton?.addEventListener('click', handleSaveClick);
```

Sai:

```ts
saveButton?.addEventListener('click', handleSaveClick());
```

`handleSaveClick()` có dấu ngoặc nên function chạy ngay lúc đăng ký. `addEventListener` cần nhận function reference để có thể gọi nó sau.

### Dùng arrow callback

```ts
saveButton?.addEventListener('click', () => {
  console.log('Đã click');
});
```

Cách này phù hợp cho listener nhỏ. Nếu cần gỡ listener hoặc logic dài, nên giữ function trong một biến có tên.

---

## 3. Event listener nhận được gì?

Browser truyền event object vào listener:

```ts
function handleSaveClick(event: MouseEvent): void {
  console.log(event.type); // click
  console.log(event.clientX);
  console.log(event.clientY);
}

saveButton?.addEventListener('click', handleSaveClick);
```

Event object trả lời các câu hỏi:

```text
Event gì vừa xảy ra?
Xảy ra trên element nào?
Con trỏ ở vị trí nào?
Phím nào đang được giữ?
Event có thể bị hủy hành vi mặc định không?
Event đang ở phase nào?
```

Mỗi nhóm event có object chuyên biệt:

| Event | Kiểu object thường gặp |
|---|---|
| `click`, `dblclick` | `MouseEvent` |
| `pointerdown`, `pointermove` | `PointerEvent` |
| `keydown`, `keyup` | `KeyboardEvent` |
| `input`, `change`, `submit` | `Event` hoặc `InputEvent` |
| `dragstart`, `drop` | `DragEvent` |
| `focus`, `blur` | `FocusEvent` |

---

## 4. Ba cách đăng ký event

### 4.1 Inline event trong HTML

```html
<button onclick="save()">Lưu</button>
```

Cách này trộn behavior vào HTML, khó quản lý scope, test và cleanup. Không nên dùng trong application hiện đại.

### 4.2 Gán event property

```ts
saveButton.onclick = handleSaveClick;
```

Mỗi property chỉ giữ được một handler:

```ts
saveButton.onclick = firstHandler;
saveButton.onclick = secondHandler;
```

`secondHandler` ghi đè `firstHandler`.

### 4.3 `addEventListener`

```ts
saveButton.addEventListener('click', firstHandler);
saveButton.addEventListener('click', secondHandler);
```

Cả hai listener đều được đăng ký.

`addEventListener` còn hỗ trợ:

- capturing;
- listener chỉ chạy một lần;
- passive listener;
- cleanup bằng `AbortSignal`.

Đây là cách nên dùng khi thao tác DOM trực tiếp.

---

## 5. Các nhóm event phổ biến

Không nên học thuộc toàn bộ tên event. Hãy nhóm chúng theo loại interaction.

### Mouse và pointer

```text
click
dblclick
contextmenu
mousedown / mouseup / mousemove
mouseenter / mouseleave
mouseover / mouseout
pointerdown / pointerup / pointermove
pointerenter / pointerleave
pointercancel
```

### Keyboard

```text
keydown
keyup
```

### Form và input

```text
input
change
submit
reset
focus
blur
focusin
focusout
invalid
```

### Drag and Drop

```text
dragstart
drag
dragenter
dragover
dragleave
drop
dragend
```

### Document và window

```text
DOMContentLoaded
load
resize
scroll
beforeunload
visibilitychange
online
offline
```

### Clipboard

```text
copy
cut
paste
```

---

## 6. Click và các mouse event

### `click`

`click` là event mức cao biểu diễn một thao tác kích hoạt. Nó có thể xuất hiện từ mouse, touch hoặc keyboard tùy element và browser behavior.

```ts
button.addEventListener('click', event => {
  console.log('Button được kích hoạt');
});
```

Với button semantic, người dùng keyboard có thể focus rồi nhấn `Enter` hoặc `Space`. Vì vậy nên ưu tiên `<button>` thay vì gắn click lên `<div>`.

Không tốt:

```html
<div class="button">Lưu</div>
```

Tốt hơn:

```html
<button type="button">Lưu</button>
```

Button có sẵn:

- khả năng focus;
- keyboard interaction;
- role cho accessibility;
- disabled state;
- form behavior.

### `dblclick`

```ts
element.addEventListener('dblclick', () => {
  openEditor();
});
```

Không nên đặt thao tác quan trọng chỉ sau double click vì:

- khó khám phá;
- không thuận tiện trên touch;
- có thể xung đột single click;
- accessibility kém nếu không có cách thay thế.

### `contextmenu`

```ts
element.addEventListener('contextmenu', event => {
  event.preventDefault();
  openContextMenu(event.clientX, event.clientY);
});
```

Nếu thay menu mặc định của browser, cần có keyboard interaction và cách đóng menu phù hợp.

### `mousedown` và `mouseup`

```ts
element.addEventListener('mousedown', () => {
  console.log('Nút chuột vừa được nhấn xuống');
});

element.addEventListener('mouseup', () => {
  console.log('Nút chuột vừa được thả ra');
});
```

Một click thông thường có trình tự gần như:

```text
mousedown
mouseup
click
```

Không dùng `mousedown` thay `click` nếu chỉ cần kích hoạt button. `mousedown` xảy ra sớm hơn và không mang đầy đủ semantics kích hoạt.

---

## 7. Mouse event và Pointer Event

Mouse Events chỉ mô tả chuột. Pointer Events thống nhất:

- mouse;
- touch;
- pen.

```ts
canvas.addEventListener('pointerdown', event => {
  console.log(event.pointerType); // mouse, touch hoặc pen
  console.log(event.pointerId);
  console.log(event.pressure);
});
```

Với interaction kéo, vẽ hoặc resize, Pointer Events thường phù hợp hơn việc viết riêng mouse và touch handler.

### Pointer capture

Khi người dùng bắt đầu kéo rồi con trỏ ra ngoài element, element có thể mất event tiếp theo. Pointer capture giúp element tiếp tục nhận event của pointer đó:

```ts
handle.addEventListener('pointerdown', event => {
  handle.setPointerCapture(event.pointerId);
  startDragging(event);
});

handle.addEventListener('pointermove', event => {
  if (handle.hasPointerCapture(event.pointerId)) {
    updateDragging(event);
  }
});

handle.addEventListener('pointerup', event => {
  handle.releasePointerCapture(event.pointerId);
  finishDragging(event);
});

handle.addEventListener('pointercancel', event => {
  cancelDragging(event);
});
```

`pointercancel` phải được xử lý để cleanup state khi browser hoặc hệ điều hành hủy interaction.

---

## 8. `mouseenter`, `mouseleave`, `mouseover`, `mouseout`

Hai cặp này có semantics khác nhau.

### `mouseenter` và `mouseleave`

- không bubble;
- không phát lại khi di chuyển giữa các element con.

```ts
card.addEventListener('mouseenter', showActions);
card.addEventListener('mouseleave', hideActions);
```

### `mouseover` và `mouseout`

- có bubble;
- có thể phát nhiều lần khi đi qua các child element.

```ts
list.addEventListener('mouseover', handleDelegatedHover);
```

Nếu hover một card có nhiều child:

```text
mouseenter → thường một lần khi đi vào card
mouseover  → có thể chạy lại khi đi từ child này sang child khác
```

Đừng sửa hiện tượng `mouseover` chạy nhiều bằng flag ngẫu nhiên; hãy chọn event đúng semantics.

---

## 9. Keyboard event

```ts
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    closeDialog();
  }
});
```

### `keydown` và `keyup`

```text
keydown → phím được nhấn xuống
keyup   → phím được thả ra
```

`keydown` có thể lặp lại khi giữ phím:

```ts
document.addEventListener('keydown', event => {
  console.log(event.repeat);
});
```

### `key` và `code`

```ts
console.log(event.key);
console.log(event.code);
```

`key` mô tả giá trị/phím theo layout:

```text
a
A
Enter
Escape
ArrowDown
```

`code` mô tả vị trí vật lý:

```text
KeyA
Digit1
Space
```

Chọn theo mục đích:

```text
Shortcut theo ý nghĩa phím → key
Game/control theo vị trí   → code
```

### Phím bổ trợ

```ts
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    save();
  }
});
```

`metaKey` cần thiết cho macOS.

### Không chiếm phím khi người dùng đang nhập

```ts
function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
```

Shortcut toàn trang cần kiểm tra focus context để không phá thao tác nhập liệu.

---

## 10. `input` và `change`

HTML:

```html
<input id="keyword" type="search" />
```

### `input`

Phát khi giá trị thay đổi trong lúc người dùng tương tác:

```ts
keywordInput.addEventListener('input', event => {
  const input = event.currentTarget as HTMLInputElement;
  console.log(input.value);
});
```

Phù hợp cho:

- live search;
- character counter;
- validation trong lúc nhập;
- preview tức thời.

### `change`

Phát khi một thay đổi được commit. Thời điểm cụ thể phụ thuộc control.

Với text input, `change` thường phát sau khi value thay đổi rồi input mất focus. Với select hoặc checkbox, nó thường phát khi người dùng chọn.

```ts
countrySelect.addEventListener('change', event => {
  const select = event.currentTarget as HTMLSelectElement;
  loadCities(select.value);
});
```

Chọn event theo hành vi mong muốn, không mặc định mọi control đều dùng `change`.

---

## 11. Focus event

```ts
input.addEventListener('focus', () => {
  showHint();
});

input.addEventListener('blur', () => {
  hideHint();
});
```

Các event:

```text
focus    → nhận focus, không bubble
blur     → mất focus, không bubble
focusin  → nhận focus, có bubble
focusout → mất focus, có bubble
```

Muốn theo dõi focus của nhiều field bằng một listener trên form:

```ts
form.addEventListener('focusin', event => {
  highlightField(event.target);
});

form.addEventListener('focusout', event => {
  unhighlightField(event.target);
});
```

Focus không chỉ đến từ mouse. Keyboard, script và accessibility tool cũng có thể thay đổi focus.

---

## 12. Submit form

HTML:

```html
<form id="order-form">
  <input name="customerName" required />
  <button type="submit">Lưu</button>
</form>
```

Listener nên gắn vào event `submit` của form:

```ts
orderForm.addEventListener('submit', event => {
  event.preventDefault();

  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);

  saveOrder(formData);
});
```

Không nên chỉ gắn `click` vào button:

```ts
saveButton.addEventListener('click', saveOrder);
```

Vì form còn có thể submit bằng:

- nhấn Enter;
- accessibility tool;
- gọi `requestSubmit()`;
- một submit button khác.

### `submit()` và `requestSubmit()`

```ts
form.requestSubmit();
```

`requestSubmit()` đi qua validation và phát submit event.

```ts
form.submit();
```

`submit()` trực tiếp bỏ qua submit event và constraint validation. Trong phần lớn application flow, `requestSubmit()` đúng semantics hơn.

---

## 13. Drag and Drop là gì?

Drag and Drop gồm hai phía:

```text
Draggable source
→ người dùng bắt đầu kéo
→ dữ liệu được đặt vào DataTransfer
→ con trỏ đi qua drop zone
→ drop zone cho phép drop
→ người dùng thả
→ drop zone đọc dữ liệu
```

Ví dụ kéo một card:

```html
<article
  class="task-card"
  draggable="true"
  data-task-id="42">
  Công việc #42
</article>

<section class="done-column">
  Thả vào đây
</section>
```

---

## 14. Các event trong Drag and Drop

### Trên element được kéo

```text
dragstart → bắt đầu kéo
drag      → đang kéo
dragend   → kết thúc, dù drop thành công hay không
```

### Trên drop target

```text
dragenter → con trỏ kéo đi vào
dragover  → con trỏ đang ở trên
dragleave → con trỏ kéo đi ra
drop      → người dùng thả
```

Trình tự đơn giản:

```text
source: dragstart
target: dragenter
target: dragover
target: drop
source: dragend
```

---

## 15. Ví dụ Drag and Drop hoàn chỉnh

```ts
const taskCard =
  document.querySelector<HTMLElement>('.task-card');

const doneColumn =
  document.querySelector<HTMLElement>('.done-column');

taskCard?.addEventListener('dragstart', event => {
  if (!event.dataTransfer) {
    return;
  }

  const taskId = taskCard.dataset['taskId'];

  if (!taskId) {
    event.preventDefault();
    return;
  }

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', taskId);

  taskCard.classList.add('is-dragging');
});

doneColumn?.addEventListener('dragover', event => {
  // Bắt buộc để element trở thành drop target.
  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
});

doneColumn?.addEventListener('dragenter', () => {
  doneColumn.classList.add('is-drag-over');
});

doneColumn?.addEventListener('dragleave', event => {
  const nextElement = event.relatedTarget;

  if (
    !(nextElement instanceof Node) ||
    !doneColumn.contains(nextElement)
  ) {
    doneColumn.classList.remove('is-drag-over');
  }
});

doneColumn?.addEventListener('drop', event => {
  event.preventDefault();

  const taskId =
    event.dataTransfer?.getData('text/plain');

  if (!taskId) {
    return;
  }

  moveTaskToDone(taskId);
  doneColumn.classList.remove('is-drag-over');
});

taskCard?.addEventListener('dragend', () => {
  taskCard.classList.remove('is-dragging');
  doneColumn?.classList.remove('is-drag-over');
});
```

### Vì sao `dragover` phải `preventDefault`?

Mặc định, phần lớn element không chấp nhận drop. Gọi `preventDefault()` trong `dragover` báo cho browser rằng vị trí này là drop target hợp lệ.

### Vì sao vẫn cần `dragend`?

Người dùng có thể thả ra ngoài drop zone hoặc nhấn Escape. `dragend` là nơi cleanup trạng thái hiển thị ở source.

---

## 16. Kéo thả file

```html
<div id="drop-zone">
  Kéo file vào đây
</div>
```

```ts
dropZone.addEventListener('dragover', event => {
  event.preventDefault();
});

dropZone.addEventListener('drop', event => {
  event.preventDefault();

  const files = [...(event.dataTransfer?.files ?? [])];

  for (const file of files) {
    console.log(file.name, file.type, file.size);
  }
});
```

Cần validate:

- số lượng file;
- kích thước;
- loại file thực tế phía server;
- tên file;
- quyền upload.

Không tin hoàn toàn `file.type` hoặc extension ở client. Validation bảo mật phải được thực hiện lại phía server.

Nên có `<input type="file">` làm cách thay thế vì native Drag and Drop không thuận tiện cho mọi thiết bị và accessibility flow.

---

## 17. Drag and Drop và touch/accessibility

HTML Drag and Drop API có trải nghiệm không đồng nhất trên touch device. Với thao tác sắp xếp phức tạp, cần:

- keyboard alternative;
- button “Di chuyển lên/xuống”;
- screen-reader announcement;
- Pointer Events hoặc thư viện hỗ trợ accessibility;
- không dùng vị trí hình ảnh làm source of truth.

Business state chỉ nên commit sau khi xác định drop hợp lệ:

```text
Visual drag state ≠ business state đã lưu
```

Nếu save server thất bại, UI cần rollback hoặc hiển thị trạng thái lỗi rõ ràng.

---

## 18. Event propagation là gì?

DOM là một cây element. Khi click một element con, browser cho các ancestor cơ hội nhận cùng event.

```html
<main id="page">
  <section id="panel">
    <button id="save-button">
      <span>Lưu</span>
    </button>
  </section>
</main>
```

Event đi qua ba phase:

```text
1. Capturing
window → document → html → body → page → panel → button

2. Target
button

3. Bubbling
button → panel → page → body → html → document → window
```

Phần lớn listener dùng bubbling phase mặc định.

---

## 19. Capturing và bubbling

Listener bubbling:

```ts
panel.addEventListener('click', () => {
  console.log('panel bubble');
});
```

Listener capturing:

```ts
panel.addEventListener(
  'click',
  () => {
    console.log('panel capture');
  },
  { capture: true }
);
```

Ví dụ thứ tự:

```ts
document.addEventListener(
  'click',
  () => console.log('document capture'),
  true
);

button.addEventListener('click', () =>
  console.log('button')
);

document.addEventListener('click', () =>
  console.log('document bubble')
);
```

Khi click button:

```text
document capture
button
document bubble
```

---

## 20. `target` và `currentTarget`

Nếu click `<span>` bên trong button:

```ts
button.addEventListener('click', event => {
  console.log(event.target);
  console.log(event.currentTarget);
});
```

Kết quả:

```text
event.target        → span nơi click bắt đầu
event.currentTarget → button đang chạy listener
```

`target` giữ nguyên trong quá trình propagation. `currentTarget` thay đổi theo listener hiện tại.

Khi cần đọc `dataset`, `value` hoặc property của chính element đăng ký listener, thường nên dùng `currentTarget`.

---

## 21. Default action và `preventDefault`

Một số event kéo theo hành vi mặc định của browser:

```text
click link      → điều hướng
submit form     → gửi form/reload
click checkbox  → đổi checked
wheel/touch     → scroll
drop file       → browser có thể mở file
```

Ngăn default action:

```ts
link.addEventListener('click', event => {
  event.preventDefault();
  navigateWithRouter();
});
```

Kiểm tra:

```ts
event.cancelable;
event.defaultPrevented;
```

`preventDefault()` không ngăn bubbling.

---

## 22. Dừng propagation

### `stopPropagation`

```ts
button.addEventListener('click', event => {
  event.stopPropagation();
});
```

Ngăn event tiếp tục đi qua propagation path.

### `stopImmediatePropagation`

```ts
button.addEventListener('click', event => {
  event.stopImmediatePropagation();
});
```

Ngăn cả:

- listener tiếp theo trên cùng element;
- propagation sang element khác.

### Không lạm dụng

Dừng propagation có thể làm:

- click-outside không chạy;
- analytics không nhận event;
- component khó tích hợp;
- event flow khó debug.

Chỉ dừng khi behavior thực sự yêu cầu. Nhiều trường hợp nên lọc `target` thay vì chặn event.

---

## 23. Event delegation

Giả sử danh sách có hàng trăm button:

```html
<ul id="order-list">
  <li data-order-id="1">
    <button data-action="view">Xem</button>
    <button data-action="delete">Xóa</button>
  </li>
  <!-- ... -->
</ul>
```

Không cần đăng ký listener cho từng button. Dùng một listener trên list:

```ts
orderList.addEventListener('click', event => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const actionButton =
    target.closest<HTMLButtonElement>('[data-action]');

  if (!actionButton || !orderList.contains(actionButton)) {
    return;
  }

  const row = actionButton.closest<HTMLElement>(
    '[data-order-id]'
  );

  const orderId = row?.dataset['orderId'];
  const action = actionButton.dataset['action'];

  if (!orderId || !action) {
    return;
  }

  handleOrderAction(action, orderId);
});
```

Delegation hoạt động nhờ bubbling.

### Tại sao dùng `closest`?

Button có thể chứa icon:

```html
<button data-action="delete">
  <svg>...</svg>
</button>
```

`event.target` có thể là `svg`. `closest` tìm button gần nhất.

### Lợi ích

- ít listener;
- item thêm động vẫn hoạt động;
- cleanup đơn giản;
- interaction có một boundary rõ.

---

## 24. Event nào không bubble?

Không phải event nào cũng bubble.

| Không bubble | Lựa chọn có bubble |
|---|---|
| `focus` | `focusin` |
| `blur` | `focusout` |
| `mouseenter` | `mouseover` |
| `mouseleave` | `mouseout` |

Có thể kiểm tra:

```ts
console.log(event.bubbles);
```

Khi delegation không hoạt động, đây là một trong những điểm đầu tiên cần kiểm tra.

---

## 25. Listener options

### Chạy một lần với `once`

```ts
button.addEventListener('click', initialize, {
  once: true,
});
```

### `passive`

```ts
window.addEventListener('touchmove', handleTouch, {
  passive: true,
});
```

`passive: true` cam kết listener không gọi `preventDefault`, giúp browser tối ưu scroll.

Không dùng passive nếu thật sự cần ngăn default action.

### Cleanup bằng `signal`

```ts
const controller = new AbortController();

window.addEventListener('resize', handleResize, {
  signal: controller.signal,
});

document.addEventListener('keydown', handleKeydown, {
  signal: controller.signal,
});

controller.abort();
```

Một lần `abort()` gỡ các listener dùng cùng signal.

### `capture`

```ts
element.addEventListener('click', handler, {
  capture: true,
});
```

Chọn listener chạy trong capturing phase.

---

## 26. Cleanup listener đúng cách

Sai:

```ts
window.addEventListener(
  'resize',
  () => updateLayout()
);

window.removeEventListener(
  'resize',
  () => updateLayout()
);
```

Hai arrow function là hai function object khác nhau.

Đúng:

```ts
const handleResize = () => updateLayout();

window.addEventListener('resize', handleResize);
window.removeEventListener('resize', handleResize);
```

Listener global có thể giữ một component đã bị đóng:

```text
window
→ listener
→ callback closure
→ component instance
→ component state
```

Cleanup không chỉ để tránh callback chạy thừa; nó còn giải phóng reference.

---

## 27. Custom Event

Có thể tạo event riêng:

```ts
const selectedEvent = new CustomEvent<Order>(
  'order:selected',
  {
    detail: selectedOrder,
    bubbles: true,
  }
);

element.dispatchEvent(selectedEvent);
```

Nhận:

```ts
element.addEventListener('order:selected', event => {
  const order =
    (event as CustomEvent<Order>).detail;

  console.log(order);
});
```

Custom DOM event phù hợp cho:

- Web Components;
- giao tiếp qua DOM boundary;
- integration không phụ thuộc framework.

Trong Angular application thông thường, `output`, service, Signal hoặc Observable thường có contract rõ hơn. Không biến Custom Event thành global event bus.

---

## 28. Event và event loop

Khi người dùng click, browser đưa việc xử lý click vào một task.

```ts
button.addEventListener('click', () => {
  console.log('listener:start');

  Promise.resolve().then(() => {
    console.log('microtask');
  });

  console.log('listener:end');
});
```

Kết quả:

```text
listener:start
listener:end
microtask
browser có thể render
```

Listener chạy theo run-to-completion. Một listener CPU nặng sẽ chặn:

- listener khác;
- input tiếp theo;
- animation;
- rendering.

Event tần suất cao như `pointermove`, `mousemove`, `scroll` có thể phát nhiều lần. Chỉ throttle/debounce sau khi xác định semantics và đo bottleneck.

---

## 29. Liên hệ với Angular

### Template event binding

```html
<button type="button" (click)="save()">
  Lưu
</button>
```

Angular quản lý việc đăng ký và cleanup listener theo lifecycle của view.

Lấy event:

```html
<input (input)="onKeywordInput($event)" />
```

```ts
onKeywordInput(event: Event): void {
  const input =
    event.currentTarget as HTMLInputElement;

  this.keyword.set(input.value);
}
```

### `@HostListener`

```ts
@HostListener('keydown.escape')
handleEscape(): void {
  this.close();
}
```

Phù hợp khi behavior thuộc host element hoặc directive.

### RxJS `fromEvent`

```ts
fromEvent<InputEvent>(input, 'input')
  .pipe(
    map(event =>
      (event.currentTarget as HTMLInputElement).value
    ),
    debounceTime(300),
    distinctUntilChanged(),
    takeUntilDestroyed(this.destroyRef)
  )
  .subscribe(keyword => {
    this.search(keyword);
  });
```

`fromEvent` không thay đổi DOM event model. Nó bọc event thành Observable để compose:

- debounce;
- throttle;
- mapping;
- cancellation;
- lifecycle.

### Event tần suất cao

Với `scroll` hoặc `pointermove`:

- tránh cập nhật state nếu value không đổi;
- throttle theo frame nếu phù hợp;
- đo change detection;
- cân nhắc chạy ngoài Angular zone rồi quay lại khi commit state.

Không dùng tối ưu nâng cao nếu chưa có số liệu.

---

## 30. Click outside

Cách phụ thuộc vào `stopPropagation`:

```ts
document.addEventListener('click', closeMenu);
menu.addEventListener('click', event => {
  event.stopPropagation();
});
```

Cách lọc target rõ hơn:

```ts
function handleDocumentClick(
  event: MouseEvent
): void {
  const target = event.target;

  if (!(target instanceof Node)) {
    return;
  }

  const clickedInsideMenu = menu.contains(target);
  const clickedTrigger = trigger.contains(target);

  if (!clickedInsideMenu && !clickedTrigger) {
    closeMenu();
  }
}
```

Với overlay được render ở DOM subtree khác, cần dùng overlay abstraction của framework hoặc kiểm tra propagation path phù hợp.

---

## 31. Những lỗi thường gặp

### Chỉ xử lý click trên button submit

Nhấn Enter không đi qua flow mong muốn. Hãy xử lý form `submit`.

### Dùng `<div>` thay button

Mất keyboard behavior và accessibility semantics.

### Nhầm `target` với `currentTarget`

Code đọc property từ icon hoặc child element thay vì element đăng ký listener.

### Dùng `mouseover` khi muốn một lần vào element

Event chạy lại khi đi qua child. Có thể cần `mouseenter`.

### Quên `preventDefault` trong `dragover`

Drop event không chạy.

### Không cleanup `window`/`document` listener

Callback tiếp tục sống sau khi component đã đóng.

### Tạo function mới khi remove

`removeEventListener` không tìm thấy listener cũ.

### Lạm dụng `stopPropagation`

Interaction khác và analytics bị ảnh hưởng.

### Chỉ hỗ trợ mouse

Touch, pen và keyboard không sử dụng được.

---

## 32. Quy trình debug event

Khi listener không chạy:

```text
1. Element query có tìm thấy không?
2. Listener đã thực sự được đăng ký chưa?
3. Tên event đúng chưa?
4. Event có bubble không?
5. Có element khác che interaction không?
6. Element có disabled không?
7. Default action có reload hoặc điều hướng không?
8. Có listener nào dừng propagation không?
```

Khi listener chạy sai element:

```text
1. In target.
2. In currentTarget.
3. In composedPath nếu có Shadow DOM.
4. Kiểm tra closest và DOM thực tế.
5. Kiểm tra delegation boundary.
```

Khi listener chạy nhiều lần:

```text
1. Có đăng ký lại sau mỗi render/lifecycle không?
2. Cleanup có dùng đúng function reference không?
3. Event đang bubble qua bao nhiêu ancestor?
4. Đang dùng mouseover thay vì mouseenter không?
5. Một hành động có phát nhiều loại event không?
```

Chrome DevTools hỗ trợ:

- Event Listeners panel;
- event listener breakpoints;
- Elements panel;
- `getEventListeners(element)` trong Console;
- Performance panel cho handler chạy lâu.

---

## 33. Bài luyện tập

### Bài 1 — Button counter

Tạo button:

- mỗi click tăng counter;
- hiển thị số lần click;
- disable sau 10 lần;
- cleanup listener bằng `AbortController`.

### Bài 2 — Form tìm kiếm

Yêu cầu:

- submit bằng button hoặc Enter;
- không reload trang;
- trim keyword;
- báo lỗi nếu keyword rỗng.

### Bài 3 — Keyboard shortcut

Tạo shortcut `Ctrl/Cmd + S`:

- gọi save;
- ngăn browser save page;
- không chạy khi đang nhập textarea;
- cleanup khi màn hình đóng.

### Bài 4 — Drag and Drop Kanban

Tạo hai column:

- card có thể kéo;
- drop zone highlight đúng;
- cleanup class khi cancel;
- update business state sau drop;
- có button thay thế cho keyboard user.

### Bài 5 — File drop zone

Yêu cầu:

- kéo file hoặc chọn bằng input;
- giới hạn số lượng;
- giới hạn dung lượng;
- hiển thị danh sách;
- giải thích validation nào phải lặp lại phía server.

### Bài 6 — Event propagation

Tạo ba element lồng nhau. Đăng ký capture và bubble listener ở mỗi cấp. Viết thứ tự dự đoán trước khi chạy.

### Bài 7 — Delegated table

Một table có `view`, `edit`, `delete`:

- chỉ dùng một listener;
- click icon trong button vẫn đúng;
- row thêm động vẫn hoạt động;
- không bắt action ngoài table.

### Bài 8 — Angular search

Dùng template event hoặc `fromEvent`:

- đọc input;
- debounce;
- distinct;
- request mới hủy request cũ;
- cleanup theo component lifecycle.

---

## 34. Câu hỏi tự kiểm tra

1. Event là gì và browser đóng vai trò gì?
2. Vì sao truyền `handler` khác gọi `handler()`?
3. Khi nào nên dùng `addEventListener`?
4. `click`, `mousedown` và `pointerdown` khác nhau về mức abstraction nào?
5. `input` và `change` khác nhau ra sao?
6. Vì sao nên xử lý `submit` trên form?
7. Các event trong một Drag and Drop flow chạy thế nào?
8. Vì sao `dragover` phải gọi `preventDefault`?
9. `target` và `currentTarget` khác nhau thế nào?
10. Capturing và bubbling là gì?
11. `preventDefault` có ngăn propagation không?
12. Event delegation dựa vào cơ chế nào?
13. Vì sao `focusin` delegate được nhưng `focus` không bubble?
14. `once`, `passive`, `capture` và `signal` dùng để làm gì?
15. Vì sao listener có thể giữ component sống?
16. Event callback được event loop thực thi như thế nào?

---

## 35. Checklist hoàn thành

```text
[ ] Hiểu event là thông báo do browser/đối tượng phát ra.
[ ] Đăng ký click listener đúng cách.
[ ] Phân biệt truyền function và gọi function.
[ ] Biết các nhóm mouse, pointer, keyboard, form và window event.
[ ] Chọn đúng click, pointer, input, change và submit.
[ ] Xây được Drag and Drop flow có cleanup.
[ ] Có phương án touch và keyboard cho thao tác kéo thả.
[ ] Phân biệt target và currentTarget.
[ ] Vẽ được capturing, target và bubbling phase.
[ ] Phân biệt default action với propagation.
[ ] Không lạm dụng stopPropagation.
[ ] Dùng delegation với closest và boundary check.
[ ] Cleanup listener bằng đúng function reference hoặc AbortSignal.
[ ] Hiểu Custom Event phù hợp với boundary nào.
[ ] Liên hệ DOM event với event loop.
[ ] Xử lý event đúng lifecycle Angular.
```
