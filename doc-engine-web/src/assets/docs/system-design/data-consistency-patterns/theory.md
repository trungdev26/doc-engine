# Data Consistency Patterns

Khi hệ thống còn nhỏ, "đúng dữ liệu" thường được hiểu là:

```text
Ghi database thành công.
Transaction commit.
```

Khi hệ thống lớn hơn, một nghiệp vụ có thể chạm vào database, cache, queue, service ngoài, search index, read model, notification và worker nền. Lúc đó câu hỏi không còn là "có transaction không", mà là:

```text
Dữ liệu nào phải đúng ngay?
Dữ liệu nào được phép trễ?
Nếu flow chết giữa chừng thì phục hồi thế nào?
Nếu hai hệ thống lệch nhau thì ai là source of truth?
```

Đây là vùng rất senior: không cố nhét mọi thứ vào một transaction lớn, mà biết chia consistency theo ranh giới nghiệp vụ.

---

## 1. Consistency boundary là gì?

Consistency boundary là phạm vi mà bên trong đó dữ liệu phải nhất quán mạnh tại cùng một thời điểm.

Ví dụ tạo đơn hàng local:

```text
Order
OrderItems
StockTransactions
OutboxMessage
```

Các dữ liệu này nên nằm trong cùng database transaction nếu cùng một service/database sở hữu.

Nhưng các thứ sau không nên bị kéo vào cùng transaction database:

- Gửi email
- Gọi payment gateway
- Gọi service kho khác database
- Publish message trực tiếp
- Update search index
- Xóa cache remote

Với các phần ngoài boundary, ta cần pattern consistency khác: outbox, saga, retry, idempotency, compensation hoặc reconciliation.

---

## 2. Bảng chọn nhanh

| Tình huống | Pattern nên nghĩ tới | Lý do |
|---|---|---|
| Ghi nhiều bảng trong cùng DB | Local transaction | Cần atomic mạnh, rollback được |
| Ghi DB rồi phát event | Transactional outbox | Không mất event sau commit |
| Consumer nhận message trùng | Inbox/idempotent consumer | Broker thường at-least-once |
| Workflow nhiều service | Saga/process manager | Mỗi service có transaction riêng |
| Bước sau lỗi cần hoàn tác | Compensation | Saga không rollback DB xuyên service |
| Không biết payment thành công hay chưa | Unknown state + reconciliation | Không được charge lại mù |
| Cache/read model/search index trễ | Eventual consistency + rebuild | Không cần strong consistency tức thì |
| Dữ liệu giữa hai hệ thống lệch | Reconciliation job | So khớp và sửa sai định kỳ |
| Client cần đọc lại ngay sau khi ghi | Read-after-write strategy | Tránh UX thấy dữ liệu cũ |

---

## 3. Strong consistency

Strong consistency nghĩa là sau khi ghi xong, mọi đọc hợp lệ phải thấy dữ liệu mới hoặc trạng thái đúng theo rule.

Nên dùng cho:

- Số dư tài khoản
- Tồn kho authoritative
- Thanh toán
- Quyền truy cập
- Trạng thái pháp lý/nghiệp vụ quan trọng
- Duyệt/hủy phiếu

Pattern thường dùng:

- Database transaction
- Unique/check/foreign key constraint
- Atomic update
- Optimistic/pessimistic concurrency
- Single writer cho một aggregate/key nóng

Nhược điểm:

- Giảm concurrency nếu lock mạnh.
- Khó scale ngang write path.
- Dễ tạo transaction dài nếu kéo cả side effect vào.
- Tăng độ phức tạp khi dữ liệu nằm ở nhiều service.

Khi không nên dùng strong consistency?

| Case | Vì sao | Dùng gì thay |
|---|---|---|
| Search index | Index trễ vài giây thường chấp nhận được | Eventual consistency + rebuild index |
| Notification/email | Không nên block transaction vì email chậm | Outbox + worker |
| Dashboard thống kê | Có thể trễ ngắn | Read model/materialized view |
| Đồng bộ sang hệ thống ngoài | Hệ thống ngoài không rollback cùng DB | Outbox + retry + reconciliation |

---

## 4. Eventual consistency

Eventual consistency nghĩa là dữ liệu có thể lệch trong một khoảng thời gian, nhưng nếu không có lỗi mới, hệ thống sẽ hội tụ về trạng thái đúng.

Ví dụ:

```text
Order đã Created trong DB.
Search index chưa thấy order ngay.
Notification chưa gửi ngay.
Dashboard chưa tăng số ngay.
```

Điều này có thể ổn nếu nghiệp vụ cho phép.

Điều cần thiết kế rõ:

- Lệch tối đa bao lâu?
- User có thấy trạng thái pending không?
- Nếu worker chết thì retry thế nào?
- Nếu event mất thì rebuild/reconciliation thế nào?
- Ai là source of truth?

Nhược điểm:

- UX có thể thấy dữ liệu cũ.
- Debug khó hơn vì trạng thái phân tán theo thời gian.
- Cần monitoring lag/retry/dead-letter.
- Cần cách rebuild khi read model sai.

Khi không dùng eventual consistency?

| Case | Vì sao | Dùng gì thay |
|---|---|---|
| Check đủ tiền trước khi rút | Không được phép đọc số dư cũ | Strong consistency trong DB owner |
| Permission vừa bị thu hồi | Không nên cho quyền cũ tồn tại lâu | Invalidate cache nhanh hoặc check source of truth |
| Đặt slot cuối cùng | Trễ có thể overbook | Constraint/atomic update/lock |

---

## 5. Transactional Outbox

Outbox giải quyết lỗi kinh điển:

```text
DB commit thành công nhưng publish event fail.
Hoặc publish event thành công nhưng DB rollback.
```

Flow đúng hơn:

```text
Trong transaction:
  ghi dữ liệu nghiệp vụ
  ghi OutboxMessage
Commit

Worker:
  đọc OutboxMessage chưa publish
  publish message
  mark Published
```

SQL ý tưởng:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, Status)
VALUES (@orderId, 'Created');

INSERT INTO OutboxMessages(Id, Type, Payload, Status, CreatedAt)
VALUES (@messageId, 'OrderCreated', @payload, 'Pending', CURRENT_TIMESTAMP);

COMMIT;
```

Outbox đảm bảo:

- Nếu DB commit thì event được lưu.
- Nếu broker lỗi, worker có thể retry.
- Không giữ DB transaction trong lúc gọi broker.

Outbox không đảm bảo:

- Consumer chỉ nhận đúng một lần.
- Event luôn đến ngay lập tức.
- Payload/schema event tự nhiên đúng.

Vì vậy consumer vẫn cần idempotent.

---

## 6. Inbox và idempotent consumer

Nhiều queue/message broker dùng at-least-once delivery:

```text
Message có thể đến ít nhất một lần.
Tức là có thể đến trùng.
```

Consumer không được giả định mỗi message chỉ đến một lần.

Pattern inbox:

```sql
CREATE UNIQUE INDEX UX_ProcessedMessages_MessageId
ON ProcessedMessages(MessageId);
```

Flow:

```text
1. Consumer nhận message.
2. Begin transaction.
3. Insert MessageId vào ProcessedMessages.
4. Nếu unique violation -> message đã xử lý, bỏ qua.
5. Nếu insert thành công -> xử lý nghiệp vụ.
6. Commit.
```

Nhược điểm:

- Tốn bảng lưu processed messages.
- Cần cleanup/retention.
- Cần xác định `MessageId` ổn định.
- Nếu handler có side effect ngoài DB, side effect đó cũng cần idempotent.

Khi không dùng inbox?

| Case | Vì sao | Thay bằng |
|---|---|---|
| Message chỉ cập nhật cache có thể ghi đè | Duplicate không gây hại | Idempotent overwrite |
| Broker đảm bảo exactly-once trong phạm vi hẹp | Có thể giảm inbox | Vẫn cần kiểm tra side effect ngoài broker |
| Consumer chỉ log metrics không critical | Chấp nhận duplicate | Dedup ở analytics nếu cần |

---

## 7. Saga

Saga dùng cho workflow dài qua nhiều service/database, nơi không thể hoặc không nên dùng distributed transaction.

Ví dụ đặt hàng:

```text
1. Create Order
2. Reserve Inventory
3. Charge Payment
4. Confirm Order
```

Mỗi bước có transaction riêng. Nếu bước sau lỗi, hệ thống chạy hành động bù.

```text
Charge Payment lỗi
-> Release Inventory
-> Cancel Order
```

Saga có hai kiểu phổ biến:

| Kiểu | Cách chạy | Khi dùng |
|---|---|---|
| Choreography | Service phát event, service khác tự phản ứng | Flow đơn giản, ít bước |
| Orchestration | Có process manager điều phối trạng thái | Flow dài, nhiều nhánh, cần quan sát rõ |

Nhược điểm:

- Không rollback tức thì như transaction DB.
- Cần state machine rõ.
- Compensation có thể fail, nên cũng cần retry/idempotency.
- Debug khó nếu chỉ dùng event rời rạc không có correlation id.

Khi không dùng saga?

| Case | Vì sao | Thay bằng |
|---|---|---|
| Tất cả ghi trong cùng DB/service | Saga làm phức tạp không cần thiết | Local transaction |
| Cần kết quả mạnh tức thì | Saga có trạng thái trung gian | Strong transaction trong boundary nhỏ hơn |
| Flow chỉ là gửi email sau commit | Saga quá nặng | Outbox + worker |

---

## 8. Compensation

Compensation là hành động bù để đưa nghiệp vụ về trạng thái chấp nhận được khi một bước sau thất bại.

Nó không phải rollback kỹ thuật.

Ví dụ:

| Bước đã làm | Bước sau lỗi | Compensation |
|---|---|---|
| Reserve inventory | Payment failed | Release inventory |
| Charge payment | Create invoice failed | Refund payment hoặc mark manual review |
| Create appointment | Send SMS failed | Retry SMS, không hủy lịch |
| Confirm order | Shipping failed | Mark shipping failed, cho retry |

Điểm senior nằm ở chỗ không phải bước nào cũng compensation giống nhau:

- Có bước rollback được.
- Có bước chỉ bù bằng hành động ngược.
- Có bước phải đưa vào manual review.
- Có bước lỗi nhưng không làm fail nghiệp vụ chính.

Checklist:

1. Bước nào đã có side effect ngoài hệ thống?
2. Side effect đó có undo được không?
3. Nếu undo fail thì trạng thái là gì?
4. Compensation có idempotent không?
5. Có log/audit đủ để xử lý thủ công không?

---

## 9. Reconciliation

Reconciliation là job đối soát để phát hiện và sửa dữ liệu lệch.

Nó là lưới an toàn của distributed system.

Ví dụ payment:

```text
App gọi payment provider.
Network timeout.
Không biết provider đã charge hay chưa.
```

Không được charge lại ngay. Cần:

```text
1. Mark payment = Unknown.
2. Reconciliation job query provider theo PaymentIntentId.
3. Nếu provider báo Success -> mark Success.
4. Nếu provider báo Failed/NotFound -> mark Failed hoặc cho retry theo policy.
```

Reconciliation phù hợp cho:

- Payment/refund
- Đồng bộ trạng thái đơn hàng với đối tác
- Search/read model/cache rebuild
- Đối soát số dư, tồn kho, công nợ
- Event bị kẹt hoặc consumer fail lâu

Nhược điểm:

- Không sửa lỗi ngay tức thì.
- Cần source of truth đáng tin.
- Cần job schedule, retry, dashboard.
- Có thể cần manual review cho trạng thái mơ hồ.

Khi không dùng reconciliation?

| Case | Vì sao | Thay bằng |
|---|---|---|
| Dữ liệu phải đúng trước khi trả success | Đối soát sau là quá muộn | Strong transaction hoặc synchronous verification |
| Không có source of truth bên ngoài để hỏi lại | Không biết đối soát với ai | Audit log + manual review |
| Lỗi nhỏ không ảnh hưởng nghiệp vụ | Job đối soát có thể quá nặng | Monitoring/log cảnh báo đơn giản |

---

## 10. Read model, cache và search index

Read model/cache/search thường không nên là source of truth.

Ví dụ:

```text
DB Order là source of truth.
Redis dashboard là read model nhanh.
Elasticsearch là search index.
Browser cache là bản sao tạm.
```

Khi ghi DB xong, các bản sao này có thể được cập nhật sau bằng event.

Pattern:

```text
Write DB + Outbox
Outbox publish OrderChanged
Consumer update Redis read model
Consumer update search index
Nếu consumer lỗi -> retry/rebuild
```

Điểm cần thiết kế:

- User có cần read-after-write không?
- Read model lệch tối đa bao lâu?
- Có nút refresh/reload từ source of truth không?
- Có job rebuild toàn bộ read model không?
- Có version/timestamp để biết dữ liệu cũ không?

Không nên:

```text
Update DB
Update Redis
Update Elasticsearch
Send notification
Tất cả trong một request/transaction dài
```

Nên tách write path khỏi projection path khi dữ liệu lớn hoặc side effect nhiều.

---

## 11. Read-after-write consistency

Read-after-write nghĩa là user vừa ghi xong thì đọc lại thấy dữ liệu mới của chính họ.

Ví dụ:

```text
User tạo phiếu.
Redirect sang detail.
Detail phải thấy phiếu vừa tạo.
```

Nếu detail đọc từ read replica/cache/read model đang trễ, UX sẽ rất khó chịu.

Các cách xử lý:

| Cách | Khi dùng |
---|---|
| Sau ghi, đọc từ primary/source of truth trong một khoảng ngắn | CRUD quan trọng |
| Trả đủ dữ liệu mới trong response write | UI không cần đọc lại ngay |
| Cache version/session stickiness | User đọc lại bản mới của chính họ |
| Hiển thị trạng thái pending/syncing | Projection async cần thời gian |
| Poll cho tới khi read model bắt kịp | Search/index/read model trễ |

Không phải mọi user đều cần thấy mọi dữ liệu mới ngay, nhưng user tạo/sửa dữ liệu thường cần read-after-write cho chính thao tác của họ.

---

## 12. Case thực tế 1: Payment timeout

Yêu cầu:

- Không charge hai lần.
- Không báo thất bại nếu provider thật ra đã charge thành công.
- User có trạng thái rõ ràng.

Thiết kế:

```text
1. Client gửi IdempotencyKey.
2. Tạo PaymentAttempt với trạng thái Processing.
3. Gọi provider với provider idempotency key.
4. Nếu provider trả Success -> mark Success, ghi Outbox PaymentSucceeded.
5. Nếu provider trả Failed -> mark Failed.
6. Nếu timeout/unknown -> mark Unknown.
7. Reconciliation job query provider.
8. Cập nhật Success/Failed sau đối soát.
```

Pattern đang dùng:

- Idempotency key
- Unknown state
- Reconciliation
- Outbox cho event sau khi payment thành công

Vì sao không chọn pattern khác?

| Không chọn | Lý do |
|---|---|
| Retry charge ngay | Có thể charge hai lần |
| Transaction DB bao quanh provider call | Provider không rollback theo DB |
| Mark Failed khi timeout | Timeout không có nghĩa provider thất bại |

---

## 13. Case thực tế 2: Tạo đơn hàng qua nhiều service

Yêu cầu:

- Order service tạo đơn.
- Inventory service giữ hàng.
- Payment service thu tiền.
- Nếu payment fail thì nhả hàng và hủy đơn.

Thiết kế saga orchestration:

```text
OrderSaga Started
-> Create Order: success
-> Reserve Inventory: success
-> Charge Payment: failed
-> Release Inventory: success
-> Cancel Order: success
-> Saga Failed/Compensated
```

Mỗi bước:

- Có command idempotent.
- Có timeout/retry.
- Có trạng thái riêng.
- Có compensation nếu cần.
- Có correlation id để trace toàn flow.

Vì sao không chọn distributed transaction?

- Coupling mạnh giữa service.
- Chậm và khó vận hành.
- Không phải provider/service nào cũng hỗ trợ.
- Khi một participant treo, toàn flow khó phục hồi.

Saga chấp nhận trạng thái trung gian, nhưng đổi lại hệ thống phục hồi được.

---

## 14. Case thực tế 3: Dashboard hàng chờ khám

Yêu cầu:

- API gọi bệnh nhân phải đúng.
- Dashboard realtime có thể trễ vài giây.
- Nếu WebSocket/Redis lỗi, dữ liệu không được mất.

Thiết kế:

```text
Command gọi bệnh nhân:
  Update QueueTicket trong DB
  Insert Outbox QueuePatientCalled
  Commit

Worker:
  Publish event
  Update Redis read model
  Push WebSocket

Fallback:
  UI reload từ DB nếu read model lỗi
  Rebuild Redis từ DB
```

Pattern đang dùng:

- Strong consistency cho command chính trong DB.
- Outbox để event không mất.
- Eventual consistency cho Redis/WebSocket.
- Rebuild/reconciliation cho read model.

Vì sao không update mọi thứ trong request chính?

- WebSocket/Redis lỗi không nên rollback command gọi bệnh nhân.
- Transaction sẽ dài hơn.
- Khi scale nhiều client, projection nên tách khỏi write path.

---

## 15. Case thực tế 4: Search index bị trễ

Yêu cầu:

- Product vừa tạo có thể chưa search thấy ngay.
- Detail product phải thấy ngay.
- Search index có thể rebuild.

Thiết kế:

```text
Create Product -> ghi DB
Outbox ProductCreated
SearchIndexer consume event -> update Elasticsearch
Nếu indexer fail -> retry
Nếu lệch lâu -> rebuild index từ DB
```

UX:

```text
Sau tạo product, redirect detail đọc DB.
Search có thể hiện sau vài giây.
```

Pattern đang dùng:

- DB là source of truth.
- Search là projection.
- Eventual consistency.
- Rebuild/reconciliation.

Vì sao không dùng strong consistency cho search?

- Search engine không nên nằm trong transaction DB.
- Indexing có thể chậm/lỗi.
- Chặn create product vì search lỗi thường không đáng.

---

## 16. Anti-pattern thường gặp

### 16.1. Transaction xuyên mọi thứ

```text
Begin DB transaction
Update DB
Call payment
Send email
Publish queue
Update cache
Commit
```

Sai vì transaction dài, side effect không rollback, dễ lock/block production.

Thay bằng:

```text
Local transaction ngắn + outbox/saga/job sau commit
```

### 16.2. Publish event trực tiếp rồi hy vọng

```text
Save DB
Publish event
```

Nếu app crash giữa hai bước, hoặc publish xong DB rollback, dữ liệu lệch.

Thay bằng:

```text
Transactional outbox
```

### 16.3. Tin vào exactly-once end-to-end

Exactly-once end-to-end rất khó khi có DB, broker, HTTP, email, payment provider và consumer riêng.

Thực tế thường dùng:

```text
At-least-once delivery + idempotent consumer + reconciliation
```

### 16.4. Không có trạng thái Unknown

Với external provider, timeout không đồng nghĩa failed.

Nếu không có `Unknown`, hệ thống dễ retry nguy hiểm hoặc báo sai cho user.

Thay bằng:

```text
Processing / Unknown / Success / Failed + reconciliation
```

### 16.5. Không có rebuild path

Read model/cache/search index có thể sai.

Nếu không có rebuild path, lỗi nhỏ có thể thành dữ liệu lệch lâu dài.

---

## 17. Checklist thiết kế consistency

Khi thiết kế một workflow production, hỏi:

1. Source of truth là gì?
2. Dữ liệu nào phải strong consistency?
3. Dữ liệu nào được eventual consistency?
4. Consistency boundary nằm ở đâu?
5. Có side effect ngoài database không?
6. Có cần outbox không?
7. Consumer có idempotent không?
8. Có trạng thái `Processing/Unknown/Failed` không?
9. Nếu bước sau fail thì compensation là gì?
10. Nếu compensation fail thì xử lý thế nào?
11. Có reconciliation job không?
12. Có rebuild read model/search/cache không?
13. Có correlation id để trace toàn workflow không?
14. Có metric cho outbox lag, retry, dead-letter không?
15. User nhìn thấy trạng thái pending/trễ như thế nào?

---

## 18. Câu tổng kết

Senior không cố làm mọi thứ consistent ngay bằng một transaction khổng lồ.

Senior chia hệ thống thành các vùng:

```text
Trong boundary nhỏ: strong consistency.
Ra ngoài boundary: eventual consistency có kiểm soát.
Side effect: outbox/inbox.
Workflow dài: saga + compensation.
Trạng thái mơ hồ: unknown + reconciliation.
Read model/cache/search: projection + rebuild.
```

Điểm mấu chốt không phải là thuộc tên pattern. Điểm mấu chốt là biết trả lời:

```text
Nếu hệ thống chết ở đúng dòng này, dữ liệu sẽ ra sao?
Nếu message đến hai lần, consumer có làm sai không?
Nếu provider timeout, mình biết trạng thái cuối bằng cách nào?
Nếu read model lệch, mình rebuild từ đâu?
```

Trả lời được các câu đó, thiết kế bắt đầu có chất production.
