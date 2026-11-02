# Hàng chờ khám bệnh và điều phối lượt khám

Bài toán hàng chờ khám bệnh không nên được nhìn như một API trả về `currentNumber` và `waitingCount`. Nó là một bài toán điều phối trạng thái có nhiều người cùng thao tác, nhiều màn hình cùng đọc, và nhiều ngoại lệ nghiệp vụ như bỏ lượt, gọi lại, chuyển phòng, ưu tiên, hoặc khám nhiều chặng.

Tài liệu này phân tích case theo hướng thiết kế hệ thống: bắt đầu từ input tải, xác định invariant, đánh giá các phương án, rồi mới đi vào data model, transaction, event, realtime và phase rollout. Mục tiêu là hiểu **vì sao chọn giải pháp**, không chỉ biết **giải pháp gồm những component nào**.

---

## 1. Input tính toán load parameter ban đầu

Trước khi thiết kế, phải lượng hóa tải. Với queue khám bệnh, câu hỏi không chỉ là "một ngày có bao nhiêu bệnh nhân", mà là **bao nhiêu thao tác ghi**, **bao nhiêu lượt đọc**, **đọc bằng polling hay realtime**, và **độ trễ chấp nhận được**.

```text
1. Một ngày hoặc một buổi có bao nhiêu lượt khám?
   Ví dụ: 300-500, 2.000, 10.000 lượt.

2. Giờ cao điểm có bao nhiêu lượt đến trong 1 giờ?
   Ví dụ: 300 lượt/giờ vào 7h-9h.

3. Có bao nhiêu phòng khám/quầy gọi số?
   Ví dụ: 100 phòng khám, 20 phòng khám + 5 quầy tiếp đón.

4. Có bao nhiêu client đọc trạng thái hàng chờ?
   Màn hình sảnh, màn hình phòng khám, app bệnh nhân, dashboard điều phối.

5. Client đọc bằng polling hay realtime?
   Polling mỗi 2s, 5s, 10s hay WebSocket/SignalR?

6. Queue được chia theo gì?
   Theo phòng, chuyên khoa, bác sĩ, dịch vụ, độ ưu tiên, hay khu vực?

7. Có ưu tiên/cấp cứu/đặt lịch trước không?
   Có được chen hàng hợp lệ không?

8. Có chuyển phòng, bỏ lượt, gọi lại không?

9. Khi mất kết nối/reload trang, trạng thái gọi số có được khôi phục chính xác không?

10. Độ trễ chấp nhận được của màn hình hàng chờ là bao lâu?
    1s, 5s, 30s?

11. Có multi-stage queue không?
    Ví dụ: Khám ban đầu -> Xét nghiệm -> Khám lại -> Thanh toán.

12. NFR cần đạt là gì?
    Latency update realtime < 2-3s? Không mất queue khi server restart? Có cần multi-branch không?
```

### 1.1 Tách write load và read load

Write load là các thao tác làm đổi trạng thái queue:

```text
Lấy số
Gọi lượt
Bắt đầu khám
Hoàn tất khám
Hủy lượt
Bỏ lượt / gọi lại
Chuyển phòng
Điều phối lại
```

Read load là các màn hình/API liên tục đọc trạng thái:

```text
Màn hình sảnh
Màn hình phòng khám
Dashboard điều phối
App bệnh nhân
Màn hình quầy/lễ tân
```

Hai loại tải này khác nhau. Write load thường nhỏ hơn nhiều, nhưng yêu cầu correctness cao hơn. Read load có thể lớn vì polling/realtime fanout, nhưng có thể tối ưu bằng read model/cache.

### 1.2 Công thức tính write load

```text
write_events_per_day = patient_count * avg_state_changes_per_patient
write_qps_peak ≈ peak_patients_per_hour * avg_state_changes_per_patient / 3600
```

Ví dụ:

```text
500 bệnh nhân / buổi
mỗi bệnh nhân trung bình 4-6 state changes

500 * 6 = 3.000 write events / buổi
nếu một buổi 4 giờ:
3.000 / 4 = 750 events/giờ
≈ 12.5 events/phút
≈ 0.2 events/giây
```

Nếu peak 80 bệnh nhân/giờ:

```text
80 * 6 / 3600 ≈ 0.13 write/s
```

Kết luận: với tải 200-500 bệnh nhân/ngày, write load không phải bottleneck. Điều quan trọng là transaction đúng, unique constraint đúng, và không gọi trùng lượt.

### 1.3 Công thức tính read load

Với polling:

```text
read_qps = active_clients / polling_interval_seconds
db_query_qps = read_qps * queries_per_request
```

Ví dụ:

```text
100 clients polling mỗi 5 giây
read_qps = 100 / 5 = 20 req/s

500 clients polling mỗi 5 giây
read_qps = 500 / 5 = 100 req/s
```

Nếu mỗi request gọi 3 query:

```text
db_query_qps = 100 * 3 = 300 query/s
```

Nếu polling mỗi 2 giây:

```text
500 / 2 = 250 req/s
250 * 3 = 750 query/s
```

Tải này không đến từ nghiệp vụ mới, mà từ việc client hỏi lại cùng một trạng thái nhiều lần. Đây là lý do cần cân nhắc WebSocket, polling giãn cách, hoặc Redis read model khi số client tăng.

### 1.4 Tính tải realtime push

Với WebSocket/SignalR, tải chính không còn là polling QPS mà là số connection và fanout event.

```text
event_rate = queue_state_changes_per_second
message_fanout = event_rate * subscribers_per_channel
```

Ví dụ:

```text
100 phòng
mỗi phòng gọi 1 lượt / 5 phút

event_rate = 100 / 300 ≈ 0.33 event/s
```

Event rate rất nhỏ. Vấn đề thực tế nằm ở:

- Mỗi event gửi cho bao nhiêu client?
- Có broadcast toàn hệ thống hay theo room/patient channel?
- Client reconnect có refetch lại trạng thái không?
- WebSocket server scale ngang thế nào nếu connection tăng?

Nếu WebSocket chỉ push theo channel phòng/bệnh nhân và client self-heal bằng polling 60 giây:

```text
500 clients / 60s ≈ 8.3 req/s
```

So với polling 5 giây:

```text
500 clients / 5s = 100 req/s
```

Tức là giảm khoảng 12 lần read QPS vào API/DB.

### 1.5 Kết luận từ load parameter

Với input kiểu:

```text
200-500 bệnh nhân/ngày
peak 50-80 bệnh nhân/giờ
100 phòng khám
100-500 concurrent clients
latency realtime mong muốn < 2-3s
```

Đây là low-to-medium traffic. Không cần nhảy ngay vào Kafka/Kubernetes/Event Sourcing. Phần cần chắc trước là:

- DB transaction bảo vệ lấy số/gọi số.
- Unique constraint bảo vệ invariant.
- Index cho query `current`, `waiting`, `peopleAhead`.
- Polling không quá dày, hoặc WebSocket có self-heal.
- Read model/cache chỉ thêm khi read load thật sự nóng.

---

## 2. Khung đánh giá giải pháp

Senior không đánh giá giải pháp bằng cách đếm số công nghệ dùng trong kiến trúc. Một giải pháp tốt phải trả lời được 6 nhóm câu hỏi:

| Nhóm đánh giá | Câu hỏi cần trả lời |
|---|---|
| Correctness | Có chống trùng số, gọi trùng, status đi lùi sai rule không? |
| Source of Truth | DB, Redis, RabbitMQ, WebSocket mỗi thứ giữ vai trò gì? |
| Load | Read/write QPS thực tế là bao nhiêu? Bottleneck nằm ở DB, Redis, WebSocket hay event bus? |
| Consistency | Realtime được phép trễ bao lâu? Cache/read model lệch thì rebuild thế nào? |
| Operation | Server restart, Redis down, WebSocket miss event, RabbitMQ retry thì hệ thống ra sao? |
| Evolution | Sau này thêm multi-stage, ưu tiên, điều phối nhiều phòng có phá model hiện tại không? |

Từ khung này mới so sánh các phương án.

### 2.1 Junior-style: DB polling đơn giản

Thiết kế:

```text
API write/read trực tiếp DB
App polling /queue-status mỗi 5-10 giây
Không có read model riêng
Không có Outbox/WebSocket
```

Ưu điểm:

- Dễ implement.
- Ít moving parts.
- Phù hợp MVP nhỏ, ít client, polling thưa.

Nhược điểm:

- Dễ tính sai `peopleAhead` nếu chỉ dùng phép trừ số thứ tự.
- Dễ race nếu lấy số/gọi số không dùng transaction/lock.
- DB chịu toàn bộ read traffic.
- Realtime kém, UX phụ thuộc polling interval.

Đánh giá theo load:

```text
100 clients polling mỗi 5 giây
Read QPS = 100 / 5 = 20 req/s

500 clients polling mỗi 5 giây
Read QPS = 500 / 5 = 100 req/s
```

Nếu mỗi request gọi 2-3 query count/status:

```text
100 req/s * 3 query = 300 query/s
```

Với DB index tốt vẫn có thể chịu được, nhưng đây là read load lặp lại liên tục, không tạo thêm giá trị nghiệp vụ. Nếu polling 2 giây, tải tăng 2.5 lần so với polling 5 giây.

Đánh giá: dùng được ở phase đầu nếu tải nhỏ, nhưng chỉ chấp nhận khi vẫn có transaction, unique constraint và index đúng. Sai lầm không nằm ở việc dùng DB, mà nằm ở việc bỏ qua concurrency và polling load.

### 2.2 Middle-style: DB đúng + Redis/WebSocket hỗ trợ đọc nhanh

Thiết kế:

```text
DB transaction bảo vệ lấy số/gọi số
Redis cache/read model cho room status
WebSocket/SignalR push update
Polling nhẹ để self-heal
```

Ưu điểm:

- Giảm read QPS vào DB.
- UX realtime hơn.
- DB vẫn là Source of Truth.
- Có thể scale dần theo điểm nóng thật.

Đánh giá theo load:

```text
500 clients dùng WebSocket
Mỗi lần gọi số phát 1 event room + một số event patient

Nếu 100 phòng, mỗi phòng gọi 1 lượt / 5 phút:
Event rate = 100 / 300s ≈ 0.33 event/s
```

Event rate rất nhỏ. Tải đáng kể hơn nằm ở số connection WebSocket và số client nhận broadcast.

Nếu vẫn giữ polling self-heal 60 giây:

```text
500 clients / 60s ≈ 8.3 req/s
```

So với polling 5 giây là 100 req/s, giảm khoảng 12 lần read QPS.

Nhược điểm:

- Có thêm cache invalidation/rebuild.
- WebSocket có thể miss event, cần refetch khi reconnect.
- Redis down thì phải fallback DB.

Đánh giá: đây là hướng hợp lý cho production vừa phải. DB vẫn bảo vệ correctness, Redis/WebSocket chỉ tối ưu read/realtime. Điều kiện bắt buộc là read model rebuild được từ DB và client có self-heal.

### 2.3 Senior-style: Event-driven hybrid có kiểm soát

Thiết kế:

```text
Write model: DB transaction + invariant
Event reliability: Outbox
Event delivery: RabbitMQ
Read model: Redis room/patient snapshot khi cần
Realtime: WebSocket/SignalR theo channel
Recovery: rebuild read model từ DB
Observability: wait time, event lag, summary staleness
```

Ưu điểm:

- Tách write correctness khỏi read/realtime.
- Event không mất khi RabbitMQ/WebSocket lỗi tạm thời.
- Consumer idempotent, xử lý được redelivery.
- Mở rộng được multi-branch, multi-stage, dashboard.

Nhược điểm:

- Nhiều thành phần hơn.
- Cần vận hành Outbox, consumer, retry, rebuild.
- Nếu áp dụng quá sớm cho tải nhỏ thì tốn công không cần thiết.

Đánh giá theo load:

```text
Write load 0.2 event/s như ví dụ ban đầu
Outbox/RabbitMQ gần như không phải bottleneck

Read load nếu dùng WebSocket + polling 60s:
500 clients ≈ 8.3 req/s self-heal

Read load nếu polling 5s:
500 clients = 100 req/s
```

Đánh giá: đây là kiến trúc tốt khi có nhiều consumer, nhiều màn hình realtime, audit, notification, dashboard, hoặc multi-stage. Nhưng với tải nhỏ, senior không nhất thiết chọn kiến trúc phức tạp nhất. Senior chọn phase phù hợp:

```text
Phase 1: DB transaction + index + polling/WebSocket nhẹ
Phase 2: Outbox + Redis read model khi read/realtime load tăng
Phase 3: multi-stage routing/dashboard/advanced analytics khi nghiệp vụ cần
```

### 2.4 Những hướng không nên đưa vào sớm

Không nên mặc định chọn:

- Redis làm Source of Truth để cấp số.
- Kafka chỉ vì có event.
- Kubernetes chỉ vì muốn "scale".
- AI dự đoán thời gian chờ khi chưa có historical data sạch.
- Event Sourcing đầy đủ khi queue chưa đủ phức tạp.

Các hướng này không sai tuyệt đối, nhưng với input 200-500 bệnh nhân/ngày thì thường làm hệ thống phức tạp hơn vấn đề thật.

---

## 3. Bài toán nghiệp vụ

Hệ thống cần hiển thị cho bệnh nhân:

```text
Phòng khám: Nội tổng quát
Số thứ tự của mình: 27
Đang gọi: 22
Số người chờ trước: 4
Trạng thái: Đang chờ khám
```

Nhưng `27 - 22 - 1 = 4` chỉ đúng trong case rất đơn giản. Thực tế có:

- Người hủy lượt.
- Người bỏ lượt.
- Người được gọi nhưng chưa vào.
- Người chuyển phòng.
- Người ưu tiên/cấp cứu.
- Bác sĩ/phòng khám đổi trạng thái.

Vì vậy không nên tính số người chờ bằng phép trừ số thứ tự. Phải tính theo trạng thái active và thứ tự gọi thực tế.

Các thao tác chính:

```text
Tiếp nhận / lấy số
Gọi lượt tiếp theo
Bệnh nhân vào khám
Hoàn tất khám
Hủy lượt / bỏ lượt / gọi lại
Chuyển phòng
Điều phối sang phòng ít tải hơn
```

---

## 4. Core concept: State + Event

Nên nhìn hệ thống theo 2 phần:

```text
Command / Event:
- Bệnh nhân lấy số
- Bác sĩ gọi lượt tiếp theo
- Bệnh nhân vào khám
- Bệnh nhân hoàn thành
- Bệnh nhân hủy lượt
- Bệnh nhân chuyển phòng

State hiện tại:
- Số hiện tại của phòng
- Danh sách người đang chờ
- Người đang được gọi
- Số người chờ trước từng bệnh nhân
```

Câu hỏi thiết kế quan trọng:

```text
State nào là Source of Truth?
State nào chỉ là read model/cache để đọc nhanh?
Event nào được publish sau khi state thật đã commit?
```

Với case này:

```text
MySQL/DB = Source of Truth
Redis = read model/cache
RabbitMQ = event delivery
WebSocket/SignalR = push realtime
```

Không để RabbitMQ/WebSocket quyết định sự đúng sai của hàng chờ. Chúng chỉ giúp lan truyền trạng thái.

---

## 5. Invariant cần giữ

Invariant là luật không được sai dù UI realtime có thể trễ.

### 5.1 Một bệnh nhân trong một phòng chỉ có một lượt active

```text
Tenant + ClinicDate + PhongBanId + PhieuKhamId
chỉ được có tối đa 1 ticket active.
```

Tránh bệnh nhân/lễ tân bấm lấy số nhiều lần.

### 5.2 Số thứ tự trong một phòng/ngày không được trùng

```text
Tenant + ClinicDate + PhongBanId + SoThuTu
phải unique.
```

### 5.3 Gọi lượt phải chọn đúng người tiếp theo

Không được gọi người đã hủy, đã khám xong, đã chuyển phòng, hoặc đang khám.

```text
Next ticket = ticket WAITING đầu tiên
theo Priority DESC, SoThuTu ASC hoặc sort_order ASC.
```

### 5.4 App có thể hơi trễ, DB không được sai

Realtime UI trễ 1-2 giây có thể chấp nhận nếu nghiệp vụ cho phép. Nhưng DB không được cấp sai số, mất lượt, gọi nhầm, hoặc cho terminal status đi lùi sai rule.

---

## 6. Data model nền tảng

### 6.1 QueueTicket

Lưu từng lượt khám.

```sql
CREATE TABLE queue_ticket (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    branch_id BIGINT NOT NULL,
    clinic_date DATE NOT NULL,

    queue_scope VARCHAR(50) NOT NULL,
    phong_ban_id BIGINT NOT NULL,
    doctor_id BIGINT NULL,
    service_id BIGINT NULL,

    phieu_kham_id BIGINT NOT NULL,
    patient_id BIGINT NOT NULL,
    so_thu_tu INT NOT NULL,

    priority INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL,

    created_at DATETIME NOT NULL,
    called_at DATETIME NULL,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,

    active_flag TINYINT NOT NULL DEFAULT 1,
    version BIGINT NOT NULL DEFAULT 0,

    UNIQUE KEY uk_queue_number (tenant_id, clinic_date, phong_ban_id, so_thu_tu),
    UNIQUE KEY uk_active_ticket (tenant_id, clinic_date, phong_ban_id, phieu_kham_id, active_flag),
    INDEX ix_queue_next (tenant_id, clinic_date, phong_ban_id, status, priority, so_thu_tu),
    INDEX ix_queue_patient (tenant_id, clinic_date, phieu_kham_id)
);
```

Status gợi ý:

```text
WAITING
CALLED
IN_PROGRESS
COMPLETED
CANCELLED
SKIPPED
TRANSFERRED
```

Lưu ý về `active_flag`:

```text
active_flag = 1 cho WAITING / CALLED / IN_PROGRESS / SKIPPED nếu còn có thể gọi lại
active_flag = 0 cho COMPLETED / CANCELLED / TRANSFERRED terminal
```

Nếu DB hỗ trợ filtered unique index thì có thể dùng unique chỉ trên active records. Nếu không, dùng `active_flag` nhưng phải update nó đúng trong cùng transaction khi ticket đi vào terminal status.

### 6.2 QueueCounter

Dùng để cấp số tuần tự theo phòng/ngày.

```sql
CREATE TABLE queue_counter (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    branch_id BIGINT NOT NULL,
    clinic_date DATE NOT NULL,
    phong_ban_id BIGINT NOT NULL,
    current_number INT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL,

    UNIQUE KEY uk_queue_counter (tenant_id, branch_id, clinic_date, phong_ban_id)
);
```

Nếu queue không chỉ theo phòng mà theo chuyên khoa/dịch vụ, thay `phong_ban_id` bằng `queue_scope_id` hoặc thêm `queue_scope` rõ ràng. Điều quan trọng là counter phải cùng boundary với nơi cấp số.

### 6.3 TicketStage cho multi-stage queue

Nếu bệnh nhân đi qua nhiều bước:

```text
Khám ban đầu -> Xét nghiệm -> Khám chuyên khoa -> Thanh toán
```

Không nên nhét toàn bộ vào một status phẳng của `QueueTicket`. Có thể tách stage:

```sql
CREATE TABLE queue_ticket_stage (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    ticket_id BIGINT NOT NULL,
    stage_type VARCHAR(50) NOT NULL,
    phong_ban_id BIGINT NULL,
    service_id BIGINT NULL,
    status VARCHAR(30) NOT NULL,
    so_thu_tu INT NULL,
    priority INT NOT NULL DEFAULT 0,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    version BIGINT NOT NULL DEFAULT 0,

    INDEX ix_stage_queue (stage_type, phong_ban_id, status, priority, so_thu_tu)
);
```

Rule:

```text
QueueTicket = lượt tổng thể của bệnh nhân trong visit.
QueueTicketStage = từng hàng chờ con trong luồng khám.
Mỗi stage có thể có queue/counter riêng.
```

Chỉ thêm model stage khi nghiệp vụ thật sự có nhiều bước độc lập. Nếu phòng khám chỉ có một hàng chờ theo phòng thì giữ model đơn giản.

---

## 7. Luồng lấy số khám

Flow:

```text
Bệnh nhân / lễ tân lấy số
-> API TakeQueueNumber
-> Begin Transaction
-> Lock QueueCounter của phòng/ngày
-> CurrentNumber + 1
-> Insert QueueTicket
-> Commit
-> Publish event sau commit / Outbox
-> WebSocket cập nhật app/màn hình
```

Pseudo:

```text
BEGIN
SELECT * FROM queue_counter
WHERE tenant_id = @tenantId
  AND branch_id = @branchId
  AND clinic_date = @today
  AND phong_ban_id = @roomId
FOR UPDATE

nextNumber = current_number + 1

UPDATE queue_counter SET current_number = nextNumber

INSERT queue_ticket(..., so_thu_tu = nextNumber, status = 'WAITING')

INSERT outbox_message('QueueTicketCreated', payload)
COMMIT
```

Vì sao không dùng `SELECT MAX(SoThuTu) + 1`?

```text
Request A đọc max = 10
Request B đọc max = 10
A insert số 11
B insert số 11
```

Unique constraint có thể chặn lỗi, nhưng counter + row lock rõ intent hơn.

Vì sao không vội dùng Redis `INCR`?

```text
Redis INCR nhanh nhưng nếu DB insert fail thì số bị nhảy.
Redis mất dữ liệu/failover sai có thể gây lệch.
Với tải 300-500 bệnh nhân/buổi, DB row lock hoàn toàn đủ.
```

Redis nên dùng cho read model/realtime support, không phải Source of Truth cấp số nếu chưa có lý do tải thật sự lớn.

---

## 8. Luồng bác sĩ gọi lượt tiếp theo

Đây là phần dễ sai hơn lấy số.

Flow:

```text
Bác sĩ bấm Gọi tiếp
-> Begin Transaction
-> Tìm ticket WAITING tiếp theo của phòng
-> Lock ticket đó
-> Update status = CALLED
-> Insert outbox event QueuePatientCalled
-> Commit
```

SQL gợi ý:

```sql
SELECT *
FROM queue_ticket
WHERE tenant_id = @tenantId
  AND clinic_date = @today
  AND phong_ban_id = @roomId
  AND status = 'WAITING'
ORDER BY priority DESC, so_thu_tu ASC
LIMIT 1
FOR UPDATE;
```

Sau đó:

```sql
UPDATE queue_ticket
SET status = 'CALLED',
    called_at = @now,
    version = version + 1
WHERE id = @ticketId
  AND status = 'WAITING';
```

Nếu DB hỗ trợ `SKIP LOCKED`, có thể dùng để nhiều worker/phòng xử lý song song tốt hơn:

```text
SELECT next waiting row FOR UPDATE SKIP LOCKED
```

Rule: không xử lý bằng frontend. Atomicity phải nằm ở backend/DB transaction.

---

## 9. Tính số người chờ trước

Không nên tính:

```text
SoThuTuCuaToi - SoDangGoi
```

Cách đúng hơn là đếm ticket active đứng trước mình theo thứ tự gọi thực tế:

```sql
SELECT COUNT(*)
FROM queue_ticket
WHERE tenant_id = @tenantId
  AND clinic_date = @today
  AND phong_ban_id = @roomId
  AND status IN ('WAITING', 'CALLED')
  AND (
      priority > @myPriority
      OR (priority = @myPriority AND so_thu_tu < @myNumber)
  );
```

Cần làm rõ nghiệp vụ:

- `CALLED` có còn tính là chờ trước không? Thường có, vì người đó đang chiếm lượt gọi.
- Nếu `CALLED` quá timeout và bị `SKIPPED`, phải loại hoặc xử lý theo rule gọi lại.
- Nếu có cấp cứu/ưu tiên, bệnh nhân số sau có thể được gọi trước; UI nên hiển thị rõ có ưu tiên để tránh hiểu nhầm.

Với 300-500 bệnh nhân/buổi, query này ổn nếu index đúng:

```sql
CREATE INDEX ix_queue_ticket_room_status_order
ON queue_ticket (
    tenant_id,
    clinic_date,
    phong_ban_id,
    status,
    priority,
    so_thu_tu
);
```

---

## 10. Current turn và waiting count nên đọc từ đâu?

### Cách 1: Query trực tiếp DB

Phù hợp phase đầu:

- Quy mô nhỏ/vừa.
- Ít màn hình đọc.
- Polling thưa hoặc WebSocket là chính.
- DB index tốt.

Room status:

```sql
SELECT *
FROM queue_ticket
WHERE tenant_id = @tenantId
  AND clinic_date = @today
  AND phong_ban_id = @roomId
  AND status IN ('CALLED', 'IN_PROGRESS')
ORDER BY called_at DESC
LIMIT 1;
```

Waiting count:

```sql
SELECT COUNT(*)
FROM queue_ticket
WHERE tenant_id = @tenantId
  AND clinic_date = @today
  AND phong_ban_id = @roomId
  AND status = 'WAITING';
```

### Cách 2: Redis/read model summary

Phù hợp khi:

- Nhiều màn hình đọc liên tục.
- App bệnh nhân polling nhiều.
- Dashboard cần tổng hợp nhanh.
- Query count bắt đầu nóng.

Key:

```text
queue:state:{tenantId}:{clinicDate}:{phongBanId}
```

Value:

```json
{
  "currentCalledNumber": 22,
  "waitingCount": 18,
  "inProgressCount": 1,
  "updatedAt": "2026-06-28T09:30:00+07:00",
  "version": 88
}
```

Rule:

```text
DB vẫn là Source of Truth.
Redis/read model phải rebuild được từ QueueTicket.
```

Giai đoạn đầu nên ưu tiên DB query + index tốt. Chỉ thêm Redis read model khi có số liệu cho thấy read load đáng kể.

---

## 11. Event, RabbitMQ và Outbox

RabbitMQ nên dùng cho event delivery, không phải nơi đọc trạng thái chính.

Event gợi ý:

```text
QueueTicketCreated
QueuePatientCalled
QueuePatientStarted
QueuePatientCompleted
QueueTicketCancelled
QueueTicketTransferred
```

Consumer có thể:

- Cập nhật Redis snapshot.
- Bắn WebSocket/SignalR tới app.
- Ghi audit log.
- Gửi notification.
- Đồng bộ sang module khác.

Không nên publish event trực tiếp rồi mới commit DB, cũng không nên commit DB xong mà publish mất event. Dùng Outbox Pattern:

```text
Begin Transaction
  Update QueueTicket
  Insert OutboxMessage
Commit

Outbox Worker
  Publish RabbitMQ
  Mark OutboxMessage as Published
```

Outbox đảm bảo: DB transaction thành công thì event chắc chắn được lưu, RabbitMQ lỗi thì worker retry sau.

Consumer cũng phải idempotent vì RabbitMQ có thể redeliver:

```sql
ProcessedMessage (
    message_id,
    consumer_name,
    processed_at
)
```

Khi nhận message:

```text
Nếu MessageId đã xử lý -> bỏ qua
Nếu chưa -> xử lý -> insert ProcessedMessage
```

Không nên dùng RabbitMQ để trả lời câu hỏi hiện tại như:

```text
Tôi đang chờ số mấy?
Còn bao nhiêu người trước tôi?
Phòng này đang gọi số nào?
```

Các câu hỏi này đọc từ DB hoặc Redis read model. RabbitMQ chỉ vận chuyển event.

---

## 12. WebSocket/SignalR nên bắn thế nào?

Không nên mỗi event bắn toàn bộ dữ liệu cho tất cả user.

Chia channel:

```text
queue:room:{phongBanId}
queue:patient:{phieuKhamId}
```

Khi phòng Nội gọi số mới:

```text
Broadcast channel phòng:
- currentCalledNumber
- waitingCount
- changedAt
```

Khi cần cập nhật riêng bệnh nhân:

```text
Send channel bệnh nhân:
- status
- peopleAhead
- room
```

Client nhận event có thể:

```text
1. Update snapshot nhẹ ngay.
2. Gọi lại API nếu cần detail.
3. Polling nhẹ 30-60s hoặc refetch khi reconnect để self-heal nếu miss event.
```

WebSocket là realtime path, không phải Source of Truth.

---

## 13. Điều phối lượt khám

Điều phối không chỉ là gọi số tiếp theo.

### Case 1: Một bệnh nhân được chỉ định một phòng cố định

```text
Phiếu khám A -> Phòng Nội -> lấy số tại Phòng Nội
```

Queue theo từng phòng. Đây là phase đơn giản nhất.

### Case 2: Một chuyên khoa có nhiều phòng thay thế nhau

Ví dụ Nội tổng quát có 5 phòng. Khi bệnh nhân lấy số, hệ thống chọn phòng ít tải nhất.

Công thức đơn giản:

```text
Score = waitingCount + inProgressWeight
```

Chọn phòng có score thấp nhất.

### Case 3: Bác sĩ có tốc độ khám khác nhau

Có thể dùng estimated duration:

```text
Score = waitingCount * avgConsultationMinutes
```

Phòng đông hơn vẫn có thể chờ ngắn hơn nếu bác sĩ xử lý nhanh hơn.

### Case 4: Ưu tiên

Ví dụ:

```text
Người già
Trẻ em
Cấp cứu
VIP
Tái khám nhanh
```

Thứ tự gọi không chỉ theo `SoThuTu ASC`, mà theo:

```text
ORDER BY Priority DESC, SoThuTu ASC
```

Priority phải minh bạch với UI và audit, vì bệnh nhân có thể thấy số sau được gọi trước.

### Case 5: Multi-stage routing

Một bệnh nhân có thể không chỉ chờ ở một phòng:

```text
Khám ban đầu
-> chỉ định xét nghiệm
-> chờ xét nghiệm
-> quay lại phòng khám
-> thanh toán
```

Mỗi stage nên có trạng thái riêng:

```text
WAITING
CALLED
IN_PROGRESS
COMPLETED
SKIPPED
CANCELLED
```

Điều phối lúc này không còn là "phòng nào ít người nhất" đơn giản. Cần biết:

- Stage hiện tại của bệnh nhân.
- Stage tiếp theo là gì.
- Dịch vụ nào có thể phục vụ stage đó.
- Queue scope của stage đó.
- Có cần giữ ưu tiên xuyên suốt các stage không.

Đừng vội dùng state machine framework nếu flow còn đơn giản. Nhưng nên mô hình hóa stage rõ để sau này không phải vá thêm nhiều status đặc biệt vào một bảng.

---

## 14. Estimated waiting time

Estimated waiting time không nên đoán bằng cảm giác. Cần input:

```text
average_service_time_per_patient
number_of_active_doctors_or_rooms
waiting_count_before_patient
priority_rules
```

Công thức đơn giản:

```text
estimated_wait_minutes =
  ceil(waiting_count_before_patient / active_rooms) * average_service_time_minutes
```

Ví dụ:

```text
12 người chờ
2 phòng đang khám
Trung bình 8 phút / lượt

estimated = ceil(12 / 2) * 8 = 48 phút
```

Nếu có priority/cấp cứu, ETA chỉ là ước lượng và response nên nói rõ.

---

## 15. API shape gợi ý

Lấy số:

```http
POST /api/queue/tickets
```

```json
{
  "phieuKhamId": 123,
  "phongBanId": 10
}
```

Response:

```json
{
  "ticketId": 999,
  "soThuTu": 27,
  "phongBanId": 10,
  "status": "WAITING"
}
```

Gọi lượt tiếp theo:

```http
POST /api/queue/rooms/10/call-next
```

Response:

```json
{
  "ticketId": 999,
  "phieuKhamId": 123,
  "soThuTu": 27,
  "status": "CALLED"
}
```

Xem trạng thái phòng:

```http
GET /api/queue/rooms/10/status
```

```json
{
  "phongBanId": 10,
  "currentCalledNumber": 27,
  "waitingCount": 12,
  "inProgressCount": 1
}
```

Xem trạng thái của tôi:

```http
GET /api/queue/my-status?phieuKhamId=123
```

```json
{
  "soThuTu": 27,
  "currentCalledNumber": 22,
  "peopleAhead": 4,
  "status": "WAITING"
}
```

---

## 16. Failure handling

Nếu Redis down:

```text
API fallback query DB trực tiếp.
Hệ thống chậm hơn nhưng vẫn đúng.
```

Nếu WebSocket lỗi:

```text
Client polling nhẹ / refetch khi reconnect để tự hồi phục.
```

Nếu summary cache lệch:

```text
Manual rebuild summary theo tenant/branch/date/room.
Background reconciliation job so sánh summary với DB count.
```

Nếu publish event lỗi:

```text
Outbox retry.
DB vẫn đúng.
Realtime có thể trễ.
```

Nếu consumer xử lý trùng:

```text
ProcessedMessage / idempotency key.
```

Nếu server restart hoặc Redis mất dữ liệu:

```text
Queue vẫn recover được từ DB.
Rebuild Redis room/patient snapshot từ QueueTicket/QueueTicketStage.
Client reconnect thì refetch trạng thái từ API.
```

Nếu bệnh nhân không đến sau khi được gọi:

```text
Sau X phút chuyển CALLED -> SKIPPED hoặc NO_SHOW.
Cho phép gọi lại theo rule riêng.
Ghi audit để tránh tranh cãi thứ tự.
```

Nếu phòng đổi bác sĩ hoặc tạm ngưng:

```text
Dừng gọi lượt mới ở phòng đó.
Các ticket WAITING có thể giữ nguyên, chuyển phòng, hoặc điều phối lại theo rule.
Không tự động chuyển nếu nghiệp vụ cần xác nhận của điều phối viên.
```

---

## 17. Phase rollout

### Phase 1: Đúng trước, tối ưu sau

```text
MySQL là Source of Truth.
QueueTicket lưu từng lượt.
QueueCounter cấp số theo phòng/ngày.
Transaction khi lấy số/gọi số.
Unique constraint + index đầy đủ.
API đọc DB với index tốt.
WebSocket push trạng thái sau commit nếu infra đã có.
Redis có thể chưa cần hoặc chỉ cache room state ngắn hạn.
```

Với tải 300-500 bệnh nhân/buổi, phase này thường đủ.

### Phase 2: Khi read/realtime load tăng

```text
Thêm Outbox Pattern chuẩn.
Thêm idempotency cho consumer.
Redis làm read model cho room/patient status.
Dashboard theo dõi waiting count, call rate, avg consultation time.
Điều phối phòng dựa trên score/waiting time.
SignalR/WebSocket channel theo room/patient.
```

### Không đưa vào phase sớm nếu chưa có nhu cầu

```text
Kafka / Event Sourcing đầy đủ
Kubernetes chỉ cho bài toán queue nhỏ
AI dự đoán thời gian chờ
Redis làm Source of Truth cho cấp số
```

Các thứ này có thể đúng ở bệnh viện lớn hoặc hệ sinh thái nhiều chi nhánh, nhưng với tải 200-500 bệnh nhân/ngày thì dễ làm hệ thống phức tạp hơn giá trị nó mang lại.

Không over-engineer sớm, nhưng thiết kế phase 1 phải không chặn đường lên phase 2.

---

## 18. Observability

Dashboard nên có:

```text
1. Số lượt check-in theo giờ
2. Số lượt WAITING / CALLED / IN_PROGRESS
3. Thời gian chờ p50 / p95 / p99
4. Số lần gọi số/phòng/phút
5. Queue summary rebuild count
6. Cache hit/miss nếu có Redis summary
7. SignalR/WebSocket connected clients
8. Event lag: QueueChangedEvent -> client nhận update
9. Số lần gọi trùng bị backend chặn
10. Số lượt skip/cancel/transfer
11. Số no-show và thời gian chờ trước khi skip
12. Rebuild snapshot duration
```

Metric quan trọng:

```text
queue_wait_time = started_at - created_at
queue_event_lag = client_received_at - changed_at
summary_staleness = now - summary.updatedAt
```

---

## 19. Những lỗi thiết kế hay gặp

1. **Cấp số bằng `MAX(SoThuTu) + 1`**  
   Dễ trùng số khi concurrent request.

2. **Tính người chờ bằng `SoThuTu - SoDangGoi`**  
   Sai khi có hủy, skip, chuyển phòng, ưu tiên.

3. **Dùng RabbitMQ/WebSocket làm source of truth**  
   Queue đúng/sai phải do DB transaction bảo vệ.

4. **Publish event ngoài transaction không có Outbox**  
   DB đúng nhưng realtime miss, hoặc event bắn ra nhưng DB rollback.

5. **Không idempotent consumer**  
   Message redelivery có thể update cache/gửi notify nhiều lần.

6. **Cache summary nhưng không có rebuild**  
   Cache lệch là không biết sửa từ đâu.

7. **Không có invariant rõ ràng**  
   Sau này thêm chuyển phòng/ưu tiên/gọi lại rất dễ phá queue.

8. **Đưa Redis/Kafka thành lõi đúng sai quá sớm**  
   Với tải vừa, DB transaction mới là thứ cần chắc trước.

9. **Không mô hình hóa multi-stage nếu nghiệp vụ có nhiều bước**  
   Nhét xét nghiệm, khám lại, thanh toán vào một status phẳng sẽ rất nhanh rối.

---

## 20. Checklist review thiết kế

```text
[ ] Đã có input load parameter ban đầu?
[ ] Queue scope được định nghĩa rõ: phòng, khoa, bác sĩ, dịch vụ?
[ ] DB là Source of Truth cho queue chưa?
[ ] Có QueueCounter hoặc cơ chế cấp số atomic không?
[ ] Unique constraint chống trùng số và trùng active ticket chưa?
[ ] Gọi số tiếp theo có transaction/lock không?
[ ] Có chống gọi trùng khi nhiều người bấm cùng lúc không?
[ ] peopleAhead có tính theo active ticket đứng trước, không dùng phép trừ đơn giản?
[ ] Redis/read model có thể rebuild từ DB không?
[ ] Event publish sau commit hoặc qua Outbox không?
[ ] Consumer có idempotency không?
[ ] Có xử lý skip/cancel/transfer/priority không?
[ ] Có realtime push hay polling? Lý do chọn là gì?
[ ] WebSocket miss event thì client self-heal thế nào?
[ ] Redis down thì hệ thống còn đúng không?
[ ] Server restart/Redis mất thì rebuild queue snapshot từ DB được không?
[ ] Có xử lý no-show/auto-skip/gọi lại không?
[ ] Nếu có multi-stage, stage được mô hình hóa riêng chưa?
[ ] Có tránh over-engineer Kafka/K8s/Event Sourcing khi tải chưa cần không?
[ ] Có metric wait time, event lag, summary staleness không?
```
