# EF Core và Dapper trong cùng Transaction

EF Core và Dapper có thể tham gia cùng một local database transaction khi chúng dùng cùng `DbConnection` instance và cùng `DbTransaction` instance. Cùng connection string không đủ vì mỗi connection là một database session riêng.

## ADO.NET primitives

Cả hai công cụ đều chạy trên ADO.NET:

```text
DbConnection → DbTransaction → DbCommand
```

EF Core quản lý change tracking và sinh command khi `SaveChanges`. Dapper map parameter/result nhưng không sở hữu connection lifecycle. Transaction atomic hay không được quyết định ở ADO.NET/database, không được quyết định bởi tên Repository hoặc Unit of Work.

## Resource ownership

Một owner phải chịu trách nhiệm tạo, commit, rollback và dispose resource bundle:

```text
open connection
→ begin transaction
→ create DbContext trên connection
→ enlist EF bằng UseTransaction
→ chạy EF/Dapper tuần tự
→ commit hoặc rollback
→ dispose
```

Nếu EF tự mở transaction còn Dapper tự mở connection, Dapper write có thể commit dù EF rollback.

## Factory

Factory có giá trị khi creation có nhiều bước và có thể fail giữa chừng:

```csharp
connection = new MySqlConnection(connectionString);
await connection.OpenAsync(cancellationToken);
transaction = await connection.BeginTransactionAsync(cancellationToken);

var options = new DbContextOptionsBuilder<AppDbContext>()
    .UseMySql(connection, serverVersion)
    .Options;

dbContext = new AppDbContext(options);
await dbContext.Database.UseTransactionAsync(transaction, cancellationToken);
```

Factory phải dispose resource đã tạo nếu bước sau lỗi. Nếu creation chỉ là `new Service()`, Factory không giải quyết lifecycle nào và thường không cần tồn tại.

## Dapper command

Dapper write phải nhận transaction tường minh:

```csharp
var command = new CommandDefinition(
    sql,
    parameters,
    transaction: unitOfWork.Transaction,
    cancellationToken: cancellationToken);

await unitOfWork.Connection.ExecuteAsync(command);
```

Không truyền transaction là lỗi nguy hiểm: command có thể chạy ngoài atomic boundary hoặc provider từ chối vì connection đang có active transaction.

## Commit ordering

Một flow có Domain Event nội bộ thường là:

```text
Dapper commands đã chạy nhưng chưa commit
→ EF SaveChanges
→ dispatch handler ghi cùng database
→ SaveChanges phần handler
→ commit DbTransaction
→ clear events
```

Handler có thể phát event mới, vì vậy dispatcher cần loop đến khi không còn pending event. External network call không chạy trong transaction; nếu cần delivery bền vững, dùng Outbox.

## Failure behavior

| Failure point | Expected behavior |
|---|---|
| Open connection | Không để resource sống |
| Begin transaction | Dispose connection |
| Dapper command | Rollback khi UOW kết thúc |
| EF SaveChanges | Rollback Dapper writes trước đó |
| Event handler | Rollback toàn bộ database writes |
| Commit | Không clear event nếu commit thất bại |
| Caller quên commit | Dispose tự rollback |

Rollback sau exception không nên dùng cancellation token đã canceled; cleanup là best effort để bảo vệ database state và exception gốc.

## Concurrency và lifetime

`DbContext` và một connection không thread-safe cho nhiều operation đồng thời. Không dùng `Task.WhenAll` trên cùng UOW. Transaction nên ngắn và không chờ user input hoặc external API.

Connection pooling làm cho `Dispose` thường trả physical connection về pool. Tạo UOW theo use case không đồng nghĩa mở TCP socket mới cho mọi request.

## Không dùng mặc định

- `TransactionScope`: không cần cho một local database và làm boundary khó nhìn hơn.
- Generic Repository: không giải quyết shared connection ownership.
- Automatic retry: có thể chạy lại Dapper command/event handler; chỉ dùng khi operation idempotent.
- Nested UOW: làm commit ownership mơ hồ.

## Business case — tạo đơn và giữ tồn kho

Use case dùng EF để thêm `DonHang`, còn Dapper chạy atomic SQL trừ tồn. Nếu chúng dùng hai connection:

```text
Dapper UPDATE tồn kho → commit
EF INSERT DonHang → lỗi unique/connection
Kết quả: tồn đã giảm nhưng không có đơn
```

Cùng connection string không sửa được lỗi vì hai connection là hai sessions. Cần cùng object connection và transaction, sau đó chỉ UOW được commit.

## Business case — Dapper quên truyền transaction

Connection đang mở transaction nhưng command Dapper chỉ nhận connection:

```csharp
await connection.ExecuteAsync(sql, parameters); // thiếu transaction
```

Tùy provider, command có thể bị từ chối hoặc chạy ngoài boundary mong đợi. Wrapper không cần che toàn bộ Dapper API; code review rule đơn giản là mọi write trong UOW phải dùng `CommandDefinition(transaction: uow.Transaction)`.

## Business case — event handler lỗi

EF đã SaveChanges vào transaction, Dapper đã update tồn, sau đó handler ghi lịch sử throw exception. UOW rollback transaction chung nên cả đơn và tồn quay lại. Domain Events không được clear vì operation chưa hoàn tất.

Nếu handler đã gọi email provider trước khi throw, rollback database không thu hồi email. Vì vậy external call phải chuyển sang Outbox sau commit.

## Tóm tắt

Shared transaction không phải tính năng ghép hai ORM ở mức pattern. Nó là resource ownership: một connection, một transaction, một owner và một commit point.
