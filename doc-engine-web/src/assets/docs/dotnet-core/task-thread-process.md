# Task, Thread và Process trong .NET Core

> Tài liệu này giải thích sự khác nhau giữa Process, Thread và Task trong .NET Core, cách Task Parallel Library và async/await hoạt động bên dưới, cùng các sự cố thực tế thường gặp khi hiểu sai mô hình này: deadlock, thread pool starvation, và request bị nghẽn vì công việc nặng CPU.

---

## Mục tiêu tài liệu

Sau khi đọc xong, người đọc cần trả lời được các câu hỏi sau:

```text
1. Process, Thread, Task khác nhau ở điểm nào? Task có tạo ra Thread mới không?
2. Thread Pool trong .NET Core hoạt động ra sao?
3. CPU-bound và I/O-bound khác nhau thế nào, và tại sao cách xử lý phải khác nhau?
4. await có block Thread hiện tại không? Chuyện gì xảy ra bên dưới await?
5. Vì sao gọi .Result hoặc .Wait() có thể gây deadlock?
6. Thread pool starvation là gì và vì sao nó nguy hiểm hơn deadlock ở một số hệ thống?
7. Task.WhenAll khác Parallel.ForEach ở điểm nào?
8. Khi review code async, cần nhìn vào những điểm nào?
```

---

## 1. Process, Thread và Task khác nhau ở tầng nào

### 1.1. Process là gì

**Process** là một chương trình đang chạy, được hệ điều hành cấp cho một vùng nhớ ảo riêng biệt. Hai process không chia sẻ vùng nhớ với nhau trừ khi dùng cơ chế đặc biệt (shared memory, memory-mapped file).

```text
Process A (API service)      Process B (Worker service)
  Vùng nhớ riêng                Vùng nhớ riêng
  Handle file riêng             Handle file riêng
  Nếu Process A crash, Process B không bị ảnh hưởng.
```

Đây là lý do khi triển khai, người ta thường tách các thành phần quan trọng thành process/container riêng: một process chết không kéo theo process khác.

### 1.2. Thread là gì

**Thread** là đơn vị thực thi bên trong một process. Một process có thể có nhiều thread, các thread trong cùng một process **chia sẻ chung vùng nhớ** (heap), nhưng mỗi thread có stack riêng.

```text
Process (API service)
  Thread 1 — đang xử lý request A
  Thread 2 — đang xử lý request B
  Thread 3 — đang chạy background job

Cả 3 thread cùng đọc/ghi chung một vùng heap.
```

Vì chia sẻ chung heap, nhiều thread cùng truy cập một object có thể gây race condition nếu không đồng bộ đúng cách.

### 1.3. Vì sao thread "đắt"

Tạo một OS thread tốn:

```text
- Bộ nhớ cho stack (mặc định khoảng 1MB trên .NET/Windows).
- Chi phí context switching khi hệ điều hành chuyển CPU giữa các thread.
- Chi phí tạo/hủy thread ở tầng hệ điều hành.
```

Nếu một server xử lý 10.000 request đồng thời mà mỗi request tạo một OS thread riêng, hệ thống sẽ hết tài nguyên rất nhanh — đây chính là lý do .NET không tạo thread mới cho mỗi request, mà dùng **Thread Pool**.

### 1.4. Task là gì

**Task** trong .NET không phải là một thread. Task là một đơn vị công việc trừu tượng, đại diện cho một thao tác có thể đang chạy, đã xong, hoặc sẽ xảy ra trong tương lai.

```csharp
Task<int> task = ComputeAsync();
```

`ComputeAsync()` không nhất thiết chạy trên một thread mới. Task Parallel Library (TPL) quyết định cách thực thi:

```text
- Task CPU-bound (Task.Run) → thường được thread pool mượn một thread để chạy.
- Task I/O-bound (gọi API, đọc file, query DB async) → trong lúc chờ I/O,
  KHÔNG có thread nào bị chiếm giữ. Thread được trả lại pool ngay lập tức.
```

Đây là điểm hay bị hiểu sai nhất: **await không đồng nghĩa với "có một thread đang đứng chờ"**. Với I/O-bound, không có thread nào bị block trong lúc chờ kết quả.

---

## 2. Thread Pool trong .NET Core

### 2.1. Cách hoạt động

.NET duy trì một tập hợp thread có sẵn (Thread Pool) dùng chung cho toàn bộ ứng dụng, thay vì tạo/hủy thread liên tục.

```text
Có việc cần chạy (Task.Run, xử lý callback I/O hoàn tất, timer...)
  → Thread Pool giao việc cho một thread rảnh.
  → Nếu không có thread rảnh, Thread Pool tạo thêm thread mới (có giới hạn tốc độ tăng).
  → Việc xong, thread được trả lại pool để dùng cho việc khác.
```

### 2.2. Thread Pool Starvation

Thread Pool có cơ chế tăng số thread dần dần (khoảng 1-2 thread mỗi giây khi cần), không tăng ngay lập tức. Nếu ứng dụng đột ngột cần rất nhiều thread cùng lúc (ví dụ do code block đồng bộ trong ngữ cảnh async), Thread Pool không kịp cung cấp đủ thread.

```text
Triệu chứng thread pool starvation:
- Request bắt đầu xử lý rất chậm dù CPU không cao.
- Độ trễ tăng đột biến theo từng đợt, không tăng dần đều.
- Số lượng "queued work item" trong thread pool tăng cao.
```

Đây là một trong những sự cố production khó chẩn đoán nhất vì CPU/RAM đều bình thường — vấn đề nằm ở số lượng thread khả dụng, không phải tài nguyên vật lý.

---

## 3. CPU-bound và I/O-bound

### 3.1. Khái niệm

```text
CPU-bound
→ Công việc tốn thời gian vì phải tính toán (nén ảnh, tính toán số học nặng,
   xử lý dữ liệu lớn trong bộ nhớ). Cần một thread thực sự "bận" trong lúc xử lý.

I/O-bound
→ Công việc tốn thời gian vì phải chờ (gọi HTTP, query database, đọc file,
   gọi message broker). Trong lúc chờ, CPU hoàn toàn rảnh.
```

Cách xử lý đúng cho từng loại hoàn toàn khác nhau, và đây là nguồn gốc của phần lớn lỗi thiết kế async trong .NET.

### 3.2. CPU-bound — dùng `Task.Run`

```csharp
public async Task<byte[]> GenerateReportAsync(ReportRequest request)
{
    return await Task.Run(() => BuildHeavyReport(request));
}
```

`Task.Run` mượn một thread từ Thread Pool để chạy công việc tốn CPU, không block thread đang gọi request nếu công việc này chạy trong background job/queue thay vì trực tiếp trong request handler.

### 3.3. I/O-bound — dùng async I/O có sẵn, không cần `Task.Run`

```csharp
public async Task<Order> GetOrderAsync(int id)
{
    return await _db.Orders.FirstOrDefaultAsync(o => o.Id == id);
}
```

`FirstOrDefaultAsync` không tốn CPU trong lúc chờ SQL Server trả kết quả — nó dùng I/O completion port ở tầng hệ điều hành, không giữ thread nào cả. Bọc thêm `Task.Run` quanh một I/O call là dư thừa và có hại:

```csharp
// Sai — tốn một thread pool thread một cách vô ích
public async Task<Order> GetOrderAsync(int id)
{
    return await Task.Run(() =>
        _db.Orders.FirstOrDefaultAsync(o => o.Id == id).Result);
}
```

Đoạn trên vừa tốn thêm một thread để chạy `Task.Run`, vừa gọi `.Result` chặn đồng bộ bên trong — kết hợp tệ nhất có thể có.

---

## 4. Async/Await hoạt động bên dưới thế nào

### 4.1. Compiler sinh ra state machine

```csharp
public async Task<Order> GetOrderAsync(int id)
{
    var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == id);
    return order;
}
```

Compiler biến hàm này thành một state machine (dạng giống class ẩn implement `IAsyncStateMachine`). Khi gặp `await`, nếu tác vụ chưa hoàn tất, hàm **trả quyền điều khiển lại cho caller ngay lập tức**, không giữ thread lại để chờ. Khi tác vụ hoàn tất (callback từ I/O completion), phần code còn lại sau `await` được tiếp tục chạy — có thể trên một thread pool thread khác với thread ban đầu.

### 4.2. `await` không block thread

```text
Gọi await trên một Task I/O-bound:
  1. Thread hiện tại bắt đầu thao tác I/O (ví dụ gửi query tới SQL Server).
  2. Thread được trả về Thread Pool ngay, có thể đi phục vụ request khác.
  3. Khi I/O hoàn tất, một thread pool thread (có thể khác) tiếp tục chạy phần code sau await.
```

Đây là lý do một API ASP.NET Core dùng async đúng cách có thể phục vụ hàng nghìn request đồng thời chỉ với vài chục thread — vì phần lớn thời gian request đang "chờ I/O", không chiếm thread nào cả.

### 4.3. Vì sao `.Result` / `.Wait()` gây deadlock

Trong các ứng dụng có `SynchronizationContext` (ứng dụng UI như WPF/WinForms, hoặc ASP.NET classic dùng `HttpContext`-bound context), gọi `.Result` đồng bộ trên một Task async có thể gây deadlock kinh điển:

```csharp
// Nguy hiểm trong ngữ cảnh có SynchronizationContext
public ActionResult Get()
{
    var order = GetOrderAsync(1).Result;   // block thread hiện tại
    return View(order);
}

public async Task<Order> GetOrderAsync(int id)
{
    var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == id);
    // phần code này cần chạy lại trên SynchronizationContext ban đầu
    return order;
}
```

```text
Bước 1: Thread A gọi .Result, bị block, đang giữ SynchronizationContext.
Bước 2: I/O hoàn tất, phần code sau await cần quay lại đúng context đó để chạy tiếp.
Bước 3: Context đó đang bị Thread A chiếm giữ (đang block ở .Result).
Bước 4: Hai bên chờ nhau mãi mãi → deadlock.
```

ASP.NET Core (khác với ASP.NET classic) mặc định **không có SynchronizationContext** cho request pipeline, nên kịch bản deadlock kinh điển này ít xảy ra hơn. Nhưng `.Result`/`.Wait()` vẫn nguy hiểm vì lý do khác: nó **chiếm giữ một thread pool thread trong lúc chờ**, góp phần trực tiếp gây thread pool starvation khi tải cao.

Rule thực tế:

```text
Không dùng .Result / .Wait() trên Task trong code async.
Dùng await xuyên suốt từ đầu đến cuối chuỗi gọi ("async all the way").
```

### 4.4. `ConfigureAwait(false)`

```csharp
var data = await httpClient.GetStringAsync(url).ConfigureAwait(false);
```

`ConfigureAwait(false)` báo cho runtime biết: phần code sau `await` không cần quay lại đúng `SynchronizationContext` ban đầu, có thể tiếp tục trên bất kỳ thread pool thread nào. Với thư viện dùng chung (class library không phụ thuộc UI/HttpContext), đây là thực hành tốt để giảm rủi ro deadlock và giảm chi phí chuyển context. Với code ASP.NET Core hiện đại (không có SynchronizationContext theo mặc định), tác dụng ít quan trọng hơn nhưng vẫn là thói quen tốt khi viết thư viện dùng lại được ở nhiều loại ứng dụng khác nhau.

---

## 5. Kết hợp nhiều Task

### 5.1. `Task.WhenAll` — chạy đồng thời nhiều I/O-bound

```csharp
var customerTask = _customerApi.GetAsync(customerId);
var ordersTask = _orderApi.GetOrdersAsync(customerId);
var pointsTask = _loyaltyApi.GetPointsAsync(customerId);

await Task.WhenAll(customerTask, ordersTask, pointsTask);

var result = new CustomerDetailVm
{
    Customer = customerTask.Result,
    Orders = ordersTask.Result,
    Points = pointsTask.Result
};
```

Ba lời gọi API độc lập chạy đồng thời thay vì tuần tự, tổng thời gian chờ gần bằng lời gọi chậm nhất thay vì tổng cả ba. Đây là lợi ích rõ ràng nhất của I/O-bound concurrency.

So sánh với cách viết tuần tự (chậm hơn không cần thiết):

```csharp
var customer = await _customerApi.GetAsync(customerId);
var orders = await _orderApi.GetOrdersAsync(customerId);
var points = await _loyaltyApi.GetPointsAsync(customerId);
```

### 5.2. Exception handling với nhiều Task

```csharp
try
{
    await Task.WhenAll(customerTask, ordersTask, pointsTask);
}
catch
{
    var failed = new[] { customerTask, ordersTask, pointsTask }
        .Where(t => t.IsFaulted)
        .SelectMany(t => t.Exception!.InnerExceptions);

    foreach (var ex in failed)
    {
        _logger.LogError(ex, "Một trong các API con thất bại");
    }
}
```

`Task.WhenAll` chỉ ném ra exception đầu tiên qua `await`, nhưng tất cả exception thật sự nằm trong `Task.Exception` (kiểu `AggregateException`) của từng task con. Muốn biết chính xác task nào lỗi, cần kiểm tra từng task riêng thay vì chỉ bắt exception chung.

### 5.3. `CancellationToken`

```csharp
public async Task<Order> GetOrderAsync(int id, CancellationToken cancellationToken)
{
    return await _db.Orders
        .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
}
```

Khi client hủy request (đóng tab, timeout), ASP.NET Core tự động cancel `HttpContext.RequestAborted`. Nếu `CancellationToken` được truyền xuyên suốt tới tận câu query, hệ thống có thể dừng sớm một truy vấn không còn ai chờ kết quả — tiết kiệm tài nguyên DB/CPU thay vì xử lý xong rồi vứt bỏ.

---

## 6. Parallel vs Concurrent

Hai khái niệm dễ nhầm:

```text
Concurrency (đồng thời)
→ Nhiều công việc "đang tiến triển" trong cùng khoảng thời gian,
  nhưng không nhất thiết chạy cùng lúc trên nhiều lõi CPU.
  Task.WhenAll cho I/O-bound là concurrency: nhiều request cùng "đang chờ",
  nhưng tại một thời điểm CPU có thể không làm gì cả.

Parallelism (song song thật)
→ Nhiều công việc chạy thật sự cùng lúc trên nhiều lõi CPU.
  Dùng cho CPU-bound cần chia nhỏ để tận dụng nhiều core.
```

Ví dụ `Parallel.ForEach` cho công việc CPU-bound có thể chia nhỏ:

```csharp
Parallel.ForEach(orders, order =>
{
    RecalculateOrderTotal(order); // thuần tính toán, không I/O
});
```

Dùng `Parallel.ForEach` cho một vòng lặp gọi API là sai hướng — vì bản chất công việc là I/O-bound, `Task.WhenAll` mới là công cụ phù hợp, không cần chiếm nhiều CPU core.

---

## 7. Case Studies

### 7.1. Case Study 1 — Request bị treo do gọi `.Result` trong tầng thấp hơn

#### Bối cảnh

```text
Một thư viện dùng chung (được cả Console app và Web API cùng tham chiếu)
có hàm đồng bộ gọi ra async API bên trong:

public User GetCurrentUser()
{
    return _userApi.GetCurrentUserAsync().Result;
}
```

Console app dùng bình thường vì không có `SynchronizationContext`. Nhưng thư viện này sau đó được dùng lại trong một ASP.NET application cũ (có `SynchronizationContext` gắn với request) — request bắt đầu bị treo ngẫu nhiên, timeout sau 30 giây, không có exception rõ ràng trong log.

#### Nguyên nhân gốc

```text
Thread xử lý request bị block bởi .Result.
Context của request bị thread đó giữ.
Phần code bên trong GetCurrentUserAsync (sau await) cần đúng context đó để tiếp tục chạy.
Hai bên chờ nhau vô thời hạn.
```

#### Cách khắc phục

```csharp
public Task<User> GetCurrentUserAsync()
{
    return _userApi.GetCurrentUserAsync();
}
```

Loại bỏ hoàn toàn `.Result`/`.Wait()` khỏi thư viện dùng chung, để caller tự quyết định await hay không. Nguyên tắc "async all the way" áp dụng đặc biệt nghiêm ngặt cho code thư viện, vì không kiểm soát được ngữ cảnh nơi nó sẽ được gọi.

### 7.2. Case Study 2 — Thread Pool Starvation khi tải cao

#### Bối cảnh

```text
API xử lý upload file, bên trong gọi một thư viện xử lý ảnh chỉ có API đồng bộ:

public async Task<byte[]> ResizeImageAsync(byte[] image)
{
    return await Task.Run(() => _legacyImageLib.Resize(image));
}
```

Ở tải bình thường (vài chục request/giây) mọi thứ hoạt động tốt. Khi tải tăng lên vài trăm request/giây, độ trễ tăng vọt dù CPU chỉ ở mức 40-50%.
```

#### Nguyên nhân gốc

```text
Mỗi request chiếm một thread pool thread suốt thời gian resize ảnh (CPU-bound thật sự,
Task.Run là hợp lý ở đây). Nhưng vì hệ thống còn có nhiều async I/O khác
(gọi DB, gọi API khác) cũng cần thread pool thread để tiếp tục chạy sau await,
số lượng thread cần dùng đồng thời vượt quá khả năng Thread Pool tăng kịp.

Thread Pool tăng thread rất chậm (khoảng 1-2 thread/giây),
trong khi lượng request tăng đột ngột theo giờ cao điểm.
```

#### Cách khắc phục

```text
- Tăng MinThreads của Thread Pool khi biết trước tải cao (ThreadPool.SetMinThreads),
  giúp Thread Pool có sẵn nhiều thread ngay từ đầu thay vì tăng dần.
- Cân nhắc đưa việc resize ảnh sang một worker service riêng, xử lý qua queue,
  thay vì chiếm thread pool của chính API đang phục vụ request khác.
- Theo dõi chỉ số ThreadPool queue length qua dotnet-counters để phát hiện sớm,
  vì CPU/RAM bình thường không phản ánh được vấn đề này.
```

### 7.3. Case Study 3 — Công việc CPU nặng chặn toàn bộ throughput của API

#### Bối cảnh

```text
Endpoint xuất báo cáo Excel chạy trực tiếp trong request handler:

[HttpGet("reports/export")]
public async Task<IActionResult> Export()
{
    var data = await _db.Orders.ToListAsync();
    var excelBytes = BuildExcelReport(data); // tính toán nặng, đồng bộ, mất 5-10 giây
    return File(excelBytes, "application/vnd.ms-excel");
}
```

Khi vài người dùng cùng export báo cáo lớn, toàn bộ API — kể cả các endpoint nhẹ khác — đều chậm hẳn lại.
```

#### Nguyên nhân gốc

```text
BuildExcelReport chạy đồng bộ ngay trên thread đang phục vụ request (CPU-bound
nhưng không được tách ra). Vài request export cùng lúc chiếm hết số CPU core sẵn có,
khiến các request khác (dù nhẹ) phải xếp hàng chờ CPU.
```

#### Cách khắc phục

```text
Với tác vụ CPU nặng và có thể chạy lâu, không nên xử lý đồng bộ trong request:

- Đưa việc export vào hàng đợi (background job/queue), trả về ngay một "reportId".
- Client poll hoặc nhận thông báo khi báo cáo sẵn sàng, tải file sau.
- Nếu bắt buộc xử lý ngay trong request, giới hạn số lượng export chạy đồng thời
  bằng SemaphoreSlim để tránh chiếm hết CPU cùng lúc:

private static readonly SemaphoreSlim _exportLimiter = new(2);

await _exportLimiter.WaitAsync();
try
{
    var excelBytes = await Task.Run(() => BuildExcelReport(data));
    return File(excelBytes, "application/vnd.ms-excel");
}
finally
{
    _exportLimiter.Release();
}
```

---

## 8. Checklist review code async/Task

```text
1. Có chỗ nào gọi .Result hoặc .Wait() trên Task không?
2. Có Task.Run bọc quanh một async I/O call một cách dư thừa không?
3. Công việc CPU-bound có đang chạy trực tiếp trong request handler mà không giới hạn không?
4. Nhiều lời gọi API/DB độc lập có đang chạy tuần tự thay vì Task.WhenAll không?
5. CancellationToken có được truyền xuyên suốt từ controller xuống tầng thấp nhất không?
6. Exception từ Task.WhenAll có được kiểm tra đầy đủ theo từng task con không?
7. Thư viện dùng chung có lỡ dùng .Result/.Wait() khiến caller khác gặp deadlock không?
8. Có dấu hiệu thread pool starvation (độ trễ tăng vọt dù CPU/RAM bình thường) không?
```

---

## 9. Tóm tắt và lộ trình học tiếp

### 9.1. Tóm tắt nhanh

```text
Process → vùng nhớ độc lập, do hệ điều hành quản lý.
Thread → đơn vị thực thi bên trong process, chia sẻ chung heap, tốn tài nguyên khi tạo.
Task → đơn vị công việc trừu tượng của .NET, không nhất thiết gắn với một thread.

CPU-bound → cần thread thật sự bận tính toán, dùng Task.Run.
I/O-bound → không chiếm thread trong lúc chờ, dùng async I/O có sẵn.

await không block thread. .Result/.Wait() thì có, và có thể gây deadlock
hoặc thread pool starvation tùy ngữ cảnh.

Task.WhenAll → concurrency cho nhiều I/O-bound độc lập.
Parallel.ForEach → parallelism thật cho CPU-bound có thể chia nhỏ.
```

### 9.2. Cách nói ngắn gọn khi cần giải thích

> Task không phải là Thread. Task là một đơn vị công việc trừu tượng mà .NET quyết định cách thực thi: nếu là I/O-bound, await không chiếm giữ thread nào trong lúc chờ; nếu là CPU-bound, Task.Run mượn một thread từ Thread Pool để tính toán. Sai lầm phổ biến nhất là gọi .Result/.Wait() để "chờ cho xong", việc này chiếm giữ thread một cách không cần thiết và có thể gây deadlock hoặc làm cạn kiệt Thread Pool khi tải cao.

### 9.3. Lộ trình học tiếp

```text
1. Garbage Collector — cách .NET quản lý bộ nhớ cho các object được Task/Thread tạo ra.
2. Channel<T> và producer-consumer pattern trong .NET.
3. IAsyncEnumerable và streaming data.
4. Lock, SemaphoreSlim, và các cơ chế đồng bộ hóa khi nhiều thread chia sẻ state.
5. Background service (IHostedService) cho công việc chạy nền dài hạn.
```
