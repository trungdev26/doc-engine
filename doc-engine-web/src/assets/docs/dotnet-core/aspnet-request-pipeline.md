# ASP.NET Core Request Lifecycle

> Tài liệu này giải thích vòng đời của một HTTP request trong ASP.NET Core từ nền tảng đến các điểm cần quan tâm khi thiết kế API thực tế: middleware pipeline, routing, authentication, authorization, MVC pipeline, dependency injection, transaction, cancellation, logging, background job và xử lý lỗi.

---

## 1. Request Lifecycle là gì?

**Request Lifecycle** là toàn bộ hành trình của một HTTP request từ lúc client gửi request đến lúc ASP.NET Core trả response.

Ví dụ frontend gọi API:

```http
POST /api/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "customerId": 10,
  "items": [
    { "productId": 1001, "quantity": 2 }
  ]
}
```

Request này không đi thẳng vào controller ngay. Nó đi qua nhiều tầng:

```text
Client
  -> Reverse Proxy / Load Balancer
  -> Kestrel
  -> ASP.NET Core Middleware Pipeline
  -> Routing
  -> Authentication
  -> Authorization
  -> Endpoint
  -> MVC Pipeline
  -> Model Binding
  -> Validation
  -> Controller Action
  -> Application Service
  -> Repository / DbContext
  -> Database / External Services
  -> Result
  -> Response Middleware
  -> Client
```

Điểm quan trọng:

> Controller chỉ là một điểm trong vòng đời request, không phải toàn bộ vòng đời request.

Nếu chỉ hiểu controller gọi service, bạn sẽ khó xử lý các vấn đề như:

- Vì sao `[Authorize]` không hoạt động?
- Vì sao exception handler không bắt được lỗi?
- Vì sao API đã timeout nhưng database vẫn chạy?
- Vì sao `DbContext` bị disposed?
- Vì sao response đã bắt đầu gửi nên không thể trả JSON lỗi?
- Vì sao request chậm ở p99 dù code action nhìn đơn giản?

---

## 2. Bản đồ tổng quan một request

Một request API thông thường có thể nhìn như sau:

```text
[Client]
   |
   v
[Reverse Proxy / Load Balancer]
   |
   v
[Kestrel]
   |
   v
[HttpContext]
   |
   v
[Middleware 1: Exception Handling]
   |
   v
[Middleware 2: HTTPS / Static Files / CORS / Logging]
   |
   v
[Middleware 3: Routing]
   |
   v
[Middleware 4: Authentication]
   |
   v
[Middleware 5: Authorization]
   |
   v
[Endpoint: Controller / Minimal API / Razor Page / SignalR]
   |
   v
[MVC Pipeline: Filters -> Model Binding -> Validation -> Action]
   |
   v
[Application Service / Domain Logic]
   |
   v
[Database / Cache / HTTP / Queue]
   |
   v
[Result]
   |
   v
[Response đi ngược qua middleware]
   |
   v
[Client nhận response]
```

Có hai chiều cần nhớ:

```text
Request đi vào:  middleware chạy từ trên xuống
Response đi ra:  middleware chạy ngược từ dưới lên
```

Ví dụ:

```csharp
app.Use(async (context, next) =>
{
    Console.WriteLine("A - before");
    await next();
    Console.WriteLine("A - after");
});

app.Use(async (context, next) =>
{
    Console.WriteLine("B - before");
    await next();
    Console.WriteLine("B - after");
});

app.MapGet("/ping", () => "pong");
```

Khi gọi `/ping`, thứ tự log là:

```text
A - before
B - before
Endpoint executes
B - after
A - after
```

Đây là bản chất “bao quanh” của middleware.

---

## 3. Các khái niệm nền tảng cần nắm

### 3.1. Kestrel

Kestrel là web server mặc định của ASP.NET Core. Nó chịu trách nhiệm nhận HTTP connection, đọc request, ghi response.

Trong production, request thường đi như sau:

```text
Internet
  -> Nginx / IIS / Apache / Cloud Load Balancer
  -> Kestrel
  -> ASP.NET Core app
```

Reverse proxy thường xử lý:

- TLS termination
- Load balancing
- Compression
- Request size limit
- Timeout
- Forwarded headers
- Static file hoặc caching ở tầng ngoài

Kestrel xử lý request ở tầng app server.

---

### 3.2. `HttpContext`

`HttpContext` là object đại diện cho request hiện tại.

Nó chứa:

```csharp
HttpContext.Request          // thông tin request
HttpContext.Response         // thông tin response
HttpContext.User             // ClaimsPrincipal sau authentication
HttpContext.Items            // dữ liệu tạm trong request
HttpContext.RequestServices  // service provider của scope hiện tại
HttpContext.Connection       // thông tin connection
HttpContext.Features         // tính năng nền của server
```

Ví dụ:

```csharp
var path = HttpContext.Request.Path;
var method = HttpContext.Request.Method;
var traceId = HttpContext.TraceIdentifier;
var user = HttpContext.User;
```

Nói ngắn gọn:

> `HttpContext` là “hồ sơ sống” của request đang được xử lý.

Không nên giữ `HttpContext` lâu dài ngoài request. Nếu cần lấy user id, tenant id, correlation id, hãy copy giá trị cần thiết ra object riêng.

---

### 3.3. Middleware

Middleware là thành phần nằm trong request pipeline.

Một middleware có thể:

1. Xử lý request trước khi gọi tầng sau.
2. Gọi middleware tiếp theo bằng `next()`.
3. Xử lý response sau khi tầng sau chạy xong.
4. Dừng request và trả response luôn.

Ví dụ middleware tự viết:

```csharp
app.Use(async (context, next) =>
{
    var startedAt = Stopwatch.GetTimestamp();

    await next();

    var elapsedMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
    logger.LogInformation("{Method} {Path} finished in {ElapsedMs} ms",
        context.Request.Method,
        context.Request.Path,
        elapsedMs);
});
```

Middleware phù hợp cho các concern mang tính phạm vi request:

- Exception handling
- Correlation id
- Request logging
- CORS
- Authentication
- Authorization
- Rate limiting
- Response compression
- Static files
- Security headers

Middleware không phù hợp để chứa business rule cụ thể như:

- Đơn đã duyệt không được sửa
- Phiếu đã thanh toán không được hủy
- Chỉ định đã gửi LIS không được xóa cứng
- Giá vốn sau khi khóa sổ không được sửa

Các rule đó thuộc application/domain layer.

---

### 3.4. Endpoint

Endpoint là điểm cuối thực thi request sau khi routing match thành công.

Endpoint có thể là:

```text
Controller action
Minimal API handler
Razor Page
SignalR Hub
gRPC service
Health check endpoint
```

Ví dụ Minimal API:

```csharp
app.MapGet("/health", () => Results.Ok("OK"));
```

Ví dụ Controller:

```csharp
app.MapControllers();
```

---

## 4. Giai đoạn 1: Request đi vào web server

Client gửi request:

```http
GET /api/products/10 HTTP/1.1
Host: example.com
Authorization: Bearer <token>
```

Nếu có reverse proxy, request đi qua proxy trước:

```text
Client -> Nginx/IIS/Load Balancer -> Kestrel
```

Ở tầng này có vài điểm dễ gây lỗi:

### 4.1. Timeout

Có nhiều timeout khác nhau:

```text
Client timeout
Proxy timeout
Kestrel timeout
Database command timeout
HTTP client timeout
```

Một API bị timeout không có nghĩa là code trong app đã dừng ngay. Nếu bạn không truyền `CancellationToken`, database query hoặc HTTP call phía sau có thể vẫn tiếp tục chạy.

---

### 4.2. Forwarded headers

Khi dùng reverse proxy, app có thể thấy IP là IP của proxy thay vì IP thật của client.

Cần cấu hình forwarded headers nếu app cần biết scheme/IP gốc:

```csharp
app.UseForwardedHeaders();
```

Nếu cấu hình sai, có thể gặp lỗi:

- Redirect HTTPS sai
- Sinh URL callback sai
- Log IP sai
- OAuth redirect URI sai

---

### 4.3. Request size limit

Upload file hoặc body quá lớn có thể bị chặn ở nhiều tầng:

```text
Nginx client_max_body_size
IIS max request length
Kestrel limits
ASP.NET Core form options
Action-specific limit
```

Nếu API upload lỗi 413 Payload Too Large, không nên chỉ nhìn controller. Phải kiểm tra cả proxy và Kestrel.

---

## 5. Giai đoạn 2: ASP.NET Core tạo `HttpContext`

Khi Kestrel nhận request, ASP.NET Core tạo `HttpContext` cho request đó.

Một request có một scope DI riêng. Trong scope đó, các service scoped sẽ được dùng chung trong suốt request.

Ví dụ đăng ký:

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddDbContext<AppDbContext>();
```

Trong một request:

```text
HttpContext
  -> RequestServices
       -> OrderService instance
       -> AppDbContext instance
```

Request khác sẽ có scope khác:

```text
Request A -> AppDbContext A
Request B -> AppDbContext B
```

Đây là lý do `DbContext` thường được đăng ký scoped.

---

## 6. Giai đoạn 3: Request đi qua Middleware Pipeline

Ví dụ cấu hình phổ biến:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();

var app = builder.Build();

app.UseExceptionHandler();
app.UseForwardedHeaders();
app.UseHttpsRedirection();
app.UseCors();
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

Pipeline này không chỉ là “setup cho có”. Thứ tự của nó ảnh hưởng trực tiếp đến correctness.

Request sẽ đi theo thứ tự:

```text
UseExceptionHandler
  -> UseForwardedHeaders
  -> UseHttpsRedirection
  -> UseCors
  -> UseRouting
  -> UseAuthentication
  -> UseAuthorization
  -> MapControllers
```

Response đi ngược lại.

---

## 7. Thứ tự middleware và vì sao nó ảnh hưởng correctness

### 7.1. `UseExceptionHandler` nên đặt sớm

```csharp
app.UseExceptionHandler();
```

Nếu exception handler đặt quá muộn, lỗi xảy ra ở middleware đứng trước nó sẽ không được bắt đúng cách.

Sai:

```csharp
app.UseAuthentication();
app.UseExceptionHandler();
```

Nếu authentication middleware ném lỗi, exception handler phía sau chưa được đi qua nên không bao được lỗi đó.

Đúng hơn:

```csharp
app.UseExceptionHandler();
app.UseAuthentication();
```

---

### 7.2. `UseRouting` trước `UseAuthorization`

Authorization thường cần biết endpoint metadata.

Ví dụ action có:

```csharp
[Authorize(Policy = "CanViewReport")]
[HttpGet("reports/{id}")]
public IActionResult GetReport(Guid id)
{
    return Ok();
}
```

`UseAuthorization()` cần biết endpoint nào đã được match để đọc metadata `[Authorize]`.

Thứ tự thường dùng:

```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

---

### 7.3. `UseAuthentication` trước `UseAuthorization`

Authentication dựng `HttpContext.User`.

Authorization đọc `HttpContext.User` để kiểm tra quyền.

Vì vậy:

```csharp
app.UseAuthentication();
app.UseAuthorization();
```

Không nên đảo:

```csharp
app.UseAuthorization();
app.UseAuthentication();
```

Nếu đảo sai, authorization có thể thấy user là anonymous dù token hợp lệ.

---

### 7.4. CORS phải đặt đúng vị trí

CORS sai thứ tự dễ gây lỗi frontend thấy request bị chặn dù backend có trả response.

Thứ tự phổ biến:

```csharp
app.UseRouting();
app.UseCors("DefaultPolicy");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

Tùy cấu hình, cần kiểm tra kỹ khi dùng endpoint routing.

---

### 7.5. Static files có thể short-circuit request

```csharp
app.UseStaticFiles();
```

Nếu request match static file, middleware có thể trả file luôn và không gọi controller.

Nghĩa là không phải request nào cũng đi đến endpoint/controller.

---

## 8. Giai đoạn 4: Routing và Endpoint Selection

Routing có nhiệm vụ match request với endpoint.

Ví dụ controller:

```csharp
[ApiController]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        return Ok();
    }
}
```

Request:

```http
GET /api/products/10
```

Sẽ match với:

```text
ProductsController.GetById(id = 10)
```

Routing dựa vào:

- HTTP method: GET, POST, PUT, DELETE...
- Route template: `/api/products/{id}`
- Route constraint: `{id:int}`
- Endpoint metadata

Nếu không match endpoint:

```text
404 Not Found
```

Nếu match path nhưng sai method:

```text
405 Method Not Allowed
```

Ví dụ:

```csharp
[HttpPost]
public IActionResult Create(CreateProductDto input)
{
    return Ok();
}
```

Nếu client gọi:

```http
GET /api/products
```

thì không vào action `Create`.

---

## 9. Giai đoạn 5: Authentication

Authentication trả lời câu hỏi:

> Người gọi request này là ai?

Ví dụ request có JWT:

```http
Authorization: Bearer eyJhbGciOi...
```

Authentication middleware sẽ:

1. Đọc token từ header.
2. Validate chữ ký.
3. Validate issuer/audience/expired time.
4. Tạo `ClaimsPrincipal`.
5. Gán vào `HttpContext.User`.

Sau đó trong code có thể đọc:

```csharp
var userId = User.FindFirst("sub")?.Value;
var username = User.Identity?.Name;
```

Nếu token sai, hết hạn hoặc thiếu, kết quả phụ thuộc endpoint có yêu cầu authorize hay không.

- Endpoint public: vẫn có thể chạy với anonymous user.
- Endpoint có `[Authorize]`: bị trả 401.

---

## 10. Giai đoạn 6: Authorization

Authorization trả lời câu hỏi:

> Người này có được phép làm hành động này không?

Ví dụ:

```csharp
[Authorize]
[HttpGet("me")]
public IActionResult GetProfile()
{
    return Ok();
}
```

Hoặc:

```csharp
[Authorize(Roles = "Admin")]
[HttpDelete("{id}")]
public IActionResult Delete(Guid id)
{
    return Ok();
}
```

Cần phân biệt:

```text
401 Unauthorized  = chưa xác thực hoặc token không hợp lệ
403 Forbidden     = đã xác thực nhưng không có quyền
```

### 10.1. Role-based authorization

Phù hợp cho quyền thô:

```csharp
[Authorize(Roles = "Admin")]
```

Ví dụ:

- Chỉ Admin được cấu hình hệ thống
- Chỉ Kế toán được xem báo cáo doanh thu
- Chỉ Điều dưỡng được xác nhận lấy mẫu

---

### 10.2. Policy-based authorization

Phù hợp hơn khi logic phức tạp:

```csharp
[Authorize(Policy = "CanApproveOrder")]
```

Policy có thể kiểm tra claim, role hoặc logic riêng.

---

### 10.3. Resource-based authorization

Role không đủ khi quyền phụ thuộc vào resource cụ thể.

Ví dụ:

- User chỉ được sửa đơn thuộc chi nhánh của mình.
- Bác sĩ chỉ được xem phiếu khám được phân công.
- Tenant A không được đọc dữ liệu Tenant B.

Ví dụ:

```csharp
var order = await _db.Orders.SingleOrDefaultAsync(x => x.Id == id, ct);
if (order is null) return NotFound();

var result = await _authorizationService.AuthorizeAsync(
    User,
    order,
    "CanEditOrder");

if (!result.Succeeded) return Forbid();
```

Điểm cần nhớ:

> Không tin `tenantId`, `shopId`, `userId` do client gửi nếu đó là dữ liệu xác định phạm vi quyền.

Những giá trị này nên lấy từ identity/context đáng tin.

---

## 11. Giai đoạn 7: Endpoint Execution

Sau khi middleware xử lý xong, request đến endpoint.

Với Controller API:

```csharp
app.MapControllers();
```

Với Minimal API:

```csharp
app.MapPost("/orders", async (CreateOrderDto input, IOrderService service) =>
{
    var result = await service.CreateAsync(input);
    return Results.Ok(result);
});
```

Endpoint là nơi request chuyển từ tầng HTTP pipeline sang code xử lý cụ thể.

Nhưng với Controller, bên trong endpoint còn có MVC pipeline.

---

## 12. MVC/Web API Pipeline bên trong endpoint

Khi endpoint là controller action, request tiếp tục đi qua MVC pipeline.

Luồng đơn giản:

```text
Endpoint matched
  -> Controller activation
  -> Filters
  -> Model binding
  -> Model validation
  -> Action execution
  -> Result execution
```

Chi tiết hơn:

```text
Authorization Filters
  -> Resource Filters
      -> Model Binding
      -> Action Filters
          -> Action Method
      -> Exception Filters
      -> Result Filters
          -> Result Execution
```

Điểm cần nhớ:

> Middleware bao toàn bộ pipeline. Filter chỉ tồn tại trong MVC pipeline.

Vì vậy, nếu lỗi xảy ra trước khi vào MVC, MVC filter không bắt được.

---

## 13. Model Binding

Model Binding là quá trình ASP.NET Core lấy dữ liệu từ HTTP request và bind vào parameter/model.

Nguồn dữ liệu có thể gồm:

```text
Route values
Query string
Header
Body
Form
Services
```

Ví dụ route + query:

```http
GET /api/products/10?includeStock=true
```

Action:

```csharp
[HttpGet("{id:int}")]
public IActionResult GetById(int id, bool includeStock)
{
    return Ok();
}
```

Kết quả:

```text
id = 10
includeStock = true
```

Ví dụ body JSON:

```http
POST /api/products
Content-Type: application/json

{
  "name": "Paracetamol",
  "price": 12000
}
```

DTO:

```csharp
public sealed class CreateProductDto
{
    public string Name { get; set; } = default!;
    public decimal Price { get; set; }
}
```

Action:

```csharp
[HttpPost]
public IActionResult Create(CreateProductDto input)
{
    return Ok();
}
```

ASP.NET Core sẽ đọc body và map JSON vào `CreateProductDto`.

---

### 13.1. `[FromRoute]`, `[FromQuery]`, `[FromBody]`, `[FromHeader]`

Có thể chỉ rõ nguồn bind:

```csharp
[HttpGet("{id:int}")]
public IActionResult Get(
    [FromRoute] int id,
    [FromQuery] bool includeStock,
    [FromHeader(Name = "X-Tenant-Id")] string? tenantHeader)
{
    return Ok();
}
```

Với API rõ ràng, nên dùng attribute khi parameter dễ gây hiểu nhầm.

---

### 13.2. Một request body thường chỉ đọc một lần

Request body là stream. Nếu middleware đọc body không đúng cách, đến controller có thể không đọc được nữa.

Ví dụ middleware đọc body để log:

```csharp
app.Use(async (context, next) =>
{
    using var reader = new StreamReader(context.Request.Body);
    var body = await reader.ReadToEndAsync();

    await next();
});
```

Code trên có thể làm controller không bind được body vì stream đã bị đọc hết.

Nếu cần đọc body trong middleware, phải enable buffering và reset position:

```csharp
context.Request.EnableBuffering();

using var reader = new StreamReader(
    context.Request.Body,
    encoding: Encoding.UTF8,
    detectEncodingFromByteOrderMarks: false,
    leaveOpen: true);

var body = await reader.ReadToEndAsync();
context.Request.Body.Position = 0;

await next();
```

Nhưng không nên log body mặc định, vì có rủi ro:

- Lộ token, mật khẩu, dữ liệu nhạy cảm
- Tốn RAM với body lớn
- Làm tăng latency
- Gây áp lực GC

---

## 14. Model Validation

Validation kiểm tra dữ liệu đầu vào sau khi model binding.

Ví dụ:

```csharp
public sealed class CreateOrderDto
{
    [Required]
    public Guid? CustomerId { get; set; }

    [MinLength(1)]
    public List<CreateOrderItemDto> Items { get; set; } = new();
}

public sealed class CreateOrderItemDto
{
    [Required]
    public Guid? ProductId { get; set; }

    [Range(1, 9999)]
    public int Quantity { get; set; }
}
```

Nếu controller có `[ApiController]`, ASP.NET Core có thể tự trả 400 khi model state invalid.

```csharp
[ApiController]
[Route("api/orders")]
public class OrdersController : ControllerBase
{
    [HttpPost]
    public IActionResult Create(CreateOrderDto input)
    {
        return Ok();
    }
}
```

Nếu request thiếu `CustomerId`, action có thể chưa chạy mà response đã là 400.

---

### 14.1. Validation HTTP khác business validation

Cần phân biệt:

```text
HTTP/Input validation:
- Field bắt buộc
- Định dạng email sai
- Quantity phải > 0
- Date parse không được

Business validation:
- Đơn đã duyệt không được sửa
- Sản phẩm đã ngừng kinh doanh không được bán
- Mẫu đã bàn giao lab không được hủy lấy mẫu
- Không đủ tồn kho để xuất
```

HTTP validation có thể nằm ở DTO/model validation.

Business validation nên nằm ở application/domain service.

Ví dụ:

```csharp
public async Task ApproveOrderAsync(Guid orderId, CancellationToken ct)
{
    var order = await _orders.GetByIdAsync(orderId, ct);
    if (order is null)
        throw new NotFoundException("Order not found");

    if (order.Status != OrderStatus.Pending)
        throw new BusinessException("Only pending order can be approved");

    order.Approve();
    await _unitOfWork.SaveChangesAsync(ct);
}
```

---

## 15. Filters trong MVC

Filters cho phép chạy logic trước/sau các giai đoạn trong MVC.

Các loại filter phổ biến:

```text
Authorization Filter
Resource Filter
Action Filter
Exception Filter
Result Filter
```

### 15.1. Action Filter

Chạy trước/sau action method.

```csharp
public sealed class LogActionFilter : IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        Console.WriteLine("Before action");
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
        Console.WriteLine("After action");
    }
}
```

Phù hợp cho:

- Log phạm vi action
- Validate convention đặc biệt
- Thêm metadata cho result

Không nên dùng action filter để chứa business rule quan trọng.

---

### 15.2. Exception Filter

Exception filter bắt exception trong MVC action/filter pipeline.

Nhưng exception filter không bắt lỗi xảy ra ở middleware trước MVC.

Vì vậy, error handling toàn cục thường nên đặt ở middleware/exception handler.

---

### 15.3. Result Filter

Result filter chạy trước/sau khi result được execute.

Ví dụ có thể dùng để thêm header cho response MVC.

Nhưng nếu response đã started thì một số thay đổi header/status code không còn hiệu lực.

---

### 15.4. Middleware hay Filter?

| Nhu cầu | Nên đặt ở đâu | Lý do |
| --- | --- | --- |
| Correlation id | Middleware | Cần áp dụng cho toàn request, kể cả trước MVC |
| Exception mapping toàn API | Middleware | Bao được nhiều tầng hơn filter |
| CORS | Middleware | Là HTTP cross-cutting concern |
| Authentication | Middleware | Cần dựng `HttpContext.User` sớm |
| Authorization theo endpoint | Middleware + policy | Cần endpoint metadata và user |
| Validate DTO | Model validation / endpoint filter | Gần HTTP contract |
| Log tên action | Action filter | Cần thông tin MVC action |
| Business rule | Application/domain service | Không phụ thuộc HTTP |
| Audit business event | Service + transaction/outbox | Phải nhất quán với nghiệp vụ |

---

## 16. Controller, Application Service và Domain Logic

Controller nên mỏng.

Nhiệm vụ chính của controller:

- Nhận request
- Dựa vào HTTP contract
- Gọi application service
- Trả response phù hợp

Ví dụ:

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(
        CreateOrderDto input,
        CancellationToken ct)
    {
        var result = await _orderService.CreateAsync(input, ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<OrderDto>> GetById(Guid id, CancellationToken ct)
    {
        var result = await _orderService.GetByIdAsync(id, ct);
        return result is null ? NotFound() : Ok(result);
    }
}
```

Application service xử lý use case:

```csharp
public sealed class OrderService : IOrderService
{
    private readonly AppDbContext _db;
    private readonly ICurrentUser _currentUser;

    public OrderService(AppDbContext db, ICurrentUser currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    public async Task<OrderDto> CreateAsync(CreateOrderDto input, CancellationToken ct)
    {
        var customer = await _db.Customers
            .SingleOrDefaultAsync(x => x.Id == input.CustomerId, ct);

        if (customer is null)
            throw new NotFoundException("Customer not found");

        var order = new Order(customer.Id, _currentUser.UserId);

        foreach (var item in input.Items)
        {
            var product = await _db.Products
                .SingleOrDefaultAsync(x => x.Id == item.ProductId, ct);

            if (product is null)
                throw new BusinessException("Product not found");

            order.AddItem(product.Id, item.Quantity, product.Price);
        }

        _db.Orders.Add(order);
        await _db.SaveChangesAsync(ct);

        return new OrderDto
        {
            Id = order.Id,
            Code = order.Code,
            TotalAmount = order.TotalAmount
        };
    }
}
```

Cách chia này giúp:

- Controller không phình to
- Business logic dùng lại được cho worker/command handler
- Test dễ hơn
- HTTP concern không trộn với business concern

---

## 17. Dependency Injection Scope trong một request

ASP.NET Core DI có ba lifetime phổ biến:

```text
Transient: tạo mới mỗi lần resolve
Scoped:    tạo một lần trong một scope/request
Singleton: tạo một lần cho toàn app
```

### 17.1. Transient

```csharp
builder.Services.AddTransient<IEmailFormatter, EmailFormatter>();
```

Mỗi lần resolve là một instance mới.

Phù hợp cho service nhẹ, không giữ state.

---

### 17.2. Scoped

```csharp
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddDbContext<AppDbContext>();
```

Trong web request, scoped thường tương ứng với một request.

Phù hợp cho:

- `DbContext`
- Repository
- Application service
- Unit of Work
- Current tenant/user context

---

### 17.3. Singleton

```csharp
builder.Services.AddSingleton<ISystemClock, SystemClock>();
```

Một instance dùng chung toàn app.

Phù hợp cho:

- Stateless service
- Cache provider thread-safe
- Configuration holder immutable
- Factory thread-safe

Không phù hợp cho object giữ state theo request.

---

### 17.4. Lỗi: Singleton inject Scoped

Sai:

```csharp
public sealed class MySingletonService
{
    private readonly AppDbContext _db;

    public MySingletonService(AppDbContext db)
    {
        _db = db;
    }
}
```

Vì `AppDbContext` là scoped nhưng singleton sống lâu hơn request.

Hậu quả:

- Captive dependency
- DbContext bị giữ quá lâu
- Dữ liệu tracking sai
- Lỗi disposed
- Không thread-safe

Nếu singleton/background service cần scoped service, dùng `IServiceScopeFactory`:

```csharp
public sealed class ReportWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ReportWorker(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await using var scope = _scopeFactory.CreateAsyncScope();

            var handler = scope.ServiceProvider
                .GetRequiredService<ReportJobHandler>();

            await handler.ProcessNextAsync(stoppingToken);
        }
    }
}
```

---

### 17.5. Lỗi: `Task.Run` giữ scoped service sau request

Sai:

```csharp
[HttpPost]
public IActionResult Create(CreateOrderDto input)
{
    Task.Run(async () =>
    {
        await _orderService.CreateAsync(input, CancellationToken.None);
    });

    return Accepted();
}
```

Vấn đề:

- `_orderService` là scoped, request kết thúc có thể bị dispose.
- Exception trong task khó quan sát.
- App restart là mất task.
- Không retry bền vững.
- Không có idempotency.

Đúng hơn:

```text
Controller -> lưu job/outbox vào database -> trả 202
Worker -> lấy job -> xử lý -> cập nhật trạng thái
```

---

## 18. `DbContext`, Unit of Work và Transaction Boundary

### 18.1. `DbContext` trong request

`DbContext` thường sống trong request scope.

```csharp
builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(connectionString);
});
```

Trong một request:

```text
Controller -> Service -> Repository -> DbContext
```

Cùng một `DbContext` có thể track entity trong use case.

Ví dụ:

```csharp
var order = await _db.Orders.SingleAsync(x => x.Id == id, ct);
order.ChangeAddress(input.Address);
await _db.SaveChangesAsync(ct);
```

EF Core biết entity đã thay đổi và sinh SQL update.

---

### 18.2. Transaction Boundary nên đặt ở đâu?

Transaction boundary là ranh giới quyết định phần nào phải commit/rollback cùng nhau.

Ví dụ tạo đơn hàng:

```text
- Insert Order
- Insert OrderItems
- Trừ tồn kho
- Ghi BusinessEvent/Outbox
```

Các thao tác này nên nằm trong cùng transaction nếu cần nhất quán.

Không nên để controller tự mở transaction lung tung nếu application service đã là nơi điều phối use case.

Một pattern phổ biến:

```text
Controller
  -> Application Service
       -> Validate
       -> Change domain state
       -> SaveChanges
       -> Commit transaction
```

Hoặc trong ABP/Unit of Work framework, transaction có thể được quản lý tự động theo method boundary.

---

### 18.3. Không gọi external system tùy tiện trong transaction

Sai thường gặp:

```text
Begin transaction
  -> Insert order
  -> Call payment gateway
  -> Update order paid
Commit transaction
```

Nếu payment gateway chậm, transaction giữ connection/lock lâu.

Nếu payment gateway thành công nhưng commit DB fail, hệ thống bị lệch.

Cách an toàn hơn tùy bài toán:

```text
Option 1: DB commit trước -> outbox -> worker gọi external system
Option 2: Gọi external có idempotency key -> lưu kết quả -> compensation nếu cần
Option 3: Saga/process manager cho luồng nhiều bước
```

Với nghiệp vụ như thanh toán, LIS/HIS, xuất kho, gửi chỉ định, cần thiết kế rõ:

- Bước nào là nguồn sự thật?
- Bước nào có thể retry?
- Bước nào cần idempotency key?
- Bước nào cần compensation?
- Trạng thái trung gian là gì?

---

### 18.4. Outbox trong request lifecycle

Khi request thành công và cần phát event/message, không nên chỉ publish trực tiếp rồi hy vọng mọi thứ ổn.

Sai:

```csharp
_db.Orders.Add(order);
await _db.SaveChangesAsync(ct);
await _messageBus.PublishAsync(new OrderCreated(order.Id), ct);
```

Nếu publish fail sau khi DB commit, event bị mất.

Nếu publish thành công nhưng response fail, client retry có thể tạo trùng nếu không có idempotency.

Outbox:

```text
Trong cùng transaction:
  - Insert/Update business data
  - Insert OutboxMessage
Commit

Worker:
  - Đọc OutboxMessage chưa gửi
  - Publish message
  - Mark as sent
```

Trong request lifecycle, controller chỉ cần đảm bảo ý định nghiệp vụ được ghi bền. Việc giao tiếp bất đồng bộ để worker xử lý.

---

## 19. Response generation và serialization

Controller có thể trả nhiều loại result:

```csharp
return Ok(data);                 // 200
return CreatedAtAction(...);     // 201
return Accepted(...);            // 202
return NoContent();              // 204
return BadRequest(error);        // 400
return Unauthorized();           // 401
return Forbid();                 // 403
return NotFound();               // 404
return Conflict(error);          // 409
return Problem(...);             // 500 or custom
```

Khi action trả object, ASP.NET Core serialize object thành response body, thường là JSON.

Ví dụ:

```csharp
return Ok(new ProductDto
{
    Id = 10,
    Name = "Paracetamol"
});
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": 10,
  "name": "Paracetamol"
}
```

### 19.1. Không trả entity trực tiếp nếu không kiểm soát output

Sai:

```csharp
return Ok(orderEntity);
```

Rủi ro:

- Lộ field nội bộ
- Circular reference
- Lazy loading gây query bất ngờ
- Contract API phụ thuộc database model

Nên map sang DTO:

```csharp
return Ok(new OrderDto
{
    Id = order.Id,
    Code = order.Code,
    TotalAmount = order.TotalAmount
});
```

---

### 19.2. Serialization cũng có thể là bottleneck

Request chậm không chỉ do SQL.

Có thể chậm ở:

- Query trả quá nhiều row
- Map object quá lớn
- Serialize JSON payload lớn
- Response compression tốn CPU
- Network chậm

Với endpoint danh sách, nên phân trang và chọn field cần thiết.

---

## 20. Response đi ngược qua pipeline

Sau khi endpoint tạo response, response đi ngược lại qua các middleware.

Ví dụ middleware đo thời gian:

```csharp
app.Use(async (context, next) =>
{
    var sw = Stopwatch.StartNew();

    await next();

    sw.Stop();
    logger.LogInformation("Request completed: {StatusCode} in {ElapsedMs} ms",
        context.Response.StatusCode,
        sw.ElapsedMilliseconds);
});
```

Middleware này log được status code sau khi endpoint xử lý.

Một số middleware hoạt động chủ yếu ở chiều response:

- Response compression
- Security headers
- Logging duration/status code
- Exception handler
- Response caching

---

## 21. Exception handling và error contract

### 21.1. Không để exception thô trả ra client

Không nên để client nhận:

```text
System.NullReferenceException: Object reference not set...
   at MyApp.Services...
```

Vấn đề:

- Lộ thông tin nội bộ
- Contract lỗi không ổn định
- Frontend khó xử lý
- Dễ trả sai status code

Nên có error contract ổn định, ví dụ `ProblemDetails`:

```json
{
  "type": "https://example.com/problems/unexpected-error",
  "title": "Unexpected server error",
  "status": 500,
  "traceId": "00-abc..."
}
```

---

### 21.2. Mapping lỗi sang HTTP status code

| Tình huống | HTTP status | Ghi chú |
| --- | ---: | --- |
| Request body sai format | 400 | JSON parse lỗi, sai type |
| Validation input sai | 400 | Field thiếu, range sai |
| Chưa đăng nhập/token sai | 401 | Client cần authenticate |
| Không có quyền | 403 | Đã biết user nhưng không cho phép |
| Resource không tồn tại | 404 | Không tìm thấy hoặc không được tiết lộ |
| Conflict trạng thái | 409 | Version cũ, trạng thái không còn hợp lệ |
| Rate limit | 429 | Quá số lần gọi |
| Lỗi ngoài dự đoán | 500 | Log nội bộ, trả trace id |
| Dependency timeout | 504/503 | Tùy gateway/app contract |

---

### 21.3. Không `catch Exception` trong mọi controller

Sai:

```csharp
[HttpPost]
public async Task<IActionResult> Create(CreateOrderDto input)
{
    try
    {
        var result = await _service.CreateAsync(input);
        return Ok(result);
    }
    catch (Exception ex)
    {
        return BadRequest(ex.Message);
    }
}
```

Vấn đề:

- Lỗi server bị biến thành 400.
- Lộ message nội bộ.
- Monitoring không thấy exception đúng.
- Frontend hiểu sai nguyên nhân.

Đúng hơn:

```csharp
[HttpPost]
public async Task<IActionResult> Create(CreateOrderDto input, CancellationToken ct)
{
    var result = await _service.CreateAsync(input, ct);
    return Ok(result);
}
```

Exception mapping để middleware/filter chuyên trách xử lý.

---

### 21.4. Ví dụ exception middleware

```csharp
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var feature = context.Features.Get<IExceptionHandlerFeature>();
        var exception = feature?.Error;
        var traceId = Activity.Current?.Id ?? context.TraceIdentifier;

        var problem = exception switch
        {
            NotFoundException ex => new ProblemDetails
            {
                Status = StatusCodes.Status404NotFound,
                Title = ex.Message
            },
            BusinessException ex => new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = ex.Message
            },
            _ => new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Unexpected server error"
            }
        };

        problem.Extensions["traceId"] = traceId;
        context.Response.StatusCode = problem.Status ?? 500;
        context.Response.ContentType = "application/problem+json";

        await context.Response.WriteAsJsonAsync(problem);
    });
});
```

Lưu ý: business exception message chỉ nên là message an toàn để trả client.

---

## 22. CancellationToken và timeout

`CancellationToken` cho biết request có bị hủy không.

Request có thể bị hủy khi:

- Client đóng tab
- Client cancel request
- Proxy timeout
- App shutdown

Controller có thể nhận token:

```csharp
[HttpGet("orders/{id:guid}")]
public async Task<ActionResult<OrderDto>> Get(Guid id, CancellationToken ct)
{
    var order = await _db.Orders
        .AsNoTracking()
        .SingleOrDefaultAsync(x => x.Id == id, ct);

    return order is null ? NotFound() : Ok(ToDto(order));
}
```

Nên truyền token xuống các thao tác I/O:

```csharp
await _db.SaveChangesAsync(ct);
await _httpClient.SendAsync(request, ct);
await stream.CopyToAsync(destination, ct);
```

---

### 22.1. Cancellation không phải rollback nghiệp vụ tự động

Nếu request bị cancel trước khi thay đổi dữ liệu, có thể dừng.

Nhưng nếu đã qua điểm không thể đảo ngược, không nên cancel bừa.

Ví dụ:

```text
Đã charge tiền thành công
  -> không thể chỉ vì client đóng tab mà bỏ cập nhật DB
```

Với các bước kiểu này, cần thiết kế:

- Idempotency key
- Outbox
- Compensation
- Reconciliation job
- Trạng thái trung gian

Ví dụ:

```text
PaymentInitiated
PaymentSucceeded
OrderMarkedAsPaid
PaymentReconcileRequired
```

---

### 22.2. Timeout nên được thiết kế rõ

Một endpoint gọi dependency ngoài nên có timeout riêng.

Ví dụ:

```csharp
builder.Services.AddHttpClient<ILabClient, LabClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(10);
});
```

Nhưng không nên chỉ set timeout rồi bỏ qua trạng thái nghiệp vụ.

Nếu gọi LIS/HIS timeout, cần biết:

```text
Timeout nghĩa là bên kia chưa nhận?
Hay đã nhận nhưng chưa trả response?
Có retry an toàn không?
Có request id/idempotency key không?
Có API kiểm tra trạng thái không?
```

---

## 23. Long-running request và background processing

Không phải việc gì cũng nên xử lý trong HTTP request.

Các việc không nên giữ request lâu:

- Export Excel/PDF lớn
- Import file lớn
- Gửi hàng nghìn email/SMS
- Đồng bộ dữ liệu sang hệ thống ngoài
- Tính toán báo cáo nặng
- Rebuild tồn sau toàn bộ
- Gọi nhiều dependency có thể retry

### 23.1. Thiết kế đồng bộ

Phù hợp khi xử lý nhanh và có kết quả ngay:

```text
POST /orders
  -> validate
  -> save DB
  -> return 201
```

---

### 23.2. Thiết kế bất đồng bộ bằng job

Phù hợp với tác vụ dài:

```text
POST /exports
  -> validate quyền
  -> tạo ExportJob(Pending)
  -> return 202 Accepted + jobId

Worker
  -> lấy job Pending
  -> xử lý file
  -> upload storage
  -> update Completed/Failed

GET /exports/{jobId}
  -> trả trạng thái/progress/downloadUrl
```

Response ban đầu:

```http
HTTP/1.1 202 Accepted

{
  "jobId": "b4e7...",
  "status": "Pending"
}
```

---

### 23.3. Vì sao không dùng `Task.Run` trong controller?

Vì `Task.Run` không biến công việc thành bền vững.

Rủi ro:

- App restart là mất task.
- Không retry có kiểm soát.
- Không quan sát được trạng thái.
- Không có idempotency.
- Scoped service có thể bị dispose.
- Exception dễ bị nuốt.

Đúng hơn là lưu job/outbox vào DB rồi để worker xử lý.

---

## 24. Logging, correlation id, tracing và metrics

### 24.1. Correlation id

Một request production nên có id để lần theo.

Có thể dùng:

- `TraceIdentifier`
- W3C trace id từ `Activity`
- Header như `X-Correlation-ID`

Middleware ví dụ:

```csharp
app.Use(async (context, next) =>
{
    var correlationId = context.Request.Headers.TryGetValue("X-Correlation-ID", out var value)
        ? value.ToString()
        : context.TraceIdentifier;

    context.Response.Headers["X-Correlation-ID"] = correlationId;

    using (logger.BeginScope(new Dictionary<string, object?>
    {
        ["CorrelationId"] = correlationId,
        ["Path"] = context.Request.Path.Value,
        ["Method"] = context.Request.Method
    }))
    {
        await next();
    }
});
```

Log nên có structured fields:

```text
CorrelationId
TraceId
UserId/TenantId nếu an toàn
Endpoint
StatusCode
DurationMs
BusinessId: orderId, phieuKhamId, jobId...
```

Không nên chỉ log chuỗi dài khó query.

---

### 24.2. Metrics cần nhìn percentile

Average không đủ.

Nên theo dõi:

```text
request_count
request_duration_p50
request_duration_p95
request_duration_p99
error_rate
status_code_count
active_requests
dependency_duration
sql_duration
queue_length
```

Ví dụ API trung bình 200ms nhưng p99 là 8s thì người dùng vẫn thấy chậm.

---

### 24.3. Trace giúp tách thời gian

Một request chậm cần tách:

```text
Total request time
  -> middleware time
  -> model binding time
  -> service time
  -> SQL time
  -> external HTTP time
  -> serialization time
  -> response write time
```

Nếu không có trace, dễ đoán sai nguyên nhân.

Ví dụ:

```text
Nhìn controller tưởng chậm do LINQ
Trace cho thấy 80% thời gian nằm ở external HTTP call
```

---

## 25. Streaming, upload và response started

### 25.1. Upload file lớn

Không nên đọc toàn bộ file lớn vào memory nếu không cần:

```csharp
var bytes = await System.IO.File.ReadAllBytesAsync(...);
```

Với upload lớn, nên stream:

```csharp
[HttpPost("upload")]
public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct)
{
    await using var stream = System.IO.File.Create(tempPath);
    await file.CopyToAsync(stream, ct);
    return Ok();
}
```

Cần chú ý:

- Limit size
- Validate content type không đủ, cần validate nội dung nếu quan trọng
- Scan virus nếu nghiệp vụ yêu cầu
- Không log body file
- Lưu metadata thay vì lưu toàn bộ vào log

---

### 25.2. Response started

Khi response đã bắt đầu gửi body về client, bạn không còn tùy ý đổi status code/header.

Ví dụ streaming file:

```text
Server đã gửi HTTP 200 và một phần file
Sau đó exception xảy ra
```

Lúc này exception handler không thể biến response thành JSON 500 chuẩn được nữa.

Vì vậy endpoint streaming cần xử lý riêng:

- Validate trước khi bắt đầu write
- Log lỗi tại endpoint
- Chấp nhận client thấy stream bị ngắt
- Thiết kế retry/download lại nếu cần

---

## 26. Các case lỗi thường gặp trong production

### Case 1: `[Authorize]` không hoạt động

Triệu chứng:

```text
Endpoint có [Authorize] nhưng user không được check đúng
```

Nguyên nhân có thể:

```text
UseAuthentication/UseAuthorization thiếu hoặc sai thứ tự
Endpoint không đi qua MapControllers như nghĩ
Policy chưa đăng ký
Scheme authentication sai
Token không chứa claim/role đúng format
```

Checklist:

```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
```

---

### Case 2: Exception handler không bắt lỗi

Nguyên nhân thường gặp:

```text
Exception handler đặt quá muộn
Lỗi xảy ra trước middleware đó
Response đã started
Exception bị catch trong controller rồi trả sai status
Lỗi xảy ra trong background task không nằm trong request
```

Cần phân biệt lỗi trong request và lỗi ngoài request.

---

### Case 3: API timeout nhưng DB vẫn chạy

Triệu chứng:

```text
Client timeout sau 30s
DB vẫn chạy query nặng thêm vài phút
```

Nguyên nhân:

```text
Không truyền CancellationToken
DB provider không hủy ngay được query
Query quá nặng/thiếu index
Command timeout dài hơn proxy timeout
```

Cách xử lý:

- Truyền `CancellationToken`
- Set command timeout hợp lý
- Tối ưu query/index
- Tách job nếu tác vụ dài
- Theo dõi long-running query ở DB

---

### Case 4: `DbContext has been disposed`

Nguyên nhân thường gặp:

```text
Dùng scoped service trong Task.Run sau khi request kết thúc
Singleton giữ DbContext
IQueryable bị trả ra ngoài scope rồi mới enumerate
BackgroundService không tạo scope
```

Cách xử lý:

- Không fire-and-forget trong controller
- Không inject scoped vào singleton
- Materialize query trong scope
- Dùng `IServiceScopeFactory` trong worker

---

### Case 5: API chậm sau khi thêm audit log

Triệu chứng:

```text
Trước ổn, sau khi log request body thì p95/p99 tăng mạnh
Upload endpoint làm RAM tăng
GC nhiều
```

Nguyên nhân:

```text
Middleware đọc toàn bộ body
Buffer file lớn trong RAM
Log dữ liệu nhạy cảm
Không giới hạn size
```

Cách xử lý:

- Không log body mặc định
- Chỉ log metadata
- Mask field nhạy cảm
- Giới hạn size body được log
- Dùng async logging/backpressure
- Với upload, log file size/checksum/request id

---

### Case 6: Business rule nằm trong middleware

Ví dụ sai:

```csharp
app.Use(async (context, next) =>
{
    if (context.Request.Path.Value?.Contains("orders") == true)
    {
        // kiểm tra đơn đã duyệt chưa...
    }

    await next();
});
```

Vấn đề:

- Rule gắn cứng với HTTP path
- Khó test
- Không dùng lại được cho worker
- Dễ sai khi route đổi
- Không type-safe

Đúng hơn:

```text
Controller -> OrderService -> domain/business rule
```

---

### Case 7: Gọi external system trong request làm kẹt pipeline

Ví dụ:

```text
POST /payments
  -> save order
  -> call payment gateway
  -> call invoice service
  -> call notification service
  -> return
```

Rủi ro:

- Một dependency chậm kéo chậm toàn API
- Retry từ client tạo double action
- Không rõ bước nào đã thành công
- Timeout không đồng nghĩa thất bại

Cách thiết kế:

- Dùng idempotency key
- Tách trạng thái nghiệp vụ
- Outbox cho event/message
- Worker xử lý dependency có retry
- Có API kiểm tra trạng thái
- Có reconciliation job

---

## 27. Checklist review API

### 27.1. Pipeline

- Middleware có đúng thứ tự không?
- Exception handler có đặt đủ sớm không?
- Authentication trước authorization chưa?
- CORS đặt đúng vị trí chưa?
- Static files/rate limit có short-circuit đúng không?

### 27.2. Contract

- Route rõ ràng chưa?
- Status code đúng ý nghĩa chưa?
- Error response có ổn định không?
- Có `traceId/correlationId` trong lỗi 500 không?
- DTO response có tránh lộ entity nội bộ không?

### 27.3. Security

- Endpoint cần quyền đã có `[Authorize]`/policy chưa?
- Tenant/shop/user scope lấy từ nguồn đáng tin chưa?
- Có kiểm tra ownership/resource permission chưa?
- Có tránh log dữ liệu nhạy cảm chưa?

### 27.4. Performance

- Có phân trang endpoint danh sách chưa?
- Có tránh trả payload quá lớn chưa?
- Có truyền `CancellationToken` xuống I/O chưa?
- Có đo p95/p99 không?
- Có trace SQL/external dependency không?

### 27.5. DI và lifetime

- `DbContext` có bị dùng trong singleton không?
- Background worker có tạo scope riêng không?
- Có `Task.Run` giữ scoped service không?
- Có dùng scoped service sau request không?

### 27.6. Transaction và consistency

- Transaction boundary nằm đúng use case chưa?
- Có gọi external dependency trong transaction không?
- Event/message có dùng outbox nếu cần không?
- Retry có idempotency không?
- Có trạng thái trung gian cho luồng bất đồng bộ không?

### 27.7. Observability

- Log có structured fields không?
- Có correlation id không?
- Có business id để điều tra không?
- Có metrics theo endpoint/status code không?
- Có log lỗi background job không?

---

## 28. Cách trả lời phỏng vấn

### 28.1. Bản ngắn

> Trong ASP.NET Core, một HTTP request được Kestrel nhận và chuyển thành `HttpContext`. Sau đó request đi qua middleware pipeline theo thứ tự đã cấu hình. Middleware có thể xử lý request, gọi middleware tiếp theo hoặc dừng request. Các middleware phổ biến gồm exception handling, routing, authentication và authorization. Khi routing match endpoint, request được chuyển vào endpoint như controller action hoặc minimal API. Với controller, request tiếp tục qua MVC pipeline gồm model binding, validation, filters và action execution. Controller gọi application service, service xử lý nghiệp vụ và truy cập database hoặc dependency ngoài. Sau khi action trả result, response được serialize và đi ngược lại qua middleware trước khi trả về client.

### 28.2. Bản có chiều sâu hơn

> Điểm quan trọng là pipeline không chỉ ảnh hưởng luồng chạy mà còn ảnh hưởng correctness. Ví dụ `UseAuthentication` phải chạy trước `UseAuthorization` vì authorization cần `HttpContext.User`. Exception handler nên đặt sớm để bao được lỗi ở các middleware phía sau. `DbContext` thường là scoped theo request nên không được giữ trong singleton hoặc `Task.Run` sau khi request kết thúc. Với tác vụ dài hoặc gọi hệ thống ngoài, không nên giữ request quá lâu mà nên ghi job/outbox bền vững rồi để worker xử lý. Khi điều tra production, cần trace/correlation id, duration theo endpoint, SQL/external dependency time và error contract ổn định.

### 28.3. Câu chốt dễ nhớ

```text
Kestrel
  -> HttpContext
  -> Middleware
  -> Routing
  -> Authentication
  -> Authorization
  -> Endpoint
  -> MVC Pipeline
  -> Model Binding
  -> Validation
  -> Controller
  -> Service
  -> Database/External Dependency
  -> Result
  -> Response Middleware
  -> Client
```

> Middleware là đường ống bao quanh request/response. Controller chỉ là endpoint xử lý use case trong đường ống đó.

---

## 29. Tổng kết

Request Lifecycle trong ASP.NET Core không chỉ là kiến thức framework. Nó là cách để bạn biết đặt trách nhiệm ở đâu và điều tra lỗi ở tầng nào.

Cần nhớ các ý chính:

1. Request bắt đầu từ Kestrel và được biểu diễn bằng `HttpContext`.
2. Middleware pipeline xử lý request theo chiều vào và response theo chiều ngược lại.
3. Thứ tự middleware là một phần của correctness, không phải chi tiết trang trí.
4. Routing chọn endpoint; authentication xác định user; authorization kiểm tra quyền.
5. Controller endpoint còn có MVC pipeline: filters, model binding, validation, action, result.
6. Controller nên mỏng; business rule nằm ở application/domain service.
7. Scoped service sống theo request; không giữ scoped service trong singleton hoặc fire-and-forget task.
8. Transaction boundary phải theo use case, không trộn tùy tiện với external call.
9. Tác vụ dài nên chuyển sang job/outbox/worker thay vì giữ HTTP request.
10. Production API cần error contract, correlation id, metrics, trace và cancellation đúng cách.

