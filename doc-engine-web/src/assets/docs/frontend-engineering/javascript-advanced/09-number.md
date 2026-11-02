# Number

`Number` là kiểu dữ liệu nguyên thủy đại diện cho giá trị số trong JavaScript.

**Nguyên thủy** (primitive) nghĩa là bản thân giá trị được dùng trực tiếp trong tính toán, không nằm bên trong một object nào để chứa nó.

JavaScript không chia các giá trị số thông thường thành những kiểu riêng như `int`, `float` hoặc `double`.

`3` là số nguyên vì không có phần thập phân; `0.15` có phần thập phân — nhưng đó là cách phân loại trong toán học.

Ở JavaScript, cả hai vẫn chỉ thuộc một kiểu dữ liệu duy nhất là `Number`.

| Giá trị | Dạng giá trị | Kiểu dữ liệu JavaScript |
| --- | --- | --- |
| `3` | Số nguyên | `Number` |
| `0.15` | Số có phần thập phân | `Number` |
| `-125000.5` | Số âm có phần thập phân | `Number` |

Operator `typeof` trả về tên kiểu ở dạng chuỗi chữ thường. Vì vậy, cả số nguyên và số có phần thập phân đều trả về `"number"`:

```js
typeof 3;
// "number"

typeof 0.15;
// "number"
```

`Number` không lưu thêm một nhãn cho biết giá trị ban đầu được viết dưới dạng “integer” hay “decimal”. Sau khi được tạo, JavaScript chỉ xử lý nó như một giá trị thuộc kiểu `Number`.

Mô hình này dẫn đến ba vấn đề cần xử lý rõ ràng:

- chuỗi nhận từ form hoặc API chưa tự động là số;
- không phải mọi số thập phân đều được lưu chính xác;
- số nguyên quá lớn có thể mất chữ số dù code không báo lỗi.

## Cách Number lưu giá trị

JavaScript dùng 64 bit để lưu một giá trị `Number`. Các bit này không được chia thành một vùng cố định cho phần nguyên và một vùng cố định cho phần thập phân. Thay vào đó, chúng lưu dấu, độ lớn và các chữ số có nghĩa của giá trị.

Cách biểu diễn này được gọi là **floating-point 64-bit**. Trong tài liệu kỹ thuật, cùng định dạng này còn được gọi là **double precision** hoặc **IEEE 754 binary64**. Phần bit xác định độ lớn có thể thay đổi, nhờ đó định dạng này lưu được cả số rất nhỏ và số rất lớn — cơ chế cụ thể được trình bày ở phần [Floating-point precision](#floating-point-precision).

Kiểu `Number` gồm các nhóm giá trị sau:

| Nhóm | Ví dụ | Ý nghĩa |
| --- | --- | --- |
| Số hữu hạn | `10`, `-2.5` | Giá trị có độ lớn hữu hạn |
| Vô cực | `Infinity`, `-Infinity` | Kết quả vượt giới hạn hoặc một số khác `0` được chia cho `0` |
| Không phải kết quả số hợp lệ | `NaN` | Phép chuyển đổi hoặc phép toán không tạo được một số có nghĩa |
| Zero có dấu | `0`, `-0` | Hai representation của zero trong floating-point |

`NaN` và `Infinity` vẫn thuộc kiểu `number`:

```js
typeof NaN;
// "number"

typeof Infinity;
// "number"
```

`typeof value === 'number'` chỉ trả lời một câu hỏi: `value` có thuộc kiểu `number` hay không. Vì `NaN` và `Infinity` cũng thuộc kiểu này, cả hai vẫn vượt qua điều kiện trên.

Trước khi tính toán, code còn phải kiểm tra giá trị có hữu hạn hay không. Tùy dữ liệu, bước validation có thể kiểm tra thêm số nguyên, giá trị nhỏ nhất hoặc giá trị lớn nhất.

### Zero có dấu

`0` và `-0` là hai representation khác nhau trong floating-point, nhưng hầu hết phép so sánh coi chúng là một:

```js
0 === -0;
// true

Object.is(0, -0);
// false
```

`-0` có thể xuất hiện âm thầm từ một phép tính, không chỉ khi gõ trực tiếp:

```js
const ketQua = 0 * -1;
// -0

1 / ketQua;
// -Infinity, khác với 1 / 0
```

`JSON.stringify(-0)` trả về `"0"`, nên `-0` không để lại dấu vết khi đi qua API. Khác biệt này hiếm khi ảnh hưởng logic nghiệp vụ thông thường, nhưng có thể làm sai lệch test hoặc thư viện memoization dùng `Object.is` để so sánh giá trị, vì `Object.is` phân biệt `0` và `-0` còn `===` thì không.

### Primitive và Object

**Number primitive** là chính giá trị số mà code dùng để tính toán, ví dụ `3` hay `12.5`.

Nó không phải một object.

Vì không phải object, primitive không mang định danh (identity) riêng: hai biến cùng giữ giá trị `3` sẽ luôn bằng nhau.

```js
const a = 3;
const b = 3;

a === b;
// true — so sánh giá trị, không có identity riêng để phân biệt
```

Nguyên nhân nằm ở nơi giá trị được lưu.

Primitive được lưu trực tiếp trên **stack**: mỗi biến giữ một bản sao riêng của giá trị, nên so sánh `a === b` chỉ là so sánh hai giá trị `3` giống hệt nhau. Đây là mô hình cài đặt phổ biến của các engine hiện nay, không phải yêu cầu bắt buộc trong đặc tả ECMAScript.

Object thì khác: nó được lưu trên **heap**, còn biến chỉ giữ một **reference** — con trỏ trỏ tới địa chỉ của object đó. Identity của một object chính là reference này.

Hai object tạo từ hai lời gọi khác nhau luôn nằm ở hai địa chỉ khác nhau, nên hai reference — và hai identity — không bao giờ bằng nhau dù nội dung giống hệt, như ví dụ bên dưới.

Thêm `new` trước `Number(value)` gọi `Number` ở chế độ constructor thay vì chế độ function. Kết quả là một object, không phải primitive, và object này lưu primitive bên trong nó. Tên gọi chính thức của object này là **wrapper object**, thường được gọi ngắn gọn là "Number object".

Vì là object, mỗi lần gọi constructor tạo ra một địa chỉ riêng trên heap, nên hai Number object chứa cùng giá trị vẫn có hai reference khác nhau:

```js
new Number(3) === new Number(3);
// false — hai object khác nhau, dù cùng chứa số 3 bên trong
```

| Đặc điểm | Number primitive | Number wrapper object |
| --- | --- | --- |
| Cách tạo | Numeric literal hoặc `Number(value)` | `new Number(value)` |
| Kết quả `typeof` | `"number"` | `"object"` |
| Dữ liệu được giữ | Giá trị số | Reference đến object chứa giá trị số |
| Zero khi chuyển sang boolean | `false` | `true` |
| So sánh bằng `===` | So sánh giá trị số | So sánh reference |
| Sử dụng trong dữ liệu ứng dụng | Có | Không nên |

#### Number() và new Number()

`Number(value)` là gọi `Number` ở chế độ function, không dùng `new`. Nó trả về một Number primitive:

```js
const soLuong = Number('3');

typeof soLuong;
// "number"
```

Quá trình xử lý:

```text
Chuỗi "3"
    ↓ Number() chuyển đổi
Number primitive 3
```

`new Number(value)` gọi `Number` như một **constructor** thay vì như function chuyển đổi. Nó thực hiện cùng logic chuyển đổi, sau đó đặt kết quả vào một object:

```js
const soLuongDangObject =
  new Number('3');

typeof soLuongDangObject;
// "object"
```

Quá trình xử lý có thêm bước tạo wrapper:

```text
Chuỗi "3"
    ↓ chuyển đổi
Number primitive 3
    ↓ đặt vào object
Number wrapper object
```

Từ khóa `new` không tạo ra một “số tốt hơn”. Nó thay đổi loại giá trị trả về từ primitive thành object.

#### Truthiness

Khi được dùng trong điều kiện, primitive `0` là falsy:

```js
Boolean(0);
// false
```

Mọi object đều truthy. Wrapper chứa `0` vẫn là một object nên kết quả khác:

```js
Boolean(new Number(0));
// true
```

Code kiểm tra `if (value)` vì thế có thể đi vào nhánh sai khi nhận wrapper object thay cho primitive.

#### Equality

Hai primitive so sánh bằng `===` cho kết quả `true` khi cùng giá trị, còn hai wrapper luôn khác nhau dù cùng chứa một số, đúng như ví dụ ở trên. Wrapper và primitive cũng thuộc hai kiểu khác nhau nên không bằng nhau, kể cả khi cùng biểu diễn một số:

```js
new Number(3) === 3;
// false
```

Method `valueOf()` đọc primitive đang nằm trong wrapper:

```js
const wrapped = new Number(3);

wrapped.valueOf();
// 3
```

Việc có thể lấy lại primitive không phải lý do để lưu wrapper trong state. Sử dụng primitive ngay từ đầu sẽ tránh các khác biệt về kiểu, truthiness và equality.

#### Method trên Number primitive

Primitive vẫn gọi được các method như `toFixed()`:

```js
const donGia = 12.5;
const nhanDonGia = donGia.toFixed(2);

nhanDonGia;
// "12.50"
```

Khi truy cập method, JavaScript tạm thời xử lý primitive như một Number wrapper để tìm method trên `Number.prototype`. Sau khi method chạy xong, `donGia` vẫn là primitive:

```js
typeof donGia;
// "number"
```

Cơ chế tạm thời này được gọi là **boxing**. Code không cần tự tạo wrapper bằng `new Number()`.

#### Number trong TypeScript

TypeScript phân biệt hai annotation:

```ts
let soLuong: number;
let soLuongDangObject: Number;
```

`number` mô tả Number primitive và là kiểu cần dùng cho field, parameter và return value thông thường. `Number` viết hoa mô tả wrapper object; tránh sử dụng kiểu này trong model và API contract.

## Numeric literal

Numeric literal là cú pháp viết trực tiếp một giá trị số trong source code.

| Cú pháp | Ý nghĩa |
| --- | --- |
| `1250` | Số thập phân |
| `12.5` | Số có phần thập phân |
| `1.25e3` | Ký pháp số mũ, tương đương `1250` |
| `0b1010` | Số nhị phân |
| `0o12` | Số bát phân |
| `0x0a` | Số thập lục phân |
| `1_000_000` | Numeric separator để source code dễ đọc |

Numeric separator `_` chỉ tồn tại trong source code. Nó không phải ký tự hợp lệ khi chuyển chuỗi bằng `Number()`.

```js
const requestTimeout = 30_000;
const permissionMask = 0b1010;
const colorChannel = 0xff;

Number('1_000');
// NaN
```

Không thêm `_` vào đầu, cuối hoặc hai bên dấu chấm thập phân. Separator cũng không thay đổi giá trị được lưu.

## Bitwise operator và giới hạn 32-bit

Literal nhị phân và thập lục phân ở trên thường xuất hiện cùng bitwise operator, khi một giá trị số được dùng để lưu nhiều cờ boolean trong cùng một biến — ví dụ một permission mask:

```js
const CAN_READ = 0b0001;
const CAN_WRITE = 0b0010;
const CAN_DELETE = 0b0100;

const permissionMask = CAN_READ | CAN_WRITE;

Boolean(permissionMask & CAN_WRITE);
// true

Boolean(permissionMask & CAN_DELETE);
// false
```

`|` gộp các bit lại (cấp thêm quyền); `&` kiểm tra một bit cụ thể có đang bật hay không (kiểm tra quyền).

| Operator | Ý nghĩa |
| --- | --- |
| `a & b` | AND theo từng bit |
| `a \| b` | OR theo từng bit |
| `a ^ b` | XOR theo từng bit |
| `~a` | Đảo tất cả các bit |
| `a << n` | Dịch trái `n` bit |
| `a >> n` | Dịch phải `n` bit, giữ dấu |
| `a >>> n` | Dịch phải `n` bit, không giữ dấu |

### Bitwise operator luôn chuyển value sang 32-bit integer

Trước khi tính toán, mọi bitwise operator chuyển operand từ `Number` 64-bit sang một 32-bit signed integer, thực hiện phép toán, rồi chuyển kết quả ngược lại thành `Number`. Với giá trị nằm ngoài khoảng đó, bước chuyển đổi này cắt bớt dữ liệu một cách âm thầm — không ném lỗi:

```js
2 ** 32 | 0;
// 0

(2 ** 31) | 0;
// -2147483648

3.9 | 0;
// 3
```

`colorChannel = 0xff` từ phần trên nằm trong khoảng an toàn của phép chuyển này, nhưng một giá trị như `Number.MAX_SAFE_INTEGER` thì không — kết quả bitwise trên nó không phản ánh đúng giá trị gốc. Vì lý do này, chỉ dùng bitwise operator cho dữ liệu đã biết chắc nằm trong khoảng 32-bit, như bitmask hoặc thao tác trên màu RGB (`colorChannel`), không dùng cho ID hay số tiền.

`value | 0` từng được dùng như một cách cắt phần thập phân nhanh, tương tự `Math.trunc(value)` với số dương nằm trong khoảng 32-bit. Cách viết này khó đọc hơn `Math.trunc()` và âm thầm sai với giá trị vượt khoảng 32-bit, nên ưu tiên `Math.trunc()` khi mục đích chỉ là bỏ phần thập phân.

## Xử lý dữ liệu số đầu vào

Ứng dụng không phải lúc nào cũng nhận được một giá trị thuộc kiểu `Number` và có thể đưa ngay vào phép tính.

Mỗi nguồn dữ liệu trả về một dạng giá trị khác nhau:

| Nguồn | Giá trị nhận được |
| --- | --- |
| `input.value` | Luôn là string |
| `URLSearchParams.get()` | String hoặc `null` |
| `localStorage.getItem()` | String hoặc `null` |
| API response | Phụ thuộc contract và dữ liệu thực tế |

Giá trị vừa đi vào ứng dụng và chưa được kiểm tra được gọi là **raw input**. Raw input cần đi qua các bước riêng biệt trước khi trở thành dữ liệu dùng cho tính toán:

| Bước | Mục đích | Ví dụ kết quả |
| --- | --- | --- |
| Kiểm tra dữ liệu thiếu | Phân biệt chưa nhập với giá trị zero | `''` trở thành trạng thái không có dữ liệu |
| Chuẩn hóa | Loại bỏ khác biệt không mang ý nghĩa | Bỏ khoảng trắng đầu và cuối |
| Chuyển đổi kiểu | Chuyển dữ liệu sang Number | `'125.5'` trở thành `125.5` |
| Kiểm tra giá trị số | Loại `NaN` và giá trị không hữu hạn | Chỉ giữ Number hữu hạn |
| Kiểm tra quy tắc dữ liệu | Áp dụng yêu cầu của trường dữ liệu | Số lượng phải là số nguyên dương |

**Conversion**, hay chuyển đổi kiểu, biến raw input thành một kiểu dữ liệu khác. Bước này không quyết định giá trị có phù hợp với trường dữ liệu hay không.

**Validation**, hay kiểm tra hợp lệ, đánh giá kết quả sau conversion. Một giá trị có thể chuyển thành Number thành công nhưng vẫn bị từ chối vì âm, có phần thập phân hoặc vượt giới hạn cho phép.

JavaScript cung cấp nhiều cú pháp conversion. Chúng khác nhau ở lượng nội dung được chấp nhận từ input:

| API | Cách đọc input | Trường hợp phù hợp |
| --- | --- | --- |
| `Number(value)` | Chuyển toàn bộ value | Toàn bộ input phải biểu diễn một số |
| `Number.parseInt(value, radix)` | Đọc phần số nguyên ở đầu chuỗi; `radix` xác định hệ cơ số | Contract cho phép lấy phần số nguyên ở đầu chuỗi |
| `Number.parseFloat(value)` | Đọc phần số thập phân ở đầu chuỗi | Contract cho phép lấy phần số ở đầu chuỗi |
| `+value` | Chuyển toàn bộ value như `Number()` | Expression ngắn đã có input tin cậy |

Việc chọn API chỉ quyết định raw input được đọc như thế nào. Kết quả của API vẫn phải đi qua bước kiểm tra giá trị số và quy tắc của trường dữ liệu.

### Number()

`Number(value)` chuyển toàn bộ `value` thành một số. Nếu toàn bộ nội dung không phù hợp với quy tắc chuyển đổi, kết quả là `NaN`.

| Input | Kết quả | Nguyên nhân |
| --- | --- | --- |
| `'42'` | `42` | Chuỗi chứa một số hoàn chỉnh |
| `' 42 '` | `42` | Khoảng trắng đầu và cuối được bỏ qua |
| `''` | `0` | Chuỗi rỗng được chuyển thành zero |
| `'12px'` | `NaN` | Chuỗi không phải một số hoàn chỉnh |
| `true` | `1` | Boolean được ánh xạ thành `1` hoặc `0` |
| `false` | `0` | Boolean được ánh xạ thành `1` hoặc `0` |
| `null` | `0` | Quy tắc chuyển đổi của `Number()` |
| `undefined` | `NaN` | Không có giá trị số tương ứng |

Các quy tắc như `Number('') === 0` và `Number(null) === 0` có thể biến dữ liệu bị thiếu thành một giá trị có vẻ hợp lệ. Vì vậy, trạng thái thiếu dữ liệu phải được kiểm tra trước conversion.

### parseInt() và parseFloat()

`parseInt()` và `parseFloat()` bắt đầu đọc từ ký tự đầu tiên của chuỗi. Chúng giữ phần ký tự liên tiếp tạo thành một số và dừng tại ký tự không còn thuộc cú pháp số.

| API | Cách đọc | Kết quả với `'12.5px'` |
| --- | --- | --- |
| `Number()` | Yêu cầu toàn bộ chuỗi hợp lệ | `NaN` |
| `parseInt()` | Đọc phần số nguyên ở đầu chuỗi | `12` |
| `parseFloat()` | Đọc phần số thập phân ở đầu chuỗi | `12.5` |

```js
Number('12.5px');
// NaN

Number.parseInt('12.5px', 10);
// 12

Number.parseFloat('12.5px');
// 12.5
```

Khác với `Number()`, hai parse method có thể chấp nhận một chuỗi chứa hậu tố. Chỉ dùng hành vi này khi contract cho phép bỏ qua phần còn lại của chuỗi.

Luôn truyền `radix` cho `Number.parseInt()` để thể hiện hệ cơ số:

```js
Number.parseInt('1010', 2);
// 10

Number.parseInt('1010', 10);
// 1010
```

Không dùng `parseInt()` như một cách làm tròn. Method này parse chuỗi, không mô tả quy tắc làm tròn số.

Chiều ngược lại — từ `Number` sang chuỗi ở một hệ cơ số khác — dùng `toString(radix)`:

```js
(255).toString(16);
// "ff"

(10).toString(2);
// "1010"
```

### Unary plus

Unary plus cũng thực hiện chuyển đổi sang number:

```js
const soLuong = +'12';
```

Kết quả giống `Number('12')`, nhưng ý định chuyển đổi khó nhận ra hơn khi nằm trong expression dài. `Number()` phù hợp hơn tại nơi ứng dụng tiếp nhận và kiểm tra dữ liệu.

## NaN

`NaN` là giá trị biểu thị một phép toán số không tạo được kết quả có nghĩa. Tên của nó là “Not-a-Number”, nhưng bản thân giá trị vẫn thuộc kiểu `number`.

Các nguồn phổ biến tạo ra `NaN`:

```js
Number('không phải số');
// NaN

0 / 0;
// NaN

Math.sqrt(-1);
// NaN
```

Phần lớn phép toán với `NaN` tiếp tục trả về `NaN`:

```js
const subtotal = Number('invalid');
const total = subtotal + 10;

total;
// NaN
```

Nếu chỉ kiểm tra ở cuối chuỗi tính toán, vị trí dữ liệu bắt đầu sai sẽ khó xác định. Validate tại boundary ngay sau bước conversion.

### Number.isNaN()

`NaN` là giá trị duy nhất không bằng chính nó:

```js
NaN === NaN;
// false
```

Sử dụng `Number.isNaN()` để kiểm tra trực tiếp:

```js
Number.isNaN(NaN);
// true

Number.isNaN('invalid');
// false
```

Global `isNaN()` thực hiện chuyển đổi trước khi kiểm tra:

```js
isNaN('invalid');
// true

isNaN('');
// false, vì Number('') là 0
```

Ưu tiên `Number.isNaN()` khi giá trị đã được chuyển sang `Number`. Dùng `Number.isFinite()` khi yêu cầu thực tế là “một số hữu hạn có thể tính toán”.

## Infinity và số hữu hạn

`Infinity` và `-Infinity` xuất hiện khi kết quả không còn hữu hạn:

```js
1 / 0;
// Infinity

-1 / 0;
// -Infinity
```

`Number.isFinite(value)` chỉ trả về `true` khi input đã là một `Number` hữu hạn. Method không tự chuyển chuỗi:

| Giá trị | `Number.isFinite()` |
| --- | --- |
| `125` | `true` |
| `NaN` | `false` |
| `Infinity` | `false` |
| `'125'` | `false` |

## Integer và safe integer

`Number.isInteger(value)` kiểm tra một giá trị có phần thập phân bằng zero:

```js
Number.isInteger(12);
// true

Number.isInteger(12.5);
// false
```

Floating-point 64-bit chỉ biểu diễn chính xác mọi integer trong khoảng từ `Number.MIN_SAFE_INTEGER` đến `Number.MAX_SAFE_INTEGER`.

```js
Number.MIN_SAFE_INTEGER;
// -9007199254740991

Number.MAX_SAFE_INTEGER;
// 9007199254740991
```

**Safe integer** là integer có thể được lưu chính xác và so sánh đúng với các integer liền kề.

Ngoài khoảng an toàn, hai integer khác nhau có thể trở thành cùng một `Number`:

```js
const first = 9_007_199_254_740_992;
const second = 9_007_199_254_740_993;

first === second;
// true
```

`Number.isSafeInteger()` kết hợp hai điều kiện: giá trị là integer và nằm trong khoảng an toàn.

```js
Number.isSafeInteger(1_000_000);
// true

Number.isSafeInteger(9_007_199_254_740_992);
// false
```

### ID từ API

ID thường không được cộng, trừ hoặc đo độ lớn. Nếu backend sử dụng integer 64-bit, giá trị có thể vượt giới hạn an toàn của JavaScript.

Contract an toàn là truyền ID dưới dạng chuỗi:

```json
{
  "donHangId": "9223372036854775807"
}
```

FE giữ `donHangId` là string để hiển thị, so sánh equality và gửi lại API. Chuyển ID này sang `Number` sẽ làm mất precision.

```js
Number('9223372036854775807');
// 9223372036854776000
```

## Kiểm tra dữ liệu số

Sau khi các trạng thái `NaN`, số hữu hạn và safe integer đã được xác định, pipeline ở phần đầu có thể được triển khai mà không trộn các trách nhiệm.

Function đầu tiên xử lý raw input bắt buộc:

```js
function parseRequiredNumber(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (normalized === '') {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}
```

Function thực hiện lần lượt ba bước:

1. Xác nhận raw input có kiểu string.
2. Chuẩn hóa và loại trạng thái rỗng.
3. Conversion bằng `Number()`, sau đó chỉ chấp nhận số hữu hạn.

| Input | Kết quả |
| --- | --- |
| `'125.5'` | `125.5` |
| `''` hoặc chỉ có khoảng trắng | `null` |
| `'125px'` | `null` |
| `'Infinity'` | `null` |

Kết quả vẫn chưa phải domain value vì function không biết field đang biểu diễn số lượng, tỷ lệ hay giá tiền.

Ví dụ, số lượng sản phẩm phải là safe integer dương và không vượt quá tồn kho:

```js
function parseQuantity(value, soLuongTon) {
  const soLuong = parseRequiredNumber(value);

  if (
    soLuong === null ||
    !Number.isSafeInteger(soLuong) ||
    soLuong <= 0 ||
    soLuong > soLuongTon
  ) {
    return null;
  }

  return soLuong;
}
```

`parseRequiredNumber()` xử lý kiểu dữ liệu và trạng thái số. `parseQuantity()` bổ sung quy tắc riêng của field `soLuong`. Việc tách hai function giúp conversion không bị gắn với một business rule cụ thể.

## BigInt

`BigInt` là kiểu dữ liệu dành cho integer có độ lớn vượt khoảng safe integer của `Number`. BigInt literal có hậu tố `n`:

```js
const soThuTuDonHang = 9_223_372_036_854_775_807n;

typeof soThuTuDonHang;
// "bigint"
```

`BigInt` chỉ biểu diễn integer. Không có giá trị BigInt thập phân.

```js
BigInt('9223372036854775807');
// 9223372036854775807n
```

Không trộn `Number` và `BigInt` trong arithmetic:

```js
1n + 1;
// TypeError
```

Phải chuyển đổi tường minh, đồng thời xác nhận việc chuyển đổi không làm mất dữ liệu:

```js
1n + BigInt(1);
// 2n
```

Phép chia BigInt loại bỏ phần dư:

```js
5n / 2n;
// 2n
```

### BigInt và JSON

`JSON.stringify()` không serialize BigInt theo mặc định:

```js
JSON.stringify({ donHangId: 123n });
// TypeError
```

Tại API boundary, chuyển giá trị thành string theo contract:

```js
const payload = {
  donHangId: soThuTuDonHang.toString(),
};
```

Không chuyển BigInt sang `Number` chỉ để gửi JSON nếu giá trị có thể vượt safe integer.

## Floating-point precision

Số thập phân được viết theo hệ cơ số 10, còn `Number` lưu phần fraction theo hệ cơ số 2. Một số phân số thập phân không có biểu diễn nhị phân hữu hạn, tương tự `1 / 3` không có biểu diễn thập phân hữu hạn.

`0.1` và `0.2` thuộc nhóm đó. Runtime lưu hai giá trị gần nhất có thể biểu diễn; sai số xuất hiện khi cộng:

```js
0.1 + 0.2;
// 0.30000000000000004

0.1 + 0.2 === 0.3;
// false
```

Đây không phải lỗi riêng của JavaScript. Nó là giới hạn của binary floating-point.

### Cấu trúc bit của floating-point 64-bit

64 bit của một giá trị `Number` không chia thành một vùng cố định cho phần nguyên và một vùng cố định cho phần thập phân. Thay vào đó, chúng lưu ba phần:

| Thành phần | Vai trò |
| --- | --- |
| Sign | Xác định số dương hoặc số âm |
| Exponent | Xác định độ lớn của số |
| Fraction | Lưu các chữ số có nghĩa trong hệ nhị phân |

Phần exponent quyết định độ lớn nên định dạng này lưu được cả số rất nhỏ và số rất lớn, nhưng số bit dành cho fraction là hữu hạn. Khi một giá trị thập phân — như `0.1` — không có representation nhị phân chính xác trong số bit đó, runtime lưu giá trị gần nhất có thể biểu diễn thay vì báo lỗi. Đó chính là nguồn gốc của kết quả `0.30000000000000004` ở trên.

Exponent cũng có giới hạn. Giá trị lớn nhất có thể biểu diễn là `Number.MAX_VALUE`; vượt qua giá trị này, kết quả không ném lỗi mà âm thầm trở thành `Infinity`:

```js
Number.MAX_VALUE;
// 1.7976931348623157e+308

Number.MAX_VALUE * 2;
// Infinity
```

Khác với overflow của kiểu integer có độ dài cố định trong nhiều ngôn ngữ khác — nơi giá trị "quay vòng" về số âm — overflow của `Number` chuyển thành `Infinity`, và mọi phép toán tiếp theo với `Infinity` tiếp tục cho ra `Infinity` hoặc `NaN`.

### So sánh với tolerance

**Tolerance** là độ lệch tối đa mà nghiệp vụ chấp nhận để coi hai kết quả là tương đương.

```js
function approximatelyEqual(
  left,
  right,
  absoluteTolerance,
  relativeTolerance,
) {
  const difference = Math.abs(left - right);
  const scale = Math.max(
    Math.abs(left),
    Math.abs(right),
  );

  return difference <= Math.max(
    absoluteTolerance,
    relativeTolerance * scale,
  );
}
```

Hai loại tolerance giải quyết hai phạm vi:

| Loại | Vai trò |
| --- | --- |
| Absolute tolerance | Ngưỡng tối thiểu phù hợp với đơn vị nghiệp vụ |
| Relative tolerance | Tăng ngưỡng theo độ lớn của hai số |

Ví dụ, cảm biến có độ chính xác đến `0.001` có thể dùng absolute tolerance tương ứng:

```js
approximatelyEqual(
  0.1 + 0.2,
  0.3,
  0.001,
  Number.EPSILON,
);
// true
```

`Number.EPSILON` là khoảng cách giữa `1` và số floating-point kế tiếp lớn hơn `1`. Nó không phải tolerance mặc định phù hợp cho mọi miền dữ liệu. Số càng lớn thì khoảng cách giữa các giá trị có thể biểu diễn càng lớn; input có precision thấp cũng cần tolerance theo precision thực tế.

Không dùng so sánh gần đúng cho ID, số lượng hoặc các integer bắt buộc phải khớp chính xác.

## Làm tròn

Chọn method làm tròn theo hướng mà nghiệp vụ yêu cầu.

| Method | Quy tắc |
| --- | --- |
| `Math.round(value)` | Làm tròn đến integer gần nhất; trường hợp đúng nửa đi về phía `+Infinity` |
| `Math.floor(value)` | Đi xuống `-Infinity` |
| `Math.ceil(value)` | Đi lên `+Infinity` |
| `Math.trunc(value)` | Bỏ phần thập phân, tiến về zero |

Sự khác nhau thể hiện rõ với số âm:

| Input | `round` | `floor` | `ceil` | `trunc` |
| --- | ---: | ---: | ---: | ---: |
| `2.7` | `3` | `2` | `3` | `2` |
| `-2.7` | `-3` | `-3` | `-2` | `-2` |
| `-2.5` | `-2` | `-3` | `-2` | `-2` |

`Math.floor()` không có nghĩa là “bỏ phần lẻ”. Với số âm, method này tạo giá trị nhỏ hơn. Sử dụng `Math.trunc()` khi yêu cầu là loại bỏ phần thập phân.

### Số chữ số thập phân

`toFixed(digits)` tạo chuỗi có đúng số chữ số sau dấu thập phân:

```js
const label = (12.5).toFixed(2);

label;
// "12.50"

typeof label;
// "string"
```

Method này phù hợp để tạo representation dạng chuỗi, không phải để bảo đảm arithmetic tài chính chính xác. Chuyển kết quả về `Number` sẽ làm mất các zero dùng để hiển thị:

```js
Number((12.5).toFixed(2));
// 12.5
```

`toPrecision()` giới hạn tổng số chữ số có nghĩa, không phải số chữ số sau dấu thập phân. Hai method phục vụ hai yêu cầu khác nhau.

## Giá trị tiền tệ

Tiền tệ có quy tắc precision và rounding do nghiệp vụ quy định. Không nên phân tán các phép `toFixed()` hoặc `Math.round()` trong component.

Một chiến lược phổ biến là lưu **minor unit** bằng integer. Minor unit là đơn vị nhỏ nhất mà hệ thống dùng để tính toán, chẳng hạn cent khi contract quy định hai chữ số thập phân.

```js
const donGiaTheoCent = 12_550;
const soLuong = 3;
const tamTinhTheoCent =
  donGiaTheoCent * soLuong;

tamTinhTheoCent;
// 37650
```

Phép tính integer tránh tích lũy sai số thập phân trong JavaScript. Tuy nhiên, số chữ số minor unit không giống nhau cho mọi currency và có thể phụ thuộc contract thanh toán. Không mặc định mọi tiền tệ đều có hai chữ số thập phân.

Khi BE hoặc database dùng decimal type, API cần thống nhất representation:

| Representation | Khi phù hợp |
| --- | --- |
| Integer minor unit | Contract biết rõ currency và số chữ số minor unit |
| Decimal string | Cần giữ nguyên precision qua JSON |
| JSON number | Chỉ khi precision và khoảng giá trị đã được chứng minh an toàn |

Nếu API trả decimal string, FE không nên chuyển sang `Number` trước một phép tính cần precision tuyệt đối. Phép tính đó cần decimal library phù hợp hoặc được thực hiện ở boundary sở hữu quy tắc tài chính.

## Arithmetic và coercion

**Coercion** là quá trình JavaScript tự chuyển một value từ kiểu dữ liệu này sang kiểu khác khi operator yêu cầu. Coercion diễn ra ngầm, khác với conversion tường minh bằng `Number()`.

Các operator số có thể tự chuyển operand. Riêng `+` vừa thực hiện phép cộng vừa nối chuỗi.

```js
'2';
// 2

'2' + 3;
// "23"

'2' - 3;
// -1
```

Trong expression đầu tiên, `+` là unary plus. Trong hai expression sau, `+` và `-` là binary operator. Binary `+` nối chuỗi khi một operand trở thành string; `-` chỉ thực hiện arithmetic nên chuyển chuỗi sang số.

Đây là nguyên nhân dữ liệu từ form tạo kết quả khác nhau:

```js
const soLuong = '2';

soLuong + 1;
// "21"

soLuong * 3;
// 6
```

Chuyển đổi và validate tại boundary trước khi đưa giá trị vào domain state:

```js
const soLuong = parseQuantity(
  formValue.soLuong,
  soLuongTon,
);

if (soLuong === null) {
  return;
}

const soLuongTiepTheo = soLuong + 1;
```

Không dựa vào coercion ngầm để sửa input. Khi conversion được đặt ở một nơi, phần còn lại của ứng dụng có thể giả định `soLuong` đã là một domain value hợp lệ.

### Remainder

Operator `%` trả về remainder sau phép chia. Kết quả mang dấu của số bị chia:

```js
5 % 2;
// 1

-5 % 2;
// -1
```

Vì vậy `%` không luôn tương đương modulo toán học cho số âm. Nếu cần kết quả trong khoảng từ `0` đến `divisor - 1`, chuẩn hóa:

```js
function modulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

modulo(-1, 12);
// 11
```

## Định dạng số

Giá trị dùng để tính toán và chuỗi dùng để hiển thị có hai trách nhiệm khác nhau. Domain state giữ number; UI tạo label theo locale và yêu cầu trình bày.

`Intl.NumberFormat` định dạng số theo locale:

```js
const soLuongFormatter =
  new Intl.NumberFormat('vi-VN');

soLuongFormatter.format(1250000);
// "1.250.000"
```

### Currency

Currency formatter cần cả locale và mã tiền tệ:

```js
const currencyFormatter =
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  });

currencyFormatter.format(1250000);
```

`locale` quyết định quy ước hiển thị; `currency` quyết định đơn vị và quy tắc số chữ số mặc định. Locale không tự suy ra currency nghiệp vụ.

```js
new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'VND',
}).format(1250000);
```

Đoạn code vẫn định dạng VND, nhưng theo quy ước trình bày của `en-US`.

### Percent

Với `style: 'percent'`, giá trị `1` biểu thị `100%`:

```js
const percentFormatter =
  new Intl.NumberFormat('vi-VN', {
    style: 'percent',
    maximumFractionDigits: 1,
  });

percentFormatter.format(0.125);
// "12,5%"
```

Contract cần xác định state lưu tỷ lệ dạng `0.125` hay phần trăm dạng `12.5`. Không trộn hai representation trong cùng ứng dụng.

### Chuỗi đã định dạng

Output của `Intl.NumberFormat` dành cho hiển thị. Chuỗi có thể chứa dấu phân cách, khoảng trắng đặc biệt hoặc ký tự điều khiển theo locale.

Không parse ngược label bằng `Number()`:

```js
Number('1.250.000');
// NaN
```

Giữ raw numeric value riêng với formatted label:

```js
const tongTien = 1_250_000;
const nhanTongTien =
  currencyFormatter.format(tongTien);
```

UI thay đổi locale chỉ cần tạo lại label; domain value không thay đổi.

## Number trong form

Giá trị của HTML input là string, kể cả khi input có `type="number"`:

```js
const input = document.querySelector(
  'input[type="number"]',
);

typeof input.value;
// "string"
```

`valueAsNumber` trả về `Number`, nhưng trả `NaN` khi input rỗng hoặc không thể chuyển đổi:

```js
const value = input.valueAsNumber;

if (!Number.isFinite(value)) {
  // Hiển thị validation error.
}
```

`min`, `max` và `step` hỗ trợ browser validation nhưng không thay thế domain validation. Dữ liệu vẫn cần được kiểm tra lại tại boundary nhận form và tại BE.

Trong Angular reactive forms, model có thể chứa `number`, `string`, `null` hoặc `NaN` tùy control và value accessor đang dùng. Không suy luận kiểu runtime chỉ từ generic type; kiểm tra contract của control và chuẩn hóa trước khi tạo request.

## Number tại API boundary

JSON chỉ có một cú pháp number và không mang metadata về integer width, decimal precision hoặc currency. FE và BE cần thống nhất ý nghĩa của từng field.

| Loại dữ liệu | Representation thường phù hợp |
| --- | --- |
| Số lượng trong safe range | JSON number |
| Tỷ lệ có tolerance rõ ràng | JSON number |
| ID 64-bit | String |
| Integer vượt safe range cần arithmetic | String, sau đó chuyển sang BigInt |
| Decimal cần giữ precision tuyệt đối | Decimal string hoặc contract chuyên biệt |
| Tiền theo minor unit | Integer kèm currency |

### Special values và JSON

JSON không có literal cho `NaN`, `Infinity` hoặc `-Infinity`. Khi stringify trong object hoặc array, JavaScript chuyển các giá trị này thành `null`:

```js
JSON.stringify({
  soTien: NaN,
  tyLe: Infinity,
});
// '{"soTien":null,"tyLe":null}'
```

Nếu `null` có ý nghĩa riêng trong API, lỗi số có thể bị che giấu. Validate bằng `Number.isFinite()` trước khi tạo payload.

```js
function assertFiniteNumber(value, fieldName) {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `${fieldName} must be a finite number`,
    );
  }
}
```

### Parse response

TypeScript annotation không validate JSON ở runtime:

```ts
interface SanPhamResponse {
  gia: number;
}
```

Nếu server trả `"gia": "125000"`, annotation không tự chuyển string thành number. Validate response tại API boundary hoặc mapper:

```ts
interface SanPham {
  gia: number;
}

function mapSanPhamResponse(
  response: unknown,
): SanPham {
  if (
    typeof response !== 'object' ||
    response === null ||
    !('gia' in response) ||
    typeof response.gia !== 'number' ||
    !Number.isFinite(response.gia)
  ) {
    throw new TypeError(
      'SanPham response has an invalid gia',
    );
  }

  return {
    gia: response.gia,
  };
}
```

Mapper ngăn dữ liệu chưa được kiểm chứng đi sâu vào component và state.

## Sắp xếp Number

`Array.prototype.sort()` mặc định so sánh representation dạng chuỗi:

```js
[2, 10, 3].sort();
// [10, 2, 3]
```

Truyền comparator số:

```js
[2, 10, 3].sort(
  (left, right) => left - right,
);
// [2, 3, 10]
```

Comparator phải trả về:

| Kết quả | Thứ tự |
| --- | --- |
| Số âm | `left` đứng trước `right` |
| Zero | Giữ hai phần tử ở cùng thứ tự so sánh |
| Số dương | `left` đứng sau `right` |

Collection chứa `NaN` cần được xử lý trước khi sort vì phép trừ với `NaN` không tạo ra thứ tự hợp lệ.

## Debug dữ liệu số

Khi UI hiển thị sai giá trị, kiểm tra representation tại từng boundary:

```js
function inspectNumber(value) {
  const converted = Number(value);

  return {
    rawValue: value,
    rawType: typeof value,
    converted,
    isNaN: Number.isNaN(converted),
    isFinite: Number.isFinite(converted),
    isInteger: Number.isInteger(converted),
    isSafeInteger:
      Number.isSafeInteger(converted),
  };
}
```

Các biểu hiện thường gặp:

| Biểu hiện | Nguyên nhân cần kiểm tra |
| --- | --- |
| `2 + 1` thành `"21"` | Input vẫn là string |
| Tổng tiền có nhiều chữ số lẻ | Floating-point precision |
| ID cuối chuỗi bị thay đổi | Integer vượt safe range |
| Giá trị rỗng thành `0` | Gọi `Number()` trước khi kiểm tra empty string hoặc `null` |
| API nhận `null` thay vì lỗi số | `NaN` hoặc `Infinity` đã đi qua `JSON.stringify()` |
| Danh sách xếp `10` trước `2` | Dùng `sort()` không có numeric comparator |
| Phần trăm lớn hơn dự kiến 100 lần | Nhầm tỷ lệ `0–1` với giá trị phần trăm `0–100` |

Quy trình kiểm tra:

1. Log raw value và `typeof` trước conversion.
2. Kiểm tra trạng thái rỗng trước khi gọi `Number()`.
3. Kiểm tra `Number.isFinite()` ngay sau conversion.
4. Áp dụng business validation cho integer, khoảng giá trị và precision.
5. Giữ domain value tách khỏi formatted label.
6. Kiểm tra representation trong request và response JSON.

## Tổng kết

- `Number` sử dụng floating-point 64-bit cho cả integer và số thập phân.
- `typeof value === 'number'` vẫn chấp nhận `NaN` và `Infinity`.
- Chuyển đổi, validation và formatting là ba bước có trách nhiệm khác nhau.
- `Number()` yêu cầu toàn bộ chuỗi hợp lệ; `parseInt()` và `parseFloat()` đọc numeric prefix.
- Kiểm tra dữ liệu tính toán bằng `Number.isFinite()`.
- Sử dụng `Number.isSafeInteger()` khi precision của integer có ý nghĩa.
- Dùng string hoặc BigInt cho integer vượt safe range; BigInt không được JSON serialize mặc định.
- Floating-point không biểu diễn chính xác mọi số thập phân; vượt quá `Number.MAX_VALUE` cho `Infinity` thay vì báo lỗi.
- `0` và `-0` so sánh bằng nhau với `===` nhưng khác nhau với `Object.is()`.
- Tolerance phải dựa trên độ lớn và precision của dữ liệu, không dùng `Number.EPSILON` một cách máy móc.
- Bitwise operator luôn chuyển operand sang 32-bit signed integer trước khi tính, nên chỉ dùng cho dữ liệu chắc chắn nằm trong khoảng đó (bitmask, màu RGB), không dùng cho ID hay số tiền.
- Chọn method làm tròn theo hướng nghiệp vụ; `toFixed()` trả về string.
- Tiền tệ cần contract về precision, rounding, currency và minor unit.
- Định dạng UI bằng `Intl.NumberFormat`; không parse ngược chuỗi đã định dạng.
- Validate Number tại form và API boundary trước khi đưa vào domain state.

## Tài liệu tham khảo

- [ECMAScript specification — Number value](https://tc39.es/ecma262/#sec-terms-and-definitions-number-value)
- [MDN — Number](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number)
- [MDN — Number.EPSILON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON)
- [MDN — BigInt](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt)
- [MDN — Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
