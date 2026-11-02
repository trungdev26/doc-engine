# Runtime, scope và closure

Runtime, scope và closure là ba thuật ngữ với ý nghĩa cụ thể:

- **Runtime** — nơi JavaScript được chạy, ví dụ trình duyệt hoặc Node.js.
- **Scope** — phạm vi mà một biến có thể được nhìn thấy và dùng được, tức là từ đâu trong code thì đọc được biến đó.
- **Closure** — khả năng một function vẫn dùng được biến bên ngoài, ngay cả sau khi đoạn code tạo ra biến đó đã chạy xong.

Phần này trả lời hai câu hỏi gặp trong hầu hết bug thực tế: một biến đang được tìm ở đâu, và một function đang giữ dữ liệu nào còn sống dù đoạn code tạo ra nó đã kết thúc từ lâu. Đây là nền tảng bắt buộc trước khi học `this`, event loop hay memory leak, vì cả ba chủ đề đó đều mô tả hành vi runtime dựa trên các cơ chế được trình bày ở đây.

```text
File bắt đầu chạy
  → mỗi lần một function được gọi, JavaScript mở ra một "vùng làm việc" mới cho lần gọi đó
  → vùng làm việc đó đã biết sẵn cần tìm biến ở đâu, trước khi chạy bất kỳ dòng nào bên trong
  → một số vùng làm việc vẫn còn được dùng, ngay cả sau khi function tạo ra nó đã chạy xong
```

Trong sơ đồ trên, "vùng làm việc" là execution context, quy tắc "biết sẵn cần tìm biến ở đâu" là scope, và khả năng "vẫn còn được dùng sau khi đã chạy xong" là closure.

## JavaScript runtime và execution context

JavaScript cần một môi trường để chạy source code. Trình duyệt và Node.js đều cung cấp môi trường này, gọi là **JavaScript runtime**. Runtime chịu trách nhiệm thực thi code, quản lý bộ nhớ và cung cấp các API bổ sung (DOM, `fetch`, `setTimeout`...) nằm ngoài đặc tả ngôn ngữ thuần túy.

```ts
function calculateTotal(price: number, quantity: number): number {
  const subtotal = price * quantity;
  return subtotal;
}

const total = calculateTotal(120_000, 2);
```

Đoạn code trên có hai lần thực thi: một lần ở cấp file, một lần bên trong `calculateTotal`. **Execution context** là trạng thái runtime tạo ra để thực thi một phần code như vậy. Khi file bắt đầu chạy, runtime tạo **global execution context**. Mỗi lần gọi function tạo thêm một **function execution context**, chứa tham số (`price`, `quantity`), biến local (`subtotal`) và thông tin để runtime quay lại đúng vị trí gọi sau khi function kết thúc.

Mỗi lời gọi có trạng thái riêng, kể cả khi gọi cùng một function hai lần:

```ts
const firstTotal = calculateTotal(120_000, 2);
const secondTotal = calculateTotal(50_000, 3);
```

Hai lần gọi không dùng chung `price`, `quantity` hay `subtotal`. Runtime tạo hai function execution context độc lập, mỗi context bị hủy khi function tương ứng return.

### Creation phase và execution phase

Một execution context không chạy tuần tự ngay từ dòng đầu tiên. Trước khi chạy statement nào, runtime thực hiện **creation phase**: quét toàn bộ code trong context đó để thiết lập scope. Sau đó runtime mới bước vào **execution phase**, chạy từng dòng theo thứ tự.

Trong creation phase, runtime tạo một **lexical environment** — cấu trúc lưu các binding (tên biến/function trỏ tới giá trị) của context hiện tại — và liên kết nó với lexical environment của scope bên ngoài, gọi là **outer reference**. Chuỗi outer reference nối các lexical environment lại với nhau chính là cơ sở của scope chain, trình bày ở phần [Lexical scope và scope chain](#lexical-scope-và-scope-chain).

Đây là mô hình giản lược, không phải trích dẫn nguyên văn đặc tả ECMAScript, nhưng đủ để giải thích chính xác hoisting, Temporal Dead Zone và closure ở các phần sau. Execution context còn quản lý `this` binding, nhưng phần đó phụ thuộc vào cách function được gọi chứ không chỉ vào nơi nó được khai báo, nên được trình bày riêng trong tài liệu `this`, function và prototype.

## Call stack

Call stack lưu thứ tự các execution context đang hoạt động. Context được đẩy vào (push) khi function bắt đầu chạy và lấy ra (pop) khi function kết thúc.

```ts
function formatCurrency(value: number): string {
  return `${value.toLocaleString('vi-VN')} đ`;
}

function calculateTotal(price: number, quantity: number): string {
  const subtotal = price * quantity;
  return formatCurrency(subtotal);
}

const total = calculateTotal(120_000, 2);
```

Thứ tự trên call stack:

```text
1. global
2. global → calculateTotal
3. global → calculateTotal → formatCurrency
4. global → calculateTotal
5. global
```

`formatCurrency` được gọi sau nên kết thúc trước. Call stack hoạt động theo nguyên tắc last in, first out (LIFO).

### Stack trace

Khi một function ném lỗi, stack trace ghi lại chuỗi lời gọi dẫn tới lỗi tại thời điểm nó xảy ra:

```ts
function calculateTotal(price: number, quantity: number): string {
  return formatCurrency(price * quantity);
}

function formatCurrency(value: number): string {
  throw new Error('Unsupported currency');
}

calculateTotal(120_000, 2);
```

Stack trace cho biết lỗi bắt đầu trong `formatCurrency`, function này được gọi từ `calculateTotal`, sau đó từ global code. Đọc stack trace từ trên xuống — nơi lỗi ném ra — giúp xác định nguyên nhân nhanh hơn nhiều so với đoán mò, đặc biệt khi lỗi nằm trong một callback được gọi gián tiếp qua nhiều lớp.

### Stack overflow và tail call

Mỗi function call chiếm một vị trí trên call stack. Một chuỗi gọi không có điểm dừng làm stack tăng liên tục:

```ts
function repeat(): void {
  repeat();
}

repeat();
```

Runtime dừng chương trình bằng lỗi `Maximum call stack size exceeded`. Lỗi này thường xuất hiện khi recursion thiếu base case, hoặc hai function gọi lẫn nhau ngoài dự kiến.

Đặc tả ECMAScript 2015 định nghĩa **proper tail call**: nếu lời gọi đệ quy là hành động cuối cùng của function, engine có thể tái sử dụng stack frame thay vì chồng thêm. Trên thực tế, các engine phổ biến hiện nay — bao gồm V8 dùng trong Chrome và Node.js — không triển khai tối ưu này. Vì vậy không nên viết recursion sâu cho dữ liệu lớn dựa trên giả định có tail call optimization; thay vào đó dùng vòng lặp, chia nhỏ công việc, hoặc kỹ thuật trampoline khi thực sự cần đệ quy.

## Lexical scope và scope chain

Scope xác định vùng code có thể truy cập một biến. JavaScript dùng **lexical scope**: quyền truy cập được xác định bởi vị trí khai báo trong source code, không phải bởi nơi function được gọi.

```ts
const taxRate = 0.1;

function calculateTotal(price: number, quantity: number): number {
  const subtotal = price * quantity;
  return subtotal + subtotal * taxRate;
}
```

`calculateTotal` đọc được `price`, `quantity`, `subtotal` trong scope của chính nó, và `taxRate` trong scope bên ngoài. Khai báo `const taxRate = 0.1` tạo ra một **binding** — một liên kết giữa tên và giá trị, lưu trong lexical environment. `taxRate` là tên của binding; `0.1` là giá trị hiện tại của nó. Phân biệt binding và giá trị là điều bắt buộc để giải thích chính xác closure ở phần sau: closure giữ binding, không sao chép giá trị tại một thời điểm.

Khi gặp một tên biến, runtime tìm trong lexical environment hiện tại trước. Nếu không có, nó đi theo outer reference sang lexical environment bên ngoài, và tiếp tục như vậy cho đến global scope. Chuỗi tìm kiếm này gọi là **scope chain**:

```text
scope của calculateTotal
        ↓ outer reference
global scope
```

Nếu không scope nào chứa tên cần tìm, runtime ném `ReferenceError`.

### Vị trí khai báo quyết định scope, không phải vị trí gọi

```ts
const currency = 'VND';

function readCurrency(): string {
  return currency;
}

function run(): string {
  const currency = 'USD';
  return readCurrency();
}

run(); // "VND"
```

`readCurrency` được khai báo trong global scope nên scope bên ngoài của nó, theo outer reference thiết lập ở creation phase, luôn là global scope. Việc gọi `readCurrency` từ bên trong `run` không cấp quyền truy cập tới biến `currency` cục bộ của `run`.

Call stack và scope chain trả lời hai câu hỏi khác nhau, và nhầm lẫn hai câu hỏi này là nguồn gốc phổ biến của lỗi đọc nhầm biến:

| Cơ chế | Câu hỏi |
| --- | --- |
| Call stack | Function nào đang chạy, và function nào sẽ tiếp tục sau khi nó kết thúc? |
| Scope chain | Function hiện tại có thể tìm biến ở những scope nào? |

## Block scope và shadowing

Một block được giới hạn bởi `{}`. Khai báo bằng `let` và `const` chỉ có hiệu lực bên trong block chứa nó:

```ts
const discount = 0;

if (isMember) {
  const discount = 0.1;
  console.log(discount); // 0.1
}

console.log(discount); // 0
```

Biến bên trong block có cùng tên với biến bên ngoài. Trong phạm vi block, biến bên trong che biến bên ngoài — cơ chế này gọi là **shadowing**.

Shadowing hợp lệ nhưng có thể che giấu lỗi cập nhật:

```ts
let total = calculateTotal(120_000, 2);

if (hasVoucher) {
  const total = applyVoucher(total);
}

renderTotal(total);
```

`renderTotal` vẫn nhận giá trị ban đầu vì `const total` bên trong `if` tạo một binding mới, chỉ tồn tại trong block đó. Gán lại binding bên ngoài thể hiện đúng mục đích hơn:

```ts
let total = calculateTotal(120_000, 2);

if (hasVoucher) {
  total = applyVoucher(total);
}

renderTotal(total);
```

### Function scope của `var`

`var` không có block scope. Binding của nó thuộc function gần nhất chứa nó, bất kể nằm trong bao nhiêu lớp block:

```ts
function calculateTotal(price: number, quantity: number): number {
  if (quantity > 1) {
    var discount = 0.1;
  }

  return price * quantity * (1 - discount);
}
```

`discount` vẫn tồn tại bên ngoài block `if`, vì binding của nó thuộc scope của `calculateTotal`, không thuộc scope của `if`. Sự khác biệt function scope so với block scope là nguyên nhân của lỗi callback trong vòng lặp trình bày ở phần [Closure trong callback](#closure-trong-callback-binding-hiện-tại-và-snapshot).

## Hoisting và Temporal Dead Zone

Creation phase không xử lý mọi khai báo giống nhau — cách xử lý phụ thuộc vào loại khai báo, và sự khác biệt đó thường được gọi chung là **hoisting**, dù source code không thực sự bị di chuyển lên đầu file.

| Khai báo | Trạng thái trước dòng khai báo |
| --- | --- |
| Function declaration | Có thể gọi ngay |
| `var` | Tồn tại, giá trị `undefined` |
| `let`, `const` | Tồn tại nhưng chưa thể truy cập |

Function declaration được đăng ký đầy đủ ngay ở creation phase, nên có thể gọi trước vị trí xuất hiện trong file:

```ts
const total = calculateTotal(120_000, 2);

function calculateTotal(price: number, quantity: number): number {
  return price * quantity;
}
```

`var` được tạo binding ở creation phase với giá trị mặc định `undefined`, và chỉ nhận giá trị thật khi execution phase chạy tới dòng gán:

```ts
console.log(total); // undefined
var total = 240_000;
```

`let` và `const` cũng được tạo binding ở creation phase, nhưng ở trạng thái chưa khởi tạo. Truy cập binding trong trạng thái này ném `ReferenceError`:

```ts
console.log(total); // ReferenceError
const total = 240_000;
```

Khoảng từ đầu scope đến dòng khai báo `let`/`const` gọi là **Temporal Dead Zone (TDZ)**. TDZ không phải một vùng nhớ đặc biệt; nó chỉ là cách gọi khoảng thời gian binding đã tồn tại nhưng chưa được phép đọc. Mental model đúng là: runtime thiết lập scope trước khi thực thi, mỗi loại khai báo có quy tắc khởi tạo riêng — không phải runtime kéo các dòng khai báo lên đầu file.

## Closure

Một function có thể được trả về và gọi sau khi function bên ngoài đã kết thúc:

```ts
function createTotalCalculator(taxRate: number) {
  return function calculateTotal(price: number, quantity: number): number {
    const subtotal = price * quantity;
    return subtotal + subtotal * taxRate;
  };
}

const calculateWithVat = createTotalCalculator(0.1);

calculateWithVat(120_000, 2); // 264000
```

Quá trình thực thi: `createTotalCalculator(0.1)` tạo binding `taxRate` trong lexical environment của lời gọi đó; function `calculateTotal` được tạo bên trong lexical environment đó, với outer reference trỏ tới nó; `createTotalCalculator` trả function và kết thúc, execution context của nó bị pop khỏi call stack; khi `calculateWithVat` được gọi sau đó, nó vẫn truy cập được `taxRate` qua outer reference, dù execution context tạo ra nó đã không còn trên call stack.

Function được trả về vẫn giữ quyền truy cập tới lexical environment nơi nó được tạo, ngay cả khi execution context đó đã kết thúc. Khả năng này gọi là **closure**.

Vì closure giữ binding chứ không sao chép giá trị, nó phản ánh đúng thay đổi sau này:

```ts
function createCounter() {
  let count = 0;

  return function increase() {
    count += 1;
    return count;
  };
}

const counter = createCounter();

counter(); // 1
counter(); // 2
```

Hai lần gọi `counter` truy cập cùng một binding `count`. Lần gọi đầu thay đổi giá trị thành `1`; lần gọi sau tiếp tục từ giá trị đó, vì cả hai lần gọi cùng đọc và ghi qua một outer reference duy nhất. Ngược lại, mỗi lần gọi `createCounter` tạo một lexical environment mới:

```ts
const firstCounter = createCounter();
const secondCounter = createCounter();

firstCounter();  // 1
firstCounter();  // 2
secondCounter(); // 1
```

`firstCounter` và `secondCounter` không dùng chung state, vì mỗi function giữ binding `count` thuộc đúng lần gọi `createCounter` đã tạo ra nó.

### Dùng closure để đóng gói state

Closure không chỉ xuất hiện khi một callback "vô tình" đọc được biến bên ngoài. Nó còn là công cụ chủ động để đóng gói state riêng cho một hành vi tái sử dụng, mà không cần một class.

`debounce` là ví dụ điển hình: nó cần nhớ timer của lần gọi trước để hủy đi khi có lần gọi mới.

```ts
function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  return (...args: Args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn(...args), delayMs);
  };
}

const debouncedSearch = debounce(
  (keyword: string) => runSearch(keyword),
  300,
);
```

Binding `timerId` sống trong lexical environment của lời gọi `debounce(...)`, và được dùng chung bởi mọi lần gọi `debouncedSearch` sau đó — đó là lý do lần gọi thứ hai hủy được timer do lần gọi thứ nhất tạo ra, vì cả hai đọc và ghi cùng một binding qua closure.

Cùng cơ chế đó cũng dùng để giữ một trạng thái private mà bên ngoài không thể truy cập trực tiếp:

```ts
function once<Args extends unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R | undefined {
  let called = false;
  let result: R | undefined;

  return (...args: Args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }

    return result;
  };
}
```

Không có cách nào đọc hay ghi `called` từ bên ngoài function được trả về — đây là encapsulation dựa trên scope, không dựa trên `private` của class. Nếu `debouncedSearch` hoặc kết quả của `once` được lưu trong một singleton sống suốt vòng đời ứng dụng, closure của nó — bao gồm `timerId` hoặc `result` — cũng sống suốt vòng đời đó, đúng như phần [Closure và memory retention](#closure-và-memory-retention) phân tích.

## Closure trong callback: binding hiện tại và snapshot

Callback thường chạy sau khi function đăng ký nó đã kết thúc:

```ts
function scheduleTotal(price: number, quantity: number): void {
  setTimeout(() => {
    console.log(calculateTotal(price, quantity));
  }, 1000);
}

scheduleTotal(120_000, 2);
```

Callback vẫn truy cập được `price` và `quantity` nhờ closure, dù `scheduleTotal` đã return từ lâu trước khi `setTimeout` callback chạy.

Điểm dễ gây lỗi là callback đọc **giá trị hiện tại** của binding tại thời điểm nó chạy, không phải giá trị tại thời điểm đăng ký:

```ts
let quantity = 1;

setTimeout(() => {
  console.log(quantity);
}, 1000);

quantity = 2;
```

Kết quả là `2`. Callback không lưu riêng giá trị `1`; nó đọc qua cùng một binding mà dòng cuối vừa gán lại. Khi nghiệp vụ cần giá trị tại thời điểm đăng ký, phải chủ động tạo một binding snapshot không bị gán lại:

```ts
let quantity = 1;
const scheduledQuantity = quantity;

setTimeout(() => {
  console.log(scheduledQuantity);
}, 1000);

quantity = 2;
```

`scheduledQuantity` không bị gán lại sau khi tạo, nên callback luôn nhận giá trị `1`.

Vòng lặp bộc lộ cùng vấn đề binding-hay-snapshot này rõ nhất:

```ts
for (var index = 0; index < 3; index += 1) {
  setTimeout(() => {
    console.log(index);
  }, 0);
}
```

`var` chỉ tạo **một** binding `index`, thuộc scope của function bao ngoài vòng lặp. Cả ba callback đóng trên cùng một binding đó. Khi chúng chạy, vòng lặp đã kết thúc và `index` đã là `3`:

```text
3
3
3
```

```ts
for (let index = 0; index < 3; index += 1) {
  setTimeout(() => {
    console.log(index);
  }, 0);
}
```

Với `let`, mỗi vòng lặp tạo một lexical environment mới cho thân vòng lặp; giá trị `index` của iteration hiện tại được sao chép sang binding mới trước khi vòng lặp kế tiếp bắt đầu. Mỗi callback vì vậy đóng trên một binding riêng, mang giá trị đúng tại vòng lặp đã tạo ra nó:

```text
0
1
2
```

"Đổi `var` thành `let`" sửa được lỗi callback trong vòng lặp không phải vì `let` hiện đại hơn, mà vì nó thay đổi số lượng binding được tạo ra: một với `var`, và một cho mỗi iteration với `let`.

## Closure và memory retention

Dữ liệu được closure sử dụng phải tiếp tục tồn tại chừng nào function còn có thể được gọi:

```ts
function registerPreview(button: HTMLButtonElement, product: Product): () => void {
  const handleClick = () => {
    renderPreview(product);
  };

  button.addEventListener('click', handleClick);

  return () => {
    button.removeEventListener('click', handleClick);
  };
}
```

Listener giữ `handleClick`; `handleClick` giữ quyền truy cập tới `product` qua closure. Nếu listener sống lâu hơn dự kiến, `product` cũng bị giữ lại theo, dù không còn ai chủ động dùng nó.

Closure không tự tạo memory leak. Leak xuất hiện khi listener, timer, subscription hoặc cache vẫn giữ function dù owner của function đã kết thúc vòng đời — tức là vẫn còn một đường reference từ root tới dữ liệu không còn cần. Function cleanup được trả về từ `registerPreview` thể hiện rõ ai chịu trách nhiệm giải phóng listener. Cách xác minh retention bằng heap snapshot và retaining path được trình bày trong tài liệu memory management và performance.

## Ứng dụng trong Angular

Closure là cách chuẩn để tham số hóa một hành vi tái sử dụng trong Angular, cả ở validator lẫn interceptor:

```ts
function minimumQuantity(minimum: number): ValidatorFn {
  return control => {
    const quantity = Number(control.value);

    return quantity >= minimum
      ? null
      : {
          minimumQuantity: {
            minimum,
            actual: quantity,
          },
        };
  };
}
```

`minimumQuantity(5)` tạo một validator giữ binding `minimum` với giá trị `5` qua closure. Angular gọi validator này sau đó mà không cần truyền lại configuration mỗi lần.

```ts
function withRetry(maxAttempts: number): HttpInterceptorFn {
  return (req, next) => next(req).pipe(retry(maxAttempts));
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([withRetry(2)])),
  ],
};
```

`withRetry(2)` tạo một `HttpInterceptorFn` giữ binding `maxAttempts` qua closure. Interceptor được đăng ký một lần khi bootstrap ứng dụng, nhưng closure của nó tồn tại và được gọi lại cho mọi request sau đó.

RxJS callback bộc lộ đúng vấn đề snapshot đã nêu ở phần closure trong callback, chỉ khác domain:

```ts
const shopId = this.shopId;

this.searchControl.valueChanges.pipe(
  switchMap(keyword =>
    this.productService.search({
      shopId,
      keyword,
    }),
  ),
);
```

Callback của `switchMap` giữ binding `shopId` qua closure. Trong ví dụ này, `shopId` là một snapshot được tạo khi pipeline được thiết lập, đúng cơ chế snapshot đã trình bày ở trên. Nếu callback cần shop hiện tại tại mỗi lần emit thay vì snapshot lúc thiết lập, state cần được đưa vào data flow thay vì đọc qua một biến ngoài closure:

```ts
combineLatest([
  this.shopId$,
  this.searchControl.valueChanges,
]).pipe(
  switchMap(([shopId, keyword]) =>
    this.productService.search({ shopId, keyword }),
  ),
);
```

Phân biệt đúng snapshot và state mới nhất là nền tảng để phân tích stale data và race condition ở chương sau.

## Debug scope và closure

Khi callback đọc sai giá trị, kiểm tra lần lượt:

1. Function được khai báo trong scope nào.
2. Binding được khai báo trong scope nào.
3. Có binding cùng tên đang shadow binding cần dùng hay không.
4. Callback đang đọc một binding có thể thay đổi hay một snapshot.
5. Binding đã thay đổi vào thời điểm nào so với thời điểm callback chạy.
6. Listener, timer hoặc subscription nào đang giữ callback sống.

```ts
let activeProductId = 10;

function scheduleLoad(): void {
  setTimeout(() => {
    loadProduct(activeProductId);
  }, 1000);
}

scheduleLoad();
activeProductId = 20;
```

Callback đọc binding `activeProductId` tại thời điểm nó chạy, sau khi dòng cuối đã gán lại, nên tải product `20` thay vì `10`. Nếu yêu cầu nghiệp vụ là tải đúng product đang active tại thời điểm gọi `scheduleLoad`, tạo snapshot ngay trong function đó:

```ts
function scheduleLoad(): void {
  const requestedProductId = activeProductId;

  setTimeout(() => {
    loadProduct(requestedProductId);
  }, 1000);
}
```

## Thực hành

1. Với đoạn code sau, xác định scope chứa `price`, `discount` và `taxRate`, và mô tả thứ tự runtime tìm từng binding qua scope chain:

   ```ts
   const taxRate = 0.1;

   function createCalculator(discount: number) {
     return function calculate(price: number): number {
       const subtotal = price * (1 - discount);
       return subtotal + subtotal * taxRate;
     };
   }

   const calculateMemberPrice = createCalculator(0.05);
   console.log(calculateMemberPrice(200_000));
   ```

2. Giải thích vì sao `increase` và `read` bên dưới truy cập cùng một binding `value`, còn hai instance khác nhau của `createStore` thì không:

   ```ts
   function createStore() {
     let value = 0;

     return {
       increase: () => (value += 1),
       read: () => value,
     };
   }
   ```

3. Sửa đoạn code sau để mỗi callback nhận đúng index của button đã click, và giải thích bản sửa dựa trên số lượng binding được tạo ra:

   ```ts
   function bindButtons(buttons: HTMLButtonElement[]): void {
     for (var index = 0; index < buttons.length; index += 1) {
       buttons[index].addEventListener('click', () => {
         console.log(index);
       });
     }
   }
   ```

4. Tự viết lại `debounce` ở phần "Dùng closure để đóng gói state" nhưng thêm khả năng hủy chủ động (`cancel()`), không dùng thêm biến toàn cục nào ngoài closure hiện có.

5. Tạo một service Angular đăng ký `window` resize listener bằng một closure giữ tham chiếu tới dữ liệu component. Chứng minh bằng heap snapshot rằng dữ liệu đó vẫn còn reachable sau khi component bị destroy nếu thiếu cleanup, rồi sửa bằng cách trả về function huỷ đăng ký.

## Tổng kết

- Mỗi function call tạo một execution context riêng; creation phase thiết lập scope trước khi execution phase chạy code.
- Call stack theo dõi thứ tự các execution context đang hoạt động, theo nguyên tắc LIFO.
- Lexical scope xác định quyền truy cập biến theo vị trí khai báo, không theo vị trí gọi; scope chain tìm binding từ scope hiện tại ra scope bên ngoài.
- `let`/`const` có block scope; `var` có function scope — khác biệt này là gốc rễ của nhiều lỗi hoisting và lỗi callback trong vòng lặp.
- Hoisting là cách creation phase khởi tạo từng loại khai báo khác nhau, không phải việc di chuyển code lên đầu file.
- Closure cho phép function tiếp tục truy cập lexical environment nơi nó được tạo, kể cả sau khi execution context đó đã kết thúc — và nó giữ binding, không sao chép giá trị.
- Closure vừa giải thích hành vi callback "vô tình" giữ biến ngoài, vừa là công cụ chủ động để đóng gói private state (debounce, once, validator, interceptor).
- Một callback đọc giá trị hiện tại của binding tại thời điểm nó chạy; cần snapshot chủ động khi nghiệp vụ yêu cầu giá trị tại thời điểm đăng ký.
- Listener, timer hoặc subscription giữ callback sống lâu hơn dự kiến là nguyên nhân thực sự của memory leak liên quan đến closure, không phải bản thân closure.
