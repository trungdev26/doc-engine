# Background Services & Workers

Một request HTTP phù hợp cho việc ngắn và cần phản hồi ngay. Gửi email, export lớn, đồng bộ đối tác, retry thanh toán hay xử lý event cần một lifecycle khác: durable job, worker, retry và khả năng khôi phục.

## 1. Đừng dùng fire-and-forget trong controller

```csharp
_ = _emailSender.SendAsync(command.Email); // sai trong đa số API production
return Accepted();
```

Task có thể bị hủy khi process recycle; exception dễ mất; scoped dependency có thể bị dispose; không retry, không biết job thành công hay chưa. `Task.Run` không biến công việc thành background system.

## 2. Ba mức xử lý nền

| Mức | Dùng khi | Đổi lại |
| --- | --- | --- |
| `BackgroundService` + bounded channel | việc nội bộ, chấp nhận mất khi restart | đơn giản nhưng không durable |
| Bảng jobs trong database | cần audit, retry, trạng thái | cần polling/claim tốt |
| Message broker/job platform | tải lớn, nhiều consumer, cần delivery rõ | hạ tầng và vận hành phức tạp hơn |

Không dùng in-memory queue cho email hóa đơn nếu mất job là vi phạm nghiệp vụ. Dùng durable queue hoặc outbox/job table.

## 3. Bounded queue là backpressure

```csharp
var queue = Channel.CreateBounded<ExportRequest>(new BoundedChannelOptions(100)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleReader = false
});
```

Hàng đợi không giới hạn đổi quá tải thành OutOfMemory. Queue bounded buộc hệ thống chọn chính sách: chờ, từ chối `429/503`, hoặc ghi job xuống storage. Không có lựa chọn nào miễn phí; điều quan trọng là lựa chọn có chủ đích.

## 4. Worker cần claim nguyên tử

Hai instance worker cùng đọc một dòng `Pending` rồi cùng gửi email là lỗi phổ biến. Claim phải là một update có điều kiện hoặc cơ chế lock của broker.

```sql
UPDATE TOP (1) Jobs
SET Status = 'Processing', LockedUntil = DATEADD(minute, 5, SYSUTCDATETIME())
OUTPUT inserted.*
WHERE Status = 'Pending'
  AND NextAttemptAt <= SYSUTCDATETIME();
```

Khi worker chết, lease hết hạn thì worker khác có thể nhận lại. Cần idempotency ở side effect vì job có thể chạy lại sau timeout.

## 5. Retry không phải cứ lặp vô hạn

Retry chỉ áp dụng lỗi transient: network timeout, 429, 503. Dùng exponential backoff + jitter để tránh nhiều worker cùng thử lại đúng một lúc.

```text
attempt 1: ngay
attempt 2: khoảng 2s + jitter
attempt 3: khoảng 10s + jitter
attempt 4: khoảng 1m + jitter
vượt ngưỡng: Failed / dead-letter, alert và cho phép xử lý lại có kiểm soát
```

Không retry validation error, payload sai hoặc 401 do credential hết hạn mà chưa được sửa. Retry kiểu đó chỉ làm queue tắc và che lỗi gốc.

## 6. Graceful shutdown và cancellation

Khi deployment dừng pod/process, worker phải ngừng nhận việc mới, hoàn tất phần an toàn hoặc trả lease. Luôn truyền `stoppingToken`; record trạng thái tiến độ nếu một job dài cần resume.

## 7. Case: gửi thông báo trùng sau deploy

Worker gửi SMS thành công nhưng chết trước khi update job `Completed`. Job được lease lại và gửi lần hai.

Không thể giải quyết hoàn toàn bằng “update trước khi gửi”: nếu update trước rồi process chết, tin nhắn lại mất. Cách đáng tin hơn là gửi `idempotency key` tới provider nếu hỗ trợ, hoặc lưu một delivery key unique tại boundary của hệ thống gửi. Tư duy senior là chấp nhận at-least-once delivery và làm side effect idempotent.

## 8. Observability tối thiểu

- Queue depth, age của job cũ nhất, số retry, dead-letter count.
- Job id, business id, attempt, worker instance trong log.
- Alert theo age/backlog và failure rate, không chỉ CPU/RAM.
- Dashboard phân biệt `Pending`, `Processing`, `Failed`, `Completed`.

## Checklist

1. Job có survive process restart không?
2. Consumer có thể xử lý lặp mà không gây side effect trùng không?
3. Queue có giới hạn và chính sách quá tải không?
4. Retry có phân biệt transient/permanent failure không?
5. Lease timeout, dead-letter và thao tác retry thủ công có rõ không?
6. Deploy dừng worker có làm mất hoặc treo job không?

## Kết luận

Background processing là một hệ thống nhỏ, không phải một `Task.Run`. Khi có durability, idempotency, backpressure và quan sát, nó mới chịu được restart, spike tải và lỗi mạng vốn chắc chắn sẽ đến.

---

## 9. Delivery semantics: đừng hứa exactly-once khi không có cơ sở

| Semantics | Ý nghĩa thực tế | Rủi ro |
| --- | --- | --- |
| At-most-once | không retry sau khi nhận | có thể mất job |
| At-least-once | retry khi không chắc thành công | có thể xử lý trùng |
| Exactly-once | effect chỉ xảy ra một lần | thường chỉ đúng trong boundary rất hẹp |

Trong HTTP, broker và database độc lập, at-least-once + idempotent handler là đích thực tế. Idempotency key phải gắn với business operation, ví dụ `invoice:{invoiceId}:email:v1`, không phải random GUID mới cho mỗi retry.

## 10. Thiết kế job state machine

```text
Pending -> Processing -> Completed
     |        |             
     |        -> Pending (lease hết hạn/transient retry)
     -> Failed (lỗi vĩnh viễn hoặc hết retry budget)
Failed -> Pending (manual retry có audit)
```

Lưu `AttemptCount`, `NextAttemptAt`, `LockedBy`, `LockedUntil`, `LastErrorCode`, `LastErrorAt`, `BusinessId`. Không chỉ lưu một cột `IsDone`: lúc incident bạn cần biết đang mắc ở đâu, có bao nhiêu bản bị kẹt và có retry an toàn không.

## 11. Idempotent consumer bằng inbox/deduplication

Khi nhận message có `MessageId`, ghi inbox record với unique constraint trước khi thực hiện side effect. Nếu insert trùng, consumer kết thúc thành công vì message đã được xử lý.

```text
BEGIN TRANSACTION
  INSERT Inbox(MessageId) -- unique key
  UPDATE Order ...
COMMIT
```

Kỹ thuật này tốt cho state nội bộ cùng database. Nếu side effect là SMS/provider, cần idempotency key ở provider hoặc bảng delivery key tại adapter. Đừng chỉ dùng `ConcurrentDictionary`; restart là mất lịch sử dedup.

## 12. Concurrency: tăng worker có thể làm hệ thống chậm hơn

Nhiều worker hữu ích khi workload I/O-bound và dependency chịu được tải. Nhưng 50 consumer cùng cập nhật một customer/order hoặc cùng gọi provider rate limit thấp sẽ tạo lock contention và retry storm.

Áp dụng concurrency limit toàn cục, limit theo queue và khi cần serialize theo business key. Đo queue age và success latency để quyết định; số worker không phải KPI.

## 13. Case chi tiết: đồng bộ tồn kho sang marketplace

Mỗi lần kho đổi, service phát event. Marketplace chỉ cho 10 request/giây, đôi khi trả 429. Gửi một request cho mọi event khiến cùng một SKU bị cập nhật lộn thứ tự và queue tăng không giới hạn.

Thiết kế tốt: outbox event mang version; worker coalesce các update chưa gửi theo SKU thành trạng thái mới nhất; rate-limit adapter; retry 429 theo `Retry-After`; marketplace nhận idempotency key; reconcile định kỳ so sánh tồn kho nguồn với marketplace. Với màn hình quản trị, hiển thị trạng thái "sync delayed" thay vì giả vờ đã đồng bộ.

## 14. Runbook khi queue tăng

1. Phân loại: producer tăng đột ngột, consumer chậm, dependency down hay job poison.
2. Xem age job cũ nhất trước depth: 1 triệu job mới có thể ít nguy hiểm hơn 100 job treo 6 giờ.
3. Không tăng worker ngay khi dependency 429/timeout; kiểm tra saturation và circuit breaker.
4. Cô lập poison job sang dead letter để phần khỏe tiếp tục chạy.
5. Chỉ replay sau khi xác nhận consumer idempotent và dependency đã ổn.
