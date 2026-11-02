# Relational Query Patterns

Relational query pattern là một cấu trúc truy vấn có thể tái sử dụng để biểu diễn một quan hệ đầu ra cụ thể. Pattern xác định row nào được giữ lại, mỗi entity tạo bao nhiêu row và cách xử lý trường hợp không có dữ liệu liên quan.

Pattern không phải mẹo rút ngắn SQL. Hai query có thể trả cùng kết quả trên dữ liệu hiện tại nhưng khác nhau khi xuất hiện row trùng, `NULL` hoặc nhiều bản ghi có cùng thời điểm.

## Result contract

Trước khi chọn pattern, cần xác định bốn thuộc tính của kết quả.

### Row identity

Row identity trả lời câu hỏi một row output đại diện cho đối tượng nào:

```text
Một Customer
Một Order
Một cặp Customer–Order
Một nhóm Order của Customer
```

Nếu output đại diện cho Customer, một phép join làm Customer lặp lại theo số Order đã phá vỡ row identity.

### Cardinality

Cardinality là số row output mà mỗi input entity có thể tạo ra:

```text
Customer → đúng một row
Customer → không hoặc một Order mới nhất
Customer → nhiều Order
Customer → tối đa ba Order giá trị cao nhất
```

`DISTINCT` không thay thế được cardinality contract. Nó chỉ loại những row có toàn bộ giá trị output giống nhau.

### NULL semantics

`NULL` không bằng bất kỳ giá trị nào, kể cả một `NULL` khác. Predicate có thể nhận ba kết quả: `TRUE`, `FALSE` hoặc `UNKNOWN`.

Pattern dùng `NOT IN`, outer join hoặc aggregate phải xác định rõ `NULL` đại diện cho giá trị chưa biết hay quan hệ không tồn tại.

### Deterministic ordering

Pagination, ranking và chọn row đầu tiên cần ordering duy nhất:

```sql
ORDER BY createdAt DESC, id DESC
```

`id` là tie-breaker khi nhiều row có cùng `createdAt`. Nếu thiếu tie-breaker, hai lần chạy có thể chọn row khác nhau dù dữ liệu không đổi.

## Semi Join với `EXISTS`

Semi Join giữ row bên trái nếu relation bên phải có ít nhất một row phù hợp. Output chỉ chứa row bên trái; số row phù hợp bên phải không làm nhân kết quả.

Cấu trúc:

```sql
SELECT left_columns
FROM left_relation l
WHERE EXISTS (
  SELECT 1
  FROM right_relation r
  WHERE r.foreignKey = l.id
    AND right_predicate
);
```

Giả sử có dữ liệu:

**customers**

| id | ten |
|---:|---|
| 1 | Lan |
| 2 | Minh |
| 3 | An |

**orders**

| id | khachHangId | trangThai | tongTien |
|---:|---:|---|---:|
| 101 | 1 | PAID | 500000 |
| 102 | 1 | CANCELLED | 300000 |
| 201 | 2 | PAID | 900000 |

Yêu cầu là lấy Customer có ít nhất một Order đã thanh toán:

```sql
SELECT c.id, c.ten
FROM customers c
WHERE EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.khachHangId = c.id
    AND o.trangThai = 'PAID'
);
```

Kết quả:

| id | ten |
|---:|---|
| 1 | Lan |
| 2 | Minh |

Lan chỉ xuất hiện một lần dù có nhiều Order. `EXISTS` trả lời câu hỏi về sự tồn tại, không lấy dữ liệu từ relation bên phải.

Query sau có contract khác:

```sql
SELECT c.id, c.ten, o.id AS donHangId
FROM customers c
JOIN orders o ON o.khachHangId = c.id
WHERE o.trangThai = 'PAID';
```

Output đại diện cho cặp Customer–Order. Nếu bỏ `donHangId` rồi thêm `DISTINCT` để ép mỗi Customer còn một row, query đang sửa hậu quả của một cardinality không phù hợp.

Chọn `EXISTS` khi output chỉ cần entity bên trái và yêu cầu chỉ là “có ít nhất một row liên quan”.

## Anti Join với `NOT EXISTS`

Anti Join giữ row bên trái khi relation bên phải không có row phù hợp.

Cấu trúc:

```sql
SELECT left_columns
FROM left_relation l
WHERE NOT EXISTS (
  SELECT 1
  FROM right_relation r
  WHERE r.foreignKey = l.id
    AND right_predicate
);
```

Customer chưa từng có Order:

```sql
SELECT c.id, c.ten
FROM customers c
WHERE NOT EXISTS (
  SELECT 1
  FROM orders o
  WHERE o.khachHangId = c.id
);
```

Kết quả:

| id | ten |
|---:|---|
| 3 | An |

### `NOT IN` và `NULL`

Query sau có vẻ tương đương:

```sql
SELECT c.id, c.ten
FROM customers c
WHERE c.id NOT IN (
  SELECT o.khachHangId
  FROM orders o
);
```

Nếu subquery trả một `khachHangId = NULL`, phép so sánh có thể trở thành `UNKNOWN` và làm query không trả row như mong đợi.

`NOT EXISTS` đặt điều kiện tương quan trực tiếp giữa hai relation nên biểu diễn anti-join rõ hơn. Chỉ dùng `NOT IN` khi tính không `NULL` của tập bên phải đã được bảo đảm và semantics đó là chủ ý.

## Conditional Aggregation

Conditional Aggregation tính nhiều metric trên cùng một tập row bằng cách đặt điều kiện bên trong aggregate.

Cấu trúc chung:

```sql
SUM(
  CASE
    WHEN condition THEN numeric_value
    ELSE 0
  END
)
```

Dashboard cần một row cho mỗi Customer, gồm tổng số Order, số Order đã thanh toán và doanh thu đã thanh toán:

```sql
SELECT c.id,
       c.ten,
       COUNT(o.id) AS tongDonHang,
       SUM(
         CASE
           WHEN o.trangThai = 'PAID' THEN 1
           ELSE 0
         END
       ) AS donHangDaThanhToan,
       SUM(
         CASE
           WHEN o.trangThai = 'PAID' THEN o.tongTien
           ELSE 0
         END
       ) AS doanhThuDaThanhToan
FROM customers c
LEFT JOIN orders o ON o.khachHangId = c.id
GROUP BY c.id, c.ten
ORDER BY c.id;
```

Kết quả:

| id | ten | tongDonHang | donHangDaThanhToan | doanhThuDaThanhToan |
|---:|---|---:|---:|---:|
| 1 | Lan | 2 | 1 | 500000 |
| 2 | Minh | 1 | 1 | 900000 |
| 3 | An | 0 | 0 | 0 |

`LEFT JOIN` giữ Customer chưa có Order. `COUNT(o.id)` không đếm row có `o.id = NULL`. Mỗi `CASE` chỉ thay đổi giá trị đưa vào aggregate, không tạo thêm lần đọc relation.

Conditional Aggregation phù hợp khi các metric dùng chung source, join và phạm vi dữ liệu. Nếu mỗi metric có quan hệ hoặc filter hoàn toàn khác, một query lớn có thể làm cardinality khó kiểm soát.

## Greatest-N-per-Group

Greatest-N-per-Group chọn một hoặc một số row đứng đầu trong từng group. Pattern gồm hai bước:

1. Xếp hạng row độc lập trong từng group.
2. Lọc những vị trí cần giữ.

### Row mới nhất của mỗi Customer

```sql
WITH donHangDaXepHang AS (
  SELECT id,
         khachHangId,
         createdAt,
         tongTien,
         ROW_NUMBER() OVER (
           PARTITION BY khachHangId
           ORDER BY createdAt DESC, id DESC
         ) AS thuHang
  FROM orders
)
SELECT id,
       khachHangId,
       createdAt,
       tongTien
FROM donHangDaXepHang
WHERE thuHang = 1;
```

`PARTITION BY` tạo một ranking riêng cho mỗi Customer. Ordering đặt Order mới nhất trước; `id` giải quyết tie.

Đổi điều kiện thành `thuHang <= 3` để lấy ba Order mới nhất. Nếu các row bằng nhau phải cùng hạng, cần xác định lại contract và chọn `RANK` hoặc `DENSE_RANK` thay vì `ROW_NUMBER`.

### Customer chưa có Order

Ranking chỉ tạo row cho Customer có Order. Nếu output phải giữ tất cả Customer, cần outer join sau khi đã chọn row mới nhất:

```sql
WITH donHangDaXepHang AS (
  SELECT id,
         khachHangId,
         createdAt,
         tongTien,
         ROW_NUMBER() OVER (
           PARTITION BY khachHangId
           ORDER BY createdAt DESC, id DESC
         ) AS thuHang
  FROM orders
)
SELECT c.id,
       c.ten,
       o.id AS donHangGanNhatId,
       o.createdAt AS thoiDiemDatGanNhat
FROM customers c
LEFT JOIN donHangDaXepHang o
  ON o.khachHangId = c.id
 AND o.thuHang = 1;
```

Điều kiện `o.thuHang = 1` nằm trong `ON`. Nếu chuyển xuống `WHERE`, Customer không có Order bị loại và outer join trở thành inner join về mặt kết quả.

## Keyset Pagination

Keyset Pagination dùng key cuối của trang hiện tại làm cursor để xác định vị trí bắt đầu của trang tiếp theo.

Ordering phải:

- Ổn định.
- Có tie-breaker.
- Được cursor biểu diễn đầy đủ.

Trang đầu:

```sql
SELECT id,
       khachHangId,
       createdAt,
       tongTien
FROM orders
ORDER BY createdAt DESC, id DESC
LIMIT 50;
```

Giả sử row cuối có:

```text
createdAt = 2026-07-20 09:30:00
id        = 9120
```

Trang tiếp theo:

```sql
SELECT id,
       khachHangId,
       createdAt,
       tongTien
FROM orders
WHERE createdAt < '2026-07-20 09:30:00'
   OR (
     createdAt = '2026-07-20 09:30:00'
     AND id < 9120
   )
ORDER BY createdAt DESC, id DESC
LIMIT 50;
```

Hai phần của predicate khớp với ordering giảm dần:

- Row có `createdAt` nhỏ hơn nằm sau cursor.
- Khi `createdAt` bằng nhau, row có `id` nhỏ hơn nằm sau cursor.

Nếu chỉ truyền `createdAt`, các Order cùng timestamp có thể bị lặp hoặc bị bỏ qua.

Keyset Pagination phù hợp với feed, timeline và API tải tiếp. Nó không tự hỗ trợ nhảy trực tiếp đến trang số bất kỳ vì cursor mô tả vị trí tương đối, không mô tả số trang.

## Deduplication khi đọc

Deduplication khi đọc chọn một row đại diện trong dữ liệu đã có nhiều row cùng business key. Pattern này sửa shape của kết quả; nó không bảo vệ dữ liệu khỏi bị ghi trùng.

Giả sử `importedEvents` có thể nhận lại cùng `maNgoai`:

| id | maNgoai | thoiDiemNhan | trangThai |
|---:|---|---|---|
| 1 | EVT-1001 | 09:00 | FAILED |
| 2 | EVT-1001 | 09:05 | PROCESSED |
| 3 | EVT-1002 | 09:10 | PROCESSED |

Chọn lần nhận mới nhất:

```sql
WITH suKienDaXepHang AS (
  SELECT id,
         maNgoai,
         thoiDiemNhan,
         trangThai,
         ROW_NUMBER() OVER (
           PARTITION BY maNgoai
           ORDER BY thoiDiemNhan DESC, id DESC
         ) AS thuHang
  FROM importedEvents
)
SELECT id,
       maNgoai,
       thoiDiemNhan,
       trangThai
FROM suKienDaXepHang
WHERE thuHang = 1;
```

Kết quả giữ row `id = 2` cho `EVT-1001`.

Nếu `maNgoai` phải duy nhất trong mọi trường hợp, cần constraint ở write path. Deduplication khi đọc chỉ phù hợp khi nhiều lần nhận là dữ liệu hợp lệ hoặc hệ thống đang xử lý dữ liệu lịch sử chưa thể làm sạch ngay.

## Ứng dụng kết hợp

Màn hình Customer cần đúng một row cho mỗi Customer, đồng thời hiển thị:

- Tổng số Order.
- Doanh thu đã thanh toán.
- Order gần nhất.

Mỗi CTE sở hữu một cardinality rõ ràng trước khi join:

```sql
WITH thongKeDonHang AS (
  SELECT khachHangId,
         COUNT(*) AS tongDonHang,
         SUM(
           CASE
             WHEN trangThai = 'PAID' THEN tongTien
             ELSE 0
           END
         ) AS doanhThuDaThanhToan
  FROM orders
  GROUP BY khachHangId
),
donHangDaXepHang AS (
  SELECT id,
         khachHangId,
         createdAt,
         ROW_NUMBER() OVER (
           PARTITION BY khachHangId
           ORDER BY createdAt DESC, id DESC
         ) AS thuHang
  FROM orders
),
donHangGanNhat AS (
  SELECT id,
         khachHangId,
         createdAt
  FROM donHangDaXepHang
  WHERE thuHang = 1
)
SELECT c.id,
       c.ten,
       COALESCE(s.tongDonHang, 0) AS tongDonHang,
       COALESCE(s.doanhThuDaThanhToan, 0) AS doanhThuDaThanhToan,
       g.id AS donHangGanNhatId,
       g.createdAt AS thoiDiemDatGanNhat
FROM customers c
LEFT JOIN thongKeDonHang s ON s.khachHangId = c.id
LEFT JOIN donHangGanNhat g ON g.khachHangId = c.id
ORDER BY c.id;
```

`thongKeDonHang` trả tối đa một row cho mỗi Customer. `donHangGanNhat` cũng trả tối đa một row cho mỗi Customer. Vì hai relation trung gian đã ổn định cardinality, hai phép `LEFT JOIN` không làm nhân row.

## Kiểm chứng query pattern

Trước khi thay một query shape bằng pattern khác, cần kiểm tra dữ liệu có:

- Entity không có relation con.
- Nhiều relation con.
- Business key trùng.
- Giá trị `NULL`.
- Nhiều row có cùng ordering key.
- Group có tổng bằng `0`.

Hai query chỉ tương đương khi cùng giữ:

- Row identity.
- Cardinality.
- `NULL` semantics.
- Ordering.

Hiệu năng được đánh giá sau khi semantics đã ổn định, bằng execution plan và workload đại diện. Không chọn pattern chỉ vì câu SQL ngắn hơn.

## Tổng kết

Semi Join và Anti Join biểu diễn quan hệ tồn tại mà không làm nhân row. Conditional Aggregation tính nhiều metric trên cùng input. Greatest-N-per-Group chọn row đứng đầu trong mỗi group. Keyset Pagination tiếp tục từ một ordering key ổn định. Deduplication chọn row đại diện nhưng không thay thế data constraint.

Mỗi pattern bắt đầu từ result contract. Khi row identity, cardinality, `NULL` và ordering đã rõ, query shape trở thành một quyết định có thể giải thích và kiểm chứng.
