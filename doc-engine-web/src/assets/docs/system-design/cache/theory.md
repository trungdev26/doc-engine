# Cache Strategy: pattern, invalidation và refresh dữ liệu

Cache là lớp tăng tốc cho hệ thống, nhưng cũng là nơi rất dễ tạo bug production: stale data, race condition, stampede, key phình to, hoặc vô tình biến cache thành Source of Truth.

Tài liệu này tập trung vào tư duy middle/senior khi thiết kế cache: không chỉ hỏi "có nên cache không", mà còn hỏi **cache đọc/ghi thế nào, invalidate ra sao, dữ liệu được phép cũ bao lâu, cache down thì hệ thống còn đúng không**.

---

## 1. Cache Patterns — các mô hình đọc/ghi cache phổ biến

Khi đã quyết định dùng cache, câu hỏi tiếp theo là: **đọc/ghi cache theo cách nào?** Đây là phần senior hay bị hỏi vì ảnh hưởng trực tiếp đến consistency, latency và rủi ro mất dữ liệu.

### 1.1 Cache-Aside (Lazy Loading)

```text
Đọc: App đọc cache → miss → query DB → set cache → trả kết quả
Ghi: App ghi DB → xoá (hoặc update) cache
```

- Phổ biến nhất, dễ implement, app chủ động quản lý cache.
- Nhược điểm: lần đầu đọc luôn miss (cold start), dễ stampede nếu nhiều request cùng miss.
- Ví dụ: cache danh mục sản phẩm, cache thông tin user theo id.

### 1.2 Read-Through

```text
App chỉ nói chuyện với cache layer.
Cache layer tự query DB khi miss, tự set lại cache.
```

- App không cần biết DB ở đâu khi đọc — cache provider lo việc load lại.
- Cần cache layer hỗ trợ (thư viện cache, hoặc tự build wrapper bao DB call).
- Khác Cache-Aside chủ yếu ở **chỗ chứa logic load lại**: trong app (Cache-Aside) hay trong cache layer (Read-Through).

### 1.3 Write-Through

```text
Ghi: App ghi vào cache → cache ghi đồng bộ xuống DB → xác nhận thành công
```

- Cache luôn đồng bộ với DB ngay sau khi ghi → đọc lại luôn đúng, không có khoảng trống stale.
- Tăng latency ghi vì phải chờ cả 2 bước hoàn tất.
- Phù hợp dữ liệu cần đọc ngay sau khi ghi và không chấp nhận stale (vd: cấu hình hệ thống).

### 1.4 Write-Behind (Write-Back)

```text
Ghi: App ghi vào cache → trả kết quả ngay → cache flush xuống DB sau (async, batch)
```

- Ghi rất nhanh, giảm tải DB (có thể batch nhiều write thành 1 lần ghi DB).
- Rủi ro: cache crash trước khi flush → mất dữ liệu chưa kịp xuống DB.
- Thường dùng cho counter, log, metrics — **không dùng cho dữ liệu Source of Truth** (giao dịch, thanh toán).

### 1.5 Write-Around

```text
Ghi: App ghi thẳng DB, KHÔNG cập nhật cache.
Đọc: lần đọc tiếp theo sẽ miss → load lại theo Cache-Aside.
```

- Tránh cache bị "rác" bởi dữ liệu vừa ghi nhưng ít khi đọc lại.
- Đánh đổi: lần đọc đầu sau khi ghi sẽ chậm hơn (miss).

### So sánh nhanh

| Pattern | Độ phức tạp | Latency ghi | Rủi ro mất data | Khi dùng |
|---|---|---|---|---|
| Cache-Aside | Thấp | Thấp (ghi DB như thường) | Thấp | Mặc định cho hầu hết trường hợp |
| Read-Through | Trung bình (cần cache layer hỗ trợ) | — | Thấp | Khi muốn tách logic load khỏi app |
| Write-Through | Trung bình | Cao | Thấp | Cần đọc ngay sau ghi, không chấp nhận stale |
| Write-Behind | Cao | Rất thấp | Cao nếu cache crash | Counter, log, dữ liệu không quan trọng tuyệt đối |
| Write-Around | Thấp | Thấp | Thấp | Dữ liệu ghi nhiều, đọc lại ít |

> Senior tip: 90% hệ thống chỉ cần **Cache-Aside cho đọc + invalidate cache khi ghi DB**. Đừng vội nhảy vào Write-Through/Write-Behind nếu chưa đo được vấn đề thật cần giải quyết.

---

## 2. Cache Invalidation — bài toán khó nhất của caching

> "There are only two hard things in Computer Science: cache invalidation and naming things."

Dữ liệu cache **đúng tại thời điểm set**, nhưng DB có thể thay đổi sau đó → cache trở thành stale. Có 4 hướng xử lý chính:

### 2.1 TTL-based (hết hạn theo thời gian)

- Đơn giản nhất: set TTL, hết hạn tự bay, không cần code invalidate riêng.
- Đánh đổi giữa **độ mới của dữ liệu** và **tần suất query DB**.
- TTL ngắn → dữ liệu mới hơn nhưng cache miss nhiều hơn (tải DB cao hơn).
- TTL dài → giảm tải DB nhưng dữ liệu có thể cũ trong suốt khoảng TTL đó.

### 2.2 Event-based (invalidate khi ghi)

```text
Update DB → xoá (hoặc update) cache key liên quan ngay lập tức
```

- Chính xác hơn TTL, nhưng phải invalidate **đúng và đủ** các key liên quan — dễ sót khi 1 entity được cache ở nhiều dạng (detail, list, count...).
- Senior cần thiết kế **cache key có cấu trúc** để biết invalidate cái gì khi 1 entity thay đổi (xem mục 4.3).

### 2.3 Versioning / Key theo version

```text
key = "product:{id}:v{version}"
```

- Khi data đổi, tăng version → key cũ tự "chết" (không ai đọc nữa), không cần xoá tay từng key.
- Cache cũ tự bị evict theo policy (LRU/TTL) mà không gây sai dữ liệu.
- Hữu ích khi invalidate theo event quá phức tạp (nhiều entity liên quan tới nhau).

### 2.4 Stale-While-Revalidate

```text
Đọc cache đã hết hạn → vẫn trả về (stale) ngay cho user
→ đồng thời trigger 1 request nền để refresh lại cache
```

- Ưu tiên latency: user luôn nhận response nhanh, dữ liệu "cũ một chút" vẫn chấp nhận được (vd: danh mục, tin tức).
- Không phù hợp với dữ liệu cần chính xác tuyệt đối (giá, tồn kho lúc thanh toán).

---

## 3. Cache Stampede & Race Condition — vấn đề concurrency khi cache miss

### 3.1 Cache Stampede / Thundering Herd

```text
Key hot expire → hàng nghìn request cùng lúc miss
→ hàng nghìn query cùng dồn xuống DB cùng thời điểm → DB sập
```

Giải pháp:

- **Locking / Mutex**: request đầu tiên miss sẽ "lock" key, đi query DB và set lại cache; các request khác trong lúc đó **chờ** hoặc **trả dữ liệu cũ (stale)** thay vì cùng query DB.
- **Jitter TTL**: thay vì TTL cố định (vd: tất cả key cùng hết hạn sau 60s), random TTL trong khoảng (vd: 50-70s) để các key không expire đồng loạt.
- **Early/Probabilistic refresh**: trước khi key thật sự hết hạn (vd: còn 10% TTL), một số request sẽ "âm thầm" refresh trước — tránh để key chết hẳn rồi mới refresh.

### 3.2 Race Condition giữa update DB và update cache

Thứ tự sai có thể khiến **dữ liệu cũ bị cache lại**:

```text
Sai:
1. Update DB
2. Xoá cache
   (giữa lúc đó, 1 request khác đọc miss → query DB cũ → set cache cũ)
```

Hướng xử lý phổ biến:

- **Xoá cache sau khi commit DB thành công**, không update cache trực tiếp — update trực tiếp dễ bị out-of-order khi có nhiều writer.
- **Double-delete**: xoá cache trước khi update DB, và xoá lại lần nữa sau khi update DB (delay nhỏ) để dọn các bản cache bị set nhầm trong khoảng race.
- Với dữ liệu cực nhạy (giá, tồn kho lúc đặt hàng) → **đừng tin cache ở bước quyết định cuối cùng** (checkout, trừ kho) — đọc thẳng DB hoặc dùng lock.

---

## 4. Eviction, Multi-level Cache & Cache Key Design

### 4.1 Eviction Policy — cache đầy thì bỏ gì?

| Policy | Bỏ key nào | Phù hợp |
|---|---|---|
| LRU (Least Recently Used) | Lâu nhất chưa được đọc | Phổ biến nhất, hợp lý cho đa số trường hợp |
| LFU (Least Frequently Used) | Ít được đọc nhất | Dữ liệu có "hot key" rõ rệt, truy cập lệch |
| FIFO | Vào trước ra trước | Hàng đợi, không quan tâm tần suất đọc |
| TTL-based | Hết hạn theo thời gian | Dữ liệu có vòng đời rõ (OTP, session) |

### 4.2 Multi-level Caching

```text
Browser/CDN cache → App in-memory (local) cache → Distributed cache (Redis) → DB
```

- **Local cache** (in-memory trong từng instance): nhanh nhất, nhưng không đồng bộ giữa nhiều instance (mỗi instance có bản riêng) → dễ gây inconsistency khi scale-out.
- **Distributed cache** (Redis/Memcached): đồng bộ giữa các instance, thêm 1 network hop nhưng vẫn nhanh hơn DB rất nhiều.
- Senior thường kết hợp cả hai: local cache TTL rất ngắn (vài giây, giảm tải lên Redis cho hot key) + Redis là tầng cache chính + DB là nguồn cuối.

### 4.3 Cache Key Design

- Đặt key có **namespace + entity + id + version**: `product:{id}:v{version}`, `report:revenue:{branchId}:{date}`.
- Tránh **cardinality explosion**: key sinh ra theo tổ hợp quá nhiều tham số (vd: cache theo từng filter combo của user) → cache phình to, hit ratio thấp.
- Khi 1 entity thay đổi, phải biết **danh sách pattern key nào cần invalidate** (detail, list, count, related entity) — nếu không thiết kế trước, rất dễ sót.

### 4.4 Cache Warm-up

- Sau deploy/restart, cache rỗng → traffic đầu tiên dồn hết xuống DB ("cold start spike").
- Với dữ liệu hot, ít thay đổi (danh mục, cấu hình) → **pre-load cache khi service start**, trước khi nhận traffic thật.

---

## 5. Cache Down thì sao? — Failure Handling

Senior luôn đặt câu hỏi: **"Nếu Redis chết ngay bây giờ, hệ thống còn chạy đúng không, chỉ chậm hơn hay sập luôn?"**

- Cache nên là **tầng tối ưu, không phải tầng bắt buộc**: code đọc cache miss/lỗi → fallback query DB, không throw lỗi cho user.
- Tránh **single point of failure**: nếu toàn bộ luồng nghiệp vụ chính (login, checkout, đặt hàng) bắt buộc phải có Redis mới chạy được → cache đã âm thầm trở thành một phần "Source of Truth" mà không ai chủ đích thiết kế vậy.
- Có circuit breaker / timeout ngắn cho cache: nếu Redis chậm/down, fail-fast và đi DB, đừng để request bị treo chờ cache.
- Monitor **cache hit ratio** — hit ratio giảm bất thường thường là dấu hiệu sớm của vấn đề (cache bị flush, key design sai, TTL sai).

---

## 6. Tư duy Senior khi thiết kế Cache

Junior hỏi: *"Cái này có nên cache không?"*

Senior hỏi thêm:

1. **Nếu cache sai/mất/down, hệ thống còn đúng không?** (chỉ chậm hơn = ổn; sai nghiệp vụ = thiết kế lại)
2. **Ai chịu trách nhiệm invalidate cache khi data đổi?** — có sót case nào không (update qua API khác, batch job, import...)?
3. **Pattern nào phù hợp** — Cache-Aside (đa số), hay cần Write-Through/Behind (có lý do rõ ràng)?
4. **TTL bao nhiêu là hợp lý** dựa trên mức độ "chấp nhận cũ" của dữ liệu (staleness budget)?
5. **Hot key nào có thể gây stampede** khi expire? Cần jitter/lock không?
6. **Cache key có bị cardinality explosion** không khi data/filter tăng?
7. **Local cache hay distributed cache** — và hệ quả khi scale ra nhiều instance?
8. **Có đang vô tình biến cache thành Source of Truth** không (dữ liệu chỉ tồn tại trong cache, mất là mất luôn)?

```text
Công thức nhớ:
Cache = optimization, có thể tắt được mà hệ thống vẫn ĐÚNG (chỉ CHẬM hơn).
Nếu tắt cache mà hệ thống SAI → đó không còn là cache, đó là Source of Truth giả danh cache.
```
