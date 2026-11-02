# Design Patterns - Nền tảng tư duy thiết kế

Design Patterns là công cụ để tổ chức code khi hệ thống bắt đầu có biến thể, dependency, workflow, state hoặc rule nghiệp vụ phức tạp. Giá trị của pattern nằm ở khả năng làm rõ boundary, giảm coupling, tăng testability và kiểm soát rủi ro thay đổi.

Trong hệ thống .NET Core, pattern thường xuất hiện quanh các điểm như Dependency Injection, Options, external provider, data access, transaction, background job, event, cache, middleware pipeline và workflow nghiệp vụ. Mỗi pattern đều đi kèm chi phí: thêm abstraction, thêm class, thêm indirection và thêm độ khó khi trace runtime.

Phần nền tảng này tập trung vào cách đánh giá một thiết kế trước khi áp dụng pattern: input cần thu thập, điểm thay đổi, dependency kỹ thuật, lifecycle, transaction boundary, observability, trade-off và tiêu chí review.

---

## 1. Mục tiêu của tài liệu

Sau phần này, người đọc cần làm được ba việc:

1. Phân tích một yêu cầu trước khi chọn pattern.
2. Đánh giá một design theo input, biến thể, dependency, lifecycle, testability và rủi ro thay đổi.
3. Nhận diện khi nào pattern giúp hệ thống tốt hơn và khi nào pattern chỉ tạo thêm complexity.

Kết quả mong muốn không phải là "biết nhiều pattern", mà là biết đặt câu hỏi đúng khi thiết kế.

---

## 2. Design Pattern là gì trong thực tế dự án?

Design Pattern là một cách tổ chức code đã được đặt tên để giải quyết một nhóm vấn đề lặp lại.

Trong dự án thực tế, pattern thường xuất hiện khi hệ thống có một trong các áp lực sau:

| Áp lực thiết kế | Biểu hiện trong code | Pattern thường liên quan |
|---|---|---|
| Nhiều biến thể nghiệp vụ | `if/else`, `switch` tăng theo loại nghiệp vụ | Strategy, Factory |
| Tích hợp provider bên ngoài | Business code gọi trực tiếp SDK/API | Adapter, Facade |
| Cross-cutting concern | Logging/cache/retry/validation rải rác | Decorator, Pipeline |
| Workflow nhiều bước | Controller/service điều phối quá nhiều dependency | Facade, Command, Mediator |
| State phức tạp | Rule phụ thuộc trạng thái hiện tại | State |
| Data access/query phức tạp | Query lặp lại, rule filter rải rác | Specification, Query Object |
| Consistency giữa DB và message | Commit DB xong cần publish event an toàn | Outbox |

Pattern không thay thế tư duy thiết kế. Pattern chỉ là công cụ sau khi đã hiểu vấn đề.

---

## 3. Khung phân tích trước khi chọn pattern

Một design nên được phân tích theo bảy nhóm input.

### 3.1 Business Input

Xác định use case và luật nghiệp vụ.

| Câu hỏi | Mục đích |
|---|---|
| Use case chính là gì? | Xác định flow cần bảo vệ |
| Actor là ai? | User, system, background job, external service |
| Dữ liệu đầu vào gồm gì? | Request, command, file, event, message |
| Kết quả nghiệp vụ là gì? | Entity thay đổi, file sinh ra, event phát đi |
| Rule nào quan trọng nhất? | Rule sai sẽ gây lỗi nghiệp vụ |

Ví dụ:

```text
Use case:
  CreateOrder

Input:
  CustomerId
  Items
  ShippingMethod
  PaymentProvider
  Language

Output:
  Order được tạo
  Stock được giữ/trừ
  Payment được khởi tạo
  Email xác nhận được gửi
```

### 3.2 Change Points

Change point là phần có khả năng thay đổi theo thời gian.

| Change point | Ví dụ | Rủi ro nếu hard-code |
|---|---|---|
| Rule | Discount theo customer type | Sửa rule làm vỡ service chính |
| Provider | VNPay, Momo, Stripe | Đổi provider phải sửa nhiều nơi |
| Format | PDF, Excel, XML | Export service phình to |
| Channel | Email, SMS, Push | Notification bị nhân class |
| Tenant | Mỗi tenant cấu hình khác | Logic trộn config nhiều nơi |
| State | Draft, Confirmed, Paid, Cancelled | `if/else` theo status rải rác |

Senior không abstraction mọi thứ. Senior tìm đúng phần **thay đổi đủ nhiều** để đáng tách.

### 3.3 Technical Dependency

Liệt kê dependency kỹ thuật mà use case phải chạm tới.

| Dependency | Câu hỏi đánh giá |
|---|---|
| Database | Có transaction boundary không? Query có phức tạp không? |
| Cache | Cache là tối ưu hay source of truth? TTL/invalidation thế nào? |
| External API | Timeout/retry/idempotency/fallback thế nào? |
| Queue/Event bus | Message có cần outbox không? Handler có idempotent không? |
| File storage | File có cần audit, permission, retention không? |
| Email/SMS | Lỗi gửi có làm fail transaction chính không? |

Dependency càng không ổn định hoặc càng xa business core, càng nên được bọc sau boundary rõ.

### 3.4 Runtime Parameters

Nhiều design sai vì không phân biệt rõ parameter nào được load ở đâu.

| Parameter | Nơi load | Ví dụ |
|---|---|---|
| Static config | `appsettings.json`, environment variable | Default payment provider |
| Runtime config | Database/config service/cache | Tenant setting, feature flag |
| Request input | Body/query/header | Export format, shipping method |
| User context | Claims/session/current user | Branch, role, language |
| System context | Time, environment, correlation id | Retry policy, audit trace |

Ví dụ `appsettings.json`:

```json
{
  "Payment": {
    "DefaultProvider": "vnpay",
    "Providers": {
      "vnpay": {
        "BaseUrl": "https://sandbox.vnpay.vn",
        "MerchantCode": "demo"
      },
      "momo": {
        "BaseUrl": "https://test-payment.momo.vn",
        "PartnerCode": "demo"
      }
    }
  }
}
```

Options class:

```csharp
public class PaymentOptions
{
    public string DefaultProvider { get; set; } = string.Empty;
    public Dictionary<string, PaymentProviderOptions> Providers { get; set; } = new();
}

public class PaymentProviderOptions
{
    public string BaseUrl { get; set; } = string.Empty;
    public string MerchantCode { get; set; } = string.Empty;
    public string PartnerCode { get; set; } = string.Empty;
}
```

Đăng ký:

```csharp
services.Configure<PaymentOptions>(
    configuration.GetSection("Payment"));
```

Điểm đánh giá:

```text
Nếu provider được quyết định bởi config/request/tenant,
thì code không nên hard-code provider cụ thể trong use case chính.
```

Một thiết kế hợp lý thường tách:

- Chỗ đọc parameter.
- Chỗ validate parameter.
- Chỗ chọn implementation.
- Chỗ chạy nghiệp vụ.

### 3.5 Lifecycle

Trong .NET Core, lifecycle là phần rất quan trọng khi đánh giá design.

| Lifetime | Dùng cho | Tránh dùng cho |
|---|---|---|
| Singleton | Stateless service, immutable config, thread-safe cache client | Service giữ state theo request/user |
| Scoped | DbContext, Unit of Work, repository theo request | Object cần sống toàn app |
| Transient | Lightweight service, handler ngắn hạn | Object tạo rất tốn chi phí |

Sai lifecycle có thể làm design đúng về mặt pattern nhưng lỗi runtime.

Ví dụ lỗi phổ biến:

```text
Singleton service inject Scoped DbContext.
```

Vấn đề:

- DbContext sống theo request.
- Singleton sống toàn app.
- Singleton giữ scoped dependency quá lâu.
- Có thể gây lỗi runtime hoặc sai dữ liệu.

Senior đánh giá pattern luôn đi kèm lifecycle, không chỉ nhìn sơ đồ class.

### 3.6 Transaction and Consistency Boundary

Một use case cần xác định phần nào phải thành công cùng nhau.

Ví dụ `CreateOrder`:

```text
Trong transaction:
  - Tạo order
  - Tạo order items
  - Trừ/giữ tồn kho

Ngoài transaction hoặc sau commit:
  - Gửi email
  - Publish integration event
  - Ghi analytics
```

Nếu gửi email nằm trong transaction DB, transaction có thể bị giữ lâu. Nếu publish event trực tiếp sau commit nhưng app crash giữa chừng, event có thể mất. Khi đó pattern như Outbox bắt đầu có ý nghĩa.

Đánh giá senior:

| Câu hỏi | Ý nghĩa |
|---|---|
| Operation nào phải atomic? | Xác định transaction boundary |
| Side effect nào có thể async? | Tách khỏi flow chính |
| Nếu app crash giữa flow thì sao? | Cần outbox/retry/recovery không |
| Handler chạy lại có an toàn không? | Cần idempotency không |

### 3.7 Observability and Debuggability

Design tốt phải vận hành được trong production.

Một pattern làm code đẹp nhưng khó trace lỗi production thì chưa chắc tốt.

Cần đánh giá:

- Log có correlation id không?
- Có biết request đi qua handler/decorator/pipeline nào không?
- Event handler fail có được monitor không?
- Retry có log số lần thử không?
- Cache hit/miss có metric không?
- Background job fail có retry/dead-letter không?

Senior không chỉ thiết kế flow chạy đúng khi mọi thứ ổn. Senior thiết kế cả lúc dependency chậm, event fail, cache miss, API timeout, hoặc dữ liệu không đồng bộ.

---

## 4. Ma trận đánh giá có nên dùng pattern không

Không nên chọn pattern theo cảm giác. Có thể đánh giá bằng ma trận sau.

| Tiêu chí | Điểm thấp | Điểm cao |
|---|---|---|
| Số lượng biến thể | 1-2 case đơn giản | Nhiều case, tiếp tục tăng |
| Tần suất thay đổi | Hiếm khi đổi | Đổi theo sprint/khách hàng/tenant |
| Rủi ro sai | Sai ít ảnh hưởng | Sai ảnh hưởng tiền, quyền, dữ liệu |
| Testability | Test chung là đủ | Cần test riêng từng rule/provider |
| Dependency volatility | Dependency ổn định | Provider/API/config thay đổi |
| Reuse need | Chỉ dùng một nơi | Dùng nhiều use case/module |
| Operational risk | Không có side effect lớn | Có retry, timeout, consistency, audit |

Quy tắc đọc ma trận:

```text
Điểm thấp ở hầu hết tiêu chí
  -> Giữ code trực tiếp, tránh pattern sớm.

Điểm cao ở biến thể + thay đổi + testability
  -> Cân nhắc Strategy/Factory.

Điểm cao ở dependency volatility
  -> Cân nhắc Adapter/Facade.

Điểm cao ở side effect/consistency
  -> Cân nhắc Command/Event/Outbox/Idempotency.
```

---

## 5. Ví dụ phân tích: chọn payment provider

### 5.1 Requirement

```text
Hệ thống hỗ trợ thanh toán qua VNPay và Momo.
Mỗi tenant có thể chọn provider mặc định.
Một số request có thể override provider.
Sau này có thể thêm Stripe.
```

### 5.2 Input analysis

| Nhóm | Phân tích |
|---|---|
| Use case | Tạo payment request |
| Input | OrderId, Amount, Provider optional |
| Config | Tenant default provider |
| Change point | Provider có thể tăng |
| Dependency | SDK/API từng provider khác nhau |
| Risk | Sai provider/sai amount ảnh hưởng tiền |
| Test need | Cần test từng provider độc lập |

### 5.3 Design forces

| Force | Hướng thiết kế |
|---|---|
| Provider thay đổi | Không hard-code trong service chính |
| SDK khác nhau | Bọc bằng Adapter |
| Chọn provider theo runtime parameter | Dùng Factory |
| Payment là nghiệp vụ rủi ro cao | Contract rõ, test riêng, log/audit đầy đủ |

### 5.4 Candidate design

```csharp
public interface IPaymentGateway
{
    string Provider { get; }
    Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken);
}
```

Adapter cho provider:

```csharp
public class VNPayGatewayAdapter : IPaymentGateway
{
    private readonly VNPayClient _client;

    public VNPayGatewayAdapter(VNPayClient client)
    {
        _client = client;
    }

    public string Provider => "vnpay";

    public Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken)
    {
        // Map PaymentRequest -> VNPay request
        // Call VNPay
        // Map VNPay response -> PaymentResult
        return Task.FromResult(new PaymentResult());
    }
}
```

Factory chọn provider:

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

Use case:

```csharp
public class PaymentService
{
    private readonly IPaymentGatewayFactory _factory;
    private readonly ITenantPaymentSettingReader _tenantSettings;

    public PaymentService(
        IPaymentGatewayFactory factory,
        ITenantPaymentSettingReader tenantSettings)
    {
        _factory = factory;
        _tenantSettings = tenantSettings;
    }

    public async Task<PaymentResult> PayAsync(
        PaymentCommand command,
        CancellationToken cancellationToken)
    {
        var provider = string.IsNullOrWhiteSpace(command.Provider)
            ? await _tenantSettings.GetDefaultProviderAsync(command.TenantId, cancellationToken)
            : command.Provider;

        var gateway = _factory.Create(provider);

        return await gateway.ChargeAsync(command.ToPaymentRequest(), cancellationToken);
    }
}
```

### 5.5 Senior review

| Tiêu chí | Đánh giá |
|---|---|
| Boundary | `PaymentService` không biết SDK cụ thể |
| Extensibility | Thêm Stripe bằng cách thêm adapter mới |
| Testability | Test factory, từng adapter, và use case riêng |
| Risk | Cần audit log, idempotency key, timeout, retry policy |
| Complexity | Factory + Adapter là hợp lý vì provider có biến thể thật |
| Missing concern | Cần đánh giá Outbox nếu payment result phát event sau commit |

Kết luận:

```text
Factory + Adapter phù hợp.
Không nên dùng Abstract Factory nếu hiện tại mỗi provider chỉ cần một gateway.
Không nên dùng Mediator chỉ để gọi PaymentService nếu chưa có pipeline concern rõ.
```

---

## 6. Ví dụ phân tích: discount rule

### 6.1 Requirement

```text
Tính giảm giá theo loại khách hàng.
Hiện có Standard, Gold, VIP.
Marketing thường xuyên thay đổi rule.
```

### 6.2 Thiết kế trực tiếp

```csharp
public decimal CalculateDiscount(Customer customer, Order order)
{
    if (customer.Type == "standard")
    {
        return order.TotalAmount * 0.02m;
    }

    if (customer.Type == "gold")
    {
        return order.TotalAmount * 0.05m;
    }

    if (customer.Type == "vip")
    {
        return order.TotalAmount * 0.1m;
    }

    return 0;
}
```

Thiết kế này có thể chấp nhận nếu:

- Rule đơn giản.
- Ít thay đổi.
- Chỉ dùng một nơi.
- Không cần test riêng từng rule.

### 6.3 Khi nào Strategy đáng dùng?

Strategy đáng dùng khi rule phát triển thành:

```text
Gold:
  - Giảm 5%
  - Tối đa 500.000
  - Không áp dụng cho hàng khuyến mãi

VIP:
  - Giảm 10%
  - Miễn phí vận chuyển
  - Thêm voucher sinh nhật
  - Có rule riêng theo campaign
```

Lúc này, từng rule có lifecycle riêng và test riêng.

Candidate design:

```csharp
public interface IDiscountRule
{
    string CustomerType { get; }
    DiscountResult Calculate(Customer customer, Order order);
}
```

```csharp
public class VipDiscountRule : IDiscountRule
{
    public string CustomerType => "vip";

    public DiscountResult Calculate(Customer customer, Order order)
    {
        var amount = order.TotalAmount * 0.1m;
        return new DiscountResult(amount, "VIP discount");
    }
}
```

Resolver:

```csharp
public class DiscountCalculator
{
    private readonly IReadOnlyDictionary<string, IDiscountRule> _rules;

    public DiscountCalculator(IEnumerable<IDiscountRule> rules)
    {
        _rules = rules.ToDictionary(
            rule => rule.CustomerType,
            StringComparer.OrdinalIgnoreCase);
    }

    public DiscountResult Calculate(Customer customer, Order order)
    {
        if (!_rules.TryGetValue(customer.Type, out var rule))
        {
            return DiscountResult.None();
        }

        return rule.Calculate(customer, order);
    }
}
```

### 6.4 Senior review

| Tiêu chí | Đánh giá |
|---|---|
| Có biến thể thật không? | Có, theo customer type |
| Biến thể có thay đổi riêng không? | Có, marketing đổi rule |
| Test riêng có giá trị không? | Có |
| Thêm class có đáng không? | Đáng nếu rule đủ phức tạp |
| Có thể over-engineering không? | Có, nếu rule chỉ là 2 dòng và không đổi |

Kết luận:

```text
Strategy phù hợp khi rule bắt đầu phức tạp hoặc thay đổi thường xuyên.
Nếu rule còn nhỏ, giữ if/switch có thể tốt hơn.
```

---

## 7. Nguyên tắc thiết kế nền tảng

### 7.1 Single Responsibility Principle

Một module nên có một lý do chính để thay đổi.

Đánh giá theo lý do thay đổi, không đánh giá theo số dòng code.

Ví dụ service vừa approve invoice, vừa render PDF, vừa gửi email, vừa ghi audit:

```csharp
public class InvoiceService
{
    public Task ApproveAsync(Guid invoiceId)
    {
        // Validate invoice
        // Update status
        // Render PDF
        // Send email
        // Write audit log
        return Task.CompletedTask;
    }
}
```

Phân tích:

| Trách nhiệm | Lý do thay đổi |
|---|---|
| Validate invoice | Rule nghiệp vụ đổi |
| Update status | Workflow đổi |
| Render PDF | Template/report đổi |
| Send email | Provider/template đổi |
| Audit log | Compliance đổi |

Nếu các phần này bắt đầu thay đổi độc lập, nên tách trách nhiệm.

### 7.2 Open/Closed Principle

Code nên mở cho mở rộng, đóng với sửa đổi.

Không có nghĩa là mọi nơi đều phải interface. Chỉ những điểm có biến thể thật và thay đổi thường xuyên mới cần mở rộng.

### 7.3 Liskov Substitution Principle

Class con/implementation phải giữ đúng contract.

Nếu implementation phải throw vì không hỗ trợ hành vi của interface, interface có thể đang quá rộng hoặc abstraction sai.

### 7.4 Interface Segregation Principle

Không bắt caller phụ thuộc vào method nó không dùng.

Interface quá rộng thường tạo coupling ẩn. Nhưng tách quá nhỏ cũng tạo nhiều file không cần thiết. Cần tách theo nhóm client/use case thật.

### 7.5 Dependency Inversion Principle

Module cấp cao phụ thuộc vào abstraction, không phụ thuộc trực tiếp infrastructure.

Trong .NET Core, nguyên tắc này thường đi cùng DI:

```csharp
services.AddScoped<IPaymentGateway, VNPayGatewayAdapter>();
services.AddScoped<IEmailSender, SendGridEmailSender>();
```

Tuy nhiên, không phải interface nào cũng có giá trị. Interface tốt thường nằm ở boundary có lý do thay đổi hoặc cần test.

---

## 8. DRY, KISS, YAGNI ở mức senior

### 8.1 DRY

DRY tránh lặp knowledge, không phải tránh mọi đoạn code giống nhau.

| Tình huống | Quyết định |
|---|---|
| Code giống nhau và cùng lý do thay đổi | Có thể abstraction |
| Code giống nhau nhưng khác nghiệp vụ | Chấp nhận duplicate |
| Chưa rõ lý do thay đổi | Chờ thêm tín hiệu |

### 8.2 KISS

KISS là giữ thiết kế đơn giản nhưng vẫn đúng boundary.

Code dồn tất cả vào một service lớn không phải KISS. Đó là đơn giản bề mặt nhưng phức tạp khi bảo trì.

### 8.3 YAGNI

YAGNI không có nghĩa là không thiết kế. Nó có nghĩa là không xây abstraction cho một tương lai chưa có tín hiệu.

Ví dụ:

| Quyết định | Đánh giá |
|---|---|
| Chưa dùng CQRS cho CRUD đơn giản | Hợp lý |
| Chưa tách microservices khi chưa có boundary/scale rõ | Hợp lý |
| Không hard-code payment provider dù hiện mới có VNPay | Có thể hợp lý nếu roadmap đã có provider khác |
| Tạo 20 interface cho app nhỏ chưa có biến thể | Có thể over-engineering |

---

## 9. Coupling và Cohesion

### 9.1 Coupling

Coupling cao khi một module biết quá nhiều chi tiết của module khác.

Dấu hiệu:

- Business service tự tạo `SqlConnection`, `HttpClient`, SDK client.
- Thay provider phải sửa nhiều use case.
- Test một rule nghiệp vụ phải dựng database/cache/API thật.
- Exception/response model của external provider lan vào application layer.

Giảm coupling bằng:

- Adapter ở boundary external service.
- Interface cho dependency có biến thể thật.
- Application service điều phối use case.
- Event/message cho side effect không cần đồng bộ.

### 9.2 Cohesion

Cohesion cao khi các thành phần trong module cùng phục vụ một mục tiêu rõ.

Dấu hiệu cohesion thấp:

- Class tên `CommonService`, `Helper`, `Manager`, `Utility`.
- Một service xử lý nhiều nghiệp vụ không liên quan.
- Method trong class dùng các nhóm dependency khác nhau hoàn toàn.

Tăng cohesion bằng:

- Đặt tên theo use case hoặc nghiệp vụ.
- Tách module theo boundary nghiệp vụ.
- Đưa rule về gần domain model/domain service khi phù hợp.

---

## 10. Composition over Inheritance

Ưu tiên composition khi muốn lắp ghép hành vi.

```csharp
public class OrderProcessor
{
    private readonly IOrderValidator _validator;
    private readonly IPricingService _pricing;
    private readonly IPaymentGateway _paymentGateway;
    private readonly IOrderRepository _orders;

    public OrderProcessor(
        IOrderValidator validator,
        IPricingService pricing,
        IPaymentGateway paymentGateway,
        IOrderRepository orders)
    {
        _validator = validator;
        _pricing = pricing;
        _paymentGateway = paymentGateway;
        _orders = orders;
    }
}
```

Inheritance phù hợp khi:

- Quan hệ thật sự là `is-a`.
- Contract cha ổn định.
- Class con không phải override để né logic cha.

Composition phù hợp khi:

- Cần thay thế hành vi theo runtime/config.
- Cần test từng dependency.
- Muốn tránh base class phình to.

Quy tắc:

```text
Không chắc nên inheritance hay composition -> ưu tiên composition.
```

---

## 11. Abstraction đúng và abstraction giả

Abstraction đúng che chi tiết biến động và làm rõ ý định nghiệp vụ.

Ví dụ tốt:

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(
        PaymentRequest request,
        CancellationToken cancellationToken);
}
```

Abstraction này có giá trị vì:

- Payment provider có thể thay đổi.
- SDK bên ngoài không nên rò vào business code.
- Có thể test payment use case bằng fake gateway.

Abstraction yếu:

```csharp
public interface IUserRepository
{
    Task<User> GetByIdAsync(Guid id);
    Task<List<User>> GetAllAsync();
    Task AddAsync(User user);
    Task UpdateAsync(User user);
    Task DeleteAsync(Guid id);
}
```

Interface này không tự động sai. Nhưng nếu nó chỉ mirror CRUD của EF Core, không che query phức tạp, không chứa ngôn ngữ nghiệp vụ, không giúp test đáng kể, thì giá trị thấp.

Checklist trước khi thêm abstraction:

1. Có biến thể implementation thật không?
2. Có che chi tiết infrastructure không?
3. Có làm use case dễ test hơn không?
4. Có thể hiện ngôn ngữ nghiệp vụ tốt hơn không?
5. Có giảm coupling thật không?
6. Có làm debug khó hơn đáng kể không?

---

## 12. Senior review một giải pháp dùng pattern

Khi review một design, không chỉ hỏi "pattern này đúng không". Cần đánh giá theo các lớp sau.

### 12.1 Fit với bài toán

| Câu hỏi | Ý nghĩa |
|---|---|
| Pattern giải quyết pain point nào? | Tránh dùng pattern vì thói quen |
| Pain point đã xuất hiện thật chưa? | Tránh speculative design |
| Có giải pháp nhẹ hơn không? | Tránh over-engineering |

### 12.2 Fit với boundary

| Câu hỏi | Ý nghĩa |
|---|---|
| Business code có bớt biết infrastructure không? | Đánh giá coupling |
| Boundary domain/application/infrastructure có rõ hơn không? | Đánh giá architecture |
| Dependency direction có đúng không? | Tránh application phụ thuộc ngược |

### 12.3 Fit với vận hành

| Câu hỏi | Ý nghĩa |
|---|---|
| Khi lỗi production có trace được flow không? | Observability |
| Retry có an toàn không? | Idempotency |
| Transaction có rõ không? | Consistency |
| Config sai thì fail fast hay fail muộn? | Reliability |

### 12.4 Fit với team

| Câu hỏi | Ý nghĩa |
|---|---|
| Team có hiểu pattern này không? | Maintainability |
| Naming có theo nghiệp vụ không? | Readability |
| File/class có tăng quá nhiều không? | Complexity |

---

## 13. Dấu hiệu over-engineering

Một design có khả năng quá tay nếu:

- Use case đơn giản nhưng đi qua quá nhiều layer.
- Có nhiều interface chỉ có một implementation và không che chi tiết nào quan trọng.
- Tên class toàn pattern name nhưng thiếu ngôn ngữ nghiệp vụ.
- Muốn hiểu flow phải mở quá nhiều file.
- Dùng Mediator/CQRS/Event cho CRUD đơn giản không có nhu cầu rõ.
- Pattern làm test setup phức tạp hơn.
- Pattern làm production trace khó hơn.

Over-engineering không phải vì "có nhiều class". Nó xảy ra khi complexity tăng nhưng không mua lại được khả năng thay đổi, test, vận hành hoặc giảm rủi ro tương ứng.

---

## 14. Dấu hiệu cần pattern

Nên cân nhắc pattern khi:

- `if/else` hoặc `switch` tăng theo biến thể nghiệp vụ.
- Rule thay đổi thường xuyên theo khách hàng/tenant/campaign.
- Business logic gọi trực tiếp external SDK/API.
- Test use case cần dựng quá nhiều dependency thật.
- Transaction, event, audit, cache invalidation rải rác.
- Một thay đổi nhỏ phải sửa nhiều module.
- Có side effect cần retry, idempotency, monitoring.

---

## 15. Template ghi quyết định thiết kế

Khi chọn pattern cho một phần quan trọng, nên ghi lại quyết định ngắn gọn.

```text
Context:
  Payment provider thay đổi theo tenant và có roadmap thêm provider mới.

Decision:
  Dùng IPaymentGateway + Adapter cho từng provider.
  Dùng PaymentGatewayFactory để chọn provider theo runtime parameter.

Alternatives:
  1. Hard-code switch trong PaymentService.
  2. Abstract Factory cho cả bộ payment/refund/callback service.

Reason:
  Provider hiện chỉ cần charge payment, chưa cần tạo family service.
  Adapter cô lập SDK provider.
  Factory giải quyết runtime selection.

Trade-off:
  Tăng thêm class/interface.
  Đổi lại test provider dễ hơn và thêm provider ít sửa code cũ hơn.

Risks:
  Cần idempotency key.
  Cần timeout/retry policy.
  Cần audit log payment request/response.
```

Đây là cách senior biến pattern thành quyết định kỹ thuật có ngữ cảnh, không phải khẩu quyết.

---

## 16. Tóm tắt quy trình đánh giá

```text
1. Xác định use case, input, output nghiệp vụ.
2. Liệt kê dependency kỹ thuật.
3. Tìm change points: rule, provider, format, tenant, state, config.
4. Xác định runtime parameters và nơi load.
5. Xác định lifecycle: singleton/scoped/transient.
6. Xác định transaction và consistency boundary.
7. Đánh giá testability và operational risk.
8. So sánh giải pháp trực tiếp với giải pháp dùng pattern.
9. Chọn pattern nhẹ nhất giải quyết đúng pain point.
10. Ghi rõ trade-off và rủi ro còn lại.
```

---

## 17. Tư duy chốt

Design Pattern là công cụ quản lý thay đổi.

Middle engineer thường hỏi:

```text
Pattern nào phù hợp với bài toán này?
```

Senior engineer hỏi thêm:

```text
Bài toán này có đáng dùng pattern chưa?
Pattern này đang mua lợi ích gì?
Chi phí complexity là bao nhiêu?
Khi production lỗi, flow này có trace được không?
Nếu thêm biến thể mới, code cũ có phải sửa nhiều không?
Team có vận hành được design này không?
```

Một pattern tốt làm hệ thống dễ thay đổi hơn, dễ test hơn, boundary rõ hơn, và rủi ro vận hành thấp hơn.

Một pattern xấu chỉ làm code trông có vẻ "kiến trúc" hơn nhưng khó đọc, khó debug, khó sửa hơn.

```text
Không có pattern miễn phí.
Mỗi pattern mua một lợi ích bằng complexity.
Senior design là biết lợi ích nào đáng mua, lúc nào nên mua, và lúc nào nên giữ code đơn giản.
```
