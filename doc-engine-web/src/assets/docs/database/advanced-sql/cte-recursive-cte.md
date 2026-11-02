# CTE và Recursive CTE

Common Table Expression (CTE) là một tập kết quả trung gian có tên, chỉ tồn tại trong phạm vi của một câu lệnh SQL. CTE giúp biểu diễn một truy vấn phức tạp thành các bước quan hệ có tên rõ ràng.

Recursive CTE là CTE có khả năng dùng kết quả của vòng trước làm đầu vào cho vòng tiếp theo. Cơ chế này phù hợp với dữ liệu có quan hệ lặp lại như category cha–con, cơ cấu tổ chức hoặc dependency graph.

## Mô hình quan hệ trung gian

Một CTE không phải bảng vật lý. Nó mô tả một quan hệ trung gian mà query chính có thể tham chiếu.

```text
Base tables
    ↓
CTE 1: lọc dữ liệu
    ↓
CTE 2: biến đổi hoặc tổng hợp
    ↓
Final query
```

Tên CTE có phạm vi từ sau phần khai báo `WITH` đến hết câu lệnh hiện tại. Câu lệnh SQL tiếp theo không thể sử dụng lại tên đó.

```sql
WITH "donHangDaThanhToan" AS (
  SELECT id, "khachHangId", "tongTien"
  FROM orders
  WHERE "trangThai" = 'PAID'
)
SELECT *
FROM "donHangDaThanhToan";
```

Trong truy vấn này, `"donHangDaThanhToan"` mô tả kết quả của phép lọc. Nó không tự tạo temporary table và không mặc định ghi dữ liệu xuống disk.

## Cơ chế thực thi của CTE

CTE làm rõ cấu trúc logic, còn PostgreSQL optimizer quyết định cấu trúc vật lý. Một CTE không recursive có thể được inline vào query chính, nghĩa là optimizer xử lý nó như một subquery và có thể đẩy predicate xuống gần source table.

Trong trường hợp khác, kết quả CTE có thể được materialize: PostgreSQL tính tập kết quả trước rồi đọc lại nó. Materialization hữu ích khi một kết quả tốn kém được dùng nhiều lần, nhưng có thể tạo chi phí nếu tập trung gian lớn.

Vì vậy, hai khái niệm cần được tách biệt:

- CTE là cấu trúc logic trong SQL.
- Inline hoặc materialize là quyết định thực thi của optimizer.

Không nên dùng CTE với giả định rằng nó luôn cache kết quả hoặc luôn nhanh hơn subquery.

## Cơ chế đệ quy

Recursive CTE gồm hai phần:

- **Anchor query** tạo tập row ban đầu.
- **Recursive member** nhận row của vòng trước và tạo row cho vòng tiếp theo.

PostgreSQL duy trì một working table nội bộ:

```text
1. Chạy anchor query.
2. Đưa kết quả anchor vào output và working table.
3. Chạy recursive member với working table hiện tại.
4. Đưa row mới vào output.
5. Thay working table bằng row vừa tạo.
6. Lặp lại đến khi working table rỗng.
```

Điều kiện kết thúc không nằm ở một từ khóa riêng. Recursion dừng khi recursive member không trả thêm row.

`UNION ALL` giữ toàn bộ row giữa các vòng. `UNION` loại trùng nhưng cần thêm công việc so sánh và không thay thế cơ chế chống cycle cho mọi bài toán graph.

## Bài toán tổng hợp doanh thu

Giả sử báo cáo cần tính tổng doanh thu từ các đơn hàng đã thanh toán theo từng khách hàng. Bài toán gồm hai phép biến đổi:

1. Lọc các đơn hàng có `"trangThai" = 'PAID'`.
2. Nhóm kết quả theo `"khachHangId"` và tính tổng `"tongTien"`.

### Truy vấn không dùng CTE

Có thể đặt bước lọc trong một subquery:

```sql
SELECT "khachHangId",
       SUM("tongTien") AS "doanhThu"
FROM (
  SELECT "khachHangId", "tongTien"
  FROM orders
  WHERE "trangThai" = 'PAID'
) "donHangDaThanhToan"
GROUP BY "khachHangId";
```

Truy vấn này hợp lệ và vẫn rõ ràng khi bài toán chỉ có hai bước. Tuy nhiên, nếu tiếp tục bổ sung bước xếp hạng, lọc theo ngưỡng hoặc kết hợp với dữ liệu khác, các lớp subquery sẽ lồng sâu hơn và quan hệ phụ thuộc giữa chúng khó quan sát hơn.

### Truy vấn dùng CTE

CTE đưa bước lọc lên đầu statement và đặt cho kết quả trung gian một tên có ý nghĩa:

```sql
WITH "donHangDaThanhToan" AS (
  SELECT "khachHangId", "tongTien"
  FROM orders
  WHERE "trangThai" = 'PAID'
)
SELECT "khachHangId",
       SUM("tongTien") AS "doanhThu"
FROM "donHangDaThanhToan"
GROUP BY "khachHangId";
```

Có thể đọc truy vấn theo dòng dữ liệu:

1. `"donHangDaThanhToan"` giữ các row có `"trangThai" = 'PAID'`.
2. Query chính nhóm tập row đó theo `"khachHangId"`.
3. `SUM` tính doanh thu trong từng group.

Hai phiên bản mô tả cùng một kết quả. CTE không tự làm truy vấn nhanh hơn; lợi ích trước tiên là làm rõ từng quan hệ trung gian và cách các phép biến đổi phụ thuộc vào nhau.

### Mở rộng thành nhiều giai đoạn

Khi báo cáo chỉ lấy khách hàng có doanh thu từ 10 triệu đồng, có thể nối thêm một CTE thay vì tạo thêm một lớp subquery:

```sql
WITH "donHangDaThanhToan" AS (
  SELECT "khachHangId", "tongTien"
  FROM orders
  WHERE "trangThai" = 'PAID'
),
"doanhThuTheoKhachHang" AS (
  SELECT "khachHangId",
         SUM("tongTien") AS "doanhThu"
  FROM "donHangDaThanhToan"
  GROUP BY "khachHangId"
)
SELECT "khachHangId", "doanhThu"
FROM "doanhThuTheoKhachHang"
WHERE "doanhThu" >= 10000000
ORDER BY "doanhThu" DESC;
```

Mỗi tên đại diện cho một phép biến đổi có ý nghĩa: lọc Order, tổng hợp theo Customer, rồi áp dụng ngưỡng báo cáo.

### Lợi ích của CTE

CTE hữu ích nhất khi truy vấn có nhiều giai đoạn và mỗi kết quả trung gian có thể được mô tả bằng một tên nghiệp vụ rõ ràng.

- **Biểu diễn dòng dữ liệu:** thứ tự các CTE cho thấy dữ liệu được lọc, tổng hợp và biến đổi qua từng giai đoạn.
- **Giảm độ sâu của truy vấn:** các quan hệ trung gian nằm cùng một cấp thay vì lồng nhiều lớp trong `FROM`.
- **Hỗ trợ kiểm tra:** có thể tạm thời chạy riêng phần thân của từng CTE để đối chiếu dữ liệu ở một boundary cụ thể.
- **Hỗ trợ tái sử dụng:** một CTE có thể được tham chiếu nhiều lần trong cùng statement khi nhiều nhánh cần chung một tập dữ liệu.
- **Biểu diễn quan hệ lặp:** Recursive CTE xử lý cây và graph có số tầng chưa biết trước.

Các lợi ích này thuộc về cấu trúc và khả năng bảo trì. Kế hoạch thực thi vẫn do optimizer quyết định; cần dùng `EXPLAIN (ANALYZE, BUFFERS)` nếu mục tiêu là đánh giá hiệu năng.

## Ví dụ Recursive CTE

Bảng `categories` lưu cấu trúc cha–con:

| id | danhMucChaId | ten |
|---:|---:|---|
| 1 | `NULL` | Electronics |
| 2 | 1 | Computers |
| 3 | 2 | Laptops |
| 4 | 3 | Ultrabooks |
| 5 | 1 | Accessories |

Yêu cầu là lấy toàn bộ cây bắt đầu từ `Electronics` mà không biết trước số tầng.

```sql
WITH RECURSIVE "cayDanhMuc" AS (
  SELECT id,
         "danhMucChaId",
         "ten",
         0 AS "doSau",
         "ten"::text AS "duongDan"
  FROM categories
  WHERE id = 1

  UNION ALL

  SELECT c.id,
         c."danhMucChaId",
         c."ten",
         t."doSau" + 1,
         t."duongDan" || ' / ' || c."ten"
  FROM categories c
  JOIN "cayDanhMuc" t
    ON c."danhMucChaId" = t.id
)
SELECT id, "ten", "doSau", "duongDan"
FROM "cayDanhMuc"
ORDER BY "duongDan";
```

Anchor query tạo `Electronics` ở `"doSau" = 0`. Vòng đầu tìm `Computers` và `Accessories`. Vòng tiếp theo tìm `Laptops`, sau đó `Ultrabooks`. Vòng cuối không tìm thấy node con nên working table rỗng.

`"doSau"` và `"duongDan"` không có sẵn trong bảng nguồn. Chúng là trạng thái được truyền và mở rộng qua mỗi iteration.

## Tư duy lựa chọn CTE

Không nên bắt đầu bằng câu hỏi “có thể dùng CTE hay không”. Hãy bắt đầu từ cấu trúc dữ liệu mà truy vấn cần tạo ra.

CTE thường là lựa chọn phù hợp khi có ít nhất một trong các dấu hiệu sau:

- Truy vấn gồm nhiều phép biến đổi và mỗi kết quả trung gian có một tên nghiệp vụ rõ ràng.
- Một tập dữ liệu trung gian được nhiều nhánh trong cùng statement sử dụng.
- Việc tách boundary giúp kiểm tra cardinality hoặc đối chiếu dữ liệu dễ hơn.
- Bài toán phải duyệt quan hệ lặp với số tầng chưa biết trước.

Subquery hoặc một truy vấn trực tiếp thường rõ hơn khi logic còn ngắn, kết quả trung gian chỉ được dùng một lần và việc đặt thêm tên không giúp người đọc hiểu tốt hơn. CTE cũng không nên được dùng như một cơ chế cache mặc định hoặc một mẹo tối ưu hiệu năng nếu chưa kiểm tra execution plan.

Trước khi tạo một CTE, có thể tự kiểm tra bằng bốn câu hỏi:

1. Kết quả trung gian này có thể được đặt một tên mô tả đúng vai trò nghiệp vụ không?
2. Tên đó có làm giảm nesting hoặc giúp dependency dễ quan sát hơn không?
3. Kết quả có được tái sử dụng hoặc tham gia recursion không?
4. Execution plan thực tế có phù hợp với mục tiêu vận hành không?

Nếu câu trả lời chỉ là “tách ra vì câu SQL đang dài”, cần xem lại boundary. Một chuỗi CTE mô phỏng từng `SELECT` nhỏ có thể dài hơn mà vẫn không diễn đạt được dòng dữ liệu.

### Tư duy thiết kế Recursive CTE

Khi thiết kế truy vấn đệ quy, cần xác định bốn yếu tố trước khi viết SQL:

1. Row nào tạo tập anchor?
2. Row của vòng trước liên kết với row mới bằng khóa nào?
3. Trạng thái nào phải truyền qua mỗi vòng?
4. Điều kiện nào bảo đảm recursion kết thúc?

Nếu không trả lời được câu thứ tư, query chưa an toàn để chạy trên dữ liệu production.

## Chu trình và giới hạn độ sâu

Dữ liệu phân cấp có thể chứa cycle, chẳng hạn A trỏ đến B và B trỏ ngược về A. Khi đó, recursive member có thể tiếp tục tạo row vô hạn.

Một cách bảo vệ là lưu đường đi đã ghé:

```sql
WITH RECURSIVE "cayDanhMuc" AS (
  SELECT id,
         "danhMucChaId",
         "ten",
         ARRAY[id] AS "idDaDuyet",
         0 AS "doSau"
  FROM categories
  WHERE id = 1

  UNION ALL

  SELECT c.id,
         c."danhMucChaId",
         c."ten",
         t."idDaDuyet" || c.id,
         t."doSau" + 1
  FROM categories c
  JOIN "cayDanhMuc" t
    ON c."danhMucChaId" = t.id
  WHERE NOT c.id = ANY(t."idDaDuyet")
    AND t."doSau" < 20
)
SELECT *
FROM "cayDanhMuc";
```

`"idDaDuyet"` ngăn một node xuất hiện lại trên cùng đường đi. Giới hạn `"doSau"` tạo thêm lớp bảo vệ vận hành khi dữ liệu có lỗi hoặc graph lớn bất thường.

## Materialization và kế hoạch thực thi

PostgreSQL hỗ trợ chỉ thị `MATERIALIZED` và `NOT MATERIALIZED` cho CTE không recursive.

```sql
WITH "donHangDaThanhToan" AS NOT MATERIALIZED (
  SELECT *
  FROM orders
  WHERE "trangThai" = 'PAID'
)
SELECT *
FROM "donHangDaThanhToan"
WHERE "khachHangId" = 42;
```

`NOT MATERIALIZED` cho phép optimizer xem xét inline CTE và đẩy điều kiện `"khachHangId" = 42` xuống dưới. `MATERIALIZED` buộc tính CTE trước.

Chỉ nên điều khiển hành vi này sau khi đọc `EXPLAIN (ANALYZE, BUFFERS)`. Các tín hiệu cần kiểm tra:

- CTE được scan bao nhiêu lần?
- Predicate được áp dụng trước hay sau khi tạo tập trung gian?
- Recursive member có dùng index trên `"danhMucChaId"` không?
- Estimated rows có lệch xa actual rows qua từng iteration không?
- Tập trung gian có spill hoặc sử dụng nhiều memory không?

## Lỗi thiết kế thường gặp

- Dùng CTE vì cho rằng nó luôn tối ưu hơn subquery.
- Đưa predicate vào query cuối khiến tập trung gian lớn hơn cần thiết.
- Recursive member thiếu index trên cột liên kết.
- Không bảo vệ cycle.
- Không đặt giới hạn độ sâu cho graph nhận dữ liệu từ bên ngoài.
- Dùng `UNION` để che dữ liệu lặp mà không hiểu nguyên nhân.

## Ứng dụng

### Danh mục lá trong một nhánh

Một category lá không còn category con. Recursive CTE xác định toàn bộ nhánh cần duyệt; `NOT EXISTS` chỉ giữ các node không có con:

```sql
WITH RECURSIVE "cayDanhMuc" AS (
  SELECT id,
         "danhMucChaId",
         "ten",
         0 AS "doSau"
  FROM categories
  WHERE id = :danhMucGocId

  UNION ALL

  SELECT c.id,
         c."danhMucChaId",
         c."ten",
         t."doSau" + 1
  FROM categories c
  JOIN "cayDanhMuc" t
    ON c."danhMucChaId" = t.id
)
SELECT t.id, t."ten", t."doSau"
FROM "cayDanhMuc" t
WHERE NOT EXISTS (
  SELECT 1
  FROM categories c
  WHERE c."danhMucChaId" = t.id
)
ORDER BY t."doSau", t."ten";
```

Phần recursive không cần biết cây có bao nhiêu tầng. Điều kiện `NOT EXISTS` được áp dụng sau khi cây đã hình thành nên không làm gián đoạn quá trình duyệt.

### Dòng tổ tiên của một danh mục

Đổi chiều liên kết để đi từ node hiện tại lên category cha:

```sql
WITH RECURSIVE "dongToTien" AS (
  SELECT id,
         "danhMucChaId",
         "ten",
         0 AS "khoangCach"
  FROM categories
  WHERE id = :danhMucId

  UNION ALL

  SELECT c.id,
         c."danhMucChaId",
         c."ten",
         t."khoangCach" + 1
  FROM categories c
  JOIN "dongToTien" t
    ON c.id = t."danhMucChaId"
)
SELECT id, "ten", "khoangCach"
FROM "dongToTien"
ORDER BY "khoangCach" DESC;
```

Node gốc có `"danhMucChaId" = NULL`, vì vậy recursive member không tìm thấy row tiếp theo và quá trình tự kết thúc.

## Tổng kết

CTE đặt tên cho một quan hệ trung gian. Recursive CTE mở rộng quan hệ đó qua nhiều iteration bằng anchor query, recursive member và working table.

Độ rõ ràng đến từ việc mỗi CTE sở hữu một bước biến đổi. Độ an toàn và hiệu năng đến từ termination condition, cycle protection, index phù hợp và execution plan.
