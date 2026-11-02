# Behavioral Patterns trong .NET Core

Behavioral Patterns là nhóm pattern trả lời câu hỏi: **các object giao tiếp với nhau như thế nào, ai chịu trách nhiệm xử lý hành vi nào, và làm sao để workflow/rule/state thay đổi mà không làm code chính vỡ tung**.

Nếu Creational tập trung vào tạo object, Structural tập trung vào ghép object, thì Behavioral tập trung vào **dòng chảy hành vi**: chọn thuật toán, phát sự kiện, đóng gói command, chuyền request qua nhiều handler, điều phối use case, hoặc thay đổi hành vi theo state.

Đây là nhóm pattern rất quan trọng ở mức middle/senior vì nó xuất hiện trực tiếp trong business logic.

---

## 1. Khi nào cần Behavioral Pattern?

Nên cân nhắc Behavioral Pattern khi:

- Có nhiều rule/thuật toán thay thế nhau.
- Một action cần được đóng gói thành object để queue/retry/log/undo.
- Một sự kiện xảy ra và nhiều module cần phản ứng.
- Một request phải đi qua nhiều bước xử lý.
- Controller/service đang điều phối quá nhiều dependency.
- Object thay đổi hành vi theo trạng thái.
- Có workflow nhiều bước cần tái sử dụng hoặc mở rộng.

Không cần dùng khi:

- Logic chỉ là vài dòng rõ ràng.
- Pattern làm flow bị phân tán quá mức.
- Team khó trace runtime hơn sau khi thêm pattern.

---

## 2. Strategy

### 2.1 Vấn đề

Strategy dùng khi có nhiều thuật toán/rule thay thế nhau.

Ví dụ tính discount theo loại khách hàng:

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

Vấn đề:

- Mỗi loại mới phải sửa method cũ.
- Rule phình ra làm service khó đọc.
- Test từng rule không độc lập.

### 2.2 Giải pháp

Tách mỗi rule thành một strategy:

```csharp
public interface IDiscountStrategy
{
    string CustomerType { get; }
    decimal Calculate(Order order);
}
```

Implementation:

```csharp
public class VipDiscountStrategy : IDiscountStrategy
{
    public string CustomerType => "vip";

    public decimal Calculate(Order order)
    {
        return order.TotalAmount * 0.1m;
    }
}

public class GoldDiscountStrategy : IDiscountStrategy
{
    public string CustomerType => "gold";

    public decimal Calculate(Order order)
    {
        return order.TotalAmount * 0.05m;
    }
}
```

Resolver:

```csharp
public class DiscountCalculator
{
    private readonly IReadOnlyDictionary<string, IDiscountStrategy> _strategies;

    public DiscountCalculator(IEnumerable<IDiscountStrategy> strategies)
    {
        _strategies = strategies.ToDictionary(
            strategy => strategy.CustomerType,
            StringComparer.OrdinalIgnoreCase);
    }

    public decimal Calculate(Customer customer, Order order)
    {
        if (!_strategies.TryGetValue(customer.Type, out var strategy))
        {
            return 0;
        }

        return strategy.Calculate(order);
    }
}
```

DI:

```csharp
services.AddScoped<IDiscountStrategy, VipDiscountStrategy>();
services.AddScoped<IDiscountStrategy, GoldDiscountStrategy>();
services.AddScoped<DiscountCalculator>();
```

### 2.3 Khi nào dùng Strategy?

Dùng khi:

- Có nhiều rule cùng contract.
- Rule thay đổi hoặc thêm mới thường xuyên.
- Muốn test từng rule độc lập.
- Muốn tránh `switch/if` phình to trong service chính.

Không nên dùng khi:

- Chỉ có 2 case đơn giản, ít thay đổi.
- Rule không thật sự cùng contract.
- Strategy chỉ làm code bị chia nhỏ vô nghĩa.

---

## 3. Observer

### 3.1 Ý tưởng

Observer dùng khi một sự kiện xảy ra và nhiều object/module cần phản ứng mà publisher không cần biết cụ thể ai đang nghe.

Ví dụ sau khi order completed:

- Gửi email.
- Ghi audit log.
- Cập nhật loyalty point.
- Publish integration event.

Nếu `OrderService` gọi trực tiếp tất cả dependency này, nó sẽ phình và coupling cao.

### 3.2 Domain Event style

Event:

```csharp
public record OrderCompletedEvent(Guid OrderId, Guid CustomerId, decimal TotalAmount);
```

Handler contract:

```csharp
public interface IEventHandler<in TEvent>
{
    Task HandleAsync(TEvent @event, CancellationToken cancellationToken);
}
```

Handlers:

```csharp
public class SendOrderCompletedEmailHandler : IEventHandler<OrderCompletedEvent>
{
    private readonly IEmailSender _emailSender;

    public SendOrderCompletedEmailHandler(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }

    public Task HandleAsync(OrderCompletedEvent @event, CancellationToken cancellationToken)
    {
        return _emailSender.SendAsync(
            new EmailMessage("Order completed", $"Order {@event.OrderId} completed."),
            cancellationToken);
    }
}

public class AddLoyaltyPointHandler : IEventHandler<OrderCompletedEvent>
{
    public Task HandleAsync(OrderCompletedEvent @event, CancellationToken cancellationToken)
    {
        // Add point
        return Task.CompletedTask;
    }
}
```

Publisher:

```csharp
public interface IEventPublisher
{
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken cancellationToken);
}
```

### 3.3 Khi nào dùng Observer?

Dùng khi:

- Một action có nhiều side effect độc lập.
- Publisher không nên biết tất cả subscriber.
- Muốn thêm phản ứng mới mà không sửa flow chính.
- Có domain event/integration event.

Không nên dùng khi:

- Side effect bắt buộc phải nằm trong transaction chính và thứ tự rất chặt.
- Event làm flow khó trace.
- Handler âm thầm fail nhưng hệ thống không có retry/monitoring.

### 3.4 Senior tip

Observer làm giảm coupling nhưng tăng tính bất định của flow. Khi dùng event, phải rõ:

- Event chạy sync hay async?
- Có cùng transaction không?
- Handler fail thì sao?
- Có retry không?
- Có idempotency không?
- Có cần Outbox không?

---

## 4. Command

### 4.1 Ý tưởng

Command đóng gói một hành động thành object.

Command thường dùng khi cần:

- Queue background job.
- Retry action.
- Log request.
- Validate riêng từng action.
- Tách endpoint khỏi use case.
- Undo/redo trong một số hệ thống.

### 4.2 Ví dụ Application Command

Command:

```csharp
public record CreateOrderCommand(
    Guid CustomerId,
    IReadOnlyList<CreateOrderItemDto> Items);
```

Handler:

```csharp
public interface ICommandHandler<in TCommand>
{
    Task HandleAsync(TCommand command, CancellationToken cancellationToken);
}
```

Implementation:

```csharp
public class CreateOrderCommandHandler : ICommandHandler<CreateOrderCommand>
{
    private readonly IOrderRepository _orders;
    private readonly IProductRepository _products;

    public CreateOrderCommandHandler(
        IOrderRepository orders,
        IProductRepository products)
    {
        _orders = orders;
        _products = products;
    }

    public async Task HandleAsync(CreateOrderCommand command, CancellationToken cancellationToken)
    {
        var products = await _products.GetByIdsAsync(
            command.Items.Select(x => x.ProductId),
            cancellationToken);

        var order = Order.Create(command.CustomerId, command.Items, products);

        await _orders.SaveAsync(order, cancellationToken);
    }
}
```

Controller:

```csharp
public async Task<IActionResult> Create(CreateOrderCommand command, CancellationToken cancellationToken)
{
    await _handler.HandleAsync(command, cancellationToken);
    return Ok();
}
```

### 4.3 Khi nào dùng Command?

Dùng khi:

- Use case đủ lớn cần class riêng.
- Muốn tách input/action khỏi controller.
- Muốn đưa action vào queue/job.
- Muốn validate, log, authorize theo command.
- Muốn kết hợp với pipeline behavior.

Không nên dùng khi:

- CRUD quá đơn giản.
- Mỗi endpoint chỉ gọi một dòng rõ ràng.
- Command/Handler tạo quá nhiều file nhưng không thêm clarity.

---

## 5. Chain of Responsibility

### 5.1 Ý tưởng

Chain of Responsibility cho phép request đi qua một chuỗi handler. Mỗi handler xử lý một phần rồi chuyển tiếp.

Trong .NET Core, pattern này rất quen thuộc qua middleware pipeline:

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<RequestLoggingMiddleware>();
app.MapControllers();
```

Mỗi middleware có thể:

- Xử lý request.
- Dừng chain.
- Gọi handler tiếp theo.
- Xử lý response sau khi handler sau chạy xong.

### 5.2 Ví dụ approval pipeline

```csharp
public interface IApprovalHandler
{
    Task HandleAsync(ApprovalContext context, ApprovalDelegate next);
}

public delegate Task ApprovalDelegate();
```

Handler kiểm tra quyền:

```csharp
public class PermissionApprovalHandler : IApprovalHandler
{
    public async Task HandleAsync(ApprovalContext context, ApprovalDelegate next)
    {
        if (!context.User.CanApprove)
        {
            throw new UnauthorizedAccessException();
        }

        await next();
    }
}
```

Handler kiểm tra hạn mức:

```csharp
public class AmountLimitApprovalHandler : IApprovalHandler
{
    public async Task HandleAsync(ApprovalContext context, ApprovalDelegate next)
    {
        if (context.Amount > context.User.ApprovalLimit)
        {
            throw new InvalidOperationException("Amount exceeds approval limit.");
        }

        await next();
    }
}
```

### 5.3 Khi nào dùng Chain?

Dùng khi:

- Có nhiều bước xử lý độc lập theo thứ tự.
- Mỗi bước có thể dừng flow.
- Muốn thêm/bớt/sắp xếp bước dễ dàng.
- Phù hợp với middleware, validation pipeline, approval pipeline.

Không nên dùng khi:

- Thứ tự handler không rõ.
- Handler phụ thuộc lẫn nhau quá nhiều.
- Debug khó vì flow bị ẩn trong registration.

---

## 6. Mediator

### 6.1 Ý tưởng

Mediator giảm coupling giữa nhiều object bằng cách cho chúng giao tiếp thông qua một object trung gian.

Trong .NET Core, pattern này thường xuất hiện qua MediatR hoặc implementation tự viết:

```text
Controller -> Mediator -> Handler
```

Controller không inject trực tiếp nhiều service, mà gửi command/query.

### 6.2 Ví dụ đơn giản

```csharp
public interface IRequest<TResult>
{
}

public interface IRequestHandler<in TRequest, TResult>
    where TRequest : IRequest<TResult>
{
    Task<TResult> HandleAsync(TRequest request, CancellationToken cancellationToken);
}
```

Query:

```csharp
public record GetOrderDetailQuery(Guid OrderId) : IRequest<OrderDetailDto>;
```

Handler:

```csharp
public class GetOrderDetailQueryHandler
    : IRequestHandler<GetOrderDetailQuery, OrderDetailDto>
{
    private readonly IOrderReadRepository _orders;

    public GetOrderDetailQueryHandler(IOrderReadRepository orders)
    {
        _orders = orders;
    }

    public Task<OrderDetailDto> HandleAsync(
        GetOrderDetailQuery request,
        CancellationToken cancellationToken)
    {
        return _orders.GetDetailAsync(request.OrderId, cancellationToken);
    }
}
```

Controller:

```csharp
public Task<OrderDetailDto> Get(Guid id, CancellationToken cancellationToken)
{
    return _mediator.SendAsync(new GetOrderDetailQuery(id), cancellationToken);
}
```

### 6.3 Khi nào dùng Mediator?

Dùng khi:

- Controller phình to vì inject nhiều service.
- Muốn chuẩn hóa command/query handler.
- Muốn pipeline behavior cho validation/logging/transaction.
- Use case nhiều và cần tổ chức rõ.

Không nên dùng khi:

- App nhỏ, CRUD đơn giản.
- Mediator chỉ làm ẩn flow mà không giảm complexity.
- Team khó trace handler vì mọi thứ đi qua magic dispatch.

### 6.4 Senior tip

Mediator không tự động làm architecture sạch hơn. Nếu handler vẫn chứa logic lộn xộn, vẫn gọi lung tung infrastructure, thì Mediator chỉ đổi chỗ complexity.

---

## 7. Template Method

### 7.1 Ý tưởng

Template Method định nghĩa skeleton của một thuật toán trong base class, cho class con override một vài bước cụ thể.

Ví dụ import file:

```text
Validate file -> Parse rows -> Validate rows -> Save -> Return result
```

Flow giống nhau, format khác nhau.

### 7.2 Ví dụ

```csharp
public abstract class FileImportService<TRecord>
{
    public async Task<ImportResult> ImportAsync(Stream file, CancellationToken cancellationToken)
    {
        ValidateFile(file);

        var records = await ParseAsync(file, cancellationToken);

        ValidateRecords(records);

        await SaveAsync(records, cancellationToken);

        return new ImportResult(records.Count);
    }

    protected virtual void ValidateFile(Stream file)
    {
        if (file.Length == 0)
        {
            throw new InvalidOperationException("File is empty.");
        }
    }

    protected abstract Task<IReadOnlyList<TRecord>> ParseAsync(
        Stream file,
        CancellationToken cancellationToken);

    protected abstract void ValidateRecords(IReadOnlyList<TRecord> records);

    protected abstract Task SaveAsync(
        IReadOnlyList<TRecord> records,
        CancellationToken cancellationToken);
}
```

CSV importer:

```csharp
public class ProductCsvImportService : FileImportService<ProductImportRecord>
{
    protected override Task<IReadOnlyList<ProductImportRecord>> ParseAsync(
        Stream file,
        CancellationToken cancellationToken)
    {
        // Parse CSV
        return Task.FromResult<IReadOnlyList<ProductImportRecord>>(Array.Empty<ProductImportRecord>());
    }

    protected override void ValidateRecords(IReadOnlyList<ProductImportRecord> records)
    {
        // Validate products
    }

    protected override Task SaveAsync(
        IReadOnlyList<ProductImportRecord> records,
        CancellationToken cancellationToken)
    {
        // Save products
        return Task.CompletedTask;
    }
}
```

### 7.3 Khi nào dùng Template Method?

Dùng khi:

- Nhiều flow có cùng skeleton.
- Một số bước khác nhau theo loại.
- Muốn đảm bảo thứ tự xử lý không bị class con phá vỡ.

Không nên dùng khi:

- Class con phải override quá nhiều để né logic base.
- Composition/Strategy đơn giản hơn.
- Base class phình to và khó thay đổi.

---

## 8. State

### 8.1 Vấn đề

State Pattern dùng khi object thay đổi hành vi theo trạng thái.

Ví dụ order có các trạng thái:

- Draft
- Confirmed
- Paid
- Cancelled

Nếu tất cả logic nằm trong `OrderService`:

```csharp
if (order.Status == OrderStatus.Draft)
{
    // allow confirm
}
else if (order.Status == OrderStatus.Paid)
{
    // not allow cancel in some cases
}
```

`if/else` theo state sẽ phình nhanh.

### 8.2 Giải pháp

Tách hành vi theo state:

```csharp
public interface IOrderState
{
    OrderStatus Status { get; }
    void Confirm(Order order);
    void Cancel(Order order);
}
```

Draft state:

```csharp
public class DraftOrderState : IOrderState
{
    public OrderStatus Status => OrderStatus.Draft;

    public void Confirm(Order order)
    {
        order.ChangeStatus(OrderStatus.Confirmed);
    }

    public void Cancel(Order order)
    {
        order.ChangeStatus(OrderStatus.Cancelled);
    }
}
```

Paid state:

```csharp
public class PaidOrderState : IOrderState
{
    public OrderStatus Status => OrderStatus.Paid;

    public void Confirm(Order order)
    {
        throw new InvalidOperationException("Paid order cannot be confirmed again.");
    }

    public void Cancel(Order order)
    {
        throw new InvalidOperationException("Paid order requires refund flow.");
    }
}
```

Resolver:

```csharp
public class OrderStateResolver
{
    private readonly IReadOnlyDictionary<OrderStatus, IOrderState> _states;

    public OrderStateResolver(IEnumerable<IOrderState> states)
    {
        _states = states.ToDictionary(x => x.Status);
    }

    public IOrderState Resolve(OrderStatus status)
    {
        return _states[status];
    }
}
```

Use case:

```csharp
public void Cancel(Order order)
{
    var state = _stateResolver.Resolve(order.Status);
    state.Cancel(order);
}
```

### 8.3 Khi nào dùng State?

Dùng khi:

- Object có nhiều trạng thái.
- Mỗi state có rule/hành vi khác nhau.
- Transition giữa state cần kiểm soát rõ.
- `if/else` theo status bắt đầu phình to.

Không nên dùng khi:

- State ít và rule đơn giản.
- Transition tốt hơn nên quản lý bằng state machine library.
- Tách class theo state làm business flow khó đọc hơn.

---

## 9. Các pattern Behavioral khác

### 9.1 Iterator

Iterator cung cấp cách duyệt collection mà không lộ cấu trúc bên trong. Trong C#, pattern này đã quá quen qua:

```csharp
IEnumerable<T>
IEnumerator<T>
yield return
```

Ví dụ:

```csharp
public IEnumerable<Order> GetHighValueOrders(IEnumerable<Order> orders)
{
    foreach (var order in orders)
    {
        if (order.TotalAmount > 10_000_000)
        {
            yield return order;
        }
    }
}
```

### 9.2 Visitor

Visitor dùng khi cần thêm operation mới trên cấu trúc object ổn định mà không sửa class của từng node. Hay gặp trong AST, expression tree, rule engine.

Trong business app thông thường, Visitor ít dùng hơn Strategy/Command/State.

### 9.3 Memento

Memento lưu snapshot trạng thái để restore/undo. Có thể gặp trong editor, workflow draft, versioning.

Trong hệ thống nghiệp vụ, audit log hoặc event sourcing thường phù hợp hơn nếu cần lịch sử nghiêm túc.

### 9.4 Interpreter

Interpreter dùng để xử lý một ngôn ngữ/grammar nhỏ. Ví dụ filter expression, rule DSL, formula engine.

Không nên tự viết nếu có parser/rule engine phù hợp, vì grammar dễ phức tạp nhanh.

---

## 10. So sánh nhanh nhóm Behavioral

| Pattern | Mục tiêu | Ví dụ .NET Core |
|---|---|---|
| Strategy | Thay thế thuật toán/rule | Discount, shipping fee, pricing rule |
| Observer | Nhiều handler phản ứng với event | Domain event, integration event |
| Command | Đóng gói action thành object | Command handler, background job |
| Chain of Responsibility | Request đi qua nhiều bước | Middleware, validation pipeline |
| Mediator | Điều phối qua trung gian | Command/query mediator |
| Template Method | Skeleton flow cố định, bước con thay đổi | Import file, export report |
| State | Hành vi thay đổi theo trạng thái | Order workflow, approval status |
| Iterator | Duyệt collection không lộ cấu trúc | `IEnumerable<T>`, `yield return` |
| Visitor | Thêm operation trên object tree | Expression tree, AST |
| Memento | Lưu/restore snapshot | Draft, undo, version snapshot |
| Interpreter | Xử lý grammar/DSL nhỏ | Rule expression, filter DSL |

---

## 11. Checklist chọn Behavioral Pattern

Khi gặp bài toán hành vi, hỏi:

1. Có nhiều rule/algorithm thay thế nhau không? Nếu có, cân nhắc Strategy.
2. Một event có nhiều side effect độc lập không? Nếu có, cân nhắc Observer.
3. Action có cần queue/retry/log/validate riêng không? Nếu có, cân nhắc Command.
4. Request có đi qua nhiều bước xử lý không? Nếu có, cân nhắc Chain.
5. Controller/service có quá nhiều dependency/use case không? Nếu có, cân nhắc Mediator hoặc Application Service.
6. Flow có skeleton cố định nhưng bước con khác nhau không? Nếu có, cân nhắc Template Method.
7. Object có hành vi khác nhau theo state không? Nếu có, cân nhắc State.
8. Pattern có làm flow dễ test hơn không?
9. Pattern có làm runtime khó trace hơn không?
10. Có cần logging/monitoring để quan sát flow không?

---

## 12. Tư duy chốt

Behavioral Patterns tác động trực tiếp đến cách business logic chạy. Vì vậy, dùng chúng cần tỉnh táo hơn các nhóm khác.

Trong .NET Core, nên nắm chắc trước:

- **Strategy** cho rule/algorithm thay thế nhau.
- **Command** cho use case/action rõ ràng.
- **Observer** cho event và side effect.
- **Chain of Responsibility** cho middleware/pipeline.
- **State** cho workflow nhiều trạng thái.

```text
Behavioral Pattern tốt làm flow nghiệp vụ rõ hơn.
Behavioral Pattern dùng sai làm flow bị phân mảnh, khó trace, khó debug.
Senior không chỉ hỏi "pattern nào đúng", mà hỏi "flow này khi production lỗi thì mình quan sát và sửa được không?".
```
