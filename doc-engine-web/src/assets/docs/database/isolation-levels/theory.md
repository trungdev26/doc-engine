# Transaction Isolation

Bài [ACID](/database/acid/theory) đã xác định Isolation là nhóm bảo đảm kiểm soát cách các transaction đồng thời quan sát và ảnh hưởng lẫn nhau. Tuy nhiên, “có Isolation” chưa cho biết cụ thể transaction được phép thấy dữ liệu nào hoặc database phải ngăn interleaving nào.

**Isolation level** là contract quy định một transaction được phép nhìn thấy thay đổi nào của transaction khác và database phải ngăn hoặc phát hiện những cách xen kẽ nào. Level mạnh hơn loại bỏ nhiều cách xen kẽ nguy hiểm hơn, nhưng có thể tăng thời gian chờ, chi phí giữ nhiều phiên bản dữ liệu hoặc số transaction phải chạy lại.

**Concurrency anomaly** là kết quả sai hoặc khác với điều application dự kiến khi operation của nhiều transaction xen kẽ, dù từng transaction có thể đúng khi chạy riêng. Ví dụ, một transaction có thể đọc dữ liệu chưa commit, thấy cùng một row đổi giá trị giữa hai lần đọc hoặc ghi đè thay đổi vừa được transaction khác lưu.

Tình huống xuyên suốt là một hệ thống bán hàng có nhiều request đồng thời:

- Request cập nhật trạng thái đơn hàng.
- Request trừ tồn kho.
- Report đếm đơn đang chờ xử lý.
- Hai kho cùng thay đổi trạng thái nhận đơn.

Mỗi request có thể đúng khi chạy riêng. Kết quả chung còn phụ thuộc vào cách database xen kẽ operation của các transaction.

---

## 1. Concurrent Transactions

**Lịch thực thi** (`schedule`) là thứ tự database thực hiện các operation của một hoặc nhiều transaction. Hai transaction không nhất thiết chạy xong từng cái một; database có thể xen kẽ câu lệnh để nhiều công việc cùng tiến triển.

### 1.1. Serial Execution

Trong **thực thi tuần tự** (`serial execution`), transaction A hoàn tất trước khi transaction B bắt đầu:

```text
Transaction A
→ READ Stock = 10
→ UPDATE Stock = 8
→ COMMIT

Transaction B
→ READ Stock = 8
→ UPDATE Stock = 5
→ COMMIT
```

Kết quả cuối bằng `5`.

### 1.2. Interleaved Execution

Trong **interleaved execution**, database xen kẽ operation của nhiều transaction thay vì hoàn tất từng transaction một. Ví dụ dưới đây cho cả hai transaction cùng đọc trước khi transaction nào ghi:

```text
A READ Stock = 10
B READ Stock = 10
A UPDATE Stock = 8
B UPDATE Stock = 7
A COMMIT
B COMMIT
```

Kết quả cuối bằng `7`. Update của A đã bị B ghi đè.

Vấn đề không nằm ở một câu SQL riêng lẻ. Nó nằm ở **lịch thực thi** của cả hai transaction.

### 1.3. Serializability

**Serializability** là thuộc tính yêu cầu kết quả của các transaction chạy đồng thời phải tương đương với kết quả của một thứ tự serial hợp lệ. Database không cần thực thi chúng lần lượt trong thời gian thực; engine có thể:

- Cho reader đọc row version cũ.
- Chặn writer đang tranh chấp cùng resource.
- Giữ lock tới cuối transaction.
- Phát hiện dependency nguy hiểm và abort một transaction.

Kết quả cần đáp ứng contract của isolation level, không nhất thiết giống cách engine thực thi bên trong.

Để chọn contract phù hợp, trước hết cần nhận diện những anomaly có thể làm nghiệp vụ sai.

---

## 2. Dirty Read

Dirty Read xảy ra khi một transaction đọc thay đổi chưa commit của transaction khác.

### 2.1. Dirty Read execution

Transaction B tạm thời cập nhật tổng tiền của đơn hàng:

```text
B: UPDATE Order.Total = 0
B: chưa COMMIT
A: SELECT Order.Total → 0
B: ROLLBACK
```

Giá trị `0` chưa từng trở thành trạng thái chính thức, nhưng A đã đọc và có thể dùng nó để tạo hóa đơn, gửi thông báo hoặc ra quyết định tiếp theo.

### 2.2. Uncommitted data visibility

Một transaction chưa commit còn có thể:

- Rollback do business condition không đạt.
- Bị database abort vì deadlock.
- Mất connection.
- Gặp lỗi ở câu SQL sau.

Cho transaction khác đọc dữ liệu này làm trạng thái tạm thời thoát ra ngoài boundary.

### 2.3. Dirty Read prevention

`Read Committed` và các level mạnh hơn chỉ trả dữ liệu đã commit theo rule của engine. Reader có thể chờ writer hoặc đọc row version đã commit gần nhất.

Dirty Read bị loại bỏ, nhưng cùng một transaction vẫn có thể thấy giá trị khác nhau ở hai lần đọc nếu transaction khác commit ở giữa.

---

## 3. Non-repeatable Read

Non-repeatable Read xảy ra khi cùng một row được đọc hai lần trong một transaction nhưng trả về hai giá trị đã commit khác nhau.

### 3.1. Non-repeatable Read execution

Transaction A kiểm tra trạng thái đơn trước và sau một bước xử lý:

```text
A: SELECT Order.Status → Pending
B: UPDATE Order.Status = Paid
B: COMMIT
A: SELECT Order.Status → Paid
```

Cả `Pending` và `Paid` đều là giá trị đã commit. Vấn đề là A không có một cái nhìn ổn định trong suốt transaction.

### 3.2. Read consistency requirement

Không phải mọi Non-repeatable Read đều là bug. Nếu A chỉ cần trạng thái mới nhất tại mỗi statement, thấy `Paid` ở lần hai có thể là hành vi mong muốn.

Nó trở thành vấn đề khi A dùng lần đọc đầu làm điều kiện cho nhiều bước và giả định điều kiện đó không đổi tới cuối transaction.

### 3.3. Row stability mechanisms

`Repeatable Read` có thể giữ snapshot transaction ổn định hoặc giữ lock đọc lâu hơn, tùy engine. Hai lần đọc cùng row vì thế thường thấy cùng giá trị.

Giữ row đã tồn tại ổn định vẫn chưa đủ cho query theo predicate. Transaction khác có thể insert một row mới thỏa điều kiện tìm kiếm.

---

## 4. Phantom Read

Phantom Read xảy ra khi cùng một predicate trả về tập row khác nhau vì transaction khác insert, delete hoặc thay đổi row làm nó đi vào hoặc ra khỏi tập kết quả.

### 4.1. Phantom Read execution

Transaction A đếm số đơn `Pending` để quyết định có mở thêm batch xử lý không:

```text
A: SELECT COUNT(*) WHERE Status = 'Pending' → 10
B: INSERT Order(Status = 'Pending')
B: COMMIT
A: SELECT COUNT(*) WHERE Status = 'Pending' → 11
```

Không row nào A đã đọc bị sửa. Một row mới xuất hiện trong khoảng predicate.

### 4.2. Predicate protection

Khóa 10 row hiện tại không chặn một transaction khác tạo row thứ 11. Bảo vệ predicate có thể cần:

- Range lock.
- Predicate lock.
- Serializable Snapshot Isolation với conflict detection.
- Constraint hoặc mô hình dữ liệu biến predicate thành key cụ thể.

Implementation phụ thuộc engine và access path của query.

### 4.3. Overlapping booking intervals

Booking là failure window thực tế của phantom:

```sql
SELECT Id
FROM Bookings
WHERE RoomId = @roomId
  AND StartTime < @endTime
  AND EndTime > @startTime;
```

A và B có thể cùng thấy không có booking trùng rồi cùng insert. Nếu booking dùng slot rời rạc, unique constraint trên `(RoomId, SlotStart)` thường đơn giản hơn nâng isolation. Với khoảng thời gian tự do, có thể cần exclusion constraint hoặc Serializable đã kiểm chứng.

Phantom tập trung vào tập row. Một anomaly khác xảy ra ngay trên một row khi hai transaction cùng tính giá trị mới từ cùng một snapshot cũ.

---

## 5. Lost Update

Lost Update xảy ra khi kết quả ghi của một transaction bị transaction khác ghi đè mà conflict không được xử lý theo contract nghiệp vụ.

### 5.1. Read–Modify–Write

Stock ban đầu bằng `10`:

```text
A đọc 10, cần trừ 2
B đọc 10, cần trừ 3
A ghi 8
B ghi 7
```

Kết quả đúng phải là `5`. B đã ghi một giá trị được tính từ snapshot cũ và làm mất update của A.

### 5.2. Write conflict protection

Hành vi lost update khác nhau theo engine, level và loại câu SQL. Một direct update thường được engine phối hợp khác với application read–modify–write:

```sql
UPDATE Products
SET StockQuantity = StockQuantity - @quantity
WHERE Id = @productId;
```

Câu lệnh trên yêu cầu writer làm việc với current row tại write path. Nó không giống việc đọc `10` về application rồi gửi lại `SET StockQuantity = 7`.

### 5.3. Conflict detection point

Lost Update có thể được xử lý bằng:

- Atomic update.
- Optimistic version trong `WHERE`.
- Pessimistic lock trước khi đọc.
- Serializable với conflict handling phù hợp.

Bài [Concurrency Control Patterns](/database/concurrency-control-patterns/theory) sở hữu cách chọn giữa các cơ chế này. Isolation chỉ xác định lịch thực thi nào được phép hoặc phải bị phát hiện.

Ngay cả khi hai transaction không ghi cùng row, chúng vẫn có thể cùng phá một rule dựa trên nhiều row.

---

## 6. Write Skew

Write Skew xảy ra khi hai transaction đọc cùng một điều kiện tổng thể nhưng cập nhật các row khác nhau, khiến điều kiện không còn đúng sau khi cả hai commit.

### 6.1. Write Skew execution

Hệ thống có hai kho, A và B. Rule yêu cầu luôn có ít nhất một kho đang nhận đơn.

```text
Transaction A đọc: Warehouse B đang Active
→ A chuyển Warehouse A thành Inactive

Transaction B đọc: Warehouse A đang Active
→ B chuyển Warehouse B thành Inactive
```

Hai transaction update hai row khác nhau nên không có write–write conflict trực tiếp. Sau cả hai commit, không kho nào còn nhận đơn.

### 6.2. Multi-row invariant protection

Mỗi transaction có thể đọc một snapshot nội bộ nhất quán. Vấn đề là cả hai snapshot đều thiếu write chưa commit của transaction còn lại.

Rule nhiều row có thể cần:

- Serializable.
- Explicit lock trên row đại diện cho rule.
- Constraint sau khi thay đổi mô hình dữ liệu.
- Queue hoặc coordinator theo business key.

Write Skew cho thấy isolation không chỉ bảo vệ từng row. Nó còn liên quan dependency giữa predicate và tập write.

---

## 7. Read Uncommitted

`Read Uncommitted` cho phép mức cách ly đọc thấp nhất trong mô hình isolation truyền thống. Một số engine có thể cho phép Dirty Read, còn một số engine ánh xạ level này gần với `Read Committed` vì kiến trúc MVCC.

### 7.1. Visibility contract

Reader có thể quan sát thay đổi chưa commit:

```text
Writer thay đổi Balance nhưng chưa commit
→ Reader có thể thấy giá trị tạm thời
→ Writer rollback
```

### 7.2. Applicability

Level này hiếm khi phù hợp với quyết định nghiệp vụ. Dữ liệu đọc được có thể chưa từng trở thành trạng thái chính thức.

Không chọn `Read Uncommitted` chỉ để “SELECT không bị block”. Snapshot-based read, replica hoặc read model thường cung cấp lựa chọn rõ hơn mà không đánh đổi correctness theo cách này.

Loại bỏ Dirty Read dẫn tới level phổ biến hơn: `Read Committed`.

---

## 8. Read Committed

`Read Committed` bảo đảm mỗi statement không đọc dữ liệu chưa commit. Nó không bảo đảm toàn transaction dùng một snapshot duy nhất.

### 8.1. Statement-level visibility

```text
A BEGIN
A SELECT Stock → 10
B UPDATE Stock = 8
B COMMIT
A SELECT Stock → 8
A COMMIT
```

Lần đọc thứ hai được phép thấy commit mới của B. Vì vậy Non-repeatable Read và Phantom vẫn có thể xảy ra.

### 8.2. Lock-based Read Committed

Trong SQL Server lock-based mặc định, `SELECT` thường lấy shared lock cho thời gian statement. Nếu writer đang giữ exclusive lock trên row cần đọc, reader có thể chờ.

```text
B giữ exclusive lock trên Product 42
A SELECT Product 42
→ A chờ B commit hoặc rollback
```

Shared lock của statement thường được nhả khi statement kết thúc, nên lần đọc sau có thể thấy dữ liệu mới.

### 8.3. Snapshot-based Read Committed

SQL Server với `READ_COMMITTED_SNAPSHOT`, PostgreSQL và MySQL/InnoDB ở `Read Committed` thường dùng row version cho consistent read theo statement.

Reader có thể đọc version đã commit mà không chờ writer trong nhiều trường hợp:

```text
B đang tạo version mới nhưng chưa commit
A SELECT
→ A đọc version committed phù hợp statement snapshot
```

Reader ít chặn writer hơn, nhưng writer vẫn tranh chấp với writer.

### 8.4. Engine-specific behavior

| Engine / cấu hình | Hành vi phổ biến ở Read Committed |
|---|---|
| SQL Server lock-based | Shared lock theo statement, reader có thể chờ writer |
| SQL Server với RCSI | Row version theo statement snapshot |
| PostgreSQL | Snapshot mới cho mỗi statement |
| MySQL/InnoDB Read Committed | Consistent read tạo read view mới cho mỗi statement |

> **Lưu ý:** MySQL/InnoDB mặc định thường là `Repeatable Read`, không phải `Read Committed`. Production phải kiểm tra isolation của session thực tế, không suy từ mặc định tài liệu.

### 8.5. Read Committed limitations

`Read Committed` không tự bảo vệ application read–modify–write:

```text
A đọc 10
B commit 8
A vẫn tính từ 10 rồi ghi 7
```

Cần atomic write hoặc conflict detection tại write path.

Khi transaction cần nhiều lần đọc cùng một snapshot, `Repeatable Read` cung cấp contract mạnh hơn.

---

## 9. Repeatable Read

`Repeatable Read` giữ những dữ liệu đã đọc ổn định hơn trong transaction. Cách đạt được điều này phụ thuộc engine.

### 9.1. Transaction snapshot

Trong MVCC implementation, transaction có thể giữ một snapshot chung:

```text
A BEGIN
A SELECT Stock → 10
B UPDATE Stock = 8
B COMMIT
A SELECT Stock → vẫn 10 theo snapshot
```

A có cái nhìn ổn định nhưng không thấy commit mới của B trong consistent read.

### 9.2. Lock-based implementation

Engine lock-based có thể giữ shared lock lâu hơn để ngăn row đã đọc bị sửa cho tới khi transaction kết thúc.

Cách này tăng read/write blocking so với statement-level lock ở `Read Committed`.

### 9.3. Engine-specific Phantom behavior

Tên `Repeatable Read` không đủ để kết luận phantom có bị ngăn hay không:

- MySQL/InnoDB có next-key locking cho nhiều locking range read ở `Repeatable Read`.
- PostgreSQL `Repeatable Read` dùng snapshot isolation và có behavior khác lock range.
- SQL Server `Repeatable Read` giữ lock trên row đã đọc nhưng không tự bảo vệ toàn predicate như `Serializable`.

### 9.4. Long-lived snapshot costs

Transaction giữ snapshot lâu làm engine phải giữ row version cũ lâu hơn. Hậu quả có thể gồm:

- Undo/history list tăng.
- Version store tăng.
- Vacuum hoặc purge bị trì hoãn.
- Query tiếp tục nhìn dữ liệu cũ dù transaction khác đã commit.

Repeatable Read ổn định snapshot, nhưng Write Skew hoặc predicate race vẫn có thể cần `Serializable`.

---

## 10. Serializable

`Serializable` yêu cầu kết quả của transaction đồng thời tương đương một thứ tự chạy tuần tự hợp lệ.

### 10.1. Serializable implementations

Engine có thể hiện thực Serializable bằng:

- Shared/exclusive lock giữ lâu hơn.
- Range hoặc predicate lock.
- Serializable Snapshot Isolation và dependency detection.
- Abort transaction khi không thể bảo đảm serialization.

Application phải đọc tài liệu engine cụ thể để biết transaction sẽ chờ hay bị abort.

### 10.2. Bảo vệ predicate

Booking trùng khoảng thời gian là ví dụ điển hình:

```text
A kiểm tra chưa có booking trùng
B kiểm tra chưa có booking trùng
A insert
B insert
```

Serializable phải ngăn cả hai cùng commit theo một lịch không tương đương tuần tự. Engine có thể chặn insert hoặc abort một transaction.

### 10.3. Serialization failure

Một số engine cho transaction chạy trên snapshot rồi phát hiện dependency nguy hiểm:

```text
A và B cùng chạy
→ engine phát hiện lịch không serializable
→ abort B
→ application retry toàn bộ B từ BEGIN
```

Retry phải đọc lại state. Không tái sử dụng entity hoặc quyết định từ attempt cũ.

### 10.4. Serializable trade-offs

Serializable có thể tăng blocking hoặc abort rate. Nếu rule có thể bảo vệ bằng:

- Unique constraint.
- Atomic conditional update.
- Optimistic version.
- Row đại diện cho resource cần claim.

thì cơ chế cục bộ thường dễ vận hành hơn nâng isolation cho mọi transaction.

---

## 11. MVCC và lock-based concurrency

Isolation level mô tả behavior. MVCC và locking là những cơ chế engine dùng để đạt behavior đó.

### 11.1. MVCC

**Multi-Version Concurrency Control** giữ nhiều version của row:

```text
Writer tạo version mới
Reader đọc version phù hợp snapshot
```

MVCC giảm nhiều read/write blocking, nhưng không loại bỏ:

- Writer–writer conflict.
- Unique-key conflict.
- Locking read.
- Serialization failure.
- Version cleanup pressure.

### 11.2. Lock-based read

Lock-based read điều phối reader và writer bằng lock compatibility:

```text
Reader giữ shared lock
Writer cần exclusive lock
→ writer chờ hoặc reader chờ tùy thứ tự
```

Chi tiết shared, exclusive, update, range lock và wait chain nằm trong [Locking, Blocking và Deadlock](/database/locking-deadlock/theory).

### 11.3. Current read và consistent read

MVCC engine thường phân biệt:

- **Consistent read** — đọc version phù hợp snapshot.
- **Current/locking read** — đọc version hiện tại để update hoặc khóa.

Một plain `SELECT` thấy snapshot cũ không có nghĩa `UPDATE` sau đó sẽ ghi dựa trên cùng version mà không conflict. DML phải phối hợp với current state theo rule của engine.

MySQL/InnoDB được giải thích riêng trong [MySQL InnoDB Concurrency Internals](/database/mysql-innodb-concurrency/theory).

---

## 12. Isolation level selection

Không chọn isolation chỉ theo tên “mạnh” hoặc “nhẹ”. Bắt đầu từ failure window của nghiệp vụ.

### 12.1. Selection criteria

```text
1. Xác định dữ liệu được đọc để ra quyết định
2. Xác định transaction khác có thể thay đổi dữ liệu đó thế nào
3. Xác định anomaly nào làm kết quả sai
4. Ưu tiên constraint hoặc atomic statement nếu đủ
5. Chọn isolation mạnh hơn khi cần bảo vệ nhiều statement hoặc predicate
6. Chuẩn bị retry nếu engine có thể abort transaction
```

### 12.2. Decision matrix

| Nhu cầu | Hướng ưu tiên |
|---|---|
| Chỉ cần tránh dữ liệu chưa commit | Read Committed |
| Nhiều read cần cùng snapshot | Repeatable Read hoặc transaction snapshot tương ứng engine |
| Predicate hoặc rule đa row phải tương đương tuần tự | Serializable hoặc thiết kế constraint/locking cụ thể |
| Counter hoặc stock trên một row | Atomic conditional update trước khi nâng isolation |
| Form edit dài | Optimistic version thay vì giữ transaction snapshot lâu |

### 12.3. Runtime configuration verification

Khi điều tra anomaly, cần thu thập:

- Engine và version.
- Isolation của session/transaction.
- Snapshot hoặc row-version option.
- Câu SQL và execution plan.
- Lock hoặc serialization error.
- Timeline của các transaction.

Không suy isolation từ connection string mẫu hoặc default trong tài liệu. Pool có thể tái sử dụng session đã đổi isolation nếu application không reset đúng.

---

## 13. Checklist Isolation

```text
[ ] Transaction đọc dữ liệu nào để ra quyết định?
[ ] Có lần đọc lặp lại hoặc predicate query không?
[ ] Dirty Read có gây quyết định sai không?
[ ] Non-repeatable Read có được chấp nhận không?
[ ] Phantom có phá rule không?
[ ] Read–Modify–Write có lost update không?
[ ] Rule nhiều row có write skew không?
[ ] Isolation session thực tế là gì?
[ ] Engine dùng lock hay MVCC cho read này?
[ ] Serializable conflict có được retry toàn transaction không?
```

---

## 14. Tóm tắt

Isolation trả lời câu hỏi:

```text
Transaction đồng thời được phép quan sát và ảnh hưởng lẫn nhau thế nào?
```

```text
Read Uncommitted → có thể thấy dữ liệu tạm
Read Committed   → mỗi statement chỉ thấy dữ liệu đã commit
Repeatable Read  → row hoặc snapshot ổn định hơn trong transaction
Serializable     → kết quả tương đương một lịch tuần tự hợp lệ
```

Tên level mô tả contract, không mô tả đầy đủ implementation. [Locking, Blocking và Deadlock](/database/locking-deadlock/theory) tiếp tục bằng câu hỏi: engine giữ, chờ và giải phóng resource tranh chấp như thế nào?
