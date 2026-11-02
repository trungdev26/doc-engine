# EF Core Production Patterns

EF Core giúp viết nhanh, nhưng production trả giá cho những query, transaction và concurrency boundary ta không nhìn kỹ. Mục tiêu là đọc ít dữ liệu hơn, ghi đúng dữ liệu hơn và nhìn được SQL khi cần.

## 1. `DbContext` là Unit of Work

`DbContext` là lớp trung tâm của EF Core, đại diện cho một phiên làm việc với database: mở connection khi cần, theo dõi entity đã query/thêm/sửa/xóa qua các `DbSet`, sinh SQL tương ứng khi `SaveChanges`/`SaveChangesAsync` được gọi. Chính change tracker này khiến `DbContext` tự nhiên đóng vai trò Unit of Work (UoW) — pattern gộp nhiều thay đổi trên nhiều entity thành một giao dịch duy nhất: hoặc tất cả cùng commit, hoặc tất cả cùng rollback.

### 1.1. Ba đặc điểm chi phối cách dùng đúng

```text
- Change tracker: mọi entity load qua DbSet (trừ khi AsNoTracking) đều được theo dõi;
  Add/Update/Remove chỉ đổi trạng thái trong tracker, chưa chạm database cho tới SaveChanges.
- Không thread-safe: một instance không được truy cập đồng thời từ nhiều thread/task.
- Vòng đời ngắn: nên sống trong một scope (một request, một lần chạy job), không giữ lại dùng cho lần sau.
```

```csharp
builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connectionString));
```

`AddDbContext` đăng ký mặc định theo scoped lifetime — mỗi request/scope nhận một instance riêng, tự dispose khi scope kết thúc. Đây là lý do `DbContext` không nên inject vào singleton hay giữ lại giữa các request.

Lỗi thường gặp khi phá vỡ tính không-thread-safe: dùng `Task.WhenAll`/`Parallel.ForEachAsync` gọi nhiều query trên cùng một `DbContext` cùng lúc, ném `InvalidOperationException` vì nhiều thread cùng động vào change tracker. Mỗi task chạy song song cần `DbContext` riêng — tạo qua `IDbContextFactory<T>` hoặc một scope DI riêng cho từng task, không chia sẻ instance.

### 1.2. Vấn đề Unit of Work giải quyết

Không có ranh giới UoW rõ ràng, mỗi thao tác ghi dữ liệu dễ tự commit ngay khi xong:

```csharp
public async Task CreateOrderAsync(CreateOrderDto input)
{
    await _orderRepository.AddAsync(new Order(input));      // tự SaveChanges bên trong
    await _inventoryRepository.DecreaseStockAsync(input);   // tự SaveChanges bên trong
}
```

Nếu bước trừ kho ném exception, đơn hàng ở bước trước đã commit xong — có đơn nhưng kho không bị trừ, không có transaction nào rollback được vì mỗi bước đã là một giao dịch độc lập.

### 1.3. Khi nào cần bọc thêm `IUnitOfWork`

Dùng thẳng `DbContext` trong service là đủ cho phần lớn trường hợp. Bọc thêm một interface `IUnitOfWork` chỉ có giá trị khi:

| Lý do | Giải thích |
| --- | --- |
| Cô lập ranh giới commit khỏi chi tiết EF Core | Service chỉ biết `_unitOfWork.SaveChangesAsync()`, không phụ thuộc trực tiếp API của `DbContext` |
| Test không cần EF Core thật | Mock `IUnitOfWork` dễ hơn mock `DbContext` (nhiều method/property không ảo hóa được) |
| Điều phối nhiều repository rõ ràng hơn | Interface nêu rõ "đây là nơi commit", tránh `SaveChanges` rải rác do vô tình |

```csharp
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct);
}

public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _db;
    public EfUnitOfWork(AppDbContext db) => _db = db;

    public Task<int> SaveChangesAsync(CancellationToken ct) => _db.SaveChangesAsync(ct);
}
```

Nếu service đã inject thẳng `DbContext` và không dùng Repository pattern, bọc thêm `IUnitOfWork` chỉ để gọi `SaveChangesAsync` là một lớp thừa — `DbContext` tự nó đã là UoW, không cần giả vờ trừu tượng hóa thứ không thay đổi.

### 1.5. Repository + Unit of Work

Khi dùng Repository pattern, nhiều repository nên chia sẻ cùng một `DbContext` (cùng scope DI) để gộp được vào một lần commit:

```csharp
public sealed class CreateOrderHandler
{
    private readonly IOrderRepository _orders;
    private readonly IProductRepository _products;
    private readonly IUnitOfWork _unitOfWork;

    public CreateOrderHandler(IOrderRepository orders, IProductRepository products, IUnitOfWork unitOfWork)
    {
        _orders = orders;
        _products = products;
        _unitOfWork = unitOfWork;
    }

    public async Task ExecuteAsync(CreateOrderDto input, CancellationToken ct)
    {
        var product = await _products.GetAsync(input.ProductId, ct);
        product.DecreaseStock(input.Quantity);

        _orders.Add(new Order(input.CustomerId, product.Id, input.Quantity));

        await _unitOfWork.SaveChangesAsync(ct);   // một commit cho cả hai repository
    }
}
```

`_orders` và `_products` cùng nhận một `AppDbContext` scoped, nên thay đổi qua cả hai repository được cùng một change tracker theo dõi và cùng commit trong `SaveChangesAsync`. Nếu mỗi repository tự tạo `DbContext` riêng thay vì nhận qua DI scoped, chúng sẽ có transaction độc lập và phá vỡ toàn bộ mục đích của UoW.

Transaction tường minh khi một `SaveChangesAsync` là không đủ, và giới hạn UoW khi cần ghi atomic qua nhiều database, được nói ở mục 6 và mục 12 của tài liệu này.

## 2. Query đọc: projection trước, `AsNoTracking` khi phù hợp

```csharp
var page = await _db.Orders
    .AsNoTracking()
    .Where(x => x.Status == OrderStatus.Pending)
    .OrderByDescending(x => x.CreatedAt)
    .Select(x => new OrderListItemDto(x.Id, x.Code, x.CustomerName, x.Total, x.CreatedAt))
    .Take(50)
    .ToListAsync(cancellationToken);
```

Không nên `Include` toàn bộ graph rồi map DTO cho màn danh sách. Nó tăng cột, số dòng, RAM và nguy cơ cartesian explosion. Nếu thật sự cần nhiều collection liên quan, cân nhắc `AsSplitQuery()`; đổi lại là nhiều round trip hơn. Dùng khi tránh nhân bản dữ liệu lớn đáng giá hơn một round trip.

## 3. N+1: lỗi không lộ ở local nhưng gãy ở production

```csharp
var orders = await _db.Orders.Take(100).ToListAsync(ct);
foreach (var order in orders)
{
    order.CustomerName = await _db.Customers
        .Where(x => x.Id == order.CustomerId)
        .Select(x => x.Name)
        .SingleAsync(ct);
}
```

Đây là 101 query. Thay bằng projection/join hoặc load dữ liệu theo tập khóa. Log SQL và đo query count trong integration test cho endpoint nóng.

## 4. Update: load entity hay update set-based?

| Bài toán | Chọn | Vì sao |
| --- | --- | --- |
| Cần kiểm tra business rule trên aggregate | load entity + transaction | cần trạng thái đầy đủ |
| Đánh dấu hàng loạt theo điều kiện | `ExecuteUpdateAsync` | một câu SQL, không cần tracker |
| Trừ tồn kho không âm | update có điều kiện | tránh read-modify-write race |

```csharp
var affected = await _db.Products
    .Where(x => x.Id == productId && x.AvailableQuantity >= quantity)
    .ExecuteUpdateAsync(s => s.SetProperty(x => x.AvailableQuantity, x => x.AvailableQuantity - quantity), ct);

if (affected == 0)
    return Result.OutOfStock();
```

Đừng dùng `ExecuteUpdateAsync` khi cần domain event, validation per entity hoặc giá trị cũ để quyết định logic. Khi đó load aggregate trong transaction hoặc thiết kế command riêng.

## 5. Optimistic concurrency cho màn hình cùng sửa

```csharp
public sealed class PatientProfile
{
    public Guid Id { get; set; }
    public string Phone { get; set; } = string.Empty;
    [Timestamp] public byte[] Version { get; set; } = Array.Empty<byte>();
}
```

Client gửi `Version` đã đọc. EF Core update kèm điều kiện version; không có dòng nào bị update sẽ ném `DbUpdateConcurrencyException`. Trả `409 Conflict`, cho client tải lại và hiển thị phần thay đổi.

Không dùng optimistic concurrency cho tài nguyên nóng như một ghế còn một chỗ trong flash sale nếu retry sẽ tạo contention lớn. Khi đó atomic conditional update hoặc queue theo key thường phù hợp hơn.

## 6. Transaction: ngắn, đúng boundary

Transaction nên bảo vệ invariant trong một database: tạo order và trừ kho. Không giữ transaction trong lúc gọi payment provider hoặc gửi email vì lock kéo dài và external call không rollback cùng database.

```text
Transaction DB: đổi trạng thái + ghi OutboxEvent
Commit
Worker: gửi event/payment notification với retry + idempotency
```

Đó là transactional outbox. Đổi lại có eventual consistency và cần worker/reconciliation, nhưng tránh dual-write “đã commit DB nhưng publish message thất bại”.

## 7. Case: dashboard bị chậm dần theo dữ liệu

Endpoint dùng `Include` bốn collection, filter sau `ToListAsync`, rồi tính aggregate trong memory. Khi database vài nghìn dòng vẫn ổn; vài triệu dòng thì query trả graph khổng lồ và timeout.

Hướng xử lý: đưa filter, projection và aggregate xuống SQL; phân trang bằng keyset nếu cần đi tiếp theo thời gian; thêm index theo điều kiện lọc/sắp xếp; xem execution plan trước khi đoán. Cache chỉ là lớp sau, không che query sai.

## Checklist EF Core

1. Query list có projection, paging và `AsNoTracking` khi chỉ đọc không?
2. Có vòng lặp nào gọi database theo từng item không?
3. Index có phục vụ `WHERE`, `JOIN`, `ORDER BY` thực tế không?
4. Transaction có chứa HTTP/email/queue call không?
5. Update cạnh tranh có condition/version hay chỉ read-modify-write?
6. Endpoint nóng có log duration và số query để điều tra không?

## Kết luận

Middle mạnh biết EF Core API. Senior biết query nào sẽ tăng theo dữ liệu, transaction nào đang giữ lock quá lâu và race condition nào cần đưa xuống một câu SQL nguyên tử.

---

## 8. Change tracker: tiện nhưng có giá

Khi query tracking, EF giữ snapshot/entity để detect thay đổi. Nó phù hợp command cần sửa aggregate, nhưng query read-only lớn sẽ tốn RAM/CPU không cần thiết. Quy tắc thực dụng:

```text
Màn hình/list/report chỉ đọc -> AsNoTracking + DTO projection.
Command sửa một aggregate -> tracking entity trong scope ngắn.
Batch rất lớn -> xử lý theo lô, clear tracker hoặc dùng set-based SQL.
```

Không gọi `SaveChanges` trong vòng lặp 10.000 lần. Gom thay đổi hợp lý rồi save theo batch, nhưng vẫn phải cân bằng transaction size, lock duration và RAM tracker.

## 9. Pagination: offset và keyset

```csharp
// Offset: tiện cho trang bất kỳ, chi phí tăng khi Skip lớn.
var page = await query.OrderByDescending(x => x.CreatedAt)
    .Skip(pageIndex * pageSize).Take(pageSize).ToListAsync(ct);

// Keyset: ổn định hơn khi đọc tiếp tập lớn theo thời gian.
var page = await query
    .Where(x => x.CreatedAt < cursor.CreatedAt ||
        (x.CreatedAt == cursor.CreatedAt && x.Id.CompareTo(cursor.Id) < 0))
    .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id)
    .Take(pageSize).ToListAsync(ct);
```

Keyset cần index khớp thứ tự `(CreatedAt, Id)`, không nhảy thẳng tới trang 500 và thường trả `nextCursor` thay `totalPages`. Dùng nó cho feed/export/scan lớn; offset vẫn tốt cho back-office nhỏ cần nhảy trang.

## 10. Index phải đi cùng query shape

Index không phải càng nhiều càng tốt: mỗi index làm insert/update/delete đắt hơn và tốn storage. Bắt đầu từ query nóng:

```text
WHERE TenantId = @tenant AND Status = @status
ORDER BY CreatedAt DESC
SELECT Id, Code, Total
```

Thường cần composite index bắt đầu bằng cột filter có selectivity phù hợp, rồi tới sort; có thể include cột select tùy database. Xem execution plan để biết index được dùng hay scan xảy ra. Không quyết định chỉ từ tên cột nghe có vẻ quan trọng.

## 11. Isolation level và lock: chọn theo invariant

`ReadCommitted` thường là default tốt. Tăng isolation không tự động làm logic đúng hơn; nó tăng blocking/deadlock hoặc version-store pressure.

| Mục tiêu | Cách ưu tiên |
| --- | --- |
| Không tạo trùng một business key | unique constraint |
| Không trừ kho âm | conditional update |
| Không ghi đè bản sửa khác | row version/optimistic concurrency |
| Cần serialize một tài nguyên hiếm | lock rất ngắn hoặc queue theo key |
| Đọc nhất quán nhiều bước | transaction/isolation, đo contention |

Database constraint là hàng rào cuối. Validation ở application chỉ cải thiện trải nghiệm; hai request vẫn có thể cùng vượt qua validation.

## 12. `SaveChanges` và domain event

Đẩy message broker trước `SaveChanges` có thể phát event cho data chưa commit. Đẩy sau commit lại có cửa sổ process chết trước publish. Outbox xử lý sự đánh đổi này: cùng transaction ghi state và `OutboxMessage`; worker publish sau và consumer idempotent.

```text
Không dùng outbox: email/UI không quan trọng, chấp nhận mất một notification.
Dùng outbox: trạng thái downstream phải khớp eventual với commit DB.
```

Outbox không biến distributed system thành exactly-once; nó đưa delivery về at-least-once, nên consumer vẫn cần deduplicate.

## 13. Case chi tiết: oversell kho

Code đầu tiên đọc `AvailableQuantity = 1`, kiểm tra đủ, trừ trong memory rồi `SaveChanges`. Hai request cùng đọc 1, cả hai cùng thành công: kho thành -1 hoặc một update ghi đè update kia.

Sửa bằng một câu update có điều kiện như phần 4, rồi tạo order trong transaction khi inventory đã được reserve. Nếu cần order/payment nhiều service, đừng mở distributed transaction kéo dài; dùng reservation có expiry, outbox và compensation khi payment thất bại.

## 14. Checklist debug EF Core

1. Bật log SQL có chọn lọc ở môi trường an toàn, không log dữ liệu nhạy cảm.
2. Ghi duration, rows affected và query count cho endpoint nóng.
3. Khi timeout, lấy execution plan và lock wait trước khi tăng command timeout.
4. Khi memory tăng, kiểm tra tracking query/batch tracker trước khi nghi GC leak.
5. Khi deadlock, xem thứ tự update bảng; chuẩn hóa thứ tự lock thay vì chỉ retry mù quáng.
