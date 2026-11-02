# Cách đánh giá dữ liệu trong hệ thống: SQL, Cache hay cả hai?

Khi thiết kế hệ thống, không nên chọn giải pháp lưu trữ theo cảm giác ("dùng cache cho nhanh", "dùng SQL cho chắc", "tách bảng riêng cho dễ"). Cách đúng là hiểu **bản chất dữ liệu** và **mục đích sử dụng dữ liệu** trước khi quyết định nơi lưu.

---

## 1. Trước tiên phải hỏi: dữ liệu này là gì?

Một dữ liệu trong hệ thống thường rơi vào vài nhóm chính:

1. Dữ liệu nghiệp vụ chính
2. Dữ liệu lịch sử / sự kiện
3. Dữ liệu trạng thái hiện tại
4. Dữ liệu tạm thời
5. Dữ liệu thống kê / tổng hợp
6. Dữ liệu phục vụ tăng tốc

Ví dụ:

**Dữ liệu nghiệp vụ chính**: Khách hàng, Hóa đơn, Phiếu khám, Đơn hàng, Giao dịch kho

**Dữ liệu lịch sử / sự kiện**: Lịch sử đăng nhập, Lịch sử đổi quyền, Lịch sử thanh toán, Lịch sử duyệt / từ chối, Lịch sử thay đổi dữ liệu

**Dữ liệu trạng thái hiện tại**: User đang online, Đơn hàng đang xử lý, Session còn sống, Thiết bị đang kết nối

**Dữ liệu tạm thời**: OTP, Token tạm, Mã xác nhận, Dữ liệu import tạm

**Dữ liệu thống kê / tổng hợp**: Tổng doanh thu ngày, Số lượt truy cập, Số đơn theo trạng thái, Tồn kho tổng hợp

**Dữ liệu phục vụ tăng tốc**: Cache danh mục, Cache cấu hình, Cache kết quả tìm kiếm

---

## 2. Phân biệt State và Event

Đây là nền tảng quan trọng nhất.

```text
State = trạng thái hiện tại của hệ thống
Event = sự kiện đã xảy ra trong quá khứ
```

**State** trả lời câu hỏi: *"Hiện tại nó đang như thế nào?"*

- User đang online không?
- Đơn hàng đang ở trạng thái nào?
- Session còn hạn không?
- Thiết bị còn kết nối không?

**Event** trả lời câu hỏi: *"Đã từng xảy ra chuyện gì?"*

- Ai đã đăng nhập?
- Ai đã đổi quyền?
- Ai đã hủy đơn?
- Ai đã sửa giá?
- Ai đã duyệt phiếu?

Cách nhớ nhanh: **State = hiện tại, Event = lịch sử**.

---

## 3. Khi nào nên dùng SQL?

SQL phù hợp với dữ liệu cần lưu bền vững, có quan hệ, cần truy vấn lại, cần báo cáo hoặc cần audit.

Nên dùng SQL khi:

- Đây là dữ liệu nguồn của hệ thống
- Dữ liệu cần lưu lâu dài
- Mất dữ liệu là không chấp nhận được
- Cần truy vấn lại theo điều kiện
- Cần báo cáo
- Cần đối soát
- Cần audit / truy vết
- Dữ liệu có quan hệ với bảng khác

Ví dụ nên lưu SQL: Khách hàng, Nhân viên, Đơn hàng, Hóa đơn, Phiếu khám, Thanh toán, Tồn kho, Lịch sử thao tác, Lịch sử đăng nhập, Lịch sử đổi quyền.

SQL thường là nơi lưu **Source of Truth** — nguồn dữ liệu đúng nhất của hệ thống.

---

## 4. Khi nào nên dùng Cache?

Cache phù hợp với dữ liệu cần đọc nhanh, tạm thời, có thể hết hạn hoặc có thể tạo lại từ nguồn khác.

Nên dùng cache khi:

- Dữ liệu cần đọc rất nhanh
- Dữ liệu có thể tính lại
- Dữ liệu có TTL
- Dữ liệu không cần lưu lịch sử đầy đủ
- Dữ liệu mất tạm thời không làm sai nghiệp vụ nghiêm trọng
- Dữ liệu chỉ là bản sao để tăng tốc

Ví dụ nên dùng cache: Session, OTP, User online, Last active, Token blacklist, Rate limit, Số lần login sai trong vài phút, Cache danh mục ít thay đổi, Cache cấu hình hệ thống.

> Cache không nên là nguồn dữ liệu chính. Cache thường là lớp phụ để tăng tốc hoặc giữ trạng thái tạm thời.

Phần "khi nào dùng cache" chỉ là điểm khởi đầu. Khi đã quyết định dùng cache, cần học tiếp một topic riêng về **cache pattern, invalidation, concurrency, failure handling và refresh theo nhiều nguồn dữ liệu**.

---

## 5. Khi nào dùng cả SQL và Cache?

Nhiều bài toán thực tế không phải chọn một trong hai, mà là dùng cả hai: **SQL lưu dữ liệu chuẩn, bền vững. Cache tăng tốc hoặc phục vụ realtime.**

| Dữ liệu | SQL | Cache |
|---|---|---|
| Danh mục sản phẩm | Lưu dữ liệu gốc | Đọc nhanh |
| Cấu hình hệ thống | Lưu cấu hình gốc | Tránh query nhiều lần |
| Login user | Lưu lịch sử đăng nhập | Lưu session / online status |
| Tồn kho | Lưu giao dịch kho | Lưu số tồn hiện tại để đọc nhanh |
| Báo cáo | Lưu giao dịch chi tiết | Bảng tổng hợp / cache số liệu đã tính sẵn |

---

## 6. Câu hỏi quan trọng nhất: dữ liệu này có phải Source of Truth không?

**Source of Truth** = nguồn dữ liệu chính xác nhất, dùng để khôi phục, đối soát và làm căn cứ nghiệp vụ.

Nếu dữ liệu là Source of Truth → **không nên chỉ để trong cache, phải lưu DB bền vững**.

Ví dụ Source of Truth: Hóa đơn, Thanh toán, Đơn hàng, Phiếu khám, Giao dịch kho, Lịch sử duyệt, Lịch sử thay đổi quan trọng.

Ví dụ không phải Source of Truth: Cache danh mục, Session tạm, Online status, Kết quả query đã cache, Counter tạm trong vài phút.

---

## 7. Đánh giá theo câu hỏi nghiệp vụ

Muốn biết nên lưu ở đâu, hãy hỏi: *"Dữ liệu này dùng để trả lời câu hỏi gì?"*

| Câu hỏi | Nơi lưu |
|---|---|
| "Hiện tại user có online không?" | Cache |
| "User này đã từng đăng nhập lúc nào?" | SQL |
| "Cấu hình này hiện tại là gì?" | SQL là gốc, cache để đọc nhanh |
| "Trong 5 phút user login sai bao nhiêu lần?" | Cache |
| "Tháng trước có bao nhiêu lần login sai?" | SQL |
| "Hiện tại tồn kho sản phẩm A là bao nhiêu?" | Cache / bảng tổng hợp để đọc nhanh |
| "Tồn kho này hình thành từ những giao dịch nào?" | SQL lưu lịch sử giao dịch |

---

## 8. Đánh giá theo mức độ mất dữ liệu

Câu hỏi cực quan trọng: **nếu dữ liệu này mất thì có sao không?**

- Mất gây sai nghiệp vụ (hóa đơn, giao dịch thanh toán, lịch sử duyệt, giao dịch kho) → **phải lưu DB bền vững**
- Mất vẫn tạo lại được (cache danh mục → query lại DB, online status → user heartbeat lại, cache báo cáo → tính lại) → **có thể dùng cache**

---

## 9. Đánh giá theo tần suất đọc / ghi

```text
Đọc nhiều, ít thay đổi        → SQL + cache
Ghi nhiều, cần lưu lịch sử    → SQL table riêng / queue / batch insert
Ghi rất nhiều, chỉ cần realtime → Cache / stream / queue / bảng tổng hợp
Cần truy vấn lịch sử chi tiết → SQL / log storage / Elasticsearch
```

Ví dụ:

- Danh mục tỉnh/thành: ít thay đổi, đọc nhiều → cache hợp lý
- Log thao tác: ghi nhiều, cần lịch sử → bảng log riêng, có index, có archive
- Online user: cập nhật liên tục, không cần lịch sử đầy đủ → cache hợp lý

---

## 10. Đánh giá theo thời gian sống của dữ liệu

```text
Sống vài giây / vài phút        → Cache
Sống theo phiên làm việc        → Cache / session store
Sống nhiều ngày / tháng / năm   → SQL
Cần lưu theo quy định / đối soát → SQL, archive, backup
```

Ví dụ: OTP sống 2 phút → Cache; Session sống vài giờ → Cache/Redis; Hóa đơn sống nhiều năm → SQL; Log bảo mật cần lưu vài tháng/năm → SQL/log storage.

---

## 11. Đánh giá theo cách truy vấn

Nếu cần truy vấn linh hoạt (theo user, thời gian, trạng thái, chi nhánh, loại nghiệp vụ, IP, nhân viên...) → **SQL** phù hợp hơn.

Nếu chỉ cần lấy theo key đơn giản (`userId -> online status`, `token -> blacklist`, `phone -> OTP`, `configKey -> configValue`) → **Cache** phù hợp hơn.

Cách nhớ: **Query phức tạp, cần lọc/báo cáo → SQL. Key-value, đọc nhanh, TTL → Cache.**

---

## 12. Đánh giá theo nhu cầu báo cáo

Nếu dữ liệu cần lên báo cáo → **không nên chỉ lưu cache**, vì báo cáo thường cần lọc theo thời gian, tổng hợp, đối chiếu, xuất file, kiểm tra lịch sử.

- Báo cáo doanh thu → SQL
- Báo cáo lịch sử truy cập → SQL
- Báo cáo tồn kho → SQL / bảng tổng hợp
- Số user online hiện tại → Cache

---

## 13. Checklist chọn giải pháp

Khi gặp một yêu cầu mới, tự hỏi:

1. Dữ liệu này là State hay Event?
2. Đây có phải dữ liệu nghiệp vụ chính không?
3. Đây có phải Source of Truth không?
4. Dữ liệu có cần lưu lịch sử không?
5. Có cần báo cáo / audit / đối soát không?
6. Mất dữ liệu có chấp nhận được không?
7. Dữ liệu sống trong bao lâu?
8. Truy vấn theo key đơn giản hay lọc phức tạp?
9. Đọc nhiều hay ghi nhiều?
10. Có cần realtime không?
11. Có cần TTL không?
12. Có thể tính lại từ dữ liệu gốc không?

---

## 14. Công thức phán đoán nhanh

```text
Dữ liệu nghiệp vụ chính              → SQL
Dữ liệu lịch sử / audit / đối soát   → SQL
Dữ liệu tạm thời / có TTL            → Cache
Dữ liệu đọc nhiều, ít thay đổi       → SQL + Cache
Dữ liệu realtime, trạng thái hiện tại → Cache
Vừa cần realtime vừa cần lịch sử     → SQL + Cache
Ghi nhiều nhưng cần lưu lại          → SQL table riêng + index + archive
  (lớn hơn nữa thì thêm queue / log storage)
```

---

## 15. Ví dụ tổng hợp

| Dữ liệu | Giải pháp |
|---|---|
| Khách hàng | SQL |
| Hóa đơn | SQL |
| Thanh toán | SQL |
| Phiếu khám | SQL |
| Lịch sử đổi quyền | SQL |
| Log truy cập | SQL |
| OTP | Cache |
| Session | Cache |
| User online | Cache |
| Login fail trong 5 phút | Cache (đếm nhanh); SQL nếu cần lưu lịch sử |
| Danh mục thuốc | SQL là gốc, Cache để đọc nhanh |
| Cấu hình hệ thống | SQL là gốc, Cache để đọc nhanh |
| Tồn kho hiện tại | SQL / bảng tổng hợp là gốc, Cache nếu cần đọc cực nhanh |
| Báo cáo doanh thu | SQL giao dịch gốc + bảng tổng hợp nếu dữ liệu lớn + cache cho dashboard |

---

## 16. Sai lầm hay gặp

1. **Thấy cần nhanh là dùng cache** → Sai, cache không thay thế DB cho dữ liệu quan trọng.
2. **Thấy dữ liệu nhỏ thì nhét chung bảng** → Sai nếu dữ liệu có vòng đời, tần suất ghi, mục đích truy vấn khác nhau.
3. **Không phân biệt dữ liệu gốc và dữ liệu tính toán** → Dễ lưu sai nơi, khó đối soát.
4. **Lưu mọi thứ vào SQL mà không nghĩ tới tần suất ghi** → Có thể làm DB phình to, query chậm.
5. **Dùng cache cho dữ liệu cần audit** → Dễ mất lịch sử, không điều tra được khi có sự cố.

---

## 17. Tư duy chốt

Đừng bắt đầu bằng câu hỏi *"Dùng cache hay SQL?"*. Hãy bắt đầu bằng:

- Dữ liệu này là gì?
- Nó dùng để trả lời câu hỏi nào?
- Nó có phải dữ liệu gốc không?
- Mất nó có sao không?
- Nó cần sống bao lâu?
- Có cần truy vấn lịch sử không?

**Kết luận**: SQL dùng cho dữ liệu bền vững, dữ liệu gốc, lịch sử, báo cáo, audit. Cache dùng cho dữ liệu tạm thời, tăng tốc, realtime, có TTL, có thể tính lại. Hệ thống thực tế thường kết hợp: **SQL làm nguồn đúng, Cache làm lớp tăng tốc.**
