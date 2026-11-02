# Quy trình phân tích và tối ưu truy vấn

Tối ưu truy vấn là quá trình xác định cơ chế khiến một workload vượt quá giới hạn về độ trễ hoặc tài nguyên, sau đó lựa chọn và kiểm chứng thay đổi có mức đánh đổi phù hợp. Một lần chạy nhanh hơn trên môi trường phát triển chưa đủ để chứng minh hiệu quả nếu truy vấn không ổn định giữa các nhóm tham số, làm tăng áp lực ghi hoặc tạo thêm rủi ro triển khai.

Quy trình đầy đủ đi từ tác động quan sát được đến kết quả sau triển khai:

```text
Triệu chứng và tác động nghiệp vụ
→ phân rã thời gian phản hồi
→ xác định query và execution plan liên quan
→ thu thập baseline và kiểm chứng root cause
→ lựa chọn thay đổi theo chi phí và rủi ro
→ kiểm thử, triển khai và theo dõi workload thực tế
```

Ba nhóm bằng chứng được sử dụng xuyên suốt:

- **Cấu trúc truy cập**: predicate, join, sort và chỉ mục.
- **Kế hoạch thực thi**: operator, cardinality, statistics, memory grant và plan reuse.
- **Tài nguyên vật lý**: page, logical/physical read, CPU, memory, lock và connection.

Kết quả của query tuning không chỉ là SQL hoặc chỉ mục mới. Nó là một quyết định kỹ thuật có baseline, giả thuyết, trade-off, kế hoạch rollout và tiêu chí xác nhận rõ ràng.

---

## 1. Phạm vi và mức độ ưu tiên

### 1.1. Mục tiêu và tiêu chí đánh giá

Mục tiêu không phải làm một câu SQL có thời gian thấp nhất trong điều kiện lý tưởng. Mục tiêu là giữ workload quan trọng trong giới hạn chấp nhận được:

- Latency đáp ứng SLO của API hoặc job.
- Throughput đủ cho tải đồng thời.
- CPU, memory, I/O và connection không bị đẩy đến vùng mất ổn định.
- Transaction không giữ lock lâu hơn cần thiết.
- Không đánh đổi write performance quá mức để tối ưu một query đọc.
- Hiệu năng ổn định với nhiều loại parameter và khi dữ liệu tăng.
- Thay đổi có thể triển khai, quan sát và rollback an toàn.

Một query từ 800 ms xuống 20 ms là cải thiện lớn. Nhưng nếu index mới làm tốc độ ghi giảm 40%, tăng đáng kể log volume và chỉ phục vụ endpoint hiếm dùng, quyết định đó có thể vẫn sai.

---

### 1.2. Xác định triệu chứng và phạm vi ảnh hưởng

Các mô tả như “database chậm” hoặc “query lâu” chưa đủ để điều tra.

Cần chuẩn hóa triệu chứng:

| Câu hỏi | Ví dụ dữ liệu cần có |
|---|---|
| Thành phần nào bị ảnh hưởng? | API danh sách đơn hàng, worker đối soát |
| Chậm từ khi nào? | Sau deploy, sau import dữ liệu, theo khung giờ |
| Tần suất? | Mọi request, 5% request, chỉ tenant lớn |
| Latency nào tăng? | p50, p95, p99 hay toàn bộ |
| Có timeout/error không? | Command timeout, pool timeout, deadlock victim |
| Tải có thay đổi không? | RPS, số job, số connection |
| Dữ liệu có thay đổi không? | Bảng tăng mạnh, phân bố tenant lệch |
| Tài nguyên nào bão hòa? | CPU, IOPS, memory, connection |

Ví dụ mô tả có thể hành động:

```text
Từ 09:00, p95 của GET /orders tăng từ 180 ms lên 2.4 s.
Chỉ tenant A bị ảnh hưởng.
DB CPU không tăng đáng kể nhưng logical reads/query tăng 30 lần.
Deployment gần nhất thay đổi filter Status và ORDER BY CreatedAt.
```

Mô tả này tạo ra giả thuyết cụ thể hơn nhiều so với “API bị chậm”.

---

### 1.3. Ưu tiên theo tác động của workload

Không nên ưu tiên chỉ theo thời gian của một lần chạy.

Một query đáng xử lý sớm khi có một hoặc nhiều đặc điểm:

- Chạy rất thường xuyên.
- Nằm trong request đồng bộ người dùng đang chờ.
- Giữ transaction hoặc lock.
- Đọc lượng page lớn.
- Tiêu thụ CPU tổng lớn.
- Tạo burst I/O hoặc memory grant.
- Có tail latency rất xấu.
- Làm query khác chậm theo qua contention.

Có thể đánh giá tác động gần đúng:

```text
Total database time ≈ average duration × execution count
Total read pressure  ≈ logical reads/query × execution count
```

Query 30 ms chạy 20.000 lần/phút có thể quan trọng hơn query report 10 giây chạy một lần mỗi ngày.

---

### 1.4. Phân rã thời gian phản hồi

Request chậm không đồng nghĩa query đang dùng CPU để chạy chậm.

Luồng thường gặp:

```text
Request vào application
→ chờ lấy connection
→ gửi command qua network
→ chờ lock hoặc tài nguyên DB
→ thực thi query
→ truyền result set
→ ORM materialize object
→ application xử lý kết quả
```

Các nhóm nguyên nhân chính:

| Nhóm | Dấu hiệu thường gặp |
|---|---|
| Connection pool | Chờ connection, DB chưa đạt max connection |
| Blocking | Duration cao nhưng CPU thấp, có blocking session |
| CPU | DB CPU cao, operator xử lý nhiều row, compile pressure |
| I/O | Read latency cao, physical reads hoặc I/O wait tăng |
| Memory | Sort/hash spill, memory grant wait |
| Network/result set | Query trả quá nhiều row/cột |
| Application | N+1, mapping nặng, xử lý in-memory |

Nếu thời gian nằm ở pool hoặc blocking, thêm index đôi khi giúp gián tiếp nhưng không được coi là kết luận trước khi có bằng chứng.

---

## 2. Thu thập bằng chứng và xác định nguyên nhân

### 2.1. Thiết lập baseline

Trước khi thay đổi, cần lưu ít nhất:

- SQL hoặc query fingerprint đã chuẩn hóa parameter.
- Parameter đại diện.
- Execution count.
- Duration: average và percentile nếu có.
- CPU time.
- Logical reads và physical reads.
- Rows returned và rows processed.
- Wait type hoặc blocking information.
- Estimated và actual execution plan.
- Kích thước bảng/index.
- Phân bố dữ liệu liên quan.
- Version ứng dụng và thời điểm đo.

Baseline phải ghi cả điều kiện đo:

```text
Cold cache hay warm cache?
Một session hay concurrency thật?
Statistics ở trạng thái nào?
Parameter thuộc tenant nhỏ hay tenant lớn?
Đang chạy trên dữ liệu production-like hay dữ liệu mẫu?
```

Không so sánh lần chạy cold cache trước thay đổi với lần chạy warm cache sau thay đổi.

---

### 2.2. Parameter đại diện và phân bố dữ liệu

Một parameter “chạy nhanh” không đại diện cho toàn bộ workload.

Ví dụ:

```text
Tenant nhỏ: 2.000 Orders
Tenant vừa: 500.000 Orders
Tenant lớn: 80.000.000 Orders
```

Cùng một SQL có thể:

- Dùng nested loop tốt cho tenant nhỏ.
- Cần hash join hoặc access path khác cho tenant lớn.
- Bị parameter sniffing nếu plan compile từ một cực phân bố.

Bộ test nên có:

- Giá trị phổ biến.
- Giá trị hiếm.
- Giá trị trả về rỗng.
- Tenant hoặc partition lớn.
- Khoảng thời gian ngắn và dài.
- Trạng thái có selectivity cao và thấp.

Mục tiêu là kiểm tra tính ổn định của plan, không chỉ tìm một parameter chứng minh thay đổi nhanh.

---

### 2.3. Quy trình phân tích Execution Plan

Một trình tự hữu ích:

#### Bước 1. Kiểm tra kết quả và số row

- Query có trả đúng dữ liệu không?
- Có trả quá nhiều row hoặc cột không?
- Có pagination thật ở database không?

#### Bước 2. So sánh Estimated Rows và Actual Rows

Chênh lệch lớn thường dẫn đến lựa chọn sai:

- Join strategy.
- Memory grant.
- Thứ tự join.
- Seek, scan hoặc lookup.

Root cause có thể là statistics cũ, data skew, correlation giữa các cột hoặc predicate khó estimate.

#### Bước 3. Xác định vị trí row tăng hoặc giảm mạnh

Quan sát:

- Scan đọc hàng triệu row rồi filter còn vài chục.
- Join làm số row phình lớn.
- Lookup lặp lại quá nhiều lần.
- Sort/aggregate xử lý lượng dữ liệu không cần thiết.

#### Bước 4. Phân tích access path

Không dùng quy tắc “seek tốt, scan xấu”.

Cần hỏi:

- Query cần bao nhiêu phần trăm bảng?
- Predicate có SARGable không?
- Index hiện tại có đúng prefix không?
- Lookup có nhân theo số row không?
- Index có cung cấp đúng sort order không?

#### Bước 5. Kiểm tra operator tốn tài nguyên

- Sort hoặc hash có spill không?
- Memory grant quá nhỏ hay quá lớn?
- Parallelism có giúp hay chỉ che query đắt?
- Có spool do tính toán hoặc truy cập lặp lại?

#### Bước 6. Đặt kế hoạch vào request path

Một plan riêng lẻ không cho thấy:

- N+1 query.
- Cùng query bị gọi lặp trong loop.
- Transaction giữ mở trong lúc gọi service khác.
- Result set lớn gây network/mapping cost.

---

### 2.4. Xây dựng giả thuyết có thể kiểm chứng

Mỗi nhận xét phải tạo thành giả thuyết đo được.

Nhận xét yếu:

```text
Query scan nên cần index.
```

Giả thuyết tốt hơn:

```text
Predicate TenantId = ? AND Status = ? kết hợp ORDER BY CreatedAt DESC
đang đọc 1,8 triệu row để trả 50 row.

Index (TenantId, Status, CreatedAt DESC, Id DESC)
có thể cung cấp filter và sort order,
giảm logical reads và loại bỏ Sort.

Cần kiểm tra selectivity của Status,
write cost, index trùng và parameter của tenant lớn.
```

Một giả thuyết đầy đủ gồm:

1. Cơ chế gây chậm.
2. Bằng chứng hiện tại.
3. Thay đổi dự kiến.
4. Metric được kỳ vọng thay đổi.
5. Tác dụng phụ cần theo dõi.

---

## 3. Thiết kế và kiểm chứng thay đổi

### 3.1. Thứ tự ưu tiên giải pháp

Ưu tiên giải pháp gần root cause và có phạm vi ảnh hưởng nhỏ.

#### 3.1.1. Giảm dữ liệu không cần thiết

- Chỉ select cột cần dùng.
- Filter sớm.
- Pagination đúng.
- Giới hạn khoảng thời gian.
- Không load object graph chỉ để tính aggregate.

#### 3.1.2. Điều chỉnh query shape

- Làm predicate SARGable.
- Loại implicit conversion.
- Thay correlated subquery đắt bằng query shape phù hợp.
- Gộp N+1 thành số query hữu hạn.
- Đưa filter/aggregate xuống database thay vì in-memory.

#### 3.1.3. Thiết kế hoặc điều chỉnh Index

- Key columns theo equality, range và sort.
- INCLUDE chỉ các cột thực sự cần.
- Tránh index trùng prefix.
- Đánh giá filtered/partial index nếu phù hợp.
- Tính write cost và dung lượng.

#### 3.1.4. Điều chỉnh estimate hoặc plan instability

- Cập nhật/thiết kế statistics phù hợp.
- Xử lý data skew.
- Kiểm tra parameterization và plan reuse.
- Chỉ dùng hint/recompile khi hiểu rõ chi phí và phạm vi.

#### 3.1.5. Thay đổi boundary của workload

- Tách report khỏi OLTP.
- Precompute hoặc materialize dữ liệu đọc.
- Chạy export bất đồng bộ.
- Dùng read model, cache hoặc search khi access pattern không phù hợp relational query trực tiếp.

Cache không phải bước mặc định đầu tiên. Cache có thể che query xấu, đồng thời tạo thêm invalidation, stampede và consistency problem.

---

### 3.2. Đánh giá thay đổi Index

Trước khi đề xuất index, cần trả lời:

#### Lợi ích đọc

- Query nào sử dụng?
- Tần suất bao nhiêu?
- Logical reads giảm dự kiến bao nhiêu?
- Có loại sort hoặc lookup không?
- Có ổn với nhiều parameter không?

#### Chi phí ghi

- Những bảng nào có write rate cao?
- Cột index có thường xuyên update không?
- Index có rộng không?
- Log volume và storage tăng thế nào?
- Rebuild/create index có khóa hoặc gây I/O burst không?

#### Tính trùng lặp

- Index hiện có đã chứa prefix tương tự chưa?
- Có thể mở rộng index hiện có thay vì thêm mới không?
- Mở rộng có làm query khác hoặc write workload tệ hơn không?

#### Vòng đời

- Ai theo dõi index sau deploy?
- Khi nào xác nhận nó được sử dụng?
- Điều kiện rollback là gì?
- Index cũ có được xóa trong cùng deployment hay tách riêng?

Không nên tạo index mới và xóa index cũ trong cùng một bước nếu chưa quan sát workload thực.

---

### 3.3. Kiểm chứng thay đổi

Một bài test query tuning cần nhiều hơn so sánh stopwatch.

#### 3.3.1. Correctness

- Kết quả trước và sau có giống nhau không?
- Thứ tự pagination có ổn định không?
- `NULL`, duplicate và boundary date có đúng không?

#### 3.3.2. Performance

- Duration.
- CPU.
- Logical reads.
- Physical reads trong điều kiện phù hợp.
- Rows processed.
- Memory grant và spill.
- Execution plan.

#### 3.3.3. Stability

- Parameter phổ biến và hiếm.
- Data volume lớn.
- Warm/cold cache khi có ý nghĩa.
- Nhiều lần thực thi.
- Concurrency gần production.

#### 3.3.4. Side Effects

- Insert/update/delete throughput.
- Lock duration.
- Log generation.
- Storage.
- Maintenance window.

Một query nhanh hơn nhưng làm toàn hệ thống kém ổn định hơn chưa phải kết quả tốt.

---

## 4. Triển khai và quản trị rủi ro

### 4.1. Chiến lược triển khai

Các thay đổi query performance có thể ảnh hưởng workload lớn dù diff code nhỏ.

Quy trình rollout:

```text
Chuẩn bị baseline
→ kiểm thử trên dữ liệu production-like
→ xác định metric và ngưỡng rollback
→ triển khai thay đổi có thể quan sát
→ theo dõi plan và tài nguyên thật
→ xác nhận nhiều chu kỳ tải
→ dọn index/code cũ ở thay đổi riêng
```

Với index lớn:

- Ước lượng thời gian tạo và dung lượng tạm.
- Kiểm tra online/concurrent index build theo database.
- Chọn thời điểm tải phù hợp.
- Theo dõi blocking, transaction log và replication lag.
- Không giả định từ khóa “online” nghĩa là không có bất kỳ lock nào.

Với query rewrite:

- Có thể dùng feature flag hoặc chạy song song để so sánh.
- Ghi lại query fingerprint/version.
- Theo dõi lỗi correctness, không chỉ latency.

---

### 4.2. Đánh giá sau triển khai

Sau deploy, cần đối chiếu với baseline:

| Metric | Câu hỏi |
|---|---|
| Latency | p50/p95/p99 có giảm không? |
| Logical reads | Query có thực sự đọc ít page hơn không? |
| CPU | Tổng CPU/query và CPU toàn DB thay đổi thế nào? |
| Execution count | Query có bị gọi nhiều hơn do code path mới không? |
| Plan | Plan mong muốn có được sử dụng ổn định không? |
| Writes | Insert/update latency có tăng không? |
| Blocking | Lock duration hoặc blocking chain có thay đổi không? |
| Storage/log | Dung lượng và log generation tăng bao nhiêu? |

Không kết luận chỉ từ một ảnh plan đẹp. Thành công phải xuất hiện ở metric của workload thật.

---

### 4.3. Các anti-pattern trong tối ưu truy vấn

#### 4.3.1. Thêm Index theo Missing Index Suggestion

Suggestion không hiểu toàn bộ write workload, index trùng, dung lượng hoặc chiến lược rollout.

#### 4.3.2. Tăng timeout

Timeout lớn hơn chỉ làm request chờ lâu hơn và có thể giữ tài nguyên lâu hơn. Chỉ điều chỉnh khi thời gian hợp lệ của nghiệp vụ thật sự cần dài hơn.

#### 4.3.3. Dùng `NOLOCK` hoặc isolation yếu để né blocking

Điều này thay đổi semantics dữ liệu. Dirty/inconsistent read không phải giải pháp hiệu năng miễn phí.

#### 4.3.4. Ép hint quá sớm

Hint khóa optimizer vào giả định hiện tại. Khi dữ liệu đổi, hint có thể trở thành nguyên nhân của plan xấu.

#### 4.3.5. Benchmark trên dữ liệu quá nhỏ

Plan tối ưu cho vài nghìn row có thể khác hoàn toàn production.

#### 4.3.6. Chỉ đo duration

Duration có thể giảm do cache ấm trong khi logical reads không đổi. Kết quả khó lặp lại khi cache pressure xuất hiện.

#### 4.3.7. Tối ưu query nhưng bỏ qua N+1

Giảm mỗi query từ 10 ms xuống 5 ms không cứu request gọi query đó 500 lần.

#### 4.3.8. Dùng cache để che mọi vấn đề

Cache không sửa write amplification, blocking, query dùng trong transaction hoặc cache-miss path.

---

## 5. Tình huống phân tích thực tế

### 5.1. Truy vấn danh sách đơn hàng theo tenant

#### 5.1.1. Triệu chứng

```text
GET /orders p95 = 3.2 s
Tenant nhỏ: 120 ms
Tenant lớn: 4–8 s
DB CPU trung bình, logical reads/query rất cao
```

Query:

```sql
SELECT Id, OrderNo, CustomerId, Status, TotalAmount, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
  AND Status = @status
  AND IsDeleted = 0
ORDER BY CreatedAt DESC, Id DESC
OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY;
```

#### 5.1.2. Bằng chứng

- Actual plan scan một index bắt đầu bằng `TenantId`.
- Đọc hơn một triệu row rồi mới filter `Status` và `IsDeleted`.
- Có Sort trước khi trả 50 row.
- Estimate cho tenant lớn thấp hơn actual nhiều lần.
- Index hiện tại không cung cấp đủ filter và sort order.

#### 5.1.3. Giả thuyết

Một index bám theo equality filter và sort có thể giảm lượng page đọc:

```sql
CREATE INDEX IX_Orders_Tenant_Status_Active_Created_Id
ON Orders(TenantId, Status, CreatedAt DESC, Id DESC)
INCLUDE (OrderNo, CustomerId, TotalAmount)
WHERE IsDeleted = 0;
```

Nếu database không hỗ trợ filtered/partial index, cần đánh giá việc đưa `IsDeleted` vào key và ảnh hưởng selectivity.

#### 5.1.4. Kiểm chứng

So sánh trên tenant nhỏ, vừa và lớn:

- Result set và thứ tự giống nhau.
- Sort operator được loại bỏ.
- Logical reads giảm rõ ràng.
- Estimate/actual được kiểm tra lại.
- Insert/update benchmark không vượt ngưỡng.

#### 5.1.5. Rollout

- Tạo index theo cơ chế giảm blocking mà engine hỗ trợ.
- Theo dõi log, storage và replication lag.
- Deploy query nếu cần sau khi index sẵn sàng.
- Quan sát workload thật trước khi xem xét xóa index cũ.

#### 5.1.6. Giới hạn

Nếu người dùng nhảy tới page rất sâu, `OFFSET` vẫn phải đi qua nhiều entry. Khi đó cần cân nhắc keyset pagination:

```sql
WHERE TenantId = @tenantId
  AND Status = @status
  AND IsDeleted = 0
  AND (
       CreatedAt < @lastCreatedAt
       OR (CreatedAt = @lastCreatedAt AND Id < @lastId)
  )
ORDER BY CreatedAt DESC, Id DESC
FETCH NEXT 50 ROWS ONLY;
```

Index giải quyết access path; keyset pagination giải quyết chi phí tăng theo độ sâu trang.

---

### 5.2. Chênh lệch giữa Cold Cache và Warm Cache

#### 5.2.1. Triệu chứng

Lần đầu report chạy 20 giây, lần thứ hai còn 3 giây.

#### 5.2.2. Giả thuyết

- Lần đầu phát sinh nhiều physical reads.
- Lần sau các page đã nằm trong Buffer Pool.
- Query vẫn có logical reads rất cao.

#### 5.2.3. Sai lệch phân tích

Chỉ benchmark lần thứ hai rồi kết luận query đã ổn, hoặc mua thêm RAM mà không kiểm tra lượng page query yêu cầu.

#### 5.2.4. Hướng xử lý

1. Đo logical và physical reads riêng.
2. Xem plan để tìm scan, join, sort hoặc lookup lớn.
3. Giảm số page phải xử lý trước.
4. Sau đó mới đánh giá working set, Buffer Pool và storage.
5. Nếu report tự nhiên phải đọc lượng dữ liệu lớn, cân nhắc tách workload khỏi OLTP.

---

## 6. Công cụ thực hành và nguyên tắc

### 6.1. Checklist phân tích truy vấn chậm

#### Triệu chứng

- [ ] Endpoint/job và business impact đã rõ?
- [ ] Có timestamp, frequency và percentile?
- [ ] Chậm với mọi parameter hay một nhóm?
- [ ] Có deploy hoặc data growth liên quan?

#### Phạm vi

- [ ] Thời gian nằm ở pool, blocking, execute, network hay application?
- [ ] Query fingerprint nào đóng góp lớn nhất?
- [ ] Có N+1 hoặc query trong loop?

#### Bằng chứng database

- [ ] Có actual plan?
- [ ] Estimated rows và actual rows lệch ở đâu?
- [ ] Logical/physical reads bao nhiêu?
- [ ] CPU, duration, row count và wait là gì?
- [ ] Có sort/hash spill, lookup hoặc scan lớn?

#### Thiết kế giải pháp

- [ ] Có thể giảm row/cột trước không?
- [ ] Predicate có SARGable không?
- [ ] Index hiện tại có thể tái sử dụng không?
- [ ] Index mới ảnh hưởng ghi và storage thế nào?
- [ ] Root cause có phải data skew/statistics/plan reuse?
- [ ] Use case có cần đổi pagination hoặc read model?

#### Kiểm thử và rollout

- [ ] Có baseline trước thay đổi?
- [ ] Đã test nhiều nhóm parameter?
- [ ] Đã kiểm tra correctness?
- [ ] Có metric thành công và ngưỡng rollback?
- [ ] Đã theo dõi plan và workload sau deploy?

---

### 6.2. Mẫu đề xuất tối ưu truy vấn

```text
Problem
- API/job bị ảnh hưởng:
- Business impact:
- Baseline:

Evidence
- Query fingerprint:
- Representative parameters:
- Actual plan:
- Logical reads / CPU / duration / rows:
- Wait hoặc blocking:

Root cause
- Cơ chế gây chậm:
- Vì sao dữ liệu hiện tại chứng minh giả thuyết:

Change
- Query/index/schema thay đổi:
- Metric kỳ vọng:

Trade-offs
- Write cost:
- Storage/log:
- Lock/rollout risk:
- Tác động query khác:

Validation
- Correctness cases:
- Parameter/data-volume cases:
- Concurrency test:

Rollout
- Thứ tự triển khai:
- Monitoring:
- Rollback condition:

Result
- Trước/sau:
- Điều còn chưa giải quyết:
```

Mẫu này biến một đề xuất “thêm index để query nhanh hơn” thành quyết định kỹ thuật có thể review và kiểm chứng.

---

### 6.3. Nguyên tắc thực hành

1. Bắt đầu từ business impact và workload, không bắt đầu từ cú pháp.
2. Tách thời gian chờ khỏi thời gian thực thi.
3. Đo execution count, CPU, reads và rows; duration một mình chưa đủ.
4. So sánh estimate với actual để hiểu quyết định của optimizer.
5. Chuyển mọi nhận xét thành giả thuyết có metric kiểm chứng.
6. Giảm dữ liệu không cần thiết trước khi thêm tài nguyên.
7. Đánh giá index trên cả read path và write path.
8. Test data skew và nhiều nhóm parameter.
9. Thiết kế rollout, monitoring và rollback cùng lúc với giải pháp.
10. Xác nhận bằng workload production sau triển khai.

**Kết luận**: Query tuning là một vòng điều tra kỹ thuật khép kín:

```text
Quan sát
→ khoanh vùng
→ đo lường
→ đọc plan và tài nguyên
→ xác định root cause
→ chọn thay đổi ít rủi ro
→ kiểm thử
→ rollout
→ xác nhận
```

Khi quy trình này được thực hiện nhất quán, Index, Execution Plan và Storage I/O không còn là các mảng kiến thức rời rạc mà trở thành công cụ để giải quyết vấn đề production có bằng chứng.
