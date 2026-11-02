# Memory management và performance

Mục tiêu không phải thuộc chi tiết implementation của garbage collector. Điều cần thiết là vẽ được object graph, hiểu reachability, tìm retaining path và phân biệt memory leak với memory pressure hoặc allocation churn.

---

## 1. Stack, heap và object graph

```text
Call stack
└── local binding ─┐

Global/service ────┼→ object A → object B → array C
DOM listener ──────┘
```

Object không “thuộc stack” chỉ vì một local variable trỏ đến nó. Binding có thể nằm trong stack frame, còn object thường nằm trong heap. Điều quyết định lifetime là còn đường reference từ root hay không.

---

## 2. Reachability

Garbage collector có thể thu hồi object khi object đó không còn reachable từ các root đang sống.

Các root thực dụng:

- global object;
- biến trên call stack hiện tại;
- active closure;
- DOM đang được document giữ;
- callback/listener/timer đang được host giữ;
- cache hoặc service singleton.

Memory leak thường không phải “GC quên dọn”, mà là ứng dụng vẫn còn một đường reference tới dữ liệu không còn cần.

```text
Window
  → event listener
    → callback
      → component
        → large data
```

Chỉ cần listener còn đăng ký, toàn bộ chuỗi có thể tiếp tục sống.

---

## 3. Mark-and-sweep mental model

Mô hình giản lược:

```text
1. Bắt đầu từ các root.
2. Mark mọi object có thể đi tới.
3. Object không được mark là unreachable.
4. Runtime có thể thu hồi vùng nhớ đó.
```

Garbage collector xử lý được circular reference nếu vòng đó không còn reachable:

```ts
let first: any = {};
let second: any = {};

first.other = second;
second.other = first;

first = null;
second = null;
```

Hai object trỏ nhau nhưng không còn đường từ root, nên có thể được thu hồi.

Engine hiện đại thường tối ưu theo thế hệ vì phần lớn object sống ngắn. Application developer không nên dựa vào thời điểm GC cụ thể.

---

## 4. Leak, pressure và churn

```text
Memory leak:
Object không còn hữu ích nhưng vẫn reachable.

Memory pressure:
Ứng dụng thật sự cần giữ quá nhiều dữ liệu.

Allocation churn:
Tạo rất nhiều object sống ngắn, làm GC chạy thường xuyên.
```

Ba vấn đề có biểu đồ và cách sửa khác nhau. Heap tăng tạm thời rồi giảm sau GC chưa đủ kết luận leak.

---

## 5. Những nguồn leak phổ biến

### Event listener không được gỡ

```ts
const onResize = () => updateLayout();
window.addEventListener('resize', onResize);

// Khi owner kết thúc
window.removeEventListener('resize', onResize);
```

Phải dùng đúng function reference và cùng capture option.

### Timer không được clear

```ts
const timerId = setInterval(refresh, 5_000);
clearInterval(timerId);
```

### Subscription sống lâu hơn component

Với Angular:

```ts
source$
  .pipe(takeUntilDestroyed(destroyRef))
  .subscribe(value => update(value));
```

Không phải subscription nào cũng leak: HTTP Observable thường complete. Nhưng stream từ event, subject, interval hoặc WebSocket có thể sống lâu.

### Cache không giới hạn

```ts
const cache = new Map<string, SearchResult>();
```

Cache cần policy:

- maximum size;
- TTL;
- eviction;
- invalidation;
- scope theo user/tenant;
- cleanup khi logout.

Cache không có eviction là một collection tăng không giới hạn.

### Detached DOM

DOM node đã bị gỡ khỏi document nhưng vẫn được JavaScript giữ reference có thể kéo theo listener và dữ liệu liên quan.

---

## 6. Observer/listener ownership

Mọi đăng ký đều tạo quan hệ giữ callback:

```text
EventTarget/Observable/Timer
→ registration
→ callback
→ lexical environment
→ component/data
```

API tốt nên trả cleanup handle:

```ts
function observeResize(
  callback: () => void
): () => void {
  window.addEventListener('resize', callback);
  return () => window.removeEventListener('resize', callback);
}

const dispose = observeResize(updateLayout);
dispose();
```

---

## 7. WeakMap và WeakSet

`WeakMap` cho phép key object không bị giữ sống chỉ vì đang nằm trong map.

```ts
const metadata = new WeakMap<object, Metadata>();

function setMetadata(target: object, value: Metadata): void {
  metadata.set(target, value);
}
```

Phù hợp cho metadata gắn theo lifecycle của object.

Không dùng WeakMap như cache vạn năng:

- key phải là object;
- không iterate được;
- không có TTL;
- không thay thế cache policy nghiệp vụ.

---

## 8. Quy trình điều tra memory leak

1. Xây kịch bản tái hiện: mở/đóng màn hình nhiều lần.
2. Đưa ứng dụng về trạng thái tương đương.
3. Chụp heap snapshot trước và sau.
4. Tìm object tăng dần theo mỗi vòng.
5. Xem **retaining path**, không chỉ nhìn object count.
6. Sửa reference owner.
7. Chạy lại đúng kịch bản để xác minh.

Đừng kết luận leak chỉ vì memory chưa giảm ngay. GC không bắt buộc chạy tại thời điểm mình mong muốn.

---

## 9. Đọc heap snapshot

Các khái niệm cần biết:

```text
Shallow size  → memory của chính object.
Retained size → memory có thể được giải phóng nếu object này mất.
Retainer      → object/reference đang giữ nó sống.
Distance      → khoảng cách tới GC root.
```

Object có shallow size nhỏ vẫn có thể giữ một graph rất lớn. Vì vậy retaining path và retained size thường hữu ích hơn chỉ đếm instance.

---

## 10. Performance: xác định loại bottleneck

```text
Network-bound:
API chậm, request thừa, payload lớn, waterfall.

CPU-bound:
loop nặng, transform lặp lại, JSON lớn, change detection nhiều.

Rendering-bound:
DOM lớn, layout thrashing, paint/composite tốn kém.

Memory-bound:
heap tăng, GC thường xuyên, cache/listener giữ dữ liệu.
```

Mỗi loại cần công cụ và giải pháp khác nhau.

---

## 11. Đo trước khi tối ưu

Quy trình:

```text
Xác định triệu chứng
→ Tạo kịch bản đo lặp lại được
→ Ghi baseline
→ Tìm bottleneck
→ Thay đổi một yếu tố
→ Đo lại
→ Kiểm tra regression
```

Công cụ browser:

- Network panel: waterfall, payload, cache;
- Performance panel: long task, scripting, rendering;
- Memory panel: heap snapshot, allocation, retaining path;
- Performance Monitor: DOM nodes, listeners, heap;
- Angular DevTools: component/change detection profiling.

---

## 12. Main thread và long task

JavaScript, style calculation, layout và nhiều thao tác render dùng chung main thread. Một task dài làm input và paint bị chậm.

```ts
const result = hugeList.map(expensiveTransform);
```

Các hướng xử lý:

- không tính lại nếu input không đổi;
- giảm lượng dữ liệu;
- phân trang/virtual scroll;
- chia công việc thành chunk;
- đưa tính toán thuần nặng sang Web Worker;
- tối ưu thuật toán trước micro-optimization.

Debounce chỉ giảm tần suất trigger; nó không làm một lần tính toán nặng trở nên rẻ.

---

## 13. Layout thrashing

Trộn đọc layout và ghi style trong loop có thể ép browser layout lặp lại:

```ts
for (const element of elements) {
  const height = element.offsetHeight; // read
  element.style.height = `${height + 10}px`; // write
}
```

Batch reads trước, writes sau:

```ts
const heights = elements.map(element => element.offsetHeight);

elements.forEach((element, index) => {
  element.style.height = `${heights[index] + 10}px`;
});
```

Không tối ưu mù quáng mọi DOM access; hãy xác minh bằng Performance trace.

---

## 14. Memoization và cache

Memoization đổi memory lấy CPU. Nó có lợi khi:

- function đủ đắt;
- cùng input lặp lại;
- key ổn định;
- cache có giới hạn/lifecycle phù hợp.

Nó có thể gây hại khi:

- computation vốn rẻ;
- input gần như luôn mới;
- key là object reference không ổn định;
- cache lớn hơn lợi ích tính toán;
- invalidation không rõ.

Trước khi thêm cache, viết rõ:

```text
Cache cái gì?
Key là gì?
Bao giờ dữ liệu stale?
Ai invalidates?
Giới hạn kích thước?
Scope theo user/tenant nào?
```

---

## 15. Liên hệ với Angular

Các điểm cần quan sát:

- component không bị destroy do route reuse/overlay;
- subscription/listener cleanup theo `DestroyRef`;
- `OnPush` và Signals giảm công việc thừa, nhưng không sửa thuật toán tệ;
- `trackBy`/`track` giữ DOM identity cho list;
- pipe thuần không nên nhận object mới vô ích mỗi cycle;
- cache trong singleton service phải có eviction/logout cleanup;
- virtual scroll cho list lớn thay vì render toàn bộ.

Performance tốt đến từ data flow và ownership rõ trước khi đến các thủ thuật nhỏ.

---

## 16. Quy trình performance investigation

```text
1. Viết triệu chứng theo góc nhìn người dùng.
2. Chọn metric và kịch bản tái hiện.
3. Thu baseline.
4. Khoanh vùng network/CPU/render/memory.
5. Mở trace và tìm phần chiếm thời gian.
6. Thay đổi một nguyên nhân.
7. Đo lại cùng điều kiện.
8. Ghi trade-off và regression risk.
```

---

## 17. Bài thực hành

1. Tạo component đăng ký `window` listener nhưng không cleanup; chứng minh bằng heap snapshot.
2. Sửa một cache tăng vô hạn bằng LRU hoặc TTL có maximum size.
3. Profile list lớn, so sánh render toàn bộ và virtual scroll.
4. Tìm một long task và xác định phần scripting/rendering.
5. Viết báo cáo tối ưu gồm baseline, trace, thay đổi và kết quả sau đo.

---

## 18. Câu hỏi tự kiểm tra

1. Circular reference có tự động là leak không?
2. Retaining path cho biết điều gì?
3. Shallow size khác retained size ra sao?
4. Heap tăng tạm thời khác leak thế nào?
5. Listener giữ component qua những reference nào?
6. Memoization đổi tài nguyên nào lấy tài nguyên nào?
7. Debounce có sửa được một computation nặng không?
8. Vì sao phải đo lại cùng kịch bản?

---

## 19. Checklist hoàn thành

```text
[ ] Giải thích leak bằng retaining path.
[ ] Cleanup listener, timer và long-lived subscription theo owner.
[ ] Cache có giới hạn và invalidation.
[ ] Phân biệt network, CPU, rendering và memory bottleneck.
[ ] Đo baseline trước khi tối ưu.
[ ] Không dùng debounce/memoization như câu trả lời mặc định.
[ ] Xác minh kết quả sau thay đổi.
```
