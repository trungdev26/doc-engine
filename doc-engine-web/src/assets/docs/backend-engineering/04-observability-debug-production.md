# Observability & Debug Production

Senior backend không chỉ viết code đúng trên máy mình.

Senior phải trả lời được khi production có chuyện:

```text
Lỗi bắt đầu từ khi nào?
Ảnh hưởng bao nhiêu user?
Request nào chậm?
Nó chậm ở app, database, cache, queue hay service ngoài?
Dữ liệu có bị sai không?
Có rollback/retry/reconcile được không?
```

Observability là khả năng nhìn vào hệ thống đang chạy để hiểu nó đang làm gì, vì sao chậm, vì sao lỗi và cần sửa ở đâu.

---

## 1. Logging, monitoring và observability khác nhau thế nào?

| Khái niệm | Mục tiêu | Ví dụ |
|---|---|---|
| Logging | Ghi lại sự kiện cụ thể | Request failed, payment timeout |
| Metrics | Đo xu hướng theo thời gian | Error rate, p95 latency, queue lag |
| Tracing | Theo dấu một request qua nhiều service | API -> DB -> Queue -> Worker |
| Alerting | Báo khi tín hiệu vượt ngưỡng | 5xx > 2%, outbox lag > 5 phút |
| Observability | Từ tín hiệu suy ra nguyên nhân | Timeout do DB lock, không phải API CPU |

Không phải cứ log thật nhiều là observable. Log nhiều nhưng thiếu correlation id, business id, duration và error classification thì vẫn mù.

---

## 2. Ba trụ cột cần có

### 2.1. Logs

Log tốt trả lời:

- Request nào?
- User/tenant nào?
- Business id nào?
- Bước nào fail?
- Lỗi thuộc loại gì?
- Mất bao lâu?
- Có retry không?

Ví dụ log tốt hơn:

```json
{
  "level": "Error",
  "message": "Payment provider timeout",
  "correlationId": "req_abc",
  "paymentId": "pay_123",
  "orderId": "ord_456",
  "provider": "Stripe",
  "attempt": 2,
  "durationMs": 5000,
  "nextState": "Unknown"
}
```

Log kém:

```text
Error payment
```

Log kém không giúp debug, chỉ giúp biết là có chuyện buồn đã xảy ra.

### 2.2. Metrics

Metrics tốt cho biết hệ thống đang khỏe hay đang lệch.

Các metric backend quan trọng:

| Metric | Ý nghĩa |
|---|---|
| Request rate | Lưu lượng vào |
| Error rate | Tỷ lệ lỗi |
| p50/p95/p99 latency | Độ trễ thực tế |
| DB query duration | Query có đang chậm không |
| DB connection pool usage | Có cạn connection không |
| Queue lag | Worker có đuổi kịp không |
| Retry count | Có retry storm không |
| Dead-letter count | Message chết có tăng không |
| Lock timeout/deadlock count | DB concurrency có vấn đề không |
| Cache hit ratio | Cache có còn hiệu quả không |

### 2.3. Traces

Trace cho thấy một request đi qua các bước:

```text
HTTP POST /orders
  -> Validate command: 12ms
  -> Insert Order transaction: 80ms
  -> Insert OutboxMessage: 5ms
  -> Commit: 20ms
  -> Response: 130ms

Worker publish OrderCreated
  -> Load OutboxMessage: 10ms
  -> Publish RabbitMQ: 40ms
  -> Mark Published: 8ms
```

Trace hữu ích nhất khi hệ thống có nhiều service, queue, worker, cache và external call.

---

## 3. Correlation id và business id

Correlation id nối các log của cùng một request/workflow.

Business id nối log với nghiệp vụ thật:

- OrderId
- PaymentId
- PatientId
- AppointmentId
- InvoiceId
- IdempotencyKey
- MessageId

Một request có thể sinh ra nhiều async work sau commit. Cần truyền correlation id qua:

- HTTP header
- Message payload/header
- Background job context
- Outbox message
- Logs của worker

Nếu thiếu correlation id, debug distributed flow giống như nhặt từng mảnh giấy trong gió.

---

## 4. Error classification

Không phải lỗi nào cũng xử lý giống nhau.

| Loại lỗi | Ví dụ | Xử lý |
|---|---|---|
| Validation | Thiếu field, sai format | Trả 400, không retry |
| Business conflict | Hết tồn, version conflict | Trả lỗi nghiệp vụ, không retry mù |
| Permission | Không có quyền | Trả 403, alert nếu bất thường |
| Transient | Network chập chờn, deadlock victim | Retry có backoff nếu idempotent |
| Dependency failure | Payment provider down | Circuit breaker, fallback, Unknown |
| Bug | Null reference, invariant broken | Alert, fix code, có thể rollback |
| Data inconsistency | Order có payment nhưng thiếu invoice | Reconciliation/manual repair |

Sai lầm hay gặp:

```text
Catch mọi exception rồi retry.
```

Retry sai loại lỗi làm hệ thống đau thêm.

---

## 5. Debug API chậm

Khi API chậm, đừng đoán.

Đi theo checklist:

1. Latency tăng ở p50 hay chỉ p95/p99?
2. Tất cả endpoint chậm hay một endpoint?
3. Có tăng request rate không?
4. App CPU/RAM/thread pool thế nào?
5. DB query duration có tăng không?
6. DB lock/blocking có tăng không?
7. Connection pool có cạn không?
8. External dependency có timeout không?
9. Queue/worker có backlog không?
10. Deploy gần nhất thay đổi gì?

Phân biệt:

| Dấu hiệu | Nghi ngờ |
|---|---|
| p95 tăng, p50 ổn | Một phần request bị blocking/dependency chậm |
| Tất cả endpoint chậm | Hạ tầng, CPU, DB pool, network, deploy |
| Chỉ endpoint search chậm | Query/index/payload/filter |
| Write path timeout | Lock, transaction dài, deadlock, connection pool |
| Read path chậm sau deploy | N+1 query, thiếu index, cache miss |

---

## 6. Debug lỗi database production

### 6.1. Query chậm

Kiểm tra:

- Execution plan
- Index dùng thật
- Scan bao nhiêu dòng
- Parameter sniffing
- Implicit conversion
- Sort/hash join lớn
- Payload trả về
- N+1 query từ ORM

### 6.2. Blocking/lock timeout

Kiểm tra:

- Request nào đang chờ lock?
- Ai đang giữ lock?
- Transaction mở bao lâu?
- Query update/delete có index không?
- Có batch/report đang chạy không?
- Có gọi API ngoài trong transaction không?

### 6.3. Deadlock

Không chỉ retry deadlock rồi bỏ qua.

Cần đọc deadlock graph/log:

- Các transaction tham gia là gì?
- Lock resource nào?
- Thứ tự update có ngược nhau không?
- Query nào scan rộng?
- Có thiếu index không?
- Có batch update nhiều dòng không sort key không?

---

## 7. Debug queue và worker

Queue lỗi thường không hiện ngay ở API response.

Metric cần có:

| Metric | Ý nghĩa |
|---|---|
| Queue depth | Bao nhiêu message đang chờ |
| Oldest message age | Message cũ nhất chờ bao lâu |
| Consumer throughput | Worker xử lý kịp không |
| Retry count | Lỗi tạm thời hay bug lặp |
| Dead-letter count | Message không xử lý được |
| Handler duration | Step nào chậm |
| Duplicate message count | Idempotency có đang hoạt động không |

Checklist khi queue lag:

1. Producer tăng đột biến hay consumer chậm?
2. Worker có lỗi liên tục không?
3. Dependency của worker có chậm không?
4. Có message độc làm poison queue không?
5. Có scale worker được không?
6. Handler có idempotent để retry không?
7. Có dead-letter và replay tool không?

---

## 8. Debug cache/read model lệch

Cache và read model nên có cách chứng minh nó lệch.

Cần log/metric:

- Cache hit/miss
- Cache key/version
- Source of truth version
- Read model updated at
- Projection lag
- Rebuild job status

Khi user báo "vừa sửa mà màn hình chưa đổi":

1. Write DB có thành công không?
2. Event/outbox có được tạo không?
3. Worker có publish/update read model không?
4. Cache key có đúng không?
5. UI có đọc cache cũ không?
6. Có read-after-write strategy không?

Pattern xử lý:

- Invalidate sau commit
- Outbox event update read model
- TTL hợp lý
- Versioned cache key
- Rebuild read model từ source of truth

---

## 9. Alert thiết kế sao cho không ồn

Alert tốt phải actionable.

Alert kém:

```text
CPU > 70%
```

Không biết user có bị ảnh hưởng không.

Alert tốt hơn:

```text
Payment success rate giảm dưới 98% trong 5 phút.
Outbox oldest pending message > 10 phút.
API p95 latency > 2s và error rate > 2%.
Dead-letter messages tăng liên tục trong 10 phút.
```

Một alert tốt nên có:

- Impact
- Runbook link hoặc checklist
- Dashboard liên quan
- Owner/team
- Ngưỡng có thời gian, tránh spike ngắn
- Cách xác nhận đã hồi phục

---

## 10. Incident workflow

Khi production có incident, thứ tự ưu tiên:

1. Bảo vệ user và dữ liệu.
2. Giảm blast radius.
3. Khôi phục service.
4. Ghi nhận timeline.
5. Sửa root cause sau khi ổn định.

Trong lúc cháy, tránh:

- Deploy vội nhiều thay đổi cùng lúc.
- Retry thủ công không hiểu idempotency.
- Xóa dữ liệu để "cho hết lỗi".
- Kill blocker mà không hiểu transaction đang làm gì.
- Tắt alert thay vì xử lý nguyên nhân.

Postmortem nên trả lời:

- Điều gì xảy ra?
- User bị ảnh hưởng thế nào?
- Vì sao detection chậm/nhanh?
- Vì sao hệ thống không tự phục hồi?
- Guardrail nào cần thêm?
- Test/monitor/runbook nào thiếu?

---

## 11. Case thực tế 1: API tạo đơn timeout

Triệu chứng:

```text
POST /orders p95 tăng từ 300ms lên 8s.
Một số request timeout.
DB CPU không cao.
```

Không đoán là "server yếu".

Checklist:

1. Trace request cho thấy chậm ở đoạn commit DB.
2. DB wait thấy nhiều lock wait.
3. Blocking query là batch expire order chạy cùng giờ.
4. Batch update thiếu index `(Status, ExpiredAt)`.
5. Batch giữ lock lâu, API tạo đơn chờ.

Fix ngắn hạn:

- Dừng batch hoặc chạy ngoài giờ cao điểm.
- Giảm batch size.
- Tăng timeout không phải fix chính.

Fix dài hạn:

- Thêm index phù hợp.
- Chia batch theo `TOP/LIMIT`.
- Commit từng batch.
- Monitor lock wait và batch duration.

---

## 12. Case thực tế 2: Payment bị charge nhưng order vẫn Pending

Triệu chứng:

```text
User báo bị trừ tiền.
Order trong hệ thống vẫn PendingPayment.
```

Debug:

1. Tìm theo PaymentId/OrderId/CorrelationId.
2. Log cho thấy provider callback timeout khi gọi API.
3. Provider gửi callback lại nhưng consumer xử lý duplicate sai.
4. Outbox không có PaymentSucceeded event.
5. PaymentAttempt bị kẹt `Unknown`.

Fix:

- Chạy reconciliation query provider.
- Mark payment Success nếu provider xác nhận.
- Insert outbox event bổ sung nếu thiếu.
- Đảm bảo callback idempotent bằng provider event id.

Guardrail:

- Metric `payment.unknown.count`.
- Alert Unknown quá 5 phút.
- Inbox/ProcessedMessages cho callback.
- Reconciliation job định kỳ.

---

## 13. Case thực tế 3: Worker gửi thông báo trùng

Triệu chứng:

```text
User nhận 2 SMS giống nhau.
Queue không báo lỗi lớn.
```

Debug:

1. Check message id thấy broker redeliver.
2. Worker gửi SMS xong thì crash trước khi ack/mark sent.
3. Message được xử lý lại.
4. Provider không có idempotency key.

Fix:

- Gửi provider với idempotency/business key nếu hỗ trợ.
- Lưu NotificationDelivery với unique key.
- Handler check đã gửi chưa trước khi gửi lại.

Trade-off:

```text
Nếu không thể đảm bảo provider idempotent, cần chấp nhận retry ít hơn,
hoặc chuyển trạng thái Unknown và reconciliation/manual review cho thông báo nhạy cảm.
```

---

## 14. Case thực tế 4: Dashboard số liệu sai

Triệu chứng:

```text
Dashboard hiển thị 120 bệnh nhân đang chờ.
Query DB thật chỉ có 118.
```

Debug:

1. Dashboard đọc Redis read model.
2. Redis update từ event queue.
3. Có hai event xử lý duplicate nhưng consumer tăng counter thêm lần nữa.
4. Consumer không idempotent.

Fix:

- Consumer update theo state/idempotent thay vì cộng mù.
- Lưu processed event id.
- Rebuild read model từ DB source of truth.

Guardrail:

- Metric read model drift.
- Reconciliation job so sánh Redis summary với DB count.
- Tool rebuild read model.

---

## 15. Log gì ở các điểm quan trọng?

### Command/API ghi dữ liệu

- CorrelationId
- UserId/TenantId
- BusinessId
- IdempotencyKey
- Validation result
- Transaction duration
- Affected rows
- New state
- Outbox event id

### Worker/consumer

- MessageId
- CorrelationId
- Handler name
- Attempt
- Processing duration
- Idempotency decision
- Side effect result
- Retry/dead-letter reason

### External call

- Provider
- Endpoint/action
- Request id/provider id
- Timeout duration
- Response classification
- Next internal state

Không log:

- Password/token/secret
- Full card number
- Sensitive medical/private data nếu không được phép
- Payload lớn không cần thiết

---

## 16. Senior checklist trước khi release

Trước khi đưa một workflow quan trọng lên production:

1. Có correlation id xuyên API, queue, worker không?
2. Log có business id đủ để tìm một case lỗi không?
3. Có metric latency/error/retry/lag không?
4. Có alert cho failure mode quan trọng không?
5. Có phân loại lỗi retry được và không retry được không?
6. Retry có idempotent không?
7. Có outbox/inbox nếu dùng event không?
8. Có dead-letter/replay tool không?
9. Có reconciliation cho trạng thái Unknown không?
10. Có dashboard cho queue lag/outbox lag không?
11. Có runbook khi DB lock/deadlock không?
12. Có cách rebuild cache/read model không?

---

## 17. Câu tổng kết

Observability tốt biến câu hỏi mơ hồ:

```text
Sao hệ thống chậm?
```

thành câu hỏi cụ thể:

```text
Endpoint tạo đơn p95 tăng vì batch expire giữ lock 40 giây trên Orders,
do thiếu index (Status, ExpiredAt), bắt đầu sau deploy job lúc 09:00.
```

Đó là khác biệt rất lớn.

Middle thường sửa lỗi khi tái hiện được trên máy local.

Senior thiết kế hệ thống để khi lỗi chỉ xảy ra ở production, dưới tải thật, với dữ liệu thật, mình vẫn lần được đường đi của nó.
