# `this`, function và prototype

Phần này đi từ function call đến object model của JavaScript. Mục tiêu là tự suy ra `this` từ call site, hiểu `new` tạo object thế nào và theo được đường tìm kiếm property trên prototype chain.

```text
Function được tạo
→ function được gọi theo một call form
→ call form quyết định `this`
→ nếu gọi với new, object mới liên kết tới prototype
→ property lookup đi dọc prototype chain
```

---

## 1. Function là một object có thể truyền đi

```ts
function calculateTotal(price: number, quantity: number): number {
  return price * quantity;
}

const operation = calculateTotal;
const operations = [calculateTotal];

run(calculateTotal);
```

Ba chỗ trên không gọi function. Chúng truyền cùng một function object bằng reference. Chỉ biểu thức có `()` mới thực hiện lời gọi:

```ts
calculateTotal(100, 2);
operation(100, 2);
operations[0](100, 2);
```

Việc function có thể bị tách khỏi object là nguyên nhân chính khiến method mất `this`.

### Declaration, expression và arrow

```ts
function declaration(): void {}

const expression = function (): void {};

const arrow = (): void => {};
```

Khác biệt quan trọng trong chương này:

| Dạng | Có `this` riêng | Dùng với `new` | Hoisted với giá trị function |
|---|---:|---:|---:|
| Function declaration | Có | Có | Có |
| Function expression | Có | Có | Theo declaration của biến |
| Arrow function | Không | Không | Theo declaration của biến |

---

## 2. `this` là tham số ngầm của lời gọi

Hãy coi regular function nhận thêm một tham số ngầm tên `this`. Giá trị đó không cố định khi khai báo function mà phần lớn được xác định khi gọi.

Với regular function, `this` thường được quyết định bởi **cách function được gọi**.

```ts
const user = {
  name: 'An',
  introduce() {
    console.log(this.name);
  },
};

user.introduce(); // An

const introduce = user.introduce;
introduce(); // undefined hoặc lỗi, tùy strict mode/môi trường
```

Ở lần gọi thứ hai không còn receiver `user`.

### Năm call form cần biết

```ts
fn();                       // default binding
object.fn();                // implicit binding
fn.call(context);           // explicit binding
const bound = fn.bind(ctx);  // hard binding
new Constructor();          // constructor binding
```

Đừng xác định `this` chỉ bằng cách nhìn nơi function được viết; hãy nhìn call site.

---

## 3. Default binding

```ts
'use strict';

function inspectThis(): void {
  console.log(this);
}

inspectThis(); // undefined
```

ES modules và class body chạy theo strict semantics. Đừng dựa vào hành vi non-strict gán `this` thành global object; application code hiện đại gần như luôn chạy strict.

---

## 4. Implicit binding và mất receiver

Trong:

```ts
user.introduce();
```

biểu thức bên trái dấu chấm là receiver, nên `this === user`.

Nhưng phép gán sau chỉ copy function reference:

```ts
const introduce = user.introduce;
introduce();
```

Biến `introduce` không ghi nhớ rằng function từng nằm trong `user`. Đây không phải closure bị mất; lexical scope vẫn giữ nguyên. Cái bị mất là receiver của call site.

Callback API cũng thường gọi function như một plain call:

```ts
setTimeout(user.introduce, 0);
```

Sửa bằng wrapper:

```ts
setTimeout(() => user.introduce(), 0);
```

Wrapper có lexical reference tới `user` và tạo lại method call khi timer chạy.

---

## 5. Arrow function dùng lexical `this`

Arrow function không tạo `this` riêng. Nó dùng `this` của scope bao quanh.

```ts
class SearchPage {
  keyword = 'angular';

  printLater(): void {
    setTimeout(() => {
      console.log(this.keyword);
    }, 0);
  }
}
```

Arrow phù hợp cho callback cần giữ context của instance.

Nhưng arrow không luôn tốt hơn:

```ts
const user = {
  name: 'An',
  introduce: () => console.log(this.name),
};
```

Arrow ở đây không bind `this` vào `user`.

---

## 6. `bind`, `call`, `apply`

```ts
function greet(prefix: string, suffix: string): string {
  return `${prefix} ${this.name}${suffix}`;
}

const context = { name: 'An' };

greet.call(context, 'Hello', '!');
greet.apply(context, ['Hello', '!']);

const greetAn = greet.bind(context, 'Hello');
greetAn('!');
```

- `call`: gọi ngay, truyền arguments rời;
- `apply`: gọi ngay, truyền arguments bằng array;
- `bind`: tạo function mới với context/arguments đã cố định.

### Bẫy khi gỡ event listener

```ts
element.addEventListener('click', handler.bind(this));
element.removeEventListener('click', handler.bind(this));
```

Hai lần `bind` tạo hai function khác nhau, nên listener không được gỡ. Phải giữ cùng một reference:

```ts
const boundHandler = handler.bind(this);
element.addEventListener('click', boundHandler);
element.removeEventListener('click', boundHandler);
```

---

## 7. Thứ tự ưu tiên của `this`

Khi nhiều rule xuất hiện cùng lúc, mental model thực dụng:

```text
new binding
→ explicit/hard binding
→ implicit binding
→ default binding
```

Arrow function đứng ngoài bảng này vì nó không có `this` riêng.

```ts
function showName(): void {
  console.log(this.name);
}

const first = { name: 'A', showName };
const second = { name: 'B' };

first.showName();            // A: implicit
showName.call(second);       // B: explicit
const bound = showName.bind(second);
bound();                     // B: hard binding
```

Không cần học các câu đố kết hợp binding cực đoan; cần nhận diện đúng các call form xuất hiện trong callback và integration code.

---

## 8. `new` thực hiện những bước nào?

```ts
function User(name: string) {
  this.name = name;
}

User.prototype.introduce = function (): string {
  return `Tôi là ${this.name}`;
};

const user = new User('An');
```

Mental model của `new User('An')`:

```text
1. Tạo object rỗng.
2. Liên kết [[Prototype]] của object tới User.prototype.
3. Gọi User với this là object mới.
4. Nếu constructor không return object khác, trả object mới.
```

Mô phỏng gần đúng:

```ts
const user = Object.create(User.prototype);
User.call(user, 'An');
```

Class syntax hiện đại làm code rõ hơn nhưng vẫn dựa trên prototype model.

---

## 9. `prototype` và `[[Prototype]]` là hai khái niệm khác nhau

```text
User.prototype
```

là property trên constructor function, dùng làm prototype cho instance được tạo bởi `new User`.

```text
user.[[Prototype]]
```

là internal link của instance. Có thể quan sát bằng:

```ts
Object.getPrototypeOf(user) === User.prototype; // true
```

Không dùng `__proto__` trong application code mới; dùng `Object.getPrototypeOf` và `Object.create` khi thực sự cần.

---

## 10. Prototype chain

Object có thể delegate việc tìm property lên prototype.

```ts
class User {
  constructor(public name: string) {}

  introduce(): string {
    return `Tôi là ${this.name}`;
  }
}

const first = new User('An');
const second = new User('Bình');
```

`first` và `second` có dữ liệu `name` riêng, nhưng method `introduce` được chia sẻ qua `User.prototype`.

```ts
first.introduce === second.introduce; // true
```

Nếu khai báo method bằng class field arrow:

```ts
class User {
  introduce = () => `Tôi là ${this.name}`;
}
```

Mỗi instance nhận một function riêng. Nó giúp giữ `this`, nhưng đổi lại tăng allocation và làm thay đổi semantics của method. Chỉ dùng khi cần truyền method như callback hoặc có lý do cụ thể.

---

## 11. Property lookup và shadowing

Khi đọc `object.key`, runtime:

1. tìm own property trên object;
2. nếu không có, đi lên prototype;
3. tiếp tục đến khi gặp `null`.

Khi gán:

```ts
object.key = value;
```

thường một own property được tạo trên object và che property cùng tên trên prototype.

Trong application code, không sửa prototype của built-in:

```ts
// Không nên
Array.prototype.unique = function () {
  // ...
};
```

Việc này tạo global side effect, có thể xung đột library và làm type/runtime không đồng bộ.

---

## 12. Class là abstraction trên prototype

```ts
class User {
  constructor(public name: string) {}

  introduce(): string {
    return `Tôi là ${this.name}`;
  }
}
```

Kiểm tra:

```ts
Object.hasOwn(user, 'name'); // true
Object.hasOwn(user, 'introduce'); // false
Object.hasOwn(User.prototype, 'introduce'); // true
```

Class bổ sung syntax, strict semantics và một số cơ chế riêng, nhưng method instance thông thường vẫn nằm trên prototype.

### Inheritance

```ts
class Admin extends User {
  override introduce(): string {
    return `${super.introduce()} và tôi là quản trị viên`;
  }
}
```

Property lookup của instance `Admin` đi qua:

```text
admin instance
→ Admin.prototype
→ User.prototype
→ Object.prototype
→ null
```

Inheritance sâu làm behavior phân tán trên chain. Trong application architecture, ưu tiên composition nếu quan hệ không thật sự là “is-a”.

---

## 13. Liên hệ với Angular

Angular template và dependency injection thường che bớt vấn đề `this`, nhưng lỗi vẫn xuất hiện khi:

- truyền method instance sang callback;
- đăng ký DOM/browser event thủ công;
- dùng library ngoài Angular;
- destructure method khỏi service;
- viết custom scheduler hoặc integration code.

```ts
class ExportService {
  export(): void {
    // dùng this...
  }
}

const callback = exportService.export; // mất receiver
button.addEventListener('click', callback);
```

Giải pháp tốt nhất thường là wrapper có ownership rõ:

```ts
const callback = () => exportService.export();
```

---

## 14. Quy trình debug `this`

Khi gặp `Cannot read properties of undefined` trong method:

```text
1. Dừng tại dòng lỗi và kiểm tra giá trị this.
2. Tìm nơi function được truyền đi.
3. Tìm call site thực tế, không chỉ declaration.
4. Xác định callback API gọi plain function hay method.
5. Chọn wrapper arrow hoặc bind một lần.
6. Nếu là listener, bảo đảm cleanup dùng cùng reference.
```

Khi property không tìm thấy:

```text
1. Kiểm tra own property bằng Object.hasOwn.
2. Kiểm tra Object.getPrototypeOf.
3. Theo prototype chain từng bước.
4. Kiểm tra property có bị shadow không.
5. Kiểm tra instance có thật sự được tạo bằng constructor/class mong muốn không.
```

---

## 15. Bài thực hành

1. Dự đoán `this` trong plain call, method call, `call` và arrow callback.
2. Viết một ví dụ listener bị leak do gọi `bind` hai lần, sau đó sửa.
3. So sánh method prototype và class-field arrow bằng:

```ts
instanceA.method === instanceB.method
```

4. Refactor code truyền method service trực tiếp thành callback có context rõ.

---

## 16. Câu hỏi tự kiểm tra

1. Vì sao `const method = object.method` làm mất receiver?
2. Arrow function lấy `this` từ đâu?
3. `bind` trả function mới hay sửa function cũ?
4. Vì sao gọi `bind` hai lần làm `removeEventListener` thất bại?
5. `new` liên kết instance với `Constructor.prototype` ở bước nào?
6. `prototype` của constructor khác `[[Prototype]]` của instance ra sao?
7. Vì sao class method thường được chia sẻ giữa các instance?
8. Property lookup dừng ở đâu?

---

## 17. Checklist hoàn thành

```text
[ ] Xác định `this` từ call site.
[ ] Biết arrow function không có `this` riêng.
[ ] Phân biệt call/apply/bind.
[ ] Không tạo function mới khi cần remove đúng listener cũ.
[ ] Mô tả được bốn bước của new.
[ ] Phân biệt constructor.prototype với prototype link của instance.
[ ] Theo được property lookup trên prototype chain.
[ ] Hiểu class method được chia sẻ qua prototype.
[ ] Không dùng prototype mutation cho tiện ích ứng dụng.
```
