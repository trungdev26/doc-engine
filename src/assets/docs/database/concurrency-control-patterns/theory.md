# Concurrency Control Patterns

**Concurrency control pattern** là cách phối hợp câu SQL, constraint, transaction, version, lock, queue và idempotency để tạo một kết quả xác định khi nhiều operation cùng tác động dữ liệu.

Một pattern luôn bắt đầu từ **business invariant**: điều kiện nghiệp vụ phải đúng trước và sau mỗi thay đổi đã commit, chẳng hạn tồn kho không âm hoặc một email không được trùng trong cùng tenant. **Failure window** là khoảng giữa các operation mà tại đó lỗi, timeout hoặc một request cạnh tranh có thể khiến invariant bị vi phạm hay khiến caller không biết operation đã thành công chưa.

Các bài trước đã thiết lập ba lớp nền tảng:

- [Transaction](/database/transactions/theory) xác định những write phải cùng commit hoặc rollback.
- [Transaction Isolation](/database/isolation-levels/theory) xác định interleaving nào có thể làm kết quả sai.
- [Locking, Blocking và Deadlock](/database/locking-deadlock/theory) giải thích engine giữ và chờ resource tranh chấp như thế nào.

Application vẫn phải chọn cách xử lý cho từng failure window. Một business key không được trùng cần cơ chế khác với form bị sửa đồng thời. Một product nóng có contention cao cần cách tiếp cận khác với một hồ sơ hiếm khi conflict.

Bài này trả lời một câu hỏi trung tâm:

```text
Với failure window hiện tại, nên chặn, chờ, phát hiện conflict, tuần tự hóa hay deduplicate ở đâu?
```

---

## 1. Concurrency control inputs

Không bắt đầu bằng câu hỏi “có cần lock không?”. Lock chỉ là một cơ chế trong nhiều lựa chọn.

### 1.1. Business invariant

Mỗi pattern phải gắn với một điều kiện kiểm chứng được:

| Điều kiện dữ liệu | Failure window |
|---|---|
| Email không trùng trong tenant | Hai request cùng kiểm tra rồi insert |
| Stock không nhỏ hơn `0` | Nhiều request cùng trừ một số lượng |
| Không ghi đè phiên bản người khác | Hai người cùng sửa một hồ sơ |
| Một payment request không charge hai lần | Client retry sau timeout |
| Một job chỉ có một owner tại một thời điểm | Nhiều worker cùng đọc trạng thái `Pending` |
| `OrderCreated` không mất sau commit | Process dừng giữa database và broker |

Nếu rule chưa được viết thành điều kiện có thể quan sát, việc chọn pattern chỉ dựa trên cảm giác.

### 1.2. Conflict location

Xung đột có thể nằm ở những nơi khác nhau:

| Vị trí | Ví dụ |
|---|---|
| Một business key | Email, mã đơn, idempotency key |
| Một row | Stock, balance, trạng thái đơn |
| Một phiên bản row | Hồ sơ chỉnh sửa lâu trên UI |
| Một khoảng dữ liệu | Booking chồng thời gian |
| Một hot key | Voucher flash sale, product cuối |
| Ranh giới database–broker | Commit thành công nhưng publish thất bại |

Vị trí xung đột quyết định database có thể dùng constraint hoặc một câu atomic write, hay application cần phối hợp nhiều bước.

### 1.3. Conflict rate và caller behavior

**Conflict rate** là tần suất hai hoặc nhiều operation cạnh tranh cùng resource hoặc cùng invariant trong một khoảng tải xác định. Tần suất này quyết định application nên phát hiện conflict sau khi nó xảy ra hay chủ động tuần tự hóa operation trước khi ghi.

| Câu hỏi | Ý nghĩa thiết kế |
|---|---|
| Conflict hiếm hay thường xuyên? | Optimistic conflict phù hợp hơn khi conflict hiếm |
| Caller có thể reload hoặc merge không? | Form edit có thể báo version conflict |
| Caller cần kết quả đồng bộ không? | Queue có thể không phù hợp với response tức thời |
| Operation có retry an toàn không? | Deadlock, timeout và duplicate delivery cần idempotency |
| Có thể biểu diễn rule trong một statement không? | Atomic update thường đơn giản hơn lock nhiều bước |

Sau khi xác định rule, vị trí và conflict rate, chọn cơ chế nhỏ nhất bảo vệ đúng failure window.

---

## 2. Unique Constraint

**Unique constraint** là rule ở schema buộc một giá trị hoặc tổ hợp giá trị chỉ xuất hiện một lần trong phạm vi được khai báo. Hai request có thể cùng vượt qua lần kiểm tra “chưa tồn tại”, nhưng constraint vẫn phân xử tại thời điểm ghi: một request thành công và request còn lại nhận unique violation.

### 2.1. Check-then-insert race

```sql
SELECT COUNT(*)
FROM Users
WHERE TenantId = @tenantId
  AND Email = @email;

-- Nếu chưa có thì insert.
INSERT INTO Users(TenantId, Email)
VALUES (@tenantId, @email);
```

Interleaving nguy hiểm:

```text
A SELECT → chưa có
B SELECT → chưa có
A INSERT
B INSERT
```

Application check cải thiện thông báo lỗi trong luồng không conflict. Nó không bảo vệ khoảng thời gian giữa check và insert.

### 2.2. Constraint arbitration

```sql
CREATE UNIQUE INDEX UX_Users_Tenant_Email
ON Users(TenantId, Email);
```

```text
A INSERT → thành công
B INSERT → unique violation
```

Database quyết định một request thắng. Application map unique violation sang conflict nghiệp vụ phù hợp.

### 2.3. Unique Constraint scope

Phù hợp với rule có thể biểu diễn bằng key hoặc index:

- Email trong tenant.
- Mã đơn hàng.
- Idempotency key.
- Một slot rời rạc `(RoomId, SlotStart)`.
- Processed message ID.

Không đủ cho khoảng thời gian chồng lấn tự do:

```text
09:00–10:00
09:30–10:30
```

Hai interval khác key nhưng vẫn overlap. Có thể cần exclusion constraint, mô hình slot, `Serializable` hoặc resource claim phù hợp.

Unique constraint bảo vệ duplicate theo key. Retry cùng một logical command còn cần trả lại đúng kết quả cũ, không chỉ từ chối lần gọi thứ hai.

---

## 3. Idempotency Key

**Idempotency** là thuộc tính cho phép cùng một logical operation được gửi lại mà không tạo thêm business effect. **Idempotency key** là identifier ổn định do caller cung cấp để server nhận ra các lần gửi thuộc cùng operation và trả lại kết quả đã lưu thay vì thực thi lại.

### 3.1. Ambiguous response

```text
Client gửi CreatePayment
→ server commit payment
→ response bị mất
→ client timeout và retry
```

Không có idempotency, retry có thể tạo payment hoặc charge lần hai.

### 3.2. Idempotency record

Một idempotency record cần nhiều hơn unique key:

| Field | Vai trò |
|---|---|
| `IdempotencyKey` | Nhận diện logical request |
| `RequestHash` | Phát hiện cùng key nhưng payload khác |
| `Status` | Processing, completed hoặc failed theo policy |
| `ResourceId` | Entity đã tạo |
| `Response` | Kết quả có thể trả lại khi retry |
| `ExpiresAt` | Chính sách lưu key nếu có |

Constraint bảo vệ key:

```sql
CREATE UNIQUE INDEX UX_RequestDeduplications_Key
ON RequestDeduplications(IdempotencyKey);
```

### 3.3. Request replay flow

```text
Request mới với key K
→ claim K trong transaction
→ xử lý command
→ lưu ResourceId và response
→ COMMIT

Retry cùng K và cùng RequestHash
→ đọc kết quả cũ
→ không chạy business effect lần hai

Cùng K nhưng RequestHash khác
→ từ chối tái sử dụng key sai
```

Nếu request đầu đang `Processing`, API cần policy rõ: trả trạng thái đang xử lý, chờ, hoặc fail nhanh.

### 3.4. Idempotency và transaction boundary

Idempotency ngăn logical request chạy lặp. Nó không bảo đảm các write trong một attempt cùng commit. Record idempotency và business write phải có boundary phù hợp.

Operation đọc thuần không cần idempotency key. Message consumer nhận duplicate thường dùng Inbox hoặc processed-message key thay vì API idempotency record.

---

## 4. Atomic Conditional Update

Khi rule có thể biểu diễn trong một câu write, atomic conditional update loại bỏ khoảng trống giữa read, check và update.

### 4.1. Read–Modify–Write race

```text
A đọc Stock = 10
B đọc Stock = 10
A tính 8 và ghi 8
B tính 7 và ghi 7
```

Update của A bị mất.

### 4.2. Predicate trong write

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Database đánh giá điều kiện tại write path:

```text
A atomic update: 10 → 8
B atomic update: 8 → 5
```

Nếu B cần mua `9` sau khi A đã trừ:

```text
Stock hiện tại = 8
8 >= 9 là false
→ affected rows = 0
→ không update
```

### 4.3. Affected Rows là contract

| Affected rows | Kết quả |
|---:|---|
| `1` | Điều kiện đạt và update thành công |
| `0` | Row không tồn tại hoặc state không còn hợp lệ |

Application không được xem `0 row` là thành công im lặng.

### 4.4. Atomic state transition

Cùng pattern áp dụng cho trạng thái:

```sql
UPDATE Orders
SET Status = 'Approved',
    ApprovedBy = @userId,
    ApprovedAt = CURRENT_TIMESTAMP
WHERE Id = @orderId
  AND Status = 'Draft';
```

Chỉ một request thắng transition `Draft → Approved`.

### 4.5. Giới hạn

Atomic update phù hợp khi rule nằm gọn trong `WHERE` và expression update. Nếu quyết định cần nhiều row, nhiều bảng hoặc logic phức tạp, application có thể cần transaction cùng optimistic/pessimistic control.

Một hot row vẫn có thể trở thành throughput bottleneck dù câu write đúng. Khi contention rất cao, queue theo key có thể phù hợp hơn.

---

## 5. Optimistic Concurrency

Optimistic concurrency cho nhiều caller đọc mà không giữ lock dài. Conflict được phát hiện khi ghi bằng version đã đọc trước đó.

### 5.1. Long-lived edit

```text
A mở Patient version 5
B mở Patient version 5
A lưu → version 6
B lưu với expected version 5
```

Nếu B update không kiểm tra version, thay đổi của A có thể bị ghi đè.

### 5.2. Version check

```sql
UPDATE Patients
SET FullName = @fullName,
    PhoneNumber = @phoneNumber,
    Version = Version + 1
WHERE Id = @id
  AND Version = @expectedVersion;
```

| Affected rows | Ý nghĩa |
|---:|---|
| `1` | Row vẫn ở version caller đã đọc |
| `0` | Row đã đổi hoặc không tồn tại |

Version phải tăng atomically trong database.

### 5.3. Conflict handling

Khi conflict xảy ra, application phải chọn contract:

- Reload và yêu cầu nhập lại.
- Hiển thị diff để merge.
- Cho ghi đè có quyền và audit rõ.
- Retry tự động nếu operation thuần và không làm mất ý định người dùng.

Không retry form update mù bằng cách đọc version mới rồi áp payload cũ. Payload có thể ghi đè thay đổi mà caller chưa nhìn thấy.

### 5.4. Applicability

- Conflict tương đối hiếm.
- User giữ form lâu.
- Không muốn giữ database lock trong lúc user thao tác.
- UX có thể hiển thị conflict.

Khi conflict xảy ra liên tục hoặc mỗi conflict rất đắt, phát hiện muộn tạo nhiều công việc bỏ đi. Pessimistic locking hoặc tuần tự hóa theo key có thể phù hợp hơn.

---

## 6. Pessimistic Locking

Pessimistic locking giữ quyền cập nhật trước khi transaction hoàn tất nhiều bước đọc và ghi.

### 6.1. Locking flow

PostgreSQL:

```sql
BEGIN;

SELECT StockQuantity
FROM Products
WHERE Id = @productId
FOR UPDATE;

-- Đọc thêm dữ liệu và quyết định trong transaction ngắn.

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

SQL Server có thể dùng `UPDLOCK` có chủ đích:

```sql
BEGIN TRANSACTION;

SELECT StockQuantity
FROM Products WITH (UPDLOCK)
WHERE Id = @productId;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

Lock internals, compatibility và deadlock nằm trong [Locking, Blocking và Deadlock](/database/locking-deadlock/theory).

### 6.2. Applicability

- Conflict cao.
- Quyết định cần nhiều statement trong transaction ngắn.
- Không muốn nhiều caller làm công việc rồi conflict ở cuối.
- Chi phí chờ thấp hơn chi phí retry.

### 6.3. Locking costs

- Caller khác phải chờ.
- Transaction dài làm blocking kéo dài.
- Thứ tự resource không nhất quán tạo deadlock.
- Query thiếu index làm lock footprint rộng.

Không giữ pessimistic lock trong lúc user nhập form, gọi payment, gửi email hoặc upload file.

### 6.4. Atomic Update trước Pessimistic Lock

Nếu rule có thể biểu diễn bằng một conditional update, ưu tiên statement atomic. Pessimistic lock chỉ cần khi decision không thể nằm gọn trong write path.

---

## 7. Hot-key Serialization

**Queue theo hot key** là cách đưa các command tác động cùng một key vào cùng luồng xử lý tuần tự, trong khi command của key khác vẫn có thể chạy song song. Một row cực nóng vốn đã tuần tự hóa writer tại database; khi hàng nghìn request cùng tranh chấp một product hoặc voucher, blocking và retry có thể làm database thành điểm nghẽn.

### 7.1. Keyed serialization

```text
Request
→ ghi command
→ partition theo ProductId hoặc CampaignId
→ một worker logic xử lý tuần tự mỗi key
```

Các key khác vẫn chạy song song. Chỉ key nóng được tuần tự hóa.

### 7.2. Trade-offs

Ưu điểm:

- Giảm writer contention trực tiếp.
- Kiểm soát throughput theo key.
- Retry theo command.

Chi phí:

- Kết quả chuyển sang trạng thái pending.
- Cần queue, worker, retry và monitoring lag.
- Handler phải idempotent.
- Partition key sai có thể làm mất ordering cần thiết hoặc tạo hotspot mới.

Không dùng queue khi throughput thấp, conflict hiếm và caller cần response đồng bộ ngay. Atomic update thường đơn giản hơn.

---

## 8. Worker Job Claiming

**Atomic claim** là một write chỉ chuyển job từ trạng thái có thể nhận sang trạng thái đã có owner khi điều kiện nhận việc vẫn còn đúng. Nhiều worker có thể cùng tìm thấy job `Pending`, nhưng affected-row result chỉ cho phép worker thắng claim tiếp tục xử lý.

### 8.1. Claim race

```sql
SELECT Id
FROM Jobs
WHERE Status = 'Pending'
ORDER BY CreatedAt
LIMIT 1;

-- Sau đó mới UPDATE Processing.
```

A và B có thể cùng đọc một job trước khi ai update.

### 8.2. Conditional claim

```sql
UPDATE Jobs
SET Status = 'Processing',
    WorkerId = @workerId,
    StartedAt = CURRENT_TIMESTAMP
WHERE Id = @jobId
  AND Status = 'Pending';
```

```text
1 row → worker claim thành công
0 row → worker khác đã claim hoặc job không còn Pending
```

### 8.3. SKIP LOCKED

Một số engine hỗ trợ worker pool bỏ qua row đang bị lock. PostgreSQL:

```sql
SELECT Id
FROM Jobs
WHERE Status = 'Pending'
ORDER BY CreatedAt
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

Pattern vẫn cần transaction ngắn để claim, index cho predicate/order và handler idempotent.

### 8.4. Abandoned job recovery

Worker có thể chết sau khi chuyển `Processing`. Cần lease hoặc timeout:

```text
Processing quá deadline
→ xác minh owner/heartbeat
→ trả job về Pending hoặc tạo retry attempt
```

Timeout recovery có thể làm job chạy lại khi worker cũ vẫn sống chậm. Business effect phải chống duplicate.

---

## 9. Transactional Outbox và Inbox

**Transactional Outbox** là pattern lưu business write và bản ghi mô tả message cần phát trong cùng một database transaction. Một relay độc lập đọc bản ghi đó và publish sang broker, vì vậy publish có thể retry mà không làm mất intent sau commit.

**Inbox** là bản ghi ở phía consumer dùng `MessageId` để nhận ra message đã xử lý. Nó ngăn một message được giao lại tạo business effect lần hai.

Hai pattern cần phối hợp vì database commit và message broker không dùng chung local transaction.

### 9.1. Dual-write failure windows

Publish trước commit:

```text
Publish OrderCreated
→ database rollback
→ consumer nhận event cho Order không tồn tại
```

Commit trước publish:

```text
COMMIT Order
→ process dừng
→ OrderCreated bị mất
```

### 9.2. Outbox write

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OutboxMessages(Id, Type, AggregateId, Payload, CreatedAt)
VALUES (
  @messageId,
  'OrderCreated',
  @orderId,
  @payload,
  CURRENT_TIMESTAMP
);

COMMIT;
```

Order và intent cùng durable.

### 9.3. Relay

```text
Đọc OutboxMessage chưa processed
→ publish
→ đánh dấu processed
→ retry khi outcome chưa rõ
```

Publish thành công rồi crash trước khi đánh dấu tạo duplicate. Outbox cung cấp at-least-once recovery, không exactly-once end-to-end.

### 9.4. Inbox và idempotent consumer

Consumer lưu `MessageId` cùng business write:

```sql
BEGIN TRANSACTION;

INSERT INTO InboxMessages(MessageId, ProcessedAt)
VALUES (@messageId, CURRENT_TIMESTAMP);

-- Unique MessageId.
-- Business update.

COMMIT;
```

Duplicate message không áp dụng effect lần hai.

### 9.5. Applicability

Không có side effect ngoài database thì Outbox là thừa. Event best-effort không quan trọng có thể publish sau commit với log nếu chấp nhận mất. Yêu cầu cần response đồng bộ từ service ngoài có thể cần workflow hoặc Saga khác, không nên ép Outbox thành request–response.

---

## 10. Pattern selection matrix

| Failure window | Pattern ưu tiên | Kết quả conflict |
|---|---|---|
| Hai request insert cùng business key | Unique constraint | Một insert thắng, một unique conflict |
| Client retry command | Idempotency key | Trả lại kết quả cũ hoặc trạng thái đang xử lý |
| Trừ số lượng hoặc đổi trạng thái một row | Atomic conditional update | `affected rows = 0` khi state không còn hợp lệ |
| Form edit dài, conflict hiếm | Optimistic version | Báo version conflict khi ghi |
| Multi-step decision ngắn, conflict cao | Pessimistic lock | Caller khác chờ |
| Một key quá nóng | Queue theo key | Command xử lý tuần tự/pending |
| Nhiều worker lấy job | Atomic claim / `SKIP LOCKED` | Một worker có ownership |
| Commit database và publish event | Outbox/Inbox | At-least-once, consumer deduplicate |

### 10.1. Selection priority

```text
Constraint có giải được không?
→ Atomic statement có giải được không?
→ Optimistic conflict có chấp nhận được không?
→ Cần pessimistic lock ngắn không?
→ Key quá nóng có cần queue không?
→ Có side effect ngoài database cần Outbox không?
```

Không chọn pattern vì nó “mạnh” hơn. Chọn cơ chế nhỏ nhất bảo vệ đúng failure window và có contract conflict rõ.

---

## 11. Case study: tạo đơn và trừ kho

Use case kết hợp nhiều pattern nhưng mỗi pattern bảo vệ một failure window riêng.

### 11.1. Business invariants

```text
Client retry không tạo trùng Order
Stock không nhỏ hơn 0
Order, items và stock movement cùng commit
OrderCreated không mất sau commit
Nhiều product được cập nhật theo thứ tự nhất quán
```

### 11.2. Execution flow

```text
IdempotencyKey
→ BEGIN
→ claim key bằng unique constraint
→ Insert Order và OrderItems
→ sort ProductId
→ atomic conditional update từng Stock row
→ Insert StockTransactions
→ Insert OutboxMessage
→ COMMIT
→ relay publish
```

### 11.3. Responsibility mapping

| Pattern | Failure window được bảo vệ |
|---|---|
| Idempotency key | Client retry sau timeout |
| Unique constraint | Hai request claim cùng key |
| Atomic update | Hai request cùng trừ kho |
| Sort ProductId | Giảm lock-order deadlock |
| Transaction | Các write local cùng commit |
| Outbox | Process dừng sau database commit |
| Inbox | Consumer nhận duplicate message |

Không có một pattern duy nhất thay thế toàn bộ nhóm.

---

## 12. Case study: chỉnh sửa hồ sơ đồng thời

Hai người có thể giữ form trong nhiều phút. Không thể giữ database lock trong suốt thời gian đó.

### 12.1. Optimistic concurrency flow

```text
A đọc Version = 5
B đọc Version = 5
A lưu thành Version = 6
B lưu expected Version = 5
→ affected rows = 0
```

API trả conflict cùng version mới. UI quyết định reload hoặc merge.

### 12.2. Explicit conflict handling

Update không điều kiện làm người lưu sau ghi đè người lưu trước. Nếu nghiệp vụ thật sự chọn Last Write Wins, quyết định đó phải có chủ đích và audit được, không phải hậu quả của việc quên version check.

---

## 13. Case study: booking overlap

Booking slot rời rạc có thể dùng unique constraint:

```sql
CREATE UNIQUE INDEX UX_Bookings_Room_Slot
ON Bookings(RoomId, SlotStart);
```

Interval tự do không được bảo vệ chỉ bằng unique start time. Lựa chọn phụ thuộc engine và model:

- Exclusion constraint.
- Slot normalization.
- Serializable.
- Explicit range/resource lock.

Optimistic version trên booking row không bảo vệ row chưa tồn tại.

---

## 14. Concurrency control anti-patterns

### 14.1. Serializable cho mọi use case

Serializable mạnh nhưng có thể tăng blocking hoặc serialization failure. Không bật toàn hệ thống để thay unique constraint hoặc atomic update cục bộ.

### 14.2. Pessimistic Lock trong External Call

Giữ lock khi gọi payment, email hoặc upload kéo dài transaction và tăng deadlock window. Commit local state rồi dùng workflow phù hợp cho side effect.

### 14.3. Retry không Idempotent

Retry command tạo dữ liệu mà không có key hoặc unique protection có thể nhân đôi effect. Chỉ retry lỗi đã phân loại, giới hạn attempt và có backoff.

### 14.4. Distributed Lock quá sớm

Trước Redis/ZooKeeper/etcd lock, kiểm tra database constraint, atomic update, optimistic version hoặc queue theo key. Distributed lock thêm lease, fencing, partition và recovery problem.

### 14.5. Atomic Update quá phức tạp

Nhồi nhiều business rule và nhiều bảng vào một câu SQL khó đọc có thể làm test và maintenance kém. Khi decision thật sự nhiều bước, dùng transaction ngắn cùng concurrency control phù hợp.

---

## 15. Checklist chọn Pattern

```text
[ ] Điều kiện dữ liệu cần giữ là gì?
[ ] Conflict nằm trên key, row, version, range hay external boundary?
[ ] Conflict xảy ra hiếm hay thường xuyên?
[ ] Caller có thể chờ, reload, merge hoặc nhận trạng thái pending không?
[ ] Constraint có giải được không?
[ ] Atomic statement có giải được không?
[ ] Affected rows = 0 có contract rõ không?
[ ] Optimistic version có phù hợp UX không?
[ ] Pessimistic lock có giữ transaction đủ ngắn không?
[ ] Hot key có cần queue không?
[ ] Retry có idempotent không?
[ ] Side effect có cần Outbox/Inbox không?
[ ] Có concurrency test kiểm tra trạng thái cuối không?
```

---

## 16. Tóm tắt

Concurrency Control Patterns trả lời câu hỏi:

```text
Với failure window này, application nên chọn cơ chế nào?
```

```text
Duplicate key      → Unique constraint
Request retry      → Idempotency key
Counter/state      → Atomic conditional update
Long-lived edit    → Optimistic concurrency
Hot multi-step row → Pessimistic lock
Hot key            → Queue theo key
Worker ownership   → Atomic claim
DB + message       → Outbox/Inbox
```

Pattern là lớp quyết định của application. [MySQL InnoDB Concurrency Internals](/database/mysql-innodb-concurrency/theory) tiếp tục bằng cách áp dụng các quyết định này lên behavior cụ thể của InnoDB.
