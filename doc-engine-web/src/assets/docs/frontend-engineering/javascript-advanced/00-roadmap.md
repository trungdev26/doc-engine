# JavaScript chuyên sâu

Một Frontend Middle cần làm được nhiều hơn việc viết code chạy đúng trong happy path:

- giải thích được **vì sao** code chạy theo thứ tự đó;
- nhận diện mutation, stale response, race condition và memory leak;
- chọn đúng chiến lược xử lý bất đồng bộ;
- debug dựa trên cơ chế thay vì sửa thử;
- viết code có ownership, lifecycle và error boundary rõ ràng.

---

## 1. Các năng lực cần đạt

| Chương | Câu hỏi phải trả lời được | Ứng dụng trong Angular |
|---|---|---|
| Runtime, scope, closure | Biến được tìm ở đâu? Closure đang giữ dữ liệu nào? | Callback, factory, interceptor, validator |
| `this`, function, prototype | `this` được quyết định lúc nào? Method nằm ở đâu? | Callback mất context, class/service |
| Reference, immutability | Thay đổi nào tạo reference mới? Copy sâu đến đâu? | `OnPush`, Signals, state update |
| Event loop và async | Vì sao Promise chạy trước timer? Lỗi async đi đâu? | HTTP flow, UI loading, RxJS interop |
| Race condition, cancellation | Response nào được phép cập nhật UI? | Search, route change, submit, upload |
| Memory và performance | Thứ gì còn giữ object sống? Đang tối ưu CPU hay I/O? | Subscription, listener, cache, DOM |

---

## 2. Thứ tự học

```text
Runtime model
  → Scope và closure
  → Reference và mutation
  → Event loop và Promise
  → Race condition và cancellation
  → Memory và performance
```

`this` và prototype có thể học sau closure, nhưng không nên dành quá nhiều thời gian cho các câu đố phỏng vấn không xuất hiện trong production.

---

## 3. Cách học mỗi chương

Mỗi chủ đề đi theo bốn vòng:

1. **Dự đoán:** chưa chạy code, ghi lại kết quả mình nghĩ sẽ xảy ra.
2. **Quan sát:** chạy bằng DevTools hoặc Node và so sánh kết quả.
3. **Giải thích:** dùng call stack, scope, queue hoặc reference để giải thích.
4. **Áp dụng:** tìm một tình huống tương tự trong Angular.

Ví dụ với async:

```ts
console.log('A');

setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));

console.log('D');
```

Không chỉ ghi đáp án `A D C B`. Phải giải thích được:

- đoạn script hiện tại là một task;
- callback Promise được đưa vào microtask queue;
- callback timer được đưa vào task queue;
- khi call stack rỗng, runtime drain microtask trước khi lấy task tiếp theo.

---

## 4. Những phần chưa cần đào sâu

Trước level Middle, chưa cần ưu tiên:

- bytecode và chi tiết từng tier của JIT compiler;
- tự cài đặt Promise hoàn chỉnh theo ECMAScript specification;
- proxy/metaprogramming phức tạp;
- type coercion puzzle chỉ phục vụ phỏng vấn;
- tối ưu micro-benchmark không đại diện cho ứng dụng thật.

Chỉ mở rộng các phần trên khi một vấn đề thực tế yêu cầu.

---

## 5. Bài đánh giá cuối phần

Hoàn thành một màn hình tìm kiếm có các yêu cầu:

- debounce input;
- hủy request cũ khi keyword đổi;
- response cũ không được ghi đè response mới;
- phân biệt loading ban đầu và loading khi tìm lại;
- error của một request không làm luồng tìm kiếm chết;
- khi rời màn hình, listener và công việc nền được dọn dẹp;
- state update không mutate object đang được dùng;
- giải thích được toàn bộ lifecycle bằng sơ đồ hoặc lời.

### Definition of Done

Bạn đạt mục tiêu phần này khi:

- dự đoán đúng phần lớn bài event loop phổ biến;
- không nhầm shallow copy với deep copy;
- biết closure nào đang giữ state;
- mọi async operation quan trọng đều có ownership;
- biết khi nào ignore stale result, khi nào cancel operation;
- dùng Memory/Performance DevTools để xác minh thay vì đoán;
- liên hệ được kiến thức JavaScript với Angular/RxJS.

---

## 6. Checklist tự đánh giá

```text
[ ] Tôi giải thích được lexical scope và closure bằng một use case production.
[ ] Tôi biết `this` của regular function và arrow function khác nhau ở đâu.
[ ] Tôi nhận ra mutation lồng sâu dù object ngoài đã dùng spread.
[ ] Tôi phân biệt call stack, microtask queue và task queue.
[ ] Tôi xử lý error ở đúng boundary của async flow.
[ ] Tôi có chiến lược chống stale response.
[ ] Tôi biết lifecycle kết thúc của listener, timer, subscription và cache.
[ ] Tôi chỉ tối ưu sau khi đã đo.
```
