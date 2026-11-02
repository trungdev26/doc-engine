# Sinh mã nghiệp vụ khi chạy nhiều instance

## Bối cảnh

Hệ thống tạo hóa đơn cần mã hiển thị cho người dùng theo dạng:

```text
INV-202607-000001
INV-202607-000002
INV-202607-000003
```

Ban đầu ứng dụng chỉ có một instance. Sau khi scale thành nhiều pod/VM phía sau load balancer, hai request đôi lúc cùng nhận một mã. Hậu quả không chỉ là lỗi unique key: nhân viên có thể nhìn thấy mã đã in ra, job đồng bộ đối tác thất bại, hoặc hóa đơn phải hủy và tạo lại.

Bài toán không phải "làm sao tăng số". Nó là bài toán chọn đúng tính chất cho mã:

| Tính chất | Có bắt buộc không? | Ví dụ |
| --- | --- | --- |
| Unique | gần như luôn có | không có hai hóa đơn cùng mã |
| Tăng dần | thường cần để dễ tra cứu | `000123` sau `000122` |
| Liên tục tuyệt đối | hiếm khi cần | không được thiếu bất kỳ số nào |
| Theo scope | thường cần | reset theo ngày, chi nhánh, loại chứng từ |
| Chịu restart/scale | cần ở production | thêm pod không tạo mã trùng |
| Hiệu năng | tùy traffic | không thành hot lock toàn hệ thống |

Đừng mặc định "liên tục tuyệt đối". Rollback transaction, request timeout, mã đã reserve nhưng job chết, hoặc thao tác bị hủy đều có thể tạo gap. Nếu pháp lý thực sự yêu cầu không gap, đó là workflow chứng từ/audit khác hẳn một counter thông thường.

## 1. Cách sai đầu tiên: đếm bản ghi rồi cộng một

```csharp
var count = await _db.Invoices.CountAsync(ct);
var code = $"INV-{DateTime.UtcNow:yyyyMM}-{count + 1:D6}";
```

Hai instance cùng `CountAsync()` thấy 100 rồi cùng sinh `000101`. Trong tải thấp lỗi hiếm, nên rất dễ qua local test. Thêm `lock` C# cũng không giải quyết nếu có nhiều process:

```csharp
lock (_gate)
{
    // lock này chỉ khóa thread trong *một* process.
}
```

Mỗi pod có `_gate` riêng. Distributed system không tự trở thành an toàn chỉ vì code trong một process có lock.

## 2. Cách sai thứ hai: `MAX + 1`

```sql
SELECT MAX(SequenceNumber) FROM Invoices WHERE Period = @period;
```

Sau đó application cộng một và insert. Đây vẫn là read-modify-write race. Bọc bằng transaction mặc định cũng chưa đủ, vì hai transaction có thể cùng đọc trước khi một bên ghi. Tăng isolation hoặc table lock có thể chặn lỗi nhưng tạo contention lớn và dễ deadlock khi traffic tăng.

## 3. Bước đầu tiên luôn cần: unique constraint

```sql
CREATE UNIQUE INDEX UX_Invoices_Period_Sequence
ON Invoices(Period, SequenceNumber);
```

Unique constraint không tự sinh số nhưng là hàng rào correctness cuối cùng. Dù application, Redis hay worker có bug, database vẫn từ chối duplicate. Catch unique violation rồi retry chỉ là phương án phụ; nếu tần suất conflict cao, thuật toán cấp số đang không phù hợp.

## 4. Mẫu phổ biến: bảng counter + atomic update

Tạo bảng giữ counter theo scope cần reset:

```sql
CREATE TABLE DocumentCounters (
    DocumentType varchar(20) NOT NULL,
    Period char(6) NOT NULL,
    ScopeKey varchar(100) NOT NULL,
    LastValue bigint NOT NULL,
    CONSTRAINT PK_DocumentCounters PRIMARY KEY (DocumentType, Period, ScopeKey)
);
```

Với SQL Server, stored procedure có thể cấp một số bằng câu lệnh nguyên tử:

```sql
CREATE PROCEDURE AllocateDocumentNumber
    @DocumentType varchar(20),
    @Period char(6),
    @ScopeKey varchar(100)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE DocumentCounters WITH (UPDLOCK, HOLDLOCK)
    SET LastValue = LastValue + 1
    OUTPUT inserted.LastValue
    WHERE DocumentType = @DocumentType
      AND Period = @Period
      AND ScopeKey = @ScopeKey;

    IF @@ROWCOUNT = 0
    BEGIN
        BEGIN TRY
            INSERT DocumentCounters(DocumentType, Period, ScopeKey, LastValue)
            VALUES (@DocumentType, @Period, @ScopeKey, 1);
            SELECT CAST(1 AS bigint) AS AllocatedValue;
        END TRY
        BEGIN CATCH
            -- Request khác có thể đã tạo row scope này; caller retry procedure.
            IF ERROR_NUMBER() IN (2601, 2627) THROW;
            THROW;
        END CATCH
    END
END
```

Ý chính là `UPDATE LastValue = LastValue + 1` chạy ở database, không phải đọc số về process rồi cộng. Row counter của mỗi `(type, period, branch)` là serialization point có chủ đích.

## 5. Race khi khởi tạo counter

Tháng mới bắt đầu, hai request đều không thấy row `INV/202607` và cùng insert. Primary key/unique key sẽ cho một request thắng, request kia nhận duplicate-key. Xử lý đúng là retry allocation trong số lần nhỏ, có jitter, vì đây là conflict khởi tạo rất ngắn.

Không catch mọi exception rồi retry vô hạn. Syntax error, connection string sai hay deadlock kéo dài phải được nhìn thấy qua log/alert.

```csharp
public async Task<long> AllocateAsync(CodeScope scope, CancellationToken ct)
{
    for (var attempt = 1; attempt <= 3; attempt++)
    {
        try
        {
            return await _counterRepository.AllocateAsync(scope, ct);
        }
        catch (DbUpdateException ex) when (IsUniqueViolation(ex) && attempt < 3)
        {
            await Task.Delay(TimeSpan.FromMilliseconds(Random.Shared.Next(10, 80)), ct);
        }
    }

    throw new CodeAllocationException(scope);
}
```

Trong code thực tế, repository nên gọi procedure/SQL atomic thay vì EF read rồi update entity tracked.

## 6. Gắn allocation với transaction nào?

Có hai lựa chọn hợp lệ, tùy nghĩa của mã.

| Cách | Luồng | Đặc điểm |
| --- | --- | --- |
| Cấp trong cùng transaction tạo invoice | counter tăng và invoice commit/rollback cùng nhau | ít gap hơn, transaction cần ngắn |
| Reserve trước rồi tạo sau | counter commit trước, invoice có thể fail | chịu tải tốt hơn, chấp nhận gap |

Nếu mã chỉ là số tham chiếu nội bộ, reserve trước thường đơn giản và an toàn. Nếu nghiệp vụ yêu cầu mã chỉ xuất hiện khi invoice commit, cấp trong cùng DB transaction. Tuy vậy rollback hay lỗi sau khi đã phát hành ra ngoài vẫn có thể để lại gap; đừng hứa điều hệ thống không thật sự đảm bảo.

```csharp
await using var transaction = await _db.Database.BeginTransactionAsync(ct);
var number = await _counterRepository.AllocateAsync(scope, ct);
_db.Invoices.Add(Invoice.Create(number, command));
await _db.SaveChangesAsync(ct);
await transaction.CommitAsync(ct);
```

Không gọi payment provider, gửi email hoặc publish broker trong transaction này. Commit state + outbox, rồi xử lý side effect sau.

## 7. Khi một counter trở thành hot spot

Nếu mọi invoice toàn hệ thống cùng dùng một row counter, database phải serialize tất cả allocation. Với vài chục đến vài trăm request/giây thường vẫn ổn; cần đo lock wait và p99 trước khi tối ưu. Khi traffic cao hơn, có các lựa chọn:

### 7.1. Chia scope

Counter theo chi nhánh/ngày/loại chứng từ giảm contention và cũng thường khớp nghĩa nghiệp vụ hơn.

```text
INV-20260711-HN-000001
INV-20260711-HCM-000001
```

Không chia shard chỉ để nhanh nếu người dùng yêu cầu một chuỗi số toàn cục có nghĩa pháp lý.

### 7.2. Cấp một range cho mỗi instance

Instance xin một block, ví dụ `100001..101000`, rồi tăng bằng `Interlocked.Increment` trong memory. Khi hết block, nó xin block mới từ database.

```text
Database cấp block: [100001, 101000]
Pod A dùng: 100001, 100002, ...
Pod B cấp block khác: [101001, 102000]
```

Ưu điểm: database chỉ bị gọi mỗi 1.000 mã. Nhược điểm: pod crash làm phần chưa dùng trong block thành gap; mã phát ra giữa các pod không theo đúng thời gian toàn cục. Dùng khi uniqueness/tốc độ quan trọng hơn chuỗi liên tục sát nhau.

### 7.3. Database sequence

`SEQUENCE` phù hợp khi chỉ cần số unique tăng nhanh trong một database.

```sql
CREATE SEQUENCE InvoiceNumberSequence AS bigint START WITH 1 INCREMENT BY 1;
SELECT NEXT VALUE FOR InvoiceNumberSequence;
```

Sequence có thể cache và tạo gap sau restart/failover; cũng không tự reset theo `period` hoặc `branch`. Dùng sequence cho technical id hoặc một global number đơn giản; dùng counter table khi cần scope theo business key.

## 8. Redis `INCR`: nhanh nhưng không tự là source of truth

`INCR invoice:202607` là atomic trên một Redis primary và rất nhanh. Tuy nhiên phải trả lời các câu hỏi: Redis persistence/failover có làm counter quay lùi không? Làm sao đồng bộ với invoice database? Khi Redis down, có chặn tạo hóa đơn hay fallback sang DB? Unique constraint ở DB vẫn phải tồn tại.

Redis hợp cho rate limit, ephemeral number hoặc khi Redis đã là hạ tầng vận hành đáng tin cho use case. Đừng thêm Redis chỉ để tránh một row update mà database hiện tại xử lý rất nhẹ.

## 9. Không dùng GUID/ULID khi người dùng cần số nghiệp vụ

GUID/ULID tốt cho primary key distributed: không cần round trip, collision cực thấp và scale thuận lợi. Nhưng chúng không giải quyết requirement "mã hóa đơn dễ đọc, có prefix, reset theo tháng". Cách thường dùng là tách hai khái niệm:

```text
Invoice.Id       = GUID/ULID, technical immutable identity
Invoice.Code     = INV-202607-000123, business/display identity
```

Không dùng business code làm primary key nếu format có thể đổi, phải reset hoặc có ý nghĩa nghiệp vụ.

## 10. Case incident: duplicate code chỉ xảy ra lúc scale-out

### Triệu chứng

- `UX_Invoices_Period_Sequence` thỉnh thoảng báo duplicate key.
- Chỉ xảy ra trong 5 phút sau autoscaler thêm pod.
- CPU thấp, nhưng p99 của endpoint create invoice tăng do retry.

### Nguyên nhân

Mỗi pod có `ConcurrentDictionary<string, long>` cache số cuối. Khi pod mới lên, cache rỗng nên đọc `MAX` từ bảng invoice, trong khi pod cũ đang có số đã reserve nhưng chưa insert. Hai bên cấp cùng một mã.

### Sửa chữa

1. Bỏ counter in-memory làm authority.
2. Chuyển allocation về counter table/procedure atomic trong transaction phù hợp.
3. Giữ unique index làm invariant.
4. Thêm metric allocation duration, DB lock wait, unique-conflict retry và số mã bị bỏ trống.
5. Load test tối thiểu 2-5 instance đồng thời, đặc biệt tại thời điểm mở period mới.

## 11. Test concurrency phải chạy thật sự đồng thời

Test gọi method tuần tự không kiểm tra race. Một integration test cần database thật/test container, nhiều task cùng bắt đầu qua barrier và kiểm tra uniqueness.

```csharp
var start = new TaskCompletionSource();
var tasks = Enumerable.Range(0, 200)
    .Select(async _ =>
    {
        await start.Task;
        await using var scope = _factory.Services.CreateAsyncScope();
        var allocator = scope.ServiceProvider.GetRequiredService<ICodeAllocator>();
        return await allocator.AllocateAsync(scopeKey, CancellationToken.None);
    });

start.SetResult();
var values = await Task.WhenAll(tasks);

Assert.Equal(values.Length, values.Distinct().Count());
```

Chạy test trên một process chưa mô phỏng hết multi-instance, nhưng nhiều scope/connection đã bắt được read-modify-write race. Pipeline CI nên có test song song; load test staging nhiều replica mới cho thấy lock contention và behavior lúc restart.

## 12. Bảng chọn nhanh

| Yêu cầu chính | Chọn khởi đầu |
| --- | --- |
| Technical primary key phân tán | GUID/ULID |
| Mã display unique theo period/branch | counter table + atomic update + unique index |
| Chuỗi số global đơn giản, chấp nhận gap | database sequence |
| Throughput rất cao, chấp nhận gap | range allocation |
| Counter ephemeral/rate limit | Redis `INCR` |
| Không được mất/mã phải audit nghiêm ngặt | workflow chứng từ riêng, transaction/audit/reconciliation được thiết kế cùng nghiệp vụ |

## Checklist trước khi triển khai

1. Mã cần unique, ordered hay gapless? Ai thực sự cần từng tính chất?
2. Scope reset là gì: ngày, tháng, chi nhánh, tenant hay loại chứng từ?
3. Database constraint nào bảo vệ uniqueness cuối cùng?
4. Allocation có nằm trong transaction tạo business record không?
5. Khi process chết, failover hoặc retry, hệ thống chấp nhận gap/duplicate thế nào?
6. Counter có là hot row không, và metric nào cho biết nó đang contention?
7. Có test nhiều connection/instance và test period rollover chưa?

## Kết luận

Sinh mã ở nhiều instance là một bài toán concurrency và business semantics. Lời giải tốt không phải là một đoạn tăng số thật khéo trong memory; nó là chọn nơi làm authority, đặt invariant ở database, biết chấp nhận gap ở đâu và chứng minh được behavior đó dưới tải, restart và scale-out.
