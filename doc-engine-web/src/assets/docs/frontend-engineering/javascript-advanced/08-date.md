# Date

`Date` là object có sẵn trong JavaScript để biểu diễn một thời điểm. Bên trong object không lưu riêng năm, tháng, ngày hoặc múi giờ. Nó lưu một số duy nhất: số millisecond tính từ `1970-01-01T00:00:00.000Z`.

Số này được gọi là **timestamp**.

```js
const createdAt = new Date('2026-07-26T08:30:00.000Z');

console.log(createdAt.getTime());
// 1785054600000
```

Một timestamp xác định một thời điểm duy nhất. Các giá trị như `15:30` tại Việt Nam hoặc `08:30` theo UTC chỉ là hai cách hiển thị cùng thời điểm đó.

## Date object và timestamp

Tạo một `Date` không làm thay đổi thời gian được lưu. Các method local và UTC chỉ diễn giải cùng timestamp theo hai cách khác nhau.

```js
const date = new Date(0);

console.log(date.getTime());
// 0

console.log(date.toISOString());
// "1970-01-01T00:00:00.000Z"
```

Ký tự `Z` ở cuối chuỗi ISO biểu thị UTC.

## Date constructor

`Date constructor` tạo một `Date` object từ dữ liệu đầu vào. Dạng dữ liệu được truyền vào quyết định cách JavaScript tìm ra timestamp sẽ lưu trong object.

Constructor hỗ trợ bốn dạng cú pháp:

| Cú pháp | Dữ liệu đầu vào | Cách diễn giải |
| --- | --- | --- |
| `new Date()` | Không có | Thời điểm hiện tại của đồng hồ hệ thống |
| `new Date(timestamp)` | Một số | Số millisecond tính từ Unix epoch |
| `new Date(dateString)` | Một chuỗi | Chuỗi được parse theo quy tắc date-time |
| `new Date(year, monthIndex, ...)` | Từ hai số trở lên | Ngày giờ theo múi giờ đang được cấu hình trên thiết bị |

Kết quả của cả bốn dạng đều là một `Date` chứa timestamp. Điểm khác nhau nằm ở cách timestamp được xác định:

- Không có dữ liệu đầu vào: JavaScript đọc đồng hồ hệ thống.
- Có timestamp: JavaScript dùng trực tiếp con số được cung cấp.
- Có chuỗi: JavaScript đọc các phần ngày giờ và thông tin múi giờ có trong chuỗi.
- Có các thành phần số: JavaScript ghép chúng thành ngày giờ trên đồng hồ của thiết bị, sau đó dùng múi giờ của thiết bị để chuyển ngày giờ đó thành timestamp.

**Múi giờ của thiết bị** là cấu hình mà hệ điều hành cung cấp cho runtime, chẳng hạn `Asia/Ho_Chi_Minh`. Vì vậy, cùng một nhóm thành phần số có thể tạo ra hai timestamp khác nhau khi code chạy trên hai thiết bị được cấu hình múi giờ khác nhau.

### Parameter reference

Cú pháp đầy đủ của dạng nhận các thành phần ngày giờ:

```js
new Date(
  year,
  monthIndex,
  date,
  hours,
  minutes,
  seconds,
  milliseconds,
)
```

Các tên như `year`, `monthIndex` và `date` là parameter của constructor. Khi gọi constructor, giá trị cụ thể được truyền vào từng vị trí là argument tương ứng. Vì đây là positional parameters, thứ tự của chúng quyết định ý nghĩa của mỗi giá trị.

| Parameter | Phạm vi thường dùng | Giá trị mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| `year` | Số nguyên, chẳng hạn `2026` | Bắt buộc | Năm theo lịch local |
| `monthIndex` | `0`–`11` | Bắt buộc | Chỉ số tháng; `0` là tháng 1 và `11` là tháng 12 |
| `date` | `1`–`31` | `1` | Ngày trong tháng |
| `hours` | `0`–`23` | `0` | Giờ trong ngày |
| `minutes` | `0`–`59` | `0` | Phút |
| `seconds` | `0`–`59` | `0` | Giây |
| `milliseconds` | `0`–`999` | `0` | Phần millisecond của giây |

`monthIndex` là chỉ số bắt đầu từ `0`, không phải số tháng thường hiển thị cho người dùng:

| Giá trị `monthIndex` | Tháng |
| --- | --- |
| `0` | Tháng 1 |
| `1` | Tháng 2 |
| `6` | Tháng 7 |
| `11` | Tháng 12 |

Các parameter từ `date` trở đi là tùy chọn. Khi bỏ qua, constructor sử dụng giá trị mặc định trong bảng. Không được chỉ truyền `year`: một đối số dạng số luôn được hiểu là timestamp, không phải năm.

JavaScript tự cân bằng parameter nằm ngoài phạm vi thông thường. Ví dụ, `monthIndex` bằng `12` chuyển sang tháng 1 của năm tiếp theo. Hành vi này hữu ích cho date arithmetic nhưng không thay thế bước validation dữ liệu người dùng.

Giá trị `year` từ `0` đến `99` được ánh xạ thành các năm `1900` đến `1999`. Với dữ liệu có thể thuộc khoảng này, cần tránh dựa trực tiếp vào numeric component constructor.

### Quy tắc xác định timestamp

Mọi `Date` object đều lưu timestamp. Constructor chỉ khác nhau ở cách tìm ra timestamp đó.

| Input | Cách JavaScript xác định timestamp | Phụ thuộc múi giờ thiết bị |
| --- | --- | --- |
| Không có input | Đọc thời điểm hiện tại từ đồng hồ hệ thống | Không |
| `timestamp` | Dùng trực tiếp số millisecond được truyền vào | Không |
| `dateString` có múi giờ | Đọc ngày giờ và múi giờ từ chuỗi, sau đó quy đổi thành timestamp | Không |
| `dateString` không có múi giờ | Coi ngày giờ trong chuỗi là giờ trên thiết bị, sau đó quy đổi thành timestamp | Có |
| `year, monthIndex, ...` | Ghép các parameter thành ngày giờ trên thiết bị, sau đó quy đổi thành timestamp | Có |

Hai bước xử lý của dạng nhận các thành phần số:

```text
year, monthIndex, date, hours, ...
                    ↓
        Ngày giờ trên thiết bị
                    ↓ áp dụng múi giờ thiết bị
                timestamp
```

Constructor không lưu các parameter này như những field riêng. Sau khi quy đổi xong, object chỉ giữ timestamp. Vì vậy, múi giờ thiết bị chỉ tham gia lúc tạo timestamp từ ngày giờ chưa có múi giờ; nó không làm thay đổi một timestamp đã xác định.

Quy tắc parse từng loại chuỗi được trình bày riêng trong phần [Parsing](#parsing).

### Ví dụ

Thời điểm hiện tại có thể được lấy dưới dạng object hoặc timestamp, tùy thao tác tiếp theo:

```js
const now = new Date();
const currentTimestamp = Date.now();
```

Sử dụng `Date.now()` để đo hoặc so sánh thời gian. Sử dụng `new Date()` khi cần gọi method đọc thành phần ngày giờ hoặc định dạng kết quả.

Một timestamp đã lưu có thể được chuyển lại thành `Date` mà không thay đổi thời điểm:

```js
const timestamp = 1785054600000;
const createdAt = new Date(timestamp);
```

Khi dữ liệu đầu vào là `26/07/2026 15:30` trên đồng hồ của người dùng, các thành phần cần được đặt tên trước khi truyền vào constructor:

```js
const year = 2026;
const monthIndex = 6;
const date = 26;
const hours = 15;
const minutes = 30;

const localDate = new Date(
  year,
  monthIndex,
  date,
  hours,
  minutes,
);
```

`localDate` biểu diễn `15:30 ngày 26/07/2026` theo múi giờ của thiết bị chạy code. Cùng đoạn code có thể tạo timestamp khác nhau tại Việt Nam và New York vì hai thiết bị sử dụng local time khác nhau.

## Múi giờ, local time và UTC

Múi giờ mô tả quy tắc dùng để chuyển một thời điểm trên timeline thành ngày giờ trên đồng hồ tại một khu vực. Quy tắc này có thể bao gồm offset hiện tại, lịch sử thay đổi offset và daylight saving time.

Múi giờ không đồng nghĩa với quốc gia. Một quốc gia có thể có nhiều múi giờ, và nhiều quốc gia có thể dùng cùng một offset.

### UTC

UTC là chuẩn thời gian được dùng làm mốc chung. UTC không thay đổi theo mùa và không phụ thuộc vị trí thiết bị.

```text
2026-07-26T08:30:00.000Z
```

Trong chuỗi ISO trên, `08:30` là thời gian theo UTC.

### Ký hiệu Z

`Z` ở cuối chuỗi ISO có nghĩa offset bằng `+00:00`. Nó còn được đọc là Zulu time.

Hai chuỗi sau tương đương:

```text
2026-07-26T08:30:00.000Z
2026-07-26T08:30:00.000+00:00
```

`Z` không có nghĩa là “giờ local”. Nó xác nhận phần ngày giờ đứng trước đang sử dụng UTC.

### UTC offset

UTC offset là độ chênh giữa giờ địa phương và UTC tại một thời điểm. Offset có dạng `+HH:mm` hoặc `-HH:mm`.

```text
2026-07-26T15:30:00.000+07:00
```

`+07:00` có nghĩa giờ địa phương đi trước UTC 7 giờ:

```text
15:30 tại UTC+7
      ↓ trừ 7 giờ
08:30 tại UTC
```

Vì vậy hai chuỗi sau biểu diễn cùng một instant:

```text
2026-07-26T15:30:00.000+07:00
2026-07-26T08:30:00.000Z
```

Với offset âm, giờ địa phương đi sau UTC:

```text
2026-07-26T03:30:00.000-05:00
2026-07-26T08:30:00.000Z
```

Offset chỉ là độ chênh tại một thời điểm. Nó không chứa toàn bộ quy tắc của một múi giờ.

### IANA time zone

IANA time zone là identifier đại diện cho quy tắc thời gian của một khu vực:

```text
Asia/Ho_Chi_Minh
Asia/Tokyo
Europe/Paris
America/New_York
```

`Asia/Ho_Chi_Minh` hiện sử dụng UTC+7, nhưng hai giá trị có ý nghĩa khác nhau:

- `+07:00` chỉ cho biết offset;
- `Asia/Ho_Chi_Minh` cho biết khu vực và cho phép runtime tra quy tắc thời gian tương ứng.

Không dùng abbreviation như `CST` làm identifier nghiệp vụ. `CST` có thể được hiểu là nhiều múi giờ khác nhau tùy ngữ cảnh.

### Daylight saving time

Daylight saving time, viết tắt là DST, là cơ chế điều chỉnh đồng hồ theo mùa tại một số khu vực. Một IANA time zone có thể dùng offset khác nhau ở các thời điểm khác nhau trong năm.

Ví dụ `America/New_York` thường sử dụng:

- UTC-5 trong một phần của năm;
- UTC-4 trong thời gian áp dụng DST.

Không thể thay `America/New_York` bằng một offset cố định nếu logic phải hoạt động đúng quanh năm. Quy tắc múi giờ cũng có thể thay đổi theo quyết định của chính quyền, vì vậy hệ thống cần time-zone database được cập nhật.

### Local time

Local time là ngày giờ theo múi giờ mặc định của môi trường đang chạy code. Trong browser, giá trị này thường đến từ cấu hình hệ điều hành của người dùng.

Một `Date` không lưu múi giờ. Múi giờ local được lấy từ trình duyệt hoặc hệ điều hành khi đọc và định dạng timestamp.

```js
const date = new Date('2026-07-26T08:30:00.000Z');

console.log(date.toISOString());
// "2026-07-26T08:30:00.000Z"

console.log(date.getUTCHours());
// 8

console.log(date.getHours());
// Phụ thuộc múi giờ của thiết bị
```

Trên thiết bị sử dụng `Asia/Ho_Chi_Minh`, `getHours()` trả về `15`.

### Method local và UTC

Các method đọc thành phần ngày giờ được chia thành hai nhóm:

| Thành phần | Local time | UTC |
| --- | --- | --- |
| Năm | `getFullYear()` | `getUTCFullYear()` |
| Tháng | `getMonth()` | `getUTCMonth()` |
| Ngày trong tháng | `getDate()` | `getUTCDate()` |
| Thứ trong tuần | `getDay()` | `getUTCDay()` |
| Giờ | `getHours()` | `getUTCHours()` |
| Phút | `getMinutes()` | `getUTCMinutes()` |
| Giây | `getSeconds()` | `getUTCSeconds()` |

Không trộn method local và UTC trong cùng một phép tính:

```js
const year = date.getUTCFullYear();
const month = date.getMonth(); // local
```

Hai giá trị có thể thuộc hai ngày hoặc hai năm khác nhau tại thời điểm gần nửa đêm UTC.

#### Cùng một instant trên thiết bị Việt Nam và New York

Xét cùng một chuỗi có `Z`:

```js
const instant = new Date('2026-07-26T00:30:00.000Z');
```

Timestamp bên trong `instant` giống nhau trên mọi thiết bị:

```js
instant.getTime();
// 1785025800000
```

Các UTC method cũng trả về cùng kết quả:

```js
instant.getUTCFullYear(); // 2026
instant.getUTCMonth();    // 6 — tháng 7
instant.getUTCDate();     // 26
instant.getUTCHours();    // 0
instant.getUTCMinutes();  // 30
```

Local method phụ thuộc múi giờ mặc định của thiết bị:

| Method | Thiết bị ở Việt Nam, UTC+7 | Thiết bị ở New York, UTC-4 vào tháng 7 |
| --- | ---: | ---: |
| `getFullYear()` | `2026` | `2026` |
| `getMonth()` | `6` — tháng 7 | `6` — tháng 7 |
| `getDate()` | `26` | `25` |
| `getHours()` | `7` | `20` |
| `getMinutes()` | `30` | `30` |

Cùng instant `00:30Z` được hiển thị thành:

```text
Việt Nam:  07:30, ngày 26/07
New York: 20:30, ngày 25/07
```

Ngày local khác nhau vì New York còn ở ngày hôm trước. Đây là nguyên nhân một timestamp đúng nhưng UI tại hai quốc gia hiển thị khác ngày.

Có thể kiểm tra kết quả theo time zone cụ thể mà không thay đổi cấu hình thiết bị:

```js
function formatInTimeZone(date, timeZone, locale) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(date);
}

formatInTimeZone(
  instant,
  'Asia/Ho_Chi_Minh',
  'vi-VN',
);
// "07:30 26/07/2026"

formatInTimeZone(
  instant,
  'America/New_York',
  'en-US',
);
// "07/25/2026, 20:30"
```

`Intl.DateTimeFormat` nhận time zone tường minh; `getHours()` và các local method chỉ dùng time zone mặc định của runtime.

#### Cùng local time tại Việt Nam và New York

Hai người cùng chọn `09:00 ngày 26/07/2026` theo đồng hồ tại nơi họ sống. Hai giá trị local giống nhau nhưng biểu diễn hai instant khác nhau.

```js
const vietnamNineAm =
  new Date('2026-07-26T09:00:00+07:00');

const newYorkNineAm =
  new Date('2026-07-26T09:00:00-04:00');
```

Sau khi chuyển về UTC:

```js
vietnamNineAm.toISOString();
// "2026-07-26T02:00:00.000Z"

newYorkNineAm.toISOString();
// "2026-07-26T13:00:00.000Z"
```

Hai instant cách nhau 11 giờ:

```js
const differenceInHours =
  (newYorkNineAm.getTime() - vietnamNineAm.getTime()) /
  (60 * 60 * 1000);

console.log(differenceInHours);
// 11
```

Kết luận:

- cùng timestamp thì UTC method giống nhau, local method có thể khác;
- cùng local date-time tại hai múi giờ thì timestamp có thể khác;
- so sánh thời điểm bằng timestamp;
- hiển thị cho người dùng bằng time zone được chỉ định rõ.

### Timezone offset

`getTimezoneOffset()` trả về độ lệch giữa UTC và local time theo phút:

```js
const offsetInMinutes = date.getTimezoneOffset();
```

Dấu của kết quả thường gây nhầm lẫn. Tại múi giờ UTC+7, method trả về `-420`, không phải `420`.

Offset cũng có thể thay đổi theo ngày tại khu vực sử dụng daylight saving time. Không nên coi offset hiện tại là hằng số của một múi giờ.

## Chuỗi ISO 8601

JavaScript hỗ trợ ổn định định dạng date-time dạng ISO:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

Ví dụ:

```text
2026-07-26T08:30:00.000Z
2026-07-26T15:30:00.000+07:00
```

Hai chuỗi trên biểu diễn cùng một thời điểm.

`toISOString()` luôn trả về UTC:

```js
const date = new Date('2026-07-26T15:30:00+07:00');

console.log(date.toISOString());
// "2026-07-26T08:30:00.000Z"
```

Định dạng ISO có timezone offset phù hợp để truyền một thời điểm qua API.

### Phân tích chuỗi ISO

Đọc chuỗi từ trái sang phải:

```text
2026-07-26T15:30:00.000+07:00
│          │            └─ UTC offset
│          └─ thời gian trên đồng hồ
└─ ngày theo lịch
```

Chuỗi chứa `Z` hoặc offset xác định một instant. Chuỗi không có `Z`/offset chưa cho biết đầy đủ instant nếu không có quy ước về múi giờ.

### Dấu hiệu lỗi múi giờ

Độ lệch thường cho biết lớp lỗi cần kiểm tra:

| Biểu hiện | Nguyên nhân thường gặp |
| --- | --- |
| Lệch đúng 7 giờ | Nhầm UTC với UTC+7 hoặc thêm/bỏ `Z` |
| Lùi hoặc tiến một ngày | Instant đi qua nửa đêm khi đổi múi giờ |
| Chỉ lệch một giờ theo mùa | Dùng offset cố định tại vùng có DST |
| Chạy đúng trên máy cá nhân nhưng sai trên server | Parse chuỗi không có timezone bằng hai local time khác nhau |
| Thời gian bị đổi hai lần | BE đã quy đổi sang UTC nhưng FE tiếp tục cộng/trừ offset thủ công |

Quy trình kiểm tra:

1. Giữ nguyên chuỗi nhận từ API và xác định nó có `Z`/offset hay không.
2. Parse chuỗi rồi kiểm tra `getTime()` hoặc `toISOString()`.
3. Format cùng timestamp với `timeZone: 'UTC'` và time zone cần hiển thị.
4. Kiểm tra code có cộng hoặc trừ offset thủ công hay không.
5. Kiểm tra dữ liệu là instant hay chỉ là calendar date/local time.

```js
function inspectDateTime(value) {
  const date = new Date(value);

  return {
    input: value,
    timestamp: date.getTime(),
    utc: isValidDate(date) ? date.toISOString() : null,
    browserTimeZone:
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
```

Nếu `timestamp` giống nhau nhưng label khác nhau, lỗi nằm ở bước format hoặc time zone hiển thị. Nếu timestamp đã khác, lỗi xuất hiện từ parsing hoặc chuyển đổi trước đó.

## Parsing

Parsing là quá trình chuyển chuỗi thành timestamp hoặc `Date`.

```js
const date = new Date('2026-07-26T08:30:00.000Z');
const timestamp = Date.parse('2026-07-26T08:30:00.000Z');
```

`new Date(string)` trả về `Date`; `Date.parse(string)` trả về timestamp.

### Chuỗi có timezone

Chuỗi chứa `Z` hoặc offset xác định rõ một thời điểm:

```js
new Date('2026-07-26T08:30:00Z');
new Date('2026-07-26T15:30:00+07:00');
```

### Chuỗi không có timezone

Chuỗi date-time không có offset được hiểu theo local time:

```js
new Date('2026-07-26T15:30:00');
```

Kết quả phụ thuộc múi giờ của thiết bị.

Chuỗi chỉ có ngày theo định dạng `YYYY-MM-DD` được diễn giải là UTC:

```js
const date = new Date('2026-07-26');

console.log(date.toISOString());
// "2026-07-26T00:00:00.000Z"
```

Trên thiết bị ở múi giờ âm, hiển thị local có thể rơi vào ngày hôm trước. Vì vậy một ngày không kèm thời gian, chẳng hạn ngày sinh, không nên mặc định được mô hình hóa như một thời điểm UTC.

### Chuỗi không chuẩn

Không dựa vào các chuỗi như:

```js
new Date('26/07/2026');
new Date('07-26-2026');
new Date('July 26, 2026');
```

Cách diễn giải chuỗi không chuẩn có thể khác giữa browser và runtime. Dữ liệu máy đọc nên sử dụng ISO 8601 có timezone rõ ràng hoặc được tách thành các thành phần số và kiểm tra trước khi tạo `Date`.

## Invalid Date

Constructor vẫn trả về một object khi input không hợp lệ:

```js
const date = new Date('not-a-date');

console.log(date.toString());
// "Invalid Date"
```

Kiểm tra bằng timestamp:

```js
function isValidDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime());
}
```

Không kiểm tra bằng:

```js
date === 'Invalid Date';
```

`date` là object, không phải chuỗi.

JavaScript cũng có thể tự cân bằng thành phần vượt giới hạn:

```js
const date = new Date(2026, 1, 30);

console.log(date);
// Một ngày trong tháng 3, không phải ngày 30 tháng 2
```

Khi nhận ngày do người dùng nhập, cần kiểm tra lại năm, tháng và ngày sau khi tạo object thay vì chỉ kiểm tra `Invalid Date`.

## Đọc và thay đổi Date

`Date` là mutable object. Các setter thay đổi chính object hiện tại:

```js
const date = new Date('2026-07-26T08:30:00Z');
const sameReference = date;

date.setUTCDate(27);

console.log(sameReference.toISOString());
// "2026-07-27T08:30:00.000Z"
```

Tạo bản sao trước khi thay đổi nếu không muốn ảnh hưởng object ban đầu:

```js
function addUtcDays(date, amount) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}
```

Function trên trả về object mới:

```js
const start = new Date('2026-07-26T08:30:00Z');
const nextDay = addUtcDays(start, 1);

console.log(start.toISOString());
// "2026-07-26T08:30:00.000Z"

console.log(nextDay.toISOString());
// "2026-07-27T08:30:00.000Z"
```

## So sánh và sắp xếp

So sánh hai thời điểm bằng timestamp:

```js
const startsAt = new Date('2026-07-26T08:00:00Z');
const endsAt = new Date('2026-07-26T09:00:00Z');

console.log(startsAt.getTime() < endsAt.getTime());
// true
```

Phép trừ tự chuyển `Date` thành timestamp:

```js
const durationInMilliseconds = endsAt - startsAt;
```

Sử dụng `getTime()` khi muốn thể hiện rõ ý định:

```js
const durationInMilliseconds =
  endsAt.getTime() - startsAt.getTime();
```

Sắp xếp:

```js
orders.sort(
  (left, right) =>
    new Date(left.createdAt).getTime() -
    new Date(right.createdAt).getTime(),
);
```

Parse trước khi sort nếu collection lớn để tránh tạo lại `Date` trong mỗi lần comparator chạy.

## Formatting

Chuỗi dành cho máy và chuỗi dành cho người có mục đích khác nhau:

- API và persistence cần định dạng ổn định.
- UI cần ngôn ngữ, múi giờ và quy tắc hiển thị cụ thể.

### Dữ liệu cho API

```js
const payload = {
  createdAt: new Date().toISOString(),
};
```

`toISOString()` trả về UTC và có cấu trúc ổn định.

### Dữ liệu cho UI

Sử dụng `Intl.DateTimeFormat`:

```js
const formatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

formatter.format(new Date('2026-07-26T08:30:00Z'));
```

Khai báo `locale` và `timeZone` làm kết quả không phụ thuộc cấu hình thiết bị:

```js
const utcFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'full',
  timeStyle: 'long',
  timeZone: 'UTC',
});
```

Không tự ghép chuỗi `DD/MM/YYYY` nếu UI phải hỗ trợ nhiều locale.

## Ví dụ

Phần này áp dụng các cơ chế đã trình bày để xử lý những yêu cầu thường gặp.

### Hiển thị thời gian tạo đơn hàng

API trả về một instant dưới dạng ISO:

```js
const order = {
  createdAt: '2026-07-26T08:30:00.000Z',
};
```

UI parse chuỗi thành `Date`, sau đó format theo múi giờ cần hiển thị:

```js
const orderDateFormatter = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const createdAt = new Date(order.createdAt);

if (!isValidDate(createdAt)) {
  throw new Error('createdAt is invalid');
}

const label = orderDateFormatter.format(createdAt);
```

Chuỗi từ API, timestamp bên trong `Date` và label trên UI là ba representation của cùng một thời điểm.

### Tính thời gian còn lại

```js
function getRemainingMilliseconds(expiresAt, now = Date.now()) {
  const expirationTimestamp = new Date(expiresAt).getTime();

  if (Number.isNaN(expirationTimestamp)) {
    throw new TypeError('expiresAt must be a valid date');
  }

  return Math.max(0, expirationTimestamp - now);
}
```

Tham số `now` có giá trị mặc định là `Date.now()`, nhưng test có thể truyền một timestamp cố định:

```js
const now = Date.parse('2026-07-26T08:00:00Z');

getRemainingMilliseconds(
  '2026-07-26T08:05:00Z',
  now,
);
// 300000
```

### Kiểm tra ngày từ form

Input `type="date"` trả về chuỗi `YYYY-MM-DD`. Đây là một ngày theo lịch, chưa phải một thời điểm có timezone.

```js
function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  const isSameDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  return isSameDate ? { year, month, day } : null;
}
```

Kết quả giữ ba thành phần lịch thay vì trả về `Date`. Cách này tránh vô tình đổi ngày khi format ở múi giờ khác.

## Mô hình dữ liệu thời gian

Trước khi chọn API, xác định loại dữ liệu nghiệp vụ.

### Instant

Instant là một thời điểm duy nhất trên timeline:

- thời điểm tạo đơn;
- thời điểm request hết hạn;
- thời điểm giao dịch hoàn tất.

Biểu diễn bằng ISO có `Z`/offset hoặc timestamp.

```text
2026-07-26T08:30:00.000Z
```

### Calendar date

Calendar date chỉ gồm năm, tháng và ngày:

- ngày sinh;
- ngày nghỉ;
- ngày chốt sổ.

```text
2026-07-26
```

Calendar date không tự có múi giờ. Gắn UTC vào dữ liệu này có thể làm ngày bị dịch khi hiển thị.

### Wall-clock time

Wall-clock time mô tả giờ theo đồng hồ tại một địa điểm:

- phòng khám mở cửa lúc `08:00`;
- báo cáo chạy lúc `23:30` theo giờ Việt Nam.

Giá trị `08:00` chưa xác định một instant nếu không có ngày và múi giờ.

### Zoned date-time

Lịch họp lúc `09:00` tại `Asia/Tokyo` cần cả local date-time và time zone:

```text
2026-07-26T09:00:00
Asia/Tokyo
```

`Date` chỉ giữ instant sau khi quy đổi; nó không giữ identifier `Asia/Tokyo`. Nếu nghiệp vụ cần tính lại lịch theo quy tắc múi giờ, phải lưu time zone riêng.

## Boundary và serialization

Quy ước dữ liệu cần được xác định tại boundary giữa UI, API và database:

| Dữ liệu | Representation phù hợp |
| --- | --- |
| Instant | ISO 8601 có `Z` hoặc offset |
| Calendar date | `YYYY-MM-DD` |
| Local time | `HH:mm:ss` |
| Zoned schedule | Local date-time và IANA time zone |
| Duration kỹ thuật | Số millisecond hoặc đơn vị được ghi rõ |

Không sử dụng một chuỗi mơ hồ như `07/08/2026`. Chuỗi này có thể được hiểu là ngày 7 tháng 8 hoặc ngày 8 tháng 7.

Parse và validate tại boundary. Phần code bên trong ứng dụng nên nhận dữ liệu đã được chuẩn hóa.

## Ứng dụng đa quốc gia

Một hệ thống đặt lịch có người dùng tại Việt Nam, Nhật Bản, Pháp và Hoa Kỳ cần hiển thị cùng cuộc hẹn theo giờ của từng người.

API trả về instant chuẩn:

```json
{
  "appointmentId": "APT-1208",
  "startsAt": "2026-11-20T09:00:00.000Z"
}
```

FE không cộng hoặc trừ offset. FE parse instant rồi format theo time zone cần hiển thị:

```js
function formatAppointment(startsAt, timeZone, locale) {
  const date = new Date(startsAt);

  if (!isValidDate(date)) {
    throw new TypeError('startsAt must be a valid instant');
  }

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(date);
}
```

Cùng một `startsAt` có thể được hiển thị theo nhiều khu vực:

```js
const appointment = {
  startsAt: '2026-11-20T09:00:00.000Z',
};

formatAppointment(
  appointment.startsAt,
  'Asia/Ho_Chi_Minh',
  'vi-VN',
);

formatAppointment(
  appointment.startsAt,
  'Asia/Tokyo',
  'ja-JP',
);

formatAppointment(
  appointment.startsAt,
  'America/New_York',
  'en-US',
);
```

Timestamp không đổi. Chỉ representation trên UI thay đổi.

### Time zone mặc định trên FE

Browser cung cấp IANA time zone đang được cấu hình trên thiết bị:

```js
const browserTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone;
```

Có thể dùng giá trị này làm lựa chọn mặc định, nhưng không nên coi nó luôn là time zone nghiệp vụ. Người dùng có thể đang đi công tác, dùng VPN hoặc muốn xem lịch của một chi nhánh khác.

State hiển thị nên giữ time zone rõ ràng:

```js
const viewSettings = {
  locale: 'vi-VN',
  timeZone: 'Asia/Ho_Chi_Minh',
};
```

Mọi formatter trong màn hình dùng cùng `viewSettings.timeZone`. Cách này tránh một component dùng browser time zone trong khi component khác dùng time zone của chi nhánh.

### Tạo lịch theo time zone khác

Form tạo lịch có thể thu thập:

```js
const appointmentDraft = {
  localDate: '2026-11-20',
  localTime: '09:00',
  timeZone: 'America/New_York',
};
```

Ba giá trị này chưa phải instant. `09:00` tại New York cần được quy đổi bằng quy tắc của `America/New_York` vào đúng ngày đã chọn.

Constructor sau không đúng khi time zone được chọn khác time zone của thiết bị:

```js
new Date(2026, 10, 20, 9, 0);
```

Constructor luôn dùng local time zone của runtime. Nó không nhận `America/New_York`.

Với `Date` và `Intl.DateTimeFormat`, FE có thể format instant theo IANA time zone nhưng không có API thuận tiện để chuyển một local date-time tùy ý trong IANA time zone thành instant. Có hai hướng:

1. Gửi `localDate`, `localTime` và `timeZone` cho BE để quy đổi.
2. Dùng `Temporal.ZonedDateTime` hoặc một thư viện time-zone phù hợp trên FE, sau khi kiểm tra khả năng hỗ trợ của runtime.

Trong hệ thống có BE, hướng thứ nhất giữ quy tắc nghiệp vụ tại một nơi:

```json
{
  "localDate": "2026-11-20",
  "localTime": "09:00",
  "timeZone": "America/New_York"
}
```

BE trả về instant đã chuẩn hóa:

```json
{
  "startsAt": "2026-11-20T14:00:00.000Z",
  "timeZone": "America/New_York"
}
```

FE tiếp tục dùng `startsAt` để so sánh, đếm ngược và hiển thị. `timeZone` được giữ lại khi UI cần thể hiện múi giờ gốc của lịch.

### Phân chia trách nhiệm FE và BE

FE chịu trách nhiệm chính về:

- nhận calendar date, local time và time zone từ người dùng;
- hiển thị instant theo time zone đang được chọn;
- giữ một time zone nhất quán trong state của màn hình;
- không tự cộng hoặc trừ offset;
- gửi representation rõ nghĩa qua API.

BE chịu trách nhiệm ngắn gọn về:

- validate time zone và input;
- quy đổi zoned schedule thành instant;
- lưu instant chuẩn cùng IANA time zone khi nghiệp vụ cần;
- xử lý lịch lặp, DST, conflict và truy vấn giữa nhiều người dùng;
- trả ISO có `Z`/offset rõ ràng.

Lịch lặp cần giữ local time và IANA time zone, không chỉ giữ instant đầu tiên. Cuộc hẹn `09:00 America/New_York` phải tiếp tục diễn ra lúc 09:00 theo giờ New York khi offset thay đổi vì DST.

### Case JavaScript Date và C# DateTime

Một lỗi thường gặp xuất hiện khi FE và BE không thống nhất dữ liệu đang truyền là instant, local date-time hay calendar date.

Người dùng tại Việt Nam chọn `15:30`. FE chuyển local time thành ISO UTC:

```js
const startsAt = new Date(2026, 6, 26, 15, 30);

const payload = {
  startsAt: startsAt.toISOString(),
};

console.log(payload.startsAt);
// "2026-07-26T08:30:00.000Z"
```

`15:30` tại UTC+7 và `08:30Z` là cùng một instant. FE đã hoàn thành việc chuyển local time của thiết bị thành representation dùng cho API.

#### DTO nhận instant

Trong C#, `DateTime` có thuộc tính `Kind` với ba trạng thái:

| `DateTimeKind` | Ý nghĩa |
| --- | --- |
| `Utc` | Giá trị được hiểu là UTC |
| `Local` | Giá trị được hiểu theo local time zone của server |
| `Unspecified` | Giá trị không cho biết đang thuộc time zone nào |

`DateTimeOffset` chứa ngày giờ cùng UTC offset, nên thể hiện một instant rõ ràng hơn tại API boundary:

```csharp
public sealed record CreateAppointmentRequest(
    DateTimeOffset StartsAt
);
```

ASP.NET Core với `System.Text.Json` đọc được chuỗi ISO có `Z` hoặc offset:

```json
{
  "startsAt": "2026-07-26T08:30:00.000Z"
}
```

BE có thể chuẩn hóa về UTC trước khi lưu:

```csharp
DateTimeOffset startsAtUtc =
    request.StartsAt.ToUniversalTime();
```

Nếu FE gửi offset `+07:00`, instant vẫn không đổi:

```json
{
  "startsAt": "2026-07-26T15:30:00.000+07:00"
}
```

Hai request trên cùng quy về `2026-07-26T08:30:00.000+00:00`.

`DateTimeOffset` không lưu IANA time zone. Nếu nghiệp vụ cần `Asia/Ho_Chi_Minh` hoặc `America/New_York`, identifier đó vẫn phải là một field riêng.

#### Lỗi do chuỗi không có Z hoặc offset

FE lấy trực tiếp giá trị từ `datetime-local`:

```js
const payload = {
  startsAt: '2026-07-26T15:30:00',
};
```

Chuỗi này chỉ mô tả số trên đồng hồ. Nó không cho biết `15:30` thuộc UTC, UTC+7 hay time zone nào khác.

Nếu BE nhận bằng `DateTime`, giá trị có thể có `Kind = Unspecified`:

```csharp
public sealed record CreateAppointmentRequest(
    DateTime StartsAt
);
```

Đoạn code sau phụ thuộc local time zone của server:

```csharp
DateTime startsAtUtc =
    request.StartsAt.ToUniversalTime();
```

Với `Kind = Unspecified`, `ToUniversalTime()` diễn giải input như local time của server. Kết quả thay đổi theo nơi deploy:

```text
Server chạy UTC:
15:30 Unspecified → 15:30Z

Ý định của người dùng Việt Nam:
15:30 UTC+7 → 08:30Z
```

Kết quả lệch đúng 7 giờ dù cùng request.

Nếu input là local time của thiết bị, FE cần chuyển thành instant trước khi gửi:

```js
function localDateTimeToIso({
  year,
  month,
  day,
  hour,
  minute,
}) {
  const localDate = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
  );

  return localDate.toISOString();
}
```

Nếu form cho phép chọn một IANA time zone khác time zone của thiết bị, FE gửi `localDate`, `localTime` và `timeZone` riêng để BE quy đổi như case đa quốc gia phía trên.

#### Lỗi do mất DateTimeKind sau khi đọc database

Một instant có thể được lưu dưới dạng UTC nhưng khi đọc lại trở thành `DateTimeKind.Unspecified`. Nếu BE serialize giá trị này, JSON có thể không còn `Z`:

```json
{
  "startsAt": "2026-07-26T08:30:00"
}
```

FE parse chuỗi không có timezone như local time:

```js
const startsAt = new Date('2026-07-26T08:30:00');
```

Trên thiết bị UTC+7, timestamp mới tương ứng `01:30Z`, trong khi dữ liệu ban đầu là `08:30Z`. Instant đã bị đổi khi đi qua response boundary.

Giải pháp ưu tiên là giữ semantics của instant xuyên suốt persistence và API:

- dùng `DateTimeOffset` tại boundary cần giữ offset;
- hoặc bảo đảm mọi `DateTime` dùng cho instant có `Kind = Utc`;
- cấu hình kiểu dữ liệu và mapping database không làm mất thông tin cần thiết;
- response luôn có `Z` hoặc offset.

`DateTime.SpecifyKind` chỉ gắn nhãn `Kind`; method này không chuyển đổi thời gian:

```csharp
DateTime utc = DateTime.SpecifyKind(
    value,
    DateTimeKind.Utc
);
```

Chỉ dùng cách này khi contract bảo đảm các ticks trong `value` vốn đã là UTC. Nếu `value` thực sự là `15:30` theo giờ Việt Nam, gắn `Utc` sẽ biến nó thành `15:30Z` và tạo thêm một lỗi lệch 7 giờ.

#### Kiểm tra dữ liệu qua từng boundary

Log representation trước và sau mỗi lần chuyển:

**FE trước request**

```js
console.table({
  formValue,
  requestValue: payload.startsAt,
  requestTimestamp: new Date(payload.startsAt).getTime(),
  requestUtc: new Date(payload.startsAt).toISOString(),
});
```

**BE sau model binding**

Với `DateTimeOffset`:

```csharp
logger.LogInformation(
    "StartsAt={StartsAt:O}, Offset={Offset}",
    request.StartsAt,
    request.StartsAt.Offset
);
```

Với `DateTime`:

```csharp
logger.LogInformation(
    "StartsAt={StartsAt:O}, Kind={Kind}",
    request.StartsAt,
    request.StartsAt.Kind
);
```

Format `O` là round-trip format và giữ thông tin offset/`Kind` trong output.

Tiếp tục kiểm tra:

1. JSON thật trong Network tab.
2. Giá trị và `Kind`/offset sau model binding.
3. Giá trị được ghi xuống database.
4. Giá trị đọc lại từ database.
5. JSON response có `Z`/offset hay không.
6. `toISOString()` trên FE sau khi nhận response.

Boundary đầu tiên làm timestamp thay đổi là nơi cần sửa. Không bù sai lệch bằng cách cộng hoặc trừ 7 giờ ở FE.

## Date arithmetic

Hai phép tính có vẻ giống nhau nhưng mang nghĩa khác nhau:

- cộng `24 * 60 * 60 * 1000` millisecond;
- chuyển sang cùng giờ của ngày tiếp theo.

Tại khu vực có daylight saving time, một ngày trên lịch có thể dài 23 hoặc 25 giờ. Vì vậy hai phép tính có thể cho kết quả khác nhau.

```js
function addMilliseconds(date, amount) {
  return new Date(date.getTime() + amount);
}

function addLocalDays(date, amount) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + amount);
  return result;
}
```

Chọn phép tính theo ý nghĩa nghiệp vụ:

- timeout sau đúng 24 giờ dùng duration;
- lịch chạy cùng giờ ngày mai dùng calendar arithmetic theo timezone.

## Clock và testability

Code gọi `new Date()` hoặc `Date.now()` trực tiếp phụ thuộc đồng hồ hệ thống. Dependency này làm test khó kiểm soát.

Truyền clock vào logic:

```js
function createExpirationChecker(clock = () => Date.now()) {
  return function isExpired(expiresAt) {
    return new Date(expiresAt).getTime() <= clock();
  };
}
```

Production sử dụng clock mặc định:

```js
const isExpired = createExpirationChecker();
```

Test sử dụng thời gian cố định:

```js
const fixedNow = Date.parse('2026-07-26T08:00:00Z');
const isExpired = createExpirationChecker(() => fixedNow);

isExpired('2026-07-26T07:59:59Z'); // true
isExpired('2026-07-26T08:00:01Z'); // false
```

## Đo thời lượng

`Date.now()` phù hợp với thời gian lịch nhưng đồng hồ hệ thống có thể được điều chỉnh. Khi đo thời lượng ngắn trong browser, `performance.now()` phù hợp hơn vì sử dụng clock đơn điệu.

```js
const startedAt = performance.now();

runTask();

const duration = performance.now() - startedAt;
```

Sử dụng:

- `Date.now()` cho timestamp nghiệp vụ;
- `performance.now()` cho elapsed time và đo hiệu năng trong browser.

## Temporal

`Date` gộp nhiều khái niệm vào một mutable object và không lưu IANA time zone. `Temporal` cung cấp các kiểu riêng cho từng loại dữ liệu:

| Nhu cầu | Temporal type |
| --- | --- |
| Instant | `Temporal.Instant` |
| Calendar date | `Temporal.PlainDate` |
| Local date-time | `Temporal.PlainDateTime` |
| Zoned date-time | `Temporal.ZonedDateTime` |
| Duration | `Temporal.Duration` |

Temporal đã đạt Stage 4 trong quy trình TC39. Trước khi sử dụng trực tiếp, kiểm tra khả năng hỗ trợ của các runtime mục tiêu hoặc lựa chọn polyfill phù hợp.

Việc hiểu timestamp, UTC, calendar date và zoned date-time vẫn cần thiết khi sử dụng Temporal. API mới làm các mô hình này rõ ràng hơn, không loại bỏ nhu cầu phân loại dữ liệu.

## Những lỗi thường gặp

### Parse chuỗi theo định dạng hiển thị

```js
new Date('26/07/2026');
```

Chuỗi hiển thị không phải giao thức dữ liệu. Parse input bằng định dạng đã thỏa thuận.

### Nhầm month index

```js
new Date(2026, 7, 26);
```

Giá trị trên là tháng 8. Khi nhận tháng `1`–`12`, trừ `1` trước khi truyền vào constructor.

### Trộn local và UTC

```js
date.getFullYear();
date.getUTCMonth();
```

Chọn một hệ method phù hợp với phép tính.

### Mutate object dùng chung

```js
function tomorrow(date) {
  date.setDate(date.getDate() + 1);
  return date;
}
```

Function thay đổi input. Tạo bản sao nếu API không tuyên bố mutation.

### Lưu ngày sinh dưới dạng instant

Ngày sinh là calendar date. Chuyển thành UTC midnight có thể làm ngày hiển thị thay đổi theo timezone.

### Cố định timezone offset

```js
const vietnamTime = utcTime + 7 * 60 * 60 * 1000;
```

Cách này chỉ xử lý offset cố định và không thay thế time-zone rule. Sử dụng `Intl.DateTimeFormat` để hiển thị theo IANA time zone.

## Tổng kết

- `Date` lưu timestamp theo millisecond, không lưu timezone.
- Local method và UTC method diễn giải cùng một timestamp theo hai hệ khác nhau.
- `Z` tương đương offset `+00:00`; `+07:00` là offset, không phải identifier múi giờ.
- IANA time zone chứa quy tắc theo khu vực và có thể thay đổi offset theo thời điểm.
- Chuỗi ISO có `Z` hoặc offset phù hợp để truyền instant.
- Chuỗi ngày theo lịch không nên tự động được coi là UTC instant.
- `Date` là mutable; tạo bản sao trước khi thay đổi nếu cần giữ input.
- So sánh và sắp xếp bằng timestamp.
- Format UI bằng `Intl.DateTimeFormat`.
- Phân loại instant, calendar date, local time và zoned date-time trước khi thiết kế dữ liệu.
- Calendar arithmetic và duration arithmetic không phải lúc nào cũng tương đương.
- Tách clock khỏi business logic để test có kết quả ổn định.
- Sử dụng `performance.now()` khi đo elapsed time trong browser.
- FE format instant theo time zone rõ ràng; BE giữ conversion và scheduling nghiệp vụ nhất quán.
- Khi tích hợp C#, ưu tiên `DateTimeOffset` cho instant tại API boundary và theo dõi `DateTime.Kind` nếu dùng `DateTime`.

## Tài liệu tham khảo

- [MDN: Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)
- [MDN: Date.parse](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse)
- [MDN: Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [MDN: Intl.DateTimeFormat.resolvedOptions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/resolvedOptions)
- [MDN: Date.getTimezoneOffset](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset)
- [IANA: Time Zone Database](https://www.iana.org/time-zones)
- [Microsoft Learn: DateTime and DateTimeOffset in System.Text.Json](https://learn.microsoft.com/dotnet/standard/datetime/system-text-json-support)
- [Microsoft Learn: DateTime.Kind](https://learn.microsoft.com/dotnet/api/system.datetime.kind)
- [Microsoft Learn: DateTime.SpecifyKind](https://learn.microsoft.com/dotnet/api/system.datetime.specifykind)
- [TC39: ECMAScript Date Objects](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-objects)
- [TC39: Temporal](https://tc39.es/proposal-temporal/)
