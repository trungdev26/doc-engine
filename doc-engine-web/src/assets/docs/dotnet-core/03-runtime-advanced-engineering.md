# Runtime & Advanced Engineering

Chặng này phát triển năng lực Senior .NET: phân tích behavior của runtime, thiết kế hệ thống chạy nhiều instance và vận hành thay đổi với rủi ro được kiểm soát.

Trọng tâm là mối liên hệ giữa runtime, workload, data consistency, distributed failure và operational design.

---

## 1. Kết quả của chặng

Sau chặng này, người học có thể:

- Phân tích CPU, Thread Pool, allocation và GC behavior.
- Khoanh vùng bottleneck bằng runtime counter, trace và profile.
- Thiết kế correctness khi application chạy nhiều instance.
- Xác định consistency model và delivery semantics.
- Thiết kế observability, capacity và recovery từ trước khi triển khai.
- Lập migration, rollout và rollback plan.
- Review kiến trúc dựa trên invariant, failure mode và trade-off.

Một thiết kế đạt chuẩn Senior cần trả lời:

1. Workload là CPU-bound, I/O-bound hay contention-bound?
2. Resource nào sẽ bão hòa trước?
3. Điều gì thay đổi khi scale nhiều instance?
4. Dữ liệu nào yêu cầu strong consistency?
5. Message có thể mất, trùng hoặc sai thứ tự không?
6. Partial failure được phát hiện và phục hồi thế nào?
7. Capacity assumption dựa trên số liệu nào?
8. Deployment có tương thích với version trước không?
9. Alert nào phản ánh tác động tới người dùng?
10. Runbook và rollback path là gì?

---

## 2. Mental model: behavior của toàn hệ thống

Một request production sử dụng nhiều loại tài nguyên:

```text
Connection
-> Kestrel queue
-> Thread Pool
-> Application code
-> Memory allocation
-> Database connection/lock
-> Outbound connection
-> Queue/message broker
```

Throughput được giới hạn bởi bottleneck chặt nhất. Tăng concurrency ở một tầng có thể chỉ chuyển queue sang tầng khác.

Phân tích hệ thống theo bốn lớp:

| Lớp | Câu hỏi |
|---|---|
| Runtime | Thread, CPU, allocation và GC hoạt động thế nào? |
| Resource | Pool, queue, lock và connection bão hòa ở đâu? |
| Correctness | Invariant còn đúng khi chạy phân tán không? |
| Operations | Hệ thống phát hiện, phục hồi và thay đổi thế nào? |

---

## 3. Task, Thread và Thread Pool

### Mục tiêu

Phân tích async workload, scheduling và Thread Pool saturation.

### Runtime model

- `Task` biểu diễn một operation, không đồng nghĩa với thread.
- I/O completion có thể tiếp tục mà không giữ thread trong thời gian chờ.
- CPU-bound work cần CPU time thực tế.
- Blocking trong request flow giữ Thread Pool thread.
- Thread Pool tăng thread có độ trễ và chi phí.

### Thread Pool starvation

Các nguyên nhân phổ biến:

- `.Result` hoặc `.Wait()` trên async operation.
- Blocking I/O.
- CPU-heavy work chạy trong request process.
- Lock contention.
- Unbounded parallel work.
- Dependency chậm kết hợp với sync-over-async.

### Evidence

Theo dõi đồng thời:

- Request rate và latency percentile.
- Thread Pool thread count.
- Thread Pool queue length.
- CPU utilization.
- Lock/contention signal.
- Dependency latency.

Queue tăng, latency tăng và CPU chưa bão hòa thường gợi ý blocking hoặc starvation. Đây là giả thuyết cần xác minh bằng trace/profile.

### Review checklist

- Phân loại workload trước khi chọn concurrency strategy.
- Blocking call không nằm trong hot request path.
- CPU-heavy operation có execution boundary riêng khi cần.
- Parallelism có giới hạn.
- Cancellation và timeout propagation đầy đủ.
- Runtime metric được đối chiếu với request/dependency metric.

### Tiêu chí hoàn thành

- Tái hiện Thread Pool starvation.
- Khoanh vùng blocking stack bằng trace.
- Đo tác động trước và sau thay đổi.
- Giải thích giới hạn throughput còn lại.

Đọc sâu: [Task, Thread và Process](/dotnet-core/task-thread-process).

---

## 4. Memory, allocation và Garbage Collector

### Mục tiêu

Phân biệt high allocation, retained memory, fragmentation và memory leak.

### Các nhóm vấn đề

| Hiện tượng | Dấu hiệu |
|---|---|
| High allocation rate | GC chạy thường xuyên, CPU tăng |
| Retained objects | Heap tăng sau nhiều GC cycle |
| LOH pressure | Gen 2/LOH tăng, pause dài |
| Pinned memory | Compaction bị hạn chế |
| Unbounded cache/queue | Memory tăng theo traffic hoặc thời gian |
| Native memory | Process memory tăng nhưng managed heap không tương ứng |

### Quy trình điều tra

1. Xác nhận memory trend theo thời gian.
2. So sánh process memory và managed heap.
3. Theo dõi allocation rate, collection count và pause.
4. Thu thập dump/gcdump tại nhiều thời điểm.
5. Tìm object type tăng và retention path.
6. Liên kết object với feature/workload.
7. Sửa ownership hoặc allocation pattern.
8. Chạy lại workload và so sánh.

### Review checklist

- Cache và collection có giới hạn.
- Event subscription có ownership/unsubscribe rõ.
- Buffer lớn có pooling/lifetime phù hợp.
- Request/response body không bị giữ ngoài scope.
- Closure không giữ object graph lớn ngoài dự kiến.
- Optimization dựa trên profile thay vì suy đoán.

### Tiêu chí hoàn thành

- Phân biệt allocation pressure và leak.
- Tìm retention path của object bị giữ.
- Đo GC/latency impact.
- Chứng minh memory ổn định sau thay đổi.

Đọc sâu: [Garbage Collector](/dotnet-core/garbage-collector).

---

## 5. Hosting, Kestrel và graceful lifecycle

### Mục tiêu

Hiểu application behavior từ lúc nhận connection đến startup, readiness và shutdown.

### Các boundary vận hành

- Reverse proxy/load balancer.
- Kestrel connection và request limit.
- Forwarded header.
- Request timeout và body limit.
- Health, liveness và readiness.
- Application startup.
- Graceful shutdown.

### Deployment-safe lifecycle

Một instance cần:

1. Khởi động dependency bắt buộc.
2. Chỉ báo ready khi có thể nhận traffic.
3. Ngừng nhận request/job mới khi shutdown.
4. Hoàn tất hoặc chuyển giao operation đang chạy.
5. Flush telemetry trong thời gian cho phép.
6. Thoát trước shutdown deadline.

### Review checklist

- Forwarded header chỉ tin trusted proxy.
- Health check không gây tải lớn.
- Readiness phản ánh khả năng phục vụ traffic.
- Worker dừng nhận job trước khi process thoát.
- Request/job có shutdown cancellation.
- Shutdown timeout phù hợp operation duration.

### Tiêu chí hoàn thành

- Mô phỏng rolling deployment.
- Chứng minh request/job không mất ngoài delivery contract.
- Phân biệt liveness và readiness.
- Có telemetry cho startup/shutdown failure.

---

## 6. Multi-instance correctness

### Mục tiêu

Loại bỏ các giả định chỉ đúng trên một process.

### Các giả định cần kiểm tra

- In-memory lock.
- Static counter.
- Local cache.
- Local file.
- In-process scheduler.
- Sticky session.
- Singleton state.

Khi chạy nhiều instance, mỗi process có memory và lifecycle riêng. Shared invariant cần coordination tại shared system phù hợp: database, message broker, distributed cache hoặc coordination service.

### Thiết kế sequence/counter

Các lựa chọn:

| Cách | Đặc điểm |
|---|---|
| Database sequence | Atomic, hiệu quả, có thể có gap |
| Counter row + atomic update | Kiểm soát scope, có contention |
| Range allocation | Giảm contention, chấp nhận gap |
| Redis atomic increment | Nhanh, cần xác định durability/source of truth |

### Review checklist

- Shared invariant không dựa vào local memory.
- Database có unique constraint.
- Initialization race được xử lý.
- Counter hotspot được đo.
- Failure sau khi cấp số có semantics rõ.
- Test chạy nhiều process/instance thật.

### Tiêu chí hoàn thành

- Tái hiện duplicate khi scale-out.
- Chọn coordination boundary phù hợp.
- Chứng minh correctness bằng concurrent multi-instance test.

Đọc sâu: [Sinh mã nghiệp vụ khi chạy nhiều instance](/dotnet-core/case-studies/multi-instance-code-generation).

---

## 7. Distributed consistency và messaging

### Mục tiêu

Thiết kế state transition khi một business operation đi qua nhiều storage hoặc service.

### Failure model

Với database và message broker:

```text
Database commit thành công, publish thất bại
Publish thành công, process crash trước khi ghi nhận
Consumer xử lý thành công, acknowledge thất bại
Message đến trùng hoặc sai thứ tự
```

### Outbox

Business state và outbox record được commit cùng database transaction. Publisher đọc outbox và gửi message sau commit.

Outbox giải quyết khoảng trống giữa database commit và publish, nhưng vẫn cần:

- Idempotent publisher/consumer.
- Retry và backoff.
- Ordering scope.
- Cleanup/retention.
- Monitoring backlog.

### Inbox/deduplication

Consumer lưu message identity hoặc operation identity để phát hiện redelivery. Deduplication scope và retention phải phù hợp delivery contract.

### Delivery semantics

Thiết kế nên mô tả cụ thể:

- Message có thể được giao ít nhất một lần.
- Duplicate được xử lý ở đâu.
- Ordering được đảm bảo trong phạm vi nào.
- Khi nào operation được xem là hoàn tất.
- Reconciliation sửa sai lệch thế nào.

### Tiêu chí hoàn thành

- Mô tả state tại mọi partial failure.
- Triển khai outbox/inbox cho một flow.
- Chứng minh duplicate delivery an toàn.
- Có metric và runbook cho backlog.

Đọc sâu:

- [Data Consistency Patterns](/system-design/data-consistency-patterns/theory)
- [Background Services & Workers](/dotnet-core/background-services-workers)

---

## 8. Performance và capacity

### Mục tiêu

Chuyển performance discussion từ cảm giác sang workload model và số liệu.

### Workload model

Ghi rõ:

- Request rate trung bình và peak.
- Read/write ratio.
- Payload size.
- Concurrent connection.
- Data volume và growth rate.
- Latency target.
- Dependency quota.
- Instance resource limit.

### Bottleneck workflow

1. Xác định user impact và latency percentile.
2. Phân đoạn thời gian bằng trace.
3. Kiểm tra saturation tại từng resource.
4. Tạo hypothesis.
5. Profile đúng workload.
6. Thay đổi một yếu tố.
7. Load test lại.
8. Ghi capacity mới và bottleneck tiếp theo.

### Review checklist

- Sử dụng percentile thay vì chỉ average.
- Load test phản ánh traffic shape.
- Dataset phản ánh production scale.
- Error rate được đo cùng throughput.
- Queue và pool saturation có metric.
- Performance regression có baseline.

### Tiêu chí hoàn thành

- Viết workload model.
- Xác định bottleneck bằng evidence.
- Tạo capacity report.
- Đề xuất scale-up, scale-out hoặc optimization có trade-off rõ.

---

## 9. Observability và incident response

### Mục tiêu

Thiết kế tín hiệu giúp phát hiện, khoanh vùng và phục hồi sự cố.

### Signal hierarchy

| Lớp | Ví dụ |
|---|---|
| User impact | Error rate, latency, failed business operation |
| Application | Request, queue, dependency, exception |
| Runtime | CPU, memory, GC, Thread Pool |
| Infrastructure | Container restart, network, disk |

Alert nên bắt đầu từ user impact và saturation có hành động rõ ràng.

### Incident workflow

1. Xác nhận phạm vi và tác động.
2. Ổn định hệ thống.
3. Thu thập timeline và evidence.
4. Khoanh vùng layer gây lỗi.
5. Mitigate hoặc rollback.
6. Xác minh recovery.
7. Phân tích root cause và contributing factor.
8. Bổ sung guardrail, test, telemetry và runbook.

### Tiêu chí hoàn thành

- Dashboard nối user impact với runtime/dependency signal.
- Alert có owner và action.
- Runbook có bước xác minh và rollback.
- Post-incident action sửa system condition, không chỉ sửa symptom.

Đọc sâu: [Observability & Debug Production](/backend-engineering/observability-debug-production).

---

## 10. Architecture, security và change management

### Architecture decision

Một quyết định kiến trúc cần ghi:

- Context và constraint.
- Invariant/failure cần xử lý.
- Các lựa chọn.
- Trade-off.
- Quyết định.
- Consequence.
- Tín hiệu cần review lại.

### Security

Threat model các flow quan trọng:

- Asset cần bảo vệ.
- Trust boundary.
- Caller và capability.
- Abuse case.
- Detection và response.

### Migration và compatibility

Thay đổi production cần xem xét:

- Backward-compatible API.
- Expand-and-contract database migration.
- Old/new instance chạy đồng thời.
- Message schema evolution.
- Feature flag và gradual rollout.
- Rollback khi schema đã thay đổi.

### Tiêu chí hoàn thành

- Viết Architecture Decision Record cho một trade-off thật.
- Threat-model một command quan trọng.
- Lập migration/rollout plan có compatibility window.
- Diễn tập rollback.

---

## 11. Capstone — Multi-instance Order Platform

Mở rộng hệ thống từ chặng Production Correctness.

### Yêu cầu

- API và worker chạy nhiều instance.
- Outbox/inbox cho business event.
- Counter/sequence không phụ thuộc process memory.
- Runtime dashboard cho Thread Pool, GC và request.
- Load test theo workload model.
- SLO và alert cho critical operation.
- Expand-and-contract migration.
- Runbook cho dependency outage và queue backlog.

### Kịch bản kiểm chứng

1. Scale API từ một lên nhiều instance.
2. Restart instance trong lúc xử lý request/job.
3. Message được giao trùng và sai thứ tự.
4. Database hoặc broker gián đoạn.
5. Allocation rate tăng theo một workload cụ thể.
6. Thread Pool queue tăng do blocking dependency.
7. Rolling deployment với hai version cùng chạy.
8. Rollback sau khi migration bắt đầu.

Mỗi kịch bản cần expected behavior, telemetry và recovery procedure.

---

## 12. Checklist hoàn thành

### Runtime

- [ ] Phân loại được CPU, I/O và contention workload.
- [ ] Điều tra được Thread Pool starvation.
- [ ] Phân biệt allocation pressure và retained-memory issue.
- [ ] Kết luận performance dựa trên profile và metric.

### Distributed correctness

- [ ] Shared invariant không phụ thuộc local memory.
- [ ] Multi-instance race được kiểm thử.
- [ ] Consistency model được ghi rõ.
- [ ] Duplicate/redelivery có xử lý.
- [ ] Outbox/inbox backlog được quan sát.

### Operations

- [ ] Có workload model và capacity report.
- [ ] SLO/alert phản ánh user impact.
- [ ] Deployment hỗ trợ graceful shutdown.
- [ ] Migration có compatibility và rollback plan.
- [ ] Critical incident có runbook.

### Technical leadership

- [ ] Quyết định kiến trúc ghi rõ trade-off.
- [ ] Security threat được đánh giá.
- [ ] Review chỉ ra invariant và failure mode.
- [ ] Post-incident action cải thiện guardrail của hệ thống.

---

## 13. Chuẩn năng lực Senior

Năng lực Senior được thể hiện qua khả năng:

- Nhìn thấy behavior xuyên runtime, data và distributed boundary.
- Biến assumption thành metric, test hoặc operational control.
- Chọn giải pháp đơn giản nhất vẫn bảo vệ đủ invariant.
- Dẫn dắt thay đổi có migration và rollback path.
- Giảm thời gian phát hiện, chẩn đoán và phục hồi sự cố.
- Nâng chất lượng quyết định của cả team.

Kết quả cuối cùng là một hệ thống có behavior giải thích được, failure được dự liệu và quyết định kỹ thuật có thể kiểm chứng.
