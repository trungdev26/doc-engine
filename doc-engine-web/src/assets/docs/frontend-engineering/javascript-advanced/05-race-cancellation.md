# Race condition, stale data và cancellation

Race condition xảy ra khi kết quả phụ thuộc vào thứ tự hoàn thành của các công việc đồng thời, trong khi thứ tự đó không được đảm bảo. Chương này đi từ khái niệm concurrency đến các policy latest-wins, queue, drop, cancel và retry.

---

## 1. Concurrency không cần nhiều thread

Frontend vẫn có race dù callback JavaScript chạy trên một call stack:

```text
Request A bắt đầu
Request B bắt đầu
Request B hoàn thành và commit
Request A hoàn thành và commit sai dữ liệu cũ
```

Race nằm ở thứ tự **completion/commit**, không cần hai dòng JavaScript ghi memory đúng cùng một nanosecond.

Mỗi async flow nên được nhìn như state machine:

```text
idle
→ running(operationId)
→ success(operationId, data)
→ error(operationId, error)
→ cancelled(operationId)
```

Trước khi commit, kiểm tra operation có còn sở hữu state hay không.

---

## 2. Stale response

Người dùng tìm `"angular"`, sau đó nhanh chóng đổi thành `"rxjs"`:

```text
request A: angular ───────────────► response A
request B: rxjs    ─────► response B
```

Nếu response B về trước rồi response A về sau, A có thể ghi đè UI bằng dữ liệu cũ.

```ts
async function search(keyword: string): Promise<void> {
  const result = await api.search(keyword);
  render(result);
}
```

Code không sai cú pháp, nhưng thiếu rule: **operation nào còn quyền cập nhật UI?**

---

## 3. Phân biệt debounce, throttle và concurrency policy

Debounce/throttle kiểm soát **tần suất bắt đầu** operation:

```text
debounce → đợi input yên rồi mới chạy
throttle → giới hạn số lần chạy trong một khoảng
```

Chúng không tự giải quyết request đã bắt đầu. Search thường cần cả:

```text
debounce input
→ distinct keyword
→ cancel/ignore request cũ
→ chỉ latest result được commit
```

---

## 4. Bốn concurrency policy

```text
Latest wins → search, route params
Queue       → lưu thay đổi cần đúng thứ tự
Parallel    → upload các file độc lập
Drop new    → submit chống double click
```

Chọn policy trước khi chọn Promise helper hoặc RxJS operator.

---

## 5. Ba chiến lược xử lý

### 2.1 Ignore stale result

```ts
let latestRequestId = 0;

async function search(keyword: string): Promise<void> {
  const requestId = ++latestRequestId;
  const result = await api.search(keyword);

  if (requestId !== latestRequestId) {
    return;
  }

  render(result);
}
```

Phù hợp khi operation không hủy được hoặc chi phí hủy không đáng kể. Công việc cũ vẫn chạy, nhưng mất quyền commit kết quả.

### 2.2 Cancel operation cũ

```ts
let currentController: AbortController | undefined;

async function search(keyword: string): Promise<void> {
  currentController?.abort();
  currentController = new AbortController();

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`, {
      signal: currentController.signal,
    });

    render(await response.json());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return;
    }

    throw error;
  }
}
```

Cancellation giúp tiết kiệm tài nguyên nếu API/browser thực sự hỗ trợ. Tuy vậy, hủy ở client không đảm bảo server rollback một side effect đã bắt đầu.

### 2.3 Serialize

Khi operation bắt buộc theo thứ tự:

```ts
let queue = Promise.resolve();

function enqueueSave(command: SaveCommand): Promise<void> {
  const operation = queue.then(() => save(command));
  queue = operation.catch(() => undefined);
  return operation;
}
```

Serialization phù hợp cho thay đổi cần giữ thứ tự. Nó không phù hợp cho search vì người dùng thường chỉ quan tâm kết quả mới nhất.

---

## 6. Cancellation có semantics nghiệp vụ

Không phải operation nào cũng được hủy giống nhau.

| Tình huống | Chiến lược thường phù hợp |
|---|---|
| Search khi keyword đổi | Cancel cũ hoặc ignore stale |
| Load dữ liệu khi route đổi | Cancel/ignore result của route cũ |
| Submit chống double click | Ignore lần bấm mới trong khi đang chạy |
| Auto-save draft | Serialize hoặc latest-wins theo version |
| Thanh toán | Idempotency phía server; không dựa vào cancel client |
| Upload nhiều file | Queue có concurrency và cancel từng file |

`AbortController` giải quyết lifecycle phía client, không thay thế idempotency, transaction hoặc concurrency control phía server.

---

## 7. AbortSignal phải được truyền xuyên call chain

```ts
async function loadOrder(
  orderId: number,
  signal: AbortSignal
): Promise<Order> {
  const response = await fetch(`/api/orders/${orderId}`, { signal });
  return response.json();
}
```

Owner tạo controller; các layer bên dưới nhận signal. Nếu repository tự tạo controller mà không expose quyền cancel, caller không quản lý được lifecycle.

Cancellation nên được xem là một kết quả dự kiến, không phải luôn hiển thị toast lỗi cho người dùng.

---

## 8. Timeout bằng AbortController

```ts
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}
```

Điểm quan trọng:

- timer phải được clear;
- parent listener phải được gỡ;
- timeout và user cancellation có thể cần error message khác nhau;
- operation nhận signal từ owner thay vì tự sống vô hạn.

---

## 9. Retry có điều kiện

Retry không an toàn cho mọi lỗi.

Nên cân nhắc retry:

- network lỗi tạm thời;
- `429` theo `Retry-After`;
- một số `5xx`;
- operation idempotent.

Không retry máy móc:

- validation `400/422`;
- authentication `401` chưa refresh đúng;
- permission `403`;
- conflict cần người dùng xử lý;
- POST tạo side effect không có idempotency key.

```ts
async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isTransient(error) || attempt === maxAttempts) {
        throw error;
      }

      await delay(withJitter(2 ** (attempt - 1) * 250));
    }
  }

  throw lastError;
}
```

Exponential backoff nên có jitter để nhiều client không retry đồng thời.

---

## 10. Versioning và optimistic update

Optimistic UI update trước khi server xác nhận:

```text
UI apply local change
→ send command với version
→ server accept: giữ state
→ server reject/conflict: rollback hoặc refetch
```

Nếu nhiều save chạy đồng thời, response cũ không được rollback thay đổi mới. Cần operation/version ID và snapshot theo từng command.

Client-side latest-wins không giải quyết lost update giữa nhiều người dùng; server cần version/ETag/concurrency token.

---

## 11. Ownership và lifecycle

Mọi async operation quan trọng nên trả lời được:

```text
Ai tạo operation?
Ai có quyền cancel?
Operation còn hợp lệ đến khi nào?
Kết quả nào được quyền commit?
Error được xử lý ở boundary nào?
Cleanup diễn ra ở đâu?
```

Nếu không trả lời được, code thường có race hoặc leak tiềm ẩn.

---

## 12. Liên hệ với RxJS

Các semantics tương ứng:

| Nhu cầu | Operator thường dùng |
|---|---|
| Latest wins, hủy inner stream cũ | `switchMap` |
| Chạy song song | `mergeMap` |
| Giữ đúng thứ tự | `concatMap` |
| Bỏ trigger mới khi đang chạy | `exhaustMap` |

Operator là cách biểu diễn policy concurrency. Không chọn operator vì “quen tay”.

Ví dụ search:

```ts
keyword$
  .pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(keyword =>
      search(keyword).pipe(
        catchError(error => of(toErrorState(error)))
      )
    )
  )
  .subscribe(render);
```

Đặt `catchError` bên trong `switchMap` giúp một request lỗi không làm chết stream keyword bên ngoài.

---

## 13. Quy trình phân tích race

```text
1. Liệt kê mọi trigger có thể xảy ra chồng nhau.
2. Vẽ timeline start/finish/commit.
3. Xác định state/resource dùng chung.
4. Chọn latest, queue, parallel hay drop.
5. Xác định operation nào có quyền commit.
6. Xác định có thể hủy operation thật hay chỉ ignore result.
7. Kiểm tra error, retry và cleanup.
8. Test bằng delay đảo thứ tự response.
```

---

## 14. Bài thực hành

1. Mô phỏng hai request về ngược thứ tự và quan sát stale UI.
2. Sửa lần lượt bằng request ID và AbortController; so sánh trade-off.
3. Viết submit flow chống double click.
4. Viết upload queue chạy tối đa ba file đồng thời và hủy từng file.
5. Thiết kế retry policy cho GET, tạo đơn hàng và thanh toán.
6. Viết lại cùng một flow bằng `switchMap`, `concatMap` và `exhaustMap`, giải thích hành vi khác nhau.

---

## 15. Câu hỏi tự kiểm tra

1. Vì sao ứng dụng single-thread vẫn có race condition?
2. Debounce có ngăn stale response không?
3. Ignore stale khác cancellation ở tài nguyên sử dụng thế nào?
4. Vì sao cancel HTTP phía client không đồng nghĩa rollback server?
5. Search, submit và autosave cần concurrency policy nào?
6. Retry POST cần điều kiện gì để an toàn?
7. `switchMap` và `exhaustMap` biểu diễn hai policy nào?

---

## 16. Checklist hoàn thành

```text
[ ] Nhận ra stale response dù code không có shared-thread truyền thống.
[ ] Chọn được ignore, cancel, serialize hoặc drop.
[ ] Không nhầm client cancellation với server rollback.
[ ] Retry theo loại lỗi và idempotency.
[ ] Operation có owner và lifecycle kết thúc rõ.
[ ] Chọn RxJS flattening operator theo concurrency policy.
```
