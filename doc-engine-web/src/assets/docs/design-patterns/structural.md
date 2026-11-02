# Structural Patterns trong .NET Core

Structural Patterns là nhóm pattern trả lời câu hỏi: **các class/object nên được ghép lại với nhau như thế nào để hệ thống dễ mở rộng, dễ thay thế, và không lộ chi tiết phức tạp ra ngoài**.

Nếu Creational Patterns tập trung vào việc tạo object, thì Structural Patterns tập trung vào cách **kết nối object**. Đây là nhóm rất thực chiến trong .NET Core vì hầu hết ứng dụng đều phải làm việc với external service, SDK, database, cache, queue, logging, authorization, middleware, file export, report, payment, email/SMS.

Mục tiêu không phải là làm code nhiều tầng hơn. Mục tiêu là đặt đúng boundary để business code không bị dính chặt vào infrastructure.

---

## 1. Khi nào cần Structural Pattern?

Nên cân nhắc Structural Pattern khi:

- Business code đang gọi trực tiếp SDK/API bên ngoài.
- Một use case phải gọi nhiều subsystem phức tạp.
- Muốn thêm logging, caching, retry, validation quanh service mà không sửa service gốc.
- Cần che chi tiết implementation phía sau một interface ổn định.
- Có cấu trúc cây: menu, phòng ban, category, permission, folder.
- Muốn tách abstraction khỏi implementation để cả hai thay đổi độc lập.

Không cần dùng khi:

- Code hiện tại đã rõ, ít dependency, ít biến thể.
- Pattern chỉ bọc lại một method mà không giảm complexity thật.
- Tầng wrapper mới làm debug khó hơn nhưng không che được chi tiết quan trọng.

---

## 2. Adapter

### 2.1 Vấn đề

Adapter dùng khi interface của một thư viện/service bên ngoài **không khớp** với interface mà hệ thống của mình muốn dùng.

Ví dụ business code cần gửi SMS:

```csharp
public interface ISmsSender
{
    Task SendAsync(string phoneNumber, string message, CancellationToken cancellationToken);
}
```

Nhưng SDK bên thứ ba lại có API kiểu khác:

```csharp
public class VietSmsClient
{
    public Task<VietSmsResponse> PushMessageAsync(VietSmsRequest request)
    {
        // Call external provider
        return Task.FromResult(new VietSmsResponse());
    }
}
```

Nếu business code gọi trực tiếp `VietSmsClient`, toàn hệ thống sẽ bị dính vào SDK đó:

- Đổi provider phải sửa nhiều nơi.
- Test khó vì phải mock SDK cụ thể.
- Error code/response format của provider rò vào business logic.

### 2.2 Giải pháp

Tạo Adapter để chuyển interface bên ngoài thành interface nội bộ:

```csharp
public class VietSmsSenderAdapter : ISmsSender
{
    private readonly VietSmsClient _client;

    public VietSmsSenderAdapter(VietSmsClient client)
    {
        _client = client;
    }

    public async Task SendAsync(
        string phoneNumber,
        string message,
        CancellationToken cancellationToken)
    {
        var request = new VietSmsRequest
        {
            To = phoneNumber,
            Content = message
        };

        var response = await _client.PushMessageAsync(request);

        if (!response.IsSuccess)
        {
            throw new SmsSendFailedException(response.ErrorCode);
        }
    }
}
```

Đăng ký DI:

```csharp
services.AddHttpClient<VietSmsClient>();
services.AddScoped<ISmsSender, VietSmsSenderAdapter>();
```

Business service chỉ biết `ISmsSender`:

```csharp
public class OtpService
{
    private readonly ISmsSender _smsSender;

    public OtpService(ISmsSender smsSender)
    {
        _smsSender = smsSender;
    }

    public Task SendOtpAsync(string phoneNumber, string otp, CancellationToken cancellationToken)
    {
        return _smsSender.SendAsync(phoneNumber, $"Your OTP is {otp}", cancellationToken);
    }
}
```

### 2.3 Khi nào dùng Adapter?

Dùng khi:

- Tích hợp SDK/API bên ngoài.
- Muốn giữ interface nội bộ ổn định.
- Muốn cô lập mapping request/response/error code.
- Muốn test business logic mà không phụ thuộc external provider.

Không nên dùng khi:

- SDK chỉ dùng ở một nơi rất nhỏ và không có nguy cơ thay đổi.
- Adapter chỉ đổi tên method nhưng không che được gì có giá trị.

### 2.4 Senior tip

Adapter nên nằm ở tầng infrastructure/integration. Domain/Application layer không nên biết class cụ thể của provider như `VietSmsClient`, `StripeClient`, `FirebaseMessaging`, `S3Client`.

```text
Business code nói bằng ngôn ngữ hệ thống: ISmsSender, IPaymentGateway, IFileStorage.
Infrastructure code dịch ngôn ngữ đó sang SDK cụ thể.
```

---

## 3. Facade

### 3.1 Vấn đề

Facade dùng để che một subsystem phức tạp phía sau một API đơn giản.

Ví dụ use case "hoàn tất đơn hàng" cần:

- Kiểm tra tồn kho.
- Trừ tồn.
- Tạo invoice.
- Gửi email.
- Ghi audit log.
- Publish event.

Nếu controller gọi trực tiếp từng service:

```csharp
public async Task<IActionResult> CompleteOrder(Guid orderId)
{
    await _stockService.CheckAsync(orderId);
    await _stockService.DeductAsync(orderId);
    await _invoiceService.CreateAsync(orderId);
    await _emailService.SendOrderCompletedAsync(orderId);
    await _auditLogger.LogAsync(orderId);
    await _eventBus.PublishAsync(new OrderCompletedEvent(orderId));

    return Ok();
}
```

Controller biết quá nhiều flow nghiệp vụ. Sau này thêm bước mới, controller bị sửa. Nếu flow này dùng ở API, background job, admin tool, sẽ bị duplicate.

### 3.2 Giải pháp

Tạo Facade/Application Service đại diện cho use case:

```csharp
public interface IOrderCompletionFacade
{
    Task CompleteAsync(Guid orderId, CancellationToken cancellationToken);
}
```

Implementation:

```csharp
public class OrderCompletionFacade : IOrderCompletionFacade
{
    private readonly IStockService _stockService;
    private readonly IInvoiceService _invoiceService;
    private readonly IEmailService _emailService;
    private readonly IAuditLogger _auditLogger;
    private readonly IEventBus _eventBus;

    public OrderCompletionFacade(
        IStockService stockService,
        IInvoiceService invoiceService,
        IEmailService emailService,
        IAuditLogger auditLogger,
        IEventBus eventBus)
    {
        _stockService = stockService;
        _invoiceService = invoiceService;
        _emailService = emailService;
        _auditLogger = auditLogger;
        _eventBus = eventBus;
    }

    public async Task CompleteAsync(Guid orderId, CancellationToken cancellationToken)
    {
        await _stockService.CheckAsync(orderId, cancellationToken);
        await _stockService.DeductAsync(orderId, cancellationToken);
        await _invoiceService.CreateAsync(orderId, cancellationToken);
        await _emailService.SendOrderCompletedAsync(orderId, cancellationToken);
        await _auditLogger.LogAsync("OrderCompleted", orderId, cancellationToken);
        await _eventBus.PublishAsync(new OrderCompletedEvent(orderId), cancellationToken);
    }
}
```

Controller gọn lại:

```csharp
public async Task<IActionResult> CompleteOrder(Guid orderId, CancellationToken cancellationToken)
{
    await _orderCompletion.CompleteAsync(orderId, cancellationToken);
    return Ok();
}
```

### 3.3 Khi nào dùng Facade?

Dùng khi:

- Một flow phải điều phối nhiều service/subsystem.
- Muốn controller/job/endpoint không chứa orchestration phức tạp.
- Muốn có một API đơn giản cho use case lớn.
- Muốn giấu chi tiết subsystem khỏi caller.

Không nên dùng khi:

- Facade chỉ gọi một service duy nhất.
- Facade trở thành "God Service" chứa mọi thứ.
- Facade trộn quá nhiều use case không liên quan.

### 3.4 Facade vs Application Service

Trong .NET Core business app, Facade thường xuất hiện dưới tên:

- Application Service
- Use Case Service
- Orchestrator
- Workflow Service

Tên không quan trọng bằng vai trò: che flow phức tạp và cung cấp API rõ cho caller.

---

## 4. Decorator

### 4.1 Vấn đề

Decorator dùng để thêm hành vi quanh một object mà không sửa class gốc.

Ví dụ có service lấy thông tin sản phẩm:

```csharp
public interface IProductReader
{
    Task<ProductDto?> GetAsync(Guid id, CancellationToken cancellationToken);
}

public class ProductReader : IProductReader
{
    private readonly AppDbContext _dbContext;

    public ProductReader(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<ProductDto?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        // Query database
        return Task.FromResult<ProductDto?>(null);
    }
}
```

Bây giờ cần thêm cache. Cách dễ nhưng xấu là sửa trực tiếp `ProductReader`, làm nó vừa query DB vừa biết cache.

### 4.2 Giải pháp

Tạo Decorator cùng implement interface:

```csharp
public class CachedProductReader : IProductReader
{
    private readonly IProductReader _inner;
    private readonly IDistributedCache _cache;

    public CachedProductReader(IProductReader inner, IDistributedCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<ProductDto?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var cacheKey = $"product:{id}";
        var cached = await _cache.GetStringAsync(cacheKey, cancellationToken);

        if (cached is not null)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached);
        }

        var product = await _inner.GetAsync(id, cancellationToken);

        if (product is not null)
        {
            await _cache.SetStringAsync(
                cacheKey,
                JsonSerializer.Serialize(product),
                cancellationToken);
        }

        return product;
    }
}
```

Ý tưởng:

```text
Caller -> CachedProductReader -> ProductReader -> Database
```

Có thể thêm nhiều decorator:

```text
Caller
  -> LoggingProductReader
  -> CachedProductReader
  -> ProductReader
  -> Database
```

### 4.3 Decorator cho cross-cutting concern

Decorator rất hợp cho:

- Logging
- Caching
- Retry
- Metrics
- Authorization
- Validation
- Idempotency

Ví dụ logging decorator:

```csharp
public class LoggingProductReader : IProductReader
{
    private readonly IProductReader _inner;
    private readonly ILogger<LoggingProductReader> _logger;

    public LoggingProductReader(IProductReader inner, ILogger<LoggingProductReader> logger)
    {
        _inner = inner;
        _logger = logger;
    }

    public async Task<ProductDto?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        _logger.LogInformation("Reading product {ProductId}", id);

        var result = await _inner.GetAsync(id, cancellationToken);

        _logger.LogInformation("Product {ProductId} found: {Found}", id, result is not null);

        return result;
    }
}
```

### 4.4 Khi nào dùng Decorator?

Dùng khi:

- Muốn thêm hành vi mà không sửa service gốc.
- Hành vi đó là cross-cutting concern.
- Có thể bọc nhiều lớp theo thứ tự rõ ràng.
- Interface đã ổn định.

Không nên dùng khi:

- Logic thêm vào là nghiệp vụ chính, không phải concern bao quanh.
- Thứ tự decorator không rõ, dễ gây bug.
- Debug flow trở nên quá khó vì quá nhiều lớp bọc.

### 4.5 Senior tip

Decorator mạnh nhưng phải kiểm soát thứ tự.

Ví dụ cache trước authorization có thể gây lỗi bảo mật nếu cache key không phân biệt user/permission. Retry quanh operation không idempotent có thể tạo double charge/double insert.

```text
Decorator không chỉ là kỹ thuật code.
Decorator thay đổi hành vi runtime, nên thứ tự và ngữ nghĩa rất quan trọng.
```

---

## 5. Proxy

### 5.1 Ý tưởng

Proxy là object đại diện cho object thật, kiểm soát việc truy cập vào object thật.

Proxy thường dùng cho:

- Lazy loading
- Remote service
- Authorization
- Caching
- Rate limit
- Audit

Decorator và Proxy nhìn khá giống nhau vì đều bọc object. Khác biệt chính:

- Decorator tập trung thêm hành vi.
- Proxy tập trung kiểm soát truy cập.

### 5.2 Ví dụ Authorization Proxy

```csharp
public interface IReportDownloader
{
    Task<byte[]> DownloadAsync(Guid reportId, CancellationToken cancellationToken);
}
```

Service thật:

```csharp
public class ReportDownloader : IReportDownloader
{
    public Task<byte[]> DownloadAsync(Guid reportId, CancellationToken cancellationToken)
    {
        // Load file
        return Task.FromResult(Array.Empty<byte>());
    }
}
```

Proxy kiểm tra quyền:

```csharp
public class AuthorizedReportDownloaderProxy : IReportDownloader
{
    private readonly IReportDownloader _inner;
    private readonly ICurrentUser _currentUser;
    private readonly IPermissionChecker _permissionChecker;

    public AuthorizedReportDownloaderProxy(
        IReportDownloader inner,
        ICurrentUser currentUser,
        IPermissionChecker permissionChecker)
    {
        _inner = inner;
        _currentUser = currentUser;
        _permissionChecker = permissionChecker;
    }

    public async Task<byte[]> DownloadAsync(Guid reportId, CancellationToken cancellationToken)
    {
        var allowed = await _permissionChecker.CanDownloadReportAsync(
            _currentUser.UserId,
            reportId,
            cancellationToken);

        if (!allowed)
        {
            throw new UnauthorizedAccessException();
        }

        return await _inner.DownloadAsync(reportId, cancellationToken);
    }
}
```

### 5.3 Proxy trong .NET thực tế

Trong .NET ecosystem, proxy xuất hiện ở nhiều nơi:

- EF Core lazy loading proxy.
- Dynamic proxy trong AOP/interceptor.
- HTTP client wrapper đại diện remote service.
- SignalR hub proxy/client.
- Generated API client từ OpenAPI/NSwag.

### 5.4 Khi nào dùng Proxy?

Dùng khi:

- Muốn kiểm soát quyền truy cập object thật.
- Object thật tốn chi phí tạo/load, cần lazy.
- Remote call cần được che sau interface local.
- Cần audit/rate limit trước khi gọi service thật.

Không nên dùng khi:

- Proxy làm caller tưởng operation local/rẻ nhưng thực tế là remote/chậm.
- Proxy che mất side effect quan trọng.
- Authorization nên đặt ở policy/middleware/filter rõ hơn.

---

## 6. Composite

### 6.1 Ý tưởng

Composite dùng khi object có cấu trúc cây, và caller muốn xử lý node đơn lẻ và node cha theo cùng một interface.

Ví dụ thường gặp:

- Menu tree
- Category tree
- Folder tree
- Permission tree
- Organization chart
- Comment thread

### 6.2 Ví dụ Permission Tree

```csharp
public interface IPermissionNode
{
    string Code { get; }
    bool IsGrantedTo(User user);
}
```

Permission đơn:

```csharp
public class PermissionLeaf : IPermissionNode
{
    public string Code { get; }

    public PermissionLeaf(string code)
    {
        Code = code;
    }

    public bool IsGrantedTo(User user)
    {
        return user.Permissions.Contains(Code);
    }
}
```

Permission group:

```csharp
public class PermissionGroup : IPermissionNode
{
    private readonly List<IPermissionNode> _children = new();

    public string Code { get; }

    public PermissionGroup(string code)
    {
        Code = code;
    }

    public void Add(IPermissionNode node)
    {
        _children.Add(node);
    }

    public bool IsGrantedTo(User user)
    {
        return _children.All(child => child.IsGrantedTo(user));
    }
}
```

Caller xử lý chung:

```csharp
public bool CanAccess(User user, IPermissionNode permission)
{
    return permission.IsGrantedTo(user);
}
```

### 6.3 Khi nào dùng Composite?

Dùng khi:

- Dữ liệu là cây.
- Node cha và node con có thể được xử lý cùng kiểu.
- Muốn thêm node mới mà không làm caller phức tạp.

Không nên dùng khi:

- Cấu trúc chỉ là list phẳng.
- Node cha và node con có hành vi quá khác nhau.
- Cây quá đơn giản, dùng class DTO là đủ.

---

## 7. Bridge

### 7.1 Ý tưởng

Bridge tách abstraction khỏi implementation để hai bên có thể thay đổi độc lập.

Ví dụ cần gửi notification qua nhiều channel:

- Email
- SMS
- Push notification

Và có nhiều loại notification:

- OTP
- Order confirmed
- Password reset

Nếu dùng inheritance đơn giản, dễ nổ class:

```text
EmailOtpNotification
SmsOtpNotification
PushOtpNotification
EmailOrderConfirmedNotification
SmsOrderConfirmedNotification
PushOrderConfirmedNotification
...
```

### 7.2 Giải pháp

Tách notification abstraction khỏi channel implementation:

```csharp
public interface INotificationChannel
{
    Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken);
}
```

Implementation:

```csharp
public class EmailChannel : INotificationChannel
{
    public Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken)
    {
        // Send email
        return Task.CompletedTask;
    }
}

public class SmsChannel : INotificationChannel
{
    public Task SendAsync(string recipient, string subject, string body, CancellationToken cancellationToken)
    {
        // Send SMS
        return Task.CompletedTask;
    }
}
```

Abstraction:

```csharp
public abstract class Notification
{
    private readonly INotificationChannel _channel;

    protected Notification(INotificationChannel channel)
    {
        _channel = channel;
    }

    public Task SendAsync(string recipient, CancellationToken cancellationToken)
    {
        return _channel.SendAsync(
            recipient,
            GetSubject(),
            GetBody(),
            cancellationToken);
    }

    protected abstract string GetSubject();
    protected abstract string GetBody();
}
```

Loại notification:

```csharp
public class PasswordResetNotification : Notification
{
    private readonly string _resetLink;

    public PasswordResetNotification(INotificationChannel channel, string resetLink)
        : base(channel)
    {
        _resetLink = resetLink;
    }

    protected override string GetSubject()
    {
        return "Reset your password";
    }

    protected override string GetBody()
    {
        return $"Click here to reset your password: {_resetLink}";
    }
}
```

Kết quả:

- Thêm channel mới không cần sửa các notification.
- Thêm notification mới không cần tạo class cho từng channel.

### 7.3 Khi nào dùng Bridge?

Dùng khi:

- Có hai chiều biến thể độc lập.
- Inheritance tạo quá nhiều tổ hợp class.
- Muốn tách policy/abstraction khỏi implementation cụ thể.

Không nên dùng khi:

- Chỉ có một chiều biến thể.
- Composition đơn giản đã đủ.
- Pattern làm thiết kế khó đọc hơn bài toán thật.

---

## 8. Flyweight

### 8.1 Ý tưởng

Flyweight dùng để chia sẻ phần state giống nhau giữa rất nhiều object nhằm tiết kiệm memory.

Pattern này ít dùng trực tiếp trong business app, nhưng hữu ích để hiểu các hệ thống cần tối ưu memory.

Ví dụ có hàng triệu dòng report, mỗi dòng chứa thông tin currency giống nhau:

```csharp
public class MoneyDisplayStyle
{
    public string Currency { get; }
    public string Symbol { get; }
    public int DecimalPlaces { get; }

    public MoneyDisplayStyle(string currency, string symbol, int decimalPlaces)
    {
        Currency = currency;
        Symbol = symbol;
        DecimalPlaces = decimalPlaces;
    }
}
```

Factory chia sẻ style:

```csharp
public class MoneyDisplayStyleFactory
{
    private readonly Dictionary<string, MoneyDisplayStyle> _cache = new();

    public MoneyDisplayStyle Get(string currency)
    {
        if (_cache.TryGetValue(currency, out var style))
        {
            return style;
        }

        style = currency switch
        {
            "VND" => new MoneyDisplayStyle("VND", "₫", 0),
            "USD" => new MoneyDisplayStyle("USD", "$", 2),
            _ => new MoneyDisplayStyle(currency, currency, 2)
        };

        _cache[currency] = style;
        return style;
    }
}
```

Report row chỉ giữ state riêng:

```csharp
public class ReportMoneyCell
{
    public decimal Amount { get; }
    public MoneyDisplayStyle Style { get; }

    public ReportMoneyCell(decimal amount, MoneyDisplayStyle style)
    {
        Amount = amount;
        Style = style;
    }
}
```

### 8.2 Khi nào dùng Flyweight?

Dùng khi:

- Có số lượng object rất lớn.
- Nhiều object chia sẻ state giống nhau.
- Memory allocation là vấn đề đã đo được.
- Có thể tách intrinsic state và extrinsic state rõ ràng.

Không nên dùng khi:

- Object ít, memory không phải vấn đề.
- Việc chia state làm code khó hiểu.
- Chưa có profiling chứng minh cần tối ưu.

---

## 9. So sánh nhanh nhóm Structural

| Pattern | Mục tiêu | Ví dụ .NET Core |
|---|---|---|
| Adapter | Chuyển interface không khớp thành interface nội bộ | Bọc SMS/payment/email SDK |
| Facade | Che subsystem phức tạp sau API đơn giản | Application service điều phối workflow |
| Decorator | Thêm hành vi quanh object | Logging, caching, retry quanh service |
| Proxy | Kiểm soát truy cập object thật | Authorization, lazy loading, remote client |
| Composite | Xử lý object cây như object đơn | Menu/category/permission tree |
| Bridge | Tách abstraction khỏi implementation | Notification type x channel |
| Flyweight | Chia sẻ state để tiết kiệm memory | Style/config dùng chung cho rất nhiều object |

---

## 10. Checklist chọn Structural Pattern

Khi gặp bài toán ghép object, hỏi:

1. Có đang tích hợp external SDK/API không? Nếu có, cân nhắc Adapter.
2. Caller có đang biết quá nhiều bước của subsystem không? Nếu có, cân nhắc Facade.
3. Có cần thêm logging/cache/retry/validation quanh service không? Nếu có, cân nhắc Decorator.
4. Có cần kiểm soát quyền/lazy/remote access không? Nếu có, cân nhắc Proxy.
5. Dữ liệu có dạng cây không? Nếu có, cân nhắc Composite.
6. Có hai chiều biến thể độc lập gây nổ class không? Nếu có, cân nhắc Bridge.
7. Có rất nhiều object giống nhau gây tốn memory không? Nếu có số đo, cân nhắc Flyweight.
8. Pattern được chọn có làm boundary rõ hơn không?
9. Pattern có làm test dễ hơn không?
10. Pattern có làm debug production khó hơn quá nhiều không?

---

## 11. Tư duy chốt

Structural Patterns giúp mình thiết kế cách các object đứng cạnh nhau.

Trong .NET Core, ba pattern nên nắm thật chắc trước là:

- **Adapter** để cô lập external provider.
- **Facade** để che workflow/subsystem phức tạp.
- **Decorator** để thêm cross-cutting concern mà không sửa service gốc.

Proxy, Composite, Bridge, Flyweight học sau nhưng vẫn quan trọng để nhận diện đúng bài toán.

```text
Structural Pattern tốt không làm code "nhiều lớp cho vui".
Nó tạo boundary rõ hơn: business code bớt biết chi tiết, infrastructure được cô lập, hành vi mở rộng có chỗ đứng riêng.
```
