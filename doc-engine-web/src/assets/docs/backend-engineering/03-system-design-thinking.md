# System Design cho Middle/Senior: Cách phân tích, đánh giá và chọn giải pháp

> Mục tiêu không phải là học thuộc nhiều công nghệ, mà là hình thành cách suy nghĩ có căn cứ khi gặp một bài toán thực tế.

---

## 1. Mục tiêu của System Design

System Design là quá trình phân tích một bài toán phần mềm để đưa ra kiến trúc và giải pháp phù hợp với bối cảnh thực tế.

Một thiết kế tốt cần trả lời được các câu hỏi sau:

- Hệ thống cần giải quyết vấn đề gì?
- Dữ liệu cốt lõi là gì?
- Tải đọc/ghi dự kiến là bao nhiêu?
- Chỗ nào có thể trở thành bottleneck?
- Yêu cầu về độ đúng, độ trễ, realtime và khả năng khôi phục là gì?
- Có những phương án nào từ đơn giản đến phức tạp?
- Mỗi phương án giải quyết vấn đề gì và tạo thêm rủi ro gì?
- Vì sao phương án cuối cùng là hợp lý với hiện tại?

Điểm khác biệt của tư duy Middle/Senior là không chọn giải pháp theo cảm tính hoặc vì công nghệ đó phổ biến. Giải pháp được chọn phải xuất phát từ tải, dữ liệu, consistency, latency, failure mode và khả năng vận hành của team.

---

## 2. Nguyên tắc tư duy cốt lõi

### 2.1. Không bắt đầu từ công nghệ

Không nên bắt đầu bằng câu hỏi:

```text
Bài này dùng Redis được không?
Bài này có cần RabbitMQ không?
Bài này có nên dùng WebSocket không?
```

Nên bắt đầu bằng các câu hỏi:

```text
Dữ liệu nào cần đúng tuyệt đối?
Dữ liệu nào có thể chậm vài giây?
Tải đọc nhiều hay ghi nhiều?
Người dùng cần realtime đến mức nào?
Nếu một thành phần lỗi thì hệ thống sai dữ liệu hay chỉ chậm cập nhật?
```

Công nghệ chỉ là công cụ để xử lý một vấn đề cụ thể:

| Vấn đề | Nhóm giải pháp thường gặp |
|---|---|
| Đọc nhiều, dữ liệu lặp lại | Cache, read model, projection |
| Cần cập nhật gần realtime | WebSocket, Server-Sent Events, polling tối ưu |
| Xử lý phụ không cần nằm trong request chính | Queue, background worker |
| Không muốn mất event sau khi ghi DB | Outbox Pattern |
| Consumer có thể nhận trùng message | Idempotency |
| Ghi đồng thời vào cùng tài nguyên | Transaction, lock, unique constraint, atomic counter |
| Query DB chậm | Index, query optimization, denormalization, caching |

---

### 2.2. Thiết kế theo bối cảnh, không thiết kế theo “độ xịn”

Một hệ thống có thể dùng ít công nghệ hơn nhưng vẫn là thiết kế tốt nếu nó phù hợp với tải thực tế.

Ví dụ:

```text
Nếu toàn hệ thống chỉ có vài trăm lượt thao tác/ngày,
việc thêm Kafka, CQRS đầy đủ, nhiều service độc lập có thể làm tăng complexity
nhiều hơn lợi ích thực tế.
```

Ngược lại, một hệ thống có read rất lớn, nhiều client realtime, nhiều luồng xử lý bất đồng bộ thì việc chỉ dùng một API query DB trực tiếp có thể không còn hợp lý.

---

## 3. Quy trình phân tích một bài toán System Design

Khi gặp một bài toán mới, có thể đi theo trình tự sau.

---

### Bước 1: Làm rõ bài toán

Cần mô tả ngắn gọn hệ thống cần làm gì và phục vụ ai.

Checklist:

```text
- Người dùng chính là ai?
- Họ thao tác gì?
- Hệ thống cần trả về thông tin gì?
- Thao tác nào là quan trọng nhất?
- Có workflow hoặc state transition không?
```

Ví dụ mô tả ngắn:

```text
Hệ thống hàng chờ khám bệnh cho phép lễ tân tạo lượt khám,
bác sĩ gọi số, bệnh nhân theo dõi số đang khám và số người chờ trước.
```

Ở bước này chưa cần nói Redis, RabbitMQ hay WebSocket.

---

### Bước 2: Xác định dữ liệu cốt lõi

Dữ liệu cốt lõi là những entity và trạng thái chính mà hệ thống cần quản lý.

Ví dụ với bài toán hàng chờ khám bệnh:

```text
QueueTicket
- Id
- TenantId
- RoomId
- PatientId
- QueueNumber
- Status
- CreatedAt
- CalledAt
- StartedAt
- FinishedAt
```

Trạng thái có thể là:

```text
Waiting -> Calling -> InProgress -> Done
Waiting -> Skipped
Calling -> Skipped
Waiting -> Cancelled
```

Việc xác định state giúp team tránh thiết kế mơ hồ. Nếu state không rõ, hệ thống rất dễ phát sinh lỗi ở các case chuyển trạng thái.

---

### Bước 3: Ghi ra các invariant

Invariant là các luật không được phép bị phá vỡ.

Ví dụ:

```text
- Một phòng trong một ngày không được có hai số thứ tự trùng nhau.
- Một lượt đã Done không được quay lại Waiting nếu không có action nghiệp vụ rõ ràng.
- Một bệnh nhân không được có hai ticket active trong cùng một phòng nếu rule nghiệp vụ không cho phép.
- DB là nguồn dữ liệu đúng cuối cùng.
```

Invariant rất quan trọng vì nó quyết định nên đặt logic bảo vệ ở đâu.

Ví dụ, nếu không được trùng số thứ tự, chỉ check bằng code là chưa đủ. Cần thêm unique constraint ở DB:

```text
UNIQUE(TenantId, RoomId, WorkingDate, QueueNumber)
```

Tư duy ở đây là:

```text
Luật quan trọng nên được bảo vệ ở tầng dữ liệu hoặc transaction,
không chỉ dựa vào code application.
```

---

### Bước 4: Xác định yêu cầu phi chức năng

Yêu cầu phi chức năng giúp đánh giá giải pháp có phù hợp hay không.

Các nhóm cần ghi:

```text
Latency:
- API cần trả trong bao lâu?
- Realtime update chấp nhận trễ bao nhiêu giây?

Correctness:
- Dữ liệu nào phải đúng tuyệt đối?
- Dữ liệu nào có thể eventual consistency?

Availability:
- Thành phần nào lỗi thì hệ thống vẫn phải chạy?
- Có fallback không?

Scalability:
- Số người dùng đồng thời?
- Số request/giây?
- Số event/ngày?

Operability:
- Team có monitor được không?
- Có dashboard/log để debug không?
```

Ví dụ:

```text
Latency:
- API lấy trạng thái hàng chờ < 200ms.
- App nhận cập nhật trong 1–3 giây là chấp nhận được.

Correctness:
- Số thứ tự không được trùng.
- Trạng thái cuối cùng trong DB phải đúng.
- Cache có thể lệch ngắn hạn nhưng phải rebuild được.
```

---

## 4. Tính toán tải cơ bản

Một trong những kỹ năng quan trọng của Middle/Senior là biết ước lượng tải trước khi chọn giải pháp.

Không cần tính quá chính xác ngay từ đầu. Cần tính đủ để biết hệ thống đang ở mức nhỏ, vừa hay lớn.

---

### 4.1. Công thức thường dùng

```text
QPS = số request / số giây

Read QPS = số user đồng thời / chu kỳ refresh

Event count = số entity * số lần thay đổi trạng thái

Fanout message = số event * số client nhận event

Storage/ngày = số record/ngày * kích thước trung bình mỗi record
```

---

### 4.2. Ví dụ tính write load

Giả sử:

```text
500 bệnh nhân/buổi
Mỗi bệnh nhân có khoảng 4 event:
- Lấy số
- Gọi số
- Bắt đầu khám
- Kết thúc khám
```

Tổng event:

```text
500 * 4 = 2.000 event/buổi
```

Nếu một buổi kéo dài 4 giờ:

```text
2.000 / 4 giờ = 500 event/giờ
500 / 3600 ≈ 0.14 event/giây
```

Con số trung bình rất nhỏ, nhưng cần xét thêm burst.

Ví dụ đầu giờ có nhiều quầy lấy số cùng lúc:

```text
10 quầy * 1 request/giây = 10 write/giây
```

Kết luận:

```text
Write load không quá lớn.
Điểm cần chú ý không phải throughput ghi,
mà là chống trùng số khi nhiều request xảy ra đồng thời.
```

---

### 4.3. Ví dụ tính read load

Giả sử:

```text
500 bệnh nhân mở app theo dõi hàng chờ.
Mỗi app refresh 5 giây/lần.
```

Read QPS:

```text
500 / 5 = 100 request/giây
```

Nếu 1.000 client cùng mở app:

```text
1.000 / 5 = 200 request/giây
```

Kết luận:

```text
Read load có thể lớn hơn write load rất nhiều.
Nếu mỗi request đều query DB để tính toán trạng thái hàng chờ,
DB sẽ chịu nhiều truy vấn lặp lại không cần thiết.
```

Đây là cơ sở để cân nhắc cache, snapshot hoặc push realtime.

---

## 5. Phân tích giải pháp từ đơn giản đến phù hợp

Một thiết kế tốt thường không nhảy thẳng vào phương án phức tạp nhất. Nên phân tích từ phương án thô sơ, chỉ ra giới hạn, sau đó thêm thành phần để xử lý đúng vấn đề.

---

### 5.1. Phương án 1: API query DB trực tiếp

Mô hình:

```text
Client -> API -> Database
```

Cách hoạt động:

```text
Client gọi API định kỳ.
API query DB để tính trạng thái hiện tại.
API trả kết quả cho client.
```

Ưu điểm:

```text
- Đơn giản.
- Dễ code.
- Dễ debug.
- Dữ liệu lấy trực tiếp từ source of truth.
```

Nhược điểm:

```text
- Nhiều request đọc lặp lại.
- DB phải xử lý cả nghiệp vụ ghi và realtime read.
- Khi nhiều client polling, query DB tăng nhanh.
- Latency phụ thuộc query và index.
```

Phù hợp khi:

```text
- MVP nhỏ.
- Số client ít.
- Không yêu cầu realtime cao.
- Team muốn ưu tiên đơn giản trước.
```

Không phù hợp khi:

```text
- Nhiều client cùng xem trạng thái.
- Dữ liệu thay đổi ít nhưng bị đọc liên tục.
- DB đã có nhiều workload nghiệp vụ khác.
```

---

### 5.2. Phương án 2: DB + Redis snapshot

Mô hình:

```text
Client -> API -> Redis
              -> Database fallback
```

Cách hoạt động:

```text
Khi trạng thái hàng chờ thay đổi:
- Ghi dữ liệu đúng vào DB.
- Cập nhật snapshot trạng thái vào Redis.

Khi client lấy trạng thái:
- API đọc Redis.
- Nếu Redis miss hoặc dữ liệu lỗi, API rebuild từ DB.
```

Ví dụ Redis snapshot:

```json
{
  "roomId": 101,
  "currentNumber": 15,
  "waitingCount": 8,
  "lastUpdatedAt": "2026-06-28T09:00:00+07:00"
}
```

Ưu điểm:

```text
- Giảm read trực tiếp vào DB.
- API trả nhanh hơn.
- Phù hợp với dữ liệu được đọc nhiều và thay đổi theo event.
- Có thể rebuild cache từ DB.
```

Nhược điểm:

```text
- Có thể lệch ngắn hạn giữa DB và Redis.
- Cần cơ chế rebuild hoặc fallback.
- Cần xác định rõ DB là source of truth.
```

Phù hợp khi:

```text
- Read nhiều hơn write.
- Dữ liệu trạng thái được đọc lặp lại.
- Chấp nhận eventual consistency ngắn hạn.
```

Nguyên tắc quan trọng:

```text
Redis không phải nguồn dữ liệu đúng cuối cùng.
Redis chỉ là read model/cache để phục vụ truy vấn nhanh.
```

---

### 5.3. Phương án 3: DB + Redis + WebSocket

Mô hình:

```text
Command API -> Database
            -> Redis snapshot
            -> WebSocket push

Client -> nhận update qua WebSocket
Client -> gọi API lấy snapshot khi reconnect hoặc cần đồng bộ lại
```

Cách hoạt động:

```text
Khi bác sĩ gọi số hoặc trạng thái hàng chờ thay đổi:
- API ghi DB.
- Hệ thống cập nhật Redis snapshot.
- Hệ thống push event đến các client đang theo dõi phòng đó.
```

Ví dụ event push:

```json
{
  "eventType": "QueueStateChanged",
  "roomId": 101,
  "currentNumber": 15,
  "waitingCount": 8,
  "version": 120
}
```

Ưu điểm:

```text
- Giảm polling từ client.
- Trải nghiệm realtime tốt hơn.
- DB không bị kéo vào các truy vấn lặp lại.
- Client nhận update khi có thay đổi thực sự.
```

Nhược điểm:

```text
- Phức tạp hơn polling.
- Phải xử lý reconnect.
- Client có thể miss event nếu mất mạng.
- Cần cơ chế lấy snapshot mới nhất.
```

Nguyên tắc quan trọng:

```text
WebSocket chỉ là kênh thông báo.
Không coi WebSocket là source of truth.
Khi client reconnect, client phải gọi API lấy snapshot mới nhất.
```

Phù hợp khi:

```text
- Người dùng cần cập nhật gần realtime.
- Nhiều client cùng xem một trạng thái.
- Polling gây lãng phí request.
```

---

### 5.4. Phương án 4: DB + Outbox/Queue + Worker + Redis + WebSocket

Mô hình:

```text
Command API
  -> Database transaction
       -> ghi dữ liệu nghiệp vụ
       -> ghi OutboxEvent

Worker
  -> đọc OutboxEvent hoặc nhận message từ queue
  -> cập nhật Redis projection
  -> push WebSocket
  -> retry khi lỗi
```

Cách hoạt động:

```text
Request chính chỉ đảm bảo dữ liệu nghiệp vụ được ghi đúng.
Các xử lý phụ như cập nhật read model, push realtime, gửi notification
được worker xử lý bất đồng bộ.
```

Ưu điểm:

```text
- Tách request chính khỏi xử lý phụ.
- Có thể retry khi cập nhật Redis hoặc push WebSocket lỗi.
- Giảm nguy cơ mất event nếu dùng Outbox đúng.
- Dễ mở rộng thêm consumer khác trong tương lai.
```

Nhược điểm:

```text
- Kiến trúc phức tạp hơn.
- Có độ trễ eventual consistency.
- Phải xử lý duplicate message.
- Phải monitor queue lag, retry, dead-letter.
```

Phù hợp khi:

```text
- Event không được mất.
- Có nhiều xử lý phụ sau một thay đổi nghiệp vụ.
- Hệ thống cần retry đáng tin cậy.
- Team đã có năng lực vận hành queue/worker.
```

Không nên dùng chỉ vì:

```text
- Muốn kiến trúc trông chuyên nghiệp hơn.
- Tải thực tế rất nhỏ nhưng team chưa có monitoring tốt.
- Chưa xử lý được idempotency và retry.
```

---

## 6. Cách so sánh và chọn giải pháp

Khi có nhiều phương án, nên so sánh theo các tiêu chí sau:

| Tiêu chí | Câu hỏi cần trả lời |
|---|---|
| Độ đơn giản | Team có dễ hiểu, dễ code, dễ debug không? |
| Latency | Người dùng nhận kết quả nhanh hơn hay chậm hơn? |
| Consistency | Dữ liệu có thể lệch không? Lệch bao lâu? |
| Reliability | Lỗi giữa chừng có mất dữ liệu/event không? |
| Scalability | Khi user/request tăng thì mở rộng bằng cách nào? |
| Operability | Có monitor, retry, alert, dashboard không? |
| Cost | Chi phí hạ tầng và chi phí vận hành tăng bao nhiêu? |
| Team readiness | Team đã quen công nghệ này chưa? |

Ví dụ bảng so sánh:

| Phương án | Ưu điểm chính | Rủi ro chính | Khi nên chọn |
|---|---|---|---|
| DB polling | Đơn giản, dễ debug | DB chịu read lặp lại | MVP nhỏ |
| DB + Redis | Read nhanh, giảm tải DB | Cache lệch DB | Read nhiều, chấp nhận stale ngắn |
| DB + Redis + WebSocket | Realtime tốt, giảm polling | Reconnect/miss event | Nhiều client cần cập nhật realtime |
| DB + Outbox/Queue + Worker | Retry tốt, ít mất event | Complexity cao | Production cần event reliability |

---

## 7. Failure mode cần ghi rõ

Một thiết kế chưa hoàn chỉnh nếu chưa trả lời được: “Khi nó lỗi thì sao?”

Checklist failure mode:

```text
- DB chậm thì API phản ứng thế nào?
- Redis mất dữ liệu thì rebuild từ đâu?
- WebSocket disconnect thì client làm gì?
- Worker chết thì event có bị mất không?
- Queue bị backlog thì hệ thống có hiển thị stale không?
- Message bị xử lý trùng thì có gây sai dữ liệu không?
- Event đến sai thứ tự thì xử lý thế nào?
```

Ví dụ cách ghi:

```text
Redis lỗi:
- API fallback đọc DB.
- Sau khi Redis hoạt động lại, hệ thống rebuild snapshot từ DB.

WebSocket disconnect:
- Client reconnect.
- Sau khi reconnect, client gọi API lấy snapshot mới nhất.

Worker xử lý trùng event:
- Mỗi event có EventId hoặc Version.
- Consumer kiểm tra trước khi apply.
- Event đã xử lý thì bỏ qua.
```

---

## 8. Metrics cần theo dõi

Nếu không đo được, rất khó biết thiết kế có đang hoạt động tốt hay không.

Các metrics nên có:

```text
API:
- Request rate
- Error rate
- Latency p50/p95/p99

Database:
- Query latency
- Slow queries
- Lock wait
- Connection pool usage

Redis:
- Hit rate
- Miss rate
- Memory usage
- Snapshot age

Queue/Worker:
- Queue depth
- Consumer lag
- Processing time p50/p95/p99
- Retry count
- Dead-letter count

WebSocket:
- Active connections
- Reconnect count
- Messages sent/second
- Failed push count
```

Với bài toán realtime, nên đặc biệt chú ý:

```text
- Snapshot age: trạng thái Redis đang chậm hơn DB bao lâu?
- Queue lag: event mới nhất mất bao lâu để được xử lý?
- Client reconnect rate: có đang bị mất kết nối hàng loạt không?
```

---

## 9. Template ghi sổ khi phân tích một bài toán

Có thể dùng template sau cho mỗi bài System Design.

```text
# Problem
Mô tả ngắn gọn bài toán.

# Users / Actors
Ai sử dụng hệ thống?
Ai tạo dữ liệu?
Ai đọc dữ liệu?

# Functional Requirements
Các chức năng chính.

# Non-functional Requirements
Latency, correctness, availability, scalability, security, operability.

# Core Data Model
Entity chính, field chính, quan hệ chính.

# State Transition
Các trạng thái và rule chuyển trạng thái.

# Invariants
Các luật không được phép sai.

# Load Estimation
Read QPS, write QPS, event count, storage, fanout.

# Bottlenecks
Chỗ nào có thể nghẽn: DB read, DB write, lock, queue, websocket, external API.

# Naive Solution
Giải pháp đơn giản nhất.
Ưu điểm.
Nhược điểm.
Khi nào đủ dùng.

# Improved Solutions
Mỗi lần thêm một thành phần, phải ghi:
- Nó giải quyết vấn đề gì?
- Nó tạo thêm rủi ro gì?
- Khi nào nên dùng?

# Final Decision
Chọn phương án nào cho phase hiện tại?
Vì sao?
Không chọn gì? Vì sao?

# Failure Handling
Từng thành phần lỗi thì xử lý thế nào?

# Metrics / Monitoring
Cần đo gì để biết hệ thống đang ổn?

# Open Questions
Những điểm cần xác nhận thêm với business/devops/team.
```

---

## 10. Ví dụ áp dụng ngắn: Hàng chờ khám bệnh

Phần này chỉ là ví dụ minh họa sau khi đã có khung phân tích. Không nên bắt đầu tài liệu bằng ví dụ quá chi tiết vì người mới dễ bị ngợp.

---

### 10.1. Problem

```text
Xây dựng hệ thống hàng chờ khám bệnh theo phòng.
Bệnh nhân có thể theo dõi số đang khám và số người chờ trước.
Nhân viên y tế có thể tạo lượt, gọi số, bỏ qua, hoàn tất lượt khám.
```

---

### 10.2. Load estimation

```text
100 phòng khám.
500 bệnh nhân/buổi.
Mỗi bệnh nhân khoảng 4 state change.
=> 2.000 event/buổi.

Nếu 500 client mở app và polling 5 giây/lần:
=> 100 read request/giây.
```

Nhận xét:

```text
Write không lớn.
Read có thể lớn hơn write do client xem trạng thái liên tục.
Dữ liệu thay đổi theo event, không thay đổi liên tục từng mili-giây.
```

---

### 10.3. Invariants

```text
- Không trùng số thứ tự trong cùng phòng/ngày.
- Trạng thái DB là nguồn đúng cuối cùng.
- Cache/WebSocket có thể chậm nhưng phải đồng bộ lại được.
```

---

### 10.4. Phân tích phương án

Phương án ban đầu:

```text
Client polling API.
API query DB trực tiếp.
```

Đánh giá:

```text
Đơn giản, phù hợp MVP.
Nhưng nếu nhiều client cùng polling, DB phải xử lý nhiều read lặp lại.
```

Phương án cải tiến:

```text
DB lưu dữ liệu đúng.
Redis lưu snapshot trạng thái hàng chờ.
API đọc Redis, fallback DB.
```

Đánh giá:

```text
Giảm read DB.
Chấp nhận cache stale ngắn hạn.
Cần rebuild snapshot từ DB khi Redis miss hoặc lỗi.
```

Phương án realtime:

```text
Khi trạng thái thay đổi, hệ thống push WebSocket đến client theo dõi phòng đó.
Client reconnect thì gọi API lấy snapshot mới nhất.
```

Đánh giá:

```text
Giảm polling.
Trải nghiệm realtime tốt hơn.
Cần xử lý reconnect và miss event.
```

Phương án robust hơn:

```text
API ghi DB và OutboxEvent trong cùng transaction.
Worker xử lý event để update Redis và push WebSocket.
```

Đánh giá:

```text
Tăng độ tin cậy của event và khả năng retry.
Nhưng tăng complexity, cần idempotency và monitoring.
```

---

### 10.5. Quyết định đề xuất

```text
Phase 1:
- DB là source of truth.
- Redis lưu snapshot hàng chờ theo phòng.
- WebSocket push thay đổi cho client.
- Client reconnect thì fetch snapshot mới nhất từ API.

Phase 2:
- Thêm Outbox/Queue nếu cần đảm bảo event không mất,
  cần retry rõ ràng, hoặc có nhiều consumer phụ thuộc event hàng chờ.
```

Lý do:

```text
Tải ghi không quá lớn nên chưa cần kiến trúc quá nặng ngay từ đầu.
Read và realtime là vấn đề chính, nên Redis snapshot + WebSocket là đủ hợp lý cho phase đầu.
Outbox/Queue phù hợp khi yêu cầu reliability và vận hành đã rõ hơn.
```

---

## 11. Checklist review thiết kế

Trước khi chốt một thiết kế, có thể tự kiểm tra bằng checklist sau:

```text
[ ] Đã mô tả rõ problem chưa?
[ ] Đã xác định actor chưa?
[ ] Đã xác định entity và state chính chưa?
[ ] Đã ghi invariant chưa?
[ ] Đã tính read/write/event/fanout cơ bản chưa?
[ ] Đã biết read-heavy hay write-heavy chưa?
[ ] Đã phân tích giải pháp đơn giản nhất chưa?
[ ] Đã chỉ ra vì sao giải pháp đơn giản chưa đủ chưa?
[ ] Mỗi thành phần thêm vào có lý do rõ ràng chưa?
[ ] Có phân tích trade-off không?
[ ] Có failure handling không?
[ ] Có metrics để kiểm chứng không?
[ ] Có nói rõ phase hiện tại chọn gì và chưa chọn gì không?
```

---

## 12. Kết luận

Tư duy System Design ở mức Middle/Senior không nằm ở việc biết thật nhiều công nghệ, mà nằm ở khả năng:

```text
- Làm rõ bài toán.
- Xác định dữ liệu và invariant.
- Ước lượng tải.
- Tìm bottleneck.
- Đưa ra nhiều phương án.
- Phân tích trade-off.
- Chọn giải pháp vừa đủ cho bối cảnh hiện tại.
- Biết hệ thống sẽ lỗi ở đâu và cần đo gì để kiểm chứng.
```

Một câu cần nhớ:

```text
Không thêm công nghệ vì nó “xịn”.
Chỉ thêm khi nó giải quyết một bottleneck hoặc failure mode cụ thể,
và team có khả năng vận hành phần complexity mới đó.
```
