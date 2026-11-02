# Reference, mutation và immutability

Rất nhiều bug UI không đến từ framework mà đến từ việc nhiều nơi đang giữ cùng một reference. Chương này bắt đầu từ mô hình biến và vùng nhớ, sau đó đi đến copy, ownership, structural sharing và cách Angular nhận biết thay đổi.

```text
Binding giữ một giá trị
→ với object, giá trị đó là reference
→ nhiều binding có thể giữ cùng reference
→ mutation được quan sát qua mọi alias
→ immutable update tạo identity mới có chủ đích
```

---

## 1. Binding, value và object

Trong:

```ts
const quantity = 2;
const order = { id: 1, quantity: 2 };
```

`quantity` và `order` là binding. Binding lưu một JavaScript value:

```text
quantity → number value 2
order    → reference value ──→ object trong heap
```

Nói “object được truyền bằng reference” dễ gây hiểu sai. Cách chính xác hơn:

> JavaScript luôn truyền value. Với object, value được truyền là một reference tới object.

---

## 2. Primitive và object reference

```ts
let first = 10;
let second = first;
second = 20;

console.log(first); // 10
```

Primitive được gán bằng giá trị. Với object, biến giữ một reference:

```ts
const original = { status: 'draft' };
const alias = original;

alias.status = 'done';

console.log(original.status); // done
```

Không phải `alias` “copy object rồi đồng bộ ngược”. Hai biến đang trỏ đến cùng một object.

---

## 3. Truyền object vào function

```ts
function rename(user: { name: string }): void {
  user.name = 'Bình';
}

const currentUser = { name: 'An' };
rename(currentUser);

console.log(currentUser.name); // Bình
```

Parameter `user` nhận một bản sao của reference. Cả `user` và `currentUser` trỏ tới cùng object.

Nhưng gán lại parameter không đổi binding bên ngoài:

```ts
function replace(user: { name: string }): void {
  user = { name: 'Chi' };
}

const currentUser = { name: 'An' };
replace(currentUser);

console.log(currentUser.name); // An
```

Mô hình:

```text
Trước khi gán lại:
currentUser ─┐
             ├→ object A
user ────────┘

Sau khi gán lại parameter:
currentUser ──→ object A
user ─────────→ object B
```

---

## 4. Identity và equality

```ts
{ id: 1 } === { id: 1 }; // false

const item = { id: 1 };
item === item; // true
```

Điều này ảnh hưởng trực tiếp đến:

- Angular `OnPush`;
- Signals equality;
- RxJS `distinctUntilChanged`;
- memoization;
- `Map` và `Set`;
- cache key.

Nếu cần so sánh theo nghiệp vụ, hãy chỉ rõ key:

```ts
const sameOrder = (a: Order, b: Order): boolean => a.id === b.id;
```

Đừng deep-equal toàn bộ object ở mọi nơi nếu business identity đã rõ.

---

## 5. Aliasing và ownership

Aliasing xuất hiện khi nhiều nơi giữ reference đến cùng mutable object:

```ts
const state = {
  selectedOrder: order,
};

const dialogData = order;
const cacheEntry = order;
```

Một mutation ở dialog có thể âm thầm đổi state và cache. Trước khi mutate, cần trả lời:

```text
Ai sở hữu object?
Những consumer nào đang giữ cùng reference?
Consumer có được phép thay đổi nó không?
Thay đổi cần được quan sát bằng cơ chế nào?
```

Boundary rõ thường dùng một trong ba contract:

```text
Read-only input: consumer chỉ đọc.
Mutable owner: đúng một nơi được quyền mutate.
Immutable value: thay đổi trả object mới.
```

TypeScript `Readonly<T>` hỗ trợ contract compile-time:

```ts
function displayOrder(order: Readonly<Order>): string {
  return `${order.code} - ${order.total}`;
}
```

Nó không tự đóng băng object ở runtime và mặc định cũng chỉ readonly theo mức type được khai báo.

---

## 6. Spread chỉ shallow copy

```ts
const order = {
  id: 1,
  customer: {
    name: 'An',
  },
};

const copied = { ...order };
copied.customer.name = 'Bình';

console.log(order.customer.name); // Bình
```

Object ngoài là mới, nhưng `customer` vẫn dùng chung reference.

Update bất biến cho nhánh thay đổi:

```ts
const updated = {
  ...order,
  customer: {
    ...order.customer,
    name: 'Bình',
  },
};
```

Không cần copy mọi nhánh. Chỉ tạo reference mới trên đường từ root đến giá trị thay đổi.

---

## 7. Vẽ reference graph khi copy

```ts
const copy = {
  ...order,
  customer: {
    ...order.customer,
    name: 'Bình',
  },
};
```

Giả sử `order` còn có `lines`, graph sau update là:

```text
order ──→ object A
          ├── customer → object C
          └── lines ───→ array L

copy ───→ object B
          ├── customer → object D
          └── lines ───→ array L
```

Root và customer có identity mới; `lines` vẫn được chia sẻ vì không thay đổi. Đây là **structural sharing**.

Structural sharing tránh deep clone toàn bộ graph, đồng thời tạo identity mới đúng trên đường thay đổi để hệ thống reactive nhận biết.

---

## 8. Array mutation

Các method mutate array:

```text
push, pop, shift, unshift, splice, sort, reverse, fill
```

Các cách thường tạo array mới:

```text
map, filter, slice, concat, spread, toSorted, toReversed, toSpliced
```

Ví dụ:

```ts
const sorted = [...orders].sort(compareByCreatedAt);
```

Hoặc với runtime hỗ trợ:

```ts
const sorted = orders.toSorted(compareByCreatedAt);
```

Đừng gọi `sort()` trực tiếp trên array lấy từ input/store nếu bạn không sở hữu việc mutation.

---

## 9. `Object.freeze` và giới hạn

```ts
const config = Object.freeze({
  apiUrl: '/api',
  retry: {
    count: 3,
  },
});
```

`Object.freeze` là shallow:

```ts
config.apiUrl = '/other'; // bị chặn
config.retry.count = 5;   // nested object chưa bị freeze
```

Deep freeze có thể hữu ích trong development/test để phát hiện mutation, nhưng có chi phí và không thay thế thiết kế ownership.

---

## 10. Immutability không có nghĩa “không bao giờ mutate”

Mutation local, có ownership rõ thường hoàn toàn ổn:

```ts
function groupByStatus(orders: Order[]): Map<string, Order[]> {
  const result = new Map<string, Order[]>();

  for (const order of orders) {
    const group = result.get(order.status) ?? [];
    group.push(order);
    result.set(order.status, group);
  }

  return result;
}
```

`result` được tạo và chỉ mutate bên trong function; chưa có consumer khác quan sát nó.

Rủi ro nằm ở **shared mutable state**:

```ts
function markDone(order: Order): void {
  order.status = 'done';
}
```

Caller không biết object đầu vào sẽ bị sửa. Contract an toàn hơn:

```ts
function markDone(order: Order): Order {
  return { ...order, status: 'done' };
}
```

---

## 11. Pure function và side effect

```ts
function calculateTotal(lines: ReadonlyArray<OrderLine>): number {
  return lines.reduce(
    (total, line) => total + line.price * line.quantity,
    0
  );
}
```

Với cùng input, pure function trả cùng output và không thay đổi state bên ngoài. Lợi ích:

- test đơn giản;
- dễ memoize khi cần;
- ít hidden dependency;
- refactor an toàn hơn.

Không phải mọi function đều pure. HTTP, logging, storage và DOM là side effect. Mục tiêu là đặt side effect ở boundary rõ, không giả vờ toàn bộ ứng dụng không có mutation.

---

## 12. Deep clone: chọn theo dữ liệu

`JSON.parse(JSON.stringify(value))` làm mất hoặc biến đổi:

- `Date`;
- `Map`, `Set`;
- `undefined`;
- `BigInt`;
- prototype/class instance;
- circular reference.

`structuredClone` hỗ trợ nhiều built-in và circular reference tốt hơn:

```ts
const cloned = structuredClone(value);
```

Nhưng deep clone toàn bộ state có thể:

- tốn CPU và memory;
- phá identity cần giữ;
- che đi thiết kế ownership chưa rõ.

Ưu tiên:

1. update đúng nhánh cần thay đổi;
2. mapper tạo model mới tại boundary;
3. dùng `structuredClone` khi thật sự cần snapshot độc lập.

---

## 13. Thiết kế update cho collection

Update một item:

```ts
function updateOrder(
  orders: ReadonlyArray<Order>,
  orderId: number,
  patch: Partial<Order>
): Order[] {
  return orders.map(order =>
    order.id === orderId ? { ...order, ...patch } : order
  );
}
```

Các item không đổi giữ identity cũ. Item thay đổi và array root có identity mới.

Xóa:

```ts
const next = orders.filter(order => order.id !== orderId);
```

Thêm:

```ts
const next = [...orders, createdOrder];
```

Trước khi dùng `Partial<T>`, kiểm tra xem mọi field có thật sự được phép patch không. Với nghiệp vụ quan trọng, command type cụ thể thường an toàn hơn.

---

## 14. Liên hệ với Angular

Với `OnPush`, thay đổi property lồng sâu nhưng giữ input reference cũ có thể khiến UI không được check như mong đợi.

```ts
// Không tốt nếu state đang được chia sẻ
this.user.address.city = city;

// Có reference mới rõ ràng
this.user = {
  ...this.user,
  address: {
    ...this.user.address,
    city,
  },
};
```

Với Signals:

```ts
users.update(current =>
  current.map(user =>
    user.id === userId ? { ...user, selected: true } : user
  )
);
```

Đừng gọi `signal().push(...)`: vừa mutate array vừa không thông báo bằng một update contract rõ ràng.

---

## 15. `OnPush`, Signals và identity

`OnPush` không có nghĩa “Angular tự hiểu immutability”. Identity mới chỉ là một trong các tín hiệu giúp Angular quyết định cần check/update.

```ts
// Parent giữ cùng reference
this.user.address.city = city;

// Child OnPush nhận input reference cũ
```

Bug xảy ra vì contract input bị mutate ngoài sự quan sát mong đợi, không phải vì spread là luật bắt buộc của JavaScript.

Signals cũng cần update thông qua API:

```ts
readonly state = signal(initialState);

renameUser(name: string): void {
  this.state.update(current => ({
    ...current,
    user: {
      ...current.user,
      name,
    },
  }));
}
```

Luôn cân nhắc granularity: một signal cực lớn buộc nhiều update lồng sâu; quá nhiều signal vụn làm state khó điều phối.

---

## 16. Normalize tại boundary

API DTO không nên trôi tự do khắp UI:

```ts
function toOrderViewModel(dto: OrderDto): OrderViewModel {
  return {
    id: dto.id,
    customerName: dto.customer?.name ?? '—',
    createdAt: new Date(dto.createdAt),
    canCancel: dto.status === 'PENDING',
  };
}
```

Mapper tạo ownership boundary:

- UI không phụ thuộc trực tiếp shape của API;
- parse dữ liệu xảy ra một lần;
- object mới không dùng chung reference vô tình với DTO cache;
- rule hiển thị có chỗ đặt rõ.

---

## 17. Quy trình debug mutation

Khi UI thay đổi ngoài ý muốn hoặc không cập nhật:

```text
1. Xác định object/array đang có identity nào.
2. Tìm tất cả alias giữ cùng reference.
3. Đặt breakpoint tại nơi property bị ghi.
4. Kiểm tra mutating array method.
5. Vẽ nhánh nào được copy, nhánh nào còn dùng chung.
6. Xác định owner được quyền update.
7. Sửa contract và kiểm tra lại UI/reactivity.
```

Trong development có thể freeze dữ liệu đầu vào để mutation ném lỗi sớm, nhưng vẫn cần tìm đúng owner.

---

## 18. Bài thực hành

1. Tìm kết quả của nested spread và chỉ ra những reference còn dùng chung.
2. Refactor reducer đang `push` trực tiếp vào state array.
3. Viết update bất biến cho `order.customer.address.city`.
4. So sánh `JSON clone` và `structuredClone` với `Date`, `Map` và circular object.
5. Thiết kế mapper từ DTO nullable sang ViewModel an toàn cho template.

---

## 19. Câu hỏi tự kiểm tra

1. JavaScript truyền object “by reference” hay truyền một reference value?
2. Vì sao gán lại parameter không thay đổi biến của caller?
3. Spread tạo object mới đến độ sâu nào?
4. Structural sharing giữ lại những identity nào?
5. `const`, `Readonly<T>` và `Object.freeze` bảo vệ ở ba tầng nào?
6. Khi nào mutation local an toàn?
7. Vì sao deep clone toàn state thường là dấu hiệu thiết kế chưa tốt?
8. Angular `OnPush` liên quan tới identity thế nào?

---

## 20. Checklist hoàn thành

```text
[ ] Phân biệt equality theo reference và equality theo nghiệp vụ.
[ ] Vẽ được reference graph trước và sau phép gán/copy.
[ ] Hiểu parameter nhận bản sao của reference value.
[ ] Biết spread là shallow copy.
[ ] Hiểu structural sharing.
[ ] Không mutate input/store state ngoài contract.
[ ] Chấp nhận mutation local khi ownership rõ.
[ ] Không dùng deep clone như giải pháp mặc định.
[ ] Update đúng nhánh để Angular/Signals quan sát được thay đổi.
[ ] Normalize dữ liệu tại boundary.
```
