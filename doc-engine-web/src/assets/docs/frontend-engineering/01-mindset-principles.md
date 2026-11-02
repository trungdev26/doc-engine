# Mindset và nguyên tắc viết code FE

Mục tiêu của phần này là tạo một hệ quy chiếu trước khi nói về component, service, state hay pattern. Nếu thiếu hệ quy chiếu, mình rất dễ viết code theo cảm giác: hôm nay thích tách nhỏ, mai lại nhét hết vào component; hôm nay dùng facade, mai bỏ qua; gặp bug thì thêm flag.

Senior frontend không phải người luôn viết code phức tạp. Senior là người biết code đang mua lợi ích gì và trả giá gì.

---

## 1. Code frontend tốt mua lại điều gì?

Code tốt không chỉ là "chạy đúng hôm nay". Nó cần mua lại khả năng thay đổi.

```text
Đọc được:
Người khác hiểu luồng chính mà không cần debug từng dòng.

Đổi được:
Business đổi rule, chỉ sửa vùng liên quan.

Test được:
Logic quan trọng không bị chôn trong template/lifecycle.

Xóa được:
Feature bỏ đi thì xóa gọn, không vỡ shared/global state.

Vận hành được:
Loading/error/empty/permission/performance có tính đến.
```

Nếu một đoạn code chạy được nhưng mỗi lần sửa đều sợ, nó chưa thật sự tốt.

---

## 2. Viết code theo lý do thay đổi

Một khối code nên gom những thứ có cùng lý do thay đổi.

Ví dụ component list đơn hàng:

```text
- UI filter đổi vì designer đổi layout
- Query params đổi vì muốn share URL
- API DTO đổi vì backend đổi contract
- Permission đổi vì nghiệp vụ phân quyền mới
- Cache đổi vì performance
```

Nếu tất cả nằm trong một component, component có quá nhiều lý do thay đổi.

Tách tốt hơn:

```text
Component:
-> layout, binding, nhận event

Facade:
-> điều phối route/form/API/state

API service:
-> endpoint, request/response DTO

Mapper:
-> DTO sang ViewModel

Permission service:
-> check quyền
```

Không phải lúc nào cũng cần đủ lớp. Nhưng khi code bắt đầu có nhiều lý do thay đổi, đó là tín hiệu cần tách.

---

## 3. KISS không có nghĩa là nhét hết vào một file

Code đơn giản không đồng nghĩa với code ít file nhất.

Không tốt:

```ts
export class OrderListComponent {
  orders: any[] = [];
  loading = false;
  error = '';
  keyword = '';
  page = 1;

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      this.keyword = params.get('keyword') ?? '';
      this.page = Number(params.get('page') ?? 1);
      this.loading = true;

      this.http.get<any>('/api/orders').subscribe({
        next: result => {
          this.orders = result.items.map((x: any) => ({
            ...x,
            statusText: x.status === 'DONE' ? 'Hoàn tất' : 'Đang xử lý'
          }));
          this.loading = false;
        },
        error: () => {
          this.error = 'Không tải được dữ liệu';
          this.loading = false;
        }
      });
    });
  }
}
```

Nhìn thì "ít file", nhưng không đơn giản. Nó trộn route, HTTP, mapper, loading, error, UI state.

Đơn giản hơn về mặt maintain:

```ts
export class OrderListComponent {
  vm$ = this.facade.vm$;

  constructor(public facade: OrderListFacade) {}
}
```

Số file tăng, nhưng mỗi file có vai trò rõ hơn.

---

## 4. DRY không phải gom mọi đoạn giống nhau

Hai đoạn code giống nhau về hình dạng nhưng khác lý do thay đổi thì chưa chắc nên gom.

Ví dụ chưa nên gom:

```text
Button "Lưu" ở màn hình đơn hàng
Button "Lưu" ở màn hình cấu hình
```

Chúng giống UI nhưng có thể khác nghiệp vụ, permission, loading, audit.

Ví dụ nên gom:

```text
Money input ở 5 form khác nhau:
- format dấu phẩy
- parse number
- validate min/max
- dùng formControlName
```

Ở đây cùng lý do thay đổi: format/parse tiền. Nên cân nhắc component CVA chung.

Rule:

```text
Trùng code + cùng lý do thay đổi       -> cân nhắc abstraction
Trùng code + khác lý do thay đổi       -> chấp nhận duplicate tạm thời
```

---

## 5. YAGNI: chưa cần thì đừng xây lâu đài

Over-engineering rất hay xảy ra khi mình muốn code "senior".

Không nên:

```text
- tạo global store cho modal local
- tạo generic table engine khi mới có 1 table
- tạo base class cho 2 component chưa ổn định requirement
- tạo helper chung tên mơ hồ để né suy nghĩ domain
```

Nên:

```text
- code rõ trước
- thấy pattern lặp lại có cùng lý do thay đổi
- tách ra bằng tên domain cụ thể
- giữ call site dễ đọc hơn sau khi tách
```

Câu hỏi trước khi abstraction:

```text
Abstraction này làm code dễ đọc hơn không?
Nó che đi chi tiết không cần biết hay che luôn nghiệp vụ quan trọng?
Nếu requirement đổi, abstraction này giúp hay cản?
Tên của nó có rõ không?
```

---

## 6. Source of truth phải rõ

Một state quan trọng nên có một nơi quyết định.

Sai phổ biến:

```text
URL có keyword
Form có keyword
Service có keyword
Component cũng có keyword
```

Nếu cả 4 nơi đều có quyền quyết định API query, sớm muộn sẽ lệch.

Tốt hơn:

```text
URL là source of truth cho list query.
Form chỉ hiển thị và sửa URL.
API load theo URL.
```

Hoặc:

```text
Form là source of truth cho draft chưa submit.
Submit mới gọi API.
Rời form thì draft mất, trừ khi có autosave.
```

Trước khi code state, hỏi:

```text
State này ai sở hữu?
Nó sống bao lâu?
Refresh có cần giữ không?
Share link có cần giữ không?
```

---

## 7. Side effect phải có chỗ ở

Side effect là những việc tác động ra ngoài pure calculation:

```text
- gọi API
- navigate router
- mở modal/toast
- ghi localStorage
- dispatch action
- update global state
```

Nếu side effect rải khắp component, flow rất khó đoán.

Pattern dễ maintain:

```text
Component:
-> nhận event user

Facade/use-case service:
-> side effect chính

API service:
-> HTTP

State/store:
-> cập nhật state
```

Ví dụ:

```ts
approve(orderId: string): void {
  this.facade.approve(orderId);
}
```

```ts
approve(orderId: string): void {
  this.api.approve(orderId).pipe(
    tap(() => this.message.success('Đã duyệt')),
    tap(() => this.refresh()),
    catchError(() => {
      this.message.error('Duyệt thất bại');
      return EMPTY;
    })
  ).subscribe();
}
```

Component không cần biết approve xong refresh cache nào.

---

## 8. Checklist tư duy trước khi code

Trước khi code một feature vừa/vừa lớn, viết nhanh 5 dòng:

```text
1. Feature này có route và URL state gì?
2. Dữ liệu chính lấy từ API nào?
3. State nào local, state nào share, state nào ở URL?
4. Component page/facade/API service chia vai trò ra sao?
5. Loading/error/empty/permission xử lý ở đâu?
```

Viết 5 dòng này giúp code bớt "lúc này lúc kia".

---

## 9. Dấu hiệu mình đang code theo cảm giác

```text
[ ] Không biết source of truth là gì
[ ] Gặp bug thì thêm boolean flag
[ ] Component gọi nhiều API không cùng một workflow
[ ] Mapper/format nằm rải trong template
[ ] Shared folder có nhiều thứ chỉ dùng một nơi
[ ] Subscribe lồng nhau
[ ] Loading/error mỗi method tự xử lý một kiểu
[ ] Không biết test logic ở đâu
```

Khi thấy các dấu hiệu này, không cần tự trách. Chỉ cần dừng lại và đưa code về các câu hỏi nền: ownership, source of truth, side effect, boundary.
