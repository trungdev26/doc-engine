# Window Functions và Analytical SQL

Window function tính một giá trị từ nhiều row có liên quan nhưng vẫn giữ từng row trong kết quả. `GROUP BY` thu nhiều row thành một row cho mỗi group; window function bổ sung kết quả phân tích vào từng row hiện có.

Các hàm này thường được dùng để tính thứ hạng, tổng lũy kế, tỷ lệ, chênh lệch giữa hai thời điểm và giá trị đầu hoặc cuối trong một nhóm.

## Cú pháp `OVER`

Một hàm trở thành window function khi được gọi với mệnh đề `OVER`:

```sql
function(...) OVER (
  PARTITION BY ...
  ORDER BY ...
  ROWS BETWEEN ... AND ...
)
```

Mỗi phần kiểm soát một khía cạnh khác nhau:

- `PARTITION BY` chia dữ liệu thành các nhóm độc lập.
- `ORDER BY` xác định thứ tự row bên trong mỗi nhóm.
- Window frame giới hạn những row được dùng để tính giá trị cho row hiện tại.

Ví dụ sau đánh số đơn hàng riêng cho từng khách hàng:

```sql
SELECT id,
       "khachHangId",
       ROW_NUMBER() OVER (
         PARTITION BY "khachHangId"
         ORDER BY "ngayDatHang", id
       ) AS "soThuTu"
FROM orders;
```

Khi `"khachHangId"` thay đổi, `ROW_NUMBER` bắt đầu lại từ `1`. Trong cùng một khách hàng, `"ngayDatHang"` và `id` quyết định thứ tự.

## Thứ tự xử lý logic

Window function được tính sau `FROM`, `WHERE`, `GROUP BY` và `HAVING`, nhưng trước `ORDER BY` cuối cùng của query.

Vì vậy, `WHERE` có thể giảm input trước khi window được tính, nhưng không thể dùng alias của window function trong cùng query block:

```sql
WITH "donHangDaXepHang" AS (
  SELECT id,
         "khachHangId",
         ROW_NUMBER() OVER (
           PARTITION BY "khachHangId"
           ORDER BY "tongTien" DESC, id
         ) AS "thuHang"
  FROM orders
)
SELECT *
FROM "donHangDaXepHang"
WHERE "thuHang" <= 3;
```

CTE tạo một query block mới. Khi query bên ngoài chạy, `"thuHang"` đã là một cột có thể lọc.

## Aggregate Window Functions

Các aggregate function quen thuộc có thể hoạt động trên window khi được gọi với `OVER`.

| Hàm | Giá trị trả về |
|---|---|
| `SUM` | Tổng giá trị trong window |
| `AVG` | Giá trị trung bình trong window |
| `COUNT` | Số row hoặc số giá trị khác `NULL` |
| `MIN` | Giá trị nhỏ nhất trong window |
| `MAX` | Giá trị lớn nhất trong window |

Truy vấn sau giữ từng đơn hàng và bổ sung tổng doanh thu của khách hàng:

```sql
SELECT id,
       "khachHangId",
       "tongTien",
       SUM("tongTien") OVER (
         PARTITION BY "khachHangId"
       ) AS "doanhThuKhachHang"
FROM orders
ORDER BY "khachHangId", id;
```

Với dữ liệu:

| id | khachHangId | tongTien |
|---:|---:|---:|
| 101 | 1 | 500000 |
| 102 | 1 | 300000 |
| 201 | 2 | 900000 |

kết quả là:

| id | khachHangId | tongTien | doanhThuKhachHang |
|---:|---:|---:|---:|
| 101 | 1 | 500000 | 800000 |
| 102 | 1 | 300000 | 800000 |
| 201 | 2 | 900000 | 900000 |

Hai row của khách hàng `1` vẫn được giữ lại. Nếu dùng `GROUP BY`, kết quả chỉ còn một row cho mỗi khách hàng:

```sql
SELECT "khachHangId",
       SUM("tongTien") AS "doanhThuKhachHang"
FROM orders
GROUP BY "khachHangId";
```

Chọn aggregate window function khi output cần giữ row chi tiết. Chọn `GROUP BY` khi output chỉ cần một row tổng hợp cho mỗi group.

## Ranking Functions

Ranking function gán vị trí cho row theo `ORDER BY` của window.

| Hàm | Cách xếp hạng |
|---|---|
| `ROW_NUMBER()` | Gán số thứ tự duy nhất cho từng row |
| `RANK()` | Row bằng nhau nhận cùng hạng; hạng tiếp theo bị bỏ qua |
| `DENSE_RANK()` | Row bằng nhau nhận cùng hạng; hạng tiếp theo không bị bỏ qua |
| `NTILE(n)` | Chia các row đã sắp xếp thành `n` nhóm gần bằng nhau |

Đoạn SQL sau thể hiện sự khác nhau khi hai đơn hàng có cùng `"tongTien"`:

```sql
SELECT id,
       "tongTien",
       ROW_NUMBER() OVER (
         ORDER BY "tongTien" DESC, id
       ) AS "soThuTu",
       RANK() OVER (
         ORDER BY "tongTien" DESC
       ) AS "xepHang",
       DENSE_RANK() OVER (
         ORDER BY "tongTien" DESC
       ) AS "xepHangLienTuc"
FROM orders;
```

| id | tongTien | soThuTu | xepHang | xepHangLienTuc |
|---:|---:|---:|---:|---:|
| 201 | 900000 | 1 | 1 | 1 |
| 101 | 500000 | 2 | 2 | 2 |
| 103 | 500000 | 3 | 2 | 2 |
| 102 | 300000 | 4 | 4 | 3 |

`ROW_NUMBER` phù hợp khi cần đúng một row ở mỗi vị trí, chẳng hạn lấy một đơn hàng mới nhất. `RANK` và `DENSE_RANK` phù hợp khi các giá trị bằng nhau phải được công nhận cùng hạng.

`NTILE` thường được dùng để chia dữ liệu thành percentile hoặc nhóm phân tích:

```sql
SELECT id,
       "tongTien",
       NTILE(4) OVER (
         ORDER BY "tongTien" DESC
       ) AS "nhomDoanhThu"
FROM orders;
```

Kết quả chia các đơn hàng thành bốn nhóm theo giá trị giảm dần. Số row giữa các nhóm chênh lệch tối đa một.

## Offset Functions

Offset function đọc giá trị từ một row khác trong cùng partition mà không cần self join.

| Hàm | Giá trị trả về |
|---|---|
| `LAG(value, offset, default)` | Giá trị của row đứng trước |
| `LEAD(value, offset, default)` | Giá trị của row đứng sau |

`offset` mặc định là `1`. `default` được trả về khi row cần tìm nằm ngoài partition.

```sql
SELECT "sanPhamId",
       "thoiDiemDo",
       "soLuongTon",
       LAG("soLuongTon", 1, "soLuongTon") OVER (
         PARTITION BY "sanPhamId"
         ORDER BY "thoiDiemDo"
       ) AS "soLuongTonTruoc",
       "soLuongTon" -
         LAG("soLuongTon", 1, "soLuongTon") OVER (
           PARTITION BY "sanPhamId"
           ORDER BY "thoiDiemDo"
         ) AS "chenhLech"
FROM "stockSnapshots";
```

Với row đầu tiên của mỗi sản phẩm, `LAG` dùng `"soLuongTon"` hiện tại làm giá trị mặc định nên `"chenhLech"` bằng `0`. Các row sau so sánh tồn kho hiện tại với lần đo ngay trước đó.

`LEAD` dùng cùng cú pháp khi cần nhìn về row tiếp theo, chẳng hạn tính thời gian đến lần mua kế tiếp:

```sql
LEAD("ngayDatHang") OVER (
  PARTITION BY "khachHangId"
  ORDER BY "ngayDatHang", id
) AS "ngayDatHangTiepTheo"
```

## Value Functions

Value function lấy một giá trị tại vị trí cụ thể trong window frame.

| Hàm | Giá trị trả về |
|---|---|
| `FIRST_VALUE(value)` | Giá trị ở đầu frame |
| `LAST_VALUE(value)` | Giá trị ở cuối frame |
| `NTH_VALUE(value, n)` | Giá trị tại vị trí `n` trong frame |

Ví dụ sau đặt đơn hàng đầu tiên và gần nhất của khách hàng cạnh từng row:

```sql
SELECT id,
       "khachHangId",
       "ngayDatHang",
       FIRST_VALUE("ngayDatHang") OVER (
         PARTITION BY "khachHangId"
         ORDER BY "ngayDatHang", id
         ROWS BETWEEN UNBOUNDED PRECEDING
                  AND UNBOUNDED FOLLOWING
       ) AS "ngayDatHangDauTien",
       LAST_VALUE("ngayDatHang") OVER (
         PARTITION BY "khachHangId"
         ORDER BY "ngayDatHang", id
         ROWS BETWEEN UNBOUNDED PRECEDING
                  AND UNBOUNDED FOLLOWING
       ) AS "ngayDatHangGanNhat"
FROM orders;
```

Frame được viết rõ từ đầu đến cuối partition. Nếu bỏ frame này, `LAST_VALUE` thường chỉ nhìn đến peer group của row hiện tại và có thể không trả về giá trị cuối partition như tên hàm gợi ý.

## Window Frames

Window frame xác định phần dữ liệu quanh row hiện tại mà hàm được phép đọc.

| Chế độ | Đơn vị xác định frame |
|---|---|
| `ROWS` | Vị trí vật lý tương đối của row |
| `RANGE` | Giá trị của biểu thức `ORDER BY` |
| `GROUPS` | Nhóm các peer row có cùng giá trị `ORDER BY` |

Running total thường dùng frame từ đầu partition đến row hiện tại:

```sql
SELECT "khachHangId",
       "ngayDatHang",
       id,
       "tongTien",
       SUM("tongTien") OVER (
         PARTITION BY "khachHangId"
         ORDER BY "ngayDatHang", id
         ROWS BETWEEN UNBOUNDED PRECEDING
                  AND CURRENT ROW
       ) AS "tongLuyKe"
FROM orders;
```

Frame của row đầu chứa một row. Frame của row thứ hai chứa hai row và tiếp tục mở rộng đến cuối partition.

Moving average ba giao dịch gần nhất chỉ thay đổi điểm bắt đầu:

```sql
AVG("tongTien") OVER (
  PARTITION BY "khachHangId"
  ORDER BY "ngayDatHang", id
  ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
) AS "trungBinhTruot3"
```

Mỗi frame chứa tối đa row hiện tại và hai row đứng trước. Nên viết frame rõ ràng khi kết quả phụ thuộc vào phạm vi, đặc biệt khi nhiều row có cùng giá trị `ORDER BY`.

## Tư duy lựa chọn

Trước khi viết `OVER`, cần xác định:

1. Một row output đại diện cho entity nào?
2. Những row nào thuộc cùng phạm vi phân tích?
3. Thứ tự nào có ý nghĩa trong phạm vi đó?
4. Hàm cần toàn partition hay chỉ một frame?
5. Các giá trị bằng nhau được xử lý theo quy tắc nào?

Nếu output chỉ cần một row cho mỗi group, `GROUP BY` thường trực tiếp hơn. Nếu cần giữ row chi tiết và bổ sung giá trị phân tích, window function phù hợp hơn.

## Ứng dụng

### Ba đơn hàng lớn nhất của mỗi khách hàng

`ROW_NUMBER` đánh số riêng trong từng khách hàng. Query bên ngoài giữ ba vị trí đầu:

```sql
WITH "donHangDaXepHang" AS (
  SELECT id,
         "khachHangId",
         "tongTien",
         ROW_NUMBER() OVER (
           PARTITION BY "khachHangId"
           ORDER BY "tongTien" DESC, id
         ) AS "thuHang"
  FROM orders
)
SELECT id, "khachHangId", "tongTien"
FROM "donHangDaXepHang"
WHERE "thuHang" <= 3;
```

`id` là tie-breaker, bảo đảm hai lần chạy không tùy ý đổi vị trí khi `"tongTien"` bằng nhau.

### Tỷ trọng doanh thu của từng đơn hàng

Aggregate window function cung cấp mẫu số mà không làm mất row chi tiết:

```sql
SELECT id,
       "khachHangId",
       "tongTien",
       ROUND(
         "tongTien" * 100.0 /
         SUM("tongTien") OVER (
           PARTITION BY "khachHangId"
         ),
         2
       ) AS "tyTrongPhanTram"
FROM orders;
```

Mỗi `"tyTrongPhanTram"` cho biết đơn hàng đóng góp bao nhiêu phần trăm vào tổng doanh thu của chính khách hàng đó.

### Chuỗi ngày hoạt động liên tiếp

Gap and island là bài toán gom các giá trị liên tiếp thành từng chuỗi. `ROW_NUMBER` tạo một độ lệch không đổi trong cùng chuỗi ngày:

```sql
WITH "hoatDongKhongTrung" AS (
  SELECT DISTINCT "nguoiDungId", "ngayHoatDong"
  FROM "userActivity"
),
"hoatDongDaDanhSo" AS (
  SELECT "nguoiDungId",
         "ngayHoatDong",
         ROW_NUMBER() OVER (
           PARTITION BY "nguoiDungId"
           ORDER BY "ngayHoatDong"
         ) AS "soThuTu"
  FROM "hoatDongKhongTrung"
),
"chuoiHoatDong" AS (
  SELECT "nguoiDungId",
         "ngayHoatDong",
         "ngayHoatDong" - "soThuTu"::int AS "maChuoi"
  FROM "hoatDongDaDanhSo"
)
SELECT "nguoiDungId",
       MIN("ngayHoatDong") AS "ngayBatDau",
       MAX("ngayHoatDong") AS "ngayKetThuc",
       COUNT(*) AS "soNgay"
FROM "chuoiHoatDong"
GROUP BY "nguoiDungId", "maChuoi";
```

Ngày và `"soThuTu"` cùng tăng một đơn vị nên hiệu của chúng không đổi trong một chuỗi liên tiếp. `"maChuoi"` dùng giá trị không đổi đó để gom nhóm.

## Kế hoạch thực thi

Window function thường cần dữ liệu theo thứ tự của `PARTITION BY` và `ORDER BY`. Execution plan có thể chứa `Sort`, `Incremental Sort` và `WindowAgg`.

Khi đọc `EXPLAIN (ANALYZE, BUFFERS)`, cần kiểm tra:

- Predicate đã giảm số row trước `WindowAgg` chưa?
- Sort dùng memory hay spill xuống disk?
- Index có cung cấp thứ tự hữu ích không?
- Nhiều window có dùng cùng ordering để tái sử dụng sort không?
- Estimated rows có gần actual rows không?

Index sau có thể cung cấp ordering hữu ích cho các truy vấn theo khách hàng và ngày đặt hàng:

```sql
CREATE INDEX "ixOrdersCustomerDate"
ON orders("khachHangId", "ngayDatHang", id)
INCLUDE ("tongTien");
```

Index không bảo đảm PostgreSQL bỏ sort. Quyết định còn phụ thuộc số row, predicate và cost estimate.

## Lỗi thiết kế thường gặp

- Không thêm tie-breaker nên ranking không ổn định.
- Dùng frame mặc định mà không kiểm tra semantics của peer rows.
- Tính window trên tập lớn dù có thể lọc input sớm hơn.
- Dùng `DISTINCT` để che row trùng do join sai trước window.
- Tạo nhiều window với ordering khác nhau và buộc database sort lặp lại.

## Tổng kết

Window function giữ row chi tiết trong khi tính giá trị trên một tập row liên quan. `PARTITION BY` xác định phạm vi, `ORDER BY` xác định trình tự và frame xác định phần dữ liệu quanh row hiện tại.

Aggregate functions bổ sung số liệu tổng hợp. Ranking functions xác định vị trí. Offset functions đọc row trước hoặc sau. Value functions lấy giá trị tại một vị trí trong frame.

Query đúng cần semantics rõ ràng. Query ổn định cần tie-breaker. Query chạy tốt cần lọc sớm, ordering hợp lý và execution plan được đo trên dữ liệu thực tế.
