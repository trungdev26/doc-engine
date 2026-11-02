# DDD Tactical Design

Domain-Driven Design (DDD) tactical design là tập hợp các building block dùng để biểu diễn business rules trong code. Mục tiêu không phải tạo nhiều class, mà làm cho trạng thái hợp lệ chỉ có thể thay đổi qua những đường đã được kiểm soát.

## Business invariant

Business invariant là điều phải luôn đúng sau khi một operation hoàn tất. Ví dụ, một đơn hàng đã hủy không thể được xác nhận, hoặc số tiền không thể âm.

Thiết kế bắt đầu bằng invariant, không bắt đầu bằng pattern:

```text
Invariant nào phải luôn đúng?
→ dữ liệu nào cần quyết định invariant?
→ object nào sở hữu dữ liệu đó?
→ transaction boundary nào bảo vệ operation?
```

Nếu chưa nêu được invariant, việc tạo Aggregate hoặc Domain Service thường chỉ là đổi tên CRUD.

## Entity

Entity có identity ổn định xuyên suốt vòng đời. Hai Entity có cùng dữ liệu nhưng khác identity vẫn là hai đối tượng khác nhau.

```csharp
public abstract class Entity<TId>
{
    protected Entity(TId id) => Id = id;
    public TId Id { get; protected set; }
}
```

`DonHang` là Entity vì hệ thống theo dõi đúng đơn hàng đó qua nhiều trạng thái. Tên, tổng tiền hoặc trạng thái thay đổi nhưng identity không đổi.

## Value Object

Value Object không có identity riêng; equality đến từ toàn bộ thành phần giá trị. `Money(100_000, "VND")` bằng một instance khác có cùng amount và currency.

```csharp
public sealed class Money : ValueObject
{
    public decimal Amount { get; }
    public string Currency { get; }

    protected override IEnumerable<object?> GetEqualityComponents()
    {
        yield return Amount;
        yield return Currency;
    }
}
```

Value Object giải quyết primitive obsession: thay vì truyền `decimal` không rõ currency hoặc rule làm tròn, một type giữ chúng ở cùng nơi. Không tạo Value Object cho mọi string; chỉ tạo khi value có rule, unit hoặc vocabulary riêng.

## Aggregate và Aggregate Root

Aggregate là nhóm Entity/Value Object phải giữ consistency cùng nhau. Aggregate Root là entry point duy nhất cho thay đổi bên trong boundary đó.

Ví dụ `DonHang` và các `ChiTietDonHang` có thể là một Aggregate vì tổng tiền phải khớp các dòng hàng trong cùng operation. `Shop` không nên chứa toàn bộ đơn hàng: collection tăng không giới hạn làm Aggregate lớn và tạo lock contention không cần thiết.

```text
Aggregate boundary tốt:
- đủ nhỏ để load và commit trong transaction ngắn
- đủ lớn để bảo vệ invariant đồng bộ
- reference Aggregate khác bằng identity khi không cần consistency tức thời
```

Aggregate không giải quyết race condition giữa hai request chỉ bằng method domain. Database constraint, optimistic token hoặc atomic statement vẫn cần bảo vệ concurrent writes.

## Domain behavior

State mutation nên đi qua method mang business intent:

```csharp
public void XacNhan()
{
    if (TrangThai != TrangThaiDonHang.MoiTao)
        throw new DomainException("DON_HANG_KHONG_THE_XAC_NHAN");

    TrangThai = TrangThaiDonHang.DaXacNhan;
    RaiseDomainEvent(new DonHangDaXacNhanDomainEvent(Id));
}
```

Method giữ transition và event cạnh state mà chúng mô tả. Public setter cho phép mọi caller bỏ qua invariant và làm rule bị duplicate.

## Domain Service

Domain Service chứa business calculation hoặc policy không thuộc tự nhiên về một Entity/Value Object. Nó phải dùng domain vocabulary và không phụ thuộc HTTP, EF Core hoặc message broker.

```csharp
public sealed class ChinhSachTinhPhiDomainService
{
    public Money TinhPhi(Shop shop, DiaChiGiaoHang diaChi, Money tongTien) { ... }
}
```

Nếu class chủ yếu load database, check permission, gọi API và commit, đó là Application Service. Đặt tên `DomainService` không biến orchestration thành domain logic.

## Domain Event

Domain Event là business fact đã xảy ra. Aggregate raise event nhưng không biết handler.

```text
DonHang.XacNhan()
→ DonHangDaXacNhanDomainEvent
→ handler nội bộ cập nhật dữ liệu liên quan
```

Event giảm coupling khi nhiều phản ứng độc lập quan tâm cùng một fact. Nếu bước B luôn là phần bắt buộc theo thứ tự của operation A, lời gọi trực tiếp thường rõ hơn event.

Domain Event trong process không phải durable message. Khi cần gửi broker, webhook hoặc email không được mất, ghi Outbox trong cùng transaction rồi publish sau commit.

## Application orchestration

Application layer điều phối use case:

```text
resolve current tenant/user
→ load Aggregate
→ gọi Domain behavior
→ persist trong transaction
→ map kết quả
```

Application quyết định workflow và transaction boundary; Domain quyết định state transition hợp lệ. Tách hai trách nhiệm giúp thay HTTP/database mà không nhân đôi business rules.

## Boundary review

| Dấu hiệu | Điều cần xem lại |
|---|---|
| Aggregate chứa collection tăng vô hạn | Tách Aggregate và reference bằng identity |
| Domain method cần `DbContext` | Load dữ liệu tại Application hoặc xem lại boundary |
| Domain Service chỉ forward repository | Xóa abstraction hoặc chuyển về Application |
| Mọi thay đổi đều phát event | Dùng lời gọi trực tiếp cho coupling bắt buộc |
| Transaction phải khóa rất nhiều Aggregate | Invariant có thể đang đặt sai boundary |

## Business case — hai nhân viên thay đổi cùng đơn

Nhân viên A và B cùng mở một đơn ở trạng thái `MoiTao`. B xác nhận trước; A vẫn nhìn dữ liệu cũ và gửi lệnh hủy.

```text
A đọc DonHang(version=7, MoiTao)
B đọc DonHang(version=7, MoiTao)
B gọi XacNhan() và commit version=8
A gọi Huy() trên state cũ và update version=7
```

Domain method bảo vệ transition trên state mà Aggregate đang giữ, nhưng không biết database đã có version mới. Vì vậy cần hai lớp:

- `DonHang.XacNhan()`/`Huy()` giữ business transition.
- Optimistic concurrency token ngăn state cũ ghi đè state mới.

Conflict không nên automatic retry, vì sau khi B xác nhận, intent hủy của A cần được đánh giá lại theo state mới.

## Business case — Aggregate quá lớn

Nếu `Shop` chứa collection toàn bộ `DonHang`, mỗi đơn mới buộc load hoặc modify một Aggregate tăng không giới hạn. Các request của cùng Shop tranh chấp cùng version dù chúng tạo các đơn độc lập.

Boundary phù hợp hơn là mỗi `DonHang` là một Aggregate Root và giữ `ShopId`. `Shop` chỉ bảo vệ trạng thái của chính Shop. Rule “Shop phải đang hoạt động khi tạo đơn” được Application load/check trong use case; nó không yêu cầu mọi đơn nằm trong Shop Aggregate.

## Business case — event nội bộ và external side effect

Sau khi xác nhận đơn, hệ thống cần ghi lịch sử và gửi email:

- Ghi lịch sử là local database write, có thể xử lý bằng Domain Event trước commit trong cùng transaction.
- Gửi email là network side effect, không rollback cùng database. Handler chỉ nên ghi Outbox; worker gửi sau commit.

Dùng cùng một từ “event” cho cả hai mà không phân biệt durability sẽ tạo khoảng trống: email có thể gửi cho transaction đã rollback hoặc bị mất sau commit.

## Tóm tắt

DDD tactical design bắt đầu từ invariant. Entity giữ identity, Value Object giữ rule của value, Aggregate xác định consistency boundary, Domain Service chứa policy thuần và Domain Event biểu diễn fact. Chỉ dùng building block khi nó làm rule rõ hơn hoặc failure khó xảy ra hơn.
