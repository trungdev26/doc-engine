# .NET Backend Engineering — Lộ trình và chuẩn năng lực

Roadmap này hướng tới hai kết quả:

- Trở thành Middle .NET có thể chịu trách nhiệm độc lập cho một backend feature chạy production.
- Xây nền tảng để tiến tới Senior: thiết kế hệ thống, phân tích trade-off và xử lý sự cố bằng bằng chứng.

Trọng tâm của roadmap là cơ chế thực thi, tính đúng đắn của dữ liệu, failure handling, khả năng quan sát và quyết định kỹ thuật.

---

## 1. Kết quả mong đợi

Sau mỗi chặng, phạm vi trách nhiệm sẽ tăng dần:

| Chặng | Kết quả |
|---|---|
| Strong Junior | Hiểu framework đang làm gì và xây feature đúng boundary |
| Middle | Giữ use case đúng khi có concurrency, retry, timeout và dữ liệu lớn |
| Senior | Thiết kế, vận hành và cải tiến hệ thống dựa trên invariant và số liệu |

Số năm kinh nghiệm không quyết định level. Bằng chứng nằm ở code, test, thiết kế và cách xử lý production incident.

---

## 2. Nền tảng sử dụng roadmap

Các chuyên đề giả định người học đã có thể:

- Phát triển Web API với ASP.NET Core.
- Sử dụng controller, service, Dependency Injection và EF Core.
- Viết truy vấn LINQ và SQL thông dụng.
- Làm việc với `async`/`await`.
- Đọc hiểu HTTP request/response.
- Theo dõi luồng xử lý của một backend feature.

Mỗi bài sẽ nhắc lại mental model cần thiết, sau đó đi vào cơ chế, boundary, failure mode và cách kiểm chứng.

---

## 3. Mô hình phát triển năng lực

Năng lực kỹ thuật phát triển qua bốn mức:

1. **Sử dụng:** triển khai được happy path.
2. **Giải thích:** hiểu lifecycle và behavior của framework.
3. **Bảo vệ:** giữ invariant đúng khi xuất hiện failure hoặc concurrency.
4. **Thiết kế:** lựa chọn giải pháp dựa trên trade-off, tải và yêu cầu vận hành.

Ví dụ với EF Core:

| Mức | Biểu hiện |
|---|---|
| Sử dụng | Viết LINQ và gọi `SaveChangesAsync` |
| Giải thích | Biết query thực thi lúc nào, entity nào đang được tracking |
| Bảo vệ | Xác định transaction boundary và xử lý concurrent update |
| Thiết kế | Chọn consistency model, migration và chiến lược dữ liệu phù hợp |

Roadmap tổ chức nội dung theo sự phát triển này, thay vì xếp các API của framework thành một danh sách rời rạc.

---

## 4. Chặng 01 — Strong Junior

### Mục tiêu

Hiểu đúng các cơ chế được sử dụng hằng ngày và xây một backend feature có boundary rõ, dễ test, dễ quan sát.

### Nội dung

1. Request lifecycle và application boundary.
2. API contract và controller boundary.
3. Dependency Injection, scope và lifetime.
4. Middleware, filter và exception pipeline.
5. Async, cancellation và exception propagation.
6. EF Core: query execution, tracking và save boundary.
7. Configuration, Options và secret.
8. Structured logging và integration testing.

### Chuẩn hoàn thành

Người học có thể:

- Trace một request từ web server tới database và quay lại response.
- Đặt validation, authorization và business rule đúng boundary.
- Giải thích lifetime của các service trong object graph.
- Truyền cancellation xuyên các I/O operation.
- Kiểm tra SQL do EF Core sinh và nhận diện query có vấn đề.
- Chuẩn hóa error response và log theo correlation/business identifier.
- Viết integration test cho success path và failure path quan trọng.

### Sản phẩm thực hành

Một command API hoàn chỉnh, ví dụ `ApproveOrder`, có:

- API contract ổn định.
- Authorization tại server.
- Business rule rõ ràng.
- Persistence boundary có chủ đích.
- Structured log.
- Integration test.

---

## 5. Chặng 02 — Middle

### Mục tiêu

Chịu trách nhiệm cho tính đúng đắn và độ ổn định của một feature trong điều kiện production.

### Nội dung

#### Data correctness

- Transaction boundary và Unit of Work.
- Optimistic concurrency và isolation level.
- Idempotency và duplicate request.
- Query performance, pagination và index.

#### Dependency failure

- `HttpClient`, timeout và retry.
- Circuit breaker và concurrency limit.
- Cache và invalidation.
- Background worker, queue và backpressure.

#### Production confidence

- Resource-based authorization.
- Integration, concurrency và failure testing.
- Structured logging, metrics và distributed tracing.
- Debug timeout, API chậm và queue backlog.
- Graceful shutdown.

### Chuẩn hoàn thành

Người học có thể:

- Xác định và bảo vệ transaction boundary.
- Chứng minh retry không tạo side effect trùng.
- Xử lý concurrent update theo invariant nghiệp vụ.
- Thiết kế outbound call có timeout và retry policy phù hợp.
- Xây worker có backpressure, deduplication và graceful shutdown.
- Phân tích bottleneck bằng log, metric, trace và query plan.
- Mô tả failure mode và recovery path của feature.

### Sản phẩm thực hành

Mở rộng command API ở chặng Strong Junior:

- Chống submit trùng.
- Xử lý hai user cập nhật đồng thời.
- Gọi external provider có timeout/retry.
- Phát background job an toàn.
- Có dashboard quan sát latency, error và queue.

---

## 6. Chặng 03 — Senior

### Mục tiêu

Thiết kế và vận hành các luồng ảnh hưởng nhiều module, nhiều service hoặc nhiều instance.

### Nội dung

#### Runtime và hiệu năng

- Task, Thread, Thread Pool và starvation.
- GC, allocation, LOH và memory diagnostics.
- Kestrel, connection và reverse proxy.
- Profiling và capacity planning.

#### Distributed correctness

- Multi-instance concurrency.
- Outbox, inbox và delivery semantics.
- Distributed consistency và failure model.
- Partitioning, contention và recovery.

#### Kiến trúc và vận hành

- Architecture boundary và dependency direction.
- Observability design, SLO và alert.
- Security threat modeling.
- Migration và backward compatibility.
- Rollout, rollback và incident response.

### Chuẩn hoàn thành

Người học có thể:

- Xác định invariant trước khi chọn pattern hoặc công nghệ.
- Đánh giá correctness khi hệ thống chạy nhiều instance.
- Phân tích bottleneck trên CPU, memory, thread, database và network.
- Mô tả consistency model và vùng dữ liệu có thể tạm thời sai lệch.
- Thiết kế observability trước khi triển khai.
- Lập migration/rollout plan có khả năng rollback.
- Review kiến trúc bằng trade-off và bằng chứng.

### Sản phẩm thực hành

Hoàn thiện hệ thống xuyên suốt:

- Outbox cho database và message.
- Worker chạy nhiều instance.
- Load test và capacity report.
- Dashboard, alert và runbook.
- Migration không gián đoạn.
- Incident drill và recovery report.

---

## 7. Ma trận năng lực

| Năng lực | Strong Junior | Middle | Senior |
|---|---|---|---|
| Request flow | Trace được pipeline | Thiết kế timeout và cancellation | Phân tích throughput và failure propagation |
| API contract | DTO, validation, error contract | Versioning và idempotency | Quản trị contract giữa nhiều consumer |
| DI | Chọn đúng lifetime | Phát hiện scope leak | Thiết kế composition boundary |
| Async | Không block async flow | Giới hạn concurrency | Chẩn đoán starvation và contention |
| Data | Hiểu query và tracking | Transaction, concurrency, performance | Consistency, migration và scale |
| Background work | Quản lý scope đúng | Retry, backpressure, deduplication | Delivery semantics và recovery |
| Security | Authentication và authorization đúng vị trí | Resource authorization | Threat modeling |
| Observability | Log có context | Metric và trace phục vụ debug | SLO, alert và incident response |
| Testing | Unit và integration test | Concurrency và failure test | Contract, migration và rollout test |
| Thiết kế | Boundary trong một feature | Trade-off trong một module | Quyết định xuyên hệ thống |

---

## 8. Bản đồ chuyên đề hiện có

| Chuyên đề | Chặng sử dụng |
|---|---|
| Controller & API Design | Strong Junior |
| ASP.NET Core Request Pipeline | Strong Junior → Middle |
| Dependency Injection | Strong Junior → Middle |
| Middleware | Strong Junior → Middle |
| EF Core Production Patterns | Middle |
| Background Services & Workers | Middle → Senior |
| Task, Thread và Process | Middle → Senior |
| Garbage Collector | Senior |
| Sinh mã nhiều instance | Middle → Senior |
| Tính tồn kho và replay | Middle → Senior |

Các bài chuyên sâu được đọc theo năng lực đang phát triển. Chúng không tạo thành thứ tự học độc lập.

---

## 9. Quy trình học một chuyên đề

### 9.1. Xây mental model

Xác định:

- Thành phần tham gia.
- Vòng đời của từng thành phần.
- Luồng dữ liệu và quyền điều khiển.
- Điểm có thể thất bại.
- Invariant cần bảo vệ.

### 9.2. Tạo ví dụ quan sát được

Ví dụ cần đủ nhỏ để nhìn thấy cơ chế và đủ instrumentation để kiểm chứng behavior.

### 9.3. Mô phỏng failure

Tùy chuyên đề, thử:

- Hủy request giữa chừng.
- Chạy hai update đồng thời.
- Làm database hoặc external service trả lỗi.
- Restart worker trong khi xử lý.
- Tạo tải vượt giới hạn thiết kế.

### 9.4. Thu thập bằng chứng

Sử dụng đúng công cụ cho từng lớp vấn đề:

- Log cho execution context và business flow.
- Metric cho xu hướng và resource saturation.
- Trace cho latency xuyên dependency.
- Query plan cho database bottleneck.
- Runtime counter hoặc dump cho memory/thread issue.

### 9.5. Ghi lại quyết định

Mỗi quyết định kỹ thuật cần trả lời:

- Rủi ro nào đang được xử lý?
- Invariant nào được bảo vệ?
- Chi phí triển khai và vận hành là gì?
- Điều kiện nào khiến quyết định cần thay đổi?

### 9.6. Chứng minh kết quả

Chọn hình thức phù hợp:

- Automated test cho behavior có thể lặp lại.
- Load test cho capacity assumption.
- Dashboard và alert cho production signal.
- Runbook cho recovery procedure.
- Architecture Decision Record cho trade-off quan trọng.

---

## 10. Project xuyên suốt

Roadmap sử dụng một domain xuyên suốt để liên kết các chuyên đề:

### Order API

- Tạo và duyệt đơn hàng.
- Giữ tồn kho.
- Thanh toán qua external provider.
- Gửi thông báo bằng background worker.
- Chống submit trùng.
- Xử lý concurrent update.
- Chạy nhiều instance.
- Theo dõi operation theo user và order.

Mỗi chặng mở rộng cùng một hệ thống. Cách tiếp cận này cho thấy request pipeline, transaction, queue, idempotency, observability và runtime behavior liên quan với nhau như thế nào.

---

## 11. Tiêu chí đánh giá

### Strong Junior

- Giải thích được request flow của project.
- Review endpoint theo boundary và lifecycle.
- Kiểm tra SQL của query quan trọng.
- Viết integration test cho validation, authorization và persistence.
- Chẩn đoán lỗi DI, async và EF Core phổ biến.

### Middle

- Thiết kế use case có transaction và concurrent update.
- Chứng minh retry an toàn.
- Xây worker có backpressure và recovery.
- Điều tra API chậm bằng telemetry.
- Viết failure-mode analysis cho một integration.

### Senior

- Thiết kế luồng đúng khi chạy nhiều instance.
- Phân tích runtime/performance bằng số liệu.
- Xác định consistency model.
- Lập migration và rollout plan.
- Viết runbook và dẫn dắt incident drill.

Hoàn thành một chặng nghĩa là tạo được bằng chứng tương ứng trong code, test hoặc hoạt động vận hành.

---

## 12. Bắt đầu

1. Đối chiếu nền tảng hiện tại với ma trận năng lực.
2. Chọn một backend feature làm project xuyên suốt.
3. Bắt đầu với **01. Cơ chế cốt lõi của ASP.NET Core**.
4. Hoàn thành từng chuyên đề bằng code, test và bằng chứng quan sát.
5. Review lại ma trận sau mỗi capstone.

Đích đến của roadmap là khả năng xây dựng hệ thống đúng, giải thích được behavior và đưa ra quyết định kỹ thuật có thể kiểm chứng.
