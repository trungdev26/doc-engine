# Architecture & Layering

Tài liệu này trả lời câu hỏi rất thực tế: **một đoạn code backend nên đặt ở đâu?**

Khi codebase nhỏ, đặt logic ở đâu cũng có vẻ chạy được. Khi codebase lớn lên, việc đặt sai lớp làm business rule bị duplicate, service method phình to, API khó đổi, query khó tối ưu và bug dữ liệu xuất hiện ở những chỗ rất khó đoán.

Mục tiêu của layering không phải làm code nhiều lớp hơn. Mục tiêu là làm cho mỗi lớp có trách nhiệm rõ, để khi requirement đổi, mình biết sửa ở đâu.

---

## 1. Một request backend nên đi qua những lớp nào?

Flow cơ bản:

```text
Client
-> Controller/API endpoint
-> Application service
-> Domain/entity/business service
-> Repository/query/database
-> DTO response
```

Không phải dự án nào cũng có đủ tên lớp giống nhau. Nhưng tư duy trách nhiệm thường giống nhau:

```text
API layer:
-> giao tiếp với client

Application layer:
-> điều phối use case

Domain/business layer:
-> giữ rule nghiệp vụ

Infrastructure/data layer:
-> đọc ghi dữ liệu, gọi external system
```

Nếu một method vừa làm tất cả các vai trên, nó rất dễ thành "god method".

---

## 2. Controller/API endpoint nên làm gì?

Controller nên mỏng.

Nó nên:

```text
- nhận request
- bind input
- gọi application service
- trả response đúng format
- xử lý HTTP concern nếu framework yêu cầu
```

Nó không nên:

```text
- chứa business rule
- query database trực tiếp
- mở transaction nghiệp vụ phức tạp
- map entity dài dòng
- xử lý workflow nhiều bước
```

Không tốt:

```text
Controller:
-> đọc order từ database
-> check status
-> trừ tồn kho
-> update order
-> gửi notification
-> trả response
```

Tốt hơn:

```text
Controller:
-> gọi orderAppService.ApproveAsync(input)
```

Controller càng mỏng, use case càng dễ test và dễ tái sử dụng.

---

## 3. Application service là nơi điều phối use case

Application service trả lời câu hỏi:

```text
Use case này gồm những bước nào?
```

Nó nên:

```text
- check authorization/permission ở mức use case
- validate input ở mức flow
- load dữ liệu cần thiết
- gọi domain method/business service
- quản lý transaction boundary
- gọi repository/query/external service theo thứ tự rõ ràng
- map kết quả sang DTO
```

Ví dụ flow tốt:

```text
ApproveOrderAsync(input)
-> check permission ApproveOrder
-> load order
-> order.Approve(currentUser, now)
-> save order
-> publish event hoặc enqueue job nếu cần
-> return result
```

Application service không nên ôm toàn bộ rule chi tiết. Nó nên đọc như một kịch bản use case.

---

## 4. Khi nào application service đang quá dày?

Dấu hiệu:

```text
[ ] Method dài quá khó đọc trong một màn hình
[ ] Có nhiều rule trạng thái nằm trực tiếp trong if/else
[ ] Có query report hoặc join phức tạp ngay trong use case ghi
[ ] Có nhiều mapping DTO lặp lại
[ ] Có nhiều private method kiểu ValidateA, ValidateB, ValidateC nhưng vẫn phụ thuộc chằng chịt
[ ] Thêm một rule nhỏ phải sửa nhiều method khác nhau
```

Không phải cứ dài là sai. Nhưng nếu method dài vì nó làm nhiều vai khác nhau, nên tách theo trách nhiệm.

Hướng tách:

```text
Rule gắn với entity:
-> đưa vào entity/domain method

Rule phối hợp nhiều entity:
-> đưa vào business/domain service

Query đọc dữ liệu phức tạp:
-> đưa vào query service/read repository

Mapping phức tạp:
-> đưa vào mapper rõ tên

Side effect:
-> đưa vào job/event/notification service tùy mức độ
```

---

## 5. Domain/entity nên giữ rule nào?

Entity không nên chỉ là túi dữ liệu nếu nghiệp vụ có trạng thái quan trọng.

Rule nên đặt gần entity khi:

```text
- rule phụ thuộc trực tiếp vào trạng thái entity
- mọi use case thay đổi entity đều phải tôn trọng rule đó
- nếu duplicate rule ở nhiều service sẽ dễ sai
```

Ví dụ:

```text
Order.Approve(userId, approvedAt)
```

Method này có thể chịu trách nhiệm:

```text
- kiểm tra order đang ở trạng thái Pending
- set Status = Approved
- set ApprovedBy
- set ApprovedAt
```

Như vậy, bất kỳ use case nào muốn approve đều phải đi qua một rule thống nhất.

Không nên để rule kiểu này rải rác:

```text
if (order.Status != Pending)
{
    throw ...
}
order.Status = Approved;
```

ở nhiều application service khác nhau.

---

## 6. Domain service/business service dùng khi nào?

Không phải rule nào cũng nhét vào entity.

Dùng domain/business service khi:

```text
- rule cần phối hợp nhiều entity
- rule cần đọc thêm dữ liệu khác
- rule là một khái niệm nghiệp vụ độc lập
- entity nếu ôm rule đó sẽ phụ thuộc quá nhiều service/repository
```

Ví dụ:

```text
InventoryReservationService.Reserve(order)
PatientDebtCalculator.Calculate(patientId, dateRange)
InvoicePaymentPolicy.ValidateCanPay(invoice, payment)
```

Tên service nên nói bằng nghiệp vụ. Nếu tên là `CommonService`, `HelperService`, `ManagerService`, thường là dấu hiệu chưa rõ boundary.

---

## 7. Repository nên làm gì?

Repository nên che chi tiết persistence và cung cấp cách đọc/ghi entity phù hợp.

Nó phù hợp cho:

```text
- get entity by id
- insert/update/delete entity
- query đơn giản theo aggregate/domain
- kiểm tra tồn tại/duplicate theo rule rõ ràng
```

Nó không nên thành nơi chứa mọi report/query của toàn hệ thống.

Nếu query phục vụ màn hình list/report phức tạp:

```text
- nhiều join
- projection riêng
- filter/sort/paging động
- tối ưu SQL/index riêng
```

thì nên cân nhắc tách thành query service/read model/report query. Như vậy command side không bị kéo theo logic đọc dữ liệu cồng kềnh.

---

## 8. DTO khác entity ở đâu?

Entity là model nội bộ. DTO là contract với client.

Entity có thể chứa:

```text
- field persistence
- navigation property
- internal status
- audit fields
- rule/trạng thái nội bộ
```

DTO nên chứa:

```text
- đúng dữ liệu client cần
- tên field rõ theo use case
- không lộ field nhạy cảm
- shape ổn định hơn database
```

Không tốt:

```text
return OrderEntity;
```

Tốt hơn:

```text
return OrderDetailDto;
return OrderListItemDto;
return ApproveOrderResultDto;
```

Một entity có thể có nhiều DTO theo nhu cầu khác nhau. Đừng ép một DTO khổng lồ dùng cho mọi API.

---

## 9. Input DTO nên thiết kế theo command

Input nên nói rõ intent.

Không tốt:

```text
UpdateOrderDto
{
    Id
    Status
    ApprovedBy
    ApprovedAt
    CancelReason
}
```

DTO này quá rộng. Client có thể gửi nhiều field không thuộc quyền của use case.

Tốt hơn:

```text
ApproveOrderInput
{
    OrderId
    Note
}

CancelOrderInput
{
    OrderId
    Reason
}
```

Input càng sát use case, application service càng dễ validate và bảo vệ dữ liệu.

---

## 10. Mapping nên đặt ở đâu?

Mapping đơn giản có thể để gần application service.

Nhưng nên tách mapper khi:

```text
- mapping dài
- mapping lặp lại
- mapping có format tiền/ngày/trạng thái
- mapping cần test
- mapping là contract quan trọng với frontend
```

Ví dụ:

```text
OrderDtoMapper.ToListItem(order)
OrderDtoMapper.ToDetail(order)
```

Không nên để template/frontend phải hiểu quá nhiều field nội bộ của backend. Backend nên trả về contract đủ rõ cho use case.

---

## 11. Query và command nên tách tư duy

Command là thao tác ghi:

```text
ApproveOrder
CancelInvoice
ReserveInventory
CreatePayment
```

Query là thao tác đọc:

```text
SearchOrders
GetOrderDetail
GetDebtReport
GetInventoryBalance
```

Command cần bảo vệ rule và transaction. Query cần đúng dữ liệu, paging, sort, performance.

Đừng ép query report phức tạp đi qua entity đầy đủ nếu chỉ cần projection. Nhưng cũng đừng dùng raw SQL cho mọi thứ nếu repository/query framework hiện tại đã đủ rõ.

Senior không chọn công cụ theo thói quen. Senior chọn theo mục đích đọc hay ghi.

---

## 12. Transaction boundary nằm ở application layer

Transaction thường thuộc use case, nên application layer là nơi hợp lý để xác định boundary.

Hỏi trước khi code:

```text
Những thay đổi nào phải cùng thành công hoặc cùng thất bại?
Có external call nào không nên nằm trong transaction không?
Có side effect nào cần chạy sau commit không?
Có query dài nào đang giữ lock không cần thiết không?
```

Ví dụ:

```text
ApproveOrder
-> update order status
-> update inventory reservation
-> insert audit/event record
```

Ba bước này có thể cần cùng một transaction.

Nhưng:

```text
-> gửi email
-> gọi payment gateway
-> gọi hệ thống bên ngoài
```

thường không nên giữ transaction database mở trong lúc chờ external system.

---

## 13. Layering sai thường trông như thế nào?

### 13.1. Controller quá thông minh

```text
Controller biết quá nhiều nghiệp vụ.
Hệ quả: khó test, khó reuse, API khác duplicate rule.
```

### 13.2. Application service thành god service

```text
Một service chứa mọi thứ từ query, validate, calculate, mapping, notification.
Hệ quả: sửa một rule dễ ảnh hưởng nhiều flow.
```

### 13.3. Repository thành bãi chứa query

```text
Repository nào cũng có hàng chục method report/list/export.
Hệ quả: persistence layer biết quá nhiều về UI/report.
```

### 13.4. DTO dùng chung quá mức

```text
Một DTO dùng cho create, update, detail, list, export.
Hệ quả: field thừa, validate khó, contract dễ vỡ.
```

### 13.5. Helper quá chung

```text
CommonHelper xử lý đủ loại business rule.
Hệ quả: không biết ownership, khó test theo nghiệp vụ.
```

---

## 14. Cách refactor một service đang quá lớn

Đừng rewrite ngay. Refactor theo từng lát nhỏ.

Bước 1: Đọc và đánh dấu vai trò

```text
- đoạn nào validate input?
- đoạn nào check permission?
- đoạn nào query?
- đoạn nào là business rule?
- đoạn nào map DTO?
- đoạn nào side effect?
```

Bước 2: Đặt tên use case

```text
Method này thật sự là ApproveOrder, CreateInvoice hay SyncPayment?
```

Bước 3: Tách rule có tên rõ

```text
ValidateCanApproveOrder
CalculateDebt
ReserveInventory
```

Bước 4: Tách query đọc phức tạp

```text
OrderSearchQuery
DebtReportQuery
InventoryBalanceQuery
```

Bước 5: Thêm test cho rule dễ vỡ nhất

Không cần phủ hết một lần. Bắt đầu từ rule có rủi ro dữ liệu cao nhất.

---

## 15. Checklist đặt code đúng lớp

```text
Controller/API:
[ ] Có mỏng không?
[ ] Có tránh business rule phức tạp không?

Application service:
[ ] Có đọc như một use case không?
[ ] Có check permission/transaction ở đúng chỗ không?
[ ] Có ôm quá nhiều query/mapping/rule không?

Domain/business:
[ ] Rule quan trọng có nằm gần dữ liệu/trạng thái không?
[ ] Có tránh duplicate rule ở nhiều service không?

Repository/query:
[ ] Query đọc và command ghi có tách tư duy không?
[ ] Query list/report có paging/filter/sort rõ không?

DTO:
[ ] Có tách entity khỏi contract không?
[ ] Input DTO có sát use case không?
[ ] Output DTO có đúng nhu cầu client không?
```

---

## 16. Tóm tắt

Layering tốt không phải là nhiều lớp. Layering tốt là:

```text
Controller mỏng.
Application service điều phối use case.
Domain/business giữ rule cốt lõi.
Repository/query đọc ghi dữ liệu đúng mục đích.
DTO là contract, không phải entity.
Transaction boundary rõ.
```

Khi không biết đặt code ở đâu, hãy hỏi:

```text
Đoạn code này thay đổi vì lý do gì?
Nó thuộc giao tiếp API, orchestration use case, business rule, data access hay contract?
```

Trả lời được hai câu đó, codebase sẽ bắt đầu có hình dạng ổn định hơn.
