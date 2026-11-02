# System Design Learning Path

> Đây là trang bắt đầu của toàn bộ phần System Design. Đừng học theo kiểu thuộc tên công nghệ. Hãy học theo một vòng lặp cố định: **làm rõ bài toán → lượng hóa tải → thiết kế bản đơn giản → tìm điểm gãy → nâng cấp có lý do → kiểm chứng trade-off**.

---

## 1. Scope and Outcomes

Sau lộ trình này, mục tiêu không phải là có thể vẽ thật nhiều box. Mục tiêu là có thể:

1. Chuyển một yêu cầu mơ hồ thành functional requirements, non-functional requirements và invariant.
2. Ước lượng tải đủ tốt để biết hệ thống đang giải quyết bài toán ở quy mô nào.
3. Thiết kế phiên bản nhỏ nhất có thể chạy và giải thích vì sao nó đủ dùng.
4. Nhìn ra bottleneck, race condition, partial failure và dữ liệu có nguy cơ sai.
5. Chọn database, cache, queue, cluster hoặc consistency pattern từ nhu cầu thực tế.
6. Trình bày trade-off về correctness, latency, availability, complexity, cost và operability.
7. Đề xuất lộ trình tiến hóa thay vì nhảy thẳng vào kiến trúc phân tán.

### Competency Matrix

| Level | Biểu hiện cần đạt |
|---|---|
| Foundation | Mô tả được request flow, data flow, transaction boundary và các thành phần cơ bản |
| Junior+ | Thiết kế được một hệ thống single-instance đúng nghiệp vụ, có data model và API rõ ràng |
| Middle | Lượng hóa tải, phát hiện điểm gãy, xử lý concurrency, retry, cache và failure có chủ đích |
| Senior | Xác lập invariant, consistency boundary, chiến lược degrade/recovery, vận hành và migration theo phase |

Một câu trả lời senior không nhất thiết nhiều component hơn. Nó có **lập luận tốt hơn** và chỉ thêm độ phức tạp khi có bằng chứng.

---

## 2. Design Workflow

Hãy dùng cùng một chuỗi câu hỏi cho mọi case study:

```text
1. Bài toán và người dùng
   ↓
2. Functional requirements + phạm vi
   ↓
3. Invariant + mức độ quan trọng của dữ liệu
   ↓
4. Load parameters + SLO
   ↓
5. Data model + API + request flow
   ↓
6. Thiết kế V1 đơn giản nhất
   ↓
7. Bottleneck + failure modes
   ↓
8. Thiết kế V2 có lý do
   ↓
9. Trade-off + observability + rollout
```

### 2.1 Requirements and Invariants

Ví dụ với hệ thống đặt lịch:

**Functional requirements**

- Người dùng xem slot trống.
- Người dùng giữ và xác nhận slot.
- Nhân viên có thể hủy hoặc đổi lịch.
- Hệ thống gửi thông báo sau khi đặt thành công.

**Ngoài phạm vi của V1**

- Gợi ý lịch bằng AI.
- Thanh toán đa tiền tệ.
- Đồng bộ lịch của mọi nhà cung cấp.

**Invariant**

```text
Một bác sĩ không có hai lịch đã xác nhận trùng thời gian.
Một yêu cầu thanh toán không được thu tiền hai lần.
Thông báo có thể đến trễ, nhưng lịch hẹn đã xác nhận không được mất.
```

Invariant là cầu nối giữa nghiệp vụ và kỹ thuật. Nếu chưa biết điều gì tuyệt đối không được sai, ta chưa đủ dữ liệu để chọn transaction, lock hay consistency model.

### 2.2 Capacity and SLO

Tối thiểu cần trả lời:

```text
DAU / MAU là bao nhiêu?
Peak read/write RPS là bao nhiêu?
Read/write ratio là bao nhiêu?
p95/p99 latency mục tiêu là bao nhiêu?
Dữ liệu tăng bao nhiêu mỗi ngày và cần giữ bao lâu?
Cho phép stale trong bao lâu?
RTO và RPO là bao nhiêu?
Dependency ngoài có rate limit và timeout thế nào?
```

Không cần giả vờ chính xác tuyệt đối. Ước lượng tốt là ước lượng:

- Nêu rõ giả định.
- Đúng order of magnitude.
- Dẫn tới một quyết định thiết kế.
- Có thể thay đổi khi có số liệu thật.

### 2.3 Baseline Architecture

V1 mặc định nên đủ đơn giản để team vận hành được:

```text
Client
  |
Application
  |
Relational Database
```

Sau đó mới tạo áp lực:

- Read tăng 20 lần thì phần nào chậm trước?
- Hai request ghi đồng thời có phá invariant không?
- Application chết sau khi commit nhưng trước khi trả response thì sao?
- Database tạm mất kết nối thì retry có an toàn không?
- External service chậm có giữ thread/connection quá lâu không?
- Một instance không đủ thì state cục bộ đang nằm ở đâu?

Mỗi component mới phải trả lời được: **nó giải quyết failure hoặc bottleneck cụ thể nào, và nó tạo thêm rủi ro gì?**

---

## 3. Curriculum

Lộ trình được chia thành 5 chặng. Học tuần tự ở lượt đầu; từ lượt thứ hai có thể quay lại theo lỗ hổng của bản thân.

### 3.1 Engineering Foundations

**Mục tiêu:** hiểu một request thực sự đi qua những lớp nào và dữ liệu được bảo vệ ra sao.

Học các nền tảng liên quan:

1. [TCP/IP và request flow](/network/tcp-ip/theory)
2. [Index trong database](/database/index/theory)
3. [Transaction](/database/transactions/theory)
4. [Locking và deadlock](/database/locking-deadlock/theory)
5. [Concurrency control patterns](/database/concurrency-control-patterns/theory)
6. [Architecture và layering](/backend-engineering/architecture-layering)

**Bài thực hành:** thiết kế API tạo đơn hàng trên một application và một SQL database. Chứng minh:

- Transaction boundary nằm ở đâu.
- Unique constraint nào bảo vệ dữ liệu.
- Hai request đồng thời sẽ cho kết quả gì.
- Lỗi nào trả `4xx`, lỗi nào trả `5xx`.

**Điều kiện qua chặng**

- [ ] Vẽ được request flow từ client đến database.
- [ ] Phân biệt validation, transaction và concurrency control.
- [ ] Không dùng queue/cache để che một data model chưa đúng.

---

### 3.2 Requirements, Capacity and Storage

**Mục tiêu:** bỏ thói quen chọn công nghệ trước khi hiểu tải và dữ liệu.

Học theo thứ tự:

1. [Load Parameters](/system-design/load-parameter/theory)
2. [Minh họa tính tải](/system-design/load-parameter/demo)
3. [Data Storage Strategy](/system-design/data-storage-strategy/theory)
4. [Query Tuning Workflow](/database/query-tuning-workflow/theory)
5. [Storage và I/O](/database/storage-io/theory)

**Bài thực hành:** thiết kế hệ thống rút gọn URL hoặc đặt lịch.

Deliverable bắt buộc:

```text
Functional requirements
Non-functional requirements
5-10 giả định tải có số liệu
API chính
Data model
V1 architecture
3 bottleneck có khả năng xảy ra đầu tiên
```

**Điều kiện qua chặng**

- [ ] Tính được average và peak RPS.
- [ ] Ước lượng được dung lượng dữ liệu theo 1 năm.
- [ ] Giải thích được vì sao chọn SQL/NoSQL thay vì chỉ nêu ưu điểm chung.
- [ ] Có thể nói “chưa cần scale” khi con số chưa chứng minh nhu cầu.

---

### 3.3 Correctness and Consistency

**Mục tiêu:** giữ đúng dữ liệu khi timeout, retry, duplicate request và partial failure xuất hiện.

Học theo thứ tự:

1. [Idempotency](/system-design/idempotency/theory)
2. [Data Consistency Patterns](/system-design/data-consistency-patterns/theory)
3. [Authentication và Authorization](/system-design/authenticate/theory)
4. [Production Correctness trong .NET](/dotnet-core/production-correctness)

Tập trung vào các câu hỏi:

```text
Client timeout nhưng server đã commit thì sao?
Message được giao hai lần thì sao?
DB commit thành công nhưng publish event thất bại thì sao?
Cache và database lệch nhau thì nguồn nào đúng?
Operation nào cần strong consistency?
Operation nào chấp nhận eventual consistency?
```

**Bài thực hành:** thiết kế luồng tạo payment hoặc tạo đơn có gửi thông báo.

Deliverable bắt buộc:

- Idempotency key và phạm vi uniqueness.
- State machine của nghiệp vụ.
- Transaction/consistency boundary.
- Outbox hoặc cơ chế phục hồi tương đương.
- Retry policy, backoff và dead-letter strategy.
- Reconciliation job cho dữ liệu lệch.

**Điều kiện qua chặng**

- [ ] Phân biệt retry-safe với idempotent.
- [ ] Không thực hiện network call dài bên trong database transaction nếu không có lý do đặc biệt.
- [ ] Mô tả được trạng thái hệ thống khi chết ở từng bước.
- [ ] Có cách phát hiện và sửa dữ liệu lệch, không chỉ hy vọng flow luôn thành công.

---

### 3.4 Performance and Scale

**Mục tiêu:** nâng cấp V1 dựa trên bottleneck đo được và hiểu chi phí của hệ phân tán.

Học theo thứ tự:

1. [Cache](/system-design/cache/theory)
2. [Cluster — lý thuyết](/system-design/cluster/theory)
3. [Cluster — minh họa](/system-design/cluster/demo)
4. [Observability và Debug Production](/backend-engineering/observability-debug-production)

Thứ tự tư duy nên là:

```text
Đo bottleneck
→ tối ưu query/data access
→ cache nếu read pattern phù hợp
→ tách background work nếu latency không cần đồng bộ
→ scale application
→ scale data layer khi thực sự cần
```

Không mặc định rằng cache hoặc nhiều instance luôn tốt hơn. Phải phân tích:

- Cache invalidation và stale data.
- Cache stampede, hot key và cold start.
- Session/local state khi chạy nhiều instance.
- Duplicate processing khi nhiều worker cùng nhận việc.
- Health check, load balancing và graceful shutdown.
- Backpressure, timeout, circuit breaker và degrade mode.
- Metric, log, trace và alert để biết hệ thống đang hỏng ở đâu.

**Bài thực hành:** nâng cấp bài ở chặng 1 từ V1 lên V2 khi tải tăng 20 lần.

Mỗi thay đổi phải có dạng:

```text
Tín hiệu: p95 DB latency tăng từ 80ms lên 900ms.
Nguyên nhân giả định: query đọc phổ biến scan quá nhiều dữ liệu.
Thay đổi: index/query trước; cache chỉ nếu vẫn chưa đạt SLO.
Lợi ích kỳ vọng: ...
Rủi ro mới: ...
Metric kiểm chứng: ...
Rollback: ...
```

**Điều kiện qua chặng**

- [ ] Mỗi component mới gắn với một bottleneck hoặc failure mode cụ thể.
- [ ] Nêu được cách hệ thống degrade khi dependency lỗi.
- [ ] Có observability cho cả success path và failure path.
- [ ] Có rollout/rollback thay vì “deploy rồi theo dõi”.

---

### 3.5 Case Studies

**Mục tiêu:** giải một bài toán mở từ nghiệp vụ tới vận hành, có nhiều phương án và trade-off.

Học case study theo thứ tự:

1. [Refresh cache từ nhiều nguồn](/system-design/case-studies/cache-refresh-multi-source)
2. [Hàng chờ khám bệnh](/system-design/case-studies/clinic-queue-current-load)
3. [Ký số HSM đa phòng ban](/system-design/case-studies/hsm-signing-multi-department-result)
4. [Top-K Leaderboard theo tải](/system-design/case-studies/top-k-leaderboard)
5. [Cloud Storage và File Sync](/system-design/case-studies/cloud-storage-sync)
6. [Messaging App và đồng bộ đa thiết bị](/system-design/case-studies/messaging-app)
7. [News Feed và chiến lược fan-out theo tải](/system-design/case-studies/news-feed)

Đừng chỉ đọc lời giải. Với mỗi case:

1. Chỉ đọc phần bài toán.
2. Tự viết requirements, invariant và load parameters.
3. Thiết kế V1 trong 30-45 phút.
4. Liệt kê failure modes trước khi đọc tiếp.
5. So sánh với tài liệu.
6. Ghi lại quyết định mình bỏ sót và lý do.
7. Thiết kế lại V2 trong một trang.

**Điều kiện hoàn thành**

- [ ] Có thể bảo vệ thiết kế bằng con số và invariant.
- [ ] So sánh ít nhất hai phương án thay vì tuyên bố một “best practice”.
- [ ] Phân biệt source of truth, derived data và cache.
- [ ] Có failure matrix, observability và kế hoạch rollout.
- [ ] Trình bày được cả “vì sao chọn” và “khi nào phải đổi”.

---

## 4. Practice Framework

Mỗi chủ đề nên học qua 5 lượt. Đây là cách biến kiến thức thành năng lực thiết kế:

| Lượt | Việc cần làm | Kết quả |
|---|---|---|
| 1. Hiểu | Đọc khái niệm và tự diễn giải bằng ví dụ | Không lệ thuộc định nghĩa |
| 2. Áp dụng | Đưa vào một V1 nhỏ | Biết điều kiện sử dụng |
| 3. Phá | Tạo concurrency, timeout, duplicate, overload | Thấy failure mode thật |
| 4. Sửa | Thêm cơ chế bảo vệ nhỏ nhất | Hiểu trade-off |
| 5. Bảo vệ | Trình bày quyết định và phản biện phương án khác | Hình thành tư duy senior |

### Architecture Decision Record Template

```text
Context:
Hệ thống đang có vấn đề hoặc ràng buộc gì?

Decision:
Ta chọn giải pháp nào?

Why:
Số liệu/invariant nào dẫn tới lựa chọn?

Alternatives:
Đã cân nhắc phương án nào?

Trade-offs:
Ta được gì và phải trả giá gì?

Failure modes:
Giải pháp có thể hỏng thế nào?

Verification:
Metric/test nào chứng minh nó hoạt động?

Evolution trigger:
Khi nào cần xem xét lại quyết định?
```

---

## 5. 10-Week Study Plan

Không cần chạy theo tốc độ. Mỗi tuần nên có một deliverable có thể review.

| Tuần | Trọng tâm | Deliverable |
|---|---|---|
| 1 | Request flow, network, database | Sơ đồ end-to-end và data model |
| 2 | Transaction, lock, concurrency | Demo hai request tranh chấp |
| 3 | Requirements, invariant, SLO | Design brief một trang |
| 4 | Load estimation, storage | Capacity sheet và V1 architecture |
| 5 | Idempotency, retry, timeout | Failure timeline và state machine |
| 6 | Consistency, outbox, reconciliation | Consistency boundary + recovery flow |
| 7 | Cache và performance | Cache decision record + invalidation flow |
| 8 | Cluster và scale-out | V2 architecture + scale triggers |
| 9 | Resilience, observability | Failure matrix + dashboard/alert proposal |
| 10 | Capstone | Design document hoàn chỉnh + review vòng hai |

Nhịp học phù hợp:

```text
30% đọc
50% tự thiết kế và phá thiết kế
20% trình bày, nhận phản biện và sửa
```

---

## 6. Capstone — Appointment Scheduling System

Capstone dùng xuyên suốt lộ trình để thấy một hệ thống tiến hóa thay vì học nhiều ví dụ rời nhau.

### Phase 1 — Single Instance

Thiết kế:

- Xem lịch trống.
- Giữ slot trong thời gian ngắn.
- Xác nhận/hủy lịch.
- Không đặt trùng.

Yêu cầu đầu ra:

- API contract.
- Data model và index.
- Transaction boundary.
- Concurrency strategy.

### Phase 2 — Failure and Correctness

Thêm:

- Client retry sau timeout.
- Thanh toán qua provider.
- Gửi email/SMS.
- Worker có thể xử lý message nhiều lần.

Yêu cầu đầu ra:

- Idempotency strategy.
- State machine.
- Outbox/inbox hoặc cơ chế tương đương.
- Reconciliation flow.

### Phase 3 — Scale and Resilience

Giả định:

```text
2 triệu người dùng/tháng
3.000 read RPS ở peak
300 write RPS ở peak
p95 read < 250ms
p95 booking < 800ms
Availability mục tiêu 99,95%
Provider thanh toán đôi lúc lỗi 5 phút
```

Yêu cầu đầu ra:

- V2 architecture.
- Cache decision.
- Scale-out strategy.
- Backpressure và degrade mode.
- Observability.
- Rollout từ Phase B sang Phase C không downtime.

### Phase 4 — Architecture Review

Tự phản biện:

1. Invariant nào đang chỉ được bảo vệ bằng code?
2. Có single point of failure nào?
3. Có retry nào tạo duplicate side effect?
4. Khi cache/queue/provider chết, user thấy gì?
5. Metric nào phát hiện dữ liệu sai trước khi khách hàng báo?
6. Chi phí lớn nhất đến từ đâu?
7. Component nào có thể bỏ đi nếu tải giảm 10 lần?
8. Trigger định lượng nào buộc phải đổi kiến trúc?

---

## 7. Assessment Rubric

Chấm mỗi tiêu chí từ `0` đến `3`:

| Tiêu chí | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Requirements | Mơ hồ | Có chức năng chính | Có scope và NFR | Có priority, assumption, invariant |
| Capacity | Không có số | Có số chung chung | Có peak và storage | Số liệu dẫn tới quyết định |
| Data model | Chỉ nêu DB | Có entity | Có index/constraint | Có ownership và evolution |
| Correctness | Happy path | Có transaction | Có retry/concurrency | Có recovery/reconciliation |
| Scale | Liệt kê công nghệ | Có bottleneck | Nâng cấp có lý do | Có trigger và rollout |
| Reliability | “Có retry” | Có timeout | Có degrade/backpressure | Có failure matrix và RTO/RPO |
| Operability | Không đề cập | Có logging | Có metrics/alerts | Có SLO, runbook, rollback |
| Trade-off | Khẳng định một chiều | Nêu nhược điểm | So sánh phương án | Nêu điều kiện đổi quyết định |

Tổng điểm tham khảo:

- `0-8`: đang ghi nhớ component.
- `9-15`: thiết kế được happy path ở mức Junior+.
- `16-20`: tư duy Middle khá rõ.
- `21-24`: có chiều sâu Middle/Senior; tiếp tục luyện bằng production constraint.

Điểm số không phải mục tiêu. Những ô có điểm thấp cho biết chủ đề cần quay lại.

---

## 8. 45-Minute Design Review

### 8.1 Requirements

- Ai sử dụng hệ thống?
- Ba chức năng quan trọng nhất?
- Điều gì không nằm trong scope?
- Dữ liệu nào tuyệt đối không được sai?

### 8.2 Capacity

- DAU, peak RPS, read/write ratio.
- Latency, availability, consistency.
- Data growth và retention.

### 8.3 Baseline Design

- API.
- Data model.
- Request/data flow.
- Transaction boundary.

### 8.4 Failure Analysis

- Bottleneck đầu tiên.
- Concurrency và duplicate.
- Timeout và partial failure.
- Dependency failure.

### 8.5 Revised Design

- Chỉ thêm component có lý do.
- So sánh ít nhất hai phương án quan trọng.
- Nêu consistency và failure behavior.

### 8.6 Operations and Summary

- Metrics, logs, traces, alerts.
- Rollout và rollback.
- Cost hoặc complexity lớn nhất.
- Trigger cho lần nâng cấp tiếp theo.

---

## 9. Common Design Mistakes

### Technology-First Design

Biết Redis, Kafka, Kubernetes nhưng không biết lúc nào **không nên dùng**. Cách sửa: luôn bắt đầu bằng V1 và failure mode.

### Premature Target Architecture

Nhảy thẳng tới microservices làm mất chuỗi lập luận. Cách sửa: trình bày sự tiến hóa `V1 → áp lực → V2`.

### Performance Without Correctness

Hệ thống nhanh nhưng charge hai lần hoặc mất dữ liệu vẫn là hệ thống tệ. Cách sửa: viết invariant trước SLO.

### Happy-Path-Only Design

Production phần lớn khó ở timeout, retry, race condition và dependency failure. Cách sửa: bắt buộc có failure matrix.

### Best Practices Without Context

Không có giải pháp tốt trong mọi bối cảnh. Cách sửa: ghi context, alternative và evolution trigger.

### Design Without Review

Thiết kế tốt nhưng không thể giải thích thì khó được review và khó dẫn dắt team. Cách sửa: tóm tắt mỗi design trong 5 phút, sau đó tự phản biện.

---

## 10. Recommended Starting Point

Nếu đây là lần đầu học System Design:

1. Hoàn thành phần **3.1 Engineering Foundations**.
2. Học [Load Parameters](/system-design/load-parameter/theory).
3. Chọn capstone đặt lịch và viết V1 trong một trang.
4. Mỗi chủ đề tiếp theo phải được áp lại vào cùng capstone.

Nếu đã ở level Middle:

1. Làm ngay [Assessment Rubric](#7-assessment-rubric).
2. Chọn hai tiêu chí yếu nhất.
3. Giải [case hàng chờ khám bệnh](/system-design/case-studies/clinic-queue-current-load) mà chưa đọc lời giải.
4. Viết lại thiết kế với failure matrix, observability và rollout plan.

Nếu đang hướng tới Senior:

1. Tập trung vào invariant, consistency boundary và evolution trigger.
2. Luôn đưa ra ít nhất hai phương án có điều kiện áp dụng rõ ràng.
3. Review thiết kế từ góc nhìn developer, operator, security, product và cost.
4. Luyện dẫn dắt người khác đi từ yêu cầu đến quyết định, thay vì đưa đáp án có sẵn.

> Bài tiếp theo nên đọc: [Load Parameters — Ước lượng tải trước khi chọn kiến trúc](/system-design/load-parameter/theory).
