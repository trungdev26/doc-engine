# MySQL InnoDB Concurrency Internals

**Storage engine** là thành phần của MySQL chịu trách nhiệm lưu row, quản lý index, thực thi transaction và phối hợp truy cập đồng thời. **InnoDB concurrency internals** là các cơ chế bên trong storage engine InnoDB dùng để quyết định một read nhìn thấy phiên bản dữ liệu nào, một write phải giữ lock nào và transaction phải chờ hoặc bị hủy khi nào.

Các bài trước đã định nghĩa transaction, isolation contract, lock và concurrency pattern theo cách không phụ thuộc engine. Bài này nối từng contract đó với behavior cụ thể của InnoDB; các thuật ngữ như Read View, record lock, gap lock và undo được định nghĩa tại section sở hữu chúng trước khi áp dụng vào SQL.

Bài này không định nghĩa lại Lost Update, Pessimistic Lock hoặc Deadlock. Nó trả lời câu hỏi:

```text
MySQL/InnoDB hiện thực isolation, MVCC và locking cụ thể như thế nào?
```

> **Phạm vi:** Behavior mô tả InnoDB trong MySQL 8.x theo cấu hình phổ biến. Production phải kiểm tra engine, version, session isolation, index và execution plan thực tế.

---

## 1. Session isolation

**Session** là context gắn với một database connection, giữ các thiết lập ảnh hưởng đến những statement chạy trên connection đó. Session isolation là isolation level có hiệu lực mặc định cho transaction được mở trên session. InnoDB thường dùng `REPEATABLE READ`, nhưng server, connection pool hoặc transaction có thể thay đổi level này.

### 1.1. Effective isolation level

```sql
SELECT @@GLOBAL.transaction_isolation,
       @@SESSION.transaction_isolation;
```

Global value là default cho session mới. Session value mới quyết định transaction hiện tại nếu application không override ở mức transaction.

Không suy isolation từ:

- Default ghi trong tài liệu.
- Connection string mẫu.
- Isolation của một connection khác.
- Cấu hình global khi pool đã giữ session cũ.

### 1.2. Session-level override

Có thể đặt cho session hoặc transaction theo syntax MySQL tương ứng:

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

Connection pool tái sử dụng physical connection. Application và driver phải reset session state đúng cách, nếu không một request có thể nhận isolation do request trước để lại.

### 1.3. Default isolation và business invariants

`REPEATABLE READ` không tự bảo vệ mọi read–modify–write. Nó cũng không có nghĩa mọi query giữ row lock tới cuối transaction.

Để dự đoán behavior, cần phân biệt consistent read và current/locking read.

---

## 2. Consistent Read và Read View

Plain `SELECT` trong InnoDB thường là **consistent read**: phép đọc dựng lại phiên bản row phù hợp mà không yêu cầu shared lock trên row đó. **Read View** là metadata xác định transaction version nào được phép xuất hiện trong snapshot của consistent read.

### 2.1. Row version và undo record

Khi transaction update row, InnoDB giữ thông tin cần thiết để transaction khác có thể đọc version cũ phù hợp snapshot.

```text
Version đã commit trước
→ transaction B tạo version mới
→ transaction A vẫn có thể dựng lại version cũ qua undo
```

Reader và writer vì thế không nhất thiết chặn nhau.

### 2.2. Read View trong Repeatable Read

Ở `REPEATABLE READ`, consistent read đầu tiên thường thiết lập read view cho transaction. Các consistent read sau dùng cùng snapshot:

```sql
START TRANSACTION;

SELECT StockQuantity
FROM Products
WHERE Id = 42;

-- Transaction khác update và commit.

SELECT StockQuantity
FROM Products
WHERE Id = 42;

COMMIT;
```

Hai lần `SELECT` có thể trả cùng giá trị theo read view, dù transaction khác đã commit giữa hai statement.

### 2.3. Read View trong Read Committed

Ở `READ COMMITTED`, mỗi consistent read thường tạo read view mới:

```text
SELECT lần 1 → snapshot statement 1
transaction khác COMMIT
SELECT lần 2 → snapshot statement 2
```

Lần đọc sau có thể thấy commit mới.

### 2.4. Consistent Read và locking behavior

Plain `SELECT` thấy một row không có nghĩa transaction đã giữ quyền update row đó:

```text
A plain SELECT Product 42
→ đọc snapshot
→ không đồng nghĩa giữ FOR UPDATE lock

B UPDATE Product 42
→ vẫn có thể tiếp tục theo rule hiện tại
```

Nếu operation cần đọc current value để quyết định rồi giữ quyền cập nhật, nó phải dùng current/locking read hoặc pattern khác phù hợp.

---

## 3. Current Read và Locking Read

Current read cần trạng thái hiện tại để ghi hoặc khóa. `UPDATE`, `DELETE` và locking `SELECT` thuộc nhóm này.

### 3.1. SELECT FOR UPDATE

```sql
START TRANSACTION;

SELECT StockQuantity
FROM Products
WHERE Id = @productId
FOR UPDATE;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

`FOR UPDATE` lấy lock trên record/range mà query scan. Transaction khác yêu cầu lock không tương thích phải chờ.

### 3.2. SELECT FOR SHARE

`FOR SHARE` dùng locking read cho reader cần bảo vệ row khỏi thay đổi không tương thích theo semantics của InnoDB:

```sql
SELECT Id, Status
FROM Orders
WHERE Id = @orderId
FOR SHARE;
```

Nó khác plain consistent read vì tham gia lock coordination.

### 3.3. Current-state evaluation của UPDATE

Atomic conditional update:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

InnoDB phải phối hợp writer trên current record. Hai transaction cùng update một row không chỉ lấy giá trị từ consistent snapshot cũ rồi ghi tự do.

```text
A UPDATE row
→ giữ record lock

B UPDATE cùng row
→ chờ A
→ sau A commit, đánh giá condition trên current state
```

Đây là lý do atomic update xử lý trừ tồn tốt hơn application read–modify–write.

### 3.4. Consistent Read và Current Read trong cùng transaction

Một transaction có thể thấy hai góc nhìn khác nhau:

```text
Plain SELECT
→ đọc snapshot cũ

SELECT FOR UPDATE hoặc UPDATE
→ làm việc với current version theo locking rule
```

Điều này không mâu thuẫn. Hai loại read phục vụ hai mục đích khác nhau.

---

## 4. Record Lock và index access path

InnoDB lock index record, không trừu tượng đơn giản là “khóa object application”. Query access index nào quyết định record nào được engine đi qua và khóa.

### 4.1. Unique index lookup

```sql
SELECT *
FROM Orders
WHERE Id = @orderId
FOR UPDATE;
```

Nếu `Id` là unique index và condition match đầy đủ key, access path có thể định vị một record cụ thể. Lock footprint thường hẹp.

### 4.2. Secondary index lookup

Query theo secondary index có thể lock secondary index record và record liên quan trong clustered index theo operation.

```sql
SELECT *
FROM Orders
WHERE TenantId = @tenantId
  AND Status = 'Pending'
FOR UPDATE;
```

Lock không chỉ được suy từ số row cuối cùng trả về. Phải xem index và record engine scan.

### 4.3. Table scan khi thiếu index

Nếu chỉ có index `TenantId`, query còn phải scan nhiều entry để lọc `Status`:

```text
Index chưa phù hợp
→ scan nhiều index record
→ locking read chạm phạm vi lớn
→ transaction khác bị ảnh hưởng rộng hơn
```

Composite index phù hợp có thể thu hẹp access path:

```sql
CREATE INDEX IX_Orders_Tenant_Status
ON Orders(TenantId, Status);
```

Index là một phần concurrency design, không chỉ là query-speed optimization.

---

## 5. Gap Lock và Next-Key Lock

Record lock bảo vệ index record đã tồn tại. Predicate còn có thể cần bảo vệ khoảng key nơi transaction khác có thể insert phantom.

### 5.1. Gap Lock

**Gap Lock** bảo vệ khoảng giữa các index record. Nó không nhất thiết khóa giá trị row hiện có, mà ngăn insert vào gap theo rule tương ứng.

```text
Index keys hiện có: 10, 20
Gap: (10, 20)
```

Lock trên gap có thể ngăn transaction khác insert key `15` trong thời gian lock tồn tại.

### 5.2. Next-Key Lock

**Next-Key Lock** kết hợp record lock với gap trước record:

```text
(gap trước key] + key record
```

Ở `REPEATABLE READ`, locking range search có thể dùng next-key lock để ngăn phantom insert vào range.

### 5.3. Range query locking

```sql
SELECT Id
FROM Orders
WHERE TenantId = @tenantId
  AND CreatedAt >= @from
  AND CreatedAt < @to
FOR UPDATE;
```

Với index `(TenantId, CreatedAt)`, query scan một range có cấu trúc rõ. Lock footprint bám theo range đó.

Thiếu index phù hợp có thể làm scan và lock range rộng hơn nhiều.

### 5.4. Unique search và Gap Lock

Unique lookup bằng đầy đủ unique key thường không cần gap protection giống range search khi tìm đúng record. Partial unique key hoặc non-unique condition vẫn có behavior khác.

Không ghi nhớ rule bằng câu “FOR UPDATE luôn gap lock” hoặc “unique query không lock gap”. Cần xét:

- Isolation level.
- Unique hay non-unique index.
- Full key hay partial key.
- Record tồn tại hay không.
- Search condition và execution plan.

### 5.5. Gap Lock trong Read Committed

Ở `READ COMMITTED`, InnoDB giảm gap locking cho nhiều trường hợp so với `REPEATABLE READ`, nhưng vẫn có gap-related locking phục vụ Foreign Key và duplicate-key checking.

Không chọn `READ COMMITTED` chỉ để “tắt gap lock”. Cần xác định anomaly có thể chấp nhận và đo contention thật.

---

## 6. Insert Intention và Insert Conflict

Nhiều transaction có thể muốn insert vào cùng một gap. InnoDB dùng insert intention lock để phối hợp insert mà không tuần tự hóa mọi vị trí khác nhau trong gap.

### 6.1. Concurrent inserts tại các vị trí khác nhau

```text
Gap (10, 20)
A muốn insert 12
B muốn insert 18
```

Nếu không có lock xung đột khác, hai insert khác vị trí có thể cùng tiến hành.

### 6.2. Insert vào protected gap

Nếu transaction C giữ gap/next-key lock không tương thích trên `(10, 20)`, cả A và B có thể phải chờ.

### 6.3. Duplicate key conflict

Hai transaction insert cùng unique key được phân xử bởi unique index và lock liên quan:

```text
A INSERT key K
B INSERT key K
→ một transaction thắng
→ transaction còn lại chờ rồi nhận duplicate/conflict theo outcome
```

Unique constraint vẫn là cơ chế bảo vệ business key. Insert intention không thay unique rule.

---

## 7. Conditional Writes trong InnoDB

Lost Update đã được định nghĩa ở bài [Transaction Isolation](/database/isolation-levels/theory). InnoDB-specific question là loại statement nào đọc snapshot và loại nào phối hợp current record.

### 7.1. Application-level Read–Modify–Write

```text
A plain SELECT → Stock 10
B plain SELECT → Stock 10
A UPDATE SET Stock = 8
B UPDATE SET Stock = 7
```

Application gửi absolute value được tính từ snapshot cũ. Kết quả có thể ghi đè update trước nếu không có version condition hoặc locking read phù hợp.

### 7.2. Atomic conditional update

```sql
UPDATE Stock
SET Quantity = Quantity - @quantity
WHERE TenantId = @tenantId
  AND ShopId = @shopId
  AND ProductId = @productId
  AND Quantity >= @quantity;
```

Writer conflict được InnoDB tuần tự hóa trên current record. Request sau đánh giá condition sau khi lock được cấp.

### 7.3. Optimistic version check

```sql
UPDATE Orders
SET Status = @newStatus,
    Version = Version + 1
WHERE Id = @id
  AND Version = @expectedVersion;
```

`affected rows = 0` báo row không còn ở version caller đã đọc.

Atomic và optimistic pattern được lựa chọn trong [Concurrency Control Patterns](/database/concurrency-control-patterns/theory). InnoDB chỉ cung cấp statement atomicity, lock và affected-row result để pattern hoạt động.

---

## 8. Pessimistic Locking trong InnoDB

`SELECT ... FOR UPDATE` phù hợp khi transaction cần đọc nhiều field rồi quyết định trong một boundary ngắn.

### 8.1. Locking flow

```sql
START TRANSACTION;

SELECT Quantity, ReservedQuantity
FROM Stock
WHERE TenantId = @tenantId
  AND ShopId = @shopId
  AND ProductId = @productId
FOR UPDATE;

-- Quyết định và write trong transaction ngắn.

COMMIT;
```

### 8.2. Applicability

- Query dùng index đủ hẹp.
- Transaction không gọi network.
- Resource được lấy theo thứ tự nhất quán.
- Caller chấp nhận chờ lock.
- Conflict rate đủ cao để lock trước có lợi hơn optimistic conflict.

### 8.3. Locking Read và business invariant

Giữ lock không tự bảo đảm Quantity không âm. Transaction vẫn phải kiểm tra condition trước write hoặc dùng conditional update.

### 8.4. NOWAIT và SKIP LOCKED

MySQL hỗ trợ biến thể để không chờ hoặc bỏ qua row đang lock trong những use case phù hợp:

```sql
SELECT Id
FROM Jobs
WHERE Status = 'Pending'
ORDER BY CreatedAt
FOR UPDATE SKIP LOCKED
LIMIT 10;
```

`SKIP LOCKED` phù hợp worker queue, không phù hợp query cần tập kết quả đầy đủ vì row đang bận bị bỏ qua.

---

## 9. Deadlock trong InnoDB

InnoDB phát hiện wait-for cycle và rollback một victim để giải phóng chu trình.

### 9.1. Inconsistent product lock ordering

```text
Order A update Product X → Y
Order B update Product Y → X
```

Interleaving:

```text
A giữ X
B giữ Y
A chờ Y
B chờ X
→ deadlock
```

Sort `ProductId` trước khi update tạo ordering nhất quán.

### 9.2. Index access path và Deadlock Graph

Hai query có thể cùng update một business row nhưng đi qua index khác nhau. Lock trên secondary và clustered index có thể làm graph phức tạp hơn thứ tự table row nhìn từ application.

Deadlock graph và execution plan phải được đọc cùng nhau.

### 9.3. Victim selection và retry

InnoDB rollback victim. Application retry toàn transaction với backoff và idempotency.

Không chỉ retry statement cuối, vì mọi lock và write của transaction victim đã rollback.

### 9.4. Deadlock detection configuration

InnoDB có cấu hình liên quan deadlock detection. Tắt detection trong workload đặc biệt làm transaction phụ thuộc lock wait timeout thay vì được phát hiện cycle sớm. Đây là tuning vận hành có trade-off lớn, không phải cách sửa deadlock mặc định.

---

## 10. Long-running Transactions, Undo và Purge

**Undo record** lưu thông tin cần để rollback một write hoặc dựng lại row version cũ cho consistent read. **Purge** là quá trình nền loại bỏ undo record và version không còn transaction nào cần. Transaction dài giữ Read View hoạt động lâu hơn, khiến purge chưa thể xóa phần history mà view đó vẫn có thể nhìn thấy.

### 10.1. Long Consistent Read

```text
A mở transaction snapshot
→ A chạy report lâu
→ nhiều writer tạo version mới
→ purge chưa thể loại version A còn cần
```

Hậu quả:

- Undo history tăng.
- Purge lag.
- I/O và storage pressure tăng.
- Reader tiếp tục thấy snapshot cũ.

### 10.2. Long Writer Transaction

Writer transaction dài vừa giữ undo vừa giữ lock của write:

```text
START TRANSACTION
→ UPDATE row
→ gọi API ngoài
→ COMMIT sau nhiều giây
```

Transaction khác update cùng row phải chờ toàn bộ thời gian.

### 10.3. Transaction boundary

- Không mở transaction khi user bắt đầu nhập form.
- Không gọi HTTP hoặc broker trong transaction.
- Batch lớn cần commit theo checkpoint.
- Report dài cân nhắc replica hoặc read model.

---

## 11. InnoDB Observability

Không suy contention chỉ từ query đang timeout. Cần lock owner, waiter, transaction timeline và execution plan.

### 11.1. SHOW ENGINE INNODB STATUS

```sql
SHOW ENGINE INNODB STATUS;
```

Output cung cấp thông tin InnoDB gần đây, gồm deadlock gần nhất và transaction state. Nó là snapshot chẩn đoán, không thay monitoring liên tục.

### 11.2. Performance Schema Locks

```sql
SELECT *
FROM performance_schema.data_locks;

SELECT *
FROM performance_schema.data_lock_waits;
```

Các view giúp nối lock đang giữ với lock đang chờ.

### 11.3. InnoDB Transactions

Tùy version và quyền, có thể dùng `information_schema.innodb_trx` cùng Performance Schema để xem active transaction, thời điểm bắt đầu và wait state.

### 11.4. Incident evidence

| Dữ liệu | Mục đích |
|---|---|
| SQL và parameter shape | Xác định predicate/access path |
| `EXPLAIN`/plan | Biết index và range scan |
| Session isolation | Biết read/lock rule |
| `data_locks` | Resource và mode đang giữ |
| `data_lock_waits` | Wait edge |
| Transaction start time | Phát hiện long transaction |
| Business/correlation ID | Nối database session với request |

---

## 12. Case study: concurrent stock decrement

Stock còn `1`. Hai transaction plain `SELECT` trong `REPEATABLE READ` cùng thấy snapshot bằng `1`.

### 12.1. Snapshot-based Read–Modify–Write

```text
A plain SELECT → 1
B plain SELECT → 1
A insert Order và set Stock = 0
B insert Order và set Stock = 0
```

Snapshot ổn định không biến read–modify–write thành operation atomic.

### 12.2. Atomic Conditional Update

```sql
UPDATE Stock
SET Quantity = Quantity - 1
WHERE TenantId = @tenantId
  AND ShopId = @shopId
  AND ProductId = @productId
  AND Quantity >= 1;
```

```text
A lấy record lock và update 1 → 0
B chờ
A commit
B đánh giá Quantity >= 1 trên current row → false
B affected rows = 0
```

### 12.3. Supporting index

Unique key nên định vị đúng stock row:

```sql
CREATE UNIQUE INDEX UX_Stock_Tenant_Shop_Product
ON Stock(TenantId, ShopId, ProductId);
```

Key vừa bảo vệ một row cho mỗi scope vừa tạo unique lookup hẹp cho update.

---

## 13. Case study: Batch Expire Orders

Query:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE TenantId = @tenantId
  AND Status = 'Pending'
  AND ExpiredAt < @now;
```

### 13.1. Single-column index limitation

Chỉ có index `(TenantId)` làm InnoDB scan nhiều order của tenant rồi lọc status/time. Lock footprint và duration tăng.

### 13.2. Composite index

```sql
CREATE INDEX IX_Orders_Tenant_Status_ExpiredAt
ON Orders(TenantId, Status, ExpiredAt);
```

Plan có thể định vị range hẹp hơn. Vẫn cần batch nếu số row expire lớn.

### 13.3. Batch transaction sizing

```text
SELECT/claim batch key theo index
→ update 1.000 row
→ commit
→ checkpoint
→ batch tiếp
```

Composite index giảm access footprint. Batch giảm transaction duration. Hai cơ chế giải quyết hai biến số khác nhau.

---

## 14. Checklist InnoDB Concurrency

```text
[ ] Table có thật sự dùng InnoDB không?
[ ] Session isolation thực tế là gì?
[ ] Query là consistent read hay current/locking read?
[ ] Read view được tạo theo statement hay transaction?
[ ] Query dùng unique lookup hay range scan?
[ ] Lock nằm trên index nào?
[ ] Có record, gap hay next-key footprint nào?
[ ] Missing index có làm scan và lock rộng không?
[ ] Transaction giữ snapshot hoặc lock bao lâu?
[ ] Writer–writer conflict được xử lý bằng pattern nào?
[ ] Deadlock graph có lock order hoặc index path nào ngược nhau?
[ ] Retry có chạy lại toàn transaction và có idempotent không?
[ ] Purge/undo history có tăng vì long transaction không?
```

---

## 15. Tóm tắt

InnoDB concurrency là tương tác giữa:

```text
Isolation level
→ Read view
→ Consistent hoặc current read
→ Index access path
→ Record/gap/next-key lock
→ Transaction duration
→ Purge và deadlock behavior
```

Các ý chính:

- Plain `SELECT` thường đọc MVCC snapshot, không đồng nghĩa row đã được khóa.
- `UPDATE`, `DELETE` và `FOR UPDATE` làm việc với current state và locking.
- Lock nằm trên index record/range mà query scan.
- Thiếu index làm lock footprint rộng hơn.
- `REPEATABLE READ` không tự ngăn application lost update.
- Atomic update phù hợp counter/stock đơn giản.
- Pessimistic locking cần transaction ngắn và ordering nhất quán.
- Long transaction làm lock lifetime và undo history tăng.
- `performance_schema` cùng `SHOW ENGINE INNODB STATUS` cung cấp bằng chứng khi điều tra.

Bài này là phần áp dụng engine-specific. Khái niệm gốc vẫn thuộc các bài Transaction, ACID, Isolation, Locking và Concurrency Control Patterns.
