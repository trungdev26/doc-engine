# Event loop, task và Promise

Hai thuật ngữ trong tiêu đề mang ý nghĩa cụ thể:

- **Asynchronous (bất đồng bộ)** — một thao tác được khởi tạo nhưng kết quả của nó chưa có ngay; code không dừng lại chờ mà tiếp tục chạy phần còn lại, kết quả sẽ đến qua một callback sau đó.
- **Event loop** — cơ chế của JavaScript runtime, liên tục kiểm tra: call stack đã rỗng chưa, có callback nào đang chờ được chạy không, rồi lần lượt đưa callback đó vào chạy.

[Mở demo tương tác Event loop & async](/frontend-engineering/javascript-event-loop-async-demo)

## Code đồng bộ chặn main thread

Code đồng bộ (synchronous) chạy statement này xong mới sang statement kế tiếp:

```ts
const raw = readInput();
const value = parse(raw);
render(value);
```

Nếu `parse` mất ba giây để chạy, `render` phải đợi đủ ba giây mới được gọi. Trong lúc đó, tab trình duyệt không phản hồi thao tác nào khác của người dùng, vì JavaScript chỉ có một main thread để chạy code.

Async API giải quyết vấn đề này bằng cách tách "khởi tạo thao tác" khỏi "nhận kết quả":

```ts
fetch('/api/orders').then(response => response.json());
console.log('Request đã được khởi tạo');
```

`fetch` trả về một Promise ngay lập tức, không chờ network. Dòng `console.log` chạy trước khi response về. Việc tải dữ liệu qua mạng không diễn ra "bên trong" Promise — trình duyệt xử lý phần I/O đó ở một nơi khác, còn Promise chỉ là đối tượng đại diện cho kết quả sẽ có trong tương lai.

## Nơi các thao tác bất đồng bộ được quản lý

Nơi khác đó gồm bốn phần, cùng phối hợp với nhau:

```text
Call stack        — nơi code đồng bộ đang chạy
Web APIs          — nơi trình duyệt xử lý timer, network, DOM event
Task queue        — nơi callback của Web API xếp hàng chờ chạy
Microtask queue   — nơi callback của Promise xếp hàng chờ chạy
```

JavaScript chạy từng đoạn code đồng bộ trên call stack, từng lệnh một. Khi gặp một API bất đồng bộ (`setTimeout`, `fetch`, một DOM event listener...), trình duyệt nhận lấy phần chờ đợi đó và chạy nó bên ngoài call stack. Khi phần việc đó xong, callback tương ứng không được chạy ngay — nó được xếp vào task queue hoặc microtask queue, chờ đến lượt.

## Event loop kết nối các thành phần trên

Event loop là vòng lặp liên tục thực hiện các bước sau:

```text
1. Lấy một task ra khỏi task queue.
2. Chạy task đó đến khi call stack rỗng.
3. Drain (chạy hết) toàn bộ microtask queue.
4. Nhường cơ hội cho trình duyệt render nếu cần.
5. Quay lại bước 1 với task tiếp theo.
```

"Drain" nghĩa là chạy liên tục cho đến khi hàng đợi đó rỗng, kể cả khi trong lúc chạy có microtask mới được thêm vào — microtask mới vẫn được chạy trước khi event loop chuyển sang task tiếp theo.

Một hệ quả quan trọng của quy trình này là **run-to-completion**: một task đang chạy sẽ chạy hết trước khi bất kỳ task nào khác — kể cả timer callback — được phép chen vào giữa.

```ts
let status = 'idle';

setTimeout(() => {
  console.log(status);
}, 0);

status = 'ready';
runExpensiveSynchronousWork();
```

Callback của `setTimeout` chỉ có thể chạy sau khi script hiện tại và toàn bộ công việc đồng bộ của nó đã kết thúc, kể cả khi delay là `0`. Delay `0` có nghĩa là "cho vào task queue ngay khi có thể", không phải "chạy ngay lập tức".

### Vì sao run-to-completion quan trọng

Trong một ngôn ngữ đa luồng, hai đoạn code có thể đọc và ghi cùng một biến cùng lúc, tạo ra race condition khó tái hiện. Run-to-completion loại bỏ hẳn nhóm lỗi đó trong JavaScript: khi một function đang chỉnh sửa dữ liệu, không function nào khác có thể xen vào giữa chừng để đọc một trạng thái dở dang. Đây là lý do code JavaScript đồng bộ không cần lock hay mutex như trong Java hay C++.

Hệ quả ngược lại của cùng một cơ chế: nếu một task chạy quá lâu — một vòng lặp nặng, một phép tính tốn CPU — toàn bộ phần còn lại của chương trình, kể cả việc render UI, bị chặn hoàn toàn cho tới khi task đó chạy xong. Không có cơ chế nào chen ngang một task đang chạy để nhường CPU giữa chừng; đây là nguyên nhân trực tiếp của hiện tượng "trang bị đứng" khi có một xử lý đồng bộ nặng.

## Task và microtask không cùng một hàng đợi

Các nguồn tạo ra task:

- script ban đầu của trang;
- `setTimeout`/`setInterval`;
- DOM event (click, input...);
- một số I/O callback.

Các nguồn tạo ra microtask:

- `Promise.then`/`catch`/`finally`;
- phần code chạy sau `await` trong `async function`;
- `queueMicrotask`;
- `MutationObserver`.

Sau khi một task kết thúc và call stack rỗng, event loop drain toàn bộ microtask queue trước khi lấy task tiếp theo. Vì vậy, mọi microtask luôn chạy trước task kế tiếp, bất kể task đó được xếp hàng trước hay sau:

```ts
console.log('A');

setTimeout(() => console.log('B'), 0);

Promise.resolve()
  .then(() => console.log('C'))
  .then(() => console.log('D'));

console.log('E');
```

```text
A
E
C
D
B
```

`A` và `E` là code đồng bộ nên chạy trước tiên. `C` và `D` là microtask nên chạy trước `B`, dù `setTimeout` được gọi trước `Promise.resolve().then(...)` trong source code.

## Theo dấu một luồng đầy đủ

Ví dụ sau kết hợp timer, `queueMicrotask` và Promise lồng nhau:

```ts
console.log('script:start');

setTimeout(() => console.log('timer'), 0);

queueMicrotask(() => console.log('microtask:direct'));

Promise.resolve().then(() => {
  console.log('microtask:promise');
  queueMicrotask(() => console.log('microtask:nested'));
});

console.log('script:end');
```

Diễn tiến qua từng bước của event loop:

```text
Task script:
  log script:start
  đăng ký timer callback vào Web APIs
  enqueue microtask:direct
  enqueue microtask:promise
  log script:end

Call stack rỗng → drain microtask queue:
  chạy microtask:direct
  chạy microtask:promise
    enqueue microtask:nested (thêm trong lúc đang drain)
  chạy microtask:nested

Task tiếp theo (timer):
  log timer
```

Microtask được thêm vào trong lúc đang drain (`microtask:nested`) vẫn được chạy trong cùng lượt drain đó, trước khi event loop chuyển sang task `timer`. Đây cũng là lý do một chuỗi microtask tự tạo ra microtask mới liên tục có thể khiến event loop không bao giờ tới được task tiếp theo — chi tiết ở phần [Microtask starvation](#microtask-starvation).

## `async/await` không biến code thành đồng bộ

`async/await` là cú pháp viết gọn cho Promise; nó không thay đổi cơ chế task/microtask ở trên:

```ts
async function load(): Promise<void> {
  console.log('before');
  await Promise.resolve();
  console.log('after');
}

console.log('start');
load();
console.log('end');
```

```text
start
before
end
after
```

Phần code trước `await` chạy đồng bộ, ngay khi `load()` được gọi. Khi gặp `await`, function tạm dừng và trả quyền điều khiển lại cho nơi gọi nó — đó là lý do `end` được log trước `after`. Phần code sau `await` được lên lịch chạy như một microtask, khi Promise đã settle.

## Promise là một state machine

Một Promise chỉ có ba trạng thái và di chuyển một chiều:

```text
pending → fulfilled
pending → rejected
```

Một khi đã settled (fulfilled hoặc rejected), trạng thái không thay đổi nữa — gọi `resolve`/`reject` thêm lần nữa không có tác dụng:

```ts
const promise = new Promise<number>((resolve, reject) => {
  resolve(1);
  resolve(2);
  reject(new Error('late'));
});

promise.then(console.log); // 1
```

Hàm executor truyền vào `new Promise(...)` chạy đồng bộ, ngay tại chỗ gọi, chứ không đợi đến lượt nào cả:

```ts
console.log('A');

new Promise<void>(resolve => {
  console.log('B');
  resolve();
}).then(() => console.log('C'));

console.log('D');
// A, B, D, C
```

`B` chạy ngay trong lúc `new Promise(...)` được tạo. `.then(...)` luôn chạy như một microtask, nên `C` xuất hiện sau `D`.

Vì executor đã chạy đồng bộ, không cần bọc một API đã trả sẵn Promise (như `fetch`) bằng `new Promise` nữa — cách bọc thừa đó dễ làm mất error hoặc cancellation gốc của API.

## Promise chaining và error propagation

Khi bước sau phụ thuộc kết quả của bước trước, mỗi `.then` cần `return` Promise của bước đó để chain chờ đúng thứ tự:

```ts
authenticate()
  .then(token => fetchProfile(token))
  .then(profile => renderProfile(profile))
  .catch(error => showError(error));
```

Thiếu `return` là lỗi phổ biến:

```ts
authenticate().then(token => {
  fetchProfile(token); // không return
}).catch(handleError);
```

Chain ngoài không chờ `fetchProfile` hoàn thành, và nếu `fetchProfile` reject, lỗi đó không đi vào `catch` phía trên — nó trở thành một unhandled rejection riêng biệt.

Một `catch` xử lý xong sẽ biến chain từ rejected trở lại thành fulfilled:

```ts
fetchData()
  .catch(error => {
    log(error);
    return [];
  })
  .then(items => render(items));
```

Sau `catch`, chain tiếp tục với giá trị `[]` như thể không có lỗi. Điều này đúng khi fallback là chủ đích thiết kế. Nếu caller phía trên vẫn cần biết là đã có lỗi, phải throw lại trong `catch`:

```ts
catch (error) {
  log(error);
  throw error;
}
```

## Error qua `await`

Khi một Promise bị `await` reject, nó trở thành một exception ngay tại dòng `await` đó, và có thể bắt bằng `try/catch` bình thường:

```ts
async function loadOrder(): Promise<Order> {
  try {
    const response = await fetch('/api/orders/1');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw toApplicationError(error);
  }
}
```

`fetch` không tự reject chỉ vì response có status `404` hay `500` — cần kiểm tra `response.ok` và tự throw. `fetch` chỉ reject khi có network error hoặc request bị hủy.

Một hệ thống rõ ràng thường phân trách nhiệm xử lý lỗi theo từng lớp:

```text
API layer     → chuẩn hóa lỗi kỹ thuật thành một dạng lỗi chung
Feature layer → quyết định retry hoặc fallback
UI layer      → trình bày message và action cho người dùng
Global layer  → bắt lỗi còn sót lại, gửi telemetry
```

## Chạy tuần tự hay song song

Chạy tuần tự khi bước sau thực sự cần kết quả của bước trước:

```ts
const user = await loadUser();
const permissions = await loadPermissions(user.id);
```

Chạy song song khi hai thao tác độc lập với nhau:

```ts
const [user, settings] = await Promise.all([
  loadUser(),
  loadSettings(),
]);
```

Viết tuần tự cho hai thao tác độc lập là lỗi hiệu năng thường gặp: latency của chúng cộng dồn thay vì chồng lên nhau.

Ngoài `Promise.all`, còn ba combinator khác cho các tình huống khác nhau:

| API | Hành vi |
|---|---|
| `Promise.all` | Thành công khi tất cả thành công; reject ngay khi một Promise reject |
| `Promise.allSettled` | Luôn chờ tất cả, trả về trạng thái (fulfilled/rejected) của từng Promise |
| `Promise.race` | Settle theo Promise đầu tiên settle, dù fulfilled hay rejected |
| `Promise.any` | Fulfill theo Promise đầu tiên fulfilled; chỉ reject nếu tất cả đều rejected |

`Promise.all` reject sớm không tự hủy các Promise còn lại — chúng vẫn tiếp tục chạy, chỉ là kết quả của chúng không còn được chain xử lý tiếp.

## Giới hạn concurrency

Gọi `Promise.all` với hàng nghìn phần tử có thể tạo ra hàng nghìn request cùng lúc:

```ts
await Promise.all(files.map(file => upload(file)));
```

Khi tài nguyên phía server hoặc trình duyệt có giới hạn, cần giới hạn số lượng thao tác chạy đồng thời. Cách đơn giản nhất là chia thành từng nhóm nhỏ và chờ hết một nhóm mới sang nhóm tiếp theo:

```ts
const batchSize = 2;

for (let start = 0; start < files.length; start += batchSize) {
  const batch = files.slice(start, start + batchSize);
  await Promise.all(batch.map(file => upload(file)));
}
```

Cách này giới hạn đúng số lượng request cùng lúc, nhưng có một nhược điểm: nếu một phần tử trong nhóm xong sớm, nó vẫn phải chờ các phần tử còn lại trong cùng nhóm xong mới được sang nhóm kế tiếp — tài nguyên có lúc bị nhàn rỗi giữa hai nhóm.

### Triển khai bằng worker pool

Cách khắc phục nhược điểm trên là dùng một số lượng "worker" cố định; mỗi worker tự lấy phần tử tiếp theo ngay khi nó rảnh, không cần chờ cả nhóm cùng xong:

```ts
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  project: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] = await project(items[index]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
```

Mỗi `worker` tự lấy index tiếp theo và xử lý tuần tự trong phạm vi của nó; nhiều `worker` chạy song song tạo ra giới hạn concurrency mong muốn, mà không để tài nguyên nhàn rỗi giữa các nhóm như cách chia batch ở trên. Đây cũng là lúc phân biệt hai khái niệm hay bị nhầm: concurrency là nhiều I/O operation cùng ở trạng thái "đang chờ", còn parallelism là nhiều đoạn code chạy thật sự cùng lúc trên nhiều thread — JavaScript callback vẫn luôn chạy lần lượt trên một call stack duy nhất, dù các operation I/O phía sau có thể in-flight song song.

## `finally` và loading state

`finally` chạy bất kể Promise fulfilled hay rejected, phù hợp để dọn dẹp trạng thái hoặc resource:

```ts
async function submit(): Promise<void> {
  setLoading(true);

  try {
    await save();
    showSuccess();
  } catch (error) {
    showError(toUserMessage(error));
  } finally {
    setLoading(false);
  }
}
```

Một boolean loading duy nhất không đủ khi nhiều thao tác chạy đồng thời: request A hoàn thành có thể tắt loading trong khi request B vẫn đang chạy, khiến UI hiển thị sai trạng thái. Khi có nhiều owner cùng ghi vào một state, cần một counter hoặc một cờ loading riêng cho từng owner.

## Rendering và scheduler

Trình duyệt không bắt buộc phải render lại màn hình ngay sau mỗi statement thay đổi DOM. Các thay đổi thường được gom lại và chỉ áp dụng vào một rendering opportunity, khi main thread rảnh.

```ts
element.textContent = 'Loading';
runExpensiveSynchronousWork();
element.textContent = 'Done';
```

Nếu `runExpensiveSynchronousWork` chạy đủ lâu và chặn main thread liên tục, người dùng có thể không bao giờ nhìn thấy `"Loading"` — trình duyệt gộp cả hai lần gán `textContent` vào cùng một lần render, sau khi task kết thúc.

`requestAnimationFrame` dành riêng cho các thay đổi cần đồng bộ với frame render kế tiếp, ví dụ animation:

```ts
requestAnimationFrame(() => {
  element.style.transform = `translateX(${position}px)`;
});
```

Nó không phải công cụ chung để trì hoãn logic — chỉ dùng khi thay đổi thực sự gắn với một frame hình ảnh.

## Microtask starvation

Vì event loop drain toàn bộ microtask queue trước khi chuyển sang task tiếp theo, một microtask liên tục tạo ra microtask mới sẽ khiến event loop không bao giờ thoát khỏi bước drain — task tiếp theo và cả rendering opportunity đều bị trì hoãn vô thời hạn:

```ts
function loop(): void {
  queueMicrotask(loop);
}

loop();
```

Không phải cứ dùng Promise hay microtask là "nhanh hơn" — scheduler vẫn cần được nhường lại để xử lý input và render. Với công việc CPU nặng, nên:

- chia nhỏ công việc và chủ động yield giữa các phần;
- cân nhắc chuyển sang Web Worker nếu công việc đủ lớn;
- tránh loop nặng chạy liên tục trên main thread;
- đo long task bằng tab Performance của DevTools để xác nhận.

## Ứng dụng trong Angular và RxJS

Mô hình task/microtask ở trên giải thích trực tiếp một số hành vi thường gặp khi làm việc với Angular:

- callback của HTTP request hay lifecycle hook chạy như một task hoặc microtask, tùy API bên dưới;
- loading state đổi trước/sau một `await` đúng theo thứ tự task/microtask đã trình bày, không phải theo thứ tự viết trong source code;
- Zone.js phát hiện async activity bằng cách patch các API bất đồng bộ (`setTimeout`, `Promise`, DOM event...) để biết khi nào cần chạy change detection;
- một task CPU dài chặn main thread sẽ làm toàn bộ UI Angular đứng lại, kể cả khi không có async code nào liên quan.

Promise và Observable không thay thế cho nhau: Promise đại diện cho đúng một kết quả trong tương lai và không có cách hủy nguyên bản; Observable có thể phát nhiều giá trị theo thời gian và có lifecycle unsubscribe rõ ràng. Vì vậy, không nên chuyển mọi Observable sang Promise chỉ để dùng được `await` — làm vậy có thể làm mất phần semantics stream (nhiều giá trị, hủy giữa chừng) mà Observable cung cấp.

## Debug một luồng bất đồng bộ

Khi thứ tự log hoặc dữ liệu hiển thị không đúng như kỳ vọng, kiểm tra lần lượt:

1. Phần nào của code chạy đồng bộ, trước khi chạm vào async boundary đầu tiên.
2. Thao tác bất đồng bộ đó do trình duyệt hay thư viện nào quản lý.
3. Callback tiếp tục bằng một task hay một microtask.
4. Promise nào đang được `return` hoặc `await`, và Promise nào bị bỏ sót.
5. Lỗi đang đi qua chain hoặc `try/catch` nào.
6. Các thao tác độc lập đang chạy tuần tự hay đồng thời.
7. Thao tác đó có owner rõ ràng và có thể hủy khi không cần nữa hay không.
8. Dùng tab Performance/Network của DevTools để xác nhận timeline thực tế.

## Thực hành

1. Dự đoán kết quả của mười đoạn code trộn script đồng bộ, Promise, `setTimeout` và `async/await`, sau đó chạy thử để đối chiếu.
2. Tìm hai API độc lập đang được gọi tuần tự trong một luồng thực tế, refactor sang `Promise.all`.
3. Viết một loading tracker hoạt động đúng khi ba request chạy đồng thời và hoàn thành ở các thời điểm khác nhau.
4. Viết một flow có fallback khi lỗi, nhưng vẫn phân biệt được hai trường hợp "không có dữ liệu" và "request thất bại".
5. Tạo một long task cố ý, quan sát bằng tab Performance, sau đó chia nhỏ công việc để giảm thời gian chặn main thread.

## Tổng kết

- Bất đồng bộ nghĩa là khởi tạo một thao tác và nhận kết quả sau, thay vì đứng chờ ngay tại chỗ.
- Call stack chạy code đồng bộ; Web APIs xử lý phần chờ đợi; kết quả quay lại qua task queue hoặc microtask queue.
- Event loop liên tục lấy một task, chạy đến khi stack rỗng, rồi drain hết microtask queue trước khi sang task tiếp theo.
- Run-to-completion đảm bảo một task đang chạy không bị chen ngang giữa chừng.
- `async/await` chỉ là cú pháp cho Promise; phần sau `await` luôn chạy như một microtask.
- Promise là state machine một chiều: pending chỉ chuyển sang fulfilled hoặc rejected đúng một lần.
- Thiếu `return` trong `.then` làm chain cha không chờ đúng thao tác con, và có thể làm mất lỗi.
- Chọn chạy tuần tự hay song song dựa trên việc các thao tác có phụ thuộc nhau hay không.
- `Promise.all` reject sớm không tự hủy các Promise còn lại đang chạy.
- Microtask liên tục tạo microtask mới có thể khiến task tiếp theo và rendering bị trì hoãn vô thời hạn.
