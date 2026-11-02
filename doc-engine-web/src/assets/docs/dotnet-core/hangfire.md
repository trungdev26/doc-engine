# Hangfire trong ASP.NET Core

Hangfire là framework background processing cho .NET: chạy một phần công việc tách rời khỏi luồng xử lý chính của HTTP request, để phần đó không làm chậm response trả về client.

Thay vì giữ công việc đó trong một thread hoặc object sống trong bộ nhớ của process hiện tại, Hangfire ghi lại mô tả công việc cần làm vào **persistent storage** — nơi dữ liệu vẫn còn nguyên sau khi process dừng hoặc restart. Một **worker**, tiến trình nền tách biệt với process xử lý request, đọc mô tả này từ storage và thực thi: ngay lập tức, sau một khoảng thời gian, hoặc theo lịch định kỳ.

Công việc được ghi lại theo cách đó gọi là một **background job**: một lời gọi method được lưu bền vững thay vì chỉ tồn tại trong bộ nhớ của process đang chạy. Vì vậy job không phụ thuộc vào process đã tạo ra nó — nếu API dừng ngay sau khi job được lưu thành công, một Hangfire Server khác dùng chung storage vẫn có thể tiếp tục xử lý.

> Cấu trúc chi tiết của một job (type, method, arguments, queue) và cách worker thực thi nó được trình bày ở phần [2. Runtime architecture và job lifecycle](#2-runtime-architecture-và-job-lifecycle) và [3. Job contract và execution](#3-job-contract-và-execution).

Các ví dụ trong chương sử dụng:

- ASP.NET Core trên .NET 6.
- MySQL làm persistent storage cho Hangfire.
- `Hangfire.MySqlStorage` làm storage provider kết nối Hangfire với MySQL.

Business case xuyên suốt là hệ thống đặt đồ ăn multi-tenant. Sau khi transaction tạo `DonHang` commit, ứng dụng cần gửi xác nhận cho khách hàng và đồng bộ dữ liệu của shop ở background.

## 1. Request boundary và background processing

Trong một HTTP request, không phải mọi công việc phát sinh từ business operation đều cần hoàn thành trước khi trả response cho client.

Ví dụ khi người dùng tạo một đơn hàng:

```text
POST /api/don-hang
```

Use case có thể gồm:

- Validate dữ liệu.
- Tạo `DonHang`.
- Trừ hoặc giữ tồn kho.
- Gửi email xác nhận.
- Đồng bộ đơn hàng sang hệ thống khác.
- Sinh hóa đơn PDF.
- Trả response cho client.

Câu hỏi quan trọng không phải là:

> Công việc nào chạy được bằng Hangfire?

Mà là:

> Công việc nào bắt buộc phải hoàn thành trước khi HTTP request được coi là thành công?

Đó chính là **request boundary**.

### 1.1. Synchronous boundary

Những thao tác quyết định trực tiếp kết quả của request thường nằm trong synchronous boundary.

Ví dụ:

```text
Client
  ↓
POST /api/don-hang
  ↓
Validate
  ↓
Create DonHang
  ↓
Reserve stock
  ↓
COMMIT
  ↓
201 Created
```

Nếu `DonHang` chưa được tạo hoặc tồn kho không thể reserve, API chưa thể trả về trạng thái thành công. Các thao tác này thuộc business operation mà client đang yêu cầu thực hiện.

Ngược lại, việc gửi email xác nhận thường không quyết định đơn hàng có được tạo thành công hay không.

```text
Create DonHang     : bắt buộc
Reserve stock      : bắt buộc
Send email         : có thể thực hiện sau
Generate PDF       : có thể thực hiện sau
Sync external CRM  : có thể thực hiện sau
```

Điểm cần phân biệt:

```text
Business operation hoàn thành
        ≠
Mọi side effect liên quan đều đã hoàn thành
```

### 1.2. Vấn đề khi giữ mọi thứ trong HTTP request

Giả sử toàn bộ công việc được thực hiện đồng bộ:

```text
POST /api/don-hang
  ↓
Create DonHang              100 ms
  ↓
Reserve stock               150 ms
  ↓
Call Email Provider         2 s
  ↓
Call External CRM           4 s
  ↓
Generate PDF                3 s
  ↓
Response
```

Thời gian phản hồi của endpoint lúc này gần bằng tổng thời gian của tất cả dependency:

```text
Request latency
≈
Business processing
+ Email latency
+ CRM latency
+ PDF generation
```

Một dependency chậm sẽ kéo toàn bộ request chậm theo.

Ví dụ CRM timeout sau khi `DonHang` đã commit:

```text
DonHang đã COMMIT
        ↓
CRM timeout
        ↓
API trả 500 / 504
```

Client có thể hiểu rằng thao tác tạo đơn hàng đã thất bại, trong khi `DonHang` thực tế đã tồn tại trong database.

Đây là failure mode khó xử lý vì **technical result của HTTP request không còn phản ánh chính xác business state**.

### 1.3. Background processing thay đổi boundary như thế nào?

Thay vì yêu cầu mọi side effect phải hoàn thành trong request, hệ thống chỉ hoàn tất phần business bắt buộc rồi lưu lại intent cho công việc còn lại.

Ví dụ:

```text
Client
  ↓
POST /api/don-hang
  ↓
Create DonHang
  ↓
Reserve stock
  ↓
COMMIT
  ↓
Persist background job
  ↓
201 Created
```

Sau đó worker xử lý phần còn lại:

```text
Hangfire Worker
  ↓
Send confirmation email
  ↓
Sync external system
```

Có thể hiểu trách nhiệm được tách thành hai phần:

- HTTP request: chấp nhận và hoàn tất phần business bắt buộc.
- Background worker: thực thi các công việc có thể xử lý độc lập sau đó.

```text
                HTTP Request
                     │
                     ▼
            Business transaction
                     │
                  COMMIT
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
   Return response        Background work
                               │
                               ▼
                         Hangfire Worker
```

### 1.4. Acceptance và execution

Đây là một distinction quan trọng khi sử dụng Hangfire.

**Acceptance** nghĩa là hệ thống đã chấp nhận trách nhiệm xử lý công việc.

Ví dụ:

```text
DonHang đã được tạo
+
job gửi email đã được persist
```

**Execution** nghĩa là công việc thực tế đã được worker xử lý xong.

Ví dụ:

```text
email đã được provider gửi thành công
```

Hai thời điểm này khác nhau:

```text
t0  DonHang commit
t1  Background job persisted
t2  API trả 201 Created
t3  Worker fetch job
t4  Email provider được gọi
t5  Job Succeeded
```

HTTP client thường chỉ cần biết tới mốc `t2`, trong khi Hangfire tiếp tục quản lý các mốc từ `t3` tới `t5`.

Vì vậy cần nhớ:

```text
Enqueue thành công
        ≠
Job đã chạy thành công
```

và:

```text
Job Succeeded
        ≠
Business side effect chắc chắn xảy ra exactly-once
```

Các vấn đề này sẽ được phân tích sâu hơn ở phần Delivery semantics và correctness.

### 1.5. Khi nào một công việc phù hợp để chạy background?

Một công việc thường phù hợp để đưa ra background khi có một hoặc nhiều đặc điểm:

- Không cần hoàn thành trước khi trả HTTP response.
- Có thời gian xử lý tương đối dài.
- Phụ thuộc external system có latency hoặc failure mode riêng.
- Có thể retry độc lập.
- Có thể được xử lý sau mà không làm thay đổi kết quả business đã commit.
- Cần tách workload khỏi API process.

Các ví dụ phổ biến:

- Gửi email hoặc SMS.
- Sinh PDF hoặc Excel.
- Đồng bộ dữ liệu sang hệ thống ngoài.
- Xử lý hoặc resize file.
- Import dữ liệu lớn.
- Generate report.
- Cleanup dữ liệu.
- Recurring processing.

Ngược lại, không nên đưa một thao tác ra background chỉ vì nó chạy lâu.

Nếu kết quả của thao tác đó quyết định trực tiếp việc business operation có được chấp nhận hay không, nó vẫn có thể thuộc synchronous boundary.

Ví dụ:

- Kiểm tra tồn kho.
- Reserve tồn kho.
- Validate hạn mức.
- Authorize payment.

Nếu business yêu cầu các bước này phải thành công trước khi tạo đơn, chúng không thể đơn giản được đẩy sang Hangfire.

### 1.6. Background processing không loại bỏ failure

Background processing không làm hệ thống hết lỗi. Nó chỉ **di chuyển failure boundary**.

Trước khi tách background:

```text
HTTP Request
    ↓
Email lỗi
    ↓
Request lỗi
```

Sau khi tách background:

```text
HTTP Request
    ↓
Job được persist
    ↓
Response thành công

Worker
    ↓
Email lỗi
    ↓
Retry / Failed / Reconciliation
```

Hệ thống trở nên responsive hơn, nhưng đổi lại phải xử lý các vấn đề mới:

- Retry.
- Duplicate execution.
- Worker crash.
- Unknown outcome.
- Idempotency.
- Monitoring.
- Reconciliation.
- Deployment compatibility.

Vì vậy background processing không đơn giản là "đưa code sang chạy async". Nó tạo ra một **execution model khác** với failure semantics riêng.

### 1.7. Ba boundary cần phân biệt

Khi thiết kế background processing, cần tách ba boundary:

```text
HTTP Request Boundary
        │
        ├─ Client phải chờ đến đâu?
        │
        ▼
Business Transaction Boundary
        │
        ├─ Những thay đổi nào phải atomic?
        │
        ▼
Background Execution Boundary
        │
        └─ Công việc nào có thể retry độc lập?
```

Ba boundary này không nhất thiết trùng nhau.

Ví dụ:

```text
HTTP Request
    │
    ├─ Create DonHang
    ├─ Reserve stock
    │
    └─ COMMIT          : Business transaction boundary
    │
    ├─ Persist job
    │
    └─ 201 Created     : HTTP request boundary
                         │
                         ▼
                    Send email
                         │
                    Retry nếu lỗi
                         │
                         └─ Background execution boundary
```

Câu hỏi đầu tiên khi thiết kế background processing nên là:

> **Business operation thực sự kết thúc ở đâu?**

Sau khi xác định được boundary này, ta mới quyết định phần công việc nào nên được giao cho Hangfire.


## 2. Runtime architecture và job lifecycle

Xác định được ranh giới nào cần đẩy sang background (mục 1) mới chỉ là quyết định thiết kế. Câu hỏi kế tiếp là cơ chế: một khi công việc được giao cho Hangfire, nó chạy qua những thành phần nào, và trải qua vòng đời gì từ lúc tạo ra đến khi hoàn tất hoặc retry?

Hangfire gồm bốn vai trò: Client, Storage, Server và Dashboard.

```mermaid
flowchart LR
    Client[Hangfire Client] -->|serialize và persist| Storage[(MySQL Storage)]
    Storage -->|poll và fetch| Server[Hangfire Server]
    Server --> Workers[Workers]
    Workers -->|resolve DI và invoke| Method[Job method]
    Workers -->|state transition| Storage
    Dashboard -->|Monitoring API| Storage
```

### Client

Client là thành phần trong code của bạn gọi `Enqueue`, `Schedule` hoặc `RecurringJob.AddOrUpdate` để tạo job — bản thân Client không thực thi business method. Khi được gọi, Client nhận biểu thức mô tả lời gọi method (gọi là **invocation**), chuyển invocation đó thành dữ liệu lưu trữ được (**serialize**), rồi ghi vào storage.

```csharp
var jobId = backgroundJobClient.Enqueue<IGuiXacNhanDonHangJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));
```

Expression trên tạo logical payload:

```text
Type      = IGuiXacNhanDonHangJob
Method    = ExecuteAsync
Arguments = [donHangId, CancellationToken placeholder]
Queue     = default
CreatedAt = enqueue time
```

DI scope, `HttpContext`, connection và transaction của HTTP request không được serialize. Worker tạo execution scope mới tại thời điểm chạy.

### Storage

Storage là nguồn sự thật kỹ thuật cho payload, state history, queue, recurring schedule, server heartbeat và monitoring counters. Persistence cho phép job tồn tại sau process restart.

Storage không thay thế business database. `Succeeded` chỉ phản ánh kết quả thực thi method theo góc nhìn của Hangfire; trạng thái thực sự của `DonHang` vẫn do business database quản lý.

### Server và worker

Hangfire Server là tập background process chạy trong một .NET process.

| Thành phần | Trách nhiệm |
| --- | --- |
| Worker | Fetch và thực thi job từ queue. |
| Schedule poller | Chuyển delayed hoặc retry job đã đến hạn sang queue. |
| Recurring scheduler | Tạo fire-and-forget job từ recurring definition. |
| Heartbeat process | Cập nhật trạng thái sống của server trong storage. |
| Expiration manager | Dọn dữ liệu hết retention. |
| Counter aggregator | Tổng hợp counter phục vụ monitoring. |

`WorkerCount` là số execution slot của một server, không phải tổng số background process.

### Dashboard

Dashboard là projection vận hành đọc qua Monitoring API của storage. Dashboard không tham gia execution path và không bắt buộc để job chạy.

### Job lifecycle tổng quan

Một job đi qua technical lifecycle độc lập với business lifecycle của dữ liệu nghiệp vụ:

```mermaid
flowchart TD
    A[Create invocation] --> B[Persist]
    B --> C{Immediate hay delayed?}
    C -->|Immediate| D[Enqueued]
    C -->|Delayed| E[Scheduled]
    E -->|đến hạn| D
    D --> F[Fetch]
    F --> G[Processing]
    G --> H{Kết quả execution}
    H -->|Success| I[Succeeded]
    H -->|Exception còn retry| J[Scheduled retry]
    J --> D
    H -->|Hết retry / permanent| K[Failed]
```

Một **job** có thể có nhiều **execution attempts**. Vì vậy:

```text
1 Job ≠ 1 Execution
```

Retry, worker crash hoặc recovery đều có thể tạo attempt mới cho cùng logical job.

#### Những boundary không được nhầm lẫn

```text
Hangfire job state         ≠ Business state
Hangfire storage           ≠ Business database
Hangfire transaction       ≠ Business transaction
Hangfire distributed lock  ≠ Business aggregate lock
CancellationToken          ≠ Business cancellation
Succeeded                  ≠ Exactly-once side effect
```

Những distinction này là nền tảng để thiết kế correctness. Hangfire chịu trách nhiệm durable execution; business correctness vẫn phải được bảo vệ tại database nghiệp vụ, external provider hoặc application/domain logic. Ý nghĩa của `distributed lock` và `exactly-once` được giải thích chi tiết ở mục 5 (Delivery semantics và correctness); ở đây chỉ cần nắm nguyên tắc chung — cơ chế kỹ thuật của Hangfire không tự động bảo vệ business invariant tương ứng.

## 3. Job contract và execution

Sau khi hiểu runtime, bước tiếp theo là thiết kế contract của job: truyền dữ liệu gì, worker khôi phục execution context ra sao và thay đổi code thế nào để queued job vẫn tương thích.

### Job method

Một job Hangfire là một class implement một interface, với method chứa logic cần thực thi. Interface cho job gửi xác nhận đơn hàng:

```csharp
public interface IGuiXacNhanDonHangJob
{
    Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken);
}
```

Argument chứa business identifier thay vì entity snapshot. Worker đọc trạng thái mới nhất tại execution time và xử lý record đã xóa hoặc state đã thay đổi.

```csharp
public sealed class GuiXacNhanDonHangJob : IGuiXacNhanDonHangJob
{
    private readonly IDonHangRepository _repository;
    private readonly IEmailClient _emailClient;

    public GuiXacNhanDonHangJob(
        IDonHangRepository repository,
        IEmailClient emailClient)
    {
        _repository = repository;
        _emailClient = emailClient;
    }

    [Queue("notification")]
    [AutomaticRetry(Attempts = 5)]
    public async Task ExecuteAsync(
        Guid donHangId,
        CancellationToken cancellationToken)
    {
        var donHang = await _repository.GetRequiredAsync(
            donHangId,
            cancellationToken);

        if (donHang.DaGuiXacNhan)
            return;

        await _emailClient.SendOrderConfirmationAsync(
            donHang.Email,
            donHang,
            $"gui-xac-nhan:{donHang.Id}",
            cancellationToken);

        donHang.DanhDauDaGuiXacNhan();
        await _repository.SaveChangesAsync(cancellationToken);
    }
}
```

Tham số thứ ba truyền cho `SendOrderConfirmationAsync` là một **idempotency key** — chuỗi định danh duy nhất cho lần gửi này. Nếu job bị chạy lại (retry, worker crash), provider có thể dùng key này để nhận diện và bỏ qua request trùng thay vì gửi email lần nữa. Cơ chế và lý do đầy đủ được giải thích ở mục 5 (Delivery semantics và correctness).

Hangfire tạo DI scope cho mỗi execution. Scoped dependency như `DbContext` được resolve trong scope của job và dispose sau execution.

### Job types

Hai khái niệm thường bị nhầm:

```text
Delayed/Scheduled = một execution duy nhất trong tương lai
Recurring         = một schedule definition tạo nhiều executions
```


| Loại | Cơ chế | Use case |
| --- | --- | --- |
| Fire-and-forget | Enqueue một lần khi có worker | Gửi xác nhận đơn hàng. |
| Delayed | Chờ due time trong scheduled set | Hủy reservation hết hạn. |
| Recurring | Cron definition tạo fire-and-forget job | Đồng bộ menu định kỳ. |
| Continuation | Phụ thuộc state cuối của job cha | Gửi notification sau khi PDF hoàn tất. |

```csharp
var jobId = backgroundJobClient.Enqueue<IGuiXacNhanDonHangJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));

backgroundJobClient.Schedule<IHuyGiuChoJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None),
    TimeSpan.FromMinutes(15));

RecurringJob.AddOrUpdate<IDongBoMenuJob>(
    $"sync-menu:{tenantId:N}:{shopId:N}",
    job => job.ExecuteAsync(tenantId, shopId, CancellationToken.None),
    "*/10 * * * *",
    new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
```

`CancellationToken.None` là placeholder trong expression. Hangfire thay argument này bằng execution token khi method được gọi.

Recurring ID chứa cả tenant và shop scope. Cấu trúc này ngăn recurring definition của một shop ghi đè definition của shop khác.

### Fire-and-forget lifecycle

Fire-and-forget yêu cầu job được thực thi sớm nhất khi worker có capacity. Loại job này không cung cấp **exactly-once guarantee** — nghĩa là Hangfire không đảm bảo job chỉ tạo đúng một lần side effect; job có thể chạy lại và tạo hiệu ứng trùng nếu method không idempotent (xem mục 5).

Producer nhận `jobId` ngay sau storage commit. Worker có thể bắt đầu trước hoặc sau HTTP response, tùy thời điểm fetch và worker availability.

```text
t0  producer persist Job + Enqueued state
t1  Enqueue trả jobId
t2  worker fetch
t3  method bắt đầu
t4  method kết thúc
t5  Succeeded được persist
```

Client chỉ quan sát được mốc `t1`. Business API cần endpoint trạng thái riêng nếu client phải theo dõi kết quả nghiệp vụ; `jobId` không thay business identifier.

### Delayed job internals

Delayed job chưa nằm trong executable queue. Storage giữ job trong scheduled structure với score/due time. Schedule poller chuyển job đến hạn sang `Enqueued`.

```mermaid
flowchart LR
    Client --> Scheduled[(Scheduled set<br/>dueAt)]
    Scheduled -->|poller: dueAt <= now| Queue[(JobQueue)]
    Queue --> Worker
```

Độ trễ thực tế gồm scheduling interval, queue wait và worker availability:

```text
actualStartAt - requestedDueAt
  = schedulePollingDelay
  + queueDelay
  + workerContention
```

Delayed job không phù hợp với hard realtime deadline. Business deadline cần persistence, late-execution policy và **reconciliation** riêng — bước đối soát trạng thái kỹ thuật của job với trạng thái thực tế ở business database hoặc external provider khi không chắc job đã chạy đúng hạn hay chưa.

### Recurring job internals

Recurring job là một schedule definition, không phải execution record.

Definition chứa recurring ID, cron expression, timezone, queue và invocation metadata. Tại mỗi due time, scheduler tạo một fire-and-forget job độc lập với `jobId` riêng.

```text
Recurring definition: sync-menu:T1:S1
  -> execution job 1001 at 10:00
  -> execution job 1048 at 10:10
  -> execution job 1102 at 10:20
```

`AddOrUpdate` là upsert theo recurring ID. ID scope sai tạo configuration collision:

```text
sync-menu              -> tenant sau ghi đè tenant trước
sync-menu:{tenantId}   -> tách tenant, chưa tách shop
sync-menu:{tenantId}:{shopId} -> đúng scope tenant và shop
```

Timezone là một phần của schedule contract. Nếu business schedule dựa trên giờ địa phương, timezone phải được cấu hình tường minh thay vì phụ thuộc vào timezone của machine. Hệ thống hoạt động ở vùng có daylight saving cần thêm policy cho local time bị lặp hoặc bị bỏ qua.

Nhiều replicas có thể cùng chạy recurring scheduler. Các schedulers phối hợp qua shared storage để xử lý recurring definition ở cấp cluster; mục tiêu là không tạo một execution riêng chỉ vì có thêm replica.

Coordination của scheduler không loại bỏ duplicate execution do worker crash hoặc retry. Job method vẫn cần **idempotency** — khả năng chạy lại nhiều lần mà chỉ tạo đúng một hiệu ứng nghiệp vụ — để bảo vệ business side effect.

### Continuation semantics

Continuation liên kết việc tạo job con với final state của job cha.

```csharp
var taoPdfJobId = backgroundJobClient.Enqueue<ITaoHoaDonPdfJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));

backgroundJobClient.ContinueJobWith<IGuiHoaDonJob>(
    taoPdfJobId,
    job => job.ExecuteAsync(donHangId, CancellationToken.None),
    JobContinuationOptions.OnlyOnSucceededState);
```

`OnlyOnSucceededState` phù hợp khi job con yêu cầu output hợp lệ từ job cha. `OnAnyFinishedState` phù hợp cho cleanup hoặc notification tổng quát.

Continuation biểu diễn dependency ngắn giữa hai jobs.

Workflow nhiều nhánh, có compensation, manual approval hoặc state tồn tại nhiều ngày cần business workflow state. Chuỗi continuation trong technical storage không biểu diễn đầy đủ các yêu cầu đó.

### Serialization và Job Activator

#### Invocation compatibility

Hangfire serialize type identity, method identity, parameter types và argument values. Payload đang chờ tạo một compatibility contract giữa producer version và worker version.

Các thay đổi có blast radius tới queued jobs:

- Đổi namespace hoặc assembly của job type.
- Đổi interface implementation registration.
- Đổi method name hoặc parameter list.
- Đổi argument DTO làm JSON cũ không deserialize.
- Xóa constructor dependency khỏi DI hoặc thiếu registration mới.

Rolling deployment an toàn dùng expand-and-contract:

```text
worker V2 hiểu payload V1 và V2
  -> producer bắt đầu ghi V2
  -> V1 queue, scheduled jobs và retries drain
  -> worker loại support V1
```

#### Argument design

Argument là durable message contract, không phải tiện ích truyền object giữa hai method.

| Argument | Đặc tính |
| --- | --- |
| `donHangId` | Nhỏ, ổn định, worker đọc state mới nhất. |
| `tenantId`, `shopId` | Khôi phục execution scope khi không thể suy ra an toàn từ aggregate ID. |
| Entity graph | Payload lớn, stale state, dễ vỡ serialization. |
| Access token | Secret bị persist và hết hạn trước execution. |
| Stream/connection/DbContext | Không serialize được và gắn với process cũ. |

Payload size ảnh hưởng storage growth, lượng dữ liệu xuất hiện trên Dashboard và serialization latency.

Business snapshot chỉ được truyền khi immutable snapshot là requirement của use case. Contract khi đó sử dụng DTO có version thay vì domain entity.

#### DI scope

Job Activator tạo scope cho từng execution. Job instance và scoped dependencies sống trong scope đó:

```text
Execution attempt
  -> IServiceScope
      -> Job instance
      -> DbContext
      -> repositories
      -> scoped tenant context
  -> dispose scope
```

Retry attempt mới tạo scope mới. Change tracker, transaction và scoped cache từ attempt trước không tồn tại. Singleton không được giữ scoped dependency hoặc mutable tenant state.

### Job filters

Hangfire filters là extension point cho các concern cắt ngang job pipeline. Tùy vị trí trong lifecycle, filter có thể can thiệp vào creation, execution, state election hoặc thời điểm state được apply.

Các use case phù hợp:

- Logging và metrics.
- Context enrichment.
- Automatic retry.
- Custom technical state policy.
- Auditing ở infrastructure layer.

`AutomaticRetryAttribute` là ví dụ điển hình của state filter: exception tạo `FailedState` candidate, sau đó filter có thể chuyển candidate thành `ScheduledState` nếu vẫn còn retry attempt.

Business invariant không nên chỉ tồn tại trong filter. Quy tắc như “đơn đã hủy không được gửi xác nhận” phải vẫn đúng khi application service được gọi ngoài Hangfire pipeline.

## 4. Persistence model và state machine trên MySQL

Mục 2 và 3 mô tả job ở góc nhìn logic: state, filter, DI scope. Nhưng để một job sống sót qua process restart — đúng như lời hứa ở đầu tài liệu — tất cả những khái niệm logic đó phải được lưu lại ở một nơi bền vững. Đó là vai trò của storage.

Hangfire Core định nghĩa storage abstraction; `Hangfire.MySqlStorage` hiện thực abstraction đó bằng bảng, transaction, polling và distributed coordination trên MySQL.

Khi đọc phần này cần tách hai góc nhìn:

- **Logical model:** job đang ở state nào, thuộc queue nào và worker nào đang xử lý.
- **Physical storage:** provider hiện thực các khái niệm đó bằng bảng, transaction, index, polling và coordination như thế nào.

Các sơ đồ dưới đây mô tả logical responsibility. Chi tiết physical schema có thể thay đổi theo provider và version.

### Logical schema

Storage lưu một job qua nhiều bảng liên quan tới nhau, không phải một dòng đơn lẻ. Sơ đồ dưới đây thể hiện quan hệ logic giữa các bảng đó:

```mermaid
erDiagram
    JOB ||--o{ STATE : "state history"
    JOB ||--o{ JOB_PARAMETER : "metadata"
    JOB ||--o| JOB_QUEUE : "queue membership"
    SERVER {
        string id
        datetime lastHeartbeat
        string data
    }
    SET {
        string key
        string value
        float score
    }
    HASH {
        string key
        string field
        string value
    }
    COUNTER {
        string key
        int value
    }
```

Sơ đồ mô tả logical schema và quan hệ trách nhiệm. Physical schema phụ thuộc vào storage provider, package version và `TablesPrefix`.

| Nhóm bảng | Nội dung | Vai trò vận hành |
| --- | --- | --- |
| `Job` | Invocation payload, arguments, creation time, current state | Truy xuất job và state hiện tại. |
| `State` | State history, reason và state data | Phân tích attempt, exception và retry. |
| `JobParameter` | Metadata phụ gắn với job | Phục vụ filter và internal components. |
| `JobQueue` | Queue item và fetch metadata | Điều phối worker nhận job. |
| `Server` | Identity, heartbeat, queues và worker metadata | Phát hiện server đang hoạt động. |
| `Set`, `Hash`, `List` | Cấu trúc dữ liệu tổng quát | Scheduled set, recurring definition và coordination data. |
| `Counter`, `AggregatedCounter` | Monitoring counters | Cung cấp số liệu cho Dashboard. |
| `Schema` | Storage schema version | Kiểm soát compatibility của provider. |

Business code không truy vấn hoặc cập nhật trực tiếp các bảng này. Thao tác job đi qua Hangfire Client, Monitoring API hoặc Dashboard để giữ compatibility với provider.

### Enqueue transaction

Về mặt logic, fire-and-forget enqueue cần bảo đảm các thay đổi tương đương trong cùng storage transaction:

```text
BEGIN
  create Job
  create Enqueued State
  set current state = Enqueued
  publish queue item
COMMIT
```

`Enqueue` trả `jobId` sau khi storage chấp nhận transaction. Kết quả này xác nhận job đã được lưu, không xác nhận business method đã hoàn thành.

### State model

Current state phục vụ truy vấn nhanh; state history bảo toàn diễn tiến của job.

```mermaid
stateDiagram-v2
    [*] --> Enqueued
    Enqueued --> Processing: worker fetch
    Processing --> Succeeded: method returns
    Processing --> Failed: method throws
    Failed --> Scheduled: retry filter
    Scheduled --> Enqueued: due time
    Failed --> Deleted: state transition
    Succeeded --> [*]
```

Một job retry có thể có history:

```text
Enqueued
Processing  server=worker-a
Failed      TimeoutException
Scheduled   attempt=1
Enqueued
Processing  server=worker-b
Succeeded
```

`Failed` trong history không đồng nghĩa current state là `Failed`; retry filter có thể đã chuyển job sang `Scheduled`.

### State election và apply state

State transition trong Hangfire không chỉ là phép gán một chuỗi. Khi một execution kết thúc, Hangfire trước tiên tạo một **candidate state**; các state filter có thể thay đổi candidate này trước khi trạng thái cuối cùng được persist.

```mermaid
sequenceDiagram
    participant Worker
    participant Performer as Job Performer
    participant Filter as State Filters
    participant Storage

    Worker->>Performer: invoke job method
    Performer-->>Worker: exception
    Worker->>Filter: elect FailedState
    Filter-->>Worker: ScheduledState nếu còn retry
    Worker->>Storage: apply ScheduledState
    Storage-->>Worker: transition committed
```

`AutomaticRetryAttribute` tham gia state election.

Exception tạo một `FailedState` candidate. Khi vẫn còn retry attempt, filter thay candidate này bằng `ScheduledState`. Vì vậy current state sau transaction có thể là `Scheduled` thay vì `Failed`.

Cơ chế này giải thích ba hiện tượng vận hành:

- Dashboard có failed entry trong history trong khi current state là scheduled.
- Retry delay không giữ worker thread ở trạng thái sleep; worker slot được giải phóng sau khi scheduled state được ghi.
- Process restart không làm mất retry schedule vì due time nằm trong storage.

State filter là infrastructure extension point. Nó điều khiển technical state transition của job.

Business invariant như “đơn đã hủy không được gửi xác nhận” vẫn thuộc job, application hoặc domain logic. Invariant đó phải đúng cả khi use case được gọi ngoài Hangfire pipeline.

### Worker fetch loop

Worker thực hiện một vòng lặp logic:

```text
poll configured queues
  -> fetch queue item
  -> create Processing state
  -> deserialize invocation
  -> create DI scope
  -> activate job type
  -> invoke method
  -> elect and persist final state
  -> dispose scope
```

Fetch và `Processing` phục vụ hai mục tiêu khác nhau.

Fetch xác lập quyền xử lý tạm thời của một worker đối với queue item. State `Processing` ghi nhận execution attempt trong state history của job.

Process có thể dừng sau khi fetch nhưng trước khi ghi `Processing`.

Process cũng có thể dừng sau khi tạo side effect nhưng trước khi ghi final state. Đây là một **crash window** quan trọng: job có thể được recovery và chạy lại dù side effect trước đó đã thành công.

Trong cả hai trường hợp, storage chỉ biết execution chưa hoàn tất. Storage không có đủ dữ liệu để kết luận side effect đã xảy ra hay chưa.

### Server heartbeat và abandoned execution

Mỗi Hangfire Server định kỳ ghi heartbeat vào storage. Heartbeat chỉ cho biết Hangfire Server vẫn còn giao tiếp với storage; nó không chứng minh từng job bên trong server vẫn đang tiến triển bình thường.

```text
Server heartbeat mới + job Processing lâu
  -> job thực sự dài
  -> dependency bị treo
  -> code không quan sát cancellation

Server heartbeat cũ + nhiều job Processing
  -> process chết hoặc mất kết nối storage
  -> chờ recovery theo provider
```

Recovery tạo khả năng redelivery vì storage không có đủ bằng chứng để kết luận execution đã `Succeeded` hoặc `Failed`. Đây là nguồn gốc của at-least-once semantics.

### MySQL transaction và distributed coordination

Storage provider dùng MySQL transaction để giữ consistency giữa queue, job và state. Distributed coordination dùng shared database thay vì memory lock trong từng process.

Một in-memory `lock` chỉ serialize threads trong một replica:

```text
API A: lock object A
API B: lock object B
```

Hai object không có quan hệ với nhau. Multi-instance coordination phải dựa trên resource chung như row/transaction/lock primitive của MySQL provider.

Lock của Hangfire chỉ bảo vệ Hangfire resource. Business row có transaction và lock lifecycle riêng:

```text
Hangfire storage transaction
  -> fetch JobQueue
  -> write State

Business transaction
  -> update DonHang
  -> reserve TonKho
```

Hai transaction không atomic chỉ vì chúng cùng chạy trên MySQL hoặc cùng một physical server.

## 5. Delivery semantics và correctness

Mục 4 cho thấy Hangfire storage transaction và business transaction là hai transaction độc lập, và recovery có thể khiến một job được fetch lại nhiều lần. Hệ quả trực tiếp: job có thể chạy lại, side effect có thể rơi vào trạng thái không xác định, và retry chỉ an toàn khi idempotency boundary được thiết kế đúng.

### At-least-once execution

**At-least-once** nghĩa là Hangfire đảm bảo một job được chạy tối thiểu một lần, nhưng không đảm bảo đúng một lần — job có thể chạy lại và tạo side effect trùng lặp. Đối lập với nó là **exactly-once** (đúng một lần, không thiếu không trùng), một guarantee mà Hangfire không cung cấp.

Reliable dequeue ưu tiên không làm mất job. Job có thể chạy lại khi worker chết hoặc state cuối chưa được ghi.

```mermaid
sequenceDiagram
    participant W1 as Worker A
    participant Mail as Email Provider
    participant S as Hangfire Storage
    participant W2 as Worker B
    W1->>S: fetch, state = Processing
    W1->>Mail: send succeeds
    Note over W1: process dies before Succeeded
    S-->>S: recover fetched job
    W2->>S: fetch again
    W2->>Mail: duplicate without idempotency
```

Hangfire không cung cấp exactly-once side effect. Correctness boundary nằm tại business database hoặc external provider.

### Unknown outcome

Một timeout không luôn đồng nghĩa operation đã thất bại. Nếu external provider đã nhận request nhưng response bị mất, execution hiện tại không biết side effect đã xảy ra hay chưa.

```text
request sent
   ↓
provider xử lý thành công
   ↓
response mất / timeout
   ↓
worker nhận exception
```

Retry mù trong tình huống này có thể tạo duplicate side effect. Trước retry cần dựa vào idempotency key, provider lookup hoặc **reconciliation record** — bản ghi đối soát lưu lại kết quả thực tế từ business database hoặc external provider — để xác định logical outcome.

### Idempotency

Một thao tác là **idempotent** nếu gọi nhiều lần với cùng input tạo ra cùng kết quả logic như gọi một lần — các lần lặp lại không tạo thêm side effect mới. **Idempotency key** là giá trị định danh duy nhất cho một lần thực hiện thao tác đó, giúp provider hoặc hệ thống nhận diện và bỏ qua các lần gọi trùng.

Idempotency key cho email xác nhận:

```text
gui-xac-nhan:{donHangId}
```

Provider hỗ trợ idempotency key trả cùng logical result cho các request trùng key. Nếu provider không hỗ trợ, adapter sử dụng execution record với unique constraint trên `(tenantId, businessKey, operation)`.

```sql
CREATE TABLE JobExecution (
    id CHAR(36) NOT NULL,
    tenantId CHAR(36) NOT NULL,
    businessKey VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL,
    updatedAt DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_job_execution_scope
        (tenantId, businessKey, operation)
);
```

Retry phù hợp với transient failure như timeout, connection reset, HTTP 429 hoặc một số HTTP 5xx. Những lỗi này có khả năng biến mất mà không cần sửa input hoặc deploy code mới.

Validation error, missing configuration và malformed recipient là permanent failure. Lặp lại cùng input trong cùng điều kiện không làm kết quả thay đổi.

Retry làm business method có thể chạy nhiều lần. Vì vậy mọi mutation nằm trong retry boundary cần idempotency trước khi tăng số attempts.

### Retry policy và failure classification

Retry policy bắt đầu từ error taxonomy:

| Failure | Ví dụ | Policy |
| --- | --- | --- |
| Transient | timeout, connection reset, HTTP 429, temporary 5xx | Retry với backoff và giới hạn attempts. |
| Permanent input | email sai format, shop không tồn tại | Fail ngay; sửa dữ liệu hoặc bỏ job. |
| Permanent configuration | thiếu API key, route cấu hình sai | Fail và alert; retry tự động chỉ tạo noise. |
| Concurrency conflict | optimistic conflict, duplicate claim | Reload/re-evaluate hoặc coi operation đã hoàn tất. |
| Unknown outcome | timeout sau external request | Query provider/idempotency record trước retry. |

```csharp
[AutomaticRetry(
    Attempts = 5,
    DelaysInSeconds = new[] { 10, 30, 120, 300, 900 },
    OnAttemptsExceeded = AttemptsExceededAction.Fail)]
public Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken)
{
    // ...
}
```

Backoff giảm request amplification khi dependency lỗi diện rộng. Jitter cần được bổ sung ở layer phù hợp nếu nhiều jobs có cùng failure time và provider/filter hiện tại không tạo jitter.

### Retry boundary

Retry toàn method lặp lại mọi bước trước điểm lỗi:

```text
Attempt 1
  reserve stock        success
  create invoice       success
  send email           timeout

Attempt 2
  reserve stock        duplicate risk
  create invoice       duplicate risk
  send email           retry
```

Mỗi stage cần idempotency riêng hoặc workflow state ghi nhận stage đã hoàn tất.

Job chứa quá nhiều stages tạo retry boundary lớn: lỗi ở bước cuối khiến mọi bước trước được gọi lại. Ngược lại, tách mỗi câu lệnh thành một job riêng làm orchestration và state management phức tạp.

Job boundary phù hợp thường trùng với một business operation có outcome và idempotency key rõ ràng.

### Retry budget

Retry phải được đánh giá ở cấp toàn hệ thống, không chỉ ở cấp một job. Khi dependency lỗi diện rộng, số attempt có thể khuếch đại traffic:

```text
10.000 jobs × 5 attempts
→ tối đa 50.000 external calls
```

Retry budget cần xét đồng thời backlog, maximum attempts, backoff, worker concurrency, external rate limit và circuit/rate policy ở adapter layer.

### Poison job

Poison job lặp lại permanent failure trên mọi attempt. Dấu hiệu gồm cùng exception type/message, duration ngắn và attempts tăng đều.

Operational handling gồm:

1. Dừng automatic retry khi đã phân loại permanent.
2. Bảo toàn job ID, business key và failure reason.
3. Sửa configuration, code hoặc input source.
4. Retry có kiểm soát sau khi precondition đã thay đổi.
5. Reconciliation business state sau execution.

Delete technical job không rollback side effect hoặc thay đổi business state.

### Distributed lock và business concurrency

Distributed lock của storage phối hợp scheduler và server processes. Nó không khóa row `DonHang`, không chống oversell và không kết hợp business database với external API thành atomic transaction.

Stock reservation thuộc business database:

```sql
UPDATE TonKho
SET soLuong = soLuong - @soLuongDat
WHERE tenantId = @tenantId
  AND shopId = @shopId
  AND hangHoaId = @hangHoaId
  AND soLuong >= @soLuongDat;
```

`rowsAffected = 1` xác nhận reservation thành công. `rowsAffected = 0` biểu diễn conflict hoặc không đủ tồn theo use-case contract.

### Transactional Outbox

Business transaction và Hangfire storage transaction độc lập tạo lost-intent window:

```text
COMMIT DonHang
process crash
chưa enqueue GuiXacNhanDonHang
```

```mermaid
sequenceDiagram
    participant API
    participant DB as Business MySQL
    participant Dispatcher
    participant HF as Hangfire MySQL
    participant Worker
    API->>DB: INSERT DonHang + OutboxMessage
    DB-->>API: COMMIT
    Dispatcher->>DB: claim OutboxMessage
    Dispatcher->>HF: enqueue job
    Dispatcher->>DB: mark dispatched
    HF->>Worker: fetch job
```

Outbox loại bỏ lost-intent window nhưng không loại duplicate. Dispatcher vẫn có thể crash sau enqueue và trước `mark dispatched`; vì vậy consumer idempotency vẫn là yêu cầu độc lập.

```text
Outbox giải quyết: business đã commit nhưng enqueue intent không bị mất
Outbox không giải quyết: duplicate execution ở consumer
```

## 6. Concurrency control và multiple instances

Mục 5 xử lý correctness khi một job chạy lại nhiều lần theo thời gian (retry). Một trục khác của cùng vấn đề correctness là điều gì xảy ra khi nhiều job — hoặc nhiều instance của Hangfire Server — chạy cùng lúc. Concurrency vì vậy phải được nhìn ở cả hai cấp: số execution slot của worker, và quyền thay đổi business resource khi nhiều process cùng chạy.

### Worker concurrency

Tổng execution concurrency bằng tổng worker count của mọi active servers nghe cùng queues.

```text
3 replicas × 8 workers = tối đa 24 concurrent executions
```

Capacity model cho I/O-bound jobs:

```text
requiredConcurrency ≈ arrivalRate × averageDuration
```

Little's Law cho baseline sizing không thay load test. Connection pool, external rate limit, MySQL lock time và tail latency tạo giới hạn thấp hơn công thức CPU mặc định.

### Method-level exclusion

`DisableConcurrentExecution` giảm concurrent invocation của cùng method qua distributed coordination. Cơ chế này hữu ích cho maintenance task nhưng không tạo exactly-once guarantee.

> Không dùng `DisableConcurrentExecution` như cơ chế duy nhất bảo vệ correctness của business aggregate.

Các giới hạn:

- Lock lifetime phụ thuộc storage connection/lease.
- Process hoặc network failure làm ownership trở nên không chắc chắn.
- Method-level key có thể serialize toàn bộ tenants và shops không cần thiết.
- Side effect ngoài storage không trở thành atomic.

Resource-level concurrency thuộc business storage. Ví dụ unique constraint, optimistic version hoặc atomic conditional update bảo vệ đúng aggregate/resource scope.

### Tenant-scoped concurrency

Một global recurring job đồng bộ menu có thể tạo contention giữa tenants. Phân scope theo tenant/shop cho phép isolation và capacity control:

```text
queue: menu-sync
business key: {tenantId}:{shopId}:{menuVersion}
unique execution key: sync-menu:{tenantId}:{shopId}:{menuVersion}
```

Queue vẫn là shared execution channel; unique key và query predicate mới bảo vệ business scope.

### Multiple instances

#### Shared-storage topology

Nhiều Hangfire Server dùng chung MySQL storage. Mỗi server có identity và heartbeat riêng; worker cạnh tranh fetch thông qua provider.

```mermaid
flowchart TB
    LB[Load Balancer]
    A[API A<br/>4 workers]
    B[API B<br/>4 workers]
    C[API C<br/>4 workers]
    HF[(MySQL Hangfire Storage)]
    Biz[(Business MySQL)]

    LB --> A
    LB --> B
    LB --> C
    A <--> HF
    B <--> HF
    C <--> HF
    A --> Biz
    B --> Biz
    C --> Biz
```

Ba replicas với `WorkerCount = 4` tạo tối đa 12 execution slots.

```text
ClusterConcurrency = Σ WorkerCount của tất cả servers lắng nghe queue
```

> Scale API replicas có thể vô tình scale cả background workload nếu mỗi API process đều chạy `AddHangfireServer`. Autoscaling HTTP replicas đồng thời thay đổi background concurrency nếu mỗi API process chạy `AddHangfireServer`.

`WorkerCount` được xác định từ capacity toàn cụm: MySQL connection pool, external rate limit, CPU, memory và job duration. CPU-based formula không phản ánh các giới hạn I/O này.

#### Worker Service topology

Trong mô hình này, nơi tạo job và nơi chạy job nằm ở hai loại process khác nhau: API chỉ đăng ký Client để enqueue, còn một Worker Service riêng đăng ký Server để thực thi.

```mermaid
flowchart LR
    API[API replicas<br/>Hangfire Client] --> HF[(MySQL Hangfire Storage)]
    HF --> Notify[Notification workers]
    HF --> Export[Export workers]
    Notify --> Biz[(Business MySQL)]
    Export --> Files[(Object Storage)]
```

API đăng ký `AddHangfire` để tạo job nhưng không đăng ký `AddHangfireServer`, vì API không thực thi job.

Worker Service đăng ký cả storage và `AddHangfireServer`. API và Worker Service phải dùng cùng connection string, `TablesPrefix`, provider version, queue names, serializer settings và job contract.

Worker riêng phù hợp với workload cần scale độc lập hoặc cô lập CPU/RAM. In-process server giữ topology đơn giản hơn cho workload nhỏ.

#### Queue isolation và polling

Queue cô lập workload và cho phép scale từng worker pool. Queue không tạo priority guarantee nếu provider không cam kết processing order tương ứng với vị trí trong `options.Queues`.

Job trong queue không có worker giữ state `Enqueued`. Dashboard biểu diễn queue length và oldest-job age tăng trong khi server coverage bằng không.

`QueuePollInterval` kiểm soát trade-off giữa queue latency và MySQL query rate:

```text
Queue latency cao, MySQL còn capacity
  -> giảm polling interval hoặc tăng worker có kiểm soát

MySQL CPU/connection cao, queue tiếp tục tăng
  -> tăng worker làm tăng contention
  -> giảm concurrency, profile storage query hoặc tách workload
```

## 7. Cancellation, shutdown và long-running jobs

Mục 6 giả định mọi execution đều chạy đến khi kết thúc tự nhiên. Trong thực tế, một execution có thể bị dừng giữa chừng — do server shutdown, do job bị xóa, hoặc do chạy quá lâu — và long-running job cần được thiết kế khác với job ngắn để chịu được việc đó.

### Cancellation sources

Execution token có thể được signal bởi server shutdown, job deletion, state change hoặc cancellation request mà Hangfire quan sát qua storage.

Token này thuộc execution attempt hiện tại. Nó không phải `RequestAborted` của HTTP request đã enqueue job.

Cancellation delivery có polling latency. Khoảng polling ngắn tăng responsiveness và storage reads; khoảng dài giảm storage load và kéo dài shutdown/cancel reaction.

### Safe cancellation points

Job method nên kiểm tra `ThrowIfCancellationRequested()` giữa các bước đã có outcome bền vững, để execution dừng đúng chỗ thay vì dừng giữa chừng một side effect chưa hoàn tất:

```csharp
public async Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken)
{
    var donHang = await _repository.GetAsync(donHangId, cancellationToken);

    cancellationToken.ThrowIfCancellationRequested();
    await _documentStore.UploadAsync(donHangId, cancellationToken);

    cancellationToken.ThrowIfCancellationRequested();
    await _repository.MarkDocumentReadyAsync(donHangId, cancellationToken);
}
```

Safe point nằm giữa các stage có outcome bền vững. Cancellation giữa external side effect và persistence tạo unknown outcome giống process crash.

`OperationCanceledException` phải đi ra khỏi job method để execution pipeline ghi nhận cancellation/failure semantics phù hợp. Catch để thêm context log vẫn cần rethrow:

```csharp
try
{
    await ExecuteCoreAsync(cancellationToken);
}
catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
{
    _logger.LogInformation("Job cancellation observed");
    throw;
}
```

### Business cancellation

Hangfire technical state có retention và không phải business audit. Yêu cầu “hủy xuất báo cáo” cần business state:

```text
Pending -> CancellationRequested -> Cancelled
Pending -> Processing -> Completed
Processing -> CancellationRequested -> Cancelled | Completed
```

Race giữa completion và cancellation được giải quyết bằng atomic state transition hoặc optimistic concurrency trên business record.



### Graceful shutdown và crash

Cancellation không rollback side effect đã hoàn tất. Sau khi provider nhận request, execution tiếp theo dựa trên idempotency hoặc reconciliation.

Graceful shutdown cho worker thời gian quan sát cancellation và trả job về trạng thái có thể recovery. Kill đột ngột vẫn thuộc failure model.

### Long-running jobs

Job dài cần được đánh giá khác với job ngắn vì một execution có thể giữ worker slot, memory, connection hoặc external resource trong thời gian dài.

Các concern chính:

- Truyền và quan sát `CancellationToken`.
- Timeout riêng cho từng external dependency.
- Durable checkpoint hoặc progress state nếu execution có nhiều stage.
- Memory growth và large object allocation.
- Worker starvation khi concurrency quá thấp.
- Graceful shutdown/deployment duration.
- Retry boundary quá lớn nếu lỗi xảy ra gần cuối execution.

Một job 30 đến 60 phút không mặc định phải được chia nhỏ. Tuy nhiên nếu nhiều stage có outcome độc lập, workflow có durable checkpoint thường dễ recovery và retry an toàn hơn một execution nguyên khối.


## 8. Multi-tenancy

Cancellation token ở mục 7 là một ví dụ cụ thể cho một vấn đề tổng quát hơn: background job không thừa hưởng bất kỳ context nào của HTTP request đã tạo ra nó. Cùng lý do đó áp dụng cho tenant — background job không có HTTP host, request header hoặc authenticated user của request ban đầu. Tenant context phải được khôi phục từ dữ liệu bền vững.

Job contract có thể chứa tenant scope:

```csharp
Task ExecuteAsync(
    Guid tenantId,
    Guid shopId,
    CancellationToken cancellationToken);
```

Một contract khác chỉ nhận `donHangId`, sau đó repository tải `tenantId` từ business record bằng lookup không phụ thuộc current tenant filter.

Sau khi tenant được xác định, execution scope thiết lập `TenantContext` trước tenant-scoped query. Dapper query vẫn có explicit tenant predicate:

```sql
SELECT id, trangThai
FROM DonHang
WHERE id = @donHangId
  AND tenantId = @tenantId;
```



### Tenant context lifetime

Một worker process có thể xử lý liên tiếp job của nhiều tenants. Tenant state không được giữ trong static hoặc singleton mutable state giữa các executions.

Mỗi execution nên:

1. Xác định tenant từ durable input hoặc business record.
2. Thiết lập tenant scope cho execution hiện tại.
3. Thực hiện tenant-scoped query với predicate phù hợp.
4. Dispose hoặc clear context khi execution kết thúc.

## 9. Cấu hình .NET, MySQL và storage lifecycle

Các mục trước giả định Hangfire đã được cấu hình và chạy sẵn — nhưng state machine, retry, concurrency hay tenant scope chỉ hoạt động đúng khi nền tảng bên dưới (package, kết nối MySQL, service registration) được thiết lập chuẩn. Cấu hình production nên được xem như một contract giữa application, storage provider và deployment pipeline, không chỉ là một tập option sao chép từ sample.

### Package và database

> Các version dưới đây là version minh họa được pin cho tài liệu. Production cần kiểm tra release note và compatibility trước khi nâng cấp.

```bash
dotnet add package Hangfire.AspNetCore --version 1.8.23
dotnet add package Hangfire.MySqlStorage --version 2.0.3
```

Version được pin để deployment có dependency graph xác định. Nâng version bao gồm release-note review, storage migration và rolling-deploy compatibility.

```sql
CREATE DATABASE food_jobs
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

```json
{
  "ConnectionStrings": {
    "Hangfire": "Server=localhost;Port=3306;Database=food_jobs;User Id=hangfire_app;Password=secret;Allow User Variables=True"
  }
}
```

`Allow User Variables=True` là requirement của provider. Production secret thuộc secret store hoặc environment configuration.

### Service registration

```csharp
using System.Data;
using Hangfire;
using Hangfire.MySql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration
    .GetConnectionString("Hangfire")
    ?? throw new InvalidOperationException("Missing Hangfire connection string.");

builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseStorage(new MySqlStorage(
        connectionString,
        new MySqlStorageOptions
        {
            TransactionIsolationLevel = IsolationLevel.ReadCommitted,
            QueuePollInterval = TimeSpan.FromSeconds(5),
            JobExpirationCheckInterval = TimeSpan.FromHours(1),
            CountersAggregateInterval = TimeSpan.FromMinutes(5),
            PrepareSchemaIfNecessary = false,
            DashboardJobListLimit = 50_000,
            TransactionTimeout = TimeSpan.FromMinutes(1),
            TablesPrefix = "Hangfire"
        })));

builder.Services.AddHangfireServer(options =>
{
    options.Queues = new[] { "critical", "notification", "default" };
    options.WorkerCount = 4;
});
```

`PrepareSchemaIfNecessary = true` phù hợp local development. Production schema được cài bằng deployment step; runtime account chỉ giữ quyền DML cần thiết.

### Storage options

Các option dưới đây thuộc `Hangfire.MySqlStorage`; chúng không phải contract chung của mọi Hangfire storage provider. Provider khác có thể hiện thực cùng một concern bằng option hoặc cơ chế khác.


| Option | Cơ chế | Tác động cấu hình |
| --- | --- | --- |
| `TransactionIsolationLevel` | Isolation của transaction nội bộ provider | `ReadCommitted` là default được provider công bố. |
| `QueuePollInterval` | Chu kỳ tìm queue item | Khoảng ngắn giảm queue latency và tăng query rate. |
| `JobExpirationCheckInterval` | Chu kỳ dọn record hết hạn | Khoảng quá ngắn tạo cleanup pressure. |
| `CountersAggregateInterval` | Chu kỳ tổng hợp counter | Quyết định độ mới của số liệu Dashboard. |
| `PrepareSchemaIfNecessary` | Tự cài physical schema | Liên quan trực tiếp tới quyền DDL runtime. |
| `DashboardJobListLimit` | Giới hạn danh sách job | Giới hạn memory và query volume của Dashboard. |
| `TransactionTimeout` | Timeout storage transaction | Độc lập với timeout business job. |
| `TablesPrefix` | Namespace vật lý của bảng | Phải thống nhất giữa producer và worker. |

MySQL mặc định thường sử dụng `REPEATABLE READ`. Storage provider có thể mở transaction với isolation level được cấu hình riêng, chẳng hạn `ReadCommitted` trong ví dụ trên.

Storage transaction và business `DbContext` transaction là hai transaction độc lập.

Hai phía chỉ chia sẻ atomic boundary khi cùng sử dụng một database connection và một transaction object. Cấu hình Hangfire mặc định không tạo quan hệ này.

### Schema lifecycle và retention

#### Schema installation

Storage provider cần physical tables và indexes trước khi Client hoặc Server hoạt động. Hai execution modes có mục tiêu khác nhau:

| Mode | `PrepareSchemaIfNecessary` | Database identity |
| --- | --- | --- |
| Local development | `true` | Có quyền tạo/thay đổi object. |
| Production runtime | `false` | Chỉ có quyền DML cần cho Hangfire. |
| Deployment migration | Không chạy application server | Identity riêng có quyền DDL. |

Auto schema creation làm startup của mỗi production replica phụ thuộc vào DDL permission và trạng thái schema tại thời điểm khởi động.

Deployment migration tách schema change khỏi runtime startup. Migration được review và chạy bằng deployment identity trước khi application replicas nhận traffic; runtime identity chỉ giữ các DML permissions cần thiết.

#### Table prefix consistency

`TablesPrefix` là physical namespace. Producer và worker dùng prefix khác nhau hoạt động như hai Hangfire systems độc lập dù cùng connection string:

```text
API prefix     = Hangfire
Worker prefix  = FoodJobs

API enqueue vào HangfireJob...
Worker poll FoodJobsJob...
Kết quả: enqueue thành công, không job nào được xử lý
```

Prefix là immutable deployment contract trừ khi có data migration đầy đủ.

#### Retention model

Succeeded jobs và monitoring data không tồn tại vô hạn. Expiration manager xóa record theo expiration metadata và provider interval.

Retention tạo trade-off:

```text
retention dài
  -> điều tra lịch sử tốt hơn
  -> storage, index và cleanup cost lớn hơn

retention ngắn
  -> storage nhỏ hơn
  -> mất technical evidence sớm hơn
```

Business audit không phụ thuộc retention của Hangfire. Thông tin pháp lý, thanh toán, lịch sử trạng thái đơn hàng và operator action nằm trong business audit store.

#### Index và storage growth

Growth rate phụ thuộc enqueue throughput, state transitions trên mỗi job, retries, argument size và retention:

```text
rowsPerDay ≈ jobsPerDay × (job row + state rows + queue/parameter/counter rows)
```

Retry-heavy workload tăng `State` nhanh hơn số business operations. Dashboard query chậm có thể xuất phát từ storage size, index statistics, counter aggregation hoặc list limit; tăng web timeout không xử lý nguyên nhân.

## 10. Capacity planning và configuration derivation

Mục 9 liệt kê các option cấu hình sẵn có; mục này trả lời câu hỏi quan trọng hơn — con số nào là đúng cho một workload cụ thể. Production configuration nên được suy ra từ workload contract thay vì sao chép default. Tư duy cơ bản gồm ba bước: xác định workload, xác định bottleneck và từ đó suy ra worker/polling/queue/retry.

```text
Arrival rate  → required throughput
Duration      → concurrency baseline
Start SLO     → queue delay budget
Provider RPS  → max concurrency
DB pool       → upper bound
```

Ví dụ:

```text
Job type: GuiXacNhanDonHang
arrival rate: 20 jobs/s peak
average duration: 300 ms
p95 duration: 1.2 s
external limit: 50 requests/s
start SLO: 30 s
retry: 10s, 30s, 2m, 5m
idempotency: gui-xac-nhan:{donHangId}
queue: notification
```

Baseline concurrency từ average workload:

```text
20 jobs/s × 0.3 s = 6 concurrent executions
```

P95 burst, retry traffic và headroom có thể đưa baseline lên 10 đến 12 workers toàn cluster, vẫn thấp hơn external limit 50 requests/s. Nếu có ba replicas, `WorkerCount = 4` tạo tổng 12 slots.

Polling interval xuất phát từ start SLO. SLO 30 giây không yêu cầu polling 100 ms; polling 5 giây vẫn để lại phần lớn latency budget cho queue wait và execution, đồng thời giảm áp lực polling lên MySQL.

Queue separation xuất phát từ resource profile:

| Queue | Workload | Constraint |
| --- | --- | --- |
| `critical` | cập nhật deadline ngắn | latency và business priority |
| `notification` | email/SMS | provider rate limit |
| `export` | PDF/Excel | CPU, memory, object storage |

Worker pool cho `export` có concurrency thấp để export không chiếm connection/CPU của notification.

## 11. Production operation và observability

Capacity đã được tính đúng (mục 10) không có nghĩa hệ thống tự vận hành trơn tru — vẫn cần biết khi nào một con số đã sai. Dashboard chỉ phục vụ điều tra từng job; monitoring và alerting vẫn cần một observability pipeline riêng.

### Deployment compatibility

Schema installation thuộc deployment pipeline; runtime account chỉ có DML permission. Rolling deployment giữ compatibility với queued payload:

```text
deploy worker đọc được V1 và V2
  -> deploy producer bắt đầu tạo V2
  -> V1 queue, schedule và retry drain
  -> loại V1 khỏi worker
```

Đổi namespace, assembly, type, method signature hoặc argument DTO trước khi job cũ drain có thể làm worker không deserialize được payload.

### Observability

Dashboard phục vụ điều tra từng job; monitoring system chịu trách nhiệm alert và historical metrics.

- Queue length và oldest-job age theo queue.
- Enqueue-to-start latency.
- Execution duration và throughput theo job type.
- Failed rate, retry rate và exhausted retries.
- Server heartbeat age.
- MySQL connection utilization, query latency và lock wait.
- External dependency latency, rate limit và error rate.

Structured log của mỗi execution gồm `jobId`, `tenantId`, business key, job type, attempt và trace context.

### Operational failure cases

#### Queue không có worker

Job giữ state `Enqueued` khi không có worker fetch nó. Theo thời gian, queue length và oldest-job age cùng tăng.

Server view trong Dashboard không hiển thị instance nào đăng ký queue tương ứng. Hai nguyên nhân phổ biến là queue name khác nhau giữa producer và worker, hoặc worker deployment thiếu queue configuration.

#### Retry storm

Khi một dependency bên ngoài lỗi trên diện rộng, retry của hàng loạt job có thể khuếch đại tải thay vì giảm nó:

```mermaid
flowchart LR
    Jobs[10.000 jobs] --> Provider[Provider 503]
    Provider --> Retry[Scheduled retries]
    Retry --> Queue[Backlog]
    Queue --> Provider
```

Worker limit, queue isolation, backoff và circuit/rate policy giới hạn amplification. Permanent error không đi vào cùng retry policy với transient error.

#### Manual retry sau timeout

Timeout không chứng minh provider chưa xử lý request. Manual retry payment hoặc notification dựa trên provider status và idempotency record, không chỉ technical state của Hangfire.

## 12. Dashboard và vận hành

Mục 11 nêu observability pipeline cần theo dõi những chỉ số nào. Dashboard là công cụ cụ thể của Hangfire để điều tra từng job — nơi operator nhìn thấy state, queue và exception thực tế, và ra quyết định retry hoặc delete.

### Information model

Dashboard không lưu dữ liệu riêng; nó đọc trực tiếp từ storage qua Monitoring API:

```mermaid
flowchart LR
    Dashboard --> Monitoring[Monitoring API]
    Monitoring --> Server[(Server heartbeat)]
    Monitoring --> Queue[(JobQueue)]
    Monitoring --> Jobs[(Job + State)]
    Monitoring --> Schedule[(Set + Hash)]
    Monitoring --> Counters[(Counters)]
```

| Khu vực | Dữ liệu | Ý nghĩa vận hành |
| --- | --- | --- |
| Overview | State counters và history graph | Processing trend tổng quát. |
| Servers | Identity, heartbeat, workers, queues | Trạng thái worker processes. |
| Queues | Queue length và server coverage | Backlog và queue không có consumer. |
| Enqueued | Job chờ fetch | Queue latency và oldest-job age. |
| Processing | Job đang được worker giữ | Long-running hoặc stalled execution. |
| Scheduled | Delayed job và retry | Retry storm hoặc scheduled backlog. |
| Succeeded | Method execution hoàn tất | Không chứng minh side effect exactly-once. |
| Failed | Current failed jobs và exception | Permanent failure hoặc exhausted retry. |
| Recurring Jobs | Cron, timezone, next/last execution | Trạng thái recurring definitions. |

Failure diagnosis:

```text
Không có email xác nhận
  -> không có job: producer hoặc Outbox dispatcher
  -> Enqueued lâu: queue coverage và worker capacity
  -> Scheduled: exception và next retry
  -> Processing lâu: dependency, duration, heartbeat
  -> Failed: transient/permanent classification
  -> Succeeded: provider log, business state, idempotency record
```

State `Succeeded` chỉ xác nhận method trả về không ném exception. Code catch exception rồi tiếp tục làm technical state lệch khỏi business result.


### Server view

Server view trả lời ba câu hỏi:

1. Process nào còn heartbeat?
2. Mỗi process có bao nhiêu workers?
3. Process lắng nghe queues nào?

Server heartbeat cũ không tự động chứng minh machine chết; network partition hoặc MySQL connectivity failure tạo cùng biểu hiện. Application log và infrastructure health hoàn thiện chẩn đoán.

### Queue view

Queue length là snapshot backlog. Oldest-job age biểu diễn user impact tốt hơn khi arrival rate thay đổi.

```text
Queue length = 10.000, throughput = 5.000/minute
  -> backlog có thể được giải phóng trong khoảng 2 phút

Queue length = 100, oldest age = 2 giờ
  -> queue có thể thiếu worker hoặc chứa poison/blocked workload
```

Dashboard không mặc định cung cấp đầy đủ SLO calculation. Metrics pipeline cần record enqueue time, start time và final state để tính percentile.

### Processing view

Processing duration được đối chiếu với job-specific expectation. Một export 20 phút có thể bình thường; một notification 20 phút là stalled dependency hoặc timeout policy thiếu.

Processing job trên server không còn heartbeat có khả năng chờ provider recovery. Manual requeue trước recovery có thể tạo concurrent duplicate execution.

### Failed và retry view

Investigation record tối thiểu:

```text
Hangfire jobId
tenantId / shopId
business key
job type
current state
state history
attempt number
exception type
external request/idempotency key
worker serverId
```

Exception message không đủ để phân loại unknown outcome. Timeout sau external call cần provider lookup hoặc reconciliation.

### Operator actions

| Action | Technical effect | Business consequence |
| --- | --- | --- |
| Retry/Requeue | Tạo execution attempt mới | Side effect có thể lặp. |
| Delete | Chuyển hoặc loại job khỏi processing flow | Không rollback business data. |
| Trigger recurring | Tạo execution ngoài schedule thông thường | Có thể chạy song song execution đang tồn tại. |
| Change queue/config | Thay worker routing | Không migrate job nếu provider/API không thực hiện transition tương ứng. |

Operator identity, reason, timestamp, job ID và business key thuộc audit record. Dashboard button không thay approval policy cho payment, refund hoặc document issuance.

### Security

Dashboard hiển thị method, serialized arguments, exception và stack trace; đồng thời cung cấp retry, delete và trigger operations. Endpoint cần authentication, role authorization và network restriction.

```csharp
public sealed class HangfireAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        return httpContext.User.Identity?.IsAuthenticated == true
            && httpContext.User.IsInRole("HangfireAdmin");
    }
}
```

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = new[] { new HangfireAuthorizationFilter() },
    IsReadOnlyFunc = context =>
        !context.GetHttpContext().User.IsInRole("HangfireOperator")
});
```

Job arguments không chứa password, access token hoặc dữ liệu cá nhân không cần thiết. Retry, delete và manual trigger thuộc audit trail vận hành.

## 13. Verification strategy

Dashboard (mục 12) chỉ cho biết điều gì đang xảy ra ở production; nó không chứng minh hệ thống đúng trước khi lên production. Verification cần chứng minh invariant sau failure, không chỉ kiểm tra happy path của job method.

### Business method tests

Job class được kiểm thử như application service, không cần Hangfire runtime cho domain branches:

```text
DonHang tồn tại, chưa gửi
  -> provider được gọi với idempotency key đúng
  -> business state được cập nhật

DonHang đã gửi
  -> method return
  -> provider không được gọi

Provider transient failure
  -> exception đi ra execution boundary
  -> state không được đánh dấu hoàn tất
```

### Storage integration tests

Integration test với MySQL storage thật xác nhận các phần không thể chứng minh bằng mock:

- Invocation serialize và deserialize qua đúng package versions.
- DI activator resolve job và scoped dependencies.
- Queue attribute route tới đúng worker pool.
- Retry filter tạo scheduled transition.
- Recurring definition dùng tenant/shop-scoped ID.
- Hai workers không cùng claim normal queue item trong happy path.
- Process interruption dẫn tới redelivery theo provider recovery.
- Dashboard authorization từ chối identity không đủ role.

### Failure injection

Failure injection không chỉ kiểm tra hệ thống có crash hay không; mục tiêu là chứng minh **invariant sau crash**.

| Failure point | Expected invariant |
| --- | --- |
| Trước business transaction commit | Không có business state hoàn tất và không có enqueue intent đã chấp nhận. |
| Sau business commit, trước enqueue | Outbox vẫn giữ pending intent để dispatcher xử lý lại. |
| Sau enqueue, trước Outbox `mark dispatched` | Có thể duplicate enqueue nhưng logical side effect không duplicate. |
| Sau external side effect, trước business state update | Retry/reconciliation không tạo duplicate logical effect. |
| Sau business state update, trước Hangfire `Succeeded` | Recovery có thể chạy lại nhưng business state vẫn idempotent. |
| Storage outage | Failure phải observable; không silently mất enqueue intent. |

Các điểm crash cần được mô phỏng độc lập:

```text
before business transaction commit
after business commit, before enqueue
after enqueue, before Outbox mark-dispatched
after external side effect, before business state update
after business state update, before Hangfire Succeeded
```

Mỗi điểm xác nhận một mechanism khác nhau: transaction rollback, Outbox, duplicate enqueue, external idempotency và redelivery handling.

### Multi-instance verification

Test topology chạy tối thiểu hai worker processes trên cùng MySQL storage:

1. Enqueue batch có business keys duy nhất.
2. Xác nhận workload được phân phối qua hai server identities.
3. Kill một process giữa execution.
4. Xác nhận abandoned job được recovery.
5. Xác nhận business side effect không duplicate nhờ idempotency.
6. Restart process và xác nhận heartbeat/server view phục hồi.

## 14. Hangfire và Message Broker

Tới đây, tài liệu đã đủ để thiết kế, vận hành và verify Hangfire trong một service. Câu hỏi còn lại là ranh giới: khi nào Hangfire là lựa chọn đúng, và khi nào bài toán thực ra cần một message broker? Hangfire và message broker giải quyết các bài toán có phần giao nhau nhưng không phải cùng abstraction.

| Hangfire | RabbitMQ / Kafka và message broker tương tự |
| --- | --- |
| Durable background job execution | Message/event transport giữa producer và consumer |
| Persist method invocation | Persist message/event contract |
| Built-in scheduling, retry và Dashboard | Broker delivery, routing, partition/consumer semantics |
| Consumer thường là job method trong application | Consumer thường là process/service độc lập |
| Phù hợp application background work | Phù hợp integration và event-driven architecture |

Chọn Hangfire khi mục tiêu chính là **thực thi một application job bền vững**. Chọn message broker khi mục tiêu chính là **truyền message/event giữa các boundary độc lập**, cần routing, fan-out, consumer group hoặc decoupling ở cấp service.

Hai công nghệ cũng có thể phối hợp: Hangfire xử lý scheduled/background workflow trong một service, trong khi broker truyền integration event sang service khác.

## 15. Tra cứu và checklist

Phần cuối dùng để tra cứu nhanh thuật ngữ, rà production checklist và quay lại các nguồn tham khảo.

### Keyword reference

| Keyword | Định nghĩa |
| --- | --- |
| Background job | Method invocation được serialize và lưu để thực thi ngoài request hiện tại. |
| Execution attempt | Một lần worker thực thi logical job; một job có thể có nhiều attempts. |
| Unknown outcome | Trạng thái không biết side effect đã xảy ra hay chưa, thường gặp sau timeout/crash window. |
| Business key | Khóa nhận diện logical business operation hoặc resource. |
| Idempotency key | Khóa giúp nhiều attempts tạo tối đa một logical effect. |
| Crash window | Khoảng giữa hai durable boundaries nơi process crash có thể tạo ambiguity. |
| Reconciliation | Đối soát technical execution với business/external state để xác định outcome. |
| Client | Thành phần tạo và persist job. |
| Storage | Nguồn sự thật kỹ thuật cho job, state, queue và server. |
| Hangfire Server | Tập background process điều phối qua storage. |
| Worker | Execution slot fetch và chạy một job tại một thời điểm. |
| Queue | Kênh logic phân workload tới worker pool. |
| State | Một trạng thái trong history của job. |
| State transition | Việc tạo state mới và cập nhật current state. |
| Filter | Hook quanh job creation, execution hoặc state election. |
| Automatic retry | Filter chuyển failed attempt thành scheduled attempt mới. |
| Scheduled job | Job một lần chờ due time. |
| Recurring job | Cron definition tạo các fire-and-forget job. |
| Continuation | Job phụ thuộc state cuối của job cha. |
| Heartbeat | Tín hiệu định kỳ của Hangfire Server trong storage. |
| Distributed lock | Coordination giữa processes qua shared storage. |
| Job activator | Thành phần tạo job instance và DI scope. |
| Poison job | Job luôn thất bại vì input hoặc permanent failure. |
| Outbox | Processing intent được lưu cùng business transaction. |
| Idempotency | Cùng operation key được áp dụng nhiều lần nhưng chỉ tạo một logical effect. |

### Verification checklist

- Client và worker dùng cùng database, `TablesPrefix` và provider version.
- Mỗi queue có ít nhất một worker pool.
- Tổng worker count phù hợp MySQL và external dependency capacity.
- Job argument nhỏ, ổn định và không chứa secret.
- Tenant context được khôi phục từ dữ liệu bền vững.
- Retry policy phân biệt transient và permanent failure.
- Side effect có idempotency key, unique constraint hoặc reconciliation.
- Outbox bảo vệ business operation không chấp nhận lost intent.
- Dashboard có authorization, network restriction và read-only role.
- Rolling deployment giữ compatibility với queued payload.
- Monitoring sử dụng queue age, failure rate và heartbeat.

### Tài liệu tham khảo

- [Hangfire documentation](https://docs.hangfire.io/en/latest/)
- [ASP.NET Core applications](https://docs.hangfire.io/en/latest/getting-started/aspnet-core-applications.html)
- [Processing background jobs](https://docs.hangfire.io/en/latest/background-processing/processing-background-jobs.html)
- [Running multiple server instances](https://docs.hangfire.io/en/latest/background-processing/running-multiple-server-instances.html)
- [Configuring job queues](https://docs.hangfire.io/en/latest/background-processing/configuring-queues.html)
- [Using Dashboard UI](https://docs.hangfire.io/en/latest/configuration/using-dashboard.html)
- [Hangfire.MySqlStorage repository](https://github.com/arnoldasgudas/Hangfire.MySqlStorage)
- [Hangfire.MySqlStorage package](https://www.nuget.org/packages/Hangfire.MySqlStorage/)
