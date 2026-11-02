# Review code backend như Middle/Senior

Review code backend không chỉ là bắt format, đặt tên biến hay nhắc tách hàm. Review tốt giúp giữ dữ liệu đúng, giữ boundary rõ, giảm bug production và giúp fresher/junior hiểu vì sao một đoạn code cần được viết theo cách khác.

Mục tiêu của người review middle/senior là vừa bảo vệ chất lượng hệ thống, vừa định hướng người viết code trưởng thành hơn sau mỗi PR.

---

## 1. Review với tư duy coaching

Một review tốt không làm người nhận chỉ biết "sửa cho qua". Nó giúp người nhận học được cách tự nhìn code lần sau.

Khi review fresher/junior, nên comment theo cấu trúc:

```text
Vấn đề là gì?
Rủi ro nếu giữ nguyên là gì?
Nên sửa theo hướng nào?
Vì sao hướng đó tốt hơn?
```

Không nên:

```text
Code này sai.
Tách ra đi.
Viết vậy không senior.
Chỗ này bad practice.
```

Nên viết:

```text
Method này đang vừa validate input, vừa query database, vừa cập nhật trạng thái đơn hàng.
Nếu sau này thêm rule kiểm tra tồn kho hoặc quyền thao tác, method sẽ rất dễ phình to và khó test.
Em thử tách phần rule "có được hủy đơn không" thành một method/domain service riêng, rồi application service chỉ điều phối flow.
```

Người review senior không chỉ nói "không được". Họ chỉ ra đường đi để người khác sửa được.

---

## 2. Thứ tự review backend

Đừng review style trước correctness. Backend đẹp nhưng sai dữ liệu vẫn là sai.

```text
1. Correctness:
   Use case có đúng nghiệp vụ không?

2. Data integrity:
   Có rủi ro sai dữ liệu, mất dữ liệu, duplicate dữ liệu không?

3. Permission & security:
   Ai được phép gọi use case này?

4. Transaction & concurrency:
   Request chạy song song, retry, fail giữa chừng thì sao?

5. Boundary:
   Logic có nằm đúng layer không?

6. API contract:
   Input/output, error, status code, DTO có rõ không?

7. Performance:
   Query có N+1, load thừa, filter sai chỗ không?

8. Maintainability:
   Requirement đổi thì sửa ở đâu?

9. Testability:
   Logic quan trọng có thể test được không?

10. Style:
    Naming, format, consistency.
```

---

## 3. Checklist review theo layer

### Controller/API endpoint

```text
[ ] Controller có mỏng không?
[ ] Có nhét business rule vào endpoint không?
[ ] HTTP status/error response có nhất quán không?
[ ] Input binding và validation có rõ không?
[ ] Có expose field nhạy cảm ra response không?
```

Controller nên nhận request, gọi application service và trả response. Nếu controller bắt đầu chứa workflow nhiều bước, đó là dấu hiệu cần kéo logic xuống layer phù hợp hơn.

### Application service

```text
[ ] Method có đại diện cho một use case rõ ràng không?
[ ] Có điều phối transaction, permission, validation đúng chỗ không?
[ ] Có quá nhiều lý do để thay đổi không?
[ ] Có gọi repository/query theo cách gây duplicate logic không?
[ ] Error handling có để caller hiểu được lỗi không?
```

Application service được phép điều phối, nhưng không nên biến thành nơi chứa mọi rule nghiệp vụ.

### Domain/business logic

```text
[ ] Rule quan trọng có được bảo vệ ở backend không?
[ ] Rule có bị duplicate ở nhiều service không?
[ ] Entity/domain service có giữ invariant quan trọng không?
[ ] Có method nào cho phép tạo trạng thái không hợp lệ không?
[ ] Naming có nói đúng ngôn ngữ nghiệp vụ không?
```

Fresher/junior hay viết rule ở nơi "tiện nhất". Middle/senior review xem rule đó có sống đúng nơi để không bị bỏ sót ở flow khác hay không.

### Repository/query/database

```text
[ ] Query có filter đúng theo tenant, branch, owner, permission không?
[ ] Có N+1 query không?
[ ] Có load cả object graph khi chỉ cần vài field không?
[ ] Có pagination cho list lớn không?
[ ] Có index phù hợp với điều kiện lọc/sort quan trọng không?
[ ] Có dùng raw SQL/Dapper/ORM đúng với độ phức tạp của query không?
```

Với backend, performance thường chết ở query nhiều hơn là ở vòng lặp trong code.

### DTO/API contract

```text
[ ] Request DTO có validate required/range/format không?
[ ] Response DTO có trả vừa đủ dữ liệu không?
[ ] Có lộ entity trực tiếp ra API không?
[ ] Field name có rõ nghĩa với client không?
[ ] Breaking change có được cân nhắc không?
```

DTO là hợp đồng. Review DTO nghĩa là review cách backend nói chuyện với phần còn lại của hệ thống.

---

## 4. Những lỗi fresher/junior hay gặp

### 4.1. Code chạy được nhưng rule nằm sai chỗ

Ví dụ:

```text
UI đã disable nút nên backend không check quyền nữa.
```

Review nên hỏi:

```text
Nếu người dùng gọi API trực tiếp thì sao?
Nếu flow khác cũng dùng use case này thì rule có còn được bảo vệ không?
```

Rule quan trọng phải nằm ở backend. UI chỉ giúp trải nghiệm tốt hơn, không thay thế được bảo vệ nghiệp vụ.

### 4.2. Method làm quá nhiều việc

Dấu hiệu:

```text
- validate input
- đọc nhiều bảng
- map DTO
- check permission
- tính toán rule
- ghi database
- gửi notification
- build response
```

Review tốt không chỉ nói "tách hàm". Hãy chỉ ra tách theo trách nhiệm:

```text
- permission check
- domain rule
- query/read model
- command/update
- mapping response
```

### 4.3. Không nghĩ về transaction

Câu hỏi review:

```text
Nếu bước 1 thành công, bước 2 lỗi thì dữ liệu còn đúng không?
Nếu gửi notification lỗi thì có rollback dữ liệu không?
Nếu user bấm submit 2 lần thì có duplicate không?
```

Không phải mọi thứ đều cần transaction lớn. Nhưng mọi flow ghi dữ liệu quan trọng đều cần được nghĩ về tính nhất quán.

### 4.4. Query chạy đúng với data nhỏ

Data dev nhỏ thường che mất lỗi production.

Review nên nhìn:

```text
[ ] Có filter ở database hay filter in-memory?
[ ] Có Include/load thừa không?
[ ] Có query trong vòng lặp không?
[ ] Có sort/paging trước khi trả list không?
[ ] Có dùng Any/Exists thay vì load list chỉ để check tồn tại không?
```

### 4.5. Error handling mơ hồ

Không tốt:

```text
throw new Exception("Error");
return null;
```

Tốt hơn:

```text
- lỗi validation nói rõ field/rule nào sai
- lỗi permission khác lỗi dữ liệu không tồn tại
- lỗi external system có log context đủ để điều tra
- response không lộ thông tin nhạy cảm
```

---

## 5. Cách comment để junior sửa được

Một comment review nên đủ cụ thể để người nhận biết hành động tiếp theo.

Ví dụ chưa tốt:

```text
Đoạn này nên optimize.
```

Tốt hơn:

```text
Đoạn này đang gọi GetCustomer trong vòng lặp order nên số query tăng theo số dòng.
Với 100 order sẽ thành 101 query. Em thử lấy customerIds trước, query customers một lần, rồi map bằng dictionary.
```

Ví dụ chưa tốt:

```text
Sai layer.
```

Tốt hơn:

```text
Rule "chỉ đơn ở trạng thái Draft mới được xóa" đang nằm trong controller.
Rule này là nghiệp vụ và có thể được dùng bởi API khác, nên nên đưa vào application/domain service.
Controller chỉ nên gọi use case DeleteOrder.
```

Ví dụ chưa tốt:

```text
Thiếu test.
```

Tốt hơn:

```text
Flow này có rule tính tiền phạt theo ngày quá hạn, khá dễ sai edge case.
Nên có test cho 3 case: chưa quá hạn, quá hạn đúng 1 ngày, quá hạn nhiều ngày.
```

---

## 6. Review backend theo mức độ nghiêm trọng

Không phải comment nào cũng có cùng trọng lượng. Nên phân loại để người nhận biết ưu tiên.

```text
Must fix:
- sai nghiệp vụ
- sai dữ liệu
- thiếu permission/security
- transaction/concurrency có thể gây lỗi production
- API contract gây breaking change không kiểm soát

Should fix:
- boundary chưa tốt
- query có nguy cơ chậm khi data lớn
- error handling khó debug
- thiếu test cho logic rủi ro

Nice to have:
- naming có thể rõ hơn
- refactor nhỏ
- style chưa nhất quán nhưng không ảnh hưởng behavior
```

Với fresher/junior, phân loại này rất quan trọng. Nếu comment nào cũng nghe như lỗi nghiêm trọng, người nhận dễ bị ngợp và không học được cách ưu tiên.

---

## 7. Checklist trước khi approve PR backend

```text
Correctness:
[ ] Use case chính đúng nghiệp vụ
[ ] Edge case quan trọng đã xử lý
[ ] Không phụ thuộc UI để bảo vệ rule backend

Data:
[ ] Ghi dữ liệu có transaction phù hợp
[ ] Không tạo trạng thái dữ liệu không hợp lệ
[ ] Idempotency/double submit/retry đã được nghĩ tới nếu cần

Permission:
[ ] Có check quyền đúng use case
[ ] Query không lộ dữ liệu ngoài phạm vi người dùng
[ ] Không trả field nhạy cảm

Architecture:
[ ] Controller mỏng
[ ] Application service điều phối rõ
[ ] Rule nghiệp vụ không duplicate lung tung
[ ] Repository/query không chứa business rule khó kiểm soát

Performance:
[ ] Không N+1
[ ] Không load thừa dữ liệu lớn
[ ] Có paging/filter/sort hợp lý
[ ] Query quan trọng có thể dùng index

Testing:
[ ] Logic rủi ro có test hoặc checklist verify rõ
[ ] Bug fix có case chống regression
[ ] Manual test có nêu dữ liệu/case đã kiểm tra
```

---

## 8. Cách giúp fresher/junior lên level qua review

Sau mỗi PR, có thể gợi ý người viết tự review lại bằng các câu hỏi:

```text
Nếu API này bị gọi 2 lần liên tiếp thì sao?
Nếu request fail ở giữa flow thì dữ liệu còn đúng không?
Nếu user không có quyền gọi API này thì backend chặn ở đâu?
Nếu bảng có 1 triệu dòng thì query này còn ổn không?
Nếu requirement đổi một rule nhỏ, em sẽ sửa ở file nào?
Nếu bug production xảy ra, log hiện tại có đủ để truy ra không?
```

Khi junior trả lời được các câu này trước khi gửi PR, họ bắt đầu chuyển từ "code cho chạy" sang "code có trách nhiệm với hệ thống".

---

## 9. Kết luận

Review code backend như middle/senior là nhìn một PR dưới góc độ hệ thống:

```text
Code có đúng không?
Dữ liệu có an toàn không?
Rule có nằm đúng nơi không?
Production có chịu được không?
Người sau có maintain được không?
Người viết PR học được gì sau review này?
```

Review tốt không chỉ làm PR hiện tại sạch hơn. Nó làm chuẩn kỹ thuật của cả team tăng lên từng chút một.
