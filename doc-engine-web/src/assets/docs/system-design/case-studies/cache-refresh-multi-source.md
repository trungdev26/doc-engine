# Refresh cache từ DB và 3rd-party status

Case này mô phỏng một bài toán backend production: API cần hiển thị trạng thái mới nhất của thiết bị, đơn hàng, kết nối đối tác hoặc dịch vụ, nhưng trạng thái đó đến từ cả DB nội bộ và 3rd-party.

Mục tiêu không phải là "set Redis TTL bao nhiêu", mà là thiết kế được một flow đọc nhanh, không phụ thuộc trực tiếp vào external dependency, degrade được khi 3rd-party lỗi, và vẫn kiểm soát được consistency.

---

## 1. Input tính toán load parameter ban đầu

Trước khi chốt design, phải hỏi input tải. Nếu không có số liệu này, rất dễ thiết kế queue/worker/cache theo cảm giác.

```text
1. Có bao nhiêu entity cần refresh?
   Ví dụ: 1.000, 10.000, 1 triệu?

2. Refresh mỗi entity bao lâu một lần?
   30s, 1 phút, 5 phút, 1 giờ?

3. 3rd-party cho phép bao nhiêu request/phút?

4. API 3rd-party latency p95 bao nhiêu?
   200ms, 1s, 5s?

5. Timeout bao nhiêu?

6. Có batch API không?
   GetStatus(ids[]) thay vì từng id?

7. User có cần realtime không?

8. Có trạng thái terminal không?
   COMPLETED / CANCELLED thì không cần refresh nữa?

9. Trạng thái có được đi lùi không?
   COMPLETED có thể quay về PENDING không?

10. Khi 3rd-party lỗi, nghiệp vụ muốn hiển thị gì?
```

Ví dụ tính tải:

```text
10.000 orders cần refresh
mỗi order refresh mỗi 5 phút

10.000 / 5 = 2.000 request/phút
2.000 / 60 ≈ 33 request/giây
```

Nếu 3rd-party chỉ cho 300 request/phút, không thể refresh toàn bộ mỗi 5 phút. Phải đổi chiến lược:

- Chỉ refresh entity đang active.
- Terminal status thì ngừng refresh.
- Backoff theo tuổi entity.
- Dùng batch API.
- Giảm frequency.
- Ưu tiên entity quan trọng.
- Chia quota theo tenant để tenant lớn không chiếm hết worker.

---

## 2. Bối cảnh bài toán

Ví dụ màn hình danh sách thiết bị:

```text
Máy A: Online
Máy B: Offline
Máy C: Maintenance
```

Hoặc màn hình đơn hàng gửi đối tác:

```text
Order 001: Pending
Order 002: Success
Order 003: Failed
```

Dữ liệu đến từ 2 nguồn:

```text
DB nội bộ
- master data
- cấu hình
- mapping giữa entity nội bộ và 3rd-party
- snapshot trạng thái cuối

3rd-party
- trạng thái mới nhất
- có thể chậm
- có thể lỗi
- có rate limit
- có thể không trả dữ liệu đồng bộ ngay
```

Mục tiêu:

```text
API đọc nhanh
Không gọi 3rd-party trực tiếp trên mỗi request
Không làm DB quá tải
Cache đủ mới theo SLA nghiệp vụ
Khi 3rd-party lỗi thì hệ thống vẫn degrade được
```

---

## 3. Naive solution và vấn đề

Cách dễ viết lúc đầu:

```csharp
public async Task<DeviceStatusDto> GetStatus(long deviceId)
{
    var device = await db.Devices.FindAsync(deviceId);
    var thirdPartyStatus = await thirdPartyClient.GetStatus(device.ExternalCode);

    return new DeviceStatusDto
    {
        DeviceId = device.Id,
        Name = device.Name,
        Status = thirdPartyStatus.Status
    };
}
```

Vấn đề:

- 100 user refresh màn hình có thể tạo 100 request sang 3rd-party.
- Nếu list có 100 entity, 1 request có thể tạo 100 external calls.
- 3rd-party chậm thì API của mình chậm theo.
- 3rd-party lỗi thì màn hình lỗi theo.
- Cache miss hoặc traffic spike có thể đập thẳng vào đối tác.

Đây là coupling trực tiếp giữa **read API** và **external dependency**.

---

## 4. Design direction

Tách hệ thống thành 2 path:

```text
Read path:
Client -> API -> Redis -> DB snapshot -> response

Refresh path:
Scheduler / event -> Queue -> Worker -> 3rd-party -> DB snapshot -> Redis
```

Ý chính:

- API đọc không gọi 3rd-party trực tiếp theo mặc định.
- DB snapshot là fallback bền vững, không để Redis thành Source of Truth.
- Redis phục vụ đọc nhanh và có TTL/stale metadata.
- Worker refresh bất đồng bộ, có rate limit, retry, circuit breaker.
- Status quan trọng vẫn phải có rule consistency riêng, không chỉ tin cache.

Pattern này chính xác hơn nếu gọi là **cache over DB snapshot + async refresh**, không phải cache-aside thuần túy.

---

## 5. Data model: DB snapshot

Một bảng snapshot có thể có dạng:

```sql
CREATE TABLE third_party_status_snapshot (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT NOT NULL,
    external_code VARCHAR(100) NOT NULL,

    status VARCHAR(50) NOT NULL,
    raw_response JSON NULL,

    last_synced_at DATETIME NOT NULL,
    next_refresh_at DATETIME NULL,

    sync_status VARCHAR(30) NOT NULL,
    error_message TEXT NULL,
    retry_count INT NOT NULL DEFAULT 0,

    version BIGINT NOT NULL DEFAULT 0,

    UNIQUE KEY uk_status_entity (tenant_id, entity_type, entity_id)
);
```

Các field quan trọng:

- `status`: trạng thái nghiệp vụ hiện tại.
- `last_synced_at`: lần cuối đồng bộ thành công.
- `next_refresh_at`: lần tiếp theo nên refresh.
- `sync_status`: `SUCCESS`, `FAILED`, `REFRESHING`, `STALE`.
- `retry_count`: kiểm soát retry/backoff.
- `version`: chống update cũ ghi đè update mới.
- `raw_response`: hỗ trợ debug/audit, nhưng cần retention/masking nếu chứa dữ liệu nhạy cảm.

---

## 6. Cache value phải có metadata

Không nên cache kiểu:

```json
"ONLINE"
```

Nên cache cả trạng thái và metadata:

```json
{
  "entityId": 101,
  "status": "ONLINE",
  "lastSyncedAt": "2026-06-28T10:00:00+07:00",
  "softExpiredAt": "2026-06-28T10:05:00+07:00",
  "hardExpiredAt": "2026-06-28T10:30:00+07:00",
  "syncStatus": "SUCCESS",
  "isStale": false
}
```

Khi 3rd-party lỗi, API vẫn có thể trả last-known-good:

```json
{
  "entityId": 101,
  "status": "ONLINE",
  "lastSyncedAt": "2026-06-28T09:50:00+07:00",
  "syncStatus": "FAILED",
  "isStale": true,
  "message": "Dữ liệu đang hiển thị là trạng thái gần nhất hệ thống ghi nhận được."
}
```

Điểm quan trọng: cache không chỉ để nhanh, mà còn giúp hệ thống **degrade có kiểm soát**.

---

## 7. Read path: stale-while-revalidate

Luồng đọc:

```text
API đọc Redis
  |
  |-- cache fresh
  |      -> trả luôn
  |
  |-- cache stale nhưng chưa quá cũ
  |      -> trả stale response
  |      -> publish refresh message
  |
  |-- cache missing / quá cũ
         -> fallback DB snapshot
         -> publish refresh message
```

Pseudo code:

```csharp
public async Task<DeviceStatusDto> GetStatus(long tenantId, long deviceId)
{
    var cache = await redis.GetAsync<DeviceStatusCache>(CacheKey(tenantId, deviceId));
    var now = DateTimeOffset.Now;

    if (cache != null && cache.HardExpiredAt > now)
    {
        var isStale = cache.SoftExpiredAt <= now;

        if (isStale)
        {
            await publisher.Publish(new RefreshStatusMessage
            {
                TenantId = tenantId,
                EntityId = deviceId,
                RequestedAt = now
            });
        }

        return cache.ToDto(isStale);
    }

    var snapshot = await LoadSnapshotFromDb(tenantId, deviceId);

    await publisher.Publish(new RefreshStatusMessage
    {
        TenantId = tenantId,
        EntityId = deviceId,
        RequestedAt = now
    });

    return snapshot.ToDto(isStale: true);
}
```

Điểm hay:

- User không phải chờ 3rd-party.
- Cache miss không đập thẳng vào 3rd-party.
- Hệ thống vẫn tự làm mới phía sau.

---

## 8. Refresh path: queue thay vì job lớn

Không nên có một job lớn kiểu:

```text
RefreshAllDevices()
```

Với 10.000 entity, job này dễ chạy quá lâu, khó retry từng phần, khó scale và dễ làm tenant lớn chiếm hết tài nguyên.

Nên tách message nhỏ:

```csharp
public class RefreshStatusMessage
{
    public long TenantId { get; set; }
    public string EntityType { get; set; }
    public long EntityId { get; set; }
    public string ExternalCode { get; set; }
    public DateTimeOffset RequestedAt { get; set; }
}
```

Luồng:

```text
Scheduler
-> select entity where next_refresh_at <= now
-> publish RefreshStatusMessage

Worker
-> consume message
-> acquire distributed lock
-> rate limit
-> call 3rd-party
-> validate transition
-> update DB snapshot
-> update Redis
-> schedule next_refresh_at
```

Nếu 3rd-party hỗ trợ batch API, ưu tiên batch:

```text
1000 entity = 10 HTTP calls, mỗi call 100 codes
```

Thay vì:

```text
1000 entity = 1000 HTTP calls
```

---

## 9. Chống gọi trùng và chống ghi đè dữ liệu mới

Distributed lock giúp giảm gọi trùng:

```text
lock:refresh-status:{tenantId}:{entityType}:{entityId}
```

Pseudo:

```csharp
public async Task Handle(RefreshStatusMessage message)
{
    var lockKey = $"lock:refresh-status:{message.TenantId}:{message.EntityType}:{message.EntityId}";
    var acquired = await redis.TryAcquireLock(lockKey, TimeSpan.FromSeconds(30));

    if (!acquired)
        return;

    try
    {
        await RefreshOne(message);
    }
    finally
    {
        await redis.ReleaseLock(lockKey);
    }
}
```

Nhưng lock không đủ. Lock có thể hết hạn giữa chừng nếu 3rd-party chậm. DB update vẫn phải idempotent.

Ưu tiên dùng version/source timestamp từ 3rd-party nếu có:

```text
partnerUpdatedAt
partnerEventVersion
partnerSequence
```

Nếu 3rd-party không có version rõ ràng, dùng local version như best-effort:

```sql
UPDATE third_party_status_snapshot
SET status = @status,
    version = version + 1,
    last_synced_at = @syncedAt
WHERE id = @id
  AND version = @oldVersion;
```

Nếu affected rows = 0:

```text
Đã có worker khác update trước
-> bỏ qua hoặc đọc lại snapshot mới
```

Không nên tin tuyệt đối `requestedAt` như source ordering thật. Nó chỉ cho biết thời điểm hệ thống mình bắt đầu refresh, không chứng minh status từ 3rd-party mới hơn.

---

## 10. Rate limit, retry và circuit breaker

Queue không tự động làm hệ thống an toàn. Nếu worker consume quá nhanh:

```text
20 worker * 50 request/s
=> 1000 request/s sang 3rd-party
=> 429 / ban / timeout
```

Cần:

- Prefetch count hợp lý.
- Giới hạn số worker.
- Global rate limiter, không chỉ limit từng process.
- Retry với exponential backoff.
- Circuit breaker khi 3rd-party lỗi hàng loạt.
- DLQ sau số lần retry tối đa.

Ví dụ global rate limit:

```text
3rd-party cho phép 100 request/phút
=> toàn hệ thống chỉ được gọi khoảng 1.6 request/giây
```

Worker trước khi gọi API phải lấy token:

```text
rate-limit:thirdparty-x
```

Nếu không có token:

```text
delay / requeue / schedule lại
```

Failure path:

```text
3rd-party timeout/error
-> retry with backoff
-> after max retry:
   - update sync_status = FAILED
   - keep old status
   - cache stale response
   - send to DLQ nếu cần
```

Không nên xóa status cũ chỉ vì lần refresh mới bị lỗi.

---

## 11. Invalidation khi DB master data thay đổi

Ví dụ DB có mapping:

```text
DeviceId = 101
ExternalCode = ABC
```

User sửa:

```text
ExternalCode = XYZ
```

Nếu cache vẫn giữ status của `ABC`, dữ liệu sai.

Khi DB master data thay đổi:

```text
Update Device.ExternalCode
-> invalidate cache device-status:{tenantId}:{deviceId}
-> publish RefreshStatusMessage
```

Senior hơn là dùng Outbox Pattern:

```text
DB transaction:
- update device
- insert OutboxEvent DeviceExternalCodeChanged

Outbox worker:
- publish refresh message
- invalidate cache
```

Không chỉ refresh định kỳ. Phải xử lý cả cache invalidation theo event thay đổi dữ liệu nội bộ.

---

## 12. Source of truth và consistency

Phải phân biệt rõ:

```text
DB đúng về:
- master data
- tenant
- mapping
- cấu hình nghiệp vụ

3rd-party đúng về:
- live status
- trạng thái thanh toán/vận chuyển/ký số nếu đó là hệ thống gốc

Redis đúng về:
- bản đọc nhanh gần nhất
- không phải Source of Truth
```

Có 3 nơi chứa dữ liệu:

```text
3rd-party
DB snapshot
Redis cache
```

Không thể đảm bảo lúc nào cũng giống nhau tuyệt đối. Thường chấp nhận **eventual consistency**:

```text
3rd-party đổi trạng thái trước
-> worker refresh sau một khoảng delay
-> DB/cache mới cập nhật
```

Câu hỏi phải trả lời được:

```text
Delay tối đa chấp nhận là bao lâu?
```

Ví dụ:

- Màn hình theo dõi thông thường: delay 1-5 phút có thể chấp nhận.
- Thanh toán: delay vài giây hoặc cần verify realtime.
- Pháp lý/ký số: cần trạng thái chắc chắn trước khi cho bước tiếp.

---

## 13. Status transition và nghiệp vụ phát sinh

Câu hỏi cực quan trọng:

```text
Refresh status chỉ để hiển thị,
hay status transition có phát sinh nghiệp vụ?
```

Nếu chỉ hiển thị, rủi ro thấp hơn.

Nếu status mới kéo theo nghiệp vụ:

```text
PARTNER_COMPLETED -> mở khóa bước tiếp theo
PAYMENT_SUCCESS -> ghi nhận thanh toán
DELIVERY_FAILED -> tạo ticket xử lý
```

Thì refresh status phải được thiết kế như event processing.

Ví dụ:

```text
OldStatus = PENDING
NewStatus = COMPLETED
```

Transaction nên là:

```text
- validate transition
- update snapshot/order status
- insert outbox event PartnerOrderCompleted
```

Outbox worker mới publish event cho các consumer khác. Không nên trong cùng hàm refresh vừa gọi đối tác, vừa update DB, vừa gửi email, vừa tạo phiếu, vừa notify.

Transition phải có rule:

```text
PENDING -> ACCEPTED: hợp lệ
ACCEPTED -> COMPLETED: hợp lệ
COMPLETED -> PENDING: thường không hợp lệ
FAILED -> PENDING: tùy nghiệp vụ
```

---

## 14. Chiến lược refresh thông minh

Không phải entity nào cũng refresh giống nhau.

Ví dụ order:

```text
Mới tạo dưới 10 phút:
  refresh mỗi 30 giây

Từ 10 phút đến 1 giờ:
  refresh mỗi 2 phút

Từ 1 giờ đến 1 ngày:
  refresh mỗi 15 phút

Sau 1 ngày:
  refresh mỗi 1 giờ

Terminal status:
  không refresh nữa
```

Tư duy chính:

```text
Refresh frequency phụ thuộc vào xác suất trạng thái thay đổi và độ quan trọng của trạng thái đó.
```

---

## 15. Khi nào API được phép gọi thẳng 3rd-party?

Không phải lúc nào cũng cấm, nhưng phải rất hạn chế.

Có thể cân nhắc trong các case:

- Admin kiểm tra thủ công.
- Nghiệp vụ bắt buộc realtime.
- Cache quá cũ và dữ liệu cực kỳ quan trọng.

Với user-facing `Refresh now`, thường nên:

```text
User click refresh
-> API kiểm tra lần refresh gần nhất
-> nếu mới refresh gần đây: trả cache hiện tại
-> nếu đủ điều kiện: publish priority refresh message
-> trả "Đang cập nhật"
```

Chỉ gọi sync trực tiếp nếu có guard chặt:

- Rate limit theo user.
- Rate limit theo tenant.
- Distributed lock.
- Timeout ngắn.
- Fallback snapshot.
- Audit log.

---

## 16. Observability

Dashboard nên có:

```text
1. Cache hit/miss rate
2. Số lượng stale response
3. Refresh success/failed count
4. 3rd-party latency p50 / p95 / p99
5. 3rd-party error rate
6. 429 rate limit count
7. Queue length
8. Message age trong queue
9. Retry count
10. DLQ count
11. Số entity quá hạn refresh
```

Metric quan trọng nhất:

```text
refresh_lag = now - last_synced_at
```

Ví dụ SLA:

```text
95% entity được refresh trong vòng 5 phút
99% entity được refresh trong vòng 15 phút
```

Không chỉ đo worker chạy bao lâu. Phải đo độ trễ dữ liệu so với nguồn thật.

---

## 17. Những lỗi thiết kế hay gặp

1. **Cache miss thì gọi 3rd-party ngay**  
   Cache bị flush là có thể tạo stampede sang đối tác.

2. **Không lưu DB snapshot**  
   Redis mất là mất toàn bộ trạng thái và phải gọi lại 3rd-party hàng loạt.

3. **TTL quá ngắn**  
   Nghe realtime hơn nhưng làm cache expire liên tục, miss liên tục, refresh liên tục.

4. **Không phân biệt stale và failed**  
   `UNKNOWN` không đủ nghĩa. Cần `isStale`, `syncStatus`, `lastSyncedAt`.

5. **Retry không giới hạn**  
   Queue nghẽn, đối tác càng quá tải. Cần max retry, backoff, DLQ.

6. **Không có idempotency**  
   Một message consume 2 lần có thể update/publish event/gửi notification 2 lần.

7. **Không kiểm soát tenant fairness**  
   Tenant lớn có thể chiếm toàn bộ quota refresh.

8. **Không có transition rule**  
   Status đi lùi hoặc terminal status bị update sai có thể làm phát sinh nghiệp vụ sai.

---

## 18. Checklist review thiết kế

```text
[ ] Đã xác định Source of Truth cho main data, status, cache?
[ ] Read API có tránh gọi 3rd-party theo mặc định không?
[ ] Có DB snapshot làm fallback bền vững không?
[ ] Cache value có stale metadata không?
[ ] Cache miss có publish refresh async thay vì gọi 3rd-party ngay không?
[ ] Worker có rate limit, retry/backoff, circuit breaker không?
[ ] Có DLQ/manual replay không?
[ ] Có distributed lock nhưng vẫn đảm bảo idempotency ở DB không?
[ ] Có version/source timestamp để chống out-of-order update không?
[ ] DB master data đổi có invalidate cache và refresh lại không?
[ ] Status transition có rule rõ ràng không?
[ ] Status transition có phát sinh nghiệp vụ thì có Outbox/domain event không?
[ ] Có tính tải refresh theo số entity, frequency, rate limit không?
[ ] Có batch API strategy nếu 3rd-party hỗ trợ không?
[ ] Có tenant fairness không?
[ ] Có monitor refresh_lag, stale response, queue age, DLQ không?
```
