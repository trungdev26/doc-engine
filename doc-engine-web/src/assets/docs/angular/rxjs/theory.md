# RxJS in Angular

> Designing Reactive Flows from Basic to Production-level Angular Applications

Tài liệu này dành cho Angular developer muốn đi từ mức **dùng được RxJS** đến mức **thiết kế được async flow trong production**. Trọng tâm không phải học thuộc operator, mà là hiểu bản chất stream, chọn operator theo nghiệp vụ, kiểm soát lifecycle, tránh race condition, xử lý error/loading/cache và tổ chức state dễ maintain.

Các ví dụ trong tài liệu dùng Angular hiện đại, RxJS 7+ và TypeScript.

---


## 1. Reactive Programming Mindset

### 1.1. RxJS giải quyết bài toán gì?

Frontend không chỉ xử lý một value cố định. Hầu hết dữ liệu trong UI đều **thay đổi theo thời gian**.

Ví dụ:

```text
- User click, input, scroll
- HTTP request
- Route params, query params
- Form valueChanges
- WebSocket / SignalR event
- Timer, polling
- Dialog result
- Store/state thay đổi
- Permission/user context thay đổi
```

RxJS giúp biểu diễn các nguồn dữ liệu này thành **stream**.

```text
Stream = chuỗi giá trị theo thời gian
```

Ví dụ search box:

```text
User gõ:   a ---- an ---- ang ---- angu
API gọi:                      search("angu")
UI nhận:                                      result
```

Thay vì viết imperative code kiểu:

```text
Khi user nhập thì setTimeout
Nếu nhập tiếp thì clearTimeout
Sau đó gọi API
Nếu API cũ về sau thì bỏ qua
Nếu lỗi thì hiện message
Nếu component destroy thì hủy subscription
```

Với RxJS, ta mô tả luồng:

```text
input value
-> debounce
-> bỏ value trùng
-> gọi API mới nhất
-> xử lý loading/error
-> render kết quả
```

### 1.2. Tư duy quan trọng

RxJS không phải là thư viện để gọi API. RxJS là cách mô hình hóa **dữ liệu theo thời gian**.

Một màn hình Angular có thể được nhìn như tập hợp các stream:

```text
User intent stream
+ URL state stream
+ Form state stream
+ Server state stream
+ UI state stream
=> ViewModel stream
=> Template
```

Ví dụ màn hình danh sách bệnh nhân:

```text
keyword$       -> user nhập từ khóa
status$        -> user chọn trạng thái
page$          -> user đổi trang
refresh$       -> user bấm tải lại
query$         -> gom keyword/status/page
patientsState$ -> gọi API và trả về loading/success/error
vm$            -> dữ liệu cuối cùng cho template
```

Điểm khác biệt giữa dùng RxJS ở mức cơ bản và mức production nằm ở đây:

```text
Cơ bản:
- Biết subscribe API
- Biết map/filter/debounce
- Biết dùng switchMap cho search

Production:
- Biết thiết kế data flow
- Biết request nào được quyền render
- Biết stream nào sống/chết lúc nào
- Biết cache lúc nào stale
- Biết error đặt ở đâu để UI không chết
- Biết khi nào dùng async pipe, khi nào subscribe thủ công
```

---

## 2. Observable Foundation

### 2.1. Observable là gì?

Observable là một object đại diện cho các giá trị sẽ được phát ra theo thời gian.

Điểm khác biệt so với một mảng `number[]` bình thường: mảng chứa sẵn toàn bộ giá trị, có ngay lập tức khi đọc.

```ts
const numbers = [1, 2, 3]; // có đủ 1, 2, 3 ngay khi dòng này chạy
```

Observable thì không chứa sẵn giá trị nào cả. Nó chỉ định nghĩa **khi nào** và **bằng cách nào** các giá trị 1, 2, 3 sẽ lần lượt được phát ra — có thể ngay lập tức, có thể sau vài giây (chờ HTTP response), có thể nhiều lần (mỗi lần user gõ phím), hoặc thậm chí không bao giờ nếu không ai subscribe.

```ts
const numbers$ = new Observable<number>(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.next(3);
  subscriber.complete();
});
```

Subscribe để nhận dữ liệu:

```ts
numbers$.subscribe({
  next: value => console.log(value),
  error: err => console.error(err),
  complete: () => console.log('done')
});
```

Kết quả:

```text
1
2
3
done
```

Observable dễ hiểu nhầm nhất ở điểm này, nên so sánh với thứ đã quen thuộc: khai báo một function.

```ts
function loadNumbers() {
  console.log('đang chạy');
  return [1, 2, 3];
}
```

Dòng code trên chỉ **định nghĩa** hàm `loadNumbers`. Nó chưa in ra `'đang chạy'`, chưa trả về gì cả. Phải đợi đến khi có ai đó gọi `loadNumbers()` thì phần thân hàm mới thực sự chạy.

Observable hoạt động theo đúng tinh thần đó:

```ts
const numbers$ = new Observable<number>(subscriber => {
  console.log('đang chạy');
  subscriber.next(1);
  subscriber.next(2);
  subscriber.next(3);
});
```

Dòng code này cũng chỉ **định nghĩa** cách phát dữ liệu, chưa chạy gì cả — giống hệt việc định nghĩa `loadNumbers` ở trên. Khác biệt duy nhất so với function thường:

```text
function thường:  gọi 1 lần -> trả về 1 giá trị (return), rồi kết thúc.
Observable:       gọi subscribe() -> có thể phát nhiều giá trị (next) theo thời gian.
```

Tóm lại có 3 điểm cần nhớ:

```text
1. new Observable(subscriber => {...}) chỉ là khai báo, tương tự khai báo một function.
   Bản thân dòng khai báo không làm gì cả.

2. Hàm subscriber => {...} truyền vào gọi là producer function.
   Đây là nơi thật sự phát ra dữ liệu (next/error/complete).

3. Producer function không tự chạy khi khai báo.
   Nó chỉ chạy khi có subscriber gọi subscribe() — giống việc gọi loadNumbers().
```

```ts
const numbers$ = new Observable<number>(subscriber => {
  console.log('producer function chạy');
  subscriber.next(1);
});

console.log('trước subscribe');
numbers$.subscribe(value => console.log('nhận', value));
console.log('sau subscribe');
```

Kết quả:

```text
trước subscribe
producer function chạy
nhận 1
sau subscribe
```

Tóm lại, cần nhớ 2 điều sau về Observable:

```text
Khai báo numbers$ chỉ là mô tả, chưa làm gì cả.
Không có subscriber -> producer function không bao giờ chạy.
Có subscriber gọi subscribe() -> producer function mới chạy.
Mỗi lần subscribe -> producer function chạy lại từ đầu (trừ khi stream được share, xem 2.5-2.7).
```

Đây là lý do vì sao trong Angular, chỉ khai báo `this.api.getPatients()` mà không subscribe thì sẽ không có request nào được gửi đi.

Một Observable có 3 loại tín hiệu, phát ra qua object `subscriber`:

```text
next(value)
-> phát giá trị

error(err)
-> stream lỗi và kết thúc

complete()
-> stream hoàn thành
```

Có thể hình dung theo timeline (marble diagram):

```text
next  next  next  complete
--1----2----3------|-->

next  next  error
--1----2------X-->
```

Một stream chỉ có thể kết thúc bằng một trong hai cách:

```text
complete hoặc error
```

Sau khi `complete` hoặc `error`, stream đó không emit thêm value nữa. Gọi `next` sau khi đã `complete`/`error` là vô nghĩa vì subscriber đã ngừng lắng nghe.

### 2.2. Quy ước đặt tên `$`

Trong Angular, biến Observable thường có hậu tố `$`.

```ts
patients$: Observable<Patient[]>;
loading$: Observable<boolean>;
keyword$: Observable<string>;
```

Quy ước này giúp đọc code nhanh:

```text
patients  -> giá trị hiện tại
patients$ -> stream phát ra patients theo thời gian
```

Không bắt buộc về mặt kỹ thuật, nhưng rất nên thống nhất trong team.

### 2.3. Observer

Observer là object nhận dữ liệu từ Observable, gồm 3 callback tương ứng với 3 tín hiệu ở mục 2.1.

```ts
const observer = {
  next: (value: number) => console.log(value),
  error: (err: unknown) => console.error(err),
  complete: () => console.log('complete')
};

numbers$.subscribe(observer);
```

`subscribe(observer)` làm 2 việc theo đúng thứ tự sau:

```text
1. Chạy producer function của Observable (phần subscriber => {...} ở mục 2.1).

2. Bên trong producer function, mỗi lần gọi subscriber.next/error/complete
   thì RxJS gọi ngược lại đúng hàm tương ứng trên observer:

   subscriber.next(value)     -> gọi observer.next(value)
   subscriber.error(err)      -> gọi observer.error(err)
   subscriber.complete()      -> gọi observer.complete()
```

Nói cách khác, `subscriber` và `observer` là hai đầu của cùng một đường ống: code bên trong Observable gọi `subscriber.next(...)`, còn code gọi `subscribe(observer)` nhận lại giá trị đó qua `observer.next(...)`.

Observer tuân theo một contract cố định, không phụ thuộc Observable cụ thể nào:

```text
next    -> có thể được gọi 0 hoặc nhiều lần
error   -> được gọi tối đa 1 lần; nếu gọi thì stream kết thúc, không còn next/complete nào sau đó
complete -> được gọi tối đa 1 lần; nếu gọi thì stream kết thúc, không còn next nào sau đó
error và complete không bao giờ cùng xảy ra trên một stream
```

Observer là **partial object**: cả 3 field đều không bắt buộc. Trong thực tế Angular, nhiều code chỉ truyền callback `next`:

```ts
this.api.getPatients().subscribe(patients => {
  this.patients = patients;
});
```

Cách viết này tương đương truyền một Observer chỉ có `next`, thiếu `error` và `complete`. Đây là chỗ dễ tạo bug âm thầm: nếu stream error mà không có `error` handler, RxJS không nuốt lỗi đó đi mà **throw ra ngoài như một uncaught exception**, không đi qua logic xử lý nào của component.

```ts
this.api.getPatients().subscribe(patients => {
  this.patients = patients;
});
```

```text
Nếu API trả lỗi:
-> không có patients nào được gán
-> lỗi bị throw ra console dưới dạng uncaught error
-> không có cách nào bắt lại lỗi này từ subscribe call trên
```

Vì vậy khi code production, nên nghĩ đủ 3 trạng thái mỗi khi subscribe thủ công:

```text
- Khi có data thì làm gì? (next)
- Khi lỗi thì làm gì? (error)
- Khi hoàn thành thì có cần cleanup không? (complete)
```

Lưu ý Observer khác Subscription: Observer mô tả **cách xử lý** next/error/complete, còn Subscription (xem 2.4) là **handle để hủy** việc lắng nghe đó.

### 2.4. Subscription

`subscribe()` trả về một `Subscription`.

```ts
const sub = interval(1000).subscribe(value => {
  console.log(value);
});

sub.unsubscribe();
```

`unsubscribe()` nghĩa là ngừng nhận dữ liệu và yêu cầu Observable cleanup resource nếu có.

Với stream không tự complete như `interval`, `fromEvent`, `valueChanges`, `route.paramMap`, WebSocket, nếu subscribe thủ công mà không unsubscribe thì dễ gây memory leak.

### 2.5. Cold Observable

Cold Observable chỉ bắt đầu chạy khi có subscriber.

```ts
const request$ = this.http.get('/api/patients');

request$.subscribe(); // gọi API lần 1
request$.subscribe(); // gọi API lần 2
```

Angular `HttpClient` Observable thường là cold. Mỗi subscribe có thể tạo một HTTP request mới.

Mental model:

```text
Cold Observable = mỗi subscriber có execution riêng
```

Ví dụ:

```ts
const random$ = new Observable<number>(subscriber => {
  subscriber.next(Math.random());
  subscriber.complete();
});

random$.subscribe(value => console.log('A', value));
random$.subscribe(value => console.log('B', value));
```

Mỗi subscriber có thể nhận một random khác nhau vì Observable chạy lại.

### 2.6. Hot Observable

Hot Observable chia sẻ cùng một nguồn phát.

Ví dụ:

```text
- DOM click event
- Form valueChanges
- Subject
- WebSocket
- SignalR connection
```

Mental model:

```text
Hot Observable = nhiều subscriber nghe cùng một nguồn
```

Ví dụ `fromEvent`:

```ts
const click$ = fromEvent(document, 'click');

click$.subscribe(() => console.log('A'));
click$.subscribe(() => console.log('B'));
```

Cả A và B cùng nghe một nguồn click trên document.

### 2.7. Unicast và Multicast

Cold Observable thường là unicast:

```text
Mỗi subscriber có execution riêng.
```

Hot Observable thường là multicast:

```text
Nhiều subscriber dùng chung execution/source.
```

Trong Angular, nhiều lỗi performance đến từ việc tưởng một stream đã được share nhưng thực tế mỗi nơi subscribe lại gọi API thêm một lần.

Ví dụ:

```ts
patients$ = this.api.getPatients();
```

Template:

```html
<app-header [count]="(patients$ | async)?.length"></app-header>
<app-table [patients]="patients$ | async"></app-table>
```

Nếu không cẩn thận, có thể tạo nhiều subscription vào HTTP Observable.

Giải pháp thường dùng:

```ts
patients$ = this.api.getPatients().pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);
```

---

## 3. Pipe và Operator

### 3.1. pipe là gì?

`pipe()` cho phép nối nhiều operator để biến đổi stream.

```ts
this.keyword$
  .pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(keyword => this.api.search(keyword))
  )
  .subscribe(result => {
    this.result = result;
  });
```

Đọc từ trên xuống:

```text
keyword
-> chờ user ngừng gõ 300ms
-> bỏ qua nếu giống value trước
-> gọi API search
-> nhận result
```

### 3.2. Operator là gì?

Operator là hàm nhận Observable đầu vào và trả về Observable mới.

```text
Observable<T>
-> operator
-> Observable<R>
```

Ví dụ:

```ts
const source$ = of(1, 2, 3);

const result$ = source$.pipe(
  map(x => x * 10)
);
```

`source$` không bị mutate. `result$` là Observable mới.

Quan trọng:

```text
pipe/operator chỉ mô tả pipeline.
Pipeline thường chưa chạy nếu chưa có subscribe.
```

### 3.3. Operator thinking

Không nên học RxJS theo kiểu thuộc lòng operator. Nên học theo bài toán.

```text
Bài toán transform data:
- map
- filter
- scan

Bài toán side effect:
- tap
- finalize

Bài toán giảm tần suất emit:
- debounceTime
- throttleTime
- auditTime

Bài toán so sánh value:
- distinctUntilChanged

Bài toán combine state:
- combineLatest
- withLatestFrom
- forkJoin

Bài toán async work:
- switchMap
- mergeMap
- concatMap
- exhaustMap

Bài toán error:
- catchError
- retry
- throwError
```

Middle/Senior không chỉ hỏi:

```text
Operator này làm gì?
```

Mà hỏi:

```text
Business semantics của flow này là gì?
Request cũ còn giá trị không?
Có cần giữ thứ tự không?
Có được chạy song song không?
Có được bỏ qua action mới không?
Nếu lỗi một lần, stream có được sống tiếp không?
```

---

## 4. Operators by Problem

### 4.1. Transform data: map

`map` biến đổi từng value.

```ts
of(1, 2, 3)
  .pipe(map(x => x * 10))
  .subscribe(console.log);
```

Kết quả:

```text
10
20
30
```

Trong Angular:

```ts
patientsVm$ = this.api.getPatients().pipe(
  map(patients =>
    patients.map(patient => ({
      id: patient.id,
      displayName: `${patient.code} - ${patient.fullName}`,
      isWarning: patient.debt > 0
    }))
  )
);
```

Dùng `map` khi muốn đổi shape dữ liệu.

Không nên dùng `tap` để transform dữ liệu chính.

### 4.2. Filter data: filter

`filter` chỉ cho value thỏa điều kiện đi tiếp.

```ts
this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id)
);
```

Type guard trong `filter` giúp TypeScript hiểu sau bước này `id` chắc chắn là string.

### 4.3. Side effect: tap

`tap` dùng cho side effect, không đổi value.

```ts
this.api.getPatients().pipe(
  tap(() => console.log('loaded patients'))
);
```

Side effect thường gặp:

```text
- log
- tracking
- message notification
- set external state
- debug
```

Cẩn thận:

```ts
this.api.getPatients().pipe(
  tap(patients => patients.map(x => ({ ...x, checked: false })))
);
```

Code trên nhìn như transform nhưng thực tế `tap` không đổi value đi tiếp. Nếu cần transform, dùng `map`.

### 4.4. Cleanup side effect: finalize

`finalize` chạy khi Observable complete, error hoặc bị unsubscribe.

```ts
this.loading = true;

this.api.save(input).pipe(
  finalize(() => {
    this.loading = false;
  })
).subscribe();
```

Phù hợp khi dùng subscribe thủ công cho action như submit.

Tuy nhiên nếu loading là một phần của state stream, có thể không cần `loading = true/false` thủ công.

### 4.5. Bỏ value trùng: distinctUntilChanged

`distinctUntilChanged` bỏ value trùng liên tiếp.

```ts
this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged()
);
```

Với primitive value như string/number/boolean, mặc định thường đủ.

Với object, mặc định so sánh reference.

```ts
query$.pipe(
  distinctUntilChanged((a, b) =>
    a.keyword === b.keyword &&
    a.status === b.status &&
    a.page === b.page
  )
);
```

Nếu không custom compare, object mới có cùng nội dung vẫn bị coi là khác.

### 4.6. Giá trị ban đầu: startWith

`startWith` phát giá trị ban đầu trước khi stream thật emit.

```ts
keyword$ = this.searchControl.valueChanges.pipe(
  startWith(this.searchControl.value ?? '')
);
```

Hay dùng với:

```text
- FormControl valueChanges
- Filter list cần load lần đầu
- combineLatest cần tất cả stream có initial value
```

Nếu thiếu `startWith`, `combineLatest` có thể chưa emit vì một control chưa từng thay đổi.

### 4.7. Giảm tần suất emit: debounceTime

`debounceTime` chờ source yên một khoảng rồi mới emit value cuối.

```ts
this.searchControl.valueChanges.pipe(
  debounceTime(300)
);
```

Phù hợp:

```text
- Search input
- Autocomplete
- Validate sau khi user dừng gõ
```

Mental model:

```text
Chỉ quan tâm value cuối sau khi user tạm dừng.
```

### 4.8. Giảm tần suất emit: throttleTime

`throttleTime` emit value đầu tiên, sau đó chặn trong một khoảng thời gian.

```ts
fromEvent(window, 'scroll').pipe(
  throttleTime(100)
);
```

Phù hợp:

```text
- Scroll
- Mousemove
- Resize
- Event tần suất cao
```

Mental model:

```text
Lấy mẫu không quá dày.
```

### 4.9. Tích lũy state: scan

`scan` giống `reduce`, nhưng emit từng bước trung gian.

```ts
const count$ = click$.pipe(
  scan(count => count + 1, 0)
);
```

Phù hợp khi muốn build state từ event stream.

Ví dụ notification count:

```ts
notificationCount$ = notificationMessage$.pipe(
  scan(count => count + 1, 0),
  startWith(0)
);
```

Cẩn thận: nếu state phức tạp, `scan` có thể biến thành mini reducer. Khi đó cần cân nhắc store/facade rõ ràng.

---

## 5. Higher-order Observable

### 5.1. Higher-order Observable là gì?

Khi một stream phát ra value, và mỗi value lại tạo ra một Observable khác, ta có Observable lồng nhau.

Ví dụ:

```ts
const result$ = keyword$.pipe(
  map(keyword => this.api.search(keyword))
);
```

Kiểu dữ liệu lúc này là:

```ts
Observable<Observable<SearchResult[]>>
```

Nghĩa là:

```text
keyword$ emit keyword
-> mỗi keyword tạo ra http.get(...)
-> kết quả là stream chứa stream
```

Ta cần flatten stream lồng nhau bằng các operator:

```text
- switchMap
- mergeMap
- concatMap
- exhaustMap
```

### 5.2. Câu hỏi trước khi chọn operator

Trước khi chọn operator, hãy hỏi:

```text
1. Khi source emit value mới, request cũ còn giá trị không?
2. Có được chạy nhiều request song song không?
3. Có cần giữ thứ tự không?
4. Nếu đang xử lý, có được bỏ qua action mới không?
5. Nếu request cũ về sau request mới, UI nên lấy cái nào?
```

Đây là phần phân biệt code RxJS cơ bản và code RxJS production.

### 5.3. switchMap

`switchMap` hủy inner Observable cũ khi source emit value mới.

```ts
results$ = this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(keyword => this.api.searchPatients(keyword))
);
```

Mental model:

```text
latest wins
```

Phù hợp:

```text
- Search box
- Route params đổi load detail
- Query params đổi load list
- Typeahead/autocomplete
- Filter list
```

Vì sao quan trọng?

```text
User gõ "a"  -> API A chậm
User gõ "an" -> API B nhanh

Nếu không hủy/ignore A, kết quả A có thể về sau và ghi đè kết quả B.
switchMap giúp chỉ lấy request mới nhất.
```

Không nên dùng `switchMap` khi:

```text
- Request cũ vẫn phải hoàn thành
- Action tạo dữ liệu không được hủy
- Mỗi event đều quan trọng, ví dụ audit log hoặc payment
```

Ví dụ không nên:

```ts
saveClick$.pipe(
  switchMap(() => this.api.createOrder(input))
);
```

Nếu user click nhiều lần hoặc source emit lại, request tạo order cũ có thể bị unsubscribe ở frontend. Backend có thể vẫn xử lý, nhưng frontend không còn theo dõi kết quả. Điều này dễ gây trạng thái khó hiểu.

### 5.4. mergeMap

`mergeMap` chạy nhiều inner Observable song song.

```ts
from(selectedIds).pipe(
  mergeMap(id => this.api.deletePatient(id))
);
```

Mental model:

```text
parallel
```

Phù hợp:

```text
- Gửi nhiều request độc lập
- Bulk action
- Không cần giữ thứ tự
- Không muốn cancel request cũ
```

Ví dụ giới hạn concurrency:

```ts
from(ids).pipe(
  mergeMap(id => this.api.syncItem(id), 3)
);
```

Ý nghĩa:

```text
Chỉ chạy tối đa 3 request cùng lúc.
```

Không nên dùng `mergeMap` cho search/filter vì request cũ có thể về sau và ghi đè request mới.

### 5.5. concatMap

`concatMap` xếp hàng inner Observable, chạy lần lượt và giữ thứ tự.

```ts
from(commands).pipe(
  concatMap(command => this.api.saveCommand(command))
);
```

Mental model:

```text
queue
```

Phù hợp:

```text
- Queue save
- Auto-save cần giữ thứ tự
- Audit log
- Các request phụ thuộc thứ tự
- Command không được đảo thứ tự
```

Ví dụ auto-save draft:

```ts
this.form.valueChanges.pipe(
  debounceTime(500),
  concatMap(value => this.api.saveDraft(value))
);
```

Nếu user thay đổi form liên tục, request save sẽ chạy lần lượt.

Nhược điểm:

```text
Request sau phải chờ request trước xong.
Nếu request trước treo lâu, queue bị nghẽn.
```

### 5.6. exhaustMap

`exhaustMap` bỏ qua value mới trong khi inner Observable hiện tại chưa hoàn thành.

```ts
submit$ = fromEvent(this.submitButton.nativeElement, 'click').pipe(
  exhaustMap(() => this.api.submitForm(this.form.getRawValue()))
);
```

Mental model:

```text
ignore while busy
```

Phù hợp:

```text
- Submit button chống double click
- Login
- Thanh toán
- Confirm action
- Action không muốn chạy song song
```

Ví dụ:

```text
User click 5 lần liên tục.
Request đầu tiên chạy.
4 click sau bị bỏ qua cho đến khi request đầu tiên hoàn thành.
```

Không nên dùng `exhaustMap` cho search, vì user nhập keyword mới trong lúc request cũ chạy thì keyword mới bị bỏ qua.

### 5.7. Bảng chọn nhanh

| Operator | Khi source emit value mới | Mental model | Dùng khi |
|---|---|---|---|
| `switchMap` | Hủy cái cũ, lấy cái mới | latest wins | Search, route/query params, filter |
| `mergeMap` | Chạy song song | parallel | Request độc lập, bulk action |
| `concatMap` | Xếp hàng, chạy tuần tự | queue | Save theo thứ tự, command queue |
| `exhaustMap` | Đang chạy thì bỏ value mới | ignore while busy | Submit, login, chống double click |

Câu nhớ:

```text
switchMap = latest wins
mergeMap = parallel
concatMap = queue
exhaustMap = ignore while busy
```

---

## 6. Combining Streams

### 6.1. combineLatest

`combineLatest` phát khi bất kỳ stream nào đổi, sau khi tất cả stream đã có ít nhất một value.

```ts
query$ = combineLatest([
  this.keywordControl.valueChanges.pipe(startWith('')),
  this.statusControl.valueChanges.pipe(startWith('all')),
  this.page$.pipe(startWith(1))
]).pipe(
  map(([keyword, status, page]) => ({ keyword, status, page }))
);
```

Phù hợp:

```text
- Filter list
- ViewModel từ nhiều state
- Tính toán field phụ thuộc nhiều nguồn
```

Cẩn thận:

```text
combineLatest cần tất cả stream emit ít nhất một lần.
Với FormControl valueChanges, thường cần startWith.
```

### 6.2. withLatestFrom

`withLatestFrom` chỉ emit khi source chính emit, sau đó lấy value mới nhất từ stream phụ.

```ts
saveClick$.pipe(
  withLatestFrom(this.formValue$),
  exhaustMap(([_, value]) => this.api.save(value))
);
```

Khác `combineLatest`:

```text
combineLatest:
Bất kỳ stream nào đổi cũng emit.

withLatestFrom:
Chỉ source chính emit mới phát.
```

Phù hợp:

```text
- Click save lấy form value mới nhất
- Click export lấy filter mới nhất
- Confirm action lấy selected row mới nhất
```

### 6.3. forkJoin

`forkJoin` chờ tất cả Observable complete, rồi phát kết quả cuối.

```ts
forkJoin({
  patient: this.api.getPatient(id),
  visits: this.api.getVisits(id),
  insurances: this.api.getInsurances(id)
}).subscribe(data => {
  this.data = data;
});
```

Phù hợp:

```text
- Gọi nhiều HTTP request độc lập
- Cần tất cả xong mới render
- Load initial data cho detail page
```

Không phù hợp với stream không complete:

```text
- valueChanges
- interval
- WebSocket
- route.paramMap
```

Nếu truyền stream không complete vào `forkJoin`, nó có thể không emit bao giờ.

### 6.4. zip

`zip` ghép value theo cặp cùng thứ tự.

```ts
zip(names$, ages$).subscribe(([name, age]) => {});
```

Ít dùng hơn `combineLatest` trong Angular app, nhưng hữu ích khi cần pairing chính xác theo thứ tự emit.

### 6.5. race

`race` lấy Observable nào emit đầu tiên, sau đó bỏ các Observable còn lại.

```ts
race(primaryApi$, fallbackApi$).subscribe(result => {});
```

Ít dùng trong CRUD app thường ngày, nhưng có thể hữu ích với timeout/fallback source đặc biệt.

---

## 7. Error Handling

### 7.1. Observable error nghĩa là stream kết thúc

Khi Observable error, stream đó kết thúc. Đây là điểm rất quan trọng.

```text
error không giống throw trong try/catch thông thường.
Trong RxJS, error là terminal event.
```

Nếu một UI stream bị error và không được recover, user thao tác tiếp có thể không còn tác dụng.

### 7.2. catchError

`catchError` bắt lỗi và phải return một Observable mới.

```ts
patients$ = this.api.getPatients().pipe(
  catchError(error => {
    this.message.error('Không tải được danh sách');
    return of([]);
  })
);
```

Sai:

```ts
catchError(error => {
  this.message.error('Lỗi');
})
```

Vì `catchError` cần return Observable.

### 7.3. Vị trí catchError rất quan trọng

Không tốt trong search:

```ts
results$ = this.keyword$.pipe(
  switchMap(keyword => this.api.search(keyword)),
  catchError(() => of([]))
);
```

Vấn đề:

```text
Nếu API lỗi, catchError nằm ngoài switchMap có thể làm toàn bộ results$ kết thúc.
User gõ tiếp nhưng stream không chạy tiếp như mong đợi.
```

Tốt hơn:

```ts
results$ = this.keyword$.pipe(
  switchMap(keyword =>
    this.api.search(keyword).pipe(
      catchError(() => of([]))
    )
  )
);
```

Ý nghĩa:

```text
Lỗi của từng request được xử lý bên trong inner stream.
Source keyword$ vẫn sống.
User gõ tiếp vẫn search được.
```

### 7.4. retry

`retry` subscribe lại source khi error.

```ts
this.api.getReport().pipe(
  retry(2),
  catchError(error => {
    this.message.error('Không tải được báo cáo');
    return EMPTY;
  })
);
```

Không retry bừa với action tạo dữ liệu.

```text
Có thể retry:
- GET report
- GET danh mục
- request idempotent

Cẩn thận retry:
- submit thanh toán
- tạo đơn hàng
- gửi SMS/email
- API không idempotent
```

### 7.5. retry với delay/backoff

```ts
this.api.getStatus().pipe(
  retry({
    count: 3,
    delay: (_, retryCount) => timer(retryCount * 1000)
  })
);
```

Phù hợp với:

```text
- network flaky
- polling status
- reconnect WebSocket
```

### 7.6. EMPTY, NEVER, throwError

```text
EMPTY
-> complete ngay, không emit value

NEVER
-> không emit, không complete

throwError
-> tạo stream lỗi
```

Ví dụ:

```ts
return EMPTY;
```

Cẩn thận khi dùng `EMPTY` trong guard/resolver hoặc stream UI cần value. Nó có thể làm flow im lặng khó debug.

Trong nhiều case, tốt hơn nên return value rõ ràng:

```ts
of({ status: 'error', data: null, error: 'Không tải được dữ liệu' })
```

### 7.7. Result State Pattern

Production UI không nên chỉ có data. Nên mô hình hóa cả loading/error.

```ts
type LoadState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };
```

Ví dụ:

```ts
patientsState$ = this.query$.pipe(
  switchMap(query =>
    this.api.searchPatients(query).pipe(
      map(data => ({
        status: 'success' as const,
        data,
        error: null
      })),
      startWith({
        status: 'loading' as const,
        data: null,
        error: null
      }),
      catchError(() =>
        of({
          status: 'error' as const,
          data: null,
          error: 'Không tải được dữ liệu'
        })
      )
    )
  )
);
```

Template:

```html
<ng-container *ngIf="patientsState$ | async as state">
  <app-loading *ngIf="state.status === 'loading'"></app-loading>

  <nz-alert
    *ngIf="state.status === 'error'"
    nzType="error"
    [nzMessage]="state.error">
  </nz-alert>

  <app-patient-table
    *ngIf="state.status === 'success'"
    [patients]="state.data">
  </app-patient-table>
</ng-container>
```

Lợi ích:

```text
- Loading/error/data đi cùng nhau
- Tránh state lệch
- Dễ review
- Dễ test
```

---

## 8. Subject và State Primitive

### 8.1. Subject

`Subject` vừa là Observable vừa là Observer.

```ts
private refreshSubject = new Subject<void>();
readonly refresh$ = this.refreshSubject.asObservable();

refresh(): void {
  this.refreshSubject.next();
}
```

Phù hợp cho event nội bộ:

```text
- refresh button
- manual reload
- close dialog
- trigger action
```

### 8.2. BehaviorSubject

`BehaviorSubject` giữ giá trị hiện tại và phát ngay cho subscriber mới.

```ts
private userSubject = new BehaviorSubject<User | null>(null);
readonly user$ = this.userSubject.asObservable();

setUser(user: User | null): void {
  this.userSubject.next(user);
}
```

Phù hợp cho state có current value:

```text
- current user
- selected branch
- selected tenant
- theme
- filter state
```

### 8.3. ReplaySubject

`ReplaySubject` replay lại N value gần nhất cho subscriber mới.

```ts
const logs$ = new ReplaySubject<string>(3);
```

Phù hợp:

```text
- log stream
- event history nhỏ
- late subscriber cần nhận một số event trước đó
```

Cẩn thận:

```text
Replay quá nhiều value có thể tốn memory.
```

### 8.4. AsyncSubject

`AsyncSubject` chỉ phát value cuối cùng khi complete.

Ít dùng trong Angular app thường ngày. Có thể gặp trong một số wrapper async đặc biệt.

### 8.5. Không expose Subject trực tiếp

Không nên:

```ts
user$ = new BehaviorSubject<User | null>(null);
```

Vì component bên ngoài có thể `.next()` lung tung.

Nên:

```ts
private userSubject = new BehaviorSubject<User | null>(null);
readonly user$ = this.userSubject.asObservable();
```

Service kiểm soát cách state thay đổi.

### 8.6. Subject không phải default state management

Không phải cứ có state là tạo Subject.

Không tốt trong nhiều case:

```ts
private loadingSubject = new BehaviorSubject(false);
private dataSubject = new BehaviorSubject<Patient[]>([]);
private errorSubject = new BehaviorSubject<string | null>(null);

load(): void {
  this.loadingSubject.next(true);
  this.api.getPatients().subscribe({
    next: data => {
      this.dataSubject.next(data);
      this.loadingSubject.next(false);
    },
    error: () => {
      this.errorSubject.next('Lỗi');
      this.loadingSubject.next(false);
    }
  });
}
```

Tốt hơn trong nhiều case:

```ts
state$ = this.refresh$.pipe(
  switchMap(() =>
    this.api.getPatients().pipe(
      map(data => ({ status: 'success' as const, data, error: null })),
      startWith({ status: 'loading' as const, data: null, error: null }),
      catchError(() => of({ status: 'error' as const, data: null, error: 'Lỗi' }))
    )
  )
);
```

Câu hỏi review:

```text
State này có thể derive từ stream khác không?
Nếu có, không cần Subject thủ công.
```

---

## 9. Angular Integration

### 9.1. HttpClient Observable

Angular `HttpClient` trả về Observable.

```ts
this.http.get<Patient[]>('/api/patients');
```

Đặc điểm thường gặp:

```text
- Cold Observable
- Gọi khi subscribe
- Emit response rồi complete
- Mỗi subscribe có thể tạo request mới
```

Vì HTTP Observable complete sau response, thường không cần unsubscribe thủ công nếu chỉ subscribe một lần.

Tuy nhiên, vẫn nên ưu tiên async pipe hoặc compose stream thay vì subscribe để gán field nếu data dùng cho template.

### 9.2. Reactive Form valueChanges

`valueChanges` là stream không tự complete trong vòng đời component.

```ts
this.form.valueChanges.subscribe(value => {
  console.log(value);
});
```

Nếu subscribe thủ công, cần quản lý lifecycle.

```ts
this.form.valueChanges.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(value => {
  this.saveDraft(value);
});
```

Với search input:

```ts
results$ = this.searchControl.valueChanges.pipe(
  startWith(this.searchControl.value ?? ''),
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(keyword => this.api.search(keyword))
);
```

### 9.3. patchValue và emitEvent

Khi patch ngược vào form từ một stream, cẩn thận loop.

```ts
this.total$.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(total => {
  this.form.patchValue({ total }, { emitEvent: false });
});
```

`emitEvent: false` giúp tránh việc patch `total` lại trigger `valueChanges` và gây vòng lặp.

### 9.4. ActivatedRoute paramMap/queryParamMap

Không nên chỉ dùng snapshot nếu component có thể được reuse.

```ts
patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged(),
  switchMap(id => this.api.getPatient(id))
);
```

Vì sao?

```text
/patients/1 -> /patients/2
Angular có thể reuse component instance.
ngOnInit không chạy lại.
paramMap emit lại.
```

### 9.5. async pipe

Template:

```html
<ng-container *ngIf="patients$ | async as patients">
  <app-patient-table [patients]="patients"></app-patient-table>
</ng-container>
```

`async pipe` giúp:

```text
- subscribe tự động
- unsubscribe khi component destroy
- markForCheck khi value mới đến
- giảm code imperative trong component
```

Default nên nghĩ đến async pipe khi dữ liệu dùng để render.

### 9.6. Khi nào vẫn subscribe thủ công?

Subscribe thủ công vẫn hợp lý khi cần side effect rõ ràng.

Ví dụ:

```text
- submit form
- navigate sau khi save thành công
- hiện message
- mở dialog
- tracking analytics
- save draft nền
- call imperative API của thư viện UI
```

Ví dụ submit:

```ts
onSubmit(): void {
  if (this.form.invalid) {
    return;
  }

  this.api.save(this.form.getRawValue()).pipe(
    finalize(() => this.submitting = false)
  ).subscribe({
    next: () => {
      this.message.success('Lưu thành công');
      this.router.navigate(['/patients']);
    },
    error: () => {
      this.message.error('Không lưu được dữ liệu');
    }
  });
}
```

### 9.7. takeUntilDestroyed

Angular hiện đại có `takeUntilDestroyed` để tự động complete Observable khi context bị destroy.

```ts
constructor(private destroyRef: DestroyRef) {}

ngOnInit(): void {
  this.form.valueChanges.pipe(
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(value => {
    this.saveDraft(value);
  });
}
```

Lợi ích:

```text
- Không cần tự tạo destroy$
- Ít boilerplate
- Intent rõ ràng
```

### 9.8. destroy$ pattern

Pattern cũ vẫn gặp nhiều trong project.

```ts
private destroy$ = new Subject<void>();

ngOnInit(): void {
  this.form.valueChanges.pipe(
    takeUntil(this.destroy$)
  ).subscribe();
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

Vẫn đúng, nhưng nếu Angular version hỗ trợ `takeUntilDestroyed`, nên ưu tiên cách mới.

### 9.9. RxJS và Signals

Angular mới có Signals. Không có nghĩa RxJS hết vai trò.

Có thể hiểu đơn giản:

```text
RxJS mạnh với async/event stream theo thời gian.
Signals mạnh với local synchronous reactive state.
```

Có thể chuyển Observable sang Signal:

```ts
readonly patients = toSignal(this.patients$, {
  initialValue: []
});
```

Khi nào giữ RxJS:

```text
- HTTP flow
- debounce/throttle
- WebSocket
- route params
- form valueChanges
- combine async streams
- cancellation/race condition
```

Khi nào cân nhắc Signal:

```text
- local UI state đơn giản
- computed state trong component
- state đọc nhiều trong template
```

Không nên biến tài liệu RxJS thành Signals vs RxJS. Hướng đúng là biết dùng chung.

---

## 10. State Design trong Angular

### 10.1. Phân loại state

Một màn hình Angular thường có nhiều loại state.

```text
Server state:
- data từ API
- cần loading/error/cache/refetch

URL state:
- route params
- query params
- page/filter cần share link

Form state:
- value
- validation
- dirty/touched

UI state:
- modal open/close
- selected rows
- expanded rows
- loading button
- current tab
```

Không nên gom tất cả vào một Subject lớn nếu không cần.

### 10.2. URL state hay local state?

Nên đưa state lên URL khi:

```text
- Cần share link
- Cần back/forward đúng
- Cần reload vẫn giữ filter/page
- Màn hình list/search quan trọng
```

Có thể để local state khi:

```text
- Modal open/close tạm thời
- Hover/expanded UI nhỏ
- Draft chưa cần share
```

### 10.3. ViewModel stream

Một pattern tốt trong Angular là gom state màn hình thành `vm$`.

```ts
readonly vm$ = combineLatest({
  patientsState: this.patientsState$,
  selectedIds: this.selectedIds$,
  permission: this.permission$
}).pipe(
  map(({ patientsState, selectedIds, permission }) => ({
    patientsState,
    selectedIds,
    canDelete: permission.canDelete && selectedIds.length > 0,
    hasSelection: selectedIds.length > 0
  }))
);
```

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <button nz-button [disabled]="!vm.canDelete">Xóa</button>

  <app-loading *ngIf="vm.patientsState.status === 'loading'"></app-loading>

  <app-patient-table
    *ngIf="vm.patientsState.status === 'success'"
    [patients]="vm.patientsState.data"
    [selectedIds]="vm.selectedIds">
  </app-patient-table>
</ng-container>
```

Lợi ích:

```text
- Template ít async pipe rải rác
- State màn hình rõ
- Dễ test transform
- Dễ dùng OnPush
- Giảm imperative code trong component
```

### 10.4. Tách server state và UI state

Không nên trộn data API với UI selection nếu chúng có lifecycle khác nhau.

Ví dụ:

```ts
patientsState$ = this.query$.pipe(
  switchMap(query => this.loadPatients(query))
);

selectedIds$ = this.selectedIdsSubject.asObservable();

vm$ = combineLatest({
  patientsState: this.patientsState$,
  selectedIds: this.selectedIds$
}).pipe(
  map(({ patientsState, selectedIds }) => ({
    patientsState,
    selectedIds
  }))
);
```

Khi query đổi, có thể clear selection:

```ts
this.query$.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(() => {
  this.selectedIdsSubject.next([]);
});
```

Hoặc derive selection theo data mới để loại bỏ id không còn tồn tại.

---

## 11. Cache và Invalidation

### 11.1. Vì sao cần cache?

Nếu nhiều nơi subscribe cùng một HTTP Observable, có thể gọi API nhiều lần.

```ts
patients$ = this.api.getPatients();
```

Giải pháp phổ biến:

```ts
patients$ = this.api.getPatients().pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Ý nghĩa:

```text
bufferSize: 1
-> giữ lại value mới nhất

refCount: true
-> khi không còn subscriber, unsubscribe source
```

### 11.2. shareReplay không phải cache strategy hoàn chỉnh

`shareReplay` chỉ replay lại value gần nhất. Production cache cần trả lời thêm:

```text
- Khi nào cache hết hạn?
- Khi nào refresh?
- Khi user đổi tenant/branch thì cache có bị clear không?
- API lỗi thì cache xử lý sao?
- Có cache theo key không?
- Có cần stale-while-revalidate không?
```

### 11.3. Cache có refresh trigger

```ts
private readonly refreshSubject = new Subject<void>();

readonly patients$ = this.refreshSubject.pipe(
  startWith(void 0),
  switchMap(() => this.api.getPatients()),
  shareReplay({ bufferSize: 1, refCount: true })
);

refresh(): void {
  this.refreshSubject.next();
}
```

Sau khi thêm/sửa/xóa bệnh nhân:

```ts
this.api.updatePatient(input).pipe(
  tap(() => this.refresh())
).subscribe();
```

### 11.4. Cache theo key

```ts
private readonly patientCache = new Map<string, Observable<Patient>>();

getPatient(id: string): Observable<Patient> {
  const cached$ = this.patientCache.get(id);

  if (cached$) {
    return cached$;
  }

  const request$ = this.api.getPatient(id).pipe(
    shareReplay({ bufferSize: 1, refCount: true })
  );

  this.patientCache.set(id, request$);
  return request$;
}
```

Cần có invalidation:

```ts
invalidatePatient(id: string): void {
  this.patientCache.delete(id);
}

clearCache(): void {
  this.patientCache.clear();
}
```

Nếu không, sửa bệnh nhân xong detail có thể vẫn hiển thị dữ liệu cũ.

### 11.5. Cache theo tenant/branch/user context

Trong app business, cache thường phụ thuộc context.

Ví dụ:

```text
- tenant
- shop/branch
- user permission
- language
- feature flag
```

Nếu user đổi branch mà cache danh mục không clear, UI có thể hiển thị dữ liệu sai.

Pattern:

```ts
readonly categories$ = this.contextService.branchId$.pipe(
  distinctUntilChanged(),
  switchMap(branchId => this.api.getCategories(branchId)),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Khi branch đổi, `switchMap` load lại danh mục theo branch mới.

---

## 12. Lifecycle và Memory Leak

### 12.1. Stream nào thường tự complete?

```text
- HTTP request
- from([1, 2, 3])
- of(value)
- forkJoin với các HTTP request
- Dialog afterClosed/afterClose trong nhiều thư viện UI
```

Với các stream này, thường không cần unsubscribe thủ công nếu subscribe một lần.

### 12.2. Stream nào thường không tự complete?

```text
- FormControl.valueChanges
- FormGroup.valueChanges
- ActivatedRoute.paramMap/queryParamMap
- fromEvent
- interval
- timer lặp
- Subject sống trong service
- WebSocket
- SignalR
```

Nếu subscribe thủ công, cần cleanup.

### 12.3. Cách cleanup ưu tiên

Ưu tiên 1: async pipe

```html
<app-table [patients]="patients$ | async"></app-table>
```

Ưu tiên 2: takeUntilDestroyed

```ts
this.form.valueChanges.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe();
```

Ưu tiên 3: destroy$ pattern nếu Angular version cũ

```ts
this.form.valueChanges.pipe(
  takeUntil(this.destroy$)
).subscribe();
```

### 12.4. Memory leak trong service singleton

Service `providedIn: 'root'` sống rất lâu. Nếu service giữ resource như WebSocket, interval, cache Map, Subject, cần thiết kế lifecycle rõ.

Ví dụ nguy hiểm:

```ts
@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor() {
    interval(1000).subscribe(() => {
      this.poll();
    });
  }
}
```

Vấn đề:

```text
- interval sống suốt app
- không có stop
- không phụ thuộc login/logout
```

Tốt hơn:

```ts
private readonly active$ = new BehaviorSubject(false);

readonly polling$ = this.active$.pipe(
  switchMap(active => active ? interval(5000) : EMPTY),
  switchMap(() => this.api.getNotifications()),
  shareReplay({ bufferSize: 1, refCount: true })
);

start(): void {
  this.active$.next(true);
}

stop(): void {
  this.active$.next(false);
}
```

### 12.5. Code review lifecycle

Khi thấy subscribe, hãy hỏi:

```text
Stream này có complete không?
Component/service sống bao lâu?
Nếu component destroy, subscription có dừng không?
Nếu user logout, resource có close không?
Nếu route đổi nhanh, request cũ có bị hủy không?
```

---

## 13. RxJS và Change Detection

### 13.1. async pipe và OnPush

`async pipe` rất hợp với `ChangeDetectionStrategy.OnPush`.

```ts
@Component({
  selector: 'app-patient-list',
  templateUrl: './patient-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientListComponent {
  readonly patients$ = this.api.getPatients();
}
```

Template:

```html
<app-patient-table [patients]="patients$ | async"></app-patient-table>
```

Khi Observable emit value mới, async pipe sẽ mark component for check.

### 13.2. Không làm việc nặng trong stream emit quá dày

Không tốt:

```ts
fromEvent(window, 'scroll').pipe(
  map(() => heavyCalculation())
);
```

Nếu source emit 60 lần/giây, operator nặng có thể gây lag.

Giải pháp:

```ts
fromEvent(window, 'scroll').pipe(
  throttleTime(100),
  map(() => lightCalculation())
);
```

Hoặc cân nhắc chạy ngoài Angular zone trong case đặc biệt.

### 13.3. ViewModel hóa trước khi vào template

Không nên để template gọi method nặng:

```html
<td>{{ calculateScore(patient) }}</td>
```

Nên map thành VM:

```ts
patientsVm$ = this.patients$.pipe(
  map(patients => patients.map(patient => ({
    ...patient,
    scoreText: calculateScore(patient)
  })))
);
```

Template chỉ đọc:

```html
<td>{{ patient.scoreText }}</td>
```

---

## 14. Testing RxJS

### 14.1. Test transform đơn giản

```ts
it('maps patients to vm', done => {
  of([{ id: 1, name: 'An' }]).pipe(
    map(patients => patients.map(p => ({ id: p.id, label: p.name })))
  ).subscribe(vm => {
    expect(vm[0].label).toBe('An');
    done();
  });
});
```

### 14.2. Test debounce với fakeAsync

```ts
it('debounces search input', fakeAsync(() => {
  const control = new FormControl('');
  const values: string[] = [];

  control.valueChanges.pipe(
    debounceTime(300)
  ).subscribe(value => values.push(value ?? ''));

  control.setValue('a');
  tick(100);

  control.setValue('an');
  tick(299);

  expect(values).toEqual([]);

  tick(1);
  expect(values).toEqual(['an']);
}));
```

### 14.3. Test behavior thay vì test operator

Với component/service Angular, thường test behavior là đủ.

```text
- Gõ nhiều lần chỉ gọi API với keyword cuối
- Submit double click chỉ gọi API một lần
- Param đổi thì load detail mới
- API lỗi thì state chuyển error nhưng stream vẫn sống
- Refresh trigger thì gọi API lại
```

### 14.4. Marble testing

Marble testing mạnh khi stream logic phức tạp, nhiều timing và cancellation.

Nhưng không nên lạm dụng. Nếu test behavior đọc dễ hơn, ưu tiên behavior test.

Senior không phải là biến mọi test RxJS thành marble test. Senior là biết khi nào marble đáng dùng.

---

## 15. Anti-pattern thường gặp

### 15.1. Nested subscribe

Không tốt:

```ts
this.route.paramMap.subscribe(params => {
  const id = params.get('id')!;

  this.api.getPatient(id).subscribe(patient => {
    this.patient = patient;
  });
});
```

Vấn đề:

```text
- Khó unsubscribe
- Khó xử lý error
- Race condition khi param đổi nhanh
- Logic lồng sâu
- Khó test
```

Tốt hơn:

```ts
readonly patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged(),
  switchMap(id => this.api.getPatient(id))
);
```

### 15.2. Subscribe trong subscribe để gọi API theo form

Không tốt:

```ts
this.form.valueChanges.subscribe(value => {
  this.api.search(value).subscribe(result => {
    this.result = result;
  });
});
```

Tốt hơn:

```ts
readonly result$ = this.form.valueChanges.pipe(
  debounceTime(300),
  switchMap(value => this.api.search(value))
);
```

### 15.3. Dùng mergeMap cho search

Không tốt:

```ts
this.keyword$.pipe(
  mergeMap(keyword => this.api.search(keyword))
);
```

Bug:

```text
Request keyword cũ có thể về sau và ghi đè keyword mới.
```

Tốt hơn:

```ts
this.keyword$.pipe(
  switchMap(keyword => this.api.search(keyword))
);
```

### 15.4. Dùng switchMap cho action không nên cancel

Cẩn thận:

```ts
submitClick$.pipe(
  switchMap(() => this.api.createPayment(this.form.getRawValue()))
);
```

Với payment/submit quan trọng, thường nên dùng `exhaustMap` để chống double click.

```ts
submitClick$.pipe(
  exhaustMap(() => this.api.createPayment(this.form.getRawValue()))
);
```

### 15.5. Quên catchError làm stream chết

Không tốt:

```ts
readonly results$ = this.keyword$.pipe(
  debounceTime(300),
  switchMap(keyword => this.api.search(keyword))
);
```

Nếu API lỗi, stream có thể chết.

Tốt hơn:

```ts
readonly results$ = this.keyword$.pipe(
  debounceTime(300),
  switchMap(keyword =>
    this.api.search(keyword).pipe(
      catchError(() => of([]))
    )
  )
);
```

### 15.6. Expose Subject public

Không tốt:

```ts
export class AuthService {
  user$ = new BehaviorSubject<User | null>(null);
}
```

Component khác có thể:

```ts
this.authService.user$.next(null);
```

Tốt hơn:

```ts
export class AuthService {
  private readonly userSubject = new BehaviorSubject<User | null>(null);
  readonly user$ = this.userSubject.asObservable();

  setUser(user: User | null): void {
    this.userSubject.next(user);
  }
}
```

### 15.7. shareReplay không có invalidation

Không tốt nếu data có thể đổi:

```ts
readonly patients$ = this.api.getPatients().pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Nếu thêm/sửa/xóa bệnh nhân, cache không tự refresh.

Tốt hơn:

```ts
private readonly refresh$ = new Subject<void>();

readonly patients$ = this.refresh$.pipe(
  startWith(void 0),
  switchMap(() => this.api.getPatients()),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

---

## 16. Case Studies

### Case Study 1. Search List có filter, paging, refresh

#### Bài toán

Màn hình danh sách có:

```text
- keyword
- status
- page
- pageSize
- refresh button
- loading
- error
- empty state
```

Yêu cầu:

```text
- Gõ search không gọi API liên tục
- Filter đổi thì load lại
- Page đổi thì load lại
- Request cũ không được ghi đè request mới
- API lỗi không làm chết stream
- Template dễ đọc
```

#### Thiết kế stream

```ts
private readonly refreshSubject = new Subject<void>();
private readonly pageSubject = new BehaviorSubject<number>(1);

readonly keyword$ = this.keywordControl.valueChanges.pipe(
  startWith(this.keywordControl.value ?? ''),
  debounceTime(300),
  map(keyword => keyword.trim()),
  distinctUntilChanged()
);

readonly status$ = this.statusControl.valueChanges.pipe(
  startWith(this.statusControl.value ?? 'all'),
  distinctUntilChanged()
);

readonly page$ = this.pageSubject.asObservable();

readonly query$ = combineLatest({
  keyword: this.keyword$,
  status: this.status$,
  page: this.page$
}).pipe(
  distinctUntilChanged((a, b) =>
    a.keyword === b.keyword &&
    a.status === b.status &&
    a.page === b.page
  )
);
```

Load data:

```ts
readonly patientsState$ = combineLatest({
  query: this.query$,
  refresh: this.refreshSubject.pipe(startWith(void 0))
}).pipe(
  switchMap(({ query }) =>
    this.api.searchPatients(query).pipe(
      map(result => ({
        status: 'success' as const,
        data: result,
        error: null
      })),
      startWith({
        status: 'loading' as const,
        data: null,
        error: null
      }),
      catchError(() => of({
        status: 'error' as const,
        data: null,
        error: 'Không tải được danh sách bệnh nhân'
      }))
    )
  ),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

ViewModel:

```ts
readonly vm$ = this.patientsState$.pipe(
  map(state => ({
    state,
    isLoading: state.status === 'loading',
    isError: state.status === 'error',
    isEmpty: state.status === 'success' && state.data.items.length === 0
  }))
);
```

Actions:

```ts
changePage(page: number): void {
  this.pageSubject.next(page);
}

refresh(): void {
  this.refreshSubject.next();
}
```

#### Vì sao dùng switchMap?

Search/filter/page đổi thì request cũ không còn đáng tin. `switchMap` đảm bảo latest query thắng.

```text
Query cũ chậm về sau
-> bị hủy/ignore
-> không ghi đè result mới
```

---

### Case Study 2. Route Params Load Detail

#### Bài toán

URL:

```text
/patients/1
/patients/2
```

Yêu cầu:

```text
- Đổi id thì load lại detail
- Component có thể bị reuse
- Request cũ không ghi đè request mới
- Có loading/error state
```

#### Thiết kế

```ts
readonly patientId$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged()
);

readonly patientState$ = this.patientId$.pipe(
  switchMap(id =>
    this.api.getPatient(id).pipe(
      map(patient => ({
        status: 'success' as const,
        data: patient,
        error: null
      })),
      startWith({
        status: 'loading' as const,
        data: null,
        error: null
      }),
      catchError(() => of({
        status: 'error' as const,
        data: null,
        error: 'Không tải được thông tin bệnh nhân'
      }))
    )
  ),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

#### Điểm cần nhớ

Không chỉ dùng `snapshot` nếu route param có thể đổi trong cùng component instance.

---

### Case Study 3. Submit Form chống double click

#### Bài toán

User click nút lưu nhiều lần liên tục. Không được tạo nhiều request submit.

#### Thiết kế

```ts
private readonly submitSubject = new Subject<void>();

readonly submitState$ = this.submitSubject.pipe(
  exhaustMap(() => {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return EMPTY;
    }

    return this.api.save(this.form.getRawValue()).pipe(
      map(() => ({ status: 'success' as const, error: null })),
      startWith({ status: 'loading' as const, error: null }),
      catchError(() => of({
        status: 'error' as const,
        error: 'Không lưu được dữ liệu'
      }))
    );
  })
);

submit(): void {
  this.submitSubject.next();
}
```

#### Vì sao dùng exhaustMap?

```text
Request đầu tiên đang chạy.
Click sau bị bỏ qua.
Không tạo nhiều submit song song.
```

---

### Case Study 4. Auto-save Draft bằng concatMap

#### Bài toán

Form nhập hồ sơ cần auto-save draft.

Yêu cầu:

```text
- User nhập liên tục thì không save quá dày
- Save phải giữ thứ tự
- Không để bản save cũ ghi đè bản save mới
```

#### Thiết kế

```ts
this.form.valueChanges.pipe(
  debounceTime(800),
  filter(() => this.form.valid),
  concatMap(value =>
    this.api.saveDraft(value).pipe(
      catchError(error => {
        this.message.warning('Không lưu được bản nháp');
        return EMPTY;
      })
    )
  ),
  takeUntilDestroyed(this.destroyRef)
).subscribe();
```

#### Vì sao dùng concatMap?

Auto-save là command cần giữ thứ tự. Nếu request save trước về sau request save sau, dữ liệu có thể bị lệch. `concatMap` giúp queue tuần tự.

---

### Case Study 5. Bulk Action giới hạn concurrency

#### Bài toán

User chọn 100 dòng và bấm đồng bộ. Không nên bắn 100 request cùng lúc.

#### Thiết kế

```ts
syncSelected(ids: string[]): void {
  from(ids).pipe(
    mergeMap(id => this.api.syncItem(id).pipe(
      map(() => ({ id, status: 'success' as const })),
      catchError(() => of({ id, status: 'error' as const }))
    ), 5),
    toArray()
  ).subscribe(results => {
    this.handleSyncResults(results);
  });
}
```

#### Vì sao dùng mergeMap concurrency?

```text
- Mỗi item độc lập
- Có thể chạy song song
- Nhưng cần giới hạn để tránh quá tải backend/browser
```

---

### Case Study 6. Cache danh mục dùng chung toàn app

#### Bài toán

Danh mục tỉnh/thành hoặc danh mục trạng thái được dùng ở nhiều màn hình.

Yêu cầu:

```text
- Không gọi API lặp lại ở mỗi component
- Có thể refresh khi cần
- Clear khi context thay đổi
```

#### Thiết kế

```ts
@Injectable({ providedIn: 'root' })
export class MasterDataFacade {
  private readonly refreshProvinceSubject = new Subject<void>();

  readonly provinces$ = this.refreshProvinceSubject.pipe(
    startWith(void 0),
    switchMap(() => this.api.getProvinces()),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  refreshProvinces(): void {
    this.refreshProvinceSubject.next();
  }
}
```

Nếu danh mục phụ thuộc branch:

```ts
readonly categories$ = this.context.branchId$.pipe(
  distinctUntilChanged(),
  switchMap(branchId => this.api.getCategories(branchId)),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

---

### Case Study 7. WebSocket Notification Stream

#### Bài toán

App cần nhận notification realtime từ WebSocket.

Yêu cầu:

```text
- Không mỗi component mở một WebSocket riêng
- Nhiều component cùng dùng notification stream
- Logout thì close connection
- Mất kết nối thì retry/backoff
```

#### Thiết kế

```ts
@Injectable({ providedIn: 'root' })
export class NotificationStreamService {
  private readonly connectedSubject = new BehaviorSubject<boolean>(false);

  readonly messages$ = this.connectedSubject.pipe(
    switchMap(connected => {
      if (!connected) {
        return EMPTY;
      }

      return this.createSocketStream().pipe(
        retry({
          delay: (_, retryCount) => timer(Math.min(retryCount * 1000, 10000))
        }),
        catchError(() => EMPTY)
      );
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  connect(): void {
    this.connectedSubject.next(true);
  }

  disconnect(): void {
    this.connectedSubject.next(false);
  }

  private createSocketStream(): Observable<NotificationMessage> {
    return new Observable<NotificationMessage>(subscriber => {
      const socket = new WebSocket('wss://example.com/notifications');

      socket.onmessage = event => {
        subscriber.next(JSON.parse(event.data));
      };

      socket.onerror = error => {
        subscriber.error(error);
      };

      socket.onclose = () => {
        subscriber.complete();
      };

      return () => {
        socket.close();
      };
    });
  }
}
```

#### Điểm thiết kế

```text
- WebSocket là hot resource
- Service quản lý lifecycle connection
- Component chỉ consume messages$
- Logout gọi disconnect
- Unsubscribe cleanup sẽ close socket
```

---

### Case Study 8. Dialog Result + Refresh List

#### Bài toán

Mở modal thêm/sửa bệnh nhân. Khi modal đóng thành công thì refresh list.

#### Thiết kế

```ts
openCreateDialog(): void {
  const ref = this.modal.create({
    nzTitle: 'Thêm bệnh nhân',
    nzContent: PatientFormComponent
  });

  ref.afterClose.pipe(
    filter(result => result === 'success'),
    takeUntilDestroyed(this.destroyRef)
  ).subscribe(() => {
    this.refresh();
  });
}
```

Nếu muốn reactive hơn:

```ts
private readonly dialogSuccessSubject = new Subject<void>();

readonly patientsState$ = merge(
  this.refreshSubject,
  this.dialogSuccessSubject
).pipe(
  startWith(void 0),
  switchMap(() => this.loadPatients())
);
```

---

### Case Study 9. Form Field phụ thuộc nhau

#### Bài toán

Form có `quantity`, `price`, cần tính `total`.

#### Thiết kế render-only

Nếu chỉ hiển thị:

```ts
readonly total$ = combineLatest([
  this.form.get('quantity')!.valueChanges.pipe(
    startWith(this.form.get('quantity')!.value)
  ),
  this.form.get('price')!.valueChanges.pipe(
    startWith(this.form.get('price')!.value)
  )
]).pipe(
  map(([quantity, price]) => (quantity || 0) * (price || 0))
);
```

Template:

```html
<span>{{ total$ | async | number }}</span>
```

Nếu cần patch vào form:

```ts
this.total$.pipe(
  takeUntilDestroyed(this.destroyRef)
).subscribe(total => {
  this.form.patchValue({ total }, { emitEvent: false });
});
```

---

### Case Study 10. RxJS với Signals

#### Bài toán

Data load bằng Observable nhưng template muốn đọc như Signal.

#### Thiết kế

```ts
readonly patients$ = this.api.getPatients().pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);

readonly patients = toSignal(this.patients$, {
  initialValue: []
});

readonly totalPatients = computed(() => this.patients().length);
```

#### Cách nghĩ

```text
RxJS xử lý async flow.
Signal xử lý local reactive read/computed.
```

Không cần ép mọi thứ thành RxJS hoặc ép mọi thứ thành Signal.

---

## 17. Checklist Review RxJS

### 17.1. Data flow

```text
[ ] Source stream rõ chưa?
[ ] Stream đại diện cho event, state hay async work?
[ ] Có nested subscribe không?
[ ] Có thể derive state thay vì Subject thủ công không?
[ ] Có cần vm$ để gom state cho template không?
```

### 17.2. Operator

```text
[ ] Search/route/filter có dùng switchMap không?
[ ] Submit có cần exhaustMap không?
[ ] Bulk independent action có cần mergeMap với concurrency không?
[ ] Command cần thứ tự có cần concatMap không?
[ ] combineLatest có đủ initial value bằng startWith chưa?
[ ] Object query có distinctUntilChanged custom chưa?
```

### 17.3. Lifecycle

```text
[ ] Subscribe thủ công có unsubscribe chưa?
[ ] Có dùng async pipe được không?
[ ] Stream này có complete không?
[ ] Component destroy thì subscription có dọn không?
[ ] Service singleton có resource nào sống quá lâu không?
```

### 17.4. Error

```text
[ ] catchError đặt đúng cấp chưa?
[ ] Stream UI có bị chết sau lỗi không?
[ ] Retry có an toàn với action này không?
[ ] Error có được thể hiện ra UI không?
[ ] Có dùng EMPTY khiến flow im lặng khó debug không?
```

### 17.5. Cache

```text
[ ] Có gọi API thừa do nhiều subscribe không?
[ ] shareReplay có refCount phù hợp không?
[ ] Cache có invalidation không?
[ ] Cache có phụ thuộc tenant/branch/user không?
[ ] Sau create/update/delete có refresh cache không?
```

### 17.6. Performance

```text
[ ] Source emit dày có debounce/throttle/audit chưa?
[ ] Có làm heavy calculation trong stream emit liên tục không?
[ ] Template có gọi method nặng không?
[ ] Có tạo object mới liên tục gây emit thừa không?
```

### 17.7. Angular

```text
[ ] OnPush + async pipe có hoạt động đúng không?
[ ] Form patchValue có cần emitEvent: false không?
[ ] Route param đổi có load lại đúng không?
[ ] Query params có gây vòng lặp navigation không?
[ ] Có thể dùng takeUntilDestroyed thay destroy$ không?
[ ] Có nên dùng Signal cho local computed state không?
```

---

## 18. Lộ trình học RxJS

### 18.1. Foundation cần chắc

```text
- Observable / Observer / Subscription
- next / error / complete
- cold vs hot
- pipe/operator
- map / filter / tap
- debounceTime / distinctUntilChanged / startWith
- async pipe
```

### 18.2. Middle level

```text
- switchMap / mergeMap / concatMap / exhaustMap
- combineLatest / withLatestFrom / forkJoin
- catchError placement
- Subject / BehaviorSubject
- unsubscribe pattern
- route params + form valueChanges + HTTP flow
- shareReplay cơ bản
```

### 18.3. Senior level

```text
- Thiết kế vm$ cho màn hình phức tạp
- Tách server state, UI state, URL state, form state
- Cache + invalidation
- Chọn flattening operator theo business semantics
- Debug race condition
- Review RxJS anti-pattern
- Tối ưu stream emit dày
- Thiết kế facade/service API sạch
- RxJS interop với Signals
- WebSocket/realtime lifecycle
```

### 18.4. Câu hỏi tự kiểm tra

```text
1. Nếu user gõ search nhanh, request nào được quyền render?
2. Nếu user click submit 5 lần, API nên gọi mấy lần?
3. Nếu API lỗi một lần, stream còn sống không?
4. Nếu component destroy, subscription có được dọn không?
5. Nếu nhiều component cùng subscribe, API có bị gọi lặp không?
6. Nếu filter object emit liên tục cùng nội dung, có gọi API thừa không?
7. State nào nên nằm trong URL, state nào nên nằm trong service/store?
8. Cache invalidate khi nào?
9. WebSocket connection được mở/đóng bởi ai?
10. Operator đang phản ánh đúng nghiệp vụ chưa?
```

---

## 19. Tóm tắt

RxJS không phải chỉ là `subscribe`.

RxJS là cách mô hình hóa dữ liệu theo thời gian:

```text
event -> transform -> async work -> state -> template
```

Ở mức cơ bản, Angular developer biết dùng Observable và một số operator phổ biến.

Ở mức middle, developer biết chọn đúng operator cho search, submit, bulk action, route params, form valueChanges và biết tránh nested subscribe/memory leak.

Ở mức senior, developer biết thiết kế reactive flow theo nghiệp vụ, kiểm soát race condition, lifecycle, error, cache, invalidation, performance và tổ chức state sao cho dễ maintain.

Nếu chỉ nhớ một bảng:

| Bài toán | Operator/pattern thường dùng |
|---|---|
| Search input | `debounceTime` + `distinctUntilChanged` + `switchMap` |
| Route params load detail | `paramMap` + `distinctUntilChanged` + `switchMap` |
| Submit chống double click | `exhaustMap` |
| Bulk request song song | `mergeMap` với concurrency |
| Queue save theo thứ tự | `concatMap` |
| Filter nhiều control | `combineLatest` |
| Click lấy state mới nhất | `withLatestFrom` |
| Gọi nhiều API và chờ tất cả | `forkJoin` |
| Cache HTTP result | `shareReplay({ bufferSize: 1, refCount: true })` |
| Cache có refresh | `refresh$` + `switchMap` + `shareReplay` |
| Dọn subscription | `async pipe` hoặc `takeUntilDestroyed` |
| UI state production | `LoadState<T>` / `vm$` |
| WebSocket dùng chung | Service quản lý connection + shared stream |

---

## Appendix. Template tư duy khi gặp bài toán RxJS

Khi gặp một màn hình hoặc flow mới, có thể note theo form sau:

```text
1. Source streams
- User events:
- Form streams:
- Route/query params:
- Server streams:
- UI triggers:

2. Business semantics
- Request cũ có còn hợp lệ không?
- Có cần giữ thứ tự không?
- Có được chạy song song không?
- Có action nào cần chống double click không?

3. State model
- Data:
- Loading:
- Error:
- Empty:
- Selected/expanded/modal:

4. Lifecycle
- Ai subscribe?
- Có async pipe được không?
- Nếu subscribe thủ công thì cleanup ở đâu?

5. Cache
- Có nhiều subscriber không?
- Có cần shareReplay không?
- Invalidate khi nào?
- Phụ thuộc tenant/branch/user không?

6. Error
- catchError đặt ở inner hay outer?
- Error có làm chết stream UI không?
- Retry có an toàn không?

7. Review cuối
- Có nested subscribe không?
- Có API thừa không?
- Có race condition không?
- Có memory leak không?
- Template có dễ đọc không?
```
