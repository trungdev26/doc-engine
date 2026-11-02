# Case Study 01 - Chọn Payment Provider theo tenant/request

## 1. Bối cảnh bài toán

Hệ thống bán hàng cần hỗ trợ nhiều cổng thanh toán. Ban đầu có VNPay và Momo. Một số tenant dùng provider mặc định theo cấu hình, nhưng từng request vẫn có thể override provider nếu nghiệp vụ cho phép.

Trong roadmap có khả năng thêm Stripe hoặc provider nội bộ. Mỗi provider có SDK/API, request format, response format, mã lỗi và cơ chế verify callback khác nhau.

Mục tiêu không chỉ là gọi được API thanh toán. Mục tiêu là thiết kế để:

- Thêm provider mới ít sửa code cũ.
- Không để SDK provider rò vào application/business layer.
- Test được từng provider và use case chính.
- Kiểm soát rủi ro payment: amount, idempotency, timeout, audit, callback verification.

---

## 2. Input trước khi thiết kế

### 2.1 Business input

| Input | Mô tả |
|---|---|
| `TenantId` | Tenant đang thực hiện thanh toán |
| `OrderId` | Đơn hàng cần thanh toán |
| `Amount` | Số tiền cần charge |
| `Provider` | Optional, request có thể chỉ định provider |
| `ReturnUrl` | URL quay lại sau khi thanh toán |
| `CorrelationId` | Trace request xuyên hệ thống |

### 2.2 Runtime parameters

| Parameter | Nguồn |
|---|---|
| Default provider của tenant | Database/cache/config service |
| Provider override | Request input |
| Provider endpoint/credential | `appsettings`, secret store, environment variable |
| Feature flag provider | Config service hoặc database |
| Current user/branch | Claims/current user context |

### 2.3 Technical dependencies

| Dependency | Vai trò |
|---|---|
| Order repository | Đọc thông tin đơn hàng |
| Tenant setting reader | Lấy provider mặc định |
| Provider SDK/API | Gọi cổng thanh toán |
| Audit logger | Ghi request/response quan trọng |
| Idempotency store | Chống double charge |
| Event publisher | Phát event sau khi payment được tạo/xác nhận |

---

## 3. Các điểm thay đổi

| Change point | Khả năng thay đổi | Tác động nếu hard-code |
|---|---|---|
| Payment provider | Cao | `PaymentService` phình to, mỗi provider mới sửa service chính |
| Provider credentials | Cao theo môi trường/tenant | Dễ hard-code sai hoặc deploy sai |
| Request mapping | Cao theo provider | Mapping lẫn vào business flow |
| Response mapping | Cao theo provider | Mã lỗi provider rò vào application layer |
| Callback verification | Cao theo provider | Dễ verify sai, rủi ro bảo mật |
| Retry/timeout policy | Trung bình/cao | Lỗi provider gây treo request hoặc double call |

Kết luận phân tích: provider là biến thể thật, có rủi ro cao và có khả năng mở rộng. Cần boundary rõ.

---

## 4. Các hướng thiết kế có thể chọn

### 4.1 Hướng A - `switch` trực tiếp trong `PaymentService`

```csharp
public Task<PaymentResult> PayAsync(PaymentCommand command)
{
    if (command.Provider == "vnpay")
    {
        // Build VNPay request
        // Call VNPay
        // Map VNPay response
    }

    if (command.Provider == "momo")
    {
        // Build Momo request
        // Call Momo
        // Map Momo response
    }
}
```

Đánh giá:

| Tiêu chí | Nhận xét |
|---|---|
| Đơn giản ban đầu | Tốt |
| Thêm provider mới | Kém |
| Test từng provider | Kém |
| Boundary SDK | Kém |
| Rủi ro payment | Cao nếu flow tiếp tục phình |

Phù hợp khi chỉ có một provider và chưa có roadmap mở rộng. Không phù hợp với bối cảnh hiện tại.

### 4.2 Hướng B - Adapter + Factory

Mỗi provider được bọc bằng adapter implement chung một contract. Factory chọn adapter theo provider runtime.

Pattern áp dụng:

- **Adapter**: chuyển SDK/API provider về interface nội bộ.
- **Factory Method**: chọn gateway theo provider.
- **Options Pattern**: load endpoint/credential.

Đây là hướng cân bằng: đủ tách boundary, chưa quá nặng.

### 4.3 Hướng C - Abstract Factory

Dùng khi mỗi provider cần tạo cả một family service:

- Gateway
- Refund service
- Callback verifier
- Request mapper
- Reconciliation service

Hướng này mạnh hơn, nhưng nếu hiện tại chỉ mới cần charge payment thì hơi sớm.

Kết luận: bắt đầu với Adapter + Factory. Có thể nâng lên Abstract Factory khi provider family phình rõ.

---

## 5. Thiết kế đề xuất

### 5.1 Contract nội bộ

```csharp
public interface IPaymentGateway
{
    string Provider { get; }

    Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken);
}
```

Contract này dùng ngôn ngữ của hệ thống, không dùng model của VNPay/Momo.

```csharp
public class PaymentRequest
{
    public Guid TenantId { get; init; }
    public Guid OrderId { get; init; }
    public decimal Amount { get; init; }
    public string Currency { get; init; } = "VND";
    public string ReturnUrl { get; init; } = string.Empty;
    public string IdempotencyKey { get; init; } = string.Empty;
}

public class PaymentResult
{
    public bool IsSuccess { get; init; }
    public string Provider { get; init; } = string.Empty;
    public string ProviderTransactionId { get; init; } = string.Empty;
    public string RedirectUrl { get; init; } = string.Empty;
    public string ErrorCode { get; init; } = string.Empty;
}
```

### 5.2 Adapter cho VNPay

```csharp
public class VNPayGatewayAdapter : IPaymentGateway
{
    private readonly VNPayClient _client;
    private readonly IOptionsSnapshot<VNPayOptions> _options;

    public VNPayGatewayAdapter(
        VNPayClient client,
        IOptionsSnapshot<VNPayOptions> options)
    {
        _client = client;
        _options = options;
    }

    public string Provider => "vnpay";

    public async Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken)
    {
        var providerRequest = new VNPayCreatePaymentRequest
        {
            MerchantCode = _options.Value.MerchantCode,
            Amount = request.Amount,
            OrderCode = request.OrderId.ToString("N"),
            ReturnUrl = request.ReturnUrl
        };

        var response = await _client.CreatePaymentAsync(providerRequest, cancellationToken);

        return new PaymentResult
        {
            IsSuccess = response.IsSuccess,
            Provider = Provider,
            ProviderTransactionId = response.TransactionId,
            RedirectUrl = response.PaymentUrl,
            ErrorCode = response.ErrorCode
        };
    }
}
```

### 5.3 Factory chọn gateway

```csharp
public interface IPaymentGatewayFactory
{
    IPaymentGateway Create(string provider);
}

public class PaymentGatewayFactory : IPaymentGatewayFactory
{
    private readonly IReadOnlyDictionary<string, IPaymentGateway> _gateways;

    public PaymentGatewayFactory(IEnumerable<IPaymentGateway> gateways)
    {
        _gateways = gateways.ToDictionary(
            gateway => gateway.Provider,
            StringComparer.OrdinalIgnoreCase);
    }

    public IPaymentGateway Create(string provider)
    {
        if (!_gateways.TryGetValue(provider, out var gateway))
        {
            throw new NotSupportedException($"Payment provider '{provider}' is not supported.");
        }

        return gateway;
    }
}
```

### 5.4 Application service

```csharp
public class PaymentService
{
    private readonly IOrderRepository _orders;
    private readonly ITenantPaymentSettingReader _tenantSettings;
    private readonly IPaymentGatewayFactory _gatewayFactory;
    private readonly IIdempotencyStore _idempotencyStore;
    private readonly IPaymentAuditLogger _auditLogger;

    public PaymentService(
        IOrderRepository orders,
        ITenantPaymentSettingReader tenantSettings,
        IPaymentGatewayFactory gatewayFactory,
        IIdempotencyStore idempotencyStore,
        IPaymentAuditLogger auditLogger)
    {
        _orders = orders;
        _tenantSettings = tenantSettings;
        _gatewayFactory = gatewayFactory;
        _idempotencyStore = idempotencyStore;
        _auditLogger = auditLogger;
    }

    public async Task<PaymentResult> PayAsync(
        PaymentCommand command,
        CancellationToken cancellationToken)
    {
        var order = await _orders.GetAsync(command.OrderId, cancellationToken);
        if (order is null)
        {
            throw new InvalidOperationException("Order not found.");
        }

        var provider = string.IsNullOrWhiteSpace(command.Provider)
            ? await _tenantSettings.GetDefaultProviderAsync(command.TenantId, cancellationToken)
            : command.Provider;

        var idempotencyKey = $"payment:{command.TenantId}:{command.OrderId}:{provider}";

        if (await _idempotencyStore.ExistsAsync(idempotencyKey, cancellationToken))
        {
            return await _idempotencyStore.GetResultAsync(idempotencyKey, cancellationToken);
        }

        var gateway = _gatewayFactory.Create(provider);

        var request = new PaymentRequest
        {
            TenantId = command.TenantId,
            OrderId = order.Id,
            Amount = order.TotalAmount,
            ReturnUrl = command.ReturnUrl,
            IdempotencyKey = idempotencyKey
        };

        await _auditLogger.LogRequestAsync(provider, request, cancellationToken);

        var result = await gateway.ChargeAsync(request, cancellationToken);

        await _auditLogger.LogResultAsync(provider, result, cancellationToken);
        await _idempotencyStore.SaveResultAsync(idempotencyKey, result, cancellationToken);

        return result;
    }
}
```

### 5.5 DI registration

```csharp
services.Configure<VNPayOptions>(configuration.GetSection("Payment:Providers:VNPay"));
services.Configure<MomoOptions>(configuration.GetSection("Payment:Providers:Momo"));

services.AddHttpClient<VNPayClient>();
services.AddHttpClient<MomoClient>();

services.AddScoped<IPaymentGateway, VNPayGatewayAdapter>();
services.AddScoped<IPaymentGateway, MomoGatewayAdapter>();
services.AddScoped<IPaymentGatewayFactory, PaymentGatewayFactory>();
services.AddScoped<PaymentService>();
```

---

## 6. Trade-off

| Tiêu chí | Lợi ích | Chi phí |
|---|---|---|
| Extensibility | Thêm provider mới bằng adapter mới | Tăng số class |
| Testability | Test provider/use case riêng | Cần mock/fake nhiều hơn |
| Boundary | SDK không rò vào application layer | Cần mapping request/response |
| Runtime selection | Factory chọn provider rõ ràng | Cần xử lý provider không hợp lệ |
| Reliability | Có chỗ đặt idempotency/audit | Cần thiết kế timeout/retry kỹ |

Kết luận:

```text
Adapter + Factory phù hợp với bài toán hiện tại.
Abstract Factory chưa cần nếu mỗi provider mới chỉ có charge payment.
Outbox có thể cần ở bước sau nếu payment result tạo integration event sau commit DB.
```

---

## 7. Checklist review trước khi code

### 7.1 Design checklist

1. Provider có bị hard-code trong use case chính không?
2. SDK model có rò ra khỏi adapter không?
3. Thêm provider mới có cần sửa `PaymentService` không?
4. Tenant default provider được load ở đâu?
5. Request override provider có được validate không?
6. Có idempotency key để tránh double charge không?
7. Có timeout/retry policy không?
8. Retry có an toàn không?
9. Callback verification nằm ở boundary nào?
10. Payment request/response có audit log không?

### 7.2 Test checklist

1. Test chọn default provider theo tenant.
2. Test request override provider.
3. Test provider không hỗ trợ.
4. Test VNPay adapter mapping request đúng.
5. Test Momo adapter mapping request đúng.
6. Test idempotency trả result cũ khi request lặp.
7. Test gateway lỗi timeout.
8. Test audit log được ghi.

### 7.3 Operational checklist

1. Có correlation id xuyên suốt payment flow.
2. Có log provider, order id, tenant id, amount.
3. Không log secret/token/card data.
4. Có metric success/fail theo provider.
5. Có alert khi provider fail rate tăng.
6. Có dashboard payment pending/fail.

---

## 8. Khi nào cần nâng cấp thiết kế?

Thiết kế hiện tại nên được nâng cấp khi xuất hiện các dấu hiệu:

| Dấu hiệu | Hướng nâng cấp |
|---|---|
| Mỗi provider có cả charge/refund/callback/reconcile | Abstract Factory |
| Payment result cần publish event an toàn sau DB commit | Outbox |
| Callback có thể gửi lặp nhiều lần | Inbox/Idempotency |
| Provider thường timeout/chập chờn | Retry + Circuit Breaker |
| Nhiều bước payment thành workflow dài | State/Saga |
| Rule chọn provider phức tạp theo tenant/branch/amount | Strategy/Specification |

---

## 9. Tư duy rút ra

Case này không bắt đầu bằng câu hỏi "dùng pattern gì?". Nó bắt đầu từ:

- Provider là biến thể runtime.
- SDK/API là dependency không ổn định.
- Payment có rủi ro tiền và cần audit.
- Thêm provider mới là nhu cầu có thật.

Từ đó mới chọn:

- Adapter để cô lập provider SDK.
- Factory để chọn provider theo runtime parameter.
- Options Pattern để load config.
- Idempotency để giảm rủi ro double charge.

```text
Pattern đúng không phải pattern nghe hay.
Pattern đúng là pattern giải quyết đúng điểm thay đổi, đúng boundary, đúng rủi ro của bài toán.
```
