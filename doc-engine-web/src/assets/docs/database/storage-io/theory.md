# Cơ chế lưu trữ, Buffer Pool và I/O

Database không xử lý dữ liệu trực tiếp theo từng dòng trên ổ đĩa. Dữ liệu và chỉ mục được tổ chức thành các page; các page cần thiết được nạp vào Buffer Pool trước khi CPU thực hiện filter, join, sort hoặc aggregate.

Chi phí của một truy vấn chịu ảnh hưởng bởi ba yếu tố:

1. Số page mà execution plan yêu cầu xử lý.
2. Khả năng các page đó đã tồn tại trong Buffer Pool.
3. Độ trễ và thông lượng của storage khi phát sinh physical I/O.

Ở chiều ghi, database phối hợp Buffer Pool, Write-Ahead Logging và checkpoint để vừa duy trì durability vừa tránh biến mọi thay đổi nhỏ thành random write đồng bộ lên data file.

```text
Execution plan
→ page access
→ Buffer Pool hit/miss
→ logical và physical I/O
→ CPU, memory và storage latency
```

---

## 1. Kiến trúc lưu trữ và luồng đọc

### 1.1. Mô hình lưu trữ dữ liệu

#### 1.1.1. Ba tầng xử lý chính

Có thể hình dung đường đi của dữ liệu qua ba tầng:

```text
Storage
   ↓
Buffer Pool trong RAM
   ↓
CPU thực thi query
```

- **Storage** lưu dữ liệu bền vững nhưng có độ trễ cao hơn RAM.
- **Buffer Pool** giữ các page đang hoặc có khả năng sẽ được sử dụng.
- **CPU** xử lý dữ liệu sau khi page đã nằm trong bộ nhớ.

Database cố gắng giữ dữ liệu thường dùng trong RAM vì đọc từ RAM nhanh hơn truy cập storage nhiều bậc độ lớn.

Điểm quan trọng đầu tiên:

> Query không trực tiếp “đọc từng row từ disk”. Query yêu cầu các page, còn database chịu trách nhiệm đưa những page đó vào bộ nhớ.

#### 1.1.2. Page dữ liệu

Database thường tổ chức dữ liệu theo các khối có kích thước cố định gọi là **page**.

Kích thước mặc định phổ biến:

| Hệ quản trị | Kích thước page phổ biến |
|---|---:|
| SQL Server | 8 KB |
| PostgreSQL | 8 KB |
| MySQL InnoDB | 16 KB |

Một page có thể chứa:

- Header quản lý nội bộ
- Nhiều row
- Con trỏ hoặc metadata
- Một phần cấu trúc index

Giả sử một page chứa 100 row. Khi query cần một row trong page đó, database vẫn phải đọc toàn bộ page.

```text
Page 120
├── Row 1
├── Row 2
├── ...
└── Row 100
```

Do đó, chi phí truy cập dữ liệu thường được phân tích theo **số page phải đọc**, không chỉ theo số row được trả về.

#### 1.1.3. Số row và số page

Hai query cùng trả về 10 row nhưng có thể có chi phí rất khác nhau:

```text
Query A: 10 row nằm trong 1 page
Query B: 10 row nằm rải rác trên 10 page
```

Query B có thể cần nhiều lần truy cập bộ nhớ hoặc storage hơn Query A.

Đây là nền tảng để hiểu:

- Table scan
- Index seek
- Key lookup
- Covering index
- Random I/O
- Sequential I/O

---

### 1.2. Luồng đọc dữ liệu

#### 1.2.1. Luồng thực thi tổng quát

Một câu `SELECT` thường đi qua các bước chính sau:

```text
SQL
 ↓
Parsing và kiểm tra quyền
 ↓
Query Optimizer chọn Execution Plan
 ↓
Execution Engine yêu cầu các page cần thiết
 ↓
Buffer Pool lookup
 ├── Có page  → đọc từ RAM
 └── Không có → đọc từ storage, nạp vào RAM
 ↓
CPU xử lý và trả kết quả
```

#### 1.2.2. Buffer Hit

**Buffer hit** xảy ra khi page cần thiết đã có trong Buffer Pool.

```text
Query cần Page 120
       ↓
Buffer Pool đã có Page 120
       ↓
Đọc trực tiếp từ RAM
```

Trong trường hợp này:

- Không cần physical read từ storage
- Query tránh được phần lớn thời gian chờ I/O
- Page có thể tiếp tục được giữ lại cho lần truy cập sau

Buffer hit không có nghĩa query chắc chắn nhanh. Query vẫn có thể chậm vì:

- Đọc quá nhiều page trong RAM
- Join hoặc sort lớn
- CPU cao
- Lock contention
- Trả quá nhiều dữ liệu qua network

Buffer Pool chỉ giúp giảm chi phí truy cập storage.

#### 1.2.3. Buffer Miss

**Buffer miss** xảy ra khi page chưa có trong Buffer Pool.

```text
Query cần Page 120
       ↓
Buffer Pool không có Page 120
       ↓
Đọc Page 120 từ storage
       ↓
Nạp Page 120 vào Buffer Pool
       ↓
Query tiếp tục xử lý
```

Buffer miss tốn thêm thời gian vì database phải:

1. Tìm một frame trống trong Buffer Pool.
2. Có thể loại một page cũ khỏi bộ nhớ.
3. Gửi I/O request xuống storage.
4. Chờ storage trả dữ liệu.
5. Nạp page vào RAM.
6. Đánh thức luồng đang chờ để tiếp tục query.

#### 1.2.4. Cold Cache và Warm Cache

Hai trạng thái thường gặp:

- **Cold cache**: nhiều page cần thiết chưa có trong RAM.
- **Warm cache**: phần lớn page cần thiết đã nằm trong RAM.

Một query có thể chạy như sau:

```text
Lần 1: 2.5 giây
Lần 2: 120 ms
```

Sự chênh lệch không nhất thiết do execution plan thay đổi. Có thể lần đầu phải đọc nhiều page từ storage, còn lần sau sử dụng lại dữ liệu trong Buffer Pool.

Vì vậy, khi benchmark query cần tách rõ:

- Hiệu năng khi cache lạnh
- Hiệu năng khi cache ấm
- Hiệu năng ổn định dưới tải thực tế

---

## 2. Chi phí đọc và quản lý bộ nhớ

### 2.1. Chi phí đọc dữ liệu

#### 2.1.1. Logical Read

**Logical read** là một lần database truy cập một page theo yêu cầu của execution plan.

Page đó có thể:

- Đã nằm trong Buffer Pool
- Hoặc phải được đọc từ storage trước

Ví dụ:

```text
Logical reads = 50,000
```

Điều này cho biết execution plan đã yêu cầu hoặc truy cập 50.000 page. Nó chưa nói rõ bao nhiêu page phải đọc từ storage.

Logical read đặc biệt quan trọng vì ngay cả khi toàn bộ dữ liệu đã nằm trong RAM, đọc 50.000 page vẫn tốn CPU, latch và băng thông bộ nhớ.

#### 2.1.2. Physical Read

**Physical read** là lần database thực sự phải lấy page từ storage do page chưa có trong Buffer Pool.

Ví dụ:

```text
Logical reads  = 50,000
Physical reads = 20
```

Query đã truy cập 50.000 page nhưng chỉ 20 page phải đọc từ storage.

Trường hợp khác:

```text
Logical reads  = 50,000
Physical reads = 45,000
```

Phần lớn dữ liệu chưa có trong Buffer Pool. Query có thể chịu độ trễ I/O rất lớn.

#### 2.1.3. Quan hệ giữa Logical Read và Physical Read

Có thể hiểu đơn giản:

```text
Logical read  = Query cần chạm vào page
Physical read = Page không có trong RAM nên phải lấy từ storage
```

Physical read thường phát sinh để phục vụ logical read, nhưng không phải mọi logical read đều tạo ra physical read.

Khi tối ưu query, mục tiêu đầu tiên thường là giảm **logical reads**. Khi logical reads giảm, lượng dữ liệu phải xử lý và khả năng phát sinh physical reads cũng giảm theo.

#### 2.1.4. Latency, IOPS và Throughput

Ba khái niệm storage cần phân biệt:

| Khái niệm | Ý nghĩa |
|---|---|
| Latency | Thời gian hoàn thành một I/O request |
| IOPS | Số I/O request có thể xử lý mỗi giây |
| Throughput | Tổng lượng dữ liệu đọc hoặc ghi mỗi giây |

Một workload đọc nhiều page nhỏ, rải rác thường phụ thuộc mạnh vào IOPS và latency.

Một workload scan các vùng dữ liệu lớn, liên tục thường phụ thuộc mạnh vào throughput.

---

### 2.2. Cấu trúc Buffer Pool

#### 2.2.1. Buffer Frame

Buffer Pool được chia thành nhiều vùng chứa page, thường có thể gọi khái quát là **buffer frame**.

```text
Buffer Pool
├── Frame 1  → Page 120
├── Frame 2  → Page 840
├── Frame 3  → Trống
└── Frame 4  → Page 315
```

Database duy trì metadata để biết:

- Frame đang giữ page nào
- Page có đang được sử dụng hay không
- Page có bị thay đổi chưa
- Page được truy cập gần đây ở mức nào
- Page có thể bị loại khỏi bộ nhớ hay chưa

#### 2.2.2. Clean Page

**Clean page** là page trong Buffer Pool có nội dung giống bản hiện tại trên data file.

Nếu cần giải phóng frame, database có thể loại clean page khỏi RAM mà không cần ghi lại dữ liệu.

#### 2.2.3. Dirty Page

**Dirty page** là page đã bị thay đổi trong RAM nhưng phiên bản mới chưa được ghi vào data file.

Ví dụ:

```text
UPDATE Orders
SET Status = 'Paid'
WHERE Id = 1001;
```

Database có thể cập nhật page chứa đơn hàng trong Buffer Pool. Page này trở thành dirty page.

Dirty page không thể bị loại một cách tùy ý. Trước khi tái sử dụng frame, database phải bảo đảm thay đổi đã được ghi an toàn theo cơ chế của engine.

#### 2.2.4. Page Replacement

Buffer Pool có dung lượng hữu hạn. Khi không còn frame trống, database phải chọn một page cũ để loại ra.

Quá trình này gọi là **page replacement** hoặc **eviction**.

Nguyên tắc tổng quát:

```text
Page được dùng thường xuyên → ưu tiên giữ lại
Page lâu không được dùng    → dễ bị loại hơn
```

Các engine không nhất thiết sử dụng LRU thuần túy. Chúng thường dùng biến thể tối ưu hơn:

- Clock sweep
- Second chance
- LRU có nhiều vùng
- Cơ chế tính tần suất hoặc chi phí truy cập

Mục tiêu là giữ lại các page có giá trị cao mà không phải duy trì một danh sách LRU tuyệt đối quá tốn kém.

---

### 2.3. Đọc tuần tự và đọc ngẫu nhiên

#### 2.3.1. Sequential I/O

**Sequential I/O** xảy ra khi database đọc các page nằm gần nhau theo một chuỗi liên tục.

```text
Page 100 → 101 → 102 → 103 → 104
```

Kiểu đọc này thường xuất hiện trong:

- Table scan
- Index range scan lớn
- Backup
- Report đọc nhiều dữ liệu

Sequential I/O tận dụng tốt throughput của storage và read-ahead.

#### 2.3.2. Random I/O

**Random I/O** xảy ra khi database phải đọc các page nằm rải rác.

```text
Page 100 → 8,420 → 315 → 19,002 → 771
```

Kiểu đọc này thường xuất hiện trong:

- Nhiều point lookup
- Index seek kèm key lookup
- Nested loop đọc nhiều dòng phía trong
- Truy cập dữ liệu phân tán trên nhiều page

Trên HDD, random I/O rất đắt vì đầu đọc phải di chuyển vật lý. Trên SSD, chênh lệch nhỏ hơn nhưng random I/O vẫn chịu giới hạn IOPS và overhead trên mỗi request.

#### 2.3.3. Scan và Seek

Không thể kết luận `Index Seek` luôn tốt hơn `Table Scan`.

Giả sử query cần 70% số row của bảng:

```text
Phương án A: Table Scan
- Đọc page tuần tự
- Tận dụng read-ahead
- Ít request lớn

Phương án B: Index Seek + hàng trăm nghìn Key Lookup
- Đọc nhiều page rải rác
- Nhiều request nhỏ
- Random I/O và CPU cao
```

Trong trường hợp này, scan có thể rẻ hơn seek.

Optimizer chọn execution plan dựa trên số row ước tính, chi phí I/O, CPU và cấu trúc dữ liệu hiện có.

#### 2.3.4. Read-ahead

**Read-ahead** là cơ chế đọc trước các page mà database dự đoán query sắp cần.

```text
Query đang xử lý Page 100
Database đọc trước Page 101–116
```

Read-ahead giúp:

- Chồng lấp thời gian xử lý CPU với I/O
- Tăng kích thước mỗi lần đọc
- Tận dụng sequential throughput
- Giảm thời gian query phải chờ từng page

Read-ahead hiệu quả nhất khi database phát hiện được pattern đọc có tính tuần tự.

---

## 3. Luồng ghi và tính bền vững

### 3.1. Ghi dữ liệu qua Buffer Pool

#### 3.1.1. Thay đổi page trong bộ nhớ

Khi thực hiện `INSERT`, `UPDATE` hoặc `DELETE`, database thường không ghi trực tiếp từng thay đổi vào đúng vị trí trong data file rồi mới cho transaction tiếp tục.

Luồng tổng quát:

```text
Thay đổi page trong Buffer Pool
          ↓
Page trở thành dirty page
          ↓
Ghi transaction log
          ↓
Commit
          ↓
Ghi dirty page xuống data file ở thời điểm phù hợp
```

Cách làm này giúp database tránh biến mỗi thay đổi nhỏ thành một random write đồng bộ trên data file.

#### 3.1.2. Write-Ahead Logging

Phần lớn database quan hệ sử dụng nguyên tắc **Write-Ahead Logging**:

> Thông tin cần để khôi phục thay đổi phải được ghi bền vững vào log trước khi dirty page tương ứng được ghi vào data file.

Tên gọi khác nhau theo engine:

- Transaction log
- Redo log
- WAL

Log thường có lợi thế vì được ghi theo hướng tuần tự hơn data page.

#### 3.1.3. Transaction Commit

Một transaction thường được coi là durable khi log cần thiết đã được flush theo chính sách durability của engine.

Điều này không có nghĩa mọi dirty page đã được ghi vào data file tại thời điểm commit.

```text
Commit hoàn tất
├── Log đã đủ để recovery
└── Dirty page có thể vẫn nằm trong Buffer Pool
```

Nếu server gặp sự cố, database sử dụng log để khôi phục trạng thái nhất quán.

#### 3.1.4. Checkpoint

**Checkpoint** giúp đưa các dirty page xuống data file và giới hạn lượng log cần xử lý khi recovery.

Checkpoint tạo ra sự cân bằng:

- Ghi quá dồn dập → write I/O tăng đột biến
- Ghi quá chậm → dirty page và log tích tụ, recovery lâu hơn

Checkpoint không phải cơ chế duy nhất ghi dirty page. Nhiều engine còn có background writer, page cleaner hoặc flush thread.

#### 3.1.5. Write Amplification

Một thay đổi logic nhỏ có thể tạo ra nhiều ghi vật lý:

```text
UPDATE một row
├── Ghi transaction log
├── Ghi data page
├── Ghi các index page liên quan
└── Có thể ghi thêm metadata hoặc page bị split
```

Hiện tượng tổng lượng ghi vật lý lớn hơn lượng dữ liệu thay đổi logic được gọi là **write amplification**.

Nó trở nên đáng chú ý khi:

- Bảng có quá nhiều index
- Update thay đổi nhiều cột được index
- Page split xảy ra thường xuyên
- Checkpoint tạo burst I/O
- Storage có giới hạn write IOPS

---

## 4. Cấu trúc truy cập và áp lực bộ nhớ

### 4.1. Index và chi phí I/O

#### 4.1.1. Index như cấu trúc định vị page

Index không làm query nhanh hơn theo cách trừu tượng. Nó cung cấp một đường dẫn để database tìm các page cần thiết mà không phải đọc phần lớn bảng.

```text
Không có index phù hợp
→ đọc nhiều data page

Có index phù hợp
→ đọc một số index page
→ định vị data page cần thiết
```

Ví dụ:

```text
Bảng có 10.000.000 row
Mỗi page chứa trung bình 100 row
→ Khoảng 100.000 data page
```

Một table scan có thể đọc gần 100.000 page. Một index seek chọn lọc tốt có thể chỉ cần:

- Một số page từ B-Tree
- Một số ít page dữ liệu chứa row cần lấy

#### 4.1.2. B-Tree và page

Các node của B-Tree được lưu trong page.

```text
Root Page
   ↓
Intermediate Page
   ↓
Leaf Page
```

Mỗi lần đi xuống một level của cây là một lần truy cập page. Vì khả năng phân nhánh cao, cây thường không quá sâu ngay cả khi chứa hàng triệu row.

#### 4.1.3. Key Lookup

Một non-covering index có thể giúp tìm khóa của row nhưng chưa chứa đủ cột cần trả về.

Database phải quay lại clustered index hoặc heap để lấy dữ liệu còn thiếu.

```text
Index Seek
   ↓
Tìm được 50.000 khóa
   ↓
50.000 Key Lookup vào data page
```

Nếu số row nhỏ, key lookup có thể hợp lý. Nếu số row lớn, hàng nghìn hoặc hàng triệu lần lookup có thể tạo random I/O và logical reads rất cao.

#### 4.1.4. Covering Index

**Covering index** chứa đủ dữ liệu để query hoàn thành ngay trên index.

```text
Index Seek
   ↓
Đủ cột để filter và trả kết quả
   ↓
Không cần quay lại data page
```

Lợi ích chính là giảm số page cần đọc, đặc biệt giảm các lookup rải rác.

Đổi lại, covering index:

- Chiếm thêm storage
- Tốn RAM trong Buffer Pool
- Tăng chi phí ghi
- Tăng write amplification

Do đó, covering index là một trade-off, không phải lựa chọn mặc định cho mọi query.

---

### 4.2. Working Set và áp lực bộ nhớ

#### 4.2.1. Working Set

**Working set** là tập page được truy cập thường xuyên trong một khoảng thời gian có ý nghĩa với workload.

Ví dụ với hệ thống bán hàng:

- Đơn hàng 30 ngày gần nhất
- Sản phẩm đang bán
- Hồ sơ khách hàng hoạt động
- Các index phục vụ API chính

Working set không nhất thiết bằng toàn bộ database.

```text
Database size: 2 TB
Working set:   40 GB
Buffer Pool:   64 GB
```

Trong trường hợp này, phần dữ liệu nóng có thể vừa RAM dù toàn bộ database lớn hơn nhiều.

#### 4.2.2. Working Set vượt quá Buffer Pool

Giả sử:

```text
Working set: 40 GB
Buffer Pool: 16 GB
```

Các page nóng không thể cùng tồn tại trong RAM. Database liên tục:

1. Nạp page A.
2. Loại page B.
3. Sau đó lại cần page B.
4. Loại page C để nạp lại B.

Hiện tượng thay thế page liên tục và đọc lại cùng dữ liệu có thể gọi là **cache thrashing**.

Dấu hiệu thường thấy:

- Physical reads tăng
- I/O latency tăng
- Buffer hit rate giảm
- Query cùng loại lúc nhanh lúc chậm
- Hiệu năng toàn hệ thống suy giảm khi tải tăng

#### 4.2.3. Dữ liệu nóng và dữ liệu lạnh

Phân biệt:

- **Hot data**: được truy cập thường xuyên
- **Cold data**: ít được truy cập

Các giải pháp có thể giảm working set:

- Archive dữ liệu cũ
- Partition theo thời gian
- Tách bảng nóng và bảng lịch sử
- Chuyển report lịch sử sang replica
- Giảm độ rộng của row hoặc index
- Loại index không còn sử dụng

#### 4.2.4. Cache Pollution

Một query scan lượng dữ liệu rất lớn có thể đưa nhiều page ít dùng vào Buffer Pool và đẩy page nóng ra ngoài.

```text
Trước report:
Buffer Pool chủ yếu chứa dữ liệu giao dịch hôm nay

Trong report:
Hàng triệu page lịch sử được đọc

Sau report:
API giao dịch phải đọc lại dữ liệu nóng từ storage
```

Hiện tượng này thường được gọi là **cache pollution**.

Biện pháp phổ biến:

- Chạy report trên read replica
- Lên lịch ngoài giờ cao điểm
- Giới hạn concurrency
- Tối ưu phạm vi dữ liệu report
- Dùng hệ thống phân tích riêng cho workload OLAP

---

### 4.3. Buffer Pool và bộ nhớ hệ điều hành

#### 4.3.1. OS Page Cache

Ngoài Buffer Pool của database, hệ điều hành cũng có thể cache nội dung file trong RAM.

```text
Database Buffer Pool
        ↓
OS Page Cache
        ↓
Storage
```

Tùy engine và cấu hình, một page có thể tồn tại ở cả hai tầng.

#### 4.3.2. Double Caching

**Double caching** xảy ra khi cùng dữ liệu được lưu đồng thời trong Buffer Pool và OS page cache.

Điều này có thể làm giảm lượng RAM hữu ích nếu hai tầng cache trùng lặp quá nhiều.

Tuy nhiên, không nên kết luận mọi double caching đều xấu. Mức độ phụ thuộc vào cách engine quản lý I/O và bộ nhớ.

#### 4.3.3. Direct I/O

Một số database hoặc cấu hình sử dụng **Direct I/O** để giảm hoặc bỏ qua OS page cache đối với data file.

Mục tiêu là để database chủ động quản lý cache dựa trên hiểu biết về:

- Page nào đang được pin
- Page nào là dirty
- Pattern truy cập
- Tần suất sử dụng
- Chính sách flush

Cách triển khai khác nhau giữa MySQL, PostgreSQL, SQL Server, Oracle và hệ điều hành. Không nên áp một cấu hình Direct I/O từ engine này sang engine khác mà không kiểm tra tài liệu chính thức.

---

## 5. Quan sát và phân tích sự cố

### 5.1. Chỉ số quan sát hệ thống

#### 5.1.1. Buffer Hit Rate

Công thức khái quát:

```text
Buffer Hit Rate
= Số lần đọc được phục vụ từ Buffer Pool
  / Tổng số lần đọc page
```

Hit rate cao thường là tín hiệu tốt, nhưng không đủ để kết luận hệ thống khỏe.

Ví dụ:

```text
Hit rate = 99.9%
Logical reads = 1 tỷ page/phút
```

Chỉ 0,1% physical read vẫn có thể tạo lượng I/O rất lớn. Đồng thời, 1 tỷ logical read cũng có thể tiêu tốn CPU và memory bandwidth đáng kể.

#### 5.1.2. Page Lifetime

Một số engine cung cấp chỉ số biểu diễn page tồn tại trong Buffer Pool bao lâu trước khi bị thay thế.

Nếu page lifetime giảm mạnh, có thể đang xảy ra:

- Memory pressure
- Scan lớn
- Working set tăng
- Nhiều workload cạnh tranh Buffer Pool

Không nên dùng một ngưỡng cố định cho mọi hệ thống. Cần quan sát baseline của chính workload đó và chú ý sự thay đổi bất thường.

#### 5.1.3. I/O Latency

Cần theo dõi riêng:

- Read latency
- Write latency
- Log flush latency
- Data file latency

Latency tăng có thể do:

- Storage quá tải
- I/O queue dài
- Checkpoint hoặc flush burst
- Backup
- Nhiều random lookup
- Cùng storage bị workload khác chiếm dụng

#### 5.1.4. I/O Queue

Khi số request đến nhanh hơn khả năng xử lý của storage, request phải xếp hàng.

```text
Query → I/O request → Queue → Storage
```

Queue dài làm latency tăng ngay cả khi từng I/O riêng lẻ vốn không quá chậm.

#### 5.1.5. Dirty Page và Checkpoint

Các chỉ số cần quan sát tùy engine:

- Số dirty page
- Tốc độ flush
- Checkpoint duration
- Checkpoint frequency
- Background writer activity
- Redo/WAL generation rate
- Log flush latency

Chúng giúp phân biệt query chậm do read I/O với hệ thống chậm do write pressure.

#### 5.1.6. Công cụ theo hệ quản trị

Một số công cụ thường dùng:

| Hệ quản trị | Công cụ hoặc lệnh thường dùng |
|---|---|
| SQL Server | Execution Plan, `SET STATISTICS IO ON`, wait statistics, DMVs, PerfMon |
| PostgreSQL | `EXPLAIN (ANALYZE, BUFFERS)`, `pg_stat_database`, `pg_stat_bgwriter`, `pg_stat_io` tùy phiên bản |
| MySQL InnoDB | `EXPLAIN ANALYZE`, Performance Schema, `SHOW ENGINE INNODB STATUS`, `INFORMATION_SCHEMA.INNODB_BUFFER_POOL_STATS` |

Tên chỉ số khác nhau nhưng câu hỏi phân tích vẫn giống nhau:

1. Query đọc bao nhiêu page?
2. Bao nhiêu page phải lấy từ storage?
3. Database chờ loại I/O nào?
4. Buffer Pool có đang bị áp lực không?
5. Workload đọc hay ghi đang chiếm storage?

---

### 5.2. Các hiện tượng hiệu năng phổ biến

#### 5.2.1. Cold Cache sau khi khởi động

Sau khi database restart, Buffer Pool chưa có dữ liệu nóng.

Các query đầu tiên phải đọc nhiều page từ storage nên chậm hơn bình thường.

```text
Database restart
      ↓
Buffer Pool gần như trống
      ↓
Traffic đầu tiên nạp lại dữ liệu nóng
      ↓
Latency tăng tạm thời
```

Giải pháp không phải lúc nào cũng là chạy query “warm-up” thủ công. Cần đánh giá:

- Storage có đủ khả năng hấp thụ quá trình warm-up không
- Traffic có tăng đồng loạt sau restart không
- Có thể rolling restart hay không
- Replica có thể nhận tải trong lúc một node đang warm-up không

#### 5.2.2. Logical Reads cao

Query có thể không có nhiều physical reads nhưng vẫn chậm vì đọc quá nhiều page trong RAM.

Nguyên nhân thường gặp:

- Thiếu index phù hợp
- Index không đủ chọn lọc
- Predicate không sử dụng được index
- Join làm phình số row trung gian
- Key lookup số lượng lớn
- `SELECT *`
- Pagination bằng offset quá sâu

Đây là lý do không nên chỉ nhìn cache hit rate.

#### 5.2.3. Physical Reads cao

Nguyên nhân thường gặp:

- Cold cache
- Working set lớn hơn Buffer Pool
- Scan dữ liệu lịch sử
- Cache pollution
- Buffer Pool cấu hình quá nhỏ
- Nhiều workload cạnh tranh bộ nhớ
- Query truy cập dữ liệu rất phân tán

#### 5.2.4. Write I/O tăng đột biến

Nguyên nhân có thể gồm:

- Checkpoint
- Batch update hoặc delete lớn
- Bulk import
- Nhiều dirty page cần flush
- Quá nhiều index cần cập nhật
- Page split
- Backup hoặc replication activity

Cần phân biệt write vào transaction log và write vào data file vì hai luồng này có đặc điểm khác nhau.

#### 5.2.5. Độ trễ truy vấn không ổn định

Một query có thể dao động do:

- Cache ấm hoặc lạnh
- Execution plan khác nhau
- Data distribution thay đổi
- Lock hoặc latch contention
- I/O queue thay đổi
- Batch job chạy đồng thời
- Page nóng bị evict

Không nên kết luận nguyên nhân từ một lần chạy. Cần thu thập nhiều mẫu cùng execution plan, logical reads, physical reads và wait events.

---

### 5.3. Ảnh hưởng của thiết kế dữ liệu và truy vấn

#### 5.3.1. Độ rộng của row

Row càng rộng, mỗi page chứa được càng ít row.

```text
Page 16 KB

Row 100 byte  → chứa được nhiều row
Row 2 KB      → chứa được ít row
```

Với cùng số row cần trả, bảng có row rộng có thể phải đọc nhiều page hơn.

Các cột lớn hoặc ít dùng có thể được cân nhắc tách khỏi luồng truy cập nóng nếu mô hình nghiệp vụ phù hợp.

#### 5.3.2. `SELECT` dư cột

```sql
SELECT *
FROM Orders
WHERE CustomerId = 100;
```

Lấy dư cột có thể:

- Làm mất cơ hội dùng covering index
- Tăng số page phải đọc
- Tăng lượng dữ liệu qua network
- Tăng chi phí serialize và materialize object

Nên chọn đúng các cột cần thiết cho use case.

#### 5.3.3. Offset Pagination

```sql
SELECT ...
FROM Orders
ORDER BY Id
LIMIT 50 OFFSET 500000;
```

Database có thể phải đọc và bỏ qua lượng lớn row trước khi lấy được 50 row cần thiết.

Keyset pagination thường giảm số page phải xử lý:

```sql
SELECT ...
FROM Orders
WHERE Id > :lastId
ORDER BY Id
LIMIT 50;
```

#### 5.3.4. Batch thay đổi dữ liệu

Một lệnh update hàng triệu row có thể tạo:

- Nhiều dirty page
- Transaction log lớn
- Lock kéo dài
- Checkpoint pressure
- Replication lag
- I/O burst

Chia batch nhỏ có thể giúp kiểm soát áp lực, nhưng không phải lúc nào cũng làm tổng thời gian ngắn hơn. Đây là trade-off giữa throughput, thời gian giữ lock và độ ổn định hệ thống.

#### 5.3.5. Số lượng Index

Mỗi index bổ sung có thể giảm I/O đọc cho một số query nhưng tăng:

- Storage
- Buffer Pool footprint
- Chi phí insert
- Chi phí update
- Chi phí delete
- Lượng log

Thiết kế index là bài toán cân bằng read path và write path.

---

### 5.4. Quy trình phân tích sự cố

Khi nghi ngờ Disk I/O hoặc Buffer Pool, nên phân tích theo thứ tự thay vì kết luận ngay rằng “thiếu RAM” hoặc “disk chậm”.

#### Bước 1. Xác định phạm vi

- Một query chậm hay toàn hệ thống chậm?
- Chỉ xảy ra sau restart hay kéo dài liên tục?
- Chỉ xảy ra vào giờ batch/report?
- Đọc chậm, ghi chậm hay cả hai?

#### Bước 2. Kiểm tra Execution Plan

- Scan hay seek?
- Estimated rows có lệch actual rows không?
- Có key lookup lớn không?
- Có sort, hash hoặc spill không?
- Query đọc những bảng và index nào?

#### Bước 3. Đo số page

- Logical reads bao nhiêu?
- Physical reads bao nhiêu?
- Lần chạy cache ấm có còn đọc quá nhiều page không?

Nếu logical reads rất cao, ưu tiên tối ưu query hoặc index trước khi chỉ nghĩ đến nâng cấp storage.

#### Bước 4. Kiểm tra trạng thái Buffer Pool

- Hit rate có thay đổi bất thường không?
- Page lifetime có giảm không?
- Có dấu hiệu eviction hoặc free-frame pressure không?
- Working set có tăng gần đây không?

#### Bước 5. Kiểm tra storage

- Read latency
- Write latency
- Log latency
- IOPS
- Throughput
- Queue depth

Cần kiểm tra cả phía database và phía hệ điều hành hoặc cloud storage.

#### Bước 6. Kiểm tra workload đồng thời

- Report lớn
- Backup
- ETL
- Batch update
- Index rebuild
- Checkpoint
- Replication
- Workload khác dùng chung storage

#### Bước 7. Chọn giải pháp theo nguyên nhân

| Nguyên nhân | Hướng xử lý thường gặp |
|---|---|
| Logical reads cao | Tối ưu query, index, join, pagination, projection |
| Cold cache | Thiết kế restart, replica, warm-up có kiểm soát |
| Working set vượt RAM | Tăng RAM, giảm working set, archive, partition |
| Cache pollution | Tách report, giới hạn scan, dùng replica |
| Random lookup lớn | Covering index, đổi join strategy, giảm số row lookup |
| Write pressure | Batch hợp lý, giảm index dư, điều chỉnh checkpoint/flush |
| Storage saturation | Giảm I/O, phân tải, nâng cấp storage hoặc tách workload |

---

## 6. Tình huống và nguyên tắc thực hành

### 6.1. Tình huống phân tích thực tế

#### 6.1.1. Truy vấn nhanh ở lần chạy thứ hai

Hiện tượng:

```text
Lần 1: 8 giây
Lần 2: 300 ms
```

Cách suy luận:

1. So sánh execution plan giữa hai lần.
2. So sánh logical reads.
3. So sánh physical reads.
4. Kiểm tra I/O wait ở lần đầu.

Nếu plan và logical reads gần giống nhau nhưng physical reads giảm mạnh ở lần hai, nguyên nhân chính nhiều khả năng là cold cache.

Tối ưu tiếp theo vẫn nên xem logical reads. Một query cần 500.000 logical reads có thể nhanh khi cache ấm nhưng vẫn gây áp lực lớn lên CPU và Buffer Pool.

#### 6.1.2. API chậm sau khi báo cáo chạy

Hiện tượng:

- API bình thường ổn định
- Report lịch sử chạy 20 phút
- API chậm trong và sau report
- Physical reads của API tăng

Khả năng:

- Report đã đọc lượng page lớn
- Page lịch sử chiếm Buffer Pool
- Page nóng của API bị evict
- API phải đọc lại dữ liệu từ storage

Giải pháp có thể gồm:

- Chạy report trên replica
- Thu hẹp dữ liệu report
- Giới hạn concurrency
- Tách OLTP và OLAP
- Lên lịch report ngoài giờ cao điểm

#### 6.1.3. Index Seek nhưng truy vấn vẫn chậm

Execution plan hiển thị `Index Seek`, nhưng query trả hàng trăm nghìn row và thực hiện rất nhiều key lookup.

Cách nhìn đúng:

```text
Index Seek không đồng nghĩa với ít I/O
```

Cần xem:

- Số row đi ra từ seek
- Số lần lookup
- Logical reads của lookup
- Mức độ chọn lọc của điều kiện
- Khả năng dùng covering index
- Khả năng scan rẻ hơn

#### 6.1.4. Tăng Buffer Pool nhưng hiệu năng không đổi

Khả năng:

- Query vốn đã có hit rate cao
- Logical reads quá lớn
- Bottleneck nằm ở CPU, lock hoặc network
- Working set vẫn lớn hơn đáng kể so với RAM mới
- Storage chậm chủ yếu ở log write
- Cấu hình mới chưa thực sự được áp dụng

Tăng RAM chỉ giải quyết vấn đề khi cache miss và memory pressure là nguyên nhân đáng kể.

---

### 6.2. Nguyên tắc tổng hợp

#### 6.2.1. Chi phí đọc page

Có thể ghi nhớ mô hình sau:

```text
Chi phí đọc dữ liệu
≈ Số page được truy cập
× Chi phí phục vụ mỗi page
```

Trong đó chi phí mỗi page phụ thuộc vào:

- Page đã ở RAM hay chưa
- Đọc tuần tự hay ngẫu nhiên
- Storage latency
- I/O queue
- Mức độ cạnh tranh tài nguyên

#### 6.2.2. Mục tiêu của Index

```text
Index tốt
→ giảm vùng dữ liệu cần tìm kiếm
→ giảm số page phải đọc
→ giảm logical reads và khả năng phát sinh physical reads
```

#### 6.2.3. Mục tiêu của Buffer Pool

```text
Buffer Pool
→ giữ page có giá trị trong RAM
→ tái sử dụng dữ liệu đã đọc
→ giảm physical I/O
```

#### 6.2.4. Mục tiêu của WAL và Checkpoint

```text
WAL
→ bảo đảm khả năng phục hồi và durability

Checkpoint / background flush
→ đưa dirty page về data file theo cách có kiểm soát
```

#### 6.2.5. Thứ tự tối ưu

Một thứ tự suy nghĩ hữu ích:

1. Query có đọc quá nhiều page không?
2. Execution plan có hợp lý không?
3. Index có giảm đúng I/O cần thiết không?
4. Working set có phù hợp với Buffer Pool không?
5. Storage có đang quá tải không?
6. Workload đọc và ghi có nên được tách không?

Không nên bắt đầu bằng việc mua thêm RAM hoặc đổi storage khi chưa biết query đang tạo ra bao nhiêu I/O và vì sao.

---

### 6.3. Kết luận

Disk I/O và Buffer Pool là nền tảng vật lý phía dưới index, execution plan và transaction.

Luồng quan trọng nhất cần nắm là:

```text
Query cần dữ liệu
      ↓
Database xác định các page cần đọc
      ↓
Tìm page trong Buffer Pool
      ├── Buffer hit  → đọc từ RAM
      └── Buffer miss → đọc từ storage rồi nạp vào RAM
      ↓
CPU xử lý dữ liệu
```

Từ luồng này có thể suy ra hầu hết vấn đề hiệu năng liên quan:

- Logical reads cao vì query chạm quá nhiều page
- Physical reads cao vì dữ liệu chưa có trong RAM
- Cache thrashing vì working set lớn hơn Buffer Pool
- Cache pollution vì scan dữ liệu lạnh
- Random I/O cao vì lookup rải rác
- Write pressure vì dirty page, log và checkpoint

Khi tối ưu, không nên dừng ở nhận xét “query chậm” hoặc “disk cao”. Cần trả lời chính xác:

> Query đọc bao nhiêu page, các page đến từ đâu, pattern truy cập là gì và tài nguyên nào đang bị chờ?

Đó là điểm bắt đầu để chuyển từ tối ưu theo cảm tính sang phân tích dựa trên số liệu.
