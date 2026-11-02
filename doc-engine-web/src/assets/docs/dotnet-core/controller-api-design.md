# Controller & API Design

Controller là nơi HTTP request từ client chạm vào code của ứng dụng ASP.NET Core. Tài liệu này đi từ khái niệm nền tảng (controller là gì, route được match ra sao, request được map vào tham số như thế nào) đến các quyết định thiết kế ảnh hưởng lâu dài tới một API: đặt route theo resource, tách DTO khỏi entity, versioning, và giữ controller đủ mỏng để logic quan trọng nằm ở nơi test được.

## 1. Controller là gì

Trong ASP.NET Core, controller là một class chứa các **action method** xử lý HTTP request. Mỗi public method trong controller (gọi là action) tương ứng với một endpoint: request tới đúng route sẽ gọi đúng method đó, method xử lý xong rồi trả về response.

ASP.NET Core có hai class nền để kế thừa:

```text
ControllerBase - chỉ có chức năng xử lý HTTP: đọc request, trả JSON/status code.
Controller      - kế thừa ControllerBase, cộng thêm khả năng trả về View (HTML dựng từ Razor).
```

API chỉ trả JSON, không có giao diện HTML nào để dựng, nên không dùng tới phần `View()` mà `Controller` cung cấp. Vì vậy controller cho Web API kế thừa thẳng `ControllerBase` — nhẹ hơn và đúng với việc nó thực sự làm.

```csharp
[ApiController]
[Route("api/products")]
public class ProductsController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult GetById(int id)
    {
        return Ok(new { id, name = "Paracetamol" });
    }
}
```

Ba phần cấu thành một action:

```text
[Route]     - tiền tố đường dẫn của cả controller
[HttpGet]   - HTTP method + route riêng của action
GetById     - action method, tham số được bind tự động từ request
```

Khi ứng dụng khởi động, `AddControllers()` quét các class có `[ApiController]`/kế thừa `ControllerBase` và đăng ký route cho từng action. Khi request tới, routing middleware match URL + HTTP method với action tương ứng rồi gọi nó (chi tiết vòng đời một request qua middleware nằm ở tài liệu ASP.NET Core Request Pipeline).

## 2. HTTP Method và Status Code

Trước khi thiết kế route, cần nắm ý nghĩa chuẩn của từng HTTP method — đây là quy ước REST dựa trên, không phải chi tiết vụn vặt:

| Method | Ý nghĩa | Safe (không đổi state) | Idempotent (gọi nhiều lần cho cùng kết quả) |
| --- | --- | :---: | :---: |
| GET | Đọc dữ liệu | Có | Có |
| POST | Tạo mới / thực hiện hành động | Không | Không |
| PUT | Thay thế toàn bộ resource | Không | Có |
| PATCH | Cập nhật một phần resource | Không | Thường có (tùy thiết kế) |
| DELETE | Xóa resource | Không | Có |

Idempotent nghĩa là gọi lại cùng request nhiều lần cho cùng một trạng thái cuối, khác với "an toàn để retry". `PUT /orders/5` với cùng payload gọi 2 lần vẫn ra kết quả giống nhau nên idempotent; `POST /orders` gọi 2 lần có thể tạo 2 đơn hàng khác nhau nên không idempotent. Tính chất này quyết định method nào an toàn để client tự động retry khi mất kết nối, và method nào cần thêm cơ chế như idempotency key.

Status code trả về cũng theo quy ước, không tùy ý chọn:

| Nhóm | Ý nghĩa | Ví dụ |
| --- | --- | --- |
| 2xx | Thành công | 200 OK, 201 Created, 202 Accepted, 204 No Content |
| 4xx | Lỗi do client | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict |
| 5xx | Lỗi phía server | 500 Internal Server Error, 503 Service Unavailable |

`401` nghĩa là chưa xác thực được danh tính (thiếu token, token sai); `403` nghĩa là đã biết danh tính nhưng không đủ quyền. Hai mã này hay bị dùng lẫn lộn dù mang ý nghĩa khác nhau hoàn toàn.

## 3. Attribute Routing

ASP.NET Core Web API dùng attribute routing — route được khai báo ngay trên controller/action thay vì convention tập trung một chỗ.

```csharp
[Route("api/products")]
public class ProductsController : ControllerBase
{
    [HttpGet]                          // GET  api/products
    public IActionResult GetAll() => Ok();

    [HttpGet("{id:int}")]              // GET  api/products/10
    public IActionResult GetById(int id) => Ok();

    [HttpGet("{id:int}/reviews")]      // GET  api/products/10/reviews
    public IActionResult GetReviews(int id) => Ok();
}
```

`{id}` trong route template là **route parameter** — một segment động trong đường dẫn, giá trị thật lấy trực tiếp từ URL. Với request `GET api/products/10`, ASP.NET Core khớp `10` vào vị trí `{id}` rồi gán vào tham số `int id` của action. Route parameter khác static segment (`api`, `products`) ở chỗ static segment phải khớp nguyên văn, còn route parameter khớp bất kỳ giá trị nào đúng định dạng.

`{id:int}` thêm phần `:int` là route constraint — ràng buộc route parameter chỉ match khi segment đúng kiểu số nguyên; request `api/products/abc` sẽ không match action này (thường ra 404 thay vì lỗi binding). Các constraint phổ biến khác: `{id:guid}`, `{slug:alpha}`, `{code:length(6)}`. Constraint giúp routing tự loại request sai định dạng trước khi vào tới action, tránh phải validate thủ công trong thân hàm.

Khi hai action có route trùng khả năng match (ví dụ cùng `GET api/products/{id}` nhưng khai báo ở hai nơi), ASP.NET Core sẽ ném lỗi ambiguous route lúc runtime khi request khớp cả hai — cần đặt route đủ cụ thể để không chồng lấn.

## 4. Model Binding

Model binding là quá trình ASP.NET Core lấy dữ liệu từ request và gán vào tham số của action. Request mang dữ liệu ở bốn vị trí khác nhau — route, query string, header, body — mỗi vị trí có attribute bind riêng và phù hợp với một loại dữ liệu khác nhau:

```text
GET /api/products/10?includeStock=true
    └───────┬───────┘└──────┬───────┘
      route (path)      query string
```

### 4.1. Route Parameter — `[FromRoute]`

Route parameter là phần dữ liệu nằm ngay trong đường dẫn, khai báo bằng `{...}` trong route template (mục 3). Dùng cho giá trị định danh resource — thứ bắt buộc phải có để URL trỏ đúng vào một resource cụ thể.

```csharp
[HttpGet("{id:int}")]              // GET /api/products/10
public IActionResult GetById([FromRoute] int id) => Ok();
```

Với request `GET /api/products/10`, ASP.NET Core khớp `10` vào `{id}` trong route rồi gán vào tham số `id`.

### 4.2. Query Parameter — `[FromQuery]`

Query parameter nằm sau dấu `?` trong URL, dạng `key=value`, nhiều cặp nối nhau bằng `&`. Dùng cho dữ liệu tùy chọn của cùng một request — filter, cờ bật/tắt, phân trang — những thứ request vẫn hợp lệ dù không có.

```csharp
[HttpGet]                          // GET /api/products?category=drug&includeStock=true
public IActionResult GetAll(
    [FromQuery] string? category,
    [FromQuery] bool includeStock) => Ok();
```

Với request `GET /api/products?category=drug&includeStock=true`, `category` nhận `"drug"` và `includeStock` nhận `true`. Route resource dùng `{id}` để định danh (mục 8) còn filter/sort/search của endpoint danh sách (mục 13) luôn nằm ở query string vì chúng không bắt buộc.

### 4.3. Request Body — `[FromBody]`

Body chứa dữ liệu dạng JSON của request, dùng khi payload phức tạp hơn một vài giá trị đơn — tạo mới hoặc cập nhật một resource.

```http
POST /api/products
Content-Type: application/json

{ "name": "Paracetamol", "price": 12000 }
```

```csharp
public sealed class CreateProductDto
{
    public string Name { get; set; } = default!;
    public decimal Price { get; set; }
}

[HttpPost]
public IActionResult Create([FromBody] CreateProductDto input) => Ok();
```

Request body JSON ở trên được deserialize thẳng vào `CreateProductDto`.

### 4.4. Header — `[FromHeader]`

Header dùng cho dữ liệu không thuộc về nghiệp vụ của resource mà thuộc về ngữ cảnh gọi API — token xác thực, tenant id, correlation id.

```csharp
[HttpGet("{id:int}")]
public IActionResult Get(
    [FromRoute] int id,
    [FromHeader(Name = "X-Tenant-Id")] string? tenantId) => Ok();
```

### 4.5. Suy luận nguồn bind mặc định

Không khai báo tường minh vẫn chạy được vì ASP.NET Core tự suy luận nguồn bind: tham số kiểu đơn giản (`int`, `string`, `bool`, `Guid`...) mặc định lấy từ route/query; tham số kiểu phức tạp (class/record) mặc định lấy từ body. Với `[ApiController]` (mục 6), quy tắc suy luận này càng chặt, nên với endpoint có nhiều query filter kiểu phức tạp, nên khai báo `[FromQuery]` tường minh để tránh ASP.NET Core hiểu nhầm là cần đọc body.

## 5. Action Result

`ControllerBase` cung cấp sẵn các helper method trả về `IActionResult`, mỗi helper tương ứng một status code:

```csharp
return Ok(data);              // 200
return CreatedAtAction(...);  // 201, kèm header Location
return Accepted(...);         // 202, việc đang xử lý bất đồng bộ
return NoContent();           // 204, thành công nhưng không có body
return BadRequest(error);     // 400
return Unauthorized();        // 401
return Forbid();              // 403
return NotFound();            // 404
return Conflict(error);       // 409
```

Có ba kiểu khai báo return type cho action, khác nhau ở mức độ rõ ràng của contract:

| Kiểu trả | Khi dùng | Ghi chú |
| --- | --- | --- |
| `ActionResult<T>` | Action có thể trả nhiều status khác nhau (200/404/400) | Vừa trả được `T` vừa trả `NotFound()`; Swagger đọc được type `T` của nhánh thành công |
| `IActionResult` | Không có type cụ thể hoặc trả nhiều shape khác nhau | Cần thêm `[ProducesResponseType]` để Swagger mô tả đúng |
| `Task<T>` trực tiếp | Action chỉ có một luồng thành công, không có nhánh lỗi cần custom | Ít linh hoạt khi cần trả 404/409 |
| `TypedResults`/`Results<T1,T2>` (Minimal API) | Muốn compile-time liệt kê rõ các status có thể trả | Swagger suy ra type mà không cần attribute |

```csharp
[HttpGet("{id:guid}")]
[ProducesResponseType(typeof(OrderDto), StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<ActionResult<OrderDto>> GetById(Guid id, CancellationToken ct)
{
    var result = await _orderService.GetByIdAsync(id, ct);
    return result is null ? NotFound() : Ok(result);
}
```

`ActionResult<T>` là lựa chọn cân bằng nhất cho controller-based API: vừa rõ contract thành công, vừa linh hoạt trả lỗi.

### 5.1. Định dạng response

Status code chỉ là một phần của contract; hình dạng dữ liệu trong body cũng phải nhất quán. `Ok(data)` serialize `data` thành JSON qua `System.Text.Json`, kèm header `Content-Type: application/json; charset=utf-8`. Property C# dạng `PascalCase` mặc định xuất ra JSON dạng `camelCase`:

```csharp
public sealed record OrderDto(Guid Id, string Code, decimal TotalAmount);
```

```json
{ "id": "b4e7...", "code": "DH001", "totalAmount": 150000 }
```

Response lỗi nên theo một format ổn định thay vì mỗi action tự trả một shape khác nhau. ASP.NET Core có sẵn `ProblemDetails` (chuẩn RFC 7807) cho việc này:

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "traceId": "00-abc123..."
}
```

`[ApiController]` (mục 6) tự dùng `ProblemDetails` cho các lỗi 400/404/415 phát sinh từ framework. Lỗi nghiệp vụ tự throw trong service nên được map sang cùng format này ở một exception handler tập trung, thay vì để mỗi action tự định nghĩa response lỗi riêng.

## 6. `[ApiController]`

Attribute `[ApiController]` (đặt ở đầu class) bật một số hành vi ngầm, cần biết rõ để không bất ngờ khi review code:

```text
- Tự động trả 400 khi model state invalid (thiếu field [Required], sai kiểu...),
  action không chạy tới thân hàm.
- Suy luận binding source chặt hơn (mục 4): complex type mặc định từ body.
- Route attribute là bắt buộc, không dùng convention-based routing kiểu MVC cũ.
- Trả ProblemDetails theo chuẩn RFC 7807 cho một số lỗi client (400, 404, 415...).
```

Vì `[ApiController]` tự trả 400 trước khi vào action, không cần viết `if (!ModelState.IsValid) return BadRequest();` thủ công trong từng action — code đó là thừa và không bao giờ chạy tới vì middleware đã chặn từ trước.

## 7. Controller mỏng

Trách nhiệm của controller chỉ gồm: nhận request theo HTTP contract, gọi đúng use case, map kết quả sang status code. Business rule, validate nghiệp vụ, truy vấn nhiều bảng nên nằm ở application service/handler.

```csharp
[ApiController]
[Route("api/orders")]
public sealed class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService) => _orderService = orderService;

    [HttpPost]
    public async Task<ActionResult<OrderDto>> Create(CreateOrderDto input, CancellationToken ct)
    {
        var result = await _orderService.CreateAsync(input, ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }
}
```

Dấu hiệu controller đang phình to: action dài hơn 20-30 dòng, có `try/catch` xử lý nghiệp vụ, gọi trực tiếp `DbContext`, hoặc gọi tuần tự nhiều service khác nhau để tự điều phối luồng.

Ví dụ: action `Checkout` gọi lần lượt kiểm tra tồn kho, tính khuyến mãi, gọi cổng thanh toán, ghi log, gửi email, cập nhật điểm thành viên — toàn bộ nằm trong một method controller, xen giữa nhiều `try/catch` khác nhau cho từng bước. Hệ quả: không test được từng bước độc lập, không tái sử dụng được luồng này cho kênh khác (worker xử lý đơn từ POS), khó thấy transaction boundary nằm ở đâu, review code khó vì logic HTTP và logic nghiệp vụ trộn lẫn.

Cách xử lý: gom toàn bộ luồng vào một handler/use case riêng (`CheckoutHandler`/`CheckoutService.ExecuteAsync(...)`), controller chỉ gọi một entry point duy nhất và map kết quả sang response. Từng bước bên trong handler dùng service con, có transaction boundary rõ, có thể unit test không cần dựng `HttpContext`.

## 8. Route theo Resource

REST nhìn API như tài nguyên (noun), không phải hành động (verb) — HTTP method đã mang nghĩa hành động (mục 2), route chỉ cần định danh tài nguyên.

```text
Đúng:
GET    /api/orders            - danh sách
GET    /api/orders/{id}       - chi tiết
POST   /api/orders            - tạo mới
PUT    /api/orders/{id}       - cập nhật toàn bộ
PATCH  /api/orders/{id}       - cập nhật một phần
DELETE /api/orders/{id}       - xóa

Tránh:
POST /api/getOrderList
POST /api/updateOrderStatus
GET  /api/deleteOrder?id=10
```

Với hành động không map thẳng vào CRUD (duyệt đơn, hủy đơn), coi nó là sub-resource hoặc action rõ nghĩa thay vì nhét vào verb PUT chung chung:

```text
POST /api/orders/{id}/approve
POST /api/orders/{id}/cancel
```

Nested resource chỉ nên sâu một cấp. `GET /api/customers/{id}/orders` hợp lý; `GET /api/customers/{id}/orders/{orderId}/items/{itemId}/logs` nên phẳng hóa bằng route riêng có id đủ định danh, tránh route dài khó đọc và khó cache.

## 9. DTO

DTO (Data Transfer Object) là hình dạng dữ liệu dùng để giao tiếp qua HTTP, đóng vai trò contract giữa API và client — tách biệt khỏi entity dùng để lưu trữ trong database. Trả entity trực tiếp khiến contract API phụ thuộc vào schema database: đổi tên cột, thêm navigation property, đổi kiểu dữ liệu đều có thể làm vỡ client mà không ai chủ đích thay đổi API.

```csharp
public sealed record OrderDto(Guid Id, string Code, decimal TotalAmount, string Status);

public sealed class CreateOrderDto
{
    [Required] public Guid CustomerId { get; set; }
    [MinLength(1)] public List<CreateOrderItemDto> Items { get; set; } = new();
}
```

DTO input và DTO output nên tách riêng ngay cả khi field giống nhau lúc đầu. Chúng thay đổi theo hai lý do khác nhau: input theo nhu cầu nhập liệu, output theo nhu cầu hiển thị/tích hợp. Gộp chung một class cho cả hai chiều là nguồn phổ biến của field thừa (`Id` xuất hiện trong DTO tạo mới) hoặc field thiếu validate.

## 10. Validate Input

DataAnnotations phù hợp rule đơn giản, gắn trực tiếp trên property, tận dụng được cơ chế tự động 400 của `[ApiController]` (mục 6).

```csharp
public sealed class CreateOrderItemDto
{
    [Required] public Guid ProductId { get; set; }
    [Range(1, 9999)] public int Quantity { get; set; }
}
```

FluentValidation phù hợp khi rule phụ thuộc nhiều field, cần message động, hoặc muốn tách hẳn validate ra khỏi DTO để test độc lập:

```csharp
public sealed class CreateOrderDtoValidator : AbstractValidator<CreateOrderDto>
{
    public CreateOrderDtoValidator()
    {
        RuleFor(x => x.Items).NotEmpty();
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.Quantity).GreaterThan(0);
        });
    }
}
```

Cả hai đều là validate HTTP/input, khác với business validation (đơn đã duyệt không được sửa) vốn thuộc application/domain layer, không nên trộn vào DTO.

## 11. Versioning

Versioning là cách API cho phép contract thay đổi mà không phá vỡ client cũ chưa kịp cập nhật — client cũ tiếp tục gọi version cũ, client mới dùng version mới.

| Cách versioning | Ví dụ | Đánh đổi |
| --- | --- | --- |
| URL segment | `/api/v2/orders` | Dễ thấy, dễ route, dễ cache theo version, nhưng route nhân đôi |
| Query string | `/api/orders?api-version=2.0` | Route không đổi, nhưng dễ bị quên khi client không truyền |
| Header | `X-Api-Version: 2.0` | URL sạch, nhưng khó test nhanh bằng trình duyệt, khó cache theo CDN |
| Media type | `Accept: application/vnd.company.v2+json` | Đúng chuẩn REST nhất, nhưng phức tạp cho client tích hợp |

URL segment là lựa chọn thực dụng phổ biến nhất cho API nội bộ/B2B vì dễ trace log, dễ giới hạn quyền theo version, dễ deprecate rõ ràng. Chỉ tăng version khi có breaking change thật sự (đổi field, đổi status code, đổi ý nghĩa dữ liệu); thêm field optional mới không cần version mới.

## 12. Minimal API vs Controller-based

| Tiêu chí | Minimal API | Controller-based |
| --- | --- | --- |
| Endpoint số lượng ít, đơn giản | Phù hợp | Hơi nặng |
| Nhiều endpoint, nhiều filter/action chung | Cần tự tổ chức | Filter/base controller có sẵn |
| Cần model binding phức tạp, versioning, OData | Hạn chế hơn | Hỗ trợ đầy đủ |
| Performance/startup nhạy cảm | Nhẹ hơn | Overhead MVC pipeline |
| Team quen convention MVC cũ | Học lại cách tổ chức | Quen thuộc |

```csharp
app.MapGet("/api/health", () => Results.Ok("OK"));

app.MapPost("/api/orders", async (CreateOrderDto input, IOrderService service, CancellationToken ct) =>
{
    var result = await service.CreateAsync(input, ct);
    return Results.CreatedAtRoute("GetOrderById", new { id = result.Id }, result);
})
.WithName("CreateOrder");
```

Thực tế nhiều hệ thống dùng cả hai: Minimal API cho health check, webhook, endpoint nội bộ đơn giản; Controller-based cho domain API chính có nhiều filter, versioning, authorization phức tạp. Không cần ép toàn bộ hệ thống về một kiểu nếu đang chuyển đổi dần.

## 13. Filter, Sort, Search

Endpoint trả về danh sách cần convention chung cho filter/sort/search — không thiết kế mỗi endpoint một kiểu query param khác nhau, team sẽ khó nhớ và khó generate client code nhất quán.

```text
GET /api/orders?status=Pending&customerId=10&sort=-createdAt&search=DH001&page=1&pageSize=20
```

Quy ước gợi ý:

```text
- Filter theo field: dùng đúng tên field, giá trị enum dùng string thay vì số.
- sort=field cho tăng dần, sort=-field cho giảm dần; hỗ trợ nhiều field cách nhau bởi dấu phẩy.
- search cho full-text đơn giản, không thay thế cho filter chính xác.
- page/pageSize cho offset pagination; với danh sách lớn liên tục thêm dữ liệu, ưu tiên
  cursor/keyset dựa trên (createdAt, id) để tránh nhảy trang khi dữ liệu thay đổi.
```

Không nên để client tự truyền tên cột SQL vào `sort` rồi nối chuỗi trực tiếp vào query; cần whitelist field được phép sort để tránh injection và lộ cấu trúc bảng nội bộ.

## 14. Tài liệu hóa API

OpenAPI/Swagger nên phản ánh đúng contract, không chỉ để "có cho đủ". Vài điểm hay bị bỏ sót:

```csharp
/// <summary>Tạo đơn hàng mới.</summary>
/// <response code="201">Tạo thành công.</response>
/// <response code="400">Dữ liệu đầu vào không hợp lệ.</response>
[HttpPost]
[ProducesResponseType(typeof(OrderDto), StatusCodes.Status201Created)]
[ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
public async Task<ActionResult<OrderDto>> Create(CreateOrderDto input, CancellationToken ct) { ... }
```

Nếu action chỉ có `Ok(data)` trong code nhưng thực tế còn có thể trả 404/409 tùy service, Swagger sẽ không mô tả đúng và client tích hợp dựa vào tài liệu sai sẽ không xử lý được các trường hợp đó. `[ProducesResponseType]` nên khớp với toàn bộ nhánh trả về thực tế của action, không chỉ nhánh happy path.

## Checklist thiết kế Controller/API

1. Route có theo resource (noun) thay vì nhét hành động vào URL không?
2. HTTP method và status code trả về có đúng ý nghĩa chuẩn (mục 2) không?
3. Action có đang chứa business logic thay vì chỉ điều phối không?
4. DTO input/output đã tách khỏi entity và tách khỏi nhau chưa?
5. Validate HTTP (DataAnnotations/FluentValidation) có tách khỏi validate nghiệp vụ không?
6. Kiểu trả về (`ActionResult<T>`, `IActionResult`...) có nhất quán trong cùng một API không?
7. Breaking change có được versioning đúng cách không?
8. Endpoint danh sách có theo convention filter/sort/search chung của hệ thống không?
9. `[ProducesResponseType]`/OpenAPI có khớp với toàn bộ nhánh trả về thực tế không?
10. Sort/filter field từ client có được whitelist trước khi build query không?

## Tổng kết

Một controller đúng chuẩn chỉ làm ba việc: nhận request theo đúng HTTP contract, gọi use case tương ứng, và map kết quả sang status code có ý nghĩa. Toàn bộ phần thiết kế còn lại — route theo resource, DTO tách khỏi entity, versioning, convention filter/sort — tồn tại để contract API sống được qua nhiều lần nghiệp vụ thay đổi mà không buộc mọi client phải cập nhật theo. Nắm được cơ chế nền tảng (routing, model binding, action result) là điều kiện để hiểu vì sao các quy ước thiết kế ở trên tồn tại, chứ không phải quy tắc tách rời cần học thuộc.
