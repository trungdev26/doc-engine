# Creational Patterns trong .NET Core

Creational Patterns là nhóm pattern trả lời câu hỏi: **object nên được tạo ở đâu, tạo như thế nào, và làm sao để code nghiệp vụ không bị phụ thuộc cứng vào class cụ thể**.

Trong code nhỏ, gọi `new` trực tiếp là bình thường. Nhưng khi hệ thống lớn dần, việc tạo object có thể kéo theo nhiều rule: chọn implementation theo loại nghiệp vụ, inject dependency, validate option, build request phức tạp, tái sử dụng object đắt đỏ, hoặc tránh tạo object sai lifecycle.

Tư duy middle/senior không phải là "cấm dùng `new`". Tư duy đúng là biết khi nào `new` còn đơn giản, và khi nào việc tạo object đã trở thành một phần của thiết kế cần được tách ra.

---

## 1. Khi nào cần Creational Pattern?

Nên cân nhắc Creational Pattern khi:

- Logic tạo object có nhiều `if/else` hoặc `switch` theo loại nghiệp vụ.
- Object cần nhiều bước cấu hình trước khi dùng.
- Caller không nên biết class cụ thể phía sau abstraction.
- Cùng một nhóm object phải được tạo đồng bộ theo một "family" cụ thể.
- Object có lifecycle đặc biệt: singleton, scoped, transient, pooled.
- Constructor bắt đầu có quá nhiều parameter không cùng mức abstraction.
- Test khó vì code tự `new` trực tiếp dependency thật.

Không nhất thiết dùng pattern khi:

- Object là DTO/entity đơn giản.
- Constructor rõ ràng, ít tham số.
- Không có biến thể implementation.
- Không có logic chọn object.
- Việc thêm factory chỉ làm code vòng vèo hơn.

```csharp
// Hoàn toàn ổn nếu object đơn giản
var address = new Address("Ho Chi Minh", "District 1");
```

Pattern nên xuất hiện khi việc tạo object có ý nghĩa thiết kế, không phải chỉ vì muốn tránh từ khóa `new`.

---

## 2. Factory Method

### 2.1 Vấn đề

Giả sử hệ thống cần xuất invoice theo nhiều định dạng:

- PDF
- Excel
- XML

Code ban đầu thường có dạng:

```csharp
public class InvoiceExportService
{
    public Task<byte[]> ExportAsync(Invoice invoice, string format)
    {
        if (format == "pdf")
        {
            var exporter = new PdfInvoiceExporter();
            return exporter.ExportAsync(invoice);
        }

        if (format == "excel")
        {
            var exporter = new ExcelInvoiceExporter();
            return exporter.ExportAsync(invoice);
        }

        if (format == "xml")
        {
            var exporter = new XmlInvoiceExporter();
            return exporter.ExportAsync(invoice);
        }

        throw new NotSupportedException($"Format '{format}' is not supported.");
    }
}
```

Vấn đề:

- Service nghiệp vụ biết quá nhiều class cụ thể.
- Thêm format mới phải sửa service chính.
- Khó inject dependency vào từng exporter.
- Test use case chính bị dính logic tạo exporter.

### 2.2 Ý tưởng

Factory Method tách logic tạo object ra khỏi code dùng object.

Ta định nghĩa contract chung:

```csharp
public interface IInvoiceExporter
{
    string Format { get; }
    Task<byte[]> ExportAsync(Invoice invoice, CancellationToken cancellationToken);
}
```

Mỗi exporter tự khai báo format mình hỗ trợ:

```csharp
public class PdfInvoiceExporter : IInvoiceExporter
{
    public string Format => "pdf";

    public Task<byte[]> ExportAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        // Render PDF
        return Task.FromResult(Array.Empty<byte>());
    }
}

public class ExcelInvoiceExporter : IInvoiceExporter
{
    public string Format => "excel";

    public Task<byte[]> ExportAsync(Invoice invoice, CancellationToken cancellationToken)
    {
        // Render Excel
        return Task.FromResult(Array.Empty<byte>());
    }
}
```

Factory chịu trách nhiệm chọn implementation:

```csharp
public interface IInvoiceExporterFactory
{
    IInvoiceExporter Create(string format);
}

public class InvoiceExporterFactory : IInvoiceExporterFactory
{
    private readonly IReadOnlyDictionary<string, IInvoiceExporter> _exporters;

    public InvoiceExporterFactory(IEnumerable<IInvoiceExporter> exporters)
    {
        _exporters = exporters.ToDictionary(
            exporter => exporter.Format,
            StringComparer.OrdinalIgnoreCase);
    }

    public IInvoiceExporter Create(string format)
    {
        if (!_exporters.TryGetValue(format, out var exporter))
        {
            throw new NotSupportedException($"Invoice export format '{format}' is not supported.");
        }

        return exporter;
    }
}
```

Service chính chỉ dùng abstraction:

```csharp
public class InvoiceExportService
{
    private readonly IInvoiceExporterFactory _factory;

    public InvoiceExportService(IInvoiceExporterFactory factory)
    {
        _factory = factory;
    }

    public Task<byte[]> ExportAsync(
        Invoice invoice,
        string format,
        CancellationToken cancellationToken)
    {
        var exporter = _factory.Create(format);
        return exporter.ExportAsync(invoice, cancellationToken);
    }
}
```

Đăng ký DI:

```csharp
services.AddScoped<IInvoiceExporter, PdfInvoiceExporter>();
services.AddScoped<IInvoiceExporter, ExcelInvoiceExporter>();
services.AddScoped<IInvoiceExporter, XmlInvoiceExporter>();
services.AddScoped<IInvoiceExporterFactory, InvoiceExporterFactory>();
services.AddScoped<InvoiceExportService>();
```

### 2.3 Khi nào dùng Factory Method?

Dùng khi:

- Có nhiều implementation cùng contract.
- Caller chỉ biết "loại" cần dùng, không nên biết class cụ thể.
- Logic chọn object có thể thay đổi.
- Mỗi implementation có dependency riêng qua DI.

Không cần dùng khi:

- Chỉ có một implementation.
- Việc tạo object đơn giản và không có logic chọn.
- Factory chỉ bọc lại `new SomeClass()` mà không thêm ý nghĩa.

### 2.4 Factory Method vs Strategy

Hai pattern này hay đi cùng nhau.

- **Strategy** là các thuật toán/hành vi thay thế nhau.
- **Factory** là nơi chọn strategy phù hợp.

Trong ví dụ trên:

- `IInvoiceExporter` là Strategy.
- `InvoiceExporterFactory` là Factory chọn Strategy.

---

## 3. Abstract Factory

### 3.1 Vấn đề

Abstract Factory dùng khi cần tạo **một nhóm object liên quan với nhau** theo cùng một biến thể.

Ví dụ hệ thống thanh toán có nhiều provider:

- VNPay
- Stripe
- Momo

Mỗi provider không chỉ có một service. Nó có thể cần:

- Payment gateway
- Refund service
- Payment callback verifier
- Payment request mapper

Nếu tạo từng service rời rạc, dễ bị trộn sai provider: dùng `VNPayGateway` nhưng lại verify callback bằng `StripeCallbackVerifier`.

### 3.2 Ý tưởng

Tạo một factory đại diện cho cả family:

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken cancellationToken);
}

public interface IRefundService
{
    Task<RefundResult> RefundAsync(RefundRequest request, CancellationToken cancellationToken);
}

public interface IPaymentCallbackVerifier
{
    bool Verify(PaymentCallback callback);
}
```

Abstract Factory:

```csharp
public interface IPaymentProviderFactory
{
    string Provider { get; }
    IPaymentGateway CreateGateway();
    IRefundService CreateRefundService();
    IPaymentCallbackVerifier CreateCallbackVerifier();
}
```

Implementation cho VNPay:

```csharp
public class VNPayProviderFactory : IPaymentProviderFactory
{
    private readonly VNPayClient _client;
    private readonly VNPayOptions _options;

    public VNPayProviderFactory(VNPayClient client, VNPayOptions options)
    {
        _client = client;
        _options = options;
    }

    public string Provider => "vnpay";

    public IPaymentGateway CreateGateway()
    {
        return new VNPayGateway(_client, _options);
    }

    public IRefundService CreateRefundService()
    {
        return new VNPayRefundService(_client, _options);
    }

    public IPaymentCallbackVerifier CreateCallbackVerifier()
    {
        return new VNPayCallbackVerifier(_options);
    }
}
```

Factory resolver:

```csharp
public interface IPaymentProviderFactoryResolver
{
    IPaymentProviderFactory Resolve(string provider);
}

public class PaymentProviderFactoryResolver : IPaymentProviderFactoryResolver
{
    private readonly IReadOnlyDictionary<string, IPaymentProviderFactory> _factories;

    public PaymentProviderFactoryResolver(IEnumerable<IPaymentProviderFactory> factories)
    {
        _factories = factories.ToDictionary(
            factory => factory.Provider,
            StringComparer.OrdinalIgnoreCase);
    }

    public IPaymentProviderFactory Resolve(string provider)
    {
        if (!_factories.TryGetValue(provider, out var factory))
        {
            throw new NotSupportedException($"Payment provider '{provider}' is not supported.");
        }

        return factory;
    }
}
```

### 3.3 Khi nào dùng Abstract Factory?

Dùng khi:

- Cần tạo một nhóm object phải đi cùng nhau.
- Có nhiều provider/platform/theme/tenant khác nhau.
- Trộn sai implementation giữa các provider có thể gây bug nghiêm trọng.
- Muốn caller chỉ chọn provider, không tự lắp từng object.

Không nên dùng khi:

- Chỉ cần tạo một object đơn lẻ.
- Các object không thật sự thuộc cùng một family.
- Factory trở thành nơi chứa quá nhiều logic nghiệp vụ.

### 3.4 Factory Method vs Abstract Factory

| Pattern | Tập trung vào | Ví dụ |
|---|---|---|
| Factory Method | Tạo một object phù hợp | Chọn `IInvoiceExporter` theo format |
| Abstract Factory | Tạo một family object liên quan | Chọn bộ payment services theo provider |

---

## 4. Builder

### 4.1 Vấn đề

Builder hữu ích khi object cần nhiều bước cấu hình, nhiều optional parameter, hoặc cần đảm bảo object cuối cùng hợp lệ.

Ví dụ tạo request gửi report:

```csharp
var request = new ReportRequest(
    branchId,
    fromDate,
    toDate,
    includeSummary: true,
    includeDetails: false,
    includeCharts: true,
    exportFormat: "pdf",
    timeZone: "Asia/Ho_Chi_Minh",
    language: "vi");
```

Constructor dài làm code khó đọc:

- Dễ truyền nhầm thứ tự parameter.
- Khó biết parameter nào bắt buộc, parameter nào optional.
- Rule validate nằm rải rác.

### 4.2 Ý tưởng

Dùng Builder để tạo object từng bước:

```csharp
public class ReportRequest
{
    public Guid BranchId { get; init; }
    public DateOnly FromDate { get; init; }
    public DateOnly ToDate { get; init; }
    public bool IncludeSummary { get; init; }
    public bool IncludeDetails { get; init; }
    public bool IncludeCharts { get; init; }
    public string ExportFormat { get; init; } = "pdf";
    public string TimeZone { get; init; } = "Asia/Ho_Chi_Minh";
    public string Language { get; init; } = "vi";
}
```

Builder:

```csharp
public class ReportRequestBuilder
{
    private readonly ReportRequest _request = new();

    public ReportRequestBuilder ForBranch(Guid branchId)
    {
        _request.BranchId = branchId;
        return this;
    }

    public ReportRequestBuilder ForPeriod(DateOnly fromDate, DateOnly toDate)
    {
        _request.FromDate = fromDate;
        _request.ToDate = toDate;
        return this;
    }

    public ReportRequestBuilder IncludeSummary()
    {
        _request.IncludeSummary = true;
        return this;
    }

    public ReportRequestBuilder IncludeCharts()
    {
        _request.IncludeCharts = true;
        return this;
    }

    public ReportRequestBuilder AsPdf()
    {
        _request.ExportFormat = "pdf";
        return this;
    }

    public ReportRequest Build()
    {
        if (_request.BranchId == Guid.Empty)
        {
            throw new InvalidOperationException("Branch is required.");
        }

        if (_request.FromDate > _request.ToDate)
        {
            throw new InvalidOperationException("FromDate must be before or equal ToDate.");
        }

        return _request;
    }
}
```

Cách dùng:

```csharp
var request = new ReportRequestBuilder()
    .ForBranch(branchId)
    .ForPeriod(fromDate, toDate)
    .IncludeSummary()
    .IncludeCharts()
    .AsPdf()
    .Build();
```

### 4.3 Builder trong .NET Core thực tế

.NET Core dùng Builder rất nhiều:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
```

Ở đây:

- `WebApplicationBuilder` build app host.
- `IServiceCollection` build DI container.
- Middleware pipeline được cấu hình từng bước trước khi app chạy.

### 4.4 Khi nào dùng Builder?

Dùng khi:

- Object có nhiều option.
- Có nhiều bước tạo object.
- Cần validate object trước khi hoàn tất.
- Muốn fluent API dễ đọc.
- Constructor quá dài và khó hiểu.

Không nên dùng khi:

- Object đơn giản, constructor 2-3 tham số rõ nghĩa.
- Builder chỉ copy property mà không thêm rule/ý nghĩa.
- Object mutable quá mức và Builder làm che giấu side effect.

---

## 5. Singleton

### 5.1 Vấn đề

Singleton đảm bảo chỉ có một instance trong phạm vi ứng dụng. Nhưng trong .NET Core, cần phân biệt:

- Singleton pattern tự viết.
- Singleton lifetime trong DI container.

Trong ứng dụng .NET Core hiện đại, thường nên dùng DI lifetime thay vì tự viết Singleton thủ công.

### 5.2 Singleton tự viết

Ví dụ classic:

```csharp
public sealed class AppClock
{
    private static readonly Lazy<AppClock> _instance = new(() => new AppClock());

    private AppClock()
    {
    }

    public static AppClock Instance => _instance.Value;

    public DateTime UtcNow => DateTime.UtcNow;
}
```

Vấn đề:

- Caller phụ thuộc global state.
- Khó mock trong test.
- Dễ che giấu dependency thật.
- Dễ tạo coupling ẩn.

### 5.3 Singleton trong DI

Trong .NET Core, nên dùng:

```csharp
services.AddSingleton<ISystemClock, SystemClock>();
```

Code dùng qua constructor:

```csharp
public class TokenService
{
    private readonly ISystemClock _clock;

    public TokenService(ISystemClock clock)
    {
        _clock = clock;
    }
}
```

Cách này vẫn có một instance duy nhất, nhưng dependency rõ ràng và test được.

### 5.4 Cẩn thận với lifetime

Không inject scoped service vào singleton:

```csharp
// Sai: singleton giữ scoped dependency quá lâu
services.AddSingleton<ReportCacheService>();
services.AddScoped<IReportRepository, ReportRepository>();
```

Nếu `ReportCacheService` inject `IReportRepository`, có thể gây lỗi lifetime hoặc bug dữ liệu.

Quy tắc:

```text
Singleton không nên phụ thuộc trực tiếp Scoped.
Scoped có thể phụ thuộc Singleton.
Transient có thể phụ thuộc Singleton/Scoped tùy context.
```

### 5.5 Khi nào dùng Singleton?

Dùng cho:

- Service stateless, thread-safe.
- Config đã load và immutable.
- Cache provider/client thread-safe.
- Helper infrastructure không giữ request-specific state.

Không dùng cho:

- Service chứa state theo user/request.
- DbContext.
- Unit of Work.
- Repository dùng DbContext scoped.
- Object không thread-safe.

---

## 6. Prototype

### 6.1 Ý tưởng

Prototype dùng để tạo object mới bằng cách clone từ object mẫu.

Trong C#, thường gặp khi:

- Object có cấu hình mặc định phức tạp.
- Muốn tạo biến thể từ template có sẵn.
- Clone value object hoặc request mẫu rồi chỉnh vài property.

Ví dụ:

```csharp
public record NotificationTemplate(
    string Subject,
    string Body,
    string Language,
    IReadOnlyDictionary<string, string> Metadata);
```

Dùng record `with` để clone:

```csharp
var defaultTemplate = new NotificationTemplate(
    Subject: "Order confirmed",
    Body: "Your order has been confirmed.",
    Language: "en",
    Metadata: new Dictionary<string, string>());

var vietnameseTemplate = defaultTemplate with
{
    Subject = "Đơn hàng đã được xác nhận",
    Body = "Đơn hàng của bạn đã được xác nhận.",
    Language = "vi"
};
```

### 6.2 Cẩn thận shallow copy

Clone object có nested reference dễ dính shallow copy:

```csharp
var copied = original with { Subject = "New subject" };
```

Với `record`, property reference như dictionary/list vẫn có thể dùng chung reference nếu không clone sâu.

Nếu object có collection mutable, cần clone cẩn thận:

```csharp
var copied = original with
{
    Metadata = new Dictionary<string, string>(original.Metadata)
};
```

### 6.3 Khi nào dùng Prototype?

Dùng khi:

- Có object mẫu/template.
- Tạo object từ đầu tốn công hoặc dễ sai.
- Object gần immutable, clone an toàn.

Không nên dùng khi:

- Object có nhiều reference mutable phức tạp.
- Clone sâu khó kiểm soát.
- Constructor/factory đã đủ rõ ràng.

---

## 7. Object Pool

### 7.1 Ý tưởng

Object Pool tái sử dụng object tốn chi phí tạo mới thay vì tạo/hủy liên tục.

Trong .NET, pattern này đã có sẵn qua:

```csharp
Microsoft.Extensions.ObjectPool
```

Ví dụ dùng pool cho `StringBuilder`:

```csharp
services.AddSingleton<ObjectPoolProvider, DefaultObjectPoolProvider>();

services.AddSingleton(serviceProvider =>
{
    var provider = serviceProvider.GetRequiredService<ObjectPoolProvider>();
    return provider.CreateStringBuilderPool();
});
```

Service dùng pool:

```csharp
public class CsvBuilder
{
    private readonly ObjectPool<StringBuilder> _stringBuilderPool;

    public CsvBuilder(ObjectPool<StringBuilder> stringBuilderPool)
    {
        _stringBuilderPool = stringBuilderPool;
    }

    public string Build(IEnumerable<string[]> rows)
    {
        var builder = _stringBuilderPool.Get();

        try
        {
            foreach (var row in rows)
            {
                builder.AppendLine(string.Join(",", row));
            }

            return builder.ToString();
        }
        finally
        {
            builder.Clear();
            _stringBuilderPool.Return(builder);
        }
    }
}
```

### 7.2 Khi nào dùng Object Pool?

Dùng khi:

- Object tạo mới tốn chi phí.
- Tần suất tạo/hủy rất cao.
- Object có thể reset sạch trước khi tái sử dụng.
- Đã đo được allocation/GC là vấn đề thật.

Không nên dùng khi:

- Object nhẹ, tạo mới rẻ.
- Không reset được state an toàn.
- Pool làm code phức tạp nhưng không có số đo performance.

Senior tip: Object Pool là pattern nên dùng sau khi đo performance, không nên dùng theo cảm giác.

---

## 8. So sánh nhanh nhóm Creational

| Pattern | Dùng khi | Ví dụ .NET Core |
|---|---|---|
| Factory Method | Chọn một implementation theo loại | Chọn exporter theo format |
| Abstract Factory | Tạo một family object liên quan | Bộ payment services theo provider |
| Builder | Tạo object phức tạp nhiều bước | `WebApplicationBuilder`, report request builder |
| Singleton | Một instance dùng chung, thread-safe | Config/cache/stateless service qua DI |
| Prototype | Clone từ object mẫu | Record `with`, template object |
| Object Pool | Tái sử dụng object đắt đỏ | `ObjectPool<StringBuilder>` |

---

## 9. Checklist chọn Creational Pattern

Khi gặp bài toán tạo object, hỏi:

1. Object này có thật sự cần pattern không, hay `new` là đủ?
2. Có nhiều implementation cùng contract không?
3. Caller có nên biết class cụ thể không?
4. Object có cần nhiều bước cấu hình không?
5. Có nhóm object nào phải đi cùng nhau không?
6. Lifecycle của object là transient, scoped hay singleton?
7. Object có state theo request/user không?
8. Có cần clone từ template không?
9. Có số đo cho thấy tạo object đang tốn kém không?
10. Pattern này làm code dễ test và dễ thay đổi hơn không?

---

## 10. Tư duy chốt

Creational Patterns không phải để loại bỏ `new`. Chúng giúp **đặt logic tạo object vào đúng nơi**.

Trong .NET Core, DI container đã giải quyết rất nhiều bài toán tạo object cơ bản. Vì vậy, trước khi tự viết factory/builder/singleton, hãy hỏi:

- DI container đã đủ chưa?
- Abstraction này có che được chi tiết quan trọng không?
- Factory này chọn object dựa trên rule nghiệp vụ thật không?
- Builder này có làm object phức tạp dễ tạo và an toàn hơn không?
- Singleton này có thread-safe và không giữ request state không?

```text
Tạo object đơn giản -> dùng new.
Tạo object theo dependency -> để DI container làm.
Tạo object theo rule/biến thể -> cân nhắc Factory.
Tạo object nhiều bước/phức tạp -> cân nhắc Builder.
Tạo object dùng chung toàn app -> cân nhắc Singleton lifetime, không lạm dụng global state.
```
