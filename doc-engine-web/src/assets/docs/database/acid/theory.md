# ACID

Bài [Transaction](/database/transactions/theory) đã thiết lập một ranh giới gồm nhiều write phải cùng commit hoặc cùng rollback. Tuy nhiên, cú pháp `BEGIN` và `COMMIT` chưa giải thích database phải cung cấp những bảo đảm nào để ranh giới đó có ý nghĩa.

**ACID** là tên ghép từ chữ cái đầu của `Atomicity`, `Consistency`, `Isolation` và `Durability`. Bốn thuộc tính mô tả những điều database phải bảo vệ khi thực thi và công bố một transaction:

| Thuộc tính | Điều cần bảo đảm |
|---|---|
| Atomicity | Các write trong transaction cùng được công bố hoặc cùng bị loại bỏ |
| Consistency | Trạng thái đã commit không vi phạm constraint và rule được thực thi trên write path |
| Isolation | Quy định cách các transaction đồng thời được phép quan sát và ảnh hưởng lẫn nhau |
| Durability | Dữ liệu đã được xác nhận commit vẫn được khôi phục sau loại sự cố mà policy lưu trữ cam kết chịu được |

Bốn thuộc tính không phải bốn bước chạy tuần tự. Chúng cùng mô tả kết quả database cần bảo vệ trong suốt lifecycle của transaction.

Tình huống xuyên suốt vẫn là request tạo đơn hàng:

```text
Insert Order
→ Insert OrderItems
→ giảm Stock
→ Insert StockTransaction
→ COMMIT
```

---

## 1. Atomicity

Một request có thể thất bại sau khi đã thực hiện một số write. Atomicity ngăn các write tạm thời trở thành trạng thái chính thức riêng lẻ.

### 1.1. Partial state after failure

Không có atomic boundary:

```text
Insert Order      → đã công bố
Insert OrderItem  → đã công bố
Update Stock      → lỗi
```

Order đã tồn tại dù nghiệp vụ chưa hoàn tất.

Trong một transaction:

```sql
BEGIN TRANSACTION;

INSERT INTO Orders(Id, CustomerId, Status)
VALUES (@orderId, @customerId, 'Created');

INSERT INTO OrderItems(OrderId, ProductId, Quantity)
VALUES (@orderId, @productId, @quantity);

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;

-- Nếu affected rows = 0: ROLLBACK.

COMMIT;
```

Các write trước `COMMIT` thuộc cùng một kết quả:

```text
Mọi bước thành công
→ COMMIT toàn bộ

Một bước thất bại
→ ROLLBACK toàn bộ
```

### 1.2. Atomicity boundary

Atomicity chỉ áp dụng cho tài nguyên tham gia transaction. Một local database transaction không rollback được:

- Email đã gửi.
- File đã upload.
- HTTP request đã được service khác xử lý.
- Message đã publish ra broker.
- Cache đã cập nhật.

```text
BEGIN database transaction
→ gửi email thành công
→ database ROLLBACK
→ email vẫn đã được gửi
```

Vì vậy side effect ngoài database không được đưa vào transaction chỉ để hy vọng rollback. Chúng cần recovery mechanism riêng như Outbox, idempotency hoặc compensation.

### 1.3. Business rules outside Atomicity

Transaction sau atomic nhưng vẫn có thể làm tồn kho âm:

```sql
BEGIN TRANSACTION;

UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;

COMMIT;
```

Database có thể commit toàn bộ câu lệnh một cách atomic, dù kết quả nghiệp vụ là sai. Atomicity chỉ bảo đảm “tất cả hoặc không gì cả”, không tự định nghĩa “đúng” là gì.

Giới hạn đó dẫn tới Consistency: trạng thái nào mới được phép commit?

---

## 2. Consistency

Consistency nghĩa là database chuyển từ một trạng thái được chấp nhận sang một trạng thái được chấp nhận khác. Database chỉ thực thi những rule đã được biểu diễn bằng schema, constraint, trigger hoặc câu SQL.

### 2.1. Consistency rules trong write path

Điều kiện không bán vượt tồn được đưa vào chính câu `UPDATE`:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId
  AND StockQuantity >= @quantity;
```

Kết quả write có ý nghĩa rõ:

| Affected rows | Kết quả |
|---:|---|
| `1` | Sản phẩm đủ tồn tại thời điểm write và đã được cập nhật |
| `0` | Sản phẩm không tồn tại hoặc không còn đủ tồn |

Application chỉ commit khi mọi write condition đều đạt.

### 2.2. Constraint enforcement

Một số rule có thể được bảo vệ trực tiếp bằng constraint:

| Constraint | Rule phù hợp |
|---|---|
| `PRIMARY KEY` | Identifier không trùng |
| `FOREIGN KEY` | Row tham chiếu phải tồn tại |
| `UNIQUE` | Business key không trùng |
| `CHECK` | Điều kiện có thể biểu diễn trên row |
| `NOT NULL` | Giá trị bắt buộc |

Ví dụ email không trùng:

```sql
CREATE UNIQUE INDEX UX_Users_Email
ON Users(Email);
```

Application có thể kiểm tra trước để trả lỗi thân thiện. Hai request đồng thời vẫn có thể cùng vượt qua lần kiểm tra đó. Unique constraint mới là nơi phân xử cuối cùng.

### 2.3. Application-enforced rules

Không phải rule nào cũng biểu diễn được bằng một constraint đơn giản. Ví dụ:

- Tổng hạn mức phụ thuộc nhiều aggregate.
- Quyết định cần policy theo vai trò hoặc thời điểm.
- Booking không được chồng khoảng thời gian tự do.
- Workflow cần phê duyệt nhiều bước.

Application chịu trách nhiệm phối hợp rule, nhưng kết quả ghi vẫn nên dùng constraint, conditional write hoặc concurrency mechanism tại nơi database có thể bảo vệ.

### 2.4. Consistency và read visibility

Một transaction có thể đang ghi trạng thái hợp lệ mới trong khi transaction khác vẫn đọc trạng thái cũ. Cả hai snapshot có thể hợp lệ.

```text
Transaction A đang tạo Order mới nhưng chưa commit
Transaction B vẫn đọc snapshot trước đó
```

Visibility giữa các transaction thuộc Isolation, không phải Consistency.

---

## 3. Isolation

Isolation mô tả mức độ các transaction đồng thời được phép quan sát và ảnh hưởng lẫn nhau. Nó không nhất thiết làm mọi transaction chạy tuần tự vật lý.

### 3.1. Concurrent interleaving

Hai request cùng trừ tồn:

```text
Stock = 10
A đọc 10
B đọc 10
A ghi 8
B ghi 7
```

Mỗi request có thể nằm trong một transaction atomic riêng. Kết quả vẫn sai vì B quyết định từ dữ liệu cũ và ghi đè kết quả của A.

### 3.2. Valid execution ordering

Database có thể phối hợp transaction bằng nhiều cơ chế:

- Chặn transaction bằng lock.
- Cho reader đọc row version cũ qua MVCC.
- Phát hiện conflict khi commit.
- Abort một transaction để application retry.

Mục tiêu không phải “không transaction nào nhìn thấy transaction khác”. Mục tiêu là giới hạn những interleaving có thể làm kết quả không còn đúng theo isolation contract.

### 3.3. Isolation levels

Các workload cần mức bảo vệ khác nhau. Một query report có thể chấp nhận snapshot thay đổi giữa các statement. Một nghiệp vụ booking có thể cần bảo vệ cả một khoảng dữ liệu chưa có row.

Isolation mạnh hơn thường đổi lấy một hoặc nhiều chi phí:

- Blocking tăng.
- Transaction bị abort do serialization conflict.
- Row version phải được giữ lâu hơn.
- Throughput giảm ở vùng dữ liệu nóng.

Chi tiết Dirty Read, Non-repeatable Read, Phantom Read, Lost Update, Write Skew và các isolation level nằm trong [Transaction Isolation](/database/isolation-levels/theory).

Isolation ở đây chỉ xác lập mục tiêu của ACID. Bài tiếp theo giải thích từng failure window và cách các engine cho phép hoặc ngăn chúng.

---

## 4. Durability

Durability nghĩa là khi database xác nhận commit thành công, dữ liệu có thể được phục hồi sau sự cố theo policy đã cấu hình.

### 4.1. Commit và data page flush

Database thường sửa page trong memory trước. Page đã thay đổi nhưng chưa xuống data file được gọi là dirty page.

```text
Update page trong buffer pool
→ tạo log record
→ flush log cần thiết
→ xác nhận COMMIT
→ flush dirty page ở thời điểm sau
```

Nếu process hoặc máy chủ dừng trước khi dirty page được ghi, transaction log hoặc WAL cung cấp dữ liệu để recovery áp dụng lại transaction đã commit.

### 4.2. Write-Ahead Logging

**Write-Ahead Logging** yêu cầu log đủ cho recovery được ghi bền vững trước data page tương ứng:

```text
Log trước
→ xác nhận commit
→ data page sau
```

Cơ chế này tách commit latency khỏi việc ghi ngẫu nhiên mọi data page ngay lập tức.

### 4.3. Commit acknowledgement policy

Mức durability thực tế phụ thuộc cấu hình:

| Cấu hình | Trade-off |
|---|---|
| Synchronous log flush | Bảo vệ tốt hơn trước process/machine failure, commit latency cao hơn |
| Asynchronous hoặc relaxed flush | Latency thấp hơn, có thể mất một cửa sổ commit khi crash |
| Synchronous replica acknowledgement | Bảo vệ thêm node failure, tăng latency và phụ thuộc replica |
| Asynchronous replication | Primary commit nhanh hơn, replica có thể lag |

Không suy ra durability chỉ từ việc application nhận `COMMIT OK`. Cần biết engine, storage và replication policy.

### 4.4. Durability và ambiguous response

Database có thể commit bền vững nhưng HTTP response không tới client:

```text
COMMIT thành công
→ connection hoặc process lỗi
→ client timeout
```

Từ phía client, kết quả chưa rõ. Retry phải dùng business key hoặc idempotency key để xác minh dữ liệu cũ, không giả định timeout đồng nghĩa rollback.

---

## 5. ACID trong một transaction

Use case tạo đơn sử dụng cả bốn thuộc tính cùng lúc:

```text
BEGIN
→ Insert Order
→ Insert OrderItems
→ Conditional Update Stock
→ Insert StockTransaction
→ COMMIT
```

| Thuộc tính | Vai trò trong use case |
|---|---|
| Atomicity | Bốn write cùng commit hoặc cùng rollback |
| Consistency | Constraint và write condition chỉ cho phép trạng thái hợp lệ |
| Isolation | Request đồng thời không được làm kết quả không thể giải thích |
| Durability | Order đã commit có thể được recovery sau crash |

Một thuộc tính không thay thế thuộc tính khác:

- Atomicity không ngăn lost update.
- Consistency không định nghĩa visibility giữa transaction.
- Isolation không rollback email đã gửi.
- Durability không làm retry request trở nên idempotent.

---

## 6. ACID trade-offs

ACID không miễn phí. Database phải dùng log, lock, row version, conflict detection và recovery metadata để cung cấp các bảo đảm.

### 6.1. Ranh giới lớn hơn không đồng nghĩa an toàn hơn

Transaction rộng giữ resource lâu hơn:

- Lock tồn tại lâu hơn.
- Snapshot cũ được giữ lâu hơn.
- Log và undo phải sống lâu hơn.
- Rollback tốn nhiều thời gian hơn.

Atomicity chỉ nên bao phạm vi cần cùng commit.

### 6.2. Isolation mạnh hơn không luôn tốt hơn

`Serializable` có thể loại bỏ nhiều interleaving nguy hiểm nhưng làm transaction chờ hoặc bị abort nhiều hơn. Nếu một rule có thể được bảo vệ bằng unique constraint hoặc atomic update, nâng isolation toàn hệ thống thường là lựa chọn quá rộng.

### 6.3. Durability mạnh hơn có thể tăng latency

Chờ flush log và replica acknowledgement tăng thời gian commit. Hệ thống phải chọn policy phù hợp với mức mất dữ liệu có thể chấp nhận, không chỉ tối ưu benchmark latency.

---

## 7. ACID misconceptions

| Nhận định | Vì sao sai |
|---|---|
| Có transaction thì business rule luôn đúng | Rule phải được biểu diễn bằng write condition, constraint hoặc application logic |
| Atomicity ngăn mọi race condition | Hai transaction atomic vẫn có thể lost update |
| Isolation nghĩa là chạy tuần tự hoàn toàn | Engine có thể dùng MVCC, lock hoặc abort/retry để đạt contract |
| Commit nghĩa là data page đã xuống file | Log có thể durable trước, dirty page được flush sau |
| Rollback được mọi side effect | Local transaction không hoàn tác email, HTTP hoặc message broker |
| Timeout nghĩa là transaction rollback | Commit có thể thành công trước khi response bị mất |

---

## 8. Checklist ACID

```text
[ ] Atomicity đang bao đúng nhóm write chưa?
[ ] Có side effect nào nằm ngoài phạm vi rollback không?
[ ] Business rule đã được biểu diễn tại write path hoặc constraint chưa?
[ ] Transaction đồng thời có thể tạo interleaving nào?
[ ] Isolation hiện tại cho phép interleaving đó không?
[ ] Commit acknowledgement dựa trên durability policy nào?
[ ] Mất connection quanh commit được xác minh bằng business key nào?
[ ] Retry có idempotent không?
```

---

## 9. Tóm tắt

ACID trả lời câu hỏi:

```text
Database cần bảo đảm gì tại transaction boundary?
```

```text
Atomicity   → không công bố transaction nửa chừng
Consistency → chỉ commit trạng thái đáp ứng rule đã thực thi
Isolation   → giới hạn interleaving giữa transaction đồng thời
Durability  → giữ kết quả commit qua failure theo policy
```

ACID xác lập mục tiêu. [Transaction Isolation](/database/isolation-levels/theory) tiếp tục bằng câu hỏi cụ thể hơn: transaction đồng thời được phép nhìn thấy và thay đổi gì?
