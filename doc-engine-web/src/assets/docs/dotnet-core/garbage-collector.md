# Garbage Collector (GC) trong .NET Core

> Tài liệu này giải thích cách .NET Core tự động quản lý bộ nhớ qua Garbage Collector, các nguyên nhân memory leak phổ biến dù có GC, và cách giảm áp lực GC trong code thực tế. Đây là kiến thức nền tảng để chẩn đoán sự cố tăng RAM dần theo thời gian hoặc độ trễ tăng đột biến theo chu kỳ trong ứng dụng .NET.

---

## Mục tiêu tài liệu

Sau khi đọc xong, người đọc cần trả lời được các câu hỏi sau:

```text
1. Stack và Heap khác nhau thế nào? Value type/reference type nằm ở đâu?
2. GC quyết định một object "chết" hay "sống" dựa trên điều gì?
3. Vì sao GC chia object thành Gen0/Gen1/Gen2? Large Object Heap là gì?
4. Workstation GC và Server GC khác nhau thế nào, khi nào dùng loại nào?
5. Có GC rồi thì memory leak trong .NET còn xảy ra được không? Xảy ra thế nào?
6. IDisposable/using giải quyết vấn đề gì mà GC không tự làm được?
7. Làm sao giảm áp lực lên GC trong code hot path?
8. Dùng công cụ nào để chẩn đoán vấn đề bộ nhớ trong production?
9. Khi review code, cần nhìn vào những điểm nào liên quan tới GC?
```

---

## 1. Heap và Stack — nền tảng trước khi nói về GC

### 1.1. Stack là gì

Stack là vùng nhớ lưu trạng thái thực thi của từng lời gọi hàm: biến local, tham số, địa chỉ trả về. Mỗi thread có một stack riêng của mình.

```csharp
void Calculate()
{
    int a = 5;       // nằm trên stack
    int b = 10;      // nằm trên stack
    int sum = a + b; // nằm trên stack
}
```

Đặc điểm của stack:

```text
- Cấp phát/giải phóng cực nhanh: chỉ cần dịch một con trỏ (stack pointer), không cần GC can thiệp.
- Tự động biến mất ngay khi hàm kết thúc (ra khỏi scope).
- Kích thước giới hạn (mặc định khoảng 1MB/thread) — đệ quy quá sâu gây StackOverflowException.
- Hoạt động theo cơ chế LIFO (Last In First Out), giống một chồng đĩa.
```

Minh họa với lời gọi hàm lồng nhau:

```text
Main()
  gọi Calculate()
    → một stack frame mới được đẩy lên trên cùng, chứa a, b, sum
    → Calculate() kết thúc, frame bị gỡ bỏ, a/b/sum biến mất ngay lập tức
  Main() tiếp tục chạy với frame của chính nó
```

### 1.2. Heap là gì

Heap là vùng nhớ dùng chung cho toàn bộ ứng dụng, nơi các object (reference type) được cấp phát — đây chính là **managed heap** sẽ được nói kỹ ở mục 2. Khác với stack, một object trên heap không tự mất đi khi hàm tạo ra nó kết thúc; nó sống cho tới khi không còn ai reach tới, và việc dọn dẹp là nhiệm vụ của GC.

```csharp
Order CreateOrder()
{
    var order = new Order(); // object Order nằm trên heap
    return order;
}
// biến local "order" (chỉ là một reference) nằm trên stack của hàm CreateOrder,
// và biến mất khi hàm kết thúc — nhưng object Order thật sự trên heap vẫn còn sống
// vì caller đang giữ reference tới nó (giá trị trả về được gán cho một biến khác).
```

### 1.3. Value type và Reference type: ai nằm ở đâu

Đây là điểm dễ hiểu sai nhất: không phải "value type luôn ở stack, reference type luôn ở heap" một cách tuyệt đối. Vị trí thật sự phụ thuộc vào **ngữ cảnh khai báo**.

```csharp
struct Point { public int X; public int Y; }        // value type
class Order { public int Id; public Point Location; } // reference type

void Example()
{
    Point p = new Point { X = 1, Y = 2 }; // p nằm hẳn trên stack (biến local, value type)

    Order order = new Order();            // object Order nằm trên heap,
                                           // biến "order" (reference) nằm trên stack

    order.Location = p;                   // Point được COPY vào heap,
                                           // nằm bên trong chính object Order
}
```

Rule chính xác hơn:

```text
Value type (struct, int, double, bool...) khai báo là biến local hoặc tham số
→ nằm trên stack.

Value type là field bên trong một class (reference type)
→ nằm trên heap, ngay bên trong object chứa nó.

Reference type (class) luôn được cấp phát trên heap.
Biến chỉ giữ một địa chỉ tham chiếu tới object đó,
và bản thân biến tham chiếu (con trỏ) đó mới là thứ nằm trên stack.
```

### 1.4. Vì sao phân biệt điều này quan trọng khi nói về GC

```text
GC chỉ quan tâm tới HEAP. Nó không cần dọn gì trên stack,
vì stack tự giải phóng ngay khi một hàm kết thúc, không cần thu hồi.

Áp lực lên GC tỷ lệ thuận với số lượng object được cấp phát trên heap.
Dùng value type đúng chỗ (biến local, không boxing) giúp giảm hẳn
số lượng object heap mà GC phải theo dõi — đây là lý do mục 7
(giảm áp lực GC) khuyên dùng struct cho dữ liệu nhỏ, ngắn hạn.
```

Ví dụ so sánh trực tiếp áp lực lên GC:

```csharp
// Tạo 1 triệu object trên heap — GC phải theo dõi và thu hồi từng cái
for (int i = 0; i < 1_000_000; i++)
{
    var p = new PointClass(i, i); // class → heap allocation mỗi vòng lặp
}

// Không tạo object heap nào — chỉ tái sử dụng vùng nhớ trên stack
for (int i = 0; i < 1_000_000; i++)
{
    var p = new PointStruct(i, i); // struct, biến local → nằm trên stack, GC không cần quan tâm
}
```

---

## 2. Vì sao cần Garbage Collector

### 2.1. Managed heap

Trong .NET, hầu hết object (reference type) được cấp phát trên **managed heap**. Thay vì lập trình viên tự gọi giải phóng bộ nhớ như C/C++, CLR (Common Language Runtime) tự động dọn dẹp object không còn được dùng tới.

```csharp
var order = new Order(); // cấp phát trên managed heap
```

Lập trình viên không cần (và không nên) tự viết code giải phóng `order` — GC sẽ tự lo việc đó khi xác định `order` không còn ai tham chiếu tới.

### 2.2. GC xác định object "sống" hay "chết" thế nào

GC không đếm reference count như một số ngôn ngữ khác. Nó dùng thuật toán **mark and sweep** dựa trên khái niệm **reachability**:

```text
Xuất phát từ "root" (biến local đang dùng, static field, register CPU...),
GC đi theo mọi reference có thể tới được.

Object nào "with reach được" từ root → còn sống.
Object nào không ai reach tới được nữa → coi là rác, có thể thu hồi.
```

Ví dụ:

```csharp
void Process()
{
    var order = new Order();
    order.Customer = new Customer();
    // ... dùng order ...
} // hết hàm, order ra khỏi scope

// Sau khi Process() kết thúc, không còn root nào trỏ tới order hay Customer bên trong nó
// → cả hai đều là ứng viên bị thu hồi ở lần GC tiếp theo.
```

---

## 3. Generational GC

### 3.1. Vì sao chia thế hệ (generation)

.NET GC dựa trên một quan sát thống kê gọi là **generational hypothesis**: phần lớn object chết rất nhanh sau khi tạo ra (biến tạm, DTO, object trung gian trong một request), chỉ số ít object sống lâu (cache, singleton state, connection).

Thay vì quét toàn bộ heap mỗi lần GC chạy (rất tốn), .NET chia heap thành các thế hệ:

```text
Gen0 → object mới tạo. GC Gen0 chạy rất thường xuyên, rất nhanh (thường vài ms).
Gen1 → object sống sót qua ít nhất một lần GC Gen0. Vùng đệm giữa Gen0 và Gen2.
Gen2 → object sống lâu (singleton, cache dài hạn, static data). GC Gen2 tốn kém hơn nhiều.
```

Vòng đời điển hình:

```text
new Order() → nằm ở Gen0.
Nếu sống sót qua GC Gen0 → được "promote" lên Gen1.
Nếu tiếp tục sống sót qua GC Gen1 → được promote lên Gen2.
```

### 3.2. Large Object Heap (LOH) và Pinned Object Heap (POH)

```text
Object có kích thước từ 85.000 byte trở lên (mảng lớn, string dài, byte[] lớn)
được cấp phát trực tiếp vào Large Object Heap (LOH), không nằm trong Gen0.

LOH được GC ở cùng thời điểm với Gen2 (tốn kém), và trước .NET Core một số phiên bản
LOH không được compact (dồn lại) sau khi thu hồi, dễ gây phân mảnh bộ nhớ (fragmentation).

Pinned Object Heap (POH, từ .NET 5) dành cho object bị "ghim" (pinned) —
ví dụ buffer dùng cho interop với code không quản lý (native code) —
tách riêng để không làm phân mảnh các heap khác.
```

Hệ quả thực tế: cấp phát liên tục các mảng/string lớn (ví dụ đọc file lớn vào `byte[]` mới mỗi lần) tạo áp lực trực tiếp lên LOH, một trong những nguyên nhân phổ biến gây tăng RAM dần theo thời gian.

---

## 4. Cách GC chạy

### 4.1. Mark and Sweep, Compact

```text
Mark   → GC đánh dấu mọi object còn reach được từ root.
Sweep  → object không được đánh dấu bị coi là rác, vùng nhớ được thu hồi.
Compact → GC dồn các object còn sống lại liền nhau, loại bỏ khoảng trống,
          giúp cấp phát object mới nhanh hơn (chỉ cần dịch một con trỏ).
```

### 4.2. Workstation GC vs Server GC

```text
Workstation GC
→ Tối ưu cho ứng dụng có ít core, độ trễ thấp là ưu tiên (ứng dụng desktop).
→ Chạy trên cùng thread với ứng dụng (có thể có phần concurrent).

Server GC
→ Tối ưu cho throughput cao, dùng nhiều heap song song (mỗi core một heap logic).
→ Phù hợp cho ASP.NET Core API chạy trên server nhiều core.
→ Tốn RAM hơn Workstation GC nhưng xử lý được nhiều allocation hơn mỗi giây.
```

Cấu hình trong `.csproj`:

```xml
<PropertyGroup>
  <ServerGarbageCollection>true</ServerGarbageCollection>
  <ConcurrentGarbageCollection>true</ConcurrentGarbageCollection>
</PropertyGroup>
```

Hầu hết ASP.NET Core API chạy trên server nên bật `ServerGarbageCollection`. Ứng dụng chạy trong container với giới hạn CPU/RAM thấp (ví dụ 1 core, một số sidecar nhỏ) đôi khi phù hợp hơn với Workstation GC vì Server GC mặc định cấp phát heap theo số core, có thể lãng phí RAM nếu container chỉ có 1 core.

### 4.3. Concurrent/Background GC

```text
GC Gen2 (tốn kém) có thể chạy ở chế độ background — một phần công việc mark
chạy song song với ứng dụng, giảm thời gian ứng dụng bị "đứng hình" (pause)
so với GC Gen2 chạy hoàn toàn blocking.
```

---

## 5. IDisposable, Finalizer và using pattern

### 5.1. GC không tự dọn tài nguyên "không quản lý" (unmanaged)

GC chỉ biết dọn managed memory. Nó **không biết cách** đóng file handle, connection database, socket, hoặc bất kỳ tài nguyên nào do hệ điều hành cấp phát bên ngoài managed heap.

```csharp
public class ReportGenerator : IDisposable
{
    private readonly FileStream _stream;

    public ReportGenerator(string path)
    {
        _stream = new FileStream(path, FileMode.Create);
    }

    public void Dispose()
    {
        _stream.Dispose(); // đóng file handle ngay lập tức, không chờ GC
    }
}
```

Nếu không gọi `Dispose()`, file handle vẫn bị giữ cho tới khi GC chạy tới finalizer của object này — có thể rất lâu sau, gây ra tình trạng "quá nhiều file đang mở" dù object C# đã ra khỏi scope từ lâu.

### 5.2. `using` đảm bảo Dispose được gọi đúng lúc

```csharp
using (var generator = new ReportGenerator(path))
{
    generator.Build();
} // Dispose() được gọi ngay khi ra khỏi block, kể cả khi có exception
```

```csharp
await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
```

`await using` dùng cho `IAsyncDisposable`, phù hợp với tài nguyên cần giải phóng bất đồng bộ (connection, stream mạng).

### 5.3. Dispose pattern chuẩn khi có cả managed và unmanaged resource

```csharp
public class NativeResourceWrapper : IDisposable
{
    private IntPtr _handle;
    private bool _disposed;

    public NativeResourceWrapper()
    {
        _handle = AllocateNativeHandle();
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed) return;

        if (disposing)
        {
            // giải phóng managed resource (nếu có)
        }

        ReleaseNativeHandle(_handle); // luôn giải phóng unmanaged resource
        _disposed = true;
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this); // báo GC không cần gọi finalizer nữa vì đã dọn xong
    }

    ~NativeResourceWrapper()
    {
        Dispose(false); // lưới an toàn cuối cùng nếu quên gọi Dispose()
    }
}
```

Finalizer (`~ClassName`) là lưới an toàn cuối cùng, không phải cơ chế chính để giải phóng tài nguyên — vì finalizer chạy trên một thread riêng của GC, không xác định trước thời điểm, và làm chậm việc thu hồi object (object có finalizer cần ít nhất 2 lần GC mới thực sự bị dọn).

---

## 6. Nguyên nhân memory leak phổ biến dù có GC

GC không thể thu hồi một object nếu **vẫn còn ai đó reach tới nó được** — đây chính là kẽ hở khiến .NET vẫn leak memory dù có GC tự động.

### 6.1. Static event handler không unsubscribe

```csharp
public class NotificationHub
{
    public static event Action<string> OnMessage;
}

public class ChatWidget
{
    public ChatWidget()
    {
        NotificationHub.OnMessage += HandleMessage; // đăng ký
    }

    private void HandleMessage(string msg) { ... }

    // Không có Dispose() để gỡ đăng ký
}
```

```text
NotificationHub.OnMessage là static → sống suốt vòng đời ứng dụng.
Mỗi ChatWidget được tạo ra đều bị "root" giữ lại thông qua delegate OnMessage,
dù ChatWidget không còn được UI/code nào khác dùng tới nữa.
GC không thể thu hồi ChatWidget vì static event vẫn còn reference tới nó.
```

Cách khắc phục:

```csharp
public class ChatWidget : IDisposable
{
    public ChatWidget()
    {
        NotificationHub.OnMessage += HandleMessage;
    }

    private void HandleMessage(string msg) { ... }

    public void Dispose()
    {
        NotificationHub.OnMessage -= HandleMessage; // gỡ đăng ký, phá bỏ root
    }
}
```

### 6.2. Singleton giữ reference tới object có vòng đời ngắn hơn

```csharp
public class CacheService // đăng ký Singleton trong DI
{
    private readonly List<Action> _callbacks = new();

    public void Register(Action callback)
    {
        _callbacks.Add(callback);
    }
}
```

Nếu một service có vòng đời ngắn (Scoped, gắn theo từng request) đăng ký callback vào `CacheService` (Singleton) nhưng không bao giờ gỡ ra, mỗi request để lại một callback không bao giờ được thu hồi — `_callbacks` phình to dần theo số request, dẫn tới tăng RAM liên tục cho tới khi hết bộ nhớ.

### 6.3. Cache/Dictionary tĩnh không có giới hạn

```csharp
public static class ProductCache
{
    private static readonly Dictionary<int, Product> _cache = new();

    public static void Add(int id, Product product)
    {
        _cache[id] = product; // không bao giờ xóa
    }
}
```

Không có TTL, không có giới hạn kích thước, không có cơ chế eviction — cache này tăng vô hạn theo số sản phẩm khác nhau từng được truy cập trong suốt vòng đời ứng dụng.

### 6.4. Closure bắt giữ biến ngoài trong callback dài hạn

```csharp
public void SubscribeToLargeReport(Report largeReport)
{
    _timer.Elapsed += (s, e) =>
    {
        Console.WriteLine(largeReport.Summary); // closure giữ toàn bộ largeReport
    };
}
```

Nếu `_timer` sống lâu (ví dụ timer chạy suốt vòng đời ứng dụng), closure bên trong giữ luôn toàn bộ `largeReport` — kể cả khi chỉ cần một trường nhỏ (`Summary`), toàn bộ object lớn không được GC vì closure vẫn còn reach tới nó.

---

## 7. Giảm áp lực lên GC

Giảm số lượng object cấp phát (allocation) trong đường xử lý nóng (hot path) giúp GC chạy ít hơn, giảm độ trễ do GC pause gây ra.

### 7.1. Value type (struct) thay vì reference type (class) cho dữ liệu nhỏ, ngắn hạn

```csharp
public readonly struct Point
{
    public readonly double X;
    public readonly double Y;

    public Point(double x, double y) { X = x; Y = y; }
}
```

`struct` được cấp phát trên stack (khi dùng như biến local, không phải field của class), không tạo áp lực lên managed heap, không cần GC thu hồi. Cẩn thận với **boxing**: đưa struct vào biến kiểu `object` hoặc interface sẽ khiến nó bị "boxing" lên heap, mất lợi ích này.

```csharp
object boxed = new Point(1, 2); // boxing — Point giờ nằm trên heap
```

### 7.2. `StringBuilder` thay vì nối chuỗi trong vòng lặp

```csharp
// Tệ — mỗi lần += tạo ra một string mới trên heap
string result = "";
foreach (var item in items)
{
    result += item.Name + ", ";
}
```

```csharp
// Tốt — một buffer duy nhất, ít allocation hơn hẳn
var sb = new StringBuilder();
foreach (var item in items)
{
    sb.Append(item.Name).Append(", ");
}
string result = sb.ToString();
```

Với vòng lặp lớn, cách nối chuỗi bằng `+=` tạo ra rất nhiều string trung gian bị vứt bỏ ngay, đẩy áp lực lên Gen0 GC.

### 7.3. `ArrayPool<T>` và Object Pooling

```csharp
var pool = ArrayPool<byte>.Shared;
byte[] buffer = pool.Rent(4096);
try
{
    await stream.ReadAsync(buffer, 0, 4096);
}
finally
{
    pool.Return(buffer); // trả lại pool để dùng lại, không cấp phát mới lần sau
}
```

Với code chạy rất thường xuyên (đọc buffer trong middleware, xử lý stream), dùng lại mảng thay vì cấp phát mới mỗi lần giảm đáng kể số lượng object Gen0.

### 7.4. `Span<T>` / `Memory<T>`

```csharp
public static int CountDigits(ReadOnlySpan<char> text)
{
    int count = 0;
    foreach (var c in text)
    {
        if (char.IsDigit(c)) count++;
    }
    return count;
}
```

`Span<T>` cho phép làm việc với một phần của mảng/chuỗi mà **không cấp phát bản sao mới**, hữu ích khi parse chuỗi/mảng lớn trong code chạy thường xuyên.

---

## 8. Công cụ chẩn đoán vấn đề bộ nhớ

```bash
# Theo dõi realtime số liệu GC, heap size, allocation rate
dotnet-counters monitor -p <process-id> --counters System.Runtime

# Chụp lại toàn bộ managed heap để phân tích object nào đang chiếm nhiều RAM nhất
dotnet-gcdump collect -p <process-id>

# Trace chi tiết các sự kiện GC theo thời gian, dùng khi cần phân tích sâu
dotnet-trace collect -p <process-id> --providers Microsoft-Windows-DotNETRuntime
```

Quy trình chẩn đoán thực tế khi nghi ngờ memory leak:

```text
1. Theo dõi RAM theo thời gian — có tăng liên tục không hồi phục sau GC không?
2. Nếu có, chụp gcdump ở hai thời điểm cách nhau vài giờ.
3. So sánh số lượng instance của từng loại object giữa hai lần chụp.
4. Loại object nào tăng đều đặn, không giảm sau Gen2 GC → nghi ngờ đang bị giữ reference
   ở đâu đó không nên giữ (static, singleton, event handler).
5. Dò ngược "retention path" (ai đang giữ reference tới object đó) trong công cụ phân tích dump.
```

---

## 9. Case Studies

### 9.1. Case Study 1 — Singleton subscribe event của service ngắn hạn

#### Bối cảnh

```text
Một AuditService được đăng ký Scoped (theo từng request) trong DI container.
Trong constructor, AuditService subscribe vào một event tĩnh của SystemClock
(đăng ký Singleton) để log mỗi khi có thay đổi giờ hệ thống.

public class AuditService
{
    public AuditService(SystemClock clock)
    {
        clock.TimeChanged += OnTimeChanged;
    }

    private void OnTimeChanged(object sender, EventArgs e) { ... }
}
```

Sau vài ngày chạy production, RAM tăng đều đặn, không giảm dù đã qua nhiều lần Gen2 GC.
```

#### Nguyên nhân gốc

```text
SystemClock (Singleton) sống suốt vòng đời ứng dụng.
Mỗi request tạo một AuditService mới (Scoped), subscribe vào TimeChanged.
Khi request kết thúc, AuditService lẽ ra phải bị GC, nhưng SystemClock.TimeChanged
vẫn giữ delegate trỏ tới đúng instance AuditService đó.
→ AuditService của MỌI request từ trước tới giờ đều bị giữ lại vĩnh viễn,
  không bao giờ được thu hồi.

Đây là dạng lỗi "event-based leak": bản chất một event C# (field kiểu delegate)
chính là một danh sách reference. Đăng ký (+=) là thêm reference vào danh sách đó,
và danh sách này thuộc về bên phát event (SystemClock), không thuộc về bên đăng ký
(AuditService) — nên vòng đời của reference đó do SystemClock quyết định, không phải
do scope của AuditService.
```

#### Cách phát hiện

```text
1. Theo dõi dotnet-counters, thấy "Gen 2 Heap Size" và "GC Heap Size" tăng đều
   đặn theo thời gian, không giảm sau các lần Gen2 GC.
2. Chụp dotnet-gcdump ở hai thời điểm cách nhau vài giờ, so sánh số lượng instance
   của AuditService — nếu số instance tăng gần đúng bằng số request đã xử lý
   (thay vì giữ ổn định quanh 0-1), đây là dấu hiệu rõ ràng của leak theo request.
3. Dùng chức năng "Path to Root" trong công cụ phân tích dump trên từng instance
   AuditService còn sống — sẽ thấy đường dẫn tham chiếu đi qua
   SystemClock.TimeChanged, xác nhận chính event này đang giữ nó lại.
```

#### Cách khắc phục

```csharp
public class AuditService : IDisposable
{
    private readonly SystemClock _clock;

    public AuditService(SystemClock clock)
    {
        _clock = clock;
        _clock.TimeChanged += OnTimeChanged;
    }

    private void OnTimeChanged(object sender, EventArgs e) { ... }

    public void Dispose()
    {
        _clock.TimeChanged -= OnTimeChanged;
    }
}
```

Vì `AuditService` là Scoped, ASP.NET Core tự động gọi `Dispose()` khi kết thúc scope (cuối request) — miễn là class có implement `IDisposable` đúng cách. Rule tổng quát: **service có vòng đời ngắn không nên subscribe event của object có vòng đời dài hơn mà không có cơ chế unsubscribe rõ ràng.**

### 9.2. Case Study 2 — Nối chuỗi lớn trong vòng lặp gây GC pause định kỳ

#### Bối cảnh

```text
Endpoint sinh log tổng hợp từ hàng chục nghìn dòng dữ liệu:

string logContent = "";
foreach (var entry in entries) // entries có thể tới 50.000 dòng
{
    logContent += $"{entry.Timestamp} - {entry.Message}\n";
}
```

Ứng dụng có độ trễ tăng đột biến theo chu kỳ vài giây một lần, trùng với thời điểm GC Gen2/LOH chạy.
```

#### Nguyên nhân gốc

```text
Mỗi lần += tạo ra một string mới (string trong .NET là immutable).
Với 50.000 vòng lặp, hàng chục nghìn string trung gian được tạo ra,
chuỗi càng dài, string mới càng lớn — nhanh chóng vượt ngưỡng 85.000 byte
và bị đẩy vào Large Object Heap.

LOH chỉ được GC cùng lúc với Gen2 (tốn kém), gây ra pause đáng kể mỗi khi chạy,
đúng bằng chu kỳ được quan sát trong log độ trễ.

Đáng chú ý: đây không phải leak (các string trung gian đều bị thu hồi đúng),
mà là vấn đề áp lực GC (GC pressure) — quá nhiều allocation trong thời gian ngắn
buộc GC phải chạy thường xuyên hơn và tốn kém hơn, gây pause ảnh hưởng tới
toàn bộ request khác đang chạy trên cùng tiến trình.
```

#### Cách phát hiện

```text
1. dotnet-counters cho thấy "Allocation Rate" (byte/giây) tăng vọt đúng thời điểm
   endpoint này được gọi, kèm "Gen 0 GC Count" và "Gen 2 GC Count" tăng bất thường.
2. dotnet-trace ghi lại timeline cho thấy các đợt GC Gen2/LOH trùng khớp chính xác
   với các đợt tăng độ trễ quan sát được ở tầng ứng dụng (APM/log).
3. Nhìn vào code review: bất kỳ vòng lặp nào nối chuỗi bằng += với số lần lặp lớn
   (hàng nghìn trở lên) đều nên bị đánh dấu nghi vấn ngay từ khi review,
   không cần đợi tới khi có triệu chứng thật trên production.
```

#### Cách khắc phục

```csharp
var sb = new StringBuilder(entries.Count * 64); // ước lượng trước capacity
foreach (var entry in entries)
{
    sb.Append(entry.Timestamp).Append(" - ").Append(entry.Message).Append('\n');
}
string logContent = sb.ToString();
```

`StringBuilder` dùng một buffer nội bộ được mở rộng dần (thường theo cấp số nhân), giảm số lượng object trung gian từ hàng chục nghìn xuống chỉ vài lần cấp phát lại buffer.

### 9.3. Case Study 3 — Cache tĩnh không giới hạn dẫn tới OutOfMemoryException

#### Bối cảnh

```text
Một service tính toán giá sản phẩm theo nhiều tham số (khách hàng, thời điểm,
khuyến mãi) được cache lại bằng Dictionary tĩnh để tránh tính toán lại:

private static readonly Dictionary<string, decimal> _priceCache = new();

public decimal GetPrice(string cacheKey, Func<decimal> calculate)
{
    if (!_priceCache.TryGetValue(cacheKey, out var price))
    {
        price = calculate();
        _priceCache[cacheKey] = price;
    }
    return price;
}
```

`cacheKey` được ghép từ customerId + thời điểm hiện tại (theo phút) + mã khuyến mãi — gần như luôn luôn là một key mới. Sau khoảng 2 tuần chạy production, ứng dụng crash với `OutOfMemoryException`.
```

#### Nguyên nhân gốc

```text
Vì cacheKey gần như không bao giờ trùng lặp (do có thành phần thời gian theo phút),
_priceCache thực chất không cache được gì hữu ích, chỉ tăng kích thước vô hạn.
Đây là cache tĩnh, sống suốt vòng đời ứng dụng, GC không thể thu hồi bất kỳ entry nào
vì Dictionary vẫn còn giữ reference tới tất cả.

Điểm dễ bị bỏ sót khi review: bản thân pattern "cache bằng Dictionary tĩnh"
trông rất vô hại và quen thuộc, lỗi thật sự nằm ở việc thiết kế cacheKey sai
khiến cache mất hết tác dụng cache mà vẫn âm thầm giữ mọi thứ lại.
```

#### Cách phát hiện

```text
1. RAM tăng chậm và đều trong nhiều ngày, không có đợt giảm nào — khác hẳn
   pattern "leak nhanh" của case 1, cho thấy đây là loại leak tích lũy dài hạn.
2. dotnet-gcdump cho thấy một instance Dictionary<string, decimal> duy nhất
   nhưng chiếm số lượng entry cực lớn (hàng triệu) và tiếp tục tăng.
3. Kiểm tra tỷ lệ cache hit/miss (nếu có instrument sẵn) — hit rate gần 0%
   là dấu hiệu cacheKey được thiết kế sai, cache không phục vụ đúng mục đích.
```

#### Cách khắc phục

```text
- Thiết kế lại cacheKey để thực sự có tính lặp lại hợp lý (ví dụ làm tròn theo giờ
  thay vì theo phút, bỏ thành phần không cần thiết).
- Dùng MemoryCache (có TTL và giới hạn kích thước) thay vì Dictionary tĩnh tự quản lý:

private readonly IMemoryCache _cache;

public decimal GetPrice(string cacheKey, Func<decimal> calculate)
{
    return _cache.GetOrCreate(cacheKey, entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        entry.SetSize(1);
        return calculate();
    });
}
```

`IMemoryCache` có thể cấu hình `SizeLimit` tổng và tự động loại bỏ entry cũ (eviction) khi vượt giới hạn — loại bỏ hoàn toàn nguy cơ tăng vô hạn như Dictionary tĩnh tự viết tay.
```

### 9.4. Case Study 4 — Middleware log giữ toàn bộ request/response lớn trong buffer tĩnh

#### Bối cảnh

```text
Để phục vụ audit, một middleware ghi lại request/response của các API quan trọng
vào một hàng đợi tĩnh trong bộ nhớ, dự định một background job sẽ flush ra file
định kỳ:

public class AuditLoggingMiddleware
{
    private static readonly ConcurrentQueue<AuditEntry> _pending = new();

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        var requestBody = await ReadBodyAsync(context.Request);
        await next(context);
        var responseBody = await ReadResponseBodyAsync(context.Response);

        _pending.Enqueue(new AuditEntry(requestBody, responseBody, DateTime.UtcNow));
        // background job flush _pending định kỳ... nhưng job này bị lỗi từ một bản deploy trước
        // và không ai phát hiện ra trong một thời gian dài.
    }
}
```

Background job flush dữ liệu bị lỗi âm thầm (exception bị nuốt, không có log/alert). RAM tăng nhanh hơn hẳn các case khác — vài giờ đã thấy rõ, đặc biệt với các endpoint có payload lớn (upload file, export báo cáo).
```

#### Nguyên nhân gốc

```text
_pending là static → sống suốt vòng đời ứng dụng.
Mỗi request (kể cả request có payload vài MB) đều bị giữ nguyên vẹn
requestBody + responseBody trong bộ nhớ, chờ một job flush đã âm thầm hỏng.
Không có giới hạn kích thước hàng đợi, không có cơ chế phát hiện khi job flush
ngừng hoạt động — hai lỗi thiết kế cộng dồn (thiếu giới hạn + thiếu giám sát)
biến một lỗi nhỏ (job flush hỏng) thành sự cố nghiêm trọng (OutOfMemoryException).
```

#### Cách phát hiện

```text
1. RAM tăng rất nhanh so với lưu lượng request thực tế — nghi ngờ ngay một
   cấu trúc dữ liệu tĩnh đang giữ payload lớn thay vì object nhỏ thông thường.
2. dotnet-gcdump cho thấy tổng kích thước của ConcurrentQueue<AuditEntry>
   chiếm phần lớn managed heap, với số lượng entry tăng đúng bằng số request
   đã xử lý kể từ khi job flush ngừng chạy.
3. Kiểm tra log của background job — phát hiện exception đã bị nuốt
   (catch rỗng hoặc catch không log) từ một thời điểm cụ thể, trùng khớp
   với thời điểm RAM bắt đầu tăng bất thường.
```

#### Cách khắc phục

```text
- Giới hạn kích thước hàng đợi tĩnh, từ chối/bỏ bớt entry mới khi vượt ngưỡng
  thay vì cho phép tăng vô hạn.
- Không nuốt exception trong background job — log và alert ngay khi job flush
  thất bại liên tiếp, để phát hiện sự cố trong vài phút thay vì vài tuần.
- Cân nhắc đẩy audit log ra một hệ thống bên ngoài (message queue, file, service
  logging chuyên dụng) thay vì giữ trong bộ nhớ tiến trình đang phục vụ request.
```

### 9.5. Case Study 5 — Boxing struct trong danh sách dùng chung gây áp lực GC bất ngờ

#### Bối cảnh

```text
Một hệ thống chấm điểm real-time lưu hàng triệu điểm dữ liệu dạng struct nhỏ
(timestamp + giá trị) vào một danh sách dùng chung để tổng hợp cuối ngày:

public readonly struct MetricPoint
{
    public readonly long TimestampTicks;
    public readonly double Value;
}

private readonly List<object> _points = new(); // khai báo nhầm kiểu List<object>

public void Record(MetricPoint point)
{
    _points.Add(point); // point (struct) bị boxing khi thêm vào List<object>
}
```

Hệ thống được thiết kế dùng `struct` với kỳ vọng tránh áp lực GC (đúng như mục 1.4 và 7.1 đã nói), nhưng thực tế Gen0 GC vẫn chạy rất thường xuyên và CPU dùng cho GC cao bất thường so với kỳ vọng.
```

#### Nguyên nhân gốc

```text
List<object> yêu cầu mọi phần tử là reference type. Khi thêm một struct
(MetricPoint) vào, CLR tự động "boxing" — tạo một bản sao của struct đó
trên heap và lưu reference tới bản sao này vào danh sách.

Kết quả: dùng struct không những không tránh được heap allocation như dự định,
mà còn tệ hơn một chút vì có thêm chi phí boxing/unboxing mỗi lần đọc/ghi.
Với hàng triệu điểm dữ liệu mỗi ngày, đây là hàng triệu object Gen0 hoàn toàn
không cần thiết nếu khai báo đúng kiểu ngay từ đầu.
```

#### Cách phát hiện

```text
1. dotnet-counters cho thấy "Allocation Rate" cao bất thường so với khối lượng
   dữ liệu thực tế (chỉ vài chục byte mỗi điểm dữ liệu nhưng allocation rate
   như đang xử lý object lớn).
2. dotnet-gcdump liệt kê một lượng lớn instance kiểu boxed struct
   (hiển thị dưới dạng System.Object bọc MetricPoint) trên Gen0/Gen1.
3. Review code: bất kỳ List<object>, Dictionary<TKey, object>, hoặc method
   nhận tham số kiểu object/interface mà truyền vào là struct đều là điểm
   nghi vấn boxing cần kiểm tra lại.
```

#### Cách khắc phục

```csharp
private readonly List<MetricPoint> _points = new(); // đúng kiểu, không còn boxing

public void Record(MetricPoint point)
{
    _points.Add(point); // struct được copy trực tiếp vào mảng nội bộ của List<T>, không lên heap riêng lẻ
}
```

Dùng generic `List<MetricPoint>` thay vì `List<object>` giữ nguyên toàn bộ lợi ích của value type: dữ liệu nằm liền nhau trong bộ nhớ nội bộ của List, không có boxing, không tạo thêm object rời rạc cho GC theo dõi.

### 9.6. Case Study 6 — Vòng lặp tạo hàng loạt Task.Run giữ closure lớn gây tăng RAM tạm thời

#### Bối cảnh

```text
Một batch job xử lý xuất báo cáo cho từng chi nhánh, chạy song song để nhanh hơn:

var reportTemplate = LoadLargeReportTemplate(); // object nặng, vài chục MB, dùng chung

var tasks = branches.Select(branch => Task.Run(() =>
{
    var report = BuildReport(branch, reportTemplate); // closure giữ cả reportTemplate
    SaveReport(branch.Id, report);
}));

await Task.WhenAll(tasks);
```

Với vài chục chi nhánh, RAM tăng vọt trong lúc batch job chạy, đôi khi chạm ngưỡng giới hạn container và bị nền tảng orchestration (Kubernetes/Docker) kill do vượt memory limit.
```

#### Nguyên nhân gốc

```text
Đây không hẳn là leak vĩnh viễn (RAM giảm lại sau khi job xong), nhưng là một
đợt tăng RAM tạm thời rất lớn: mỗi Task.Run tạo ra một closure, và closure đó
giữ reference tới reportTemplate dùng chung — bản thân điều này không nhân bản
reportTemplate, nhưng mỗi task còn giữ thêm report kết quả (cũng khá lớn) cho
tới khi SaveReport() hoàn tất và task kết thúc.

Chạy 50 chi nhánh song song nghĩa là 50 report lớn cùng tồn tại trên heap
tại cùng một thời điểm, thay vì xử lý tuần tự chỉ cần giữ 1 report tại một thời điểm.
Đây là ví dụ về đánh đổi giữa tốc độ (parallelism) và đỉnh sử dụng bộ nhớ (peak memory).
```

#### Cách phát hiện

```text
1. Theo dõi RAM theo thời gian thực trong lúc batch job chạy — thấy một đỉnh
   nhọn (spike) tăng rất nhanh rồi giảm ngay sau khi job hoàn tất, khác hẳn
   pattern "tăng đều không giảm" của leak thật (case 1, case 3, case 4).
2. dotnet-counters trong lúc job chạy cho thấy Gen2/LOH heap size tăng vọt
   đúng bằng khoảng thời gian job thực thi.
3. Đối chiếu số lượng task chạy song song với kích thước ước tính của mỗi
   report để xác nhận đỉnh RAM quan sát được là hợp lý về mặt con số.
```

#### Cách khắc phục

```csharp
var options = new ParallelOptions { MaxDegreeOfParallelism = 4 };

await Parallel.ForEachAsync(branches, options, async (branch, ct) =>
{
    var report = BuildReport(branch, reportTemplate);
    SaveReport(branch.Id, report);
    // report ra khỏi scope ngay sau mỗi lần lặp, không tồn tại 50 report cùng lúc
});
```

Giới hạn số lượng công việc chạy đồng thời (`MaxDegreeOfParallelism`) đánh đổi một phần tốc độ để giữ đỉnh sử dụng bộ nhớ trong tầm kiểm soát — quan trọng hơn nhiều khi ứng dụng chạy trong container có giới hạn RAM cứng, vì bị kill do vượt memory limit còn tệ hơn chạy chậm hơn một chút.

---

## 10. Checklist review liên quan tới GC

```text
1. Có Dictionary/List/Cache tĩnh nào không có TTL hoặc giới hạn kích thước không?
2. Có event handler nào đăng ký vào object sống lâu hơn (static/Singleton)
   mà không unsubscribe khi object ngắn hạn kết thúc vòng đời không?
3. Class có tài nguyên unmanaged (file, connection, socket) có implement
   IDisposable và được gọi đúng bằng using/await using không?
4. Có vòng lặp nối chuỗi bằng += với số lượng lớn thay vì dùng StringBuilder không?
5. Có object lớn (mảng, string) được cấp phát mới liên tục trong hot path
   thay vì dùng lại buffer (ArrayPool) không?
6. Server GC đã được bật cho ứng dụng chạy trên server nhiều core chưa?
7. Có closure nào bắt giữ object lớn không cần thiết trong callback sống lâu không?
8. Có struct nào bị boxing ngoài ý muốn khi cho vào List<object>/Dictionary<TKey, object>
   hoặc truyền qua tham số kiểu object/interface không?
9. Có background job xử lý dữ liệu tích lũy (queue/buffer) mà thiếu giám sát khi
   job đó âm thầm ngừng hoạt động không?
10. Công việc chạy song song (Task.Run/Parallel) có giới hạn số lượng đồng thời
    để tránh đỉnh RAM vượt quá giới hạn container không?
11. Nếu nghi ngờ leak, đã có số liệu dotnet-counters/gcdump theo thời gian để xác nhận chưa?
```

---

## 11. Tóm tắt

### 11.1. Tóm tắt nhanh

```text
Stack lưu trạng thái thực thi hàm, tự giải phóng ngay khi hàm kết thúc,
GC không cần quan tâm tới stack.

Heap chứa mọi object (reference type), sống cho tới khi không còn ai reach tới —
đây là nơi duy nhất GC thật sự phải theo dõi và dọn dẹp.

GC dọn object dựa trên reachability, không phải reference count.
Generational GC (Gen0/Gen1/Gen2 + LOH/POH) giúp GC nhanh hơn vì phần lớn
object chết sớm, chỉ số ít object cần theo dõi lâu dài.

Server GC phù hợp cho API nhiều core, Workstation GC phù hợp môi trường ít tài nguyên.

Có GC không có nghĩa là hết leak — leak trong .NET xảy ra khi một object
vẫn còn bị "root" nào đó reach tới dù logic nghiệp vụ không cần nó nữa
(static event, singleton giữ reference, cache không giới hạn, buffer tĩnh
không giám sát).

IDisposable/using giải quyết vấn đề GC không tự làm được: giải phóng
tài nguyên unmanaged đúng thời điểm, không chờ GC.

Giảm áp lực GC bằng cách giảm allocation: StringBuilder, ArrayPool, Span<T>,
dùng đúng kiểu generic để tránh boxing, giới hạn công việc chạy song song
để kiểm soát đỉnh sử dụng bộ nhớ.
```

### 11.2. Cách nói ngắn gọn khi cần giải thích

> Garbage Collector trong .NET tự động thu hồi object trên heap dựa trên reachability từ root, chia heap thành các thế hệ để tránh phải quét toàn bộ mỗi lần. Tuy nhiên GC chỉ thu hồi được object không còn ai reach tới — nếu một static event, một Singleton, một cache không giới hạn, hoặc một buffer tĩnh thiếu giám sát vẫn giữ reference tới object đã hết nhiệm vụ, object đó sẽ không bao giờ được dọn dù logic nghiệp vụ không còn cần tới nó, gây ra memory leak thực sự trong một ngôn ngữ có GC. Ngoài leak, áp lực GC (do allocation quá nhiều hoặc boxing ngoài ý muốn) cũng là nguyên nhân phổ biến gây pause và độ trễ tăng đột biến dù không có leak thật sự nào.
