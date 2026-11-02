# Code review và refactor như Middle/Senior

Code review không chỉ là bắt format. Review tốt giúp bắt bug, giữ kiến trúc, giảm nợ maintain và làm team cùng nâng chuẩn.

Refactor tốt không phải đập đi viết lại. Thường là nhiều chỉnh sửa nhỏ, đúng lúc, làm code rõ hơn sau mỗi feature.

---

## 1. Thứ tự review

Review theo thứ tự này:

```text
1. Correctness:
   Có đúng nghiệp vụ không?

2. Edge cases:
   Empty/error/loading/permission/null handled chưa?

3. Data flow:
   Source of truth rõ không?

4. Boundary:
   Logic có nằm đúng chỗ không?

5. Maintainability:
   Requirement đổi thì sửa ở đâu?

6. Performance:
   Có API thừa, list nặng, template nặng không?

7. Style:
   Naming, format, consistency.
```

Đừng review style trước correctness. Code format đẹp nhưng sai nghiệp vụ vẫn là sai.

---

## 2. Câu hỏi review theo file

### Component

```text
[ ] Component smart hay presentational?
[ ] Input/output rõ chưa?
[ ] Có mutate input không?
[ ] Có gọi API trực tiếp không?
[ ] Template có logic nặng không?
[ ] Subscribe thủ công có cleanup không?
```

### Facade/service

```text
[ ] Side effect có tập trung không?
[ ] Query/state source of truth rõ không?
[ ] Error handling đặt đúng chỗ không?
[ ] API call có bị duplicate không?
[ ] Cache có invalidation không?
```

### API service

```text
[ ] Endpoint/params rõ không?
[ ] DTO type rõ không?
[ ] Có trộn UI concern vào API service không?
```

### Template

```text
[ ] Có function call nặng không?
[ ] Có object/array inline không?
[ ] List có trackBy không?
[ ] Loading/error/empty đủ không?
```

---

## 3. Comment review nên cụ thể

Không hữu ích:

```text
Code này xấu.
Tách ra đi.
Best practice là dùng facade.
```

Hữu ích hơn:

```text
Component này đang vừa đọc query params, gọi API, map DTO sang row VM và xử lý loading/error.
Nếu filter hoặc API contract đổi, file này sẽ phải sửa nhiều lý do khác nhau.
Nên tách phần query + load data sang OrderListFacade, component chỉ bind vm$ và emit action.
```

Review tốt nói rõ:

```text
Vấn đề là gì?
Rủi ro gì?
Đề xuất sửa thế nào?
Vì sao đáng sửa?
```

---

## 4. Refactor nhỏ nên làm thường xuyên

Các refactor nhỏ có ROI cao:

```text
- đổi tên biến/method rõ hơn
- tách mapper DTO -> VM
- đưa HTTP call ra API service
- gom loading/error/data thành LoadState
- thêm trackBy
- bỏ duplicate state
- thay nested subscribe bằng switchMap
- tách presentational component khi template lặp/nặng
```

Ví dụ trước:

```ts
this.api.getOrders().subscribe(data => {
  this.rows = data.items.map(x => ({
    ...x,
    text: x.status === 'DONE' ? 'Xong' : 'Chưa xong'
  }));
});
```

Sau:

```ts
orders$ = this.api.getOrders().pipe(
  map(result => result.items.map(toOrderRowVm))
);
```

```ts
function toOrderRowVm(order: OrderDto): OrderRowVm {
  return {
    id: order.id,
    code: order.code,
    statusText: order.status === 'DONE' ? 'Xong' : 'Chưa xong'
  };
}
```

---

## 5. Khi nào nên refactor lớn?

Refactor lớn đáng làm khi:

```text
- bug lặp lại vì cùng một cấu trúc sai
- feature mới liên tục bị chậm vì code cũ khó đổi
- nhiều component copy cùng flow
- source of truth không rõ gây lỗi dữ liệu
- performance không thể fix cục bộ
- team không còn tự tin sửa vùng code đó
```

Trước refactor lớn, cần:

```text
[ ] biết behavior hiện tại
[ ] có test hoặc checklist manual rõ
[ ] chia refactor thành bước nhỏ
[ ] tránh trộn refactor lớn với feature lớn nếu không cần
```

---

## 6. Refactor không đổi behavior

Một kỹ thuật an toàn:

```text
1. Viết/ghi lại behavior hiện tại.
2. Tách tên/mapper/service trước.
3. Giữ output như cũ.
4. Build/test.
5. Sau đó mới đổi behavior nếu cần.
```

Ví dụ:

```text
PR 1: tách mapper + facade, không đổi UI.
PR 2: thêm cache/invalidation.
PR 3: đổi UX loading/error.
```

PR nhỏ giúp review dễ và ít rủi ro hơn.

---

## 7. Checklist trước khi merge

```text
Correctness:
[ ] Đúng nghiệp vụ chính
[ ] Edge case quan trọng đã xử lý

Architecture:
[ ] Component không quá dày
[ ] Boundary rõ
[ ] Source of truth rõ
[ ] Shared code hợp lý

State:
[ ] Không duplicate derived state
[ ] Cache có invalidation
[ ] Mutation refresh đúng nơi

RxJS:
[ ] Không nested subscribe không cần thiết
[ ] switchMap/exhaustMap/concatMap chọn đúng semantics
[ ] Subscribe thủ công có cleanup

UI:
[ ] Loading/error/empty
[ ] Permission
[ ] Double submit
[ ] TrackBy/list performance

Testing:
[ ] Logic đáng sợ có test
[ ] Bug risk cao có test hoặc checklist verify
```

---

## 8. Cách luyện review để lên level

Sau mỗi feature, tự hỏi:

```text
Nếu requirement đổi, mình sửa ở đâu?
Nếu API lỗi, UI ra sao?
Nếu list lớn hơn 10 lần, có vấn đề gì?
Nếu người khác cần reuse component này, contract có rõ không?
Nếu phải test logic này, test ở đâu?
```

Làm đều, bạn sẽ dần có "cảm giác hệ thống" thay vì chỉ code theo kinh nghiệm rời rạc.
