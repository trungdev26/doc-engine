# LATERAL JOIN

Lateral join cho phép một subquery trong `FROM` tham chiếu cột của relation đứng trước nó. Có thể hiểu subquery bên phải nhận từng row bên trái làm tham số.

Cơ chế này phù hợp khi mỗi entity bên trái cần một tập kết quả nhỏ riêng, chẳng hạn Order mới nhất của từng Customer hoặc mức giá hiệu lực gần nhất của từng Product.

## Subquery trong FROM

Một subquery thông thường trong `FROM` tạo một relation độc lập.

```sql
SELECT *
FROM customers c
JOIN (
  SELECT "khachHangId", COUNT(*) AS "soDonHang"
  FROM orders
  GROUP BY "khachHangId"
) summary
  ON summary."khachHangId" = c.id;
```

Subquery `summary` không cần đọc `c.id`. Nó tổng hợp toàn bộ `orders` trước, sau đó join kết quả với `customers`.

Nếu subquery cần dùng trực tiếp `c.id`, nó trở thành correlated subquery. Trong vị trí `FROM`, PostgreSQL yêu cầu từ khóa `LATERAL` để cho phép correlation đó.

## Mô hình thực thi

Lateral join thường tạo mô hình giống nested loop:

```text
Đọc một row bên trái
    ↓
Truyền correlation key vào subquery
    ↓
Thực thi subquery cho key hiện tại
    ↓
Nối các row được trả về
    ↓
Chuyển sang row bên trái tiếp theo
```

Correlation key là giá trị từ row bên trái được subquery sử dụng, chẳng hạn `"khachHangId"`.

Mô hình này không có nghĩa PostgreSQL bắt buộc thực thi đúng từng bước vật lý như trên trong mọi plan. Optimizer có thể biến đổi query. Tuy nhiên, đây là mental model phù hợp để hiểu semantics và đánh giá chi phí.

## CROSS JOIN LATERAL

`CROSS JOIN LATERAL` chỉ giữ row bên trái khi subquery trả ít nhất một row.

```sql
SELECT c.id,
       c."ten",
       recent.id AS "donHangId",
       recent."createdAt"
FROM customers c
CROSS JOIN LATERAL (
  SELECT o.id, o."createdAt"
  FROM orders o
  WHERE o."khachHangId" = c.id
  ORDER BY o."createdAt" DESC, o.id DESC
  LIMIT 1
) recent;
```

Với mỗi Customer, subquery tìm Order mới nhất. Customer chưa có Order không xuất hiện trong kết quả.

`ORDER BY` có tie-breaker `id DESC` để chọn một row ổn định khi hai Order cùng thời gian.

## LEFT JOIN LATERAL

`LEFT JOIN LATERAL` giữ toàn bộ row bên trái. Khi subquery không có kết quả, các cột bên phải nhận `NULL`.

```sql
SELECT c.id,
       c."ten",
       recent.id AS "donHangId",
       recent."createdAt"
FROM customers c
LEFT JOIN LATERAL (
  SELECT o.id, o."createdAt"
  FROM orders o
  WHERE o."khachHangId" = c.id
  ORDER BY o."createdAt" DESC, o.id DESC
  LIMIT 1
) recent ON true;
```

`ON true` cho biết điều kiện correlation đã nằm bên trong subquery. Query này phù hợp khi báo cáo phải hiển thị cả Customer chưa mua hàng.

## Ví dụ Top-N per parent

Bài toán là lấy hai Order gần nhất của mỗi Customer đang hoạt động.

```sql
SELECT c.id AS "khachHangId",
       c."ten",
       recent.id AS "donHangId",
       recent."createdAt",
       recent."tongTien"
FROM customers c
CROSS JOIN LATERAL (
  SELECT o.id,
         o."createdAt",
         o."tongTien"
  FROM orders o
  WHERE o."khachHangId" = c.id
  ORDER BY o."createdAt" DESC, o.id DESC
  LIMIT 2
) recent
WHERE c."dangHoatDong" = true;
```

Execution order theo mental model:

1. `WHERE c."dangHoatDong" = true` tạo tập Customer bên trái.
2. Một Customer cung cấp `c.id` cho subquery.
3. Subquery tìm Order của đúng Customer đó.
4. `ORDER BY` đưa Order mới nhất lên đầu.
5. `LIMIT 2` dừng sau hai row.
6. Các row được nối với Customer hiện tại.

Điểm quan trọng là `LIMIT 2` nằm trong subquery. Nếu đặt limit ở query ngoài, nó sẽ giới hạn toàn bộ kết quả thay vì giới hạn cho từng Customer.

## Index cho lateral lookup

Lateral join có thể rất nhanh khi mỗi lần thực thi subquery là một index lookup nhỏ.

```sql
CREATE INDEX ix_orders_customer_created
ON orders("khachHangId", "createdAt" DESC, id DESC)
INCLUDE ("tongTien");
```

Thứ tự cột phản ánh cách query truy cập dữ liệu:

1. `"khachHangId"` là equality predicate từ correlation key.
2. `"createdAt" DESC, id DESC` cung cấp ordering.
3. `"tongTien"` là dữ liệu output có thể đọc trực tiếp từ index.

Với index phù hợp, PostgreSQL có thể bắt đầu tại key của Customer và dừng sau hai index entries. Thiếu index, subquery có thể scan hoặc sort nhiều Order cho mỗi Customer.

## Tư duy lựa chọn lateral join

Lateral join phù hợp khi:

- Relation bên trái đã được lọc còn tương đối ít row.
- Mỗi row bên trái chỉ cần một số row nhỏ bên phải.
- Subquery có index bắt đầu bằng correlation key.
- Logic bên phải thực sự phụ thuộc row hiện tại.

Lateral join không phù hợp khi:

- Query cần phần lớn row của relation bên phải.
- Relation bên trái rất lớn.
- Subquery phải scan một tập lớn cho mỗi correlation key.
- Một join hoặc aggregation thông thường diễn đạt semantics trực tiếp hơn.

Chi phí cần được hình dung theo dạng:

```text
Số outer rows × chi phí trung bình của một inner lookup
```

Một inner lookup nhanh vẫn có thể tạo tổng chi phí lớn nếu outer relation chứa hàng triệu row.

## Lateral join và window function

Top-N per group cũng có thể viết bằng `ROW_NUMBER`.

```sql
WITH ranked AS (
  SELECT o.*,
         ROW_NUMBER() OVER (
           PARTITION BY "khachHangId"
           ORDER BY "createdAt" DESC, id DESC
         ) AS rn
  FROM orders o
)
SELECT c.id, c."ten", r.*
FROM customers c
JOIN ranked r
  ON r."khachHangId" = c.id
WHERE c."dangHoatDong" = true
  AND r.rn <= 2;
```

Hai query có cùng mục tiêu nhưng query shape khác nhau:

- Window function thường phù hợp khi cần xử lý phần lớn Customer và phần lớn Order.
- Lateral join thường phù hợp khi tập Customer nhỏ và mỗi Customer chỉ cần rất ít Order.

Quyết định cuối cùng phải dựa trên cardinality và execution plan, không dựa trên độ dài câu SQL.

## Ứng dụng

### Bản ghi hiệu lực gần nhất

Mỗi Product cần mức giá gần nhất không vượt quá thời điểm báo cáo:

```sql
SELECT p.id,
       "giaHieuLuc"."soTien"
FROM products p
LEFT JOIN LATERAL (
  SELECT ph."soTien"
  FROM price_history ph
  WHERE ph."sanPhamId" = p.id
    AND ph."thoiDiemHieuLuc" <= :thoiDiemBaoCao
  ORDER BY ph."thoiDiemHieuLuc" DESC, ph.id DESC
  LIMIT 1
) "giaHieuLuc" ON true;
```

Index phù hợp bắt đầu bằng `("sanPhamId", "thoiDiemHieuLuc" DESC)`.

### Mở rộng JSON thành row

Lateral cũng hữu ích khi một hàm tạo nhiều row từ giá trị của row nguồn:

```sql
SELECT o.id,
       item.value
FROM orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items) item;
```

Mỗi `orders.items` được truyền vào hàm để tạo relation bên phải.

## Kế hoạch thực thi

Khi đọc `EXPLAIN (ANALYZE, BUFFERS)`, cần chú ý:

- Số `loops` của inner node.
- Số row trung bình mỗi loop.
- Inner node dùng `Index Scan` hay `Seq Scan`.
- `LIMIT` có dừng sớm không?
- Outer relation có được lọc trước nested loop không?
- Tổng buffer reads tăng theo outer rows như thế nào?

`loops` là tín hiệu quan trọng. Một inner node chỉ mất 0.1 ms nhưng chạy 100,000 loops vẫn có thể là bottleneck.

## Lỗi thiết kế thường gặp

- Thiếu index trên correlation key.
- `ORDER BY` thiếu tie-breaker.
- Dùng `CROSS JOIN LATERAL` khi cần giữ row không có kết quả.
- Đặt `LIMIT` ngoài subquery.
- Trả quá nhiều cột khiến index không còn nhỏ và hiệu quả.
- Chọn lateral join cho toàn bộ dataset mà không so sánh window plan.

## Tổng kết

Lateral join cho phép relation bên phải nhận row bên trái làm input. Sức mạnh của nó nằm ở khả năng thực hiện lookup nhỏ, có ordering và dừng sớm cho từng entity.

Hiệu năng phụ thuộc đồng thời vào số outer rows, chi phí inner lookup và index. Query đúng về semantics vẫn cần execution plan để chứng minh query shape phù hợp với workload.
