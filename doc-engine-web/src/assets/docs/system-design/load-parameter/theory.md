# Load Parameters: Estimating System Load Before Choosing Architecture


Load Parameter là tập số liệu định lượng nền tảng giúp chuyển đổi thiết kế hệ thống từ lựa chọn dựa trên cảm tính sang quyết định có cơ sở dữ liệu.

Phần này xác định rõ các thông tin cốt lõi: hệ thống phải chịu bao nhiêu read và write, peak traffic nằm ở đâu, latency mục tiêu là bao nhiêu, giới hạn của các dependency bên ngoài, cũng như những loại lỗi nào không được phép xảy ra.  

---

## Tóm tắt nhanh

**Load Parameters** là tập các số liệu đầu vào dùng để hiểu hệ thống sẽ phải chịu tải như thế nào.

Nói đơn giản, trước khi chọn giải pháp và công nghệ thực hiện, ta cần trả lời được:

```text
Hệ thống có bao nhiêu người dùng?
Trong giờ cao điểm có bao nhiêu request?
Bao nhiêu thao tác là read?
Bao nhiêu thao tác là write?
Mỗi request tạo bao nhiêu query DB?
Query đó scan bao nhiêu dòng?
Dữ liệu tăng bao nhiêu mỗi ngày/tháng/năm?
User cần dữ liệu realtime đến mức nào?
Có chấp nhận dữ liệu trễ vài giây/phút không?
Dependency bên ngoài giới hạn bao nhiêu request/phút?
Nếu quá tải, hệ thống sẽ degrade như thế nào?
```

Một thiết kế tốt không phải là thiết kế dùng kiến trúc lớn nhất. Một thiết kế tốt là thiết kế có mức phức tạp phù hợp với tải hiện tại, rủi ro nghiệp vụ, khả năng vận hành của team, và vẫn để lại đường nâng cấp khi tải tăng.

---

## 1. Vì sao phải có Load Parameters?

Khi chưa có số liệu tải, design thường rơi vào hai lỗi ngược nhau.

### 1.1 Under-design

Under-design là thiết kế quá đơn giản so với tải thực tế.

Ví dụ:

```text
500 app client cùng mở màn hình hàng chờ.
Mỗi client polling API mỗi 5 giây.

read_rps = 500 / 5 = 100 req/s
```

Nếu mỗi request lại count trạng thái hàng chờ bằng query chưa có index tốt, DB có thể bị nóng dù số bệnh nhân thực tế trong ngày không lớn.

Ở đây vấn đề không nằm ở số bệnh nhân. Vấn đề nằm ở cách client đọc dữ liệu lặp lại liên tục.

### 1.2 Over-design

Over-design là kéo kiến trúc quá phức tạp vào bài toán nhỏ.

Ví dụ:

```text
300 bệnh nhân/ngày
100 phòng khám
mỗi phòng gọi số vài lần mỗi giờ
```

Nếu write load thực tế chỉ dưới 1 event/s, việc áp Kafka, event sourcing đầy đủ, nhiều microservice, Kubernetes chỉ để xử lý gọi số là quá nặng nếu team chưa có nhu cầu replay event, multi-consumer phức tạp hoặc throughput rất cao.

### 1.3 Giá trị của Load Parameters

Load Parameters giúp biến câu hỏi:

```text
Có nên dùng Redis không?
Có nên dùng RabbitMQ không?
Có nên dùng WebSocket không?
Có nên query trực tiếp DB không?
```

thành câu hỏi cụ thể hơn:

```text
Read QPS bao nhiêu?
Write QPS bao nhiêu?
DB query cost thế nào?
Có fanout realtime không?
Có cần retry độc lập không?
Có dependency rate limit không?
Có chấp nhận stale data không?
```

Khi có số liệu, quyết định kiến trúc trở nên dễ review hơn.

---

## 2. Các khái niệm nền tảng

### 2.1 Request

**Request** là một lần client hoặc service gọi vào hệ thống để yêu cầu xử lý một việc gì đó.

Ví dụ request:

```text
Mobile app gọi API lấy trạng thái hàng chờ
Web admin gọi API tạo phiếu khám
Service A gọi Service B để đồng bộ trạng thái
Frontend gọi API tìm kiếm sản phẩm
```

Một request không nhất thiết tương ứng với một thao tác nghiệp vụ.

Ví dụ:

```text
Một bệnh nhân trong ngày có thể tạo nhiều request:
- lấy số thứ tự
- xem hàng chờ
- thanh toán
- xem kết quả
- refresh trạng thái
```

Khi phân tích tải, không nên chỉ nói “500 bệnh nhân/ngày”. Cần phân tích tiếp mỗi bệnh nhân tạo ra bao nhiêu request, vào thời điểm nào, và request đó nặng hay nhẹ.

---

### 2.2 RPS - Requests Per Second

**RPS** là số request đi vào API trong một giây.

Công thức cơ bản:

```text
rps = số request / số giây
```

Ví dụ:

```text
500 client polling mỗi 5 giây

rps = 500 / 5
    = 100 req/s
```

RPS thường dùng để đo tải ở tầng API hoặc application server.

Tuy nhiên, RPS chỉ cho biết số request đi vào hệ thống, chưa cho biết request đó nặng hay nhẹ.

Ví dụ:

```text
100 req/s đọc cache theo key
=> có thể rất nhẹ

10 req/s chạy report scan 1 triệu rows
=> có thể rất nặng
```

Vì vậy, khi review design, không nên dừng ở RPS. Cần phân tích tiếp mỗi request làm gì phía sau.

---

### 2.3 QPS - Queries Per Second

**QPS** là số query trong một giây.

Trong thực tế, QPS có thể bị dùng hơi lẫn lộn:

```text
API QPS: số request/giây vào API
DB QPS: số query/giây xuống database
Search QPS: số query/giây vào Elasticsearch hoặc search engine
Cache QPS: số request/giây vào Redis/memcached
```

Khi viết tài liệu design, nên ghi rõ QPS đang nói về tầng nào.

Ví dụ:

```text
API RPS = 100 req/s
Mỗi API request chạy 3 query DB

DB QPS = 100 * 3
       = 300 query/s
```

Nhưng DB QPS vẫn chưa đủ. Cần biết query đó dùng index tốt không, scan bao nhiêu dòng, lock bao lâu, sort/group/order thế nào.

Ví dụ:

```text
300 query/s
mỗi query scan 10 rows
=> nhẹ

300 query/s
mỗi query scan 10.000 rows
=> 3.000.000 rows scanned/s
=> rất có thể là bottleneck
```

---

### 2.4 Throughput

**Throughput** là lượng công việc hệ thống xử lý xong trong một đơn vị thời gian.

Ví dụ:

```text
1.000 order/phút
300 payment confirmations/phút
50.000 log events/giây
10.000 email gửi/giờ
```

Throughput trả lời câu hỏi:

```text
Hệ thống xử lý được bao nhiêu việc trong một khoảng thời gian?
```

Throughput khác với latency.

Một hệ thống có thể có throughput cao nhưng latency vẫn cao nếu request phải chờ trong queue lâu.

Ví dụ:

```text
Worker xử lý được 1.000 job/phút.
Nhưng nếu queue đang tồn 100.000 job,
job mới vẫn có thể phải chờ rất lâu mới tới lượt.
```

Vì vậy, với hệ thống async, ngoài throughput còn cần theo dõi queue length và message age.

---

### 2.5 Latency

**Latency** là thời gian từ lúc một request hoặc operation bắt đầu cho đến khi hoàn tất.

Ví dụ:

```text
User bấm nút gọi số -> API trả kết quả sau 120ms
=> latency của API khoảng 120ms

Service gọi 3rd-party -> nhận response sau 2s
=> latency của HTTP call khoảng 2s
```

Latency thường được đo bằng millisecond hoặc second.

Các chỉ số latency phổ biến:

```text
p50 latency: 50% request nhanh hơn hoặc bằng mức này
p95 latency: 95% request nhanh hơn hoặc bằng mức này
p99 latency: 99% request nhanh hơn hoặc bằng mức này
average latency: trung bình latency của tất cả request
```

Ví dụ:

```text
p50 = 80ms
p95 = 400ms
p99 = 2s
```

Cách hiểu:

```text
50% request hoàn tất trong <= 80ms
95% request hoàn tất trong <= 400ms
99% request hoàn tất trong <= 2s
```

Không nên chỉ nhìn average latency.

Ví dụ:

```text
99 request chạy 100ms
1 request chạy 10s
```

Average có thể vẫn nhìn “không quá tệ”, nhưng request chậm 10s là trải nghiệm rất xấu với user. Trong production, tail latency như p95/p99 thường quan trọng hơn average.

Latency target nên được ghi rõ theo từng loại nghiệp vụ.

Ví dụ:

```text
Màn hình hàng chờ: update trong 2-3s là chấp nhận được
Thanh toán: cần phản hồi nhanh và chắc chắn hơn
Dashboard doanh thu: delay vài phút có thể chấp nhận
Export report: có thể chạy async và trả file sau
```

---

### 2.6 Concurrency

**Concurrency** là số tác vụ đang diễn ra cùng lúc tại một thời điểm.

Ví dụ:

```text
Có 50 request đang được API xử lý đồng thời
Có 20 DB query đang chạy đồng thời
Có 100 job đang được worker xử lý đồng thời
Có 1.000 WebSocket connection đang mở
```

Concurrency không giống RPS.

RPS là tốc độ request đi vào. Concurrency là số request đang nằm trong hệ thống tại cùng thời điểm.

Một công thức đơn giản thường dùng là Little’s Law:

```text
concurrency ≈ throughput * latency
```

Nếu dùng RPS và latency theo giây:

```text
concurrent_requests ≈ rps * latency_seconds
```

Ví dụ 1:

```text
100 req/s
mỗi request mất 200ms = 0.2s

concurrent_requests ≈ 100 * 0.2
                    = 20 request đang xử lý đồng thời
```

Ví dụ 2:

```text
100 req/s
mỗi request mất 2s

concurrent_requests ≈ 100 * 2
                    = 200 request đang xử lý đồng thời
```

Dù RPS không đổi, latency tăng từ 200ms lên 2s làm concurrency tăng từ 20 lên 200. Điều này có thể làm đầy thread pool, connection pool, queue nội bộ hoặc memory.

Đây là lý do latency không chỉ ảnh hưởng trải nghiệm user, mà còn ảnh hưởng capacity của hệ thống.

---

### 2.7 CCU - Concurrent Users

**CCU** là số user đang online hoặc active cùng thời điểm.

CCU không tự động suy ra RPS nếu không biết user đang làm gì.

Ví dụ:

```text
1.000 CCU polling mỗi 60s
=> 1.000 / 60 ≈ 16.7 req/s

1.000 CCU polling mỗi 2s
=> 1.000 / 2 = 500 req/s
```

Cùng là 1.000 CCU, nhưng tải API khác nhau rất nhiều.

Vì vậy, khi ghi CCU trong tài liệu design, nên đi kèm:

```text
User action frequency
Polling interval
Số thao tác trung bình/user/phút
Số màn hình realtime đang mở
Tỷ lệ user active thật sự
```

CCU chỉ là đầu vào ban đầu. Muốn tính capacity cần chuyển CCU thành request rate và workload phía sau.

---

### 2.8 Peak Traffic

**Peak traffic** là mức tải cao nhất trong một khoảng thời gian ngắn.

Peak thường quan trọng hơn average.

Ví dụ:

```text
10.000 request/ngày
```

Nghe có vẻ nhỏ. Nếu chia đều cả ngày:

```text
10.000 / 86.400 ≈ 0.12 req/s
```

Nhưng nếu 8.000 request dồn vào 10 phút:

```text
8.000 / 600 ≈ 13.3 req/s
```

Tải peak cao hơn average hơn 100 lần.

Trong thực tế, peak thường đến từ:

```text
Giờ mở cửa phòng khám
Giờ check-in đầu ngày
Flash sale
Cuối tháng
Chiến dịch marketing
Batch job chạy cùng giờ user dùng hệ thống
Nhiều client reconnect cùng lúc sau lỗi mạng
```

Khi estimate load, nên ghi rõ:

```text
daily_volume
peak_window
peak_volume_ratio
peak_rps
```

Ví dụ:

```text
daily_volume = 10.000 request/ngày
peak_window = 2 giờ
peak_volume_ratio = 70%

peak_rps = 10.000 * 70% / (2 * 3600)
         ≈ 0.97 req/s
```

---

### 2.9 Read Path và Write Path

**Read path** là luồng đọc dữ liệu.

Ví dụ:

```text
Xem danh sách hàng chờ
Xem trạng thái phiếu khám
Xem dashboard
Tìm kiếm sản phẩm
Lấy số người đang chờ
```

**Write path** là luồng ghi hoặc thay đổi dữ liệu.

Ví dụ:

```text
Tạo phiếu khám
Gọi bệnh nhân tiếp theo
Cập nhật trạng thái thanh toán
Duyệt đơn hàng
Nhận webhook từ 3rd-party
```

Read và write thường có tính chất khác nhau.

Read path thường:

```text
Nhiều hơn write
Dễ bị nhân tải bởi polling/dashboard
Có thể dùng cache nếu chấp nhận stale data
Ảnh hưởng latency và chi phí DB
```

Write path thường:

```text
Ít hơn read
Cần correctness cao
Cần transaction/idempotency/unique constraint
Có thể kéo theo side effects như event, notification, audit, sync
```

Không nên gộp chung read và write thành “traffic”. Nên tách rõ:

```text
read_qps
write_qps
queries_per_read
queries_per_write
side_effects_per_write
```

---

### 2.10 Query Cost

**Query cost** là chi phí thực sự mà database phải bỏ ra để xử lý query.

Một query không chỉ được đánh giá bằng số lần chạy. Cần xem:

```text
Query có dùng index không?
Scan bao nhiêu rows?
Có sort lớn không?
Có group by lớn không?
Có join nhiều bảng không?
Có lock lâu không?
Có trả nhiều dữ liệu qua network không?
```

Công thức đơn giản:

```text
db_query_qps = api_qps * queries_per_request
rows_scanned_per_second = db_query_qps * avg_rows_scanned_per_query
```

Ví dụ:

```text
100 req/s
mỗi request 3 query
=> 300 query/s

mỗi query scan 10.000 rows
=> 300 * 10.000 = 3.000.000 rows scanned/s
```

Trong tình huống này, bottleneck có thể không nằm ở API server, mà nằm ở query plan, index, sort, join hoặc lock trong DB.

---

### 2.11 Data Size và Growth

**Data size** là lượng dữ liệu hiện có.

**Growth** là tốc độ dữ liệu tăng theo thời gian.

Cần ghi rõ:

```text
Hiện tại có bao nhiêu rows?
Mỗi ngày tăng bao nhiêu rows?
Mỗi tháng/năm tăng bao nhiêu rows?
Dữ liệu giữ trong bao lâu?
Query thường lọc theo tenant/ngày/status không?
Report đọc dữ liệu nóng hay dữ liệu lịch sử?
```

Ví dụ:

```text
3.000 queue events/buổi
2 buổi/ngày
=> 6.000 events/ngày

30 ngày => 180.000 events/tháng
365 ngày => 2.190.000 events/năm
```

Con số này giúp quyết định:

```text
Có cần index theo ngày không?
Có cần archive dữ liệu cũ không?
Có cần partition không?
Report có nên đọc bảng transaction trực tiếp không?
Có cần bảng tổng hợp/materialized view không?
```

---

### 2.12 Fanout

**Fanout** là việc một request hoặc event tạo ra nhiều tác động downstream.

Ví dụ:

```text
Doctor calls next patient

1 write vào DB
-> update Redis summary
-> push WebSocket tới màn hình phòng khám
-> push WebSocket tới app bệnh nhân
-> ghi audit log
-> notify dashboard
-> publish integration event
```

Nhìn bên ngoài chỉ là một thao tác “gọi số”, nhưng phía sau có nhiều side effects.

Khi tính tải, cần tính cả fanout:

```text
write_events_per_second
side_effects_per_event
messages_per_second
websocket_pushes_per_second
cache_updates_per_second
audit_writes_per_second
```

Fanout là lý do nhiều hệ thống write thấp nhưng vẫn cần queue/event để tách side effects khỏi transaction chính.

---

### 2.13 Hot Key và Skew

**Hot key** là một key/entity bị truy cập nhiều bất thường.

**Skew** là tải phân bố lệch.

Ví dụ:

```text
1 tenant chiếm 80% traffic
1 phòng khám có 60% bệnh nhân
1 dashboard được cả công ty mở
1 sản phẩm hot trong flash sale
1 cache key bị hàng nghìn client đọc cùng lúc
```

Average QPS có thể che giấu hot key.

Ví dụ:

```text
Toàn hệ thống 100 req/s
Nhìn có vẻ bình thường

Nhưng 80 req/s dồn vào 1 tenant hoặc 1 phòng khám
=> tenant/key đó mới là điểm nóng
```

Khi có hot key, có thể cần:

```text
Local cache
Redis read model
Rate limit theo tenant/key
Queue per tenant
Tenant fairness
Sharding theo key
Single-flight để chống cache stampede
```

---

### 2.14 Timeout

**Timeout** là thời gian tối đa hệ thống chờ một operation trước khi coi là thất bại.

Ví dụ:

```text
DB query timeout: 3s
HTTP call timeout: 5s
Queue job timeout: 60s
```

Timeout quá dài sẽ làm request treo lâu, giữ thread, connection và memory.

Timeout quá ngắn có thể tạo lỗi giả khi dependency chỉ chậm nhẹ.

Timeout nên đi cùng:

```text
Retry policy
Backoff
Jitter
Circuit breaker
Fallback/degradation
```

Ví dụ:

```text
Gọi 3rd-party timeout 5s
Retry tối đa 3 lần
Backoff: 1s -> 5s -> 30s
Jitter ±20%
Nếu vẫn fail: đưa vào queue retry sau, không giữ request user quá lâu
```

---

### 2.15 Retry, Backoff và Jitter

**Retry** là thử lại sau lỗi tạm thời.

**Backoff** là tăng khoảng chờ giữa các lần retry.

**Jitter** là thêm độ ngẫu nhiên nhỏ vào thời gian chờ để tránh nhiều request retry cùng lúc.

Ví dụ:

```text
Retry lần 1 sau 1s
Retry lần 2 sau 5s
Retry lần 3 sau 30s
Thêm jitter ±20%
```

Không nên retry vô hạn hoặc retry ngay lập tức.

Nếu dependency đang lỗi, retry không kiểm soát có thể làm dependency chết nặng hơn.

Ví dụ lỗi thiết kế:

```text
1.000 request fail cùng lúc
Tất cả retry ngay sau 1s
=> tạo thêm 1.000 request mới vào dependency đang lỗi
=> lỗi dây chuyền
```

Retry chỉ nên áp dụng cho lỗi có khả năng tạm thời, ví dụ:

```text
Timeout tạm thời
HTTP 502/503/504
Deadlock/lock timeout có thể retry an toàn
Network glitch
```

Với operation ghi dữ liệu, retry cần đi cùng idempotency để tránh ghi trùng.

---

### 2.16 Rate Limit, Throttle và Quota

**Rate limit** là giới hạn số request trong một khoảng thời gian ngắn.

Ví dụ:

```text
100 request/phút/user
1.000 request/phút/tenant
300 request/phút toàn hệ thống tới 3rd-party
```

**Throttle** là làm chậm hoặc từ chối request để bảo vệ hệ thống.

**Quota** là hạn mức trong chu kỳ dài hơn.

Ví dụ:

```text
10.000 request/ngày/tenant
1 triệu API calls/tháng
```

Khi vượt rate limit, hệ thống thường trả:

```text
429 Too Many Requests
```

Rate limit không chỉ để chống abuse. Nó còn để bảo vệ:

```text
DB
Queue
Worker
3rd-party
Tenant khác
```

Trong hệ thống multi-tenant, rate limit giúp tránh việc một tenant lớn làm ảnh hưởng tenant nhỏ.

---

### 2.17 Backpressure

**Backpressure** là cơ chế báo hoặc ép upstream chậm lại khi downstream xử lý không kịp.

Ví dụ:

```text
Queue length tăng quá ngưỡng
Message age tăng cao
DB connection pool gần đầy
3rd-party trả 429 nhiều
Worker xử lý chậm hơn tốc độ producer tạo job
```

Khi đó hệ thống có thể:

```text
Giảm tốc producer
Reject bớt request
Trả 429/503 có kiểm soát
Delay job
Tăng polling interval
Trả trạng thái "đang xử lý"
Tạm dừng một số tác vụ không quan trọng
```

Không có backpressure, hệ thống dễ chết dây chuyền:

```text
Request dồn vào
Queue phình to
Worker xử lý không kịp
DB nghẽn
Retry tăng
Latency tăng
Thread/connection cạn
Toàn hệ thống chậm hoặc sập
```

---

### 2.18 Queue Length, Lag và Message Age

Với hệ thống async, không chỉ nhìn queue length.

Các chỉ số cần quan tâm:

```text
Queue length: số message đang chờ
Consumer throughput: consumer xử lý được bao nhiêu message/s
Message age: message cũ nhất đã chờ bao lâu
Lag: mức độ consumer bị tụt phía sau producer
```

Queue length lớn chưa chắc nguy hiểm nếu consumer xử lý rất nhanh.

Ví dụ:

```text
Queue length = 10.000 message
Consumer xử lý = 5.000 message/s
=> khoảng 2s là xử lý xong
=> có thể ổn
```

Nhưng message age cao mới đáng lo.

Ví dụ:

```text
Queue length = 500 message
Message age cũ nhất = 30 phút
=> có thể user/business đang bị trễ thật
```

Vì vậy, khi đặt threshold cho queue, nên có cả:

```text
max_queue_length
max_message_age
min_consumer_throughput
retry_count_threshold
```

---

### 2.19 Staleness

**Staleness** là mức độ dữ liệu có thể bị cũ/trễ so với trạng thái thật.

Ví dụ:

```text
Hàng chờ khám bệnh update chậm 2-3s: thường chấp nhận được
Dashboard doanh thu chậm 1-5 phút: thường chấp nhận được
Thanh toán thành công/thất bại: cần chính xác hơn
Tồn kho khi xuất hàng: cần correctness cao
```

Staleness rất quan trọng vì nó quyết định có thể dùng cache/read model hay không.

Nếu dữ liệu có thể stale vài giây, ta có nhiều lựa chọn:

```text
Redis cache
Read model
WebSocket event + refetch snapshot
Polling interval dài hơn
Async refresh
```

Nếu dữ liệu bắt buộc đúng tuyệt đối tại thời điểm ghi, cần ưu tiên:

```text
DB transaction
Lock phù hợp
Unique constraint
Optimistic concurrency
Idempotency
Source of truth rõ ràng
```

---

## 3. Quy trình phân tích Load Parameters

Khi gặp một bài toán system design, không nên bắt đầu bằng công nghệ. Nên đi theo quy trình sau.

---

### 3.1 Xác định đơn vị nghiệp vụ chính

Trước khi tính request, cần biết “đơn vị nghiệp vụ” là gì.

Ví dụ:

```text
Hàng chờ khám bệnh:
- lượt khám
- lượt gọi số
- trạng thái phiếu khám
- phòng khám

Refresh cache/status:
- entity cần refresh
- trạng thái 3rd-party
- cache key
- terminal status

Đơn hàng:
- order
- payment confirmation
- shipment status
- invoice
```

Nếu xác định sai đơn vị nghiệp vụ, phần estimate phía sau dễ sai.

Ví dụ:

```text
Nói "500 bệnh nhân/ngày" là chưa đủ.
Mỗi bệnh nhân có thể tạo nhiều state changes:
- lấy số
- chờ khám
- đang khám
- hoàn thành
- thanh toán
- nhận kết quả
```

---

### 3.2 Tách read path và write path

Cần tách rõ:

```text
Read path đọc dữ liệu gì?
Write path thay đổi dữ liệu gì?
```

Ví dụ hàng chờ khám bệnh:

```text
Read:
- app bệnh nhân xem số đang khám
- app bệnh nhân xem còn bao nhiêu người chờ trước
- màn hình phòng khám xem danh sách chờ
- dashboard quản lý xem tổng quan

Write:
- tiếp nhận bệnh nhân
- gọi bệnh nhân tiếp theo
- chuyển trạng thái đang khám
- hoàn thành lượt khám
- hủy/đổi phòng
```

Sau đó tính riêng:

```text
read_qps
write_qps
read_query_cost
write_transaction_cost
fanout_after_write
```

---

### 3.3 Xác định peak window

Không chỉ hỏi “mỗi ngày bao nhiêu request”. Cần hỏi:

```text
Tải dồn vào khung giờ nào?
Bao nhiêu phần trăm volume nằm trong peak?
Peak kéo dài bao lâu?
Batch job có chạy cùng lúc không?
Có campaign hoặc sự kiện đặc biệt không?
```

Template:

```text
daily_volume = ?
peak_volume_ratio = ?
peak_window_seconds = ?

peak_rps = daily_volume * peak_volume_ratio / peak_window_seconds
```

Ví dụ:

```text
daily_volume = 30.000 request
peak_volume_ratio = 60%
peak_window = 2 giờ = 7.200s

peak_rps = 30.000 * 60% / 7.200
         = 2.5 req/s
```

---

### 3.4 Tính tải do polling/realtime client

Polling rất dễ bị đánh giá thấp.

Công thức:

```text
polling_read_qps = active_clients / polling_interval_seconds
```

Ví dụ:

```text
500 active clients
polling mỗi 5s

polling_read_qps = 500 / 5
                 = 100 req/s
```

Nếu tăng polling interval:

```text
500 active clients
polling mỗi 30s

polling_read_qps = 500 / 30
                 ≈ 16.7 req/s
```

Chỉ cần đổi polling từ 5s lên 30s, tải read giảm khoảng 6 lần.

Nếu dùng WebSocket, không phải tự động hết tải. Cần tính:

```text
Số connection đồng thời
Số event push/s
Số client nhận mỗi event
Reconnect storm khi mất mạng
Snapshot refetch sau reconnect
```

---

### 3.5 Tính chi phí DB/cache/downstream phía sau mỗi request

Một request API có thể tạo nhiều việc phía sau.

Template:

```text
api_qps = ?
queries_per_request = ?
db_query_qps = api_qps * queries_per_request

avg_rows_scanned = ?
rows_scanned_per_second = db_query_qps * avg_rows_scanned
```

Ví dụ:

```text
api_qps = 100 req/s
queries_per_request = 3
avg_rows_scanned = 10.000

db_query_qps = 100 * 3 = 300 query/s
rows_scanned_per_second = 300 * 10.000 = 3.000.000 rows/s
```

Nếu rows scanned/s quá lớn, hướng xử lý có thể là:

```text
Thêm index đúng với filter/order
Giảm số query/request
Cache/read model
Precompute summary
Pagination đúng
Tránh count nóng liên tục
Tách report khỏi transaction DB
```

---

### 3.6 Tính write load và side effects

Write load thường nhỏ hơn read nhưng rủi ro correctness cao hơn.

Template:

```text
business_events_per_peak_window = ?
peak_window_seconds = ?
write_qps = business_events_per_peak_window / peak_window_seconds

side_effects_per_write = ?
message_rate = write_qps * side_effects_per_write
```

Ví dụ:

```text
500 bệnh nhân/buổi
mỗi bệnh nhân 6 state changes
=> 3.000 write events/buổi

Nếu buổi sáng 4 giờ:
write_qps = 3.000 / (4 * 3600)
          ≈ 0.21 write/s
```

Write QPS nhỏ không có nghĩa là write đơn giản. Cần kiểm tra:

```text
Có ghi trùng không?
Có race condition không?
Có cần unique constraint không?
Có cần transaction không?
Có cần idempotency không?
Có side effect cần retry độc lập không?
```

---

### 3.7 Tính external dependency workload

Với 3rd-party, điều quan trọng là so sánh demand của hệ thống với limit của dependency.

Template:

```text
active_entities = ?
refresh_interval_minutes = ?
required_requests_per_minute = active_entities / refresh_interval_minutes

third_party_limit_per_minute = ?
```

Ví dụ:

```text
10.000 entity
refresh mỗi 5 phút

required_requests_per_minute = 10.000 / 5
                             = 2.000 request/phút

3rd-party limit = 300 request/phút
```

Kết luận:

```text
Không khả thi nếu gọi từng entity mỗi 5 phút.
```

Giải pháp không phải chỉ là thêm worker. Vì thêm worker có thể làm vượt rate limit nhanh hơn.

Hướng đúng hơn:

```text
Chỉ refresh active entity
Terminal status thì ngừng refresh
Dùng batch API nếu có
Dùng webhook nếu có
Backoff theo tuổi entity
Rate limiter toàn hệ thống
Queue retry có kiểm soát
```

---

### 3.8 Xác định bottleneck hypothesis

Sau khi có số liệu, cần ghi giả thuyết bottleneck.

Ví dụ:

```text
Hypothesis 1:
Write load thấp, bottleneck không nằm ở ghi DB.

Hypothesis 2:
Read polling tạo 100 req/s, bottleneck có thể nằm ở query count hàng chờ.

Hypothesis 3:
Nếu dùng WebSocket, bottleneck chuyển từ DB read sang connection management và fanout push.

Hypothesis 4:
Nếu refresh 3rd-party từng entity, bottleneck nằm ở external rate limit, không nằm ở worker throughput.
```

Tài liệu design nên ghi rõ giả thuyết này để người review hiểu vì sao chọn giải pháp.

---

### 3.9 Ghi rõ assumption và unknowns

Khi chưa có số liệu thật, không nên bỏ qua phần tính toán. Hãy ghi assumption.

Ví dụ:

```text
Assumptions:
- 500 active clients tại peak
- Polling interval 5s
- Mỗi request chạy 3 query DB
- Mỗi bệnh nhân có 6 state changes
- Peak window 4 giờ buổi sáng
```

Và ghi unknowns:

```text
Unknowns:
- Chưa có số liệu p95 latency hiện tại
- Chưa biết query scan bao nhiêu rows
- Chưa biết top phòng khám chiếm bao nhiêu % traffic
- Chưa rõ 3rd-party có batch API hay webhook không
```

Assumption giúp tài liệu minh bạch. Nếu sau này số liệu thật khác assumption, ta biết cần update phần nào.

---

## 4. Công thức nhanh thường dùng

### 4.1 QPS từ polling

```text
qps = active_clients / polling_interval_seconds
```

Ví dụ:

```text
1.000 clients polling mỗi 5s
=> 1.000 / 5 = 200 req/s

1.000 clients polling mỗi 30s
=> 1.000 / 30 ≈ 33 req/s
```

---

### 4.2 DB Query QPS

```text
db_query_qps = api_qps * queries_per_request
```

Ví dụ:

```text
200 req/s
4 query/request
=> 800 query/s
```

---

### 4.3 Rows Scanned Per Second

```text
rows_scanned_per_second = db_query_qps * avg_rows_scanned_per_query
```

Ví dụ:

```text
800 query/s
mỗi query scan 5.000 rows
=> 4.000.000 rows scanned/s
```

---

### 4.4 Event Throughput

```text
event_rate = business_state_changes / seconds
```

Ví dụ:

```text
100 phòng
mỗi phòng gọi 1 bệnh nhân / 5 phút

business_events = 100
seconds = 300

event_rate = 100 / 300
           ≈ 0.33 event/s
```

Trong case này event bus thường không phải bottleneck. Correctness của write và fanout read có thể quan trọng hơn.

---

### 4.5 Storage Growth

```text
rows_per_day = business_events_per_day
rows_per_month = rows_per_day * 30
rows_per_year = rows_per_day * 365
```

Ví dụ:

```text
50.000 events/ngày
=> 1.500.000 rows/tháng
=> 18.250.000 rows/năm
```

---

### 4.6 Refresh Workload

```text
refresh_requests_per_minute = active_entities / refresh_interval_minutes
```

Ví dụ:

```text
10.000 entity refresh mỗi 5 phút
=> 10.000 / 5 = 2.000 request/phút
```

---

### 4.7 Cache Hit Impact

```text
db_qps_after_cache = total_read_qps * (1 - cache_hit_ratio)
```

Ví dụ:

```text
1.000 read/s
cache hit 90%
=> DB còn 100 read/s

1.000 read/s
cache hit 99%
=> DB còn 10 read/s
```

Cache hit cao giúp giảm tải DB, nhưng chưa đủ để kết luận design đúng. Cần hỏi thêm:

```text
Cache sai thì nghiệp vụ có sai không?
Cache có rebuild được từ DB không?
TTL bao lâu?
Invalidate lúc nào?
Có cache stampede không?
Có hot key không?
```

---

### 4.8 Little’s Law cho concurrency

```text
concurrency ≈ throughput * latency
```

Với API:

```text
concurrent_requests ≈ rps * latency_seconds
```

Ví dụ:

```text
100 req/s
latency 200ms = 0.2s
=> concurrency ≈ 20

100 req/s
latency 2s
=> concurrency ≈ 200
```

Ý nghĩa:

```text
Latency tăng làm số request đang treo trong hệ thống tăng.
Số request đang treo tăng làm tiêu tốn thread, connection, memory.
Khi tài nguyên cạn, latency lại tăng tiếp.
```

Đây là vòng xoáy thường gặp khi hệ thống bị quá tải.

---

## 5. Capacity không chỉ là QPS

Một lỗi phổ biến là hỏi:

```text
Hệ thống chịu được bao nhiêu QPS?
```

Câu hỏi này chưa đủ.

Capacity thực tế phụ thuộc vào nhiều yếu tố:

```text
API RPS
DB QPS
Rows scanned/s
CPU cost/request
Memory/request
Network payload/request
Connection pool usage
Thread pool usage
Lock contention
Queue length/message age
External dependency limit
Cache hit ratio
Fanout per write
```

Ví dụ:

```text
Case A:
500 req/s đọc Redis theo key nhỏ
=> có thể nhẹ

Case B:
20 req/s chạy query report scan nhiều bảng
=> có thể rất nặng

Case C:
5 req/s gọi 3rd-party latency 10s
=> có thể làm đầy connection/thread nếu xử lý sync
```

Khi đánh giá capacity, nên ghi theo dạng:

```text
API layer:
- peak_rps = ?
- p95 latency target = ?
- concurrent_requests ≈ ?

DB layer:
- db_query_qps = ?
- rows_scanned/s = ?
- top queries = ?
- lock risk = ?

Cache layer:
- cache_qps = ?
- expected hit ratio = ?
- hot key risk = ?

Queue layer:
- message/s = ?
- consumer throughput = ?
- max acceptable message age = ?

External dependency:
- required request/min = ?
- allowed request/min = ?
- timeout/retry policy = ?
```

---

## 6. Từ con số đến quyết định kiến trúc

Phần này nối Load Parameters với lựa chọn kiến trúc.

---

### 6.1 Khi nào query DB trực tiếp là đủ?

Query DB trực tiếp thường đủ khi:

```text
Read QPS thấp hoặc vừa
Query có index tốt
Rows scanned thấp
Không có polling dày
Không có fanout realtime lớn
Dữ liệu cần đúng trực tiếp từ source of truth
Team muốn giữ phase đầu đơn giản
```

Ví dụ:

```text
20 req/s
2 query/request
=> 40 query/s
Query dùng index tốt
Rows scanned thấp
```

Trong case này, thêm Redis có thể chưa cần thiết. Redis sẽ thêm complexity: invalidate, TTL, cache stale, vận hành, debug.

---

### 6.2 Khi nào cần cache/read model?

Cân nhắc cache/read model khi:

```text
Nhiều client đọc cùng một dữ liệu
Dashboard/status bị refresh liên tục
Query tổng hợp/count nóng
Response có thể stale vài giây/phút
Cache có thể rebuild từ DB
DB đang tốn tài nguyên cho read lặp lại
```

Ví dụ:

```text
500 clients polling mỗi 5s
=> 100 req/s
Mỗi request count queue status
```

Hướng xử lý:

```text
Cache summary theo phòng khám
Read model lưu sẵn số đang chờ/số đang khám
WebSocket push event để client refetch khi cần
Polling interval dài hơn
```

---

### 6.3 Khi nào cần queue/event async?

Cần queue/event async khi:

```text
Một write kéo theo nhiều side effects
Side effects cần retry độc lập
Không muốn user chờ notification/report/sync
Cần fanout sang nhiều consumer
Cần chống mất event bằng Outbox
Dependency bên ngoài chậm hoặc không ổn định
```

Ví dụ:

```text
Thanh toán thành công
-> cập nhật invoice
-> gửi SMS
-> sync kế toán
-> ghi audit
-> notify dashboard
```

Không nên bắt user chờ toàn bộ side effects hoàn tất nếu nghiệp vụ chính đã commit thành công.

Hướng thường dùng:

```text
DB transaction cho core write
Outbox lưu event trong cùng transaction
Worker đọc Outbox publish vào queue
Consumer xử lý side effects độc lập
Retry/backoff/idempotency cho consumer
```

---

### 6.4 Khi nào cần WebSocket/SignalR?

Cần WebSocket/SignalR khi:

```text
User đang nhìn màn hình và cần update nhanh
Polling tạo read QPS lớn
Một event cần thông báo cho nhiều client
UX cần gần realtime
```

Ví dụ:

```text
Bác sĩ gọi số tiếp theo
Màn hình TV cần cập nhật
App bệnh nhân cần biết còn bao nhiêu người chờ trước
Dashboard cần thấy phòng nào đang khám ai
```

Nhưng WebSocket không nên là source of truth.

Pattern an toàn:

```text
Event push chỉ là tín hiệu có thay đổi
Client nhận event -> refetch snapshot hoặc update nhẹ có kiểm soát
Reconnect -> refetch snapshot
Có polling nhẹ 30-60s làm self-heal
DB/API vẫn là nơi trả trạng thái thật
```

Cần chú ý:

```text
Connection count
Reconnect storm
Message ordering
Duplicate event
Client offline
Scale out nhiều instance
Redis backplane hoặc message broker cho broadcast
```

---

### 6.5 Khi nào cần rate limiter?

Cần rate limiter khi:

```text
Có 3rd-party limit
Có tenant/user có thể tạo tải bất thường
Có API public hoặc mobile app polling
Có nguy cơ retry storm
Cần bảo vệ DB/queue/worker
```

Ví dụ:

```text
3rd-party cho 300 request/phút
Hệ thống cần refresh 2.000 request/phút nếu gọi thẳng
```

Rate limiter giúp đảm bảo tổng request đi ra không vượt limit.

Có thể rate limit theo:

```text
Toàn hệ thống
Theo tenant
Theo user
Theo IP
Theo API endpoint
Theo dependency
Theo queue/job type
```

---

### 6.6 Khi nào cần partition/archive/materialized view?

Cân nhắc khi:

```text
Dữ liệu tăng nhanh theo thời gian
Query thường lọc theo ngày/tháng
Report scan nhiều dữ liệu lịch sử
Bảng transaction quá lớn
Index không còn đủ tốt cho report
```

Ví dụ:

```text
50.000 events/ngày
=> 18.25 triệu events/năm
```

Hướng xử lý:

```text
Index theo tenant/date/status
Archive dữ liệu cũ
Partition theo tháng/ngày nếu phù hợp
Bảng tổng hợp theo ngày/tháng
Materialized view/read model cho report
Tách OLTP và OLAP nếu cần
```

---

### 6.7 Khi nào chưa nên dùng kiến trúc lớn?

Chưa nên dùng Kafka/Kubernetes/Event Sourcing/microservices phức tạp khi:

```text
Tải còn nhỏ
Team chưa cần vận hành nhiều service
Chưa có nhiều consumer độc lập
Chưa cần replay event
Chưa cần throughput rất cao
Transaction DB vẫn đáp ứng correctness
Quan sát/monitoring/deployment chưa sẵn sàng
```

Kiến trúc lớn chỉ nên xuất hiện khi có nhu cầu rõ về:

```text
Throughput
Fanout
Replay
Isolation
Independent scaling
Multi-consumer
Audit/event history
Operational maturity
```

---

## 7. Degradation Plan: khi quá tải thì hệ thống làm gì?

Một design tốt không chỉ mô tả lúc hệ thống chạy bình thường. Nó cần mô tả khi hệ thống bị quá tải hoặc dependency chậm.

### 7.1 Vì sao cần degradation plan?

Nếu không có kế hoạch degrade, hệ thống thường phản ứng theo cách xấu nhất:

```text
Tất cả request vẫn cố xử lý
Queue phình to
DB bị nghẽn
Retry tăng
Latency tăng
User bấm lại nhiều hơn
Hệ thống càng lúc càng chậm
```

Degradation plan giúp hệ thống giảm chất lượng dịch vụ có kiểm soát thay vì sập toàn bộ.

---

### 7.2 Các cách degrade thường dùng

```text
Trả cached/stale data
Giãn polling interval
Tạm tắt report/dashboard nặng
Chuyển xử lý sync sang async
Trả trạng thái "đang xử lý"
Rate limit request mới
Reject có kiểm soát với 429/503
Tạm dừng job không quan trọng
Chỉ xử lý active entity
Tăng backoff khi dependency lỗi
```

---

### 7.3 Ví dụ degradation cho hàng chờ khám bệnh

Khi read polling quá cao:

```text
Phase bình thường:
- WebSocket push event khi trạng thái thay đổi
- Client refetch snapshot khi nhận event

Khi quá tải:
- Tăng polling fallback từ 30s lên 60s
- Trả snapshot cached trong 2-3s
- Chỉ update realtime cho phòng liên quan
- Dashboard tổng hợp có thể trễ 10-30s
```

Nhưng write path gọi số vẫn phải ưu tiên correctness:

```text
DB transaction vẫn là source of truth
Không bỏ qua unique constraint/idempotency
Không để gọi trùng bệnh nhân do cache stale
```

---

### 7.4 Ví dụ degradation cho refresh 3rd-party

Khi 3rd-party chậm hoặc rate limit:

```text
Không retry dồn dập
Tăng backoff
Giảm số entity refresh
Ưu tiên entity active/gần đây
Terminal status ngừng refresh
Trả trạng thái cached kèm thời điểm last_updated_at
Nếu quá hạn, hiển thị "đang cập nhật" thay vì block user
```

---

## 8. Bảng mapping dấu hiệu -> giải pháp thường đủ

| Dấu hiệu | Giải pháp thường đủ |
|---|---|
| Write thấp, correctness cao | DB transaction + unique constraint + optimistic concurrency nếu cần |
| Read thấp, query index tốt | Query DB trực tiếp |
| Read nhiều, cùng một dữ liệu | Redis/cache/read model |
| Polling tạo tải lớn | WebSocket/SignalR hoặc tăng polling interval |
| Client cần update nhanh | WebSocket/SignalR + self-heal snapshot |
| Write có nhiều side effects | Outbox + queue/event |
| Side effect cần retry độc lập | Queue consumer + retry/backoff/idempotency |
| 3rd-party rate limit thấp | Rate limiter + async worker + backoff + batch/webhook nếu có |
| Query report lớn | Bảng tổng hợp/materialized view/archive |
| Dữ liệu tăng nhanh theo thời gian | Index theo time/tenant/status + archive/partition |
| Hot tenant/key | Tenant fairness + per-key rate limit/cache/queue |
| Cache key bị đọc quá nhiều | Local cache/single-flight/cache stampede protection |
| Message age tăng cao | Tăng consumer, giảm producer, backpressure, ưu tiên job quan trọng |
| Latency tăng làm request treo nhiều | Timeout, bulkhead, giảm dependency sync, queue async |

---

## 9. Load Parameter Worksheet

Đây là template có thể copy vào mỗi case study.

---

### 9.1 Business Context

```text
Bài toán:

Đơn vị nghiệp vụ chính:

User/client chính:

Source of truth:

Nghiệp vụ nào cần correctness cao:

Nghiệp vụ nào chấp nhận stale data:
```

---

### 9.2 Business Volume

```text
Số user/ngày:
Số active users tại peak:
Số tenant/chi nhánh/phòng/kho:
Số entity active cùng lúc:
Số nghiệp vụ/ngày:
Số bản ghi tạo mới/ngày:
```

---

### 9.3 Peak Assumptions

```text
Daily volume:
Peak window:
Peak volume ratio:
Peak volume:
Peak RPS:
```

Công thức:

```text
peak_rps = daily_volume * peak_volume_ratio / peak_window_seconds
```

---

### 9.4 Read Load

```text
Active read clients:
Polling interval:
Polling read QPS:
Other read QPS:
Total read QPS:
Queries per read request:
DB read QPS:
Avg rows scanned/query:
Rows scanned/s:
```

Công thức:

```text
polling_read_qps = active_clients / polling_interval_seconds
db_read_qps = total_read_qps * queries_per_request
rows_scanned_per_second = db_read_qps * avg_rows_scanned
```

---

### 9.5 Write Load

```text
Business events/day:
Business events in peak window:
Peak write QPS:
State changes per entity:
Side effects per write:
Message/event rate:
```

Công thức:

```text
write_qps = business_events_in_peak / peak_window_seconds
message_rate = write_qps * side_effects_per_write
```

---

### 9.6 Data Growth

```text
Rows/day:
Rows/month:
Rows/year:
Retention:
Main query filter:
Need archive/partition:
Need summary table/materialized view:
```

---

### 9.7 Latency & Staleness Target

```text
API p95 target:
API p99 target:
Realtime delay acceptable:
Stale data acceptable:
Operation timeout:
User-facing timeout:
```

---

### 9.8 External Dependency

```text
Dependency name:
Rate limit:
Quota:
Latency p95:
Timeout:
Batch API available:
Webhook available:
Required request/min:
Gap between demand and limit:
Retry/backoff policy:
```

---

### 9.9 Queue/Async Parameters

```text
Producer rate:
Consumer throughput:
Expected queue length:
Max acceptable queue length:
Max acceptable message age:
Retry count threshold:
Dead-letter strategy:
Idempotency key:
```

---

### 9.10 Hot Key / Distribution

```text
Top tenant traffic:
Top room/key/entity traffic:
Skew risk:
Tenant fairness needed:
Per-key lock/rate limit needed:
```

---

### 9.11 Bottleneck Hypothesis

```text
Likely bottleneck 1:
Reason:

Likely bottleneck 2:
Reason:

Not a bottleneck yet:
Reason:
```

---

### 9.12 Architecture Decision

```text
Decision:

Why this is enough for current load:

Trade-off accepted:

What we intentionally do not add yet:

Upgrade threshold:

Degradation plan:
```

---

## 10. Hàng chờ khám bệnh

### 10.1 Business context

Bài toán:

```text
Hệ thống quản lý hàng chờ khám bệnh theo phòng ban/phòng khám.
Bệnh nhân có thể xem số đang khám, số của họ, và số người chờ trước.
Nhân viên/bác sĩ có thể gọi bệnh nhân tiếp theo và cập nhật trạng thái khám.
```

Input giả định:

```text
100 phòng khám
500 bệnh nhân/buổi sáng
Mỗi bệnh nhân có khoảng 6 state changes
500 app/client active tại peak
Client polling mỗi 5s nếu chưa có WebSocket
```

---

### 10.2 Write load

```text
500 bệnh nhân/buổi
6 state changes/bệnh nhân
=> 3.000 write events/buổi
```

Nếu buổi sáng kéo dài 4 giờ:

```text
write_qps = 3.000 / (4 * 3600)
          = 3.000 / 14.400
          ≈ 0.21 write/s
```

Kết luận:

```text
Write throughput không cao.
Bottleneck chính chưa chắc nằm ở số lượng write.
```

Nhưng write cần correctness cao:

```text
Không được gọi trùng bệnh nhân
Không được nhảy sai thứ tự
Không được mất trạng thái
Không được ghi trạng thái cũ đè trạng thái mới
```

Write path nên ưu tiên:

```text
DB transaction
Unique constraint nếu có rule chống trùng
Optimistic concurrency nếu nhiều người cùng thao tác một entity
Idempotency key cho command/event quan trọng
Audit log nếu cần trace nghiệp vụ
```

---

### 10.3 Read load do polling

```text
500 active clients
polling mỗi 5s

read_qps = 500 / 5
         = 100 req/s
```

Nếu mỗi request chạy 3 query:

```text
db_query_qps = 100 * 3
             = 300 query/s
```

Nếu mỗi query scan 5.000 rows do index chưa tốt:

```text
rows_scanned_per_second = 300 * 5.000
                        = 1.500.000 rows/s
```

Kết luận:

```text
Read polling có thể là bottleneck lớn hơn write.
```

---

### 10.4 Kiến trúc phase đầu

Với tải trên, phase đầu có thể bắt đầu đơn giản:

```text
Write:
- DB transaction là source of truth
- Index/constraint để bảo vệ correctness
- Idempotency cho command quan trọng nếu có retry/message

Read:
- API trả snapshot hàng chờ theo phòng
- Index theo tenant/shop/phòng/status/ngày nếu query lọc theo các trường này
- Tránh count nóng scan nhiều rows

Realtime:
- Nếu polling 5s tạo tải cao, dùng WebSocket/SignalR để push tín hiệu thay đổi
- Client reconnect thì refetch snapshot
- Polling nhẹ 30-60s làm self-heal
```

---

### 10.5 Khi nào thêm Redis/read model?

Thêm Redis/read model khi có dấu hiệu:

```text
Nhiều client đọc cùng một summary
Query count hàng chờ bị nóng
DB QPS tăng do polling/dashboard
p95 latency read vượt target
Rows scanned/s cao dù write thấp
```

Read model có thể lưu:

```text
Theo phòng khám:
- số đang khám
- số người chờ
- số tiếp theo
- timestamp cập nhật cuối
```

Lưu ý:

```text
Redis/read model không nên là source of truth cho write correctness.
Nếu Redis mất, có thể rebuild từ DB.
```

---

### 10.6 Degradation plan

Khi read quá tải:

```text
Tăng polling fallback từ 30s lên 60s
Trả cached summary stale 2-3s
Chỉ push WebSocket tới room liên quan
Dashboard tổng hợp có thể delay 10-30s
```

Khi WebSocket lỗi:

```text
Client reconnect
Refetch snapshot từ API
Polling fallback 30-60s
```

Khi write conflict:

```text
Reject command không hợp lệ
Trả lỗi rõ ràng
Client refetch trạng thái mới nhất
Không retry mù nếu command không idempotent
```

---

### 10.7 Upgrade threshold

Ví dụ threshold:

```text
Nếu read QPS > 100 và p95 > 500ms:
-> kiểm tra query plan/index/cache

Nếu DB rows scanned/s quá cao:
-> tối ưu index hoặc dùng read model summary

Nếu polling tạo tải lớn:
-> chuyển sang WebSocket + polling fallback

Nếu write side effects tăng:
-> Outbox + queue cho notification/audit/sync

Nếu nhiều tenant/phòng hot:
-> rate limit/fairness/cache theo tenant/phòng
```

---

## 11. Refresh status từ 3rd-party

### 11.1 Business context

Bài toán:

```text
Hệ thống cần refresh trạng thái entity từ 3rd-party.
Ví dụ: order status, payment status, shipment status, external processing status.
```

Input giả định:

```text
10.000 active entity
Muốn refresh mỗi 5 phút
3rd-party limit 300 request/phút
```

---

### 11.2 Load calculation

```text
refresh_requests_per_minute = active_entities / refresh_interval_minutes
                            = 10.000 / 5
                            = 2.000 request/phút
```

So với limit:

```text
Required: 2.000 request/phút
Allowed: 300 request/phút
Gap: required cao hơn khoảng 6.67 lần
```

Kết luận:

```text
Không khả thi nếu gọi từng entity mỗi 5 phút.
Bottleneck nằm ở 3rd-party rate limit, không nằm ở số worker.
```

---

### 11.3 Sai lầm thường gặp

Sai lầm:

```text
Thêm worker để refresh nhanh hơn.
```

Vì sao sai:

```text
Worker nhiều hơn chỉ làm request đi ra nhanh hơn.
Nếu không có rate limiter, hệ thống sẽ vượt limit nhanh hơn và bị 429/ban/throttle.
```

---

### 11.4 Hướng thiết kế hợp lý

```text
Chỉ refresh active entity
Terminal status thì ngừng refresh
Entity càng cũ thì refresh càng thưa
Dùng batch API nếu 3rd-party hỗ trợ
Dùng webhook nếu 3rd-party hỗ trợ
Rate limiter toàn hệ thống theo limit 300 request/phút
Retry có backoff và jitter
Có dead-letter nếu retry quá nhiều lần
```

Ví dụ backoff theo tuổi entity:

```text
Entity mới tạo < 10 phút: refresh mỗi 1 phút
Entity 10-60 phút: refresh mỗi 5 phút
Entity > 60 phút: refresh mỗi 30 phút
Terminal status: không refresh nữa
```

---

### 11.5 Degradation plan

Khi 3rd-party chậm/lỗi:

```text
Không retry đồng loạt
Tăng backoff
Giảm refresh entity ít quan trọng
Ưu tiên entity user đang xem
Hiển thị last_updated_at
Trả trạng thái "đang cập nhật" nếu dữ liệu quá cũ
Không block request user quá lâu để chờ 3rd-party
```

---

## 12. Checklist review nhanh

Dùng checklist này khi review một design.

```text
[ ] Đã xác định đơn vị nghiệp vụ chính chưa?
[ ] Đã tách read path và write path chưa?
[ ] Có daily volume không?
[ ] Có peak volume/peak window không?
[ ] Có active clients/CCU không?
[ ] CCU đã được chuyển thành request rate chưa?
[ ] Có polling interval hoặc realtime requirement không?
[ ] Có read QPS/write QPS không?
[ ] Có queries per request không?
[ ] Có rows scanned per query không?
[ ] Có data growth/ngày/tháng/năm không?
[ ] Có latency target p95/p99 không?
[ ] Có staleness expectation không?
[ ] Có external dependency rate limit/quota không?
[ ] Có timeout/retry/backoff/jitter không?
[ ] Có queue length/message age threshold không?
[ ] Có hot tenant/key/entity không?
[ ] Có fanout sau mỗi write không?
[ ] Có degradation plan khi quá tải không?
[ ] Có upgrade threshold rõ không?
[ ] Có ghi assumption và unknowns không?
```

---

## 13. Cách note khi gặp bài toán mới

Khi nhận một bài toán mới, có thể note theo thứ tự sau.

### Step 1: Viết lại bài toán bằng entity và action

```text
Entity chính:
Action chính:
User/client chính:
Source of truth:
Correctness requirement:
Realtime requirement:
```

### Step 2: Ghi số lượng nghiệp vụ

```text
Số entity/ngày:
Số state changes/entity:
Số user/client active:
Peak window:
```

### Step 3: Tính read/write

```text
Read QPS:
Write QPS:
DB QPS:
Rows scanned/s:
Event/message rate:
```

### Step 4: Xác định bottleneck

```text
Bottleneck có thể nằm ở:
- DB read?
- DB write/lock?
- External dependency?
- Queue consumer?
- WebSocket fanout?
- Hot key/tenant?
```

### Step 5: Chọn kiến trúc tối thiểu đủ dùng

```text
Phase 1:
- Đơn giản nhất nhưng vẫn đúng nghiệp vụ

Phase 2:
- Thêm cache/read model/queue/realtime khi threshold bị vượt
```

### Step 6: Ghi trade-off

```text
Chọn giải pháp này vì:
Đánh đổi:
Rủi ro:
Cách rollback/degrade:
Ngưỡng nâng cấp:
```

---

## 14. Kết luận

Load Parameters là phần nền tảng của System Design. Nó giúp team đi từ cảm giác sang quyết định có căn cứ.

Một tài liệu design tốt nên thể hiện được chuỗi suy luận:

```text
Input tải là gì?
Tải read/write khác nhau thế nào?
Chi phí thật nằm ở API, DB, cache, queue hay 3rd-party?
Bottleneck khả năng cao nằm ở đâu?
Latency/staleness/correctness yêu cầu ra sao?
Với input hiện tại, giải pháp tối thiểu đủ dùng là gì?
Khi nào cần nâng cấp?
Nếu quá tải thì degrade thế nào?
```

Khi trả lời được các câu hỏi đó, việc chọn Redis, RabbitMQ, WebSocket, cache, read model hay query DB trực tiếp không còn là lựa chọn cảm tính. Nó trở thành quyết định kỹ thuật có thể giải thích, review, vận hành và mở rộng.
