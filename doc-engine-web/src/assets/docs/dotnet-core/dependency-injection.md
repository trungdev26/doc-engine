# Dependency Injection trong .NET Core

Dependency Injection (DI) là cách để một class nhận những thứ nó cần từ bên ngoài thay vì tự tạo chúng. Giá trị thật của DI không phải là `services.AddScoped`; nó là kiểm soát được vòng đời object, ranh giới phụ thuộc và cách thay thế implementation khi hệ thống lớn dần.

## 1. Vấn đề DI giải quyết

```csharp
public sealed class OrderService
{
    private readonly SqlConnection _connection = new("...");
    private readonly SmtpClient _smtp = new("smtp.example.com");

    public Task CreateAsync(CreateOrderCommand command) { /* ... */ }
}
```

Class này tự biết chi tiết hạ tầng. Khó test, khó cấu hình theo môi trường, khó thay nhà cung cấp email và có nguy cơ quản lý connection sai.

```csharp
public sealed class OrderService
{
    private readonly IOrderRepository _orders;
    private readonly IEmailSender _emailSender;

    public OrderService(IOrderRepository orders, IEmailSender emailSender)
    {
        _orders = orders;
        _emailSender = emailSender;
    }
}
```

Class giờ phụ thuộc vào capability (`IOrderRepository`, `IEmailSender`), còn composition root quyết định implementation cụ thể. Không phải mọi dependency đều cần interface: interface hữu ích ở boundary thay đổi, external integration hoặc khi cần nhiều implementation; tạo interface một-một cho mọi class chỉ tăng ceremony.

## 2. Composition root: nơi duy nhất lắp ghép hệ thống

Trong ASP.NET Core, `Program.cs` là composition root.

```csharp
builder.Services.AddScoped<IOrderRepository, EfOrderRepository>();
builder.Services.AddScoped<OrderService>();
builder.Services.AddHttpClient<IPaymentGateway, PaymentGateway>();
builder.Services.AddSingleton<IClock, SystemClock>();
```

Application service không nên gọi `IServiceProvider.GetRequiredService` để tự đi tìm dependency. Đó là Service Locator: dependency bị ẩn, constructor không nói rõ contract và test dễ thiếu setup. Có thể dùng `IServiceProvider` ở integration boundary đặc biệt (factory/plugin scope), nhưng không biến nó thành cách inject mặc định.

## 3. Ba lifetime và câu hỏi chọn đúng

| Lifetime | Tạo khi nào | Dùng tốt cho | Cần tránh |
| --- | --- | --- | --- |
| Transient | mỗi lần resolve | object nhẹ, stateless, handler nhỏ | object đắt hoặc giữ resource |
| Scoped | một HTTP request / scope | `DbContext`, repository, application service | chia sẻ qua thread/request khác |
| Singleton | một lần trong cả process | config immutable, clock, cache thread-safe, client factory-backed service | trạng thái request, service không thread-safe |

Hãy hỏi: object có state mutable không? State thuộc request/job hay toàn process? Nó có thread-safe không? Nó có giữ unmanaged resource/disposable dependency không? Câu trả lời quan trọng hơn việc nhớ bảng lifetime.

```csharp
// Sai: singleton sống lâu giữ DbContext scoped.
services.AddSingleton<ReportCache>();
services.AddScoped<AppDbContext>();
// ReportCache(AppDbContext db) -> lỗi lifetime, hoặc tệ hơn nếu validation bị tắt.
```

Rule: singleton chỉ phụ thuộc singleton. Scoped có thể dùng singleton/scoped/transient. Transient có thể dùng các lifetime khác, nhưng lifetime của object được giữ bởi consumer vẫn cần được cân nhắc.

## 4. Scope trong HTTP và background worker

Framework tạo scope cho mỗi request. `BackgroundService` là singleton, vì vậy không inject trực tiếp scoped service vào constructor worker.

```csharp
public sealed class InvoiceWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;

    public InvoiceWorker(IServiceScopeFactory scopeFactory) => _scopeFactory = scopeFactory;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var handler = scope.ServiceProvider.GetRequiredService<InvoiceHandler>();
            await handler.ProcessNextAsync(stoppingToken);
        }
    }
}
```

Scope phải bao quanh một đơn vị công việc rõ ràng: một request, một message hoặc một job. Không tạo một scope cho cả vòng lặp worker vô hạn; `DbContext` sẽ giữ tracker ngày càng lớn và các disposable resource sống quá lâu.

## 5. Disposal: container chỉ dispose thứ nó sở hữu

Container dispose service mà nó tạo. Đừng đăng ký instance tự tạo có resource rồi kỳ vọng container luôn xử lý lifecycle hộ mình.

```csharp
// Đăng ký factory: container sở hữu instance và dispose khi application dừng.
services.AddSingleton(_ => new ExpensiveClient(options.Endpoint));
```

Không tự `Dispose()` một dependency do DI inject vào giữa request. Owner của lifetime là container/scope. Với `IAsyncDisposable`, dùng `CreateAsyncScope()` và `await using` như ví dụ worker.

## 6. Options: inject cấu hình có kiểm chứng

Không rải `IConfiguration["Payment:ApiKey"]` khắp code. Bind và validate tại startup.

```csharp
builder.Services.AddOptions<PaymentOptions>()
    .BindConfiguration("Payment")
    .ValidateDataAnnotations()
    .Validate(x => Uri.TryCreate(x.BaseUrl, UriKind.Absolute, out _), "BaseUrl is invalid")
    .ValidateOnStart();

public sealed class PaymentOptions
{
    [Required] public string BaseUrl { get; init; } = string.Empty;
    [Required] public string ApiKey { get; init; } = string.Empty;
}
```

| API | Dùng khi |
| --- | --- |
| `IOptions<T>` | cấu hình không cần đổi trong process |
| `IOptionsSnapshot<T>` | cần snapshot theo request, thường scoped |
| `IOptionsMonitor<T>` | singleton/background service cần nhận thay đổi |

Không đưa secret vào log hay exception validation. Configuration validation fail-fast giúp deploy lỗi cấu hình dừng rõ ràng thay vì endpoint đầu tiên trả 500 mơ hồ.

## 7. Nhiều implementation: strategy, factory và keyed service

Ví dụ cần chọn payment gateway theo thị trường. Tránh `if/else` dày đặc trong application service.

```csharp
public interface IPaymentGateway
{
    string Provider { get; }
    Task<ChargeResult> ChargeAsync(ChargeRequest request, CancellationToken ct);
}

public sealed class PaymentGatewayResolver
{
    private readonly IReadOnlyDictionary<string, IPaymentGateway> _gateways;

    public PaymentGatewayResolver(IEnumerable<IPaymentGateway> gateways)
    {
        _gateways = gateways.ToDictionary(x => x.Provider, StringComparer.OrdinalIgnoreCase);
    }

    public IPaymentGateway Resolve(string provider) =>
        _gateways.TryGetValue(provider, out var gateway)
            ? gateway
            : throw new NotSupportedException($"Unsupported provider: {provider}");
}
```

Đăng ký các implementation cùng interface rồi inject `IEnumerable<IPaymentGateway>`. Với .NET 8, keyed service hữu ích khi key là static/configuration-oriented. Nếu key đến từ dữ liệu nghiệp vụ động, resolver/strategy rõ ý nghĩa hơn việc gọi service provider khắp nơi.

## 8. Decorator cho cross-cutting behavior

Decorator thêm behavior quanh một interface mà không làm implementation business biết về logging, retry hay metric.

```text
IPaymentGateway
  -> RetryingPaymentGateway
  -> ObservedPaymentGateway
  -> PaymentGateway
```

Chọn decorator khi behavior gắn với capability cụ thể. Dùng middleware cho cross-cutting HTTP toàn cục, dùng `DelegatingHandler` cho HTTP outbound, dùng interceptor EF cho concern database. Không nhét retry vào decorator một cách mù quáng: mutation phải có idempotency trước khi retry.

## 9. Captive dependency và race condition trong singleton

Captive dependency là dependency sống ngắn bị singleton giữ lại. Nó có thể gây lỗi scope hoặc biến state request thành state global. Một singleton mutable cũng phải thread-safe vì nhiều request có thể gọi đồng thời.

```csharp
public sealed class SequenceGenerator
{
    private long _value;
    public long Next() => Interlocked.Increment(ref _value);
}
```

`Dictionary` thường không an toàn cho ghi đồng thời. Dùng `ConcurrentDictionary`, lock đúng phạm vi, immutable snapshot hoặc đưa state vào storage phù hợp. Đừng chọn singleton chỉ để "đỡ tạo object" trước khi có số liệu; container tạo transient nhỏ rất rẻ so với lỗi shared state.

## 10. Circular dependency là tín hiệu thiết kế

`OrderService -> PaymentService -> OrderService` khiến container báo circular dependency. Đừng chữa bằng `Lazy<T>` hoặc `IServiceProvider` ngay lập tức. Thường có một responsibility đang bị trộn:

```text
OrderService cần charge payment
PaymentService cần đổi trạng thái order

Tách PaymentOrchestrator hoặc phát domain event/outbox.
```

`Lazy<T>` chỉ hợp lý khi dependency thực sự expensive và chỉ dùng ở nhánh hiếm, không phải để che vòng tròn kiến trúc.

## 11. Test với DI

Unit test tạo class trực tiếp và truyền fake/stub cần thiết. Không cần dựng toàn bộ container.

```csharp
var gateway = new FakePaymentGateway { Result = ChargeResult.Success("p-123") };
var service = new CheckoutService(repository, gateway, clock);
var result = await service.CheckoutAsync(command, CancellationToken.None);
```

Integration test nên dựng `WebApplicationFactory`, thay external adapter bằng fake/test container và kiểm tra registration có resolve được ở scope thật. Bật `ValidateScopes`/`ValidateOnBuild` ở môi trường phát triển/test để phát hiện lifetime sai sớm.

```csharp
builder.Host.UseDefaultServiceProvider(options =>
{
    options.ValidateScopes = builder.Environment.IsDevelopment();
    options.ValidateOnBuild = builder.Environment.IsDevelopment();
});
```

## 12. Case: cache báo cáo gây dữ liệu lẫn tenant

Một `ReportCache` singleton nhận `ICurrentTenant` scoped ở constructor. Team sửa cho ứng dụng chạy bằng cách lấy tenant qua `IServiceProvider` lần đầu. Kết quả cache key/tenant của request đầu có thể bị giữ và trả dữ liệu sai cho request sau.

Thiết kế lại: request handler lấy tenant id từ context hiện tại, truyền nó như một value vào cache API; cache singleton chỉ lưu dữ liệu với key gồm tenant id và tiêu chí report. Cache không sở hữu request context. Điều này vừa sửa lifetime vừa làm dependency rõ ràng và test được.

## 13. Checklist review

1. Constructor có nói rõ mọi dependency thật sự không?
2. Singleton có giữ scoped/transient mutable hoặc service không thread-safe không?
3. `DbContext` có bị chia sẻ qua request/thread hay giữ quá một unit of work không?
4. Worker có tạo scope cho từng job/message không?
5. Configuration có bind, validate và không lộ secret không?
6. Nhiều implementation có selection rule rõ ràng không?
7. Circular dependency có được giải bằng tách responsibility thay vì Service Locator không?
8. Disposable service có owner/lifetime rõ ràng không?
9. Test có kiểm tra container resolve tại scope thực và các boundary external không?

## Kết luận

DI tốt làm kiến trúc nhìn thấy được: object nào cần gì, sống bao lâu, ai sở hữu nó, và thay thế nó ở đâu. Khi các ranh giới này rõ ràng, thay đổi hạ tầng, mở rộng worker và điều tra lỗi production đều ít rủi ro hơn nhiều.
