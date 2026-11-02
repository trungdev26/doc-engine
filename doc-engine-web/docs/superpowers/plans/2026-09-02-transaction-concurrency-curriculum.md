# Transaction và Concurrency Control Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor cụm tài liệu Database về transaction và concurrency thành sáu bài có dependency rõ ràng, đi từ nền tảng đến cơ chế InnoDB chuyên sâu, với navigation và demo khớp phạm vi.

**Architecture:** Giữ nguyên route, component và demo hiện có; thay đổi curriculum bằng navigation, ownership nội dung và cross-link giữa sáu tài liệu Markdown. Mỗi bài định nghĩa một lớp kiến thức, dùng ví dụ sau phần lý thuyết và không giải thích lại phần thuộc bài khác.

**Tech Stack:** Angular 17, TypeScript, Markdown assets, Angular CLI.

**Spec:** `docs/superpowers/specs/2026-09-02-transaction-concurrency-curriculum-design.md`

## Global Constraints

- Tài liệu viết bằng tiếng Việt; giữ identifier, SQL keyword, API và thuật ngữ kỹ thuật chuẩn ở dạng canonical.
- Không đặt tên riêng cho cách tổ chức hoặc quá trình dẫn dắt nội dung.
- Trình tự giải thích: vấn đề, định nghĩa, thành phần, hành vi, cú pháp, ví dụ, failure, debugging, giới hạn và tóm tắt.
- Không rút lý thuyết thành định nghĩa một dòng, checklist hoặc các kết luận thiếu phần giải thích nguyên nhân.
- Mỗi khái niệm cốt lõi phải nêu: định nghĩa, vấn đề nó giải quyết, cơ chế, phạm vi bảo đảm, giới hạn và ví dụ có trạng thái quan sát được.
- Section dài phải tách thành heading con theo thành phần, giai đoạn thực thi, failure mode hoặc giới hạn; không chia nhỏ chỉ để làm đoạn văn ngắn hơn.
- Không dùng code block thay cho định nghĩa; mọi code block phải có giải thích input, trạng thái và kết quả.
- Nội dung database-neutral không chọn một engine làm mặc định; khác biệt engine nằm trong ghi chú riêng.
- Identifier field, property, column, alias và parameter trong ví dụ dùng `camelCase`; domain identifier tiếng Việt không dấu.
- Không thêm dependency, bài mới hoặc demo mới.
- Giữ UTF-8 thực của file; không sửa tiếng Việt dựa trên mojibake hiển thị trong PowerShell.
- Worktree đang có thay đổi của người dùng trong các file mục tiêu; không reset, checkout hoặc ghi đè nội dung chưa commit.

---

### Task 1: Khóa navigation và dependency của curriculum

**Files:**
- Modify: `src/app/layout/shell/menu.config.ts`
- Verify: `src/app/app-routing.module.ts`

**Interfaces:**
- Consumes: Sáu route theory và bốn route demo đang tồn tại trong `app-routing.module.ts`.
- Produces: Thứ tự navigation chính thức mà phần mở đầu và liên kết cuối của sáu bài phải tuân theo.

- [ ] **Step 1: Ghi nhận baseline mà không thay đổi worktree**

Run:

```powershell
git status --short
git diff -- src/app/layout/shell/menu.config.ts src/app/app-routing.module.ts
```

Expected: thấy rõ thay đổi có sẵn của người dùng; không có thao tác reset hoặc checkout.

- [ ] **Step 2: Xác minh đủ route trước khi sửa menu**

Run:

```powershell
rg -n "database/(transactions|acid|isolation-levels|locking-deadlock|concurrency-control-patterns|mysql-innodb-concurrency|isolation-anomalies)" src/app/app-routing.module.ts
```

Expected: có route theory cho cả sáu bài, route demo cho transaction, isolation anomalies, locking/deadlock và concurrency control.

- [ ] **Step 3: Thay cấu trúc menu theory**

Trong group Database, đổi title và children thành đúng thứ tự:

```text
05. Transaction và Concurrency Control
Lý thuyết
  01. Transaction
  02. ACID
  03. Transaction Isolation
  04. Locking, Blocking và Deadlock
  05. Concurrency Control Patterns
  06. MySQL InnoDB Concurrency Internals
```

Giữ nguyên các link route đã có. Sắp xếp demo theo dependency:

```text
01. Transaction Boundary
02. Isolation Anomalies
03. Blocking, Deadlock và Lock Ordering
04. Transactional Outbox
```

- [ ] **Step 4: Kiểm tra menu không thiếu hoặc lặp route**

Run:

```powershell
rg -n "01. Transaction|02. ACID|Transaction Isolation|Locking, Blocking và Deadlock|Concurrency Control Patterns|MySQL InnoDB Concurrency Internals" src/app/layout/shell/menu.config.ts
```

Expected: mỗi nhãn xuất hiện đúng một lần trong group theory.

- [ ] **Step 5: Review diff và commit riêng navigation**

Run:

```powershell
git diff --check -- src/app/layout/shell/menu.config.ts
git diff -- src/app/layout/shell/menu.config.ts
git add -- src/app/layout/shell/menu.config.ts
git commit -m "docs: reorder transaction concurrency curriculum"
```

Expected: diff chỉ đổi title, label, thứ tự và bổ sung hai link theory bị thiếu.

---

### Task 2: Refactor Transaction

**Files:**
- Modify: `src/assets/docs/database/transactions/theory.md`

**Interfaces:**
- Consumes: Không yêu cầu bài nào trong cụm.
- Produces: Định nghĩa transaction boundary và lifecycle được năm bài sau dùng làm prerequisite.

- [ ] **Step 1: Lập ownership diff từ nội dung hiện tại**

Run:

```powershell
rg -n "^#{1,4} |ACID|Isolation|Lost Update|constraint|idempot" src/assets/docs/database/transactions/theory.md
```

Expected: xác định phần thuộc transaction và phần đang lấn sang ACID, anomalies hoặc pattern.

- [ ] **Step 2: Viết lại title và phần mở đầu**

Dùng title `# Transaction`. Phần mở đầu phải:

- nêu một kết quả nghiệp vụ cần nhiều write;
- định nghĩa transaction bằng ngôn ngữ thông thường;
- đặt câu hỏi trung tâm về những write phải cùng commit hoặc rollback;
- không dùng ACID để giải thích transaction trước khi ACID được giới thiệu.

- [ ] **Step 3: Tổ chức lại nội dung theo outline sở hữu**

Giữ nội dung cần thiết dưới các heading chính theo thứ tự:

```text
1. Transaction semantics
2. Transaction boundary
3. Transaction lifecycle
4. Transaction trong application
5. Commit outcome và retry
6. Transaction dài và batch
7. Checklist
8. Tóm tắt
```

Đưa auto-commit và explicit transaction vào phần đầu sau `COMMIT`/`ROLLBACK`. Giữ savepoint, nested transaction, connection ownership và ambiguous outcome. Rút business condition, constraint và idempotency thành đoạn giới hạn kèm link sang ACID hoặc Concurrency Control Patterns.

- [ ] **Step 4: Chuẩn hóa ví dụ và liên kết chuyển bài**

Ví dụ chính dùng transaction tạo đơn hoặc cập nhật tồn kho với các identifier `donHangId`, `sanPhamId`, `soLuong`. Kết bài liên kết sang `/database/acid/theory` và giải thích ACID là bước tiếp theo, không tóm tắt trước bốn thuộc tính.

- [ ] **Step 5: Chạy review pass và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/transactions/theory.md
git diff --check -- src/assets/docs/database/transactions/theory.md
git diff -- src/assets/docs/database/transactions/theory.md
git add -- src/assets/docs/database/transactions/theory.md
git commit -m "docs: refactor transaction fundamentals"
```

Expected: transaction có thể đọc độc lập; không còn phần giải thích sâu ACID, anomaly hoặc concurrency pattern.

---

### Task 3: Refactor ACID

**Files:**
- Modify: `src/assets/docs/database/acid/theory.md`

**Interfaces:**
- Consumes: Transaction boundary, temporary state, commit và rollback từ Task 2.
- Produces: Định nghĩa Atomicity, Consistency, Isolation và Durability; bài Isolation dùng định nghĩa Isolation này làm prerequisite.

- [ ] **Step 1: Kiểm tra title, heading và thuật ngữ dùng trước định nghĩa**

Run:

```powershell
rg -n "^#{1,4} |Atomicity|Consistency|Isolation|Durability|WAL|Write-Ahead" src/assets/docs/database/acid/theory.md
```

Expected: bốn thuộc tính có section riêng; mọi thuật ngữ storage nâng cao được phát hiện để đưa xuống sau định nghĩa Durability.

- [ ] **Step 2: Viết phần mở đầu và định nghĩa ACID**

Dùng title `# ACID`. Giải thích ACID là bốn nhóm bảo đảm của transaction ngay lần xuất hiện đầu tiên. Nêu rõ ACID không có nghĩa là mọi business rule tự động đúng hoặc mọi transaction chạy tuần tự.

- [ ] **Step 3: Chuẩn hóa bốn section thuộc tính**

Mỗi section phải có cùng ba câu hỏi:

```text
Thuộc tính bảo vệ điều gì?
Database thực hiện bảo đảm đó ở phạm vi nào?
Thuộc tính không bảo vệ điều gì?
```

Atomicity dùng partial write; Consistency phân biệt database constraint và application rule; Isolation chỉ giới thiệu concurrent interleaving; Durability giải thích commit acknowledgement trước khi giới thiệu WAL và flush policy.

- [ ] **Step 4: Tách nội dung thuộc bài sau**

Rút danh sách anomaly và isolation level thành một đoạn chuyển tiếp tới `/database/isolation-levels/theory`. Giữ WAL ở mức đủ giải thích Durability, không mở rộng sang storage engine internals.

- [ ] **Step 5: Review và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/acid/theory.md
git diff --check -- src/assets/docs/database/acid/theory.md
git diff -- src/assets/docs/database/acid/theory.md
git add -- src/assets/docs/database/acid/theory.md
git commit -m "docs: refactor acid properties"
```

Expected: người đọc hiểu từng bảo đảm và giới hạn trước khi gặp isolation levels.

---

### Task 4: Refactor Transaction Isolation

**Files:**
- Modify: `src/assets/docs/database/isolation-levels/theory.md`

**Interfaces:**
- Consumes: Transaction và ý nghĩa Isolation từ Tasks 2–3.
- Produces: Định nghĩa schedule, anomalies và isolation contracts cho Locking, Patterns và InnoDB.

- [ ] **Step 1: Kiểm tra dependency và engine-specific prose**

Run:

```powershell
rg -n "^#{1,4} |MySQL|PostgreSQL|SQL Server|InnoDB|MVCC|lock" src/assets/docs/database/isolation-levels/theory.md
```

Expected: có danh sách chính xác các đoạn cần giữ database-neutral hoặc tách thành ghi chú engine.

- [ ] **Step 2: Chuẩn hóa phần mở đầu và schedule**

Giữ title `# Transaction Isolation`. Định nghĩa thứ tự thực thi là thứ tự xen kẽ các operation của nhiều transaction trước khi dùng các tên concurrency anomaly. So sánh thực thi tuần tự với thực thi xen kẽ bằng một timeline nhỏ.

- [ ] **Step 3: Dạy anomaly trước isolation level**

Giữ thứ tự:

```text
Dirty Read
Non-repeatable Read
Phantom Read
Lost Update
Write Skew
```

Mỗi anomaly phải có initial state, operation của A/B, final observation, invariant bị phá vỡ và loại cơ chế có thể ngăn hoặc phát hiện. Không chọn pattern thay application trong bài này.

- [ ] **Step 4: Trình bày isolation contracts và implementation families**

Sau anomalies mới trình bày `READ UNCOMMITTED`, `READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`, rồi MVCC và lock-based read. Bảng so sánh phải ghi rõ SQL standard không mô tả hết behavior của từng engine; khác biệt engine đặt trong note riêng.

- [ ] **Step 5: Đồng bộ bài kế tiếp**

Không thêm section hoặc route demo vào bài. Kết bài chuyển sang `/database/locking-deadlock/theory` bằng câu hỏi engine phối hợp resource tranh chấp ra sao.

- [ ] **Step 6: Review và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/isolation-levels/theory.md
git diff --check -- src/assets/docs/database/isolation-levels/theory.md
git diff -- src/assets/docs/database/isolation-levels/theory.md
git add -- src/assets/docs/database/isolation-levels/theory.md
git commit -m "docs: refactor isolation levels and anomalies"
```

Expected: anomaly được định nghĩa trước level; phần database-neutral và engine-specific không trộn lẫn.

---

### Task 5: Refactor Locking, Blocking và Deadlock

**Files:**
- Modify: `src/assets/docs/database/locking-deadlock/theory.md`

**Interfaces:**
- Consumes: Transaction duration, isolation contract và anomalies.
- Produces: Lock coordination, wait behavior và deadlock diagnosis cho pattern và InnoDB chapters.

- [ ] **Step 1: Audit ownership và engine-specific mechanisms**

Run:

```powershell
rg -n "^#{1,4} |SQL Server|MySQL|InnoDB|PostgreSQL|gap|next-key|escalation" src/assets/docs/database/locking-deadlock/theory.md
```

Expected: nhận diện được `Update Lock`, lock escalation và range locking cần gắn nhãn engine hoặc chuyển thành khái quát database-neutral.

- [ ] **Step 2: Đổi title và thiết lập prerequisite**

Dùng title `# Locking, Blocking và Deadlock`. Mở đầu định nghĩa ngắn cả ba thuật ngữ; liên kết Transaction và Isolation như prerequisite nhưng vẫn cung cấp đủ câu dẫn để bài tự đọc được.

- [ ] **Step 3: Sắp xếp lại cơ chế từ đơn giản đến failure**

Dùng thứ tự heading chính:

```text
1. Lock và lock resource
2. Lock compatibility
3. Access path và lock footprint
4. Blocking và lock wait
5. Deadlock và wait-for graph
6. Lock ordering
7. Range protection
8. Lock duration và batch workload
9. Chẩn đoán blocking và deadlock
10. Retry deadlock
11. Checklist
12. Tóm tắt
```

Định nghĩa resource trước shared/exclusive lock; định nghĩa blocking trước deadlock; dựng wait-for graph trước victim selection.

- [ ] **Step 4: Cô lập khác biệt engine và phần thuộc InnoDB**

Đặt `Update Lock` và lock escalation trong note SQL Server. Range protection chỉ giải thích predicate/range ở mức chung; record/gap/next-key lock chuyển thành link tới `/database/mysql-innodb-concurrency/theory`.

- [ ] **Step 5: Review prose và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/locking-deadlock/theory.md
git diff --check -- src/assets/docs/database/locking-deadlock/theory.md
git diff -- src/assets/docs/database/locking-deadlock/theory.md
git add -- src/assets/docs/database/locking-deadlock/theory.md
git commit -m "docs: refactor locking blocking and deadlock"
```

Expected: một luồng rõ từ lock đến blocking rồi deadlock; implementation riêng của engine không chi phối phần chính.

---

### Task 6: Refactor Concurrency Control Patterns

**Files:**
- Modify: `src/assets/docs/database/concurrency-control-patterns/theory.md`

**Interfaces:**
- Consumes: Boundary, anomalies, lock behavior và retry semantics.
- Produces: Quy trình lựa chọn điểm phân xử và pattern cho business invariant.

- [ ] **Step 1: Lập inventory pattern và phần trùng lý thuyết**

Run:

```powershell
rg -n "^#{1,4} |Unique|Idempot|Atomic|Optimistic|Pessimistic|Queue|Claim|Outbox|Inbox|Lost Update|Deadlock" src/assets/docs/database/concurrency-control-patterns/theory.md
```

Expected: tất cả pattern được liệt kê; phần định nghĩa lại Lost Update, lock internals hoặc transaction boundary được phát hiện.

- [ ] **Step 2: Viết lại phần quyết định trước catalogue pattern**

Mở đầu định nghĩa concurrency control pattern và ba input lựa chọn:

```text
Business invariant cần bảo vệ
Resource hoặc boundary nơi conflict xảy ra
Conflict rate và phản ứng caller có thể chấp nhận
```

Không bắt đầu bằng một use case cụ thể hoặc câu hỏi chọn lock.

- [ ] **Step 3: Chuẩn hóa template nội dung cho từng pattern**

Với Unique Constraint, Idempotency Key, Atomic Conditional Update, Optimistic Concurrency, Pessimistic Locking, Queue theo Hot Key, Atomic Claim và Outbox/Inbox, mỗi section phải chứa:

```text
Vấn đề pattern giải quyết
Điểm phân xử
SQL hoặc contract nhỏ nhất
Failure window còn lại
Điều kiện chọn và giới hạn
```

Liên kết về bài trước thay cho việc định nghĩa lại transaction, anomaly hoặc lock mechanics.

- [ ] **Step 4: Đưa ma trận lựa chọn trước case studies**

Ma trận phải ánh xạ invariant/failure vào cơ chế ưu tiên, gồm ít nhất duplicate key, conditional state transition, stale edit, hot contention, competing worker và database-message dual write. Sau ma trận mới dùng các case study tạo đơn, chỉnh sửa hồ sơ và booking để tổng hợp.

- [ ] **Step 5: Giữ case study độc lập với demo UI**

Giữ Lost Update và Outbox dưới dạng case thực tế phục vụ lý thuyết. Không thêm section `Demo`, `Lab`, route UI hoặc hướng dẫn thao tác vào bài.

- [ ] **Step 6: Review và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/concurrency-control-patterns/theory.md
git diff --check -- src/assets/docs/database/concurrency-control-patterns/theory.md
git diff -- src/assets/docs/database/concurrency-control-patterns/theory.md
git add -- src/assets/docs/database/concurrency-control-patterns/theory.md
git commit -m "docs: refactor concurrency control patterns"
```

Expected: lý thuyết quyết định xuất hiện trước case study; mỗi pattern có điểm phân xử và failure window rõ ràng.

---

### Task 7: Refactor MySQL InnoDB Concurrency Internals

**Files:**
- Modify: `src/assets/docs/database/mysql-innodb-concurrency/theory.md`

**Interfaces:**
- Consumes: Toàn bộ khái niệm database-neutral từ Tasks 2–6.
- Produces: Ánh xạ cụ thể từ isolation, locking và patterns sang behavior MySQL/InnoDB.

- [ ] **Step 1: Audit phần định nghĩa lại khái niệm chung**

Run:

```powershell
rg -n "^#{1,4} |Lost Update|Pessimistic|Deadlock|Atomic|Optimistic|Read View|Record Lock|Gap Lock|Next-Key|Undo|Purge" src/assets/docs/database/mysql-innodb-concurrency/theory.md
```

Expected: phân biệt được phần InnoDB-specific với phần đang lặp nội dung của Isolation, Locking hoặc Patterns.

- [ ] **Step 2: Đổi title và định nghĩa phạm vi version/configuration**

Dùng title `# MySQL InnoDB Concurrency Internals`. Mở đầu nêu rõ bài giải thích cách InnoDB hiện thực các contract đã học, không định nghĩa lại chúng. Ghi phạm vi MySQL 8.x và yêu cầu kiểm tra session isolation, index, execution plan cùng server configuration thực tế.

- [ ] **Step 3: Tổ chức theo đường đi của read và write**

Dùng thứ tự:

```text
1. Session isolation
2. Consistent read và Read View
3. Current read và locking read
4. Record Lock và index access path
5. Gap Lock và Next-Key Lock
6. Insert Intention và insert conflict
7. Conditional write trong InnoDB
8. Pessimistic locking trong InnoDB
9. Deadlock trong InnoDB
10. Transaction dài, undo và purge
11. Công cụ quan sát InnoDB
12. Case studies
13. Checklist
14. Tóm tắt
```

Mỗi phần bắt đầu bằng contract chung rồi chỉ ra behavior InnoDB cụ thể.

- [ ] **Step 4: Rút phần lặp thành cross-link có chủ đích**

Lost Update liên kết sang Isolation; atomic/optimistic/pessimistic choice liên kết sang Patterns; wait-for graph và retry policy liên kết sang Locking. Giữ SQL, lock scope, read view và observability dành riêng cho InnoDB.

- [ ] **Step 5: Review tính chính xác engine-specific và commit**

Run:

```powershell
rg -n "^#{1,4} |/database/" src/assets/docs/database/mysql-innodb-concurrency/theory.md
git diff --check -- src/assets/docs/database/mysql-innodb-concurrency/theory.md
git diff -- src/assets/docs/database/mysql-innodb-concurrency/theory.md
git add -- src/assets/docs/database/mysql-innodb-concurrency/theory.md
git commit -m "docs: refactor innodb concurrency internals"
```

Expected: bài chỉ còn định nghĩa chi tiết riêng của InnoDB; các lựa chọn application không bị dạy lại.

---

### Task 8: Audit và đồng bộ demo

**Files:**
- Verify/Modify if required: `src/app/features/database/transactions/transaction-demo.component.ts`
- Verify/Modify if required: `src/app/features/database/transactions/transaction-demo.component.html`
- Verify/Modify if required: `src/app/features/database/transactions/outbox-flow-demo.component.ts`
- Verify/Modify if required: `src/app/features/database/transactions/outbox-flow-demo.component.html`
- Verify/Modify if required: `src/app/features/database/isolation-anomalies/isolation-anomalies-demo.component.ts`
- Verify/Modify if required: `src/app/features/database/isolation-anomalies/isolation-anomalies-demo.component.html`
- Verify/Modify if required: `src/app/app-routing.module.ts`

**Interfaces:**
- Consumes: Phạm vi demo được sáu bài sau refactor công bố.
- Produces: Demo labels, scenarios và route data không mâu thuẫn với curriculum.

- [ ] **Step 1: Map route tới scenario thực tế**

Run:

```powershell
rg -n "demoLabs|boundary|lost-update|deadlock|outbox|Dirty|Non-repeatable|Phantom|Write Skew" src/app/app-routing.module.ts src/app/features/database/transactions src/app/features/database/isolation-anomalies
```

Expected: lập được mapping route → component → scenario mà không sửa code.

- [ ] **Step 2: Đối chiếu bốn trách nhiệm demo**

Xác nhận:

```text
/database/transactions/demo                    -> boundary
/database/isolation-anomalies/demo             -> isolation anomalies
/database/locking-deadlock/demo                -> deadlock và lock ordering
/database/concurrency-control-patterns/demo     -> lost update và outbox
```

Nếu mapping đã đúng, không sửa component. Chỉ sửa label, description hoặc route data khi nội dung hiển thị tuyên bố sai phạm vi.

- [ ] **Step 3: Kiểm tra interaction khi có sửa demo**

Với từng scenario bị sửa, thao tác lần lượt: reset, bước tiếp theo đến cuối, quay lại, tự chạy và đổi tốc độ. Xác nhận execution log trùng visible state; kiểm tra light/dark theme và viewport hẹp.

- [ ] **Step 4: Review diff và commit khi có thay đổi**

Run:

```powershell
git diff --check -- src/app/features/database src/app/app-routing.module.ts
git diff -- src/app/features/database src/app/app-routing.module.ts
```

Nếu không có diff phục vụ curriculum, bỏ qua commit. Nếu có, chỉ stage đúng file đã audit và commit:

```powershell
git add -- src/app/features/database/transactions src/app/features/database/isolation-anomalies src/app/app-routing.module.ts
git commit -m "docs: align concurrency demos with curriculum"
```

Expected: không có component, abstraction hoặc dependency mới.

---

### Task 9: Kiểm tra toàn bộ curriculum và production build

**Files:**
- Verify: `src/app/layout/shell/menu.config.ts`
- Verify: `src/app/app-routing.module.ts`
- Verify: `src/assets/docs/database/transactions/theory.md`
- Verify: `src/assets/docs/database/acid/theory.md`
- Verify: `src/assets/docs/database/isolation-levels/theory.md`
- Verify: `src/assets/docs/database/locking-deadlock/theory.md`
- Verify: `src/assets/docs/database/concurrency-control-patterns/theory.md`
- Verify: `src/assets/docs/database/mysql-innodb-concurrency/theory.md`

**Interfaces:**
- Consumes: Tất cả deliverable từ Tasks 1–8.
- Produces: Curriculum có link hợp lệ, encoding đúng và build được.

- [ ] **Step 1: Kiểm tra title và thứ tự bài**

Run:

```powershell
rg -n "^# " src/assets/docs/database/transactions/theory.md src/assets/docs/database/acid/theory.md src/assets/docs/database/isolation-levels/theory.md src/assets/docs/database/locking-deadlock/theory.md src/assets/docs/database/concurrency-control-patterns/theory.md src/assets/docs/database/mysql-innodb-concurrency/theory.md
```

Expected: sáu title khớp navigation đã định nghĩa ở Task 1.

- [ ] **Step 2: Kiểm tra nhãn nội bộ và dấu hiệu mojibake trong byte UTF-8 đã decode**

Run:

```powershell
rg -n -i "mô hình tư duy|khung tư duy|cách tư duy|Tráº|Ä‘|Ã.|Â.|â€“|â€”|â†’" src/assets/docs/database/transactions src/assets/docs/database/acid src/assets/docs/database/isolation-levels src/assets/docs/database/locking-deadlock src/assets/docs/database/concurrency-control-patterns src/assets/docs/database/mysql-innodb-concurrency
```

Expected: không có kết quả. Nếu terminal tự hiển thị sai nhưng `rg` không tìm thấy chuỗi lỗi trong file, không sửa nội dung.

- [ ] **Step 3: Kiểm tra cross-link của curriculum**

Run:

```powershell
rg -n -o "/database/[a-z0-9-]+/theory" src/assets/docs/database/transactions/theory.md src/assets/docs/database/acid/theory.md src/assets/docs/database/isolation-levels/theory.md src/assets/docs/database/locking-deadlock/theory.md src/assets/docs/database/concurrency-control-patterns/theory.md src/assets/docs/database/mysql-innodb-concurrency/theory.md
rg -n "path: 'database/(transactions|acid|isolation-levels|locking-deadlock|concurrency-control-patterns|mysql-innodb-concurrency|isolation-anomalies)'" src/app/app-routing.module.ts
```

Expected: mọi link được dùng đều có route tương ứng.

- [ ] **Step 4: Review dependency theo góc nhìn người học mới**

Đọc lần lượt sáu phần mở đầu và phần kết. Với mỗi thuật ngữ kỹ thuật trong title hoặc hai section đầu, xác nhận một trong hai điều:

```text
Thuật ngữ được định nghĩa ngay lần đầu xuất hiện.
Thuật ngữ là prerequisite đã được giới thiệu và có link trực tiếp.
```

Expected: không cần đọc ngược bài sau để hiểu bài trước.

- [ ] **Step 5: Review độ sâu của định nghĩa và cấu trúc đọc**

Với từng khái niệm cốt lõi, lập kiểm tra trực tiếp trên section sở hữu nó:

```text
Định nghĩa cho biết khái niệm là gì.
Phần cơ chế giải thích database hoặc application thực hiện điều đó ra sao.
Phạm vi nêu rõ điều được bảo đảm và điều không được bảo đảm.
Ví dụ cho thấy initial state, operation và kết quả quan sát được.
Failure mode giải thích điều gì xảy ra khi dùng sai hoặc khi cơ chế không bao phủ.
```

Nếu một section có từ hai cơ chế độc lập, từ hai failure mode cần phân tích riêng hoặc một chuỗi thực thi nhiều giai đoạn, tách section bằng heading con có thuật ngữ kỹ thuật cụ thể. Không thay phần giải thích bằng checklist; checklist chỉ được dùng sau khi lý thuyết đã hoàn chỉnh.

Expected: người đọc có thể giải thích nguyên nhân và cơ chế, không chỉ nhớ tên hoặc kết luận.

- [ ] **Step 6: Chạy kiểm tra whitespace và production build**

Run:

```powershell
git diff --check
npm run build
```

Expected: `git diff --check` không báo lỗi mới; Angular production build exit code 0.

- [ ] **Step 7: Kiểm tra worktree và commit phần sửa xác minh nếu có**

Run:

```powershell
git status --short
git diff -- src/app/layout/shell/menu.config.ts src/app/app-routing.module.ts src/assets/docs/database src/app/features/database
```

Nếu review cuối tạo ra chỉnh sửa nội dung, stage đúng file thuộc curriculum và commit:

```powershell
git add -- src/app/layout/shell/menu.config.ts src/app/app-routing.module.ts src/assets/docs/database/transactions/theory.md src/assets/docs/database/acid/theory.md src/assets/docs/database/isolation-levels/theory.md src/assets/docs/database/locking-deadlock/theory.md src/assets/docs/database/concurrency-control-patterns/theory.md src/assets/docs/database/mysql-innodb-concurrency/theory.md
git commit -m "docs: finalize transaction concurrency curriculum"
```

Expected: không stage các thay đổi ngoài phạm vi đã tồn tại trong worktree.
