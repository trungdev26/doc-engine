# Execution Plans

Execution plan là cấu trúc mô tả cách database dự định thực hiện một câu SQL. Plan cho biết dữ liệu được đọc bằng access path nào, các relation được join theo chiến lược nào, row được lọc ở đâu và operator nào phải sort, aggregate hoặc tạo dữ liệu tạm.

Câu SQL mô tả kết quả cần nhận. Optimizer chịu trách nhiệm tìm một phương án thực thi có estimated cost thấp trong những phương án mà nó có thể xây dựng.

Execution plan không tự trả lời query tốt hay xấu. Nó cung cấp bằng chứng để đối chiếu quyết định của optimizer với số row, phân bố dữ liệu, index và workload thực tế.

## Query optimizer

Query optimizer là thành phần lựa chọn execution plan. Quá trình tối ưu thường gồm:

1. Phân tích cú pháp và xác định object được tham chiếu.
2. Biến đổi query thành biểu diễn quan hệ.
3. Tạo các access path và join order có thể sử dụng.
4. Ước lượng cardinality của từng bước.
5. Ước lượng CPU, I/O, memory và chi phí truyền row.
6. Chọn plan có estimated cost thấp trong phạm vi tìm kiếm.

Optimizer không thử mọi plan có thể tồn tại. Số join order và operator combination tăng rất nhanh khi query phức tạp, nên optimizer phải giới hạn thời gian và không gian tìm kiếm.

Plan được chọn là phương án tốt nhất theo thông tin optimizer có tại thời điểm tối ưu, không phải phương án tốt tuyệt đối cho mọi dữ liệu và mọi lần chạy.

## Cấu trúc cây

Execution plan thường được biểu diễn bằng cây operator:

```text
Result
└─ Sort
   └─ Join
      ├─ Scan orders
      └─ Lookup customers
```

Leaf operator đọc dữ liệu từ table hoặc index. Operator phía trên nhận row từ child, biến đổi chúng và chuyển kết quả cho parent.

Khi đọc plan, cần theo dõi ba luồng:

- **Luồng row:** mỗi child tạo bao nhiêu row cho parent.
- **Luồng dữ liệu:** operator phải đọc bao nhiêu page hoặc byte.
- **Luồng công việc:** operator chạy một lần hay lặp lại nhiều lần.

Giao diện plan có thể vẽ root ở trên, dưới, trái hoặc phải. Hướng vẽ không quan trọng bằng quan hệ parent–child và số liệu trên từng operator.

## Estimated plan và actual metrics

### Estimated plan

Estimated plan được tạo từ schema, index, statistics và cost model mà không cần hoàn thành toàn bộ query. Nó cho biết:

- Access path optimizer dự định sử dụng.
- Join order và join algorithm.
- Estimated rows tại từng operator.
- Estimated cost.
- Predicate và ordering được áp dụng ở đâu.

Estimated plan phù hợp để kiểm tra query có khả năng tạo workload nguy hiểm trước khi chạy. Tuy nhiên, nó chưa chứng minh runtime thực tế.

### Actual metrics

Actual metrics được thu thập khi query thật sự thực thi. Tùy hệ quản trị và công cụ, plan có thể bổ sung:

- Actual rows.
- Số lần operator được gọi.
- Thời gian thực thi.
- Số page hoặc byte được đọc.
- Memory đã dùng.
- Dữ liệu tạm hoặc spill.

Actual metrics có giá trị vì chúng cho phép so estimated rows với actual rows. Việc thu thập này thực thi query, vì vậy cần thận trọng với câu lệnh thay đổi dữ liệu hoặc query nặng trên môi trường đang hoạt động.

## Cost

Cost là đơn vị tương đối trong cost model của optimizer. Nó dùng để so sánh các phương án trong cùng quá trình tối ưu, không phải milliseconds và không phải cam kết latency.

Một operator có cost cao nhất chưa chắc là root cause duy nhất:

- Estimate sai có thể làm cost hiển thị thấp dù runtime cao.
- Operator nhỏ nhưng chạy rất nhiều lần có thể tiêu thụ phần lớn tài nguyên.
- Query có thể chờ lock hoặc storage dù CPU cost không cao.
- Plan nhanh khi cache nóng có thể chậm khi phải đọc dữ liệu từ storage.

Phân tích plan cần kết hợp cost với actual rows, loops, thời gian và lượng dữ liệu đọc.

## Khai báo `EXPLAIN`

`EXPLAIN` yêu cầu database trình bày plan cho một câu SQL:

```sql
EXPLAIN
SELECT id,
       ngayDatHang,
       tongTien
FROM orders
WHERE khachHangId = 42
ORDER BY ngayDatHang DESC, id DESC
LIMIT 50;
```

Cú pháp lấy actual metrics và định dạng output khác nhau giữa các hệ quản trị. Trước khi dùng option thực thi thật, cần xác định rõ:

- Query có thay đổi dữ liệu không.
- Query có thể đọc bao nhiêu dữ liệu.
- Công cụ có trả I/O, memory và timing hay không.
- Việc đo có làm ảnh hưởng workload hiện tại không.

## Access operators

### Table scan

Table scan đọc toàn bộ hoặc phần lớn table rồi kiểm tra predicate:

```text
Table scan orders
  filter: trangThai = 'COMPLETED'
```

Table scan phù hợp khi table nhỏ hoặc predicate trả phần lớn row. Nếu query cần 70% bảng, lookup qua index rồi quay lại table có thể đắt hơn đọc tuần tự.

### Index lookup

Index lookup đi trực tiếp đến một key hoặc một phạm vi key:

```text
Index lookup ix_orders_customer_date
  condition: khachHangId = 42
```

Lookup phù hợp khi predicate chọn ít row hoặc index đã cung cấp ordering cần thiết.

### Index range scan

Range scan đọc một đoạn liên tiếp của index:

```text
Index range scan ix_orders_customer_date
  condition:
    khachHangId = 42
    ngayDatHang >= '2026-07-01'
    ngayDatHang <  '2026-08-01'
```

Leading key xác định vùng bắt đầu. Range key xác định điểm dừng. Nếu index khớp với `ORDER BY`, plan có thể không cần operator sort riêng.

### Table lookup

Khi index không chứa đủ cột output, database dùng row locator để đọc row từ table:

```text
Index lookup
└─ Table lookup
```

Table lookup hợp lý khi chỉ xảy ra vài lần. Nếu index trả 200.000 row và mỗi row tạo một lookup, lượng I/O ngẫu nhiên có thể lớn hơn table scan.

### Covering access

Nếu index chứa đủ key, predicate và output, plan có thể trả dữ liệu mà không cần table lookup:

```text
Covering index access
  output: ngayDatHang, tongTien, trangThai
```

Covering access giảm đọc table nhưng yêu cầu index rộng hơn. Execution plan chỉ cho thấy lợi ích ở phía đọc; quyết định cuối cùng còn phải tính storage và write overhead.

## Join algorithms

Join algorithm quyết định cách hai input được kết hợp. Tên và availability có thể khác nhau, nhưng ba chiến lược sau là nền tảng để đọc plan.

### Nested Loop Join

Nested Loop lấy từng row từ outer input rồi tìm row phù hợp ở inner input:

```text
for each outerRow:
  find matching innerRows
```

Nested Loop phù hợp khi:

- Outer input nhỏ.
- Inner input có index lookup hiệu quả.
- Query cần dừng sớm.

Nó trở nên đắt khi outer input lớn vì inner operator bị gọi lặp lại nhiều lần.

```text
Outer rows: 50.000
Inner lookup loops: 50.000
```

### Hash Join

Hash Join xây hash table từ một input rồi probe bằng input còn lại:

```text
Build smaller input
  ↓
Hash table
  ↑
Probe larger input
```

Hash Join thường phù hợp với equality join trên tập dữ liệu lớn. Nó cần memory cho hash table; estimate thấp có thể khiến dữ liệu vượt memory và phải dùng storage tạm.

### Merge Join

Merge Join đọc hai input đã được sắp xếp theo join key và tiến con trỏ đồng thời:

```text
Sorted input A ─┐
                ├─ Merge matching keys
Sorted input B ─┘
```

Merge Join phù hợp khi input đã có ordering hữu ích hoặc sort có thể tái sử dụng. Nếu phải sort hai tập lớn chỉ để join, chi phí chuẩn bị có thể làm chiến lược khác phù hợp hơn.

Không phải hệ quản trị nào cũng cung cấp cùng tập join algorithm. Khi một operator không xuất hiện, cần kiểm tra capability của engine thay vì kết luận optimizer bỏ sót.

## Sort

Sort sắp xếp toàn bộ input hoặc một phần input theo key:

```text
Sort
  key: ngayDatHang DESC, id DESC
```

Chi phí sort phụ thuộc:

- Số row.
- Độ rộng row.
- Memory khả dụng.
- Input đã có ordering một phần hay chưa.
- Có `LIMIT` cho phép tối ưu Top-N hay không.

Index phù hợp có thể cung cấp ordering và loại bỏ sort. Tuy nhiên, không nên thêm index chỉ để bỏ một sort nhỏ chạy trên vài trăm row.

## Aggregate

Aggregate thu nhiều row thành group hoặc một kết quả tổng:

```sql
SELECT khachHangId,
       SUM(tongTien) AS doanhThu
FROM orders
GROUP BY khachHangId;
```

Hai chiến lược phổ biến:

- **Hash aggregate:** dùng hash table theo group key.
- **Sort/stream aggregate:** xử lý input đã được sắp xếp theo group key.

Hash aggregate cần memory theo số group. Sort-based aggregate cần ordering. Estimate số group sai có thể làm memory không đủ hoặc chọn chiến lược không phù hợp.

## Filter và residual predicate

Access condition xác định phần dữ liệu có thể loại bỏ ngay khi đọc index. Residual predicate được kiểm tra sau khi access path đã lấy row.

```text
Index condition: khachHangId = 42
Residual filter: tongTien > 1000000
```

Nếu index bắt đầu bằng `khachHangId` nhưng không tổ chức theo `tongTien`, database có thể dùng phần đầu để thu hẹp vùng đọc rồi kiểm tra `tongTien` trên từng row còn lại.

Plan có index không đồng nghĩa mọi predicate đều đã trở thành index condition.

## Materialization và dữ liệu tạm

Một số operator cần giữ lại kết quả trung gian để:

- Dùng lại nhiều lần.
- Sort.
- Build hash table.
- Loại trùng.
- Bảo đảm một boundary thực thi.

Nếu dữ liệu trung gian vượt memory, database có thể ghi phần dư xuống storage tạm. Hiện tượng này thường gọi là spill.

Spill là triệu chứng, không tự xác định root cause. Nguyên nhân có thể là:

- Actual rows lớn hơn estimate.
- Row quá rộng.
- Memory cho query bị giới hạn.
- Query xử lý quá nhiều dữ liệu trước khi lọc.
- Thiếu ordering hoặc access path phù hợp.

## Cardinality estimate

Cardinality estimate là số row optimizer dự đoán tại từng operator. Estimate ảnh hưởng trực tiếp đến:

- Access path.
- Join order.
- Join algorithm.
- Memory cần thiết.
- Quyết định materialize hoặc sort.

Ví dụ:

```text
Estimated rows: 1.000
Actual rows:   50.000
Sai lệch:      50×
```

Optimizer có thể chọn Nested Loop vì outer input dự kiến nhỏ. Khi actual input lớn gấp 50 lần, inner lookup bị lặp quá nhiều.

Sai lệch ở leaf operator có thể lan truyền lên toàn cây. Vì vậy, nên tìm operator đầu tiên nơi estimated rows bắt đầu lệch mạnh thay vì chỉ nhìn root.

## Selectivity và statistics

Selectivity mô tả mức độ predicate thu hẹp dữ liệu. Statistics cung cấp cho optimizer thông tin về:

- Số row.
- Số giá trị phân biệt.
- Phân bố giá trị.
- Giá trị phổ biến.
- Tỷ lệ `NULL`.
- Tương quan giữa giá trị và thứ tự lưu trữ, nếu engine theo dõi.

Statistics cũ hoặc không mô tả được data skew có thể làm cardinality estimate sai.

Ví dụ, `trangThai = 'FAILED'` có thể chỉ chiếm 0,1% bảng trong tuần bình thường nhưng tăng lên 20% khi hệ thống ngoài gặp sự cố. Cùng một predicate lúc đó có access cost hoàn toàn khác.

## Correlated columns

Optimizer thường phải ước lượng nhiều predicate cùng lúc:

```sql
WHERE quocGia = 'VN'
  AND thanhPho = 'Ha Noi'
```

Hai cột có quan hệ với nhau. Nếu cost model xem chúng độc lập, estimate có thể thấp hơn thực tế.

Khi phát hiện sai lệch do correlation, hướng xử lý phụ thuộc khả năng statistics và index của hệ quản trị. Trước hết cần chứng minh điểm sai bằng estimated rows và actual rows.

## Parameter values và plan reuse

Cùng một query parameterized có thể nhận giá trị với phân bố rất khác:

```sql
WHERE tenantId = 10
```

Tenant nhỏ có 1.000 order; tenant lớn có 50 triệu order. Một plan phù hợp cho tenant nhỏ có thể không phù hợp cho tenant lớn.

Cơ chế compile, cache và reuse plan khác nhau giữa các hệ quản trị và driver. Phần phân tích chung gồm:

1. So sánh plan và runtime giữa các giá trị đại diện.
2. Kiểm tra data skew.
3. Kiểm tra statistics.
4. Xác định plan có được tái sử dụng hay tối ưu lại.
5. Chỉ dùng hint hoặc cơ chế ép plan sau khi hiểu trade-off của engine.

## Memory và spill

Sort, hash join, aggregate và materialization có thể cần memory theo số row và độ rộng row.

```text
Required memory ≈ row count × row width × operator overhead
```

Nếu estimate thấp, optimizer có thể dự trù ít memory hơn thực tế. Khi operator không giữ đủ dữ liệu trong memory, temporary I/O làm latency tăng.

Khi thấy spill, cần kiểm tra:

- Estimated rows và actual rows.
- Row width.
- Cột không cần thiết trong `SELECT`.
- Predicate có thể áp dụng sớm hơn không.
- Index có thể cung cấp ordering không.
- Workload concurrent có làm memory mỗi query bị thu hẹp không.

## Thứ tự đọc execution plan

Một trình tự ổn định giúp tránh tập trung nhầm vào operator có cost hiển thị lớn nhất.

1. Xác nhận query text và parameter của lần chạy.
2. Đọc root để hiểu output và số row cuối.
3. Xác định leaf operator đọc các table chính.
4. So estimated rows với actual rows từ leaf đi lên.
5. Tìm operator đầu tiên có sai lệch lớn.
6. Kiểm tra access condition và residual predicate.
7. Kiểm tra loops của inner operator.
8. Kiểm tra sort, aggregate, hash hoặc materialization.
9. Kiểm tra memory, spill và lượng dữ liệu đọc.
10. Đối chiếu plan với latency toàn request, concurrency và lock wait.

Plan là một phần của request path. Query có plan hợp lý vẫn có thể chậm vì chờ lock, network, N+1 query hoặc gọi service khác.

## Ứng dụng

### Lịch sử đơn hàng

Query lấy 50 order gần nhất của một customer:

```sql
SELECT id,
       ngayDatHang,
       tongTien,
       trangThai
FROM orders
WHERE khachHangId = 42
ORDER BY ngayDatHang DESC, id DESC
LIMIT 50;
```

Plan không có index phù hợp có thể mang hình dạng:

```text
Limit 50
└─ Sort by ngayDatHang DESC, id DESC
   └─ Table scan orders
      filter: khachHangId = 42
```

Hai operator cần kiểm tra:

- Table scan đọc bao nhiêu row để giữ lại 50 row?
- Sort nhận bao nhiêu row trước khi `LIMIT` được áp dụng?

Index theo `(khachHangId, ngayDatHang DESC, id DESC)` tạo access path khớp filter và ordering:

```text
Limit 50
└─ Index range scan ix_orders_customer_date
   condition: khachHangId = 42
```

Lợi ích không đến từ tên “index”. Plan mới có thể đi đến vùng key cần thiết, đọc theo đúng ordering và dừng sớm.

### Table lookup lặp lại

Giả sử index chỉ chứa `khachHangId` nhưng API còn cần `tongTien` và `trangThai`:

```text
Index lookup ix_orders_customer
└─ Table lookup × 200.000
```

Root cause không phải lookup tồn tại mà là lookup count quá lớn. Các hướng cần đánh giá:

- Query có thật sự cần trả 200.000 row không?
- Predicate có thể thu hẹp sớm hơn không?
- Output có cột không cần thiết không?
- Covering index có đáng với write overhead không?
- Table scan có rẻ hơn khi kết quả chiếm phần lớn bảng không?

Không nên tự động tạo covering index trước khi trả lời các câu hỏi này.

### Báo cáo doanh thu

```sql
SELECT chiNhanhId,
       SUM(tongTien) AS doanhThu
FROM invoices
WHERE ngayHoaDon >= '2026-07-01'
  AND ngayHoaDon < '2026-08-01'
  AND trangThai = 'PAID'
GROUP BY chiNhanhId;
```

Plan có thể cần:

```text
Aggregate by chiNhanhId
└─ Scan invoices
   filter:
     ngayHoaDon trong tháng 07
     trangThai = 'PAID'
```

Nếu query đọc phần lớn dữ liệu của tháng, scan có thể hợp lý. Câu hỏi quan trọng hơn là:

- Bao nhiêu row đi vào aggregate?
- Có bao nhiêu group?
- Aggregate có spill không?
- Predicate có được áp dụng trước aggregate không?
- Báo cáo có cần bảng tổng hợp hoặc partition thay vì thêm index không?

### Predicate không indexable

```sql
SELECT id, createdAt
FROM orders
WHERE DATE(createdAt) = '2026-07-26';
```

Function trên cột có thể làm access path không xác định được range trực tiếp. Viết lại:

```sql
SELECT id, createdAt
FROM orders
WHERE createdAt >= '2026-07-26 00:00:00'
  AND createdAt <  '2026-07-27 00:00:00';
```

Plan sau khi viết lại cần được kiểm tra xem predicate đã trở thành index range condition hay chưa. Viết query indexable không bảo đảm index luôn được chọn nếu range vẫn trả phần lớn bảng.

### Data skew

Query dùng chung cho nhiều tenant:

```sql
SELECT id, tongTien
FROM orders
WHERE tenantId = 10
  AND trangThai = 'PENDING';
```

Nếu tenant `10` có dữ liệu lớn hơn phần còn lại hàng nghìn lần, plan trung bình có thể không phù hợp. Cần so sánh:

- Estimated rows và actual rows của tenant nhỏ.
- Estimated rows và actual rows của tenant lớn.
- Statistics có mô tả được giá trị phổ biến không.
- Plan có thay đổi theo parameter hay bị tái sử dụng.
- Query shape có cần tách theo workload thực tế không.

## Dấu hiệu phân tích sai

### Đồng nhất scan với thiếu index

Scan có thể là access path đúng khi query trả phần lớn table.

### Đồng nhất index lookup với plan tốt

Lookup trả hàng triệu row hoặc kéo theo table lookup lặp lại vẫn có thể đắt hơn scan.

### Chỉ nhìn cost phần trăm

Cost dựa trên estimate. Estimate sai làm tỷ lệ cost không phản ánh runtime thực.

### Chỉ nhìn root operator

Sai lệch cardinality thường bắt đầu ở leaf rồi lan lên join, sort và aggregate.

### Tối ưu từng query nhưng bỏ qua request

Một query nhanh không sửa được N+1, retry lặp, lock wait hoặc payload quá lớn.

### Tin tuyệt đối vào gợi ý index

Gợi ý tự động thường chỉ nhìn một query và lợi ích đọc, không hiểu write workload, index trùng lặp hoặc query contract.

## Khác biệt cần tách theo hệ quản trị

Các khái niệm operator tree, cardinality, cost, access path, join algorithm, sort, aggregate và spill có thể dùng chung. Những phần sau cần đọc tài liệu riêng của engine:

- Tên plan node.
- Cú pháp thu actual metrics, I/O và timing.
- Join algorithm được hỗ trợ.
- Plan cache và cơ chế tối ưu query parameterized.
- Memory allocation cho từng operator.
- Format JSON, text hoặc visual plan.
- Gợi ý index và query hint.
- Parallel execution.

Không nên lấy tên operator hoặc option đo lường của một engine làm định nghĩa chung cho execution plan.

## Quy trình đánh giá thay đổi

Mọi thay đổi query hoặc index cần một baseline:

1. Lưu query, parameter và plan trước thay đổi.
2. Ghi lại row count, runtime, lượng dữ liệu đọc và spill.
3. Xác định một root cause có bằng chứng.
4. Thay đổi một yếu tố: query shape, index hoặc statistics.
5. Chạy lại trên cùng dữ liệu và parameter.
6. So sánh plan mới với baseline.
7. Kiểm tra tác động tới workload ghi và query liên quan.
8. Xác định cách rollback.

Nếu rewrite làm thay đổi row identity, cardinality, `NULL` semantics hoặc ordering, đó không còn là tối ưu tương đương.

## Tổng kết

Execution plan mô tả chuỗi operator mà database dùng để thực hiện SQL. Access path quyết định cách đọc row; join algorithm quyết định cách kết hợp relation; sort, aggregate và materialization quyết định cách biến đổi tập dữ liệu.

Estimated rows là đầu vào quan trọng của optimizer. Actual rows, loops, memory, spill và lượng dữ liệu đọc cho biết plan có phù hợp với dữ liệu thật hay không.

Đọc plan hiệu quả không bắt đầu từ operator có cost lớn nhất. Nó bắt đầu từ query contract, đi từ leaf lên root, tìm điểm estimate bắt đầu sai và kiểm chứng từng thay đổi bằng số liệu.
