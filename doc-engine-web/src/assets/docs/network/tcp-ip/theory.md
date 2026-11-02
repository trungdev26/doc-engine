# TCP/IP

TCP/IP là nền tảng giúp các máy tính giao tiếp với nhau qua mạng. Khi gọi API, mở website, kết nối database, gửi message queue, dùng Redis, gọi payment gateway hay upload file, phía dưới gần như luôn có TCP/IP hoặc họ hàng của nó tham gia.

Junior thường nhìn network như một thứ "có mạng thì chạy, mất mạng thì lỗi". Middle/Senior cần nhìn sâu hơn:

```text
Request chậm vì DNS, TCP handshake, TLS, server xử lý, database, packet loss hay retry?
Timeout đặt ở đâu?
Connection có được tái sử dụng không?
Load balancer có đóng idle connection không?
Retry có làm hệ thống quá tải hơn không?
```

Network không chỉ là kiến thức hạ tầng. Nó ảnh hưởng trực tiếp đến thiết kế API, performance, reliability, security và cách debug production.

---

## 1. TCP/IP là gì?

TCP/IP là bộ giao thức dùng để truyền dữ liệu qua mạng. Tên gọi đến từ hai giao thức rất quan trọng:

| Giao thức | Vai trò chính |
|---|---|
| IP | Đưa packet từ máy nguồn đến máy đích qua địa chỉ IP |
| TCP | Tạo kết nối tin cậy, đảm bảo dữ liệu đến đúng thứ tự và không mất trong phạm vi có thể |

Khi một client gọi server:

```text
Client application
-> TCP
-> IP
-> Network interface
-> Internet/LAN
-> Server network interface
-> IP
-> TCP
-> Server application
```

Ứng dụng thường không tự xử lý packet IP hay segment TCP. Nó dùng socket, HTTP client, database driver hoặc SDK. Nhưng khi có lỗi latency, timeout, reset connection, DNS fail, TLS fail, hiểu TCP/IP giúp mình biết nên nhìn vào đâu.

---

## 2. Mô hình layer: đừng học thuộc, hãy dùng để debug

Mô hình TCP/IP thường được chia thành các lớp:

| Layer | Ví dụ | Câu hỏi debug |
|---|---|---|
| Application | HTTP, DNS, SMTP, Redis protocol | Request/response có đúng format không? |
| Transport | TCP, UDP | Có kết nối không, timeout không, packet loss không? |
| Internet | IP, ICMP | Có route đến máy đích không? |
| Link | Ethernet, Wi-Fi | Máy có kết nối mạng local không? |

Ví dụ gọi API lỗi:

```text
DNS resolve fail -> Application/DNS
Connection timeout -> Transport/Internet/routing/firewall
TLS handshake fail -> Application/security layer
HTTP 500 -> Application/server
HTTP 504 -> Gateway timeout, có thể server upstream chậm
Connection reset -> TCP connection bị đóng bất thường
```

Tư duy đúng không phải là nhớ đủ tên layer. Tư duy đúng là tách được lỗi:

```text
Không tìm được địa chỉ?
Không mở được kết nối?
Mở được nhưng bắt tay TLS lỗi?
Gửi được request nhưng server xử lý chậm?
Server trả lỗi ứng dụng?
```

---

## 3. IP address: định danh máy trong mạng

IP address là địa chỉ để gửi packet đến đúng máy hoặc đúng interface mạng.

Ví dụ IPv4:

```text
192.168.1.10
10.0.0.5
8.8.8.8
```

Ví dụ IPv6:

```text
2001:4860:4860::8888
```

Một số dải IP private thường gặp:

| Dải | Thường dùng |
|---|---|
| 10.0.0.0/8 | Mạng nội bộ công ty/cloud |
| 172.16.0.0/12 | Docker, Kubernetes, cloud VPC |
| 192.168.0.0/16 | Mạng gia đình/văn phòng nhỏ |

Private IP không đi trực tiếp ra Internet. Muốn ra ngoài thường cần NAT.

---

## 4. Port: một máy có nhiều dịch vụ

IP giúp tìm máy. Port giúp tìm đúng service trên máy đó.

Ví dụ:

```text
https://api.example.com:443
postgres://10.0.1.5:5432
redis://10.0.2.8:6379
```

Các port phổ biến:

| Port | Dịch vụ |
|---:|---|
| 80 | HTTP |
| 443 | HTTPS |
| 22 | SSH |
| 53 | DNS |
| 5432 | PostgreSQL |
| 3306 | MySQL |
| 1433 | SQL Server |
| 6379 | Redis |

Một TCP connection được nhận diện bởi 4 thông tin:

```text
Source IP + Source Port + Destination IP + Destination Port
```

Ví dụ:

```text
Client 192.168.1.20:52341 -> Server 10.0.1.10:443
```

Source port thường là ephemeral port do hệ điều hành cấp tạm thời cho client.

---

## 5. DNS: tên miền thành IP

Ứng dụng thường gọi domain, không gọi IP trực tiếp:

```text
api.example.com
```

DNS resolve domain thành IP:

```text
api.example.com -> 203.0.113.10
```

Flow đơn giản:

```text
App hỏi OS/cache
-> DNS resolver
-> root/TLD/authoritative DNS nếu cần
-> trả IP
-> app mở TCP connection tới IP đó
```

DNS có TTL, tức thời gian cache record.

Vấn đề production hay gặp:

- DNS record đổi nhưng client vẫn cache IP cũ.
- DNS resolver chậm làm request đầu tiên chậm.
- Một domain trả nhiều IP, client chọn IP đang lỗi.
- Container/Kubernetes DNS gặp sự cố làm service-to-service fail.
- TTL quá thấp làm tăng DNS query.
- TTL quá cao làm failover chậm.

Checklist khi nghi DNS:

```text
Domain resolve ra IP nào?
IP đó có đúng môi trường không?
TTL bao nhiêu?
Client/runtime có cache DNS riêng không?
Lỗi xảy ra trước khi connect hay sau khi connect?
```

---

## 6. Packet, MTU và fragmentation

Dữ liệu trên mạng được chia thành các packet/segment nhỏ.

MTU là kích thước packet tối đa trên một đường truyền. Ethernet thường là khoảng 1500 bytes. Nếu packet quá lớn, nó có thể bị chia nhỏ hoặc bị drop tùy cấu hình.

Vấn đề hay gặp:

```text
Payload nhỏ chạy được.
Payload lớn hoặc upload file thì treo/chậm/lỗi.
```

Nguyên nhân có thể là MTU mismatch, VPN, tunnel, firewall hoặc path không hỗ trợ packet size như kỳ vọng.

Middle/Senior không cần debug MTU mỗi ngày, nhưng nên biết có loại lỗi này để không quy hết về application.

---

## 7. TCP giải quyết vấn đề gì?

IP chỉ cố gắng đưa packet đến đích. Nó không đảm bảo:

- Packet có đến không.
- Packet đến đúng thứ tự không.
- Packet có bị trùng không.
- Bên nhận có xử lý kịp không.

TCP thêm các tính chất:

| Tính chất | Ý nghĩa |
|---|---|
| Connection-oriented | Có kết nối logic giữa client và server |
| Reliable | Mất segment thì retransmit |
| Ordered | Dữ liệu được giao cho app đúng thứ tự |
| Flow control | Bên gửi không làm ngập bên nhận |
| Congestion control | Giảm tốc khi mạng có dấu hiệu nghẽn |

Đổi lại TCP có overhead: handshake, state, memory, retransmission, congestion window.

---

## 8. TCP three-way handshake

Trước khi gửi dữ liệu, TCP mở kết nối bằng three-way handshake:

```text
Client -> Server: SYN
Server -> Client: SYN-ACK
Client -> Server: ACK
```

Sau đó application mới gửi dữ liệu.

Chi phí tối thiểu là một round-trip trước khi gửi request. Nếu thêm TLS, thường cần thêm handshake nữa.

Ý nghĩa với performance:

```text
Tạo connection mới cho mỗi request rất tốn.
Tái sử dụng connection giúp giảm latency đáng kể.
```

Đó là lý do HTTP keep-alive, connection pool, database pool và gRPC channel quan trọng.

---

## 9. TCP close: FIN, RST và TIME_WAIT

Kết nối TCP có thể đóng bình thường hoặc bất thường.

Đóng bình thường thường dùng FIN:

```text
Bên A: Tôi gửi xong rồi.
Bên B: Tôi nhận rồi.
Bên B: Tôi cũng gửi xong rồi.
Bên A: Tôi nhận rồi.
```

Đóng bất thường thường thấy là RST:

```text
Connection reset by peer
```

Nghĩa là phía bên kia hoặc thiết bị trung gian đóng kết nối đột ngột.

TIME_WAIT là trạng thái giữ lại sau khi đóng để đảm bảo packet cũ không làm nhiễu connection mới. Nếu hệ thống tạo quá nhiều connection ngắn, có thể thấy nhiều TIME_WAIT.

Vấn đề hay gặp:

- Không dùng connection pooling.
- Mở connection mới liên tục.
- Load balancer đóng idle connection.
- Client tái sử dụng connection đã bị server đóng.
- Firewall/NAT drop connection im lặng.

---

## 10. TCP không phải message protocol

TCP là byte stream, không phải message queue.

Nghĩa là nếu app gửi:

```text
Hello
World
```

Bên nhận có thể đọc thành:

```text
Hel
loWor
ld
```

Hoặc đọc một lần ra:

```text
HelloWorld
```

Vì vậy protocol phía trên TCP phải tự xác định ranh giới message:

- HTTP dùng header/body.
- Redis protocol có format riêng.
- gRPC dùng HTTP/2 framing.
- Database wire protocol có frame riêng.

Sai lầm khi tự viết socket:

```text
Giả định mỗi lần read() tương ứng đúng một message.
```

Đây là bug kinh điển.

---

## 11. UDP khác TCP thế nào?

UDP nhẹ hơn TCP. Nó không có connection, không đảm bảo thứ tự, không tự retransmit.

| Tiêu chí | TCP | UDP |
|---|---|---|
| Tin cậy | Có | Không mặc định |
| Thứ tự | Có | Không |
| Handshake | Có | Không |
| Latency | Cao hơn | Thấp hơn |
| Use case | HTTP/1.1, HTTP/2, database, SSH | DNS, VoIP, game, QUIC/HTTP/3 |

UDP không có nghĩa là "không tin cậy mãi mãi". Protocol phía trên có thể tự thêm reliability. QUIC là ví dụ: chạy trên UDP nhưng cung cấp connection, encryption và stream multiplexing.

---

## 12. HTTP nằm ở đâu trong TCP/IP?

HTTP là application protocol. HTTP/1.1 và HTTP/2 thường chạy trên TCP. HTTPS là HTTP qua TLS qua TCP.

Flow HTTPS cơ bản:

```text
DNS resolve
-> TCP handshake
-> TLS handshake
-> HTTP request
-> HTTP response
```

Khi request chậm, cần tách thời gian:

```text
DNS time
TCP connect time
TLS handshake time
Time to first byte
Download time
Application processing time
```

Một biểu đồ APM tốt nên giúp thấy các phần này, hoặc ít nhất phân biệt được network latency và server processing.

---

## 13. TLS/HTTPS: bảo mật trên đường truyền

TLS cung cấp:

- Encryption: người giữa đường không đọc được nội dung.
- Integrity: dữ liệu không bị sửa lén mà không bị phát hiện.
- Authentication: client biết mình đang nói chuyện với server đúng thông qua certificate.

TLS handshake cần kiểm tra certificate:

```text
Domain có khớp certificate không?
Certificate còn hạn không?
Certificate chain có tin cậy không?
Client/server có cùng hỗ trợ protocol/cipher không?
```

Lỗi hay gặp:

- Certificate expired.
- Gọi bằng IP nhưng cert cấp cho domain.
- Missing intermediate certificate.
- Client runtime quá cũ không hỗ trợ TLS version/cipher mới.
- Corporate proxy chèn certificate riêng.

Senior cần coi certificate expiry là rủi ro vận hành, không phải chuyện "đến hạn rồi sửa".

---

## 14. Latency, bandwidth và throughput

Ba khái niệm dễ bị trộn:

| Khái niệm | Ý nghĩa |
|---|---|
| Latency | Mất bao lâu để dữ liệu đi từ A đến B |
| Bandwidth | Đường truyền có thể chở tối đa bao nhiêu dữ liệu mỗi giây |
| Throughput | Thực tế đang truyền được bao nhiêu dữ liệu mỗi giây |

Ví dụ:

```text
Đường truyền rộng nhưng server ở xa vẫn latency cao.
Bandwidth lớn không làm mỗi request nhỏ nhanh hơn nếu bị chi phối bởi round-trip.
```

API gọi nhiều lần tuần tự rất nhạy với latency:

```text
10 request tuần tự x 80ms network = ít nhất 800ms chỉ chờ mạng
```

Tối ưu:

- Gộp request hợp lý.
- Chạy song song khi độc lập.
- Dùng cache.
- Đưa service gần nhau hơn về network.
- Tái sử dụng connection.
- Tránh chatty API.

---

## 15. Timeout: thiết kế không thể thiếu

Timeout là giới hạn thời gian chờ trước khi coi operation thất bại.

Các timeout thường gặp:

| Timeout | Ý nghĩa |
|---|---|
| DNS timeout | Chờ resolve domain |
| Connect timeout | Chờ mở TCP connection |
| TLS handshake timeout | Chờ bắt tay TLS |
| Request/read timeout | Chờ server trả dữ liệu |
| Idle timeout | Kết nối rảnh quá lâu bị đóng |
| Overall deadline | Tổng thời gian tối đa cho cả operation |

Sai lầm hay gặp:

```text
Không set timeout, request treo rất lâu.
Set một timeout chung quá dài.
Client timeout dài hơn gateway timeout nên user vẫn fail.
Retry nhiều lần làm tổng thời gian vượt SLA.
```

Tư duy tốt:

```text
Mỗi external dependency phải có timeout rõ.
Timeout phải nhỏ hơn SLA của caller.
Retry budget phải nằm trong overall deadline.
```

Ví dụ:

```text
User request SLA: 2s
Payment API timeout: 800ms
Retry tối đa 1 lần nếu lỗi transient
Tổng deadline vẫn không vượt 2s
```

---

## 16. Retry: không phải cứ lỗi mạng là gọi lại

Network có lỗi transient, retry là cần thiết. Nhưng retry sai có thể làm hệ thống sập nhanh hơn.

Chỉ nên retry khi:

- Lỗi có khả năng transient.
- Operation idempotent hoặc có idempotency key.
- Có giới hạn số lần retry.
- Có backoff/jitter.
- Có overall timeout.

Không nên retry mù:

```text
POST tạo payment bị timeout -> retry không có idempotency key -> có thể charge 2 lần
```

Backoff giúp tránh nhiều client retry cùng lúc:

```text
Lần 1: chờ 100ms
Lần 2: chờ 300ms
Lần 3: chờ 800ms
Thêm jitter ngẫu nhiên để tránh cùng nhịp
```

Middle/Senior cần review retry cùng với idempotency, timeout và circuit breaker, không review từng thứ riêng lẻ.

---

## 17. Connection pooling và keep-alive

Tạo connection mới tốn:

```text
TCP handshake
TLS handshake nếu HTTPS
Authentication/setup protocol nếu database
Kernel resource
```

Connection pool giữ sẵn connection để tái sử dụng.

Use case:

- HTTP client gọi API ngoài.
- Database connection.
- Redis connection.
- Message broker connection.

Lỗi hay gặp:

- Tạo HTTP client mới liên tục làm cạn port/socket.
- Database pool quá nhỏ làm request chờ.
- Pool quá lớn làm database bị quá tải.
- Idle connection bị load balancer đóng, client không biết và dùng lại connection chết.
- Không có timeout khi lấy connection từ pool.

Checklist:

```text
Pool size bao nhiêu?
Peak concurrent request bao nhiêu?
Dependency chịu được bao nhiêu connection?
Idle timeout của client, server, load balancer có khớp không?
Connection có health check hoặc retry connect lại không?
```

---

## 18. Head-of-line blocking

Head-of-line blocking xảy ra khi một việc chậm ở đầu hàng làm các việc phía sau bị kẹt.

Trong HTTP/1.1, nếu dùng ít connection và request tuần tự, một response chậm có thể làm các request sau chờ.

HTTP/2 multiplex nhiều stream trên một TCP connection, giảm head-of-line ở tầng HTTP, nhưng vẫn có thể bị ảnh hưởng ở tầng TCP: mất packet có thể làm stream khác chờ vì TCP phải giao byte đúng thứ tự.

HTTP/3/QUIC giảm vấn đề này bằng cách dùng UDP và stream độc lập hơn.

Điều cần nhớ:

```text
Protocol và connection strategy ảnh hưởng trực tiếp đến latency khi hệ thống có nhiều request đồng thời.
```

---

## 19. Load balancer, reverse proxy và gateway

Trong production, client hiếm khi nói chuyện trực tiếp với app server.

Flow thường gặp:

```text
Client
-> CDN/WAF
-> Load balancer
-> Reverse proxy/API gateway
-> App server
-> Internal service/database
```

Mỗi lớp có thể có:

- Timeout riêng.
- Header limit riêng.
- Body size limit riêng.
- TLS config riêng.
- Connection idle timeout riêng.
- Retry riêng.

Lỗi thường gặp:

| Hiện tượng | Có thể do |
|---|---|
| 413 Payload Too Large | Body limit ở proxy/gateway |
| 502 Bad Gateway | Upstream đóng/lỗi protocol |
| 503 Service Unavailable | Không có upstream healthy hoặc quá tải |
| 504 Gateway Timeout | Upstream xử lý quá lâu |
| Request bị cắt sau 60s | Timeout mặc định của proxy/load balancer |

Khi debug, phải biết request đi qua những hop nào.

---

## 20. NAT và ephemeral port exhaustion

NAT cho phép nhiều máy private IP dùng chung một public IP để ra Internet.

Mỗi outbound TCP connection cần một source port. Nếu một máy hoặc NAT gateway mở quá nhiều connection ngắn đến cùng destination, có thể cạn ephemeral port.

Dấu hiệu:

- Lỗi connect ngẫu nhiên khi tải cao.
- Nhiều connection TIME_WAIT.
- Tạo HTTP client/connection mới liên tục.
- Retry làm số connection tăng đột biến.

Hướng xử lý:

- Dùng connection pooling.
- Giảm tạo connection mới.
- Tăng NAT gateway capacity hoặc phân tán source IP nếu cần.
- Điều chỉnh timeout/retry.
- Kiểm tra dependency có keep-alive tốt không.

---

## 21. Packet loss và retransmission

TCP sẽ retransmit segment bị mất. Điều này giúp dữ liệu không mất, nhưng làm latency tăng.

Dấu hiệu:

```text
Không lỗi rõ ràng, nhưng request thỉnh thoảng rất chậm.
P95/P99 latency xấu hơn nhiều so với average.
```

Nguyên nhân có thể là:

- Wi-Fi/VPN kém.
- Network congestion.
- Cross-region traffic.
- Firewall/proxy gây reset/drop.
- Cloud zone/region issue.

App log thường chỉ thấy request chậm. Muốn xác nhận packet loss cần metric/tracing/network tool phù hợp.

---

## 22. Congestion control và backpressure

TCP có congestion control để giảm tốc khi mạng nghẽn. Nhưng application cũng cần backpressure.

Nếu downstream chậm mà upstream vẫn bắn request không giới hạn:

```text
Queue phình
Memory tăng
Timeout tăng
Retry tăng
Hệ thống càng quá tải
```

Backpressure ở application có thể là:

- Giới hạn concurrency.
- Queue có capacity.
- Rate limiting.
- Circuit breaker.
- Bulkhead theo dependency.
- Trả lỗi sớm khi quá tải.

Network reliability không chỉ là TCP tự retransmit. Nó còn là thiết kế để hệ thống không tự khuếch đại lỗi.

---

## 23. Observability cho network

Log "request timeout" là chưa đủ.

Nên có:

- Duration theo dependency.
- Timeout type nếu phân biệt được: connect/read/overall.
- HTTP status code và upstream host.
- Retry count.
- Connection pool metrics.
- DNS error count.
- TLS/certificate error.
- P95/P99 latency.
- Gateway/load balancer metrics.
- Trace id đi qua các service.

Ví dụ log tốt hơn:

```text
PaymentApi timeout
operation=CreateCharge
timeoutType=ReadTimeout
durationMs=800
retryCount=1
idempotencyKey=...
upstreamHost=payment.example.com
traceId=...
```

Log như vậy giúp phân biệt "server payment xử lý chậm" với "không connect được".

---

## 24. Công cụ debug cơ bản

Một số công cụ hữu ích:

| Công cụ | Dùng để |
|---|---|
| ping | Kiểm tra reachability cơ bản bằng ICMP |
| traceroute/tracert | Xem đường đi qua các hop |
| nslookup/dig | Kiểm tra DNS |
| curl | Test HTTP, header, TLS, timing |
| telnet/nc | Test mở TCP port |
| netstat/ss | Xem socket/connection local |
| tcpdump/Wireshark | Bắt packet khi cần phân tích sâu |

Lưu ý:

```text
Ping fail không luôn nghĩa là service fail.
Nhiều server/firewall chặn ICMP nhưng TCP/HTTPS vẫn chạy.
```

Test đúng hơn cho API là dùng `curl` tới đúng URL, đúng method, đúng header và xem timing.

---

## 25. Checklist debug request chậm

Khi một request chậm, hỏi theo thứ tự:

1. Chậm ở client, gateway, app server hay downstream?
2. DNS resolve có chậm/lỗi không?
3. TCP connect time có cao không?
4. TLS handshake có lỗi/chậm không?
5. Server app bắt đầu xử lý lúc nào?
6. App chờ database/API ngoài bao lâu?
7. Có retry ngầm không?
8. Response body có quá lớn không?
9. Có packet loss/retransmission không?
10. P95/P99 xấu hay tất cả request đều xấu?

Nếu chỉ nhìn tổng duration, rất dễ tối ưu nhầm chỗ.

---

## 26. Checklist review network cho Middle/Senior

Khi review một integration gọi service ngoài:

- Có timeout rõ cho connect/read/overall không?
- Timeout có phù hợp SLA không?
- Có retry không, retry có idempotent không?
- Có backoff/jitter không?
- Có circuit breaker hoặc giới hạn concurrency không?
- HTTP/database client có dùng pooling không?
- Pool size có phù hợp tải và capacity downstream không?
- Có log dependency latency, status, retry count không?
- Có trace id/correlation id không?
- Có xử lý DNS/TLS/certificate error rõ không?
- Có tránh gọi nhiều request tuần tự không cần thiết không?
- Có fallback/cache/degraded mode nếu dependency lỗi không?
- Có bảo vệ secret/token trên đường truyền bằng TLS không?

Review tốt không dừng ở câu:

```text
Gọi API có try/catch rồi.
```

Review tốt phải hỏi:

```text
Nếu dependency treo 30 giây thì thread/connection của mình ra sao?
Nếu 100 request cùng retry thì downstream có sập không?
Nếu client timeout nhưng server vẫn xử lý thành công thì retry có gây trùng nghiệp vụ không?
```

---

## 27. Các lỗi production hay gặp

### 27.1. Không set timeout

Request treo lâu, thread/connection bị giữ, queue tăng, hệ thống nghẽn dây chuyền.

### 27.2. Retry không kiểm soát

Dependency vừa chậm, toàn bộ client retry đồng loạt, tải tăng gấp nhiều lần.

### 27.3. Tạo connection mới liên tục

Không dùng pool/keep-alive, làm tăng handshake, TIME_WAIT, port exhaustion và CPU.

### 27.4. Idle timeout lệch nhau

Load balancer đóng connection sau 60s idle, client tưởng connection còn sống và tái sử dụng, dẫn đến lỗi reset ngẫu nhiên.

### 27.5. DNS cache sai kỳ vọng

Service đã failover sang IP mới nhưng client vẫn giữ IP cũ quá lâu.

### 27.6. Payload quá lớn

Gateway/proxy có body limit, timeout hoặc memory pressure. Cần upload streaming, chunking hoặc pre-signed URL.

### 27.7. Chatty API

Một màn hình gọi quá nhiều API tuần tự. Latency cộng dồn làm UX chậm dù mỗi API riêng lẻ không quá tệ.

---

## 28. Ví dụ thực tế: gọi payment API

Yêu cầu:

```text
Tạo giao dịch thanh toán qua payment provider.
Không được charge trùng nếu timeout.
User request SLA 3 giây.
```

Thiết kế tốt hơn:

```text
1. Sinh idempotency key theo payment attempt.
2. Gọi payment API qua HTTPS.
3. Set connect timeout ngắn, read timeout phù hợp.
4. Retry tối đa 1 lần cho lỗi transient.
5. Gửi idempotency key cho provider nếu họ hỗ trợ.
6. Log duration, status, retry count, provider request id.
7. Nếu timeout không rõ kết quả, chuyển payment sang trạng thái PendingVerification.
8. Dùng webhook/reconciliation để xác nhận kết quả cuối.
```

Điểm cần tránh:

```text
Timeout xong tạo payment attempt mới rồi gọi lại không có idempotency key.
```

Vì có thể provider đã charge thành công nhưng response bị mất trên đường về.

---

## 29. Ví dụ thực tế: service-to-service trong microservices

Service Order gọi Inventory để reserve tồn kho.

Rủi ro:

- Inventory chậm làm Order giữ request lâu.
- Retry reserve không idempotent làm giữ tồn hai lần.
- Network partition làm không biết reserve thành công hay chưa.
- Gateway timeout nhưng Inventory vẫn xử lý xong.

Thiết kế tốt hơn:

```text
ReserveInventory(commandId, orderId, items)
```

Inventory lưu `commandId` để idempotent:

```text
Nếu commandId đã xử lý -> trả kết quả cũ.
Nếu chưa -> xử lý reserve.
```

Order không giữ database transaction mở trong lúc gọi Inventory nếu đó là service/database khác. Với workflow dài, cân nhắc saga, outbox và event-driven design.

---

## 30. Tư duy Senior: network là một phần của thiết kế hệ thống

Senior không chỉ hỏi:

```text
API này trả gì?
```

Senior còn hỏi:

```text
API này timeout thế nào?
Retry thế nào?
Idempotency thế nào?
Connection pool thế nào?
Nếu dependency chậm thì hệ thống degrade ra sao?
Nếu packet mất hoặc connection reset thì user/business state ra sao?
Nếu gateway timeout nhưng downstream xử lý thành công thì reconcile thế nào?
```

TCP/IP là nền móng. Nhưng giá trị thực tế nằm ở cách áp dụng vào thiết kế:

- Giảm latency bằng keep-alive, pooling, giảm round-trip.
- Tăng reliability bằng timeout, retry có kiểm soát, circuit breaker.
- Bảo vệ nghiệp vụ bằng idempotency và reconciliation.
- Debug production bằng layer thinking và observability.
- Tối ưu vận hành bằng metric, log, trace và hiểu các hop mạng.

**Kết luận**: Nên có mục Network riêng. TCP/IP không thuộc riêng backend, frontend hay system design; nó là lớp nền đi xuyên qua tất cả. Một engineer Middle/Senior không cần thuộc từng bit trong TCP header, nhưng phải đủ hiểu để thiết kế timeout/retry/pooling đúng, đọc lỗi production có hướng, và không để network trở thành vùng mù của hệ thống.
