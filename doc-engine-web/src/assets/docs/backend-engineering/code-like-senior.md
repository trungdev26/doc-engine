# Mindset & Clean Code Backend

Tài liệu này xây nền tư duy để code backend rõ hơn, ổn định hơn và ít làm codebase trượt dần theo thời gian.

Một backend developer tiến lên middle/senior không chỉ vì viết được API phức tạp hơn. Điểm khác biệt lớn hơn là biết nhìn một feature như một use case có rủi ro dữ liệu, boundary, transaction, permission, test và vận hành production.

---

## 1. Senior backend nghĩ khác ở đâu?

Junior thường hỏi:

```text
API này nhận gì, trả gì, viết sao cho chạy?
```

Middle bắt đầu hỏi:

```text
Code này đặt ở đâu cho rõ?
Rule này có bị duplicate không?
Nếu lỗi thì trả về thế nào?
```

Senior sẽ hỏi thêm:

```text
Use case này có thể làm sai dữ liệu ở đâu?
Nếu request chạy lại, chạy song song, hoặc thất bại giữa chừng thì sao?
Nếu 3 tháng nữa thêm rule mới, sửa ở đâu?
Nếu production lỗi, log có đủ để điều tra không?
Team có maintain được code này không?
```

Điểm khác biệt nằm ở **cách nhìn rủi ro trước khi code**, không phải ở việc dùng nhiều kỹ thuật hơn.

---

## 2. Backend tốt là gì?

Backend tốt trong production thường có 6 đặc điểm:

```text
1. Đúng nghiệp vụ:
   Rule quan trọng được bảo vệ ở backend, không phụ thuộc UI.

2. Rõ trách nhiệm:
   Controller, application service, domain, repository, query không lẫn vai.

3. An toàn dữ liệu:
   Transaction, concurrency, validation, permission được nghĩ từ đầu.

4. Dễ thay đổi:
   Requirement đổi một rule, sửa đúng vùng liên quan.

5. Dễ quan sát:
   Lỗi production có log và context đủ để truy vết.

6. Dễ test:
   Logic quan trọng không bị chôn trong method quá dài hoặc static helper khó kiểm soát.
```

Code backend không chỉ cần đẹp. Nó cần **giữ dữ liệu đúng**.

---

## 3. Bắt đầu từ use case

Đừng bắt đầu bằng câu hỏi:

```text
Cần tạo table gì?
Cần viết endpoint gì?
```

Hãy bắt đầu bằng use case:

```text
Use case này là gì?
Ai được phép thực hiện?
Input hợp lệ là gì?
Business rule bắt buộc đúng là gì?
Dữ liệu nào cần đọc?
Dữ liệu nào cần ghi?
Có cần transaction không?
Nếu thất bại thì thất bại ở bước nào?
```

Ví dụ:

```text
Use case: Duyệt đơn hàng

Rule:
- Chỉ đơn ở trạng thái Pending mới được duyệt
- Người duyệt phải có quyền Approve
- Khi duyệt phải ghi ApprovedBy, ApprovedAt
- Nếu đơn đã hủy thì không được duyệt
- Nếu request được gửi lại lần hai thì không được tạo side effect sai
```

Khi nhìn theo use case, code sẽ tự có hướng: API chỉ là cổng vào, service là nơi điều phối, rule nằm ở nơi bảo vệ dữ liệu tốt nhất.

---

## 4. Clean code backend không phải là tách file thật nhiều

Một hiểu nhầm phổ biến:

```text
Nhiều layer hơn = clean hơn
Nhiều interface hơn = senior hơn
Nhiều helper hơn = reusable hơn
```

Không hẳn.

Clean code backend là code mà người khác đọc vào hiểu được:

```text
- request đi qua những bước nào
- rule nghiệp vụ nằm ở đâu
- dữ liệu được đọc/ghi ở đâu
- transaction bao quanh phần nào
- lỗi được xử lý thế nào
- test nên viết ở đâu
```

Tách file chỉ có ý nghĩa khi nó làm trách nhiệm rõ hơn. Nếu tách xong người đọc phải nhảy qua 8 file mới hiểu một use case đơn giản, đó chưa chắc là clean.

---

## 5. Dấu hiệu code backend đang yếu

Một service method bắt đầu nguy hiểm khi có nhiều dấu hiệu này:

```text
[ ] Method quá dài, vừa validate, query, map, tính toán, save, log
[ ] Business rule nằm rải rác ở nhiều API
[ ] Dùng entity làm DTO trả thẳng ra client
[ ] Query list không có paging hoặc sort ổn định
[ ] Hardcode message, status, magic number
[ ] Catch exception rồi trả success hoặc message chung chung
[ ] Update nhiều bảng nhưng transaction boundary không rõ
[ ] Permission chỉ check ở frontend
[ ] Không có test cho rule tiền, trạng thái, tồn kho, công nợ
[ ] Log thiếu id/entity/user nên production lỗi không lần được
```

Những vấn đề này ban đầu không làm app vỡ ngay. Nhưng càng thêm feature, chúng làm codebase khó đoán và khó sửa.

---

## 6. Nguyên tắc nền: mỗi lớp có một vai trò

Ở mức tư duy, hãy tạm chia backend thành các vai:

```text
Controller/API endpoint:
-> nhận request, trả response, không ôm business rule phức tạp

Application service:
-> điều phối use case, permission, transaction, gọi domain/query/repository

Domain/entity/business service:
-> giữ rule nghiệp vụ cốt lõi

Repository/query:
-> đọc/ghi dữ liệu, tối ưu theo mục đích command hoặc query

DTO/input/output:
-> contract với client, không phải entity persistence
```

Chủ đề **Architecture & Layering** sẽ đi sâu vào từng lớp này. Ở phần nền tảng, chỉ cần nhớ một câu:

```text
Code ổn định khi mỗi đoạn code có lý do tồn tại rõ ràng.
```

---

## 7. Naming phải đọc như nghiệp vụ

Tên tốt giúp code tự kể chuyện.

Không rõ:

```text
Handle()
Process()
UpdateStatus()
CheckData()
DoAction()
```

Rõ hơn:

```text
ApproveOrder()
CancelInvoice()
ReserveInventory()
CalculatePatientDebt()
ValidateCanApproveOrder()
```

Nếu không đặt được tên rõ, thường là vì method đang làm quá nhiều việc hoặc bản thân use case chưa rõ.

---

## 8. Abstraction: đừng tạo chỉ vì thấy giống nhau

Nên tách khi:

```text
- Có rule nghiệp vụ quan trọng cần test riêng
- Logic lặp lại ở nhiều nơi và có cùng lý do thay đổi
- Một khối code có thể đặt tên rõ bằng ngôn ngữ nghiệp vụ
- Tách ra làm call site dễ đọc hơn
```

Chưa nên tách khi:

```text
- Chỉ giống nhau về hình dạng code
- Requirement còn mơ hồ
- Tên tách ra kiểu Helper, Manager, Common quá chung
- Tách xong người đọc khó lần flow hơn
```

Senior không tạo abstraction để code trông kiến trúc hơn. Senior tạo abstraction khi nó giảm rủi ro thay đổi.

---

## 9. Test thứ đáng sợ

Không phải mọi dòng backend đều cần test. Nhưng những thứ sau rất nên có test:

```text
- Rule trạng thái: Pending -> Approved, Cancelled không được Approved
- Tính tiền, tồn kho, công nợ, hạn mức
- Permission ở use case nhạy cảm
- Validation ảnh hưởng dữ liệu
- Bug từng xảy ra
- Mapper phức tạp hoặc format contract quan trọng
```

Test ít giá trị:

```text
- Getter/setter trivial
- Test framework binding quá đơn giản
- Test implementation detail dễ đổi
```

Một câu hỏi hay:

```text
Nếu phần này sai, production có thiệt hại thật không?
```

Nếu có, nó xứng đáng được test hoặc ít nhất được bảo vệ bằng guard rõ ràng.

---

## 10. Checklist 5 phút trước khi merge

Trước khi merge một backend feature, tự hỏi:

```text
Use case:
[ ] API này đang phục vụ use case nào?
[ ] Edge case chính đã được xử lý chưa?
[ ] Permission nằm ở backend chưa?

Business:
[ ] Rule quan trọng có bị duplicate không?
[ ] Rule nằm ở chỗ đủ gần dữ liệu/trạng thái chưa?
[ ] Nếu thêm trạng thái mới, sửa ở đâu?

Data:
[ ] Transaction boundary có rõ không?
[ ] Có rủi ro gọi lặp hoặc race condition không?
[ ] Query list có paging/sort/filter hợp lý không?

Maintainability:
[ ] Method có đang làm quá nhiều việc không?
[ ] Tên class/method có đọc như nghiệp vụ không?
[ ] DTO có tách khỏi entity chưa?

Production:
[ ] Khi lỗi, log có đủ context không?
[ ] Có nuốt exception nguy hiểm không?
[ ] Có test cho rule đáng sợ nhất chưa?
```

---

## 11. Tóm tắt

```text
Junior hỏi: viết sao cho chạy?
Middle hỏi: viết sao cho rõ và ít bug?
Senior hỏi: viết sao cho dữ liệu đúng, team maintain được, production debug được?
```

Sau phần nền tảng, chủ đề quan trọng nhất để code backend bớt lộn xộn là:

```text
Architecture & Layering: đặt code ở đúng lớp.
```
