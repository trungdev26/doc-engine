# Cơ chế cốt lõi của ASP.NET Core

Chuyên đề xây dựng mental model cốt lõi để phát triển backend ASP.NET Core vững chắc: request lifecycle, boundary, dependency lifetime, async flow, data access và khả năng kiểm chứng behavior.

---

## 1. Kết quả của chặng

Sau chặng này, người học có thể:

- Trace một request từ web server tới database và quay lại response.
- Phân biệt contract validation, authorization và business rule.
- Thiết kế object graph có lifetime phù hợp.
- Sử dụng async và cancellation xuyên suốt I/O flow.
- Kiểm soát EF Core query, tracking và save boundary.
- Chuẩn hóa configuration, error response và structured logging.
- Viết integration test cho các behavior quan trọng.

Một endpoint đạt chuẩn Strong Junior cần trả lời được mười câu hỏi:

1. Route nào chọn endpoint?
2. Input được bind và validate ở đâu?
3. Caller được xác thực và phân quyền ở đâu?
4. Dependency nào thuộc request scope?
5. Business rule nằm ở boundary nào?
6. EF Core thực thi SQL lúc nào?
7. Transaction hoặc save boundary nằm ở đâu?
8. Cancellation được truyền tới những operation nào?
9. Exception được chuyển thành response ở đâu?
10. Test và telemetry nào chứng minh behavior?

---

## 2. Mental model: request đi qua các boundary

Luồng xử lý tổng quát:

```text
Client
  -> Web server
  -> Middleware pipeline
  -> Routing
  -> Authentication
  -> Authorization
  -> Model binding và validation
  -> Controller/Endpoint
  -> Application use case
  -> Database hoặc external dependency
  -> Result và serialization
  -> Response
```

Mỗi boundary sở hữu một nhóm trách nhiệm:

| Boundary | Trách nhiệm |
|---|---|
| Web server | Nhận connection, áp dụng transport/request limit |
| Middleware | Xử lý cross-cutting concern ở HTTP pipeline |
| Routing | Chọn endpoint theo route và HTTP method |
| Authentication | Xác định danh tính caller |
| Authorization | Kiểm tra quyền trên action hoặc resource |
| Model binding/validation | Chuyển HTTP input thành model hợp lệ |
| Controller | Chuyển HTTP request thành lời gọi use case |
| Application/domain | Điều phối workflow và bảo vệ invariant |
| Data/integration | Đọc, ghi và thực hiện external side effect |
| Error/response | Chuẩn hóa lỗi và response contract |
| Observability | Cung cấp bằng chứng để theo dõi và điều tra |

Chất lượng thiết kế phụ thuộc vào việc đặt trách nhiệm đúng boundary.

Đọc sâu: [ASP.NET Core Request Lifecycle](/dotnet-core/aspnet-request-pipeline).

---

## 3. Request lifecycle

### Mục tiêu

Giải thích được thứ tự xử lý request và tác động của từng thành phần trong pipeline.

### Nội dung cốt lõi

- Middleware chạy theo thứ tự đăng ký.
- Middleware có thể short-circuit trước khi endpoint được gọi.
- `HttpContext` thuộc request hiện tại.
- Request scope kết thúc cùng request.
- Response headers không thể thay đổi sau khi response đã bắt đầu.
- `HttpContext.RequestAborted` biểu diễn request cancellation.

### Review checklist

- Middleware xử lý exception được đặt đủ sớm.
- Authentication chạy trước authorization.
- Routing và endpoint metadata được sử dụng đúng thời điểm.
- Business rule không nằm trong middleware.
- Scoped state không thoát khỏi request.
- Cancellation được truyền tới database và outbound call.

### Thực hành

Chọn một command API và lập request trace:

```text
POST /api/orders/{id}/approve

Correlation middleware
-> Exception handler
-> Routing
-> Authentication
-> Authorization
-> Model binding
-> OrderController.Approve
-> OrderAppService.ApproveAsync
-> AppDbContext
-> Result serialization
```

Với từng bước, ghi lại:

- Input và output.
- State được tạo hoặc thay đổi.
- Failure có thể xảy ra.
- Log hoặc test dùng để xác minh.

### Tiêu chí hoàn thành

- Vẽ được request flow của một endpoint thật.
- Giải thích được tác động khi đổi thứ tự middleware.
- Xác định được nơi tạo error response.
- Phân biệt request cancellation và transaction rollback.

---

## 4. API contract và controller boundary

### Mục tiêu

Thiết kế HTTP boundary ổn định và giữ controller tập trung vào transport concern.

### Controller sở hữu

- Route và HTTP method.
- Input từ route, query, header hoặc body.
- Contract validation.
- Lời gọi application use case.
- Chuyển application result thành HTTP response.

### Application/domain sở hữu

- Business workflow.
- Business invariant.
- State transition.
- Transaction intent.
- Quyết định tạo side effect.

### Ba lớp kiểm tra

| Lớp | Ví dụ | Boundary |
|---|---|---|
| Contract validation | Required, độ dài, định dạng, range | API/model validation |
| Authorization | User có quyền trên order thuộc chi nhánh này | Authorization/application |
| Business validation | Chỉ order `Pending` mới được duyệt | Application/domain |

### Error contract

| Status | Ý nghĩa |
|---|---|
| `400` | Request sai contract |
| `401` | Caller chưa được xác thực |
| `403` | Caller không có quyền |
| `404` | Resource không tồn tại hoặc không được phép lộ |
| `409` | State hoặc concurrency conflict |
| `422` | Vi phạm business rule nếu API convention sử dụng |
| `500` | Lỗi ngoài dự kiến |

Error response cần có format ổn định và correlation identifier. Internal exception, stack trace và database detail chỉ xuất hiện trong telemetry được bảo vệ.

### Review checklist

- DTO tách khỏi persistence entity.
- Route diễn đạt resource/action rõ ràng.
- Status code phản ánh đúng kết quả.
- Permission được kiểm tra tại server.
- Controller không điều phối workflow dài.
- Exception mapping không lặp lại ở từng action.
- Response không làm lộ field nội bộ.

### Tiêu chí hoàn thành

- Review được contract của một endpoint.
- Tách đúng ba lớp validation.
- Chuẩn hóa success/error response.
- Viết test cho validation và authorization.

Đọc sâu: [Controller & API Design](/dotnet-core/controller-api-design).

---

## 5. Dependency Injection và lifetime

### Mục tiêu

Thiết kế object graph có ownership và lifetime rõ ràng.

### Lifetime model

| Lifetime | Phạm vi | Lưu ý |
|---|---|---|
| Transient | Mỗi lần resolve | Phù hợp object nhẹ, không giữ shared state |
| Scoped | Một scope; thường là một request | Phù hợp `DbContext` và use-case service |
| Singleton | Toàn bộ application | Phải an toàn khi nhiều request truy cập đồng thời |

Chọn lifetime dựa trên:

- State mà object giữ.
- Phạm vi của state.
- Lifetime của dependency bên dưới.
- Yêu cầu thread safety.
- Ownership và disposal.

### Captive dependency

Singleton không được giữ scoped dependency:

```csharp
public sealed class ReportCache
{
    private readonly AppDbContext _dbContext;

    public ReportCache(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }
}
```

Object graph này có thể gây:

- Dùng `DbContext` đồng thời.
- Giữ tracking state ngoài request.
- Lẫn dữ liệu user hoặc tenant.
- Disposal sai thời điểm.

Giải pháp nằm ở ownership và boundary, không phải kéo toàn bộ graph lên singleton.

### Scope trong worker

`BackgroundService` thường là singleton. Mỗi unit of work cần scope riêng:

```csharp
public sealed class OrderWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public OrderWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var handler = scope.ServiceProvider
                .GetRequiredService<OrderJobHandler>();

            await handler.HandleNextAsync(stoppingToken);
        }
    }
}
```

### Review checklist

- Mỗi lifetime có lý do rõ ràng.
- Singleton không giữ scoped dependency.
- Singleton mutable state có concurrency strategy.
- Worker tạo scope theo processing boundary.
- Service locator không bị sử dụng như dependency mechanism chính.
- Container quản lý disposal cho object do container tạo.

### Tiêu chí hoàn thành

- Vẽ được object graph của một use case.
- Giải thích được lifetime của từng service.
- Phát hiện captive dependency.
- Viết test hoặc startup validation cho DI registration quan trọng.

Đọc sâu: [Dependency Injection trong .NET Core](/dotnet-core/dependency-injection).

---

## 6. Middleware, filter và exception boundary

### Mục tiêu

Đặt cross-cutting concern đúng execution boundary.

### Chọn extension point

| Cơ chế | Phạm vi phù hợp |
|---|---|
| Middleware | HTTP concern áp dụng cho nhiều endpoint |
| MVC filter | Concern cần MVC/action lifecycle hoặc metadata |
| Application decorator/pipeline | Concern bao quanh use case, độc lập với HTTP |
| Application/domain code | Business rule và invariant |

Middleware phù hợp với correlation ID, global exception handling, request logging và security header. Business workflow và state transition thuộc application/domain.

### Exception boundary

Một exception boundary cần:

- Map lỗi dự kiến sang error contract có chủ đích.
- Giữ đúng semantics của cancellation.
- Ghi lỗi ngoài dự kiến một lần tại boundary phù hợp.
- Gắn correlation và business identifier.
- Không để internal detail đi vào response.

Tránh xử lý lỗi lặp lại trong từng controller:

```csharp
try
{
    // action workflow
}
catch (Exception ex)
{
    return Ok(new { success = false, message = ex.Message });
}
```

Mẫu trên làm sai HTTP semantics, tạo error contract không ổn định và có thể làm lộ thông tin nội bộ.

### Thực hành

Tạo một lỗi application có chủ đích và xác minh:

1. Error được log đúng một lần.
2. Response có status và schema ổn định.
3. Response không chứa stack trace.
4. Correlation ID nối được response với log.
5. Request cancellation không bị báo như server failure.

### Tiêu chí hoàn thành

- Chọn đúng middleware, filter hoặc application decorator.
- Thiết kế một global exception boundary.
- Test được exception mapping.

Đọc sâu: [Middleware trong ASP.NET Core](/dotnet-core/middleware).

---

## 7. Async và cancellation

### Mục tiêu

Giữ async flow không blocking, có cancellation propagation và giới hạn concurrency rõ ràng.

### Execution model

| Loại workload | Cách xử lý |
|---|---|
| I/O-bound | Dùng API async và `await` trực tiếp |
| CPU-bound | Đánh giá execution location và concurrency limit |
| Request cancellation | Truyền token xuyên các I/O operation |

`async` giúp thread không bị giữ trong thời gian chờ I/O. Nó không tự tăng tốc CPU workload và không cung cấp backpressure.

### Cancellation propagation

```csharp
[HttpGet("{id:guid}")]
public async Task<ActionResult<OrderDto>> Get(
    Guid id,
    CancellationToken cancellationToken)
{
    var order = await _orderQuery.GetAsync(id, cancellationToken);
    return order is null ? NotFound() : Ok(order);
}
```

Token tiếp tục được truyền tới EF Core và outbound HTTP call. Mỗi layer chỉ dừng operation khi trạng thái dữ liệu vẫn an toàn.

### Review checklist

- Không dùng `.Result` hoặc `.Wait()` trong async flow.
- Không bọc EF Core/HTTP async bằng `Task.Run`.
- Không tạo fire-and-forget task từ request scope.
- `Task.WhenAll` có concurrency limit khi input lớn.
- Exception từ task được quan sát.
- Cancellation dừng retry và shutdown flow đúng lúc.

### Thực hành

- Hủy request trong khi database query đang chạy.
- Xác minh token đi tới data access.
- Tạo outbound call vượt timeout.
- Phân biệt client cancellation, timeout và dependency error trong telemetry.

### Tiêu chí hoàn thành

- Trace được async flow của một endpoint.
- Chứng minh cancellation propagation.
- Nhận diện blocking call và unbounded concurrency.

Đọc sâu: [Task, Thread và Process](/dotnet-core/task-thread-process).

---

## 8. EF Core query, tracking và save boundary

### Mục tiêu

Kiểm soát SQL, tracking state và persistence boundary của một use case.

### Query execution

```csharp
var query = dbContext.Orders
    .Where(x => x.Status == OrderStatus.Pending);

var orders = await query
    .Select(x => new OrderListItemDto
    {
        Id = x.Id,
        Code = x.Code,
        Total = x.Total
    })
    .ToListAsync(cancellationToken);
```

Query thường được thực thi khi materialize bằng `ToListAsync`, `SingleAsync`, `FirstAsync` hoặc operation tương đương.

Mỗi query cần làm rõ:

- SQL thực thi tại đâu.
- Cột và dòng được đọc.
- Entity có được tracking.
- Navigation có tạo N+1.
- Filter/sort/paging được thực hiện ở database.
- Query shape có phù hợp index.

### Tracking strategy

Tracking phù hợp khi entity được load để cập nhật trong cùng Unit of Work. Projection hoặc `AsNoTracking` phù hợp với nhiều read model:

```csharp
var order = await dbContext.Orders
    .AsNoTracking()
    .Where(x => x.Id == id)
    .Select(x => new OrderDetailDto
    {
        Id = x.Id,
        Code = x.Code,
        Status = x.Status
    })
    .SingleOrDefaultAsync(cancellationToken);
```

Tracking là quyết định theo use case, không phải convention áp dụng máy móc.

### Save boundary

`SaveChangesAsync` nên phản ánh một persistence boundary có ý nghĩa:

- Những thay đổi nào thuộc cùng use case?
- Những thay đổi nào phải thành công hoặc thất bại cùng nhau?
- External side effect nằm ngoài database transaction được xử lý thế nào?
- Failure sau khi database commit để lại trạng thái gì?

Transaction, concurrency và outbox sẽ được phát triển ở chặng Middle.

### Thực hành

Chọn một API list:

1. Ghi lại SQL do EF Core sinh.
2. Đếm số query của một request.
3. Kiểm tra số cột và số dòng được đọc.
4. Tạo dataset đủ lớn.
5. Tối ưu projection, paging và sort.
6. So sánh latency và resource usage trước/sau.

### Tiêu chí hoàn thành

- Giải thích được query execution và tracking state.
- Phát hiện N+1 và over-fetching.
- Thiết kế list query có paging và deterministic sort.
- Xác định save boundary của command.

Đọc sâu: [EF Core Production Patterns](/dotnet-core/ef-core-production-patterns).

---

## 9. Configuration, Options và secret

### Mục tiêu

Quản lý configuration như một typed contract được validate khi application khởi động.

### Typed Options

```csharp
public sealed class PaymentOptions
{
    public const string SectionName = "Payment";

    public required string BaseUrl { get; init; }
    public int TimeoutSeconds { get; init; }
}
```

```csharp
services
    .AddOptions<PaymentOptions>()
    .BindConfiguration(PaymentOptions.SectionName)
    .Validate(
        x => Uri.TryCreate(x.BaseUrl, UriKind.Absolute, out _),
        "Payment BaseUrl must be an absolute URL.")
    .Validate(
        x => x.TimeoutSeconds is > 0 and <= 120,
        "Payment timeout must be between 1 and 120 seconds.")
    .ValidateOnStart();
```

Application fail sớm khi configuration bắt buộc không hợp lệ.

### Options lifetime

| API | Sử dụng |
|---|---|
| `IOptions<T>` | Configuration ổn định trong application lifetime |
| `IOptionsSnapshot<T>` | Snapshot theo request/scope |
| `IOptionsMonitor<T>` | Theo dõi thay đổi và dùng được trong singleton |

### Secret handling

- Tách secret khỏi configuration thông thường.
- Không commit secret vào source control.
- Không log toàn bộ configuration.
- Hỗ trợ rotation theo environment.
- Giới hạn quyền truy cập secret.

### Tiêu chí hoàn thành

- Chuyển một integration config sang typed Options.
- Validate config tại startup.
- Test trường hợp config thiếu hoặc sai.
- Xác minh telemetry không làm lộ secret.

---

## 10. Logging và integration testing

### Mục tiêu

Tạo bằng chứng để xác minh behavior và điều tra lỗi.

### Structured logging

Một log event hữu ích cần đủ context:

- Operation.
- Correlation/request identifier.
- User hoặc tenant.
- Business entity.
- Kết quả và duration.
- Dependency hoặc retry state.

```csharp
logger.LogInformation(
    "Approved order {OrderId} by user {UserId}",
    order.Id,
    currentUser.Id);
```

Giữ dữ liệu nhạy cảm ngoài telemetry: password, token, cookie, secret và payload chứa thông tin riêng tư.

### Test strategy

| Loại test | Chứng minh |
|---|---|
| Unit test | Business rule độc lập |
| Integration test | Route, DI, authorization, database và error pipeline |

Mock không chứng minh được EF query, database constraint, middleware order hoặc route configuration.

### Bộ test cho command API

Với `POST /api/orders/{id}/approve`:

1. User hợp lệ duyệt order `Pending`.
2. Contract sai trả error schema chuẩn.
3. Caller chưa xác thực nhận `401`.
4. Caller không có quyền nhận kết quả theo security convention.
5. Order không tồn tại nhận `404`.
6. Order sai trạng thái không bị thay đổi.
7. Persistence failure không để lại partial state.
8. Error có correlation identifier.

### Tiêu chí hoàn thành

- Log query được theo business identifier.
- Exception không bị log lặp ở nhiều layer.
- Unit test bảo vệ business rule.
- Integration test bảo vệ HTTP và persistence behavior.

---

## 11. Capstone — Approve Order

### Use case

```http
POST /api/orders/{id}/approve
```

### Yêu cầu

#### API contract

- Route và HTTP semantics rõ ràng.
- DTO tách khỏi entity.
- Validation và error schema nhất quán.

#### Boundary

- Controller chỉ xử lý HTTP concern.
- Application/domain bảo vệ business rule.
- Authorization được thực thi tại server.

#### Runtime

- DI lifetime đúng.
- Async flow không blocking.
- Cancellation đi tới I/O boundary.

#### Persistence

- Query và tracking có chủ đích.
- Save boundary phản ánh use case.
- SQL quan trọng đã được kiểm tra.

#### Confidence

- Structured log có order, user và correlation identifier.
- Integration test bao phủ success, validation, authorization và business failure.
- Request flow được mô tả trong tài liệu ngắn.

### Câu hỏi review

- Client disconnect ảnh hưởng operation thế nào?
- Database failure được map và log ở đâu?
- Authorization bảo vệ ownership/branch scope thế nào?
- API có thể làm lộ field nội bộ khi entity thay đổi không?
- Request lặp lại tạo behavior gì?
- Hai user duyệt cùng lúc tạo behavior gì?

Hai câu cuối xác định phạm vi học tiếp ở chặng Middle: idempotency và concurrency control.

---

## 12. Checklist hoàn thành

### Request và API

- [ ] Trace được request từ pipeline tới response.
- [ ] Tách đúng contract validation, authorization và business rule.
- [ ] Controller giữ đúng HTTP boundary.
- [ ] API có DTO và error contract ổn định.

### DI và async

- [ ] Giải thích được lifetime của service.
- [ ] Object graph không có captive dependency.
- [ ] Async flow không chứa sync-over-async.
- [ ] Cancellation đi xuyên các I/O operation.
- [ ] Request scope không bị giữ bởi background task.

### EF Core

- [ ] Xác định được thời điểm query thực thi.
- [ ] Giải thích được tracking strategy.
- [ ] List query có projection, paging và sort phù hợp.
- [ ] SQL quan trọng đã được kiểm tra.
- [ ] Save boundary phản ánh use case.

### Configuration và confidence

- [ ] Configuration quan trọng sử dụng typed Options và validation.
- [ ] Secret không xuất hiện trong source hoặc telemetry.
- [ ] Log có correlation và business identifier.
- [ ] Business rule có unit test.
- [ ] HTTP/persistence behavior có integration test.

---

## 13. Điểm chuyển sang Middle

Chặng Strong Junior hoàn thành khi người học có thể review một endpoint theo lifecycle, boundary, data behavior và test evidence.

Chặng Middle bắt đầu với các câu hỏi:

- Hai request chạy đồng thời ảnh hưởng invariant thế nào?
- Retry có tạo side effect trùng không?
- Transaction bao phủ những thay đổi nào?
- External dependency timeout giữ tài nguyên bao lâu?
- Worker restart giữa job để lại trạng thái gì?
- Query hoạt động thế nào khi dữ liệu tăng lớn?

Đây là bước chuyển từ hiểu đúng framework sang làm chủ production correctness.
