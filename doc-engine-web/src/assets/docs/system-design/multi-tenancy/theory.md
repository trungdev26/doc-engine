# Multi-Tenancy Isolation

Multi-tenancy là mô hình một application phục vụ nhiều customer organization, gọi là Tenant. Isolation là yêu cầu dữ liệu và quyền của một Tenant không bị đọc hoặc thay đổi bởi Tenant khác.

## Tenant context

Mỗi execution scope phải xác định tối đa một current Tenant từ nguồn tin cậy:

```text
authenticated claim
subdomain/custom domain mapping
trusted job/message metadata
```

`tenantId` do public client gửi chỉ là input, không phải authorization proof. Server phải đối chiếu identity, host hoặc ownership trước khi dùng.

## Request resolution

```text
Authentication
→ resolve Tenant từ trusted identity hoặc host
→ set scoped TenantContext
→ Authorization
→ Application use case
```

Authentication đứng trước resolution khi shared host phục vụ user của nhiều Tenant. Authorization cần cả identity và tenant scope để kiểm tra quyền.

## Shared schema

Shared database/shared schema lưu `tenantId` trên tenant-owned rows:

```sql
SELECT *
FROM donHang
WHERE tenantId = @tenantId
  AND shopId = @shopId;
```

Lặp `tenantId` dù có thể suy qua `shopId` giúp predicate và index rõ, giảm blast radius của join sai và hỗ trợ di chuyển dữ liệu sau này.

Unique key phải phản ánh đúng scope:

```sql
UNIQUE (tenantId, maHangHoa)
INDEX  (tenantId, shopId, createAt)
```

Unique chỉ theo `maHangHoa` sẽ vô tình bắt các Tenant chia sẻ business identifier.

## Defense in depth

Isolation không dựa vào một global filter:

1. Row mang `tenantId`.
2. ORM query mặc định filter current Tenant.
3. Write use case kiểm tra ownership trực tiếp.
4. Database constraint/index phản ánh tenant scope.
5. Raw SQL/Dapper luôn truyền tenant predicate.

Global filter không bảo vệ raw SQL, `IgnoreQueryFilters`, insert gắn sai Tenant hoặc background job thiếu context. Nó là safety net, không phải authorization system.

## Background processing

Background job không có HTTP context. Payload phải mang `tenantId` trusted từ lúc enqueue, sau đó worker tạo explicit tenant scope.

```text
request validates tenant
→ enqueue { tenantId, operationId }
→ worker creates tenant scope
→ query/write with tenant predicate
```

Không serialize toàn bộ user claims nếu worker chỉ cần Tenant identity và operation identity.

## Cache và message keys

Cache key, idempotency key và message partition key phải chứa tenant scope khi dữ liệu không global:

```text
tenant:{tenantId}:shop:{shopId}:menu
tenant:{tenantId}:idempotency:{key}
```

Thiếu tenant prefix có thể gây data leak dù database query đúng.

## Database topology

| Topology | Lợi ích | Chi phí |
|---|---|---|
| Shared schema | Migration và transaction đơn giản | Cần discipline với tenant predicate |
| Schema per Tenant | Isolation logic cao hơn | Migration fan-out, connection routing |
| Database per Tenant | Backup/compliance/noisy-neighbor isolation | Vận hành, pooling và observability phức tạp |

Shared schema là baseline hợp lý khi chưa có compliance hoặc noisy-neighbor evidence. Tách database không tự động sửa authorization bug ở application.

## Domain mapping

Tenant là security/ownership boundary, không nhất thiết là một Aggregate chứa mọi `Shop`, `HangHoa` và `DonHang`. Aggregate collection tăng vô hạn tạo load và lock boundary quá lớn. Domain objects giữ `tenantId` hoặc được load qua tenant-scoped use case theo consistency cần thiết.

## Failure review

| Failure | Protection |
|---|---|
| Client giả `tenantId` | Resolve từ trusted identity/host |
| EF query quên filter | Global filter + ownership check |
| Dapper query quên filter | Query review/helper theo module |
| Unique key chặn chéo Tenant | Composite unique key |
| Job chạy sai Tenant | Explicit tenant payload/scope |
| Cache trả dữ liệu Tenant khác | Tenant-scoped cache key |

## Business case — Dapper query thiếu Tenant

EF query có global filter nhưng report Dapper chỉ lọc `shopId`. Một lỗi join hoặc identifier không globally unique làm report trả dữ liệu Tenant khác.

```sql
SELECT *
FROM donHang
WHERE tenantId = @tenantId
  AND shopId = @shopId;
```

Dapper không đi qua EF filter. Tenant predicate phải hiện diện trong SQL và parameter phải đến từ trusted tenant context.

## Business case — cache key collision

Tenant A và B đều có `shopId=10`. Cache key `shop:10:menu` làm B nhận menu của A dù database query đúng. Key phải là `tenant:{tenantId}:shop:{shopId}:menu`.

Đây là lý do tenant isolation review phải đi hết data path; middleware và query filter không bảo vệ cache.

## Business case — unique constraint sai scope

Hai Tenant cùng dùng mã hàng `BM001`. `UNIQUE(maHangHoa)` chặn Tenant thứ hai dù business cho phép. Constraint đúng là `UNIQUE(tenantId, maHangHoa)`. Ngược lại, subdomain trên shared host có thể cần globally unique; scope business quyết định key.

## Business case — background job sai Tenant

Request enqueue job chỉ có `donHangId`. Worker không có `HttpContext`, dùng default tenant và query nhầm dữ liệu. Payload phải chứa trusted `tenantId`; worker tạo explicit tenant scope rồi mới resolve data.

Không truyền toàn bộ user session nếu job chỉ cần Tenant ownership và actor identity tối thiểu. Dữ liệu ít hơn làm contract ổn định và giảm rò rỉ credential/claim.

## Tóm tắt

Multi-tenancy là end-to-end isolation concern: request identity, application context, query predicate, database key, cache key và background processing đều phải giữ cùng tenant scope. Không có một middleware hoặc filter đơn lẻ giải quyết toàn bộ boundary.
