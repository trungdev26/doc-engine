# Transaction và Concurrency Control Curriculum Design

## Mục tiêu

Tổ chức lại cụm tài liệu Database về transaction và xử lý truy cập đồng thời thành một lộ trình có thể đọc từ kiến thức nền tảng đến cơ chế chuyên sâu. Mỗi bài phải tự đọc được, đồng thời chỉ phụ thuộc vào những khái niệm đã được giới thiệu ở các bài đứng trước.

## Phạm vi

Refactor sáu bài lý thuyết hiện có:

1. `src/assets/docs/database/transactions/theory.md`
2. `src/assets/docs/database/acid/theory.md`
3. `src/assets/docs/database/isolation-levels/theory.md`
4. `src/assets/docs/database/locking-deadlock/theory.md`
5. `src/assets/docs/database/concurrency-control-patterns/theory.md`
6. `src/assets/docs/database/mysql-innodb-concurrency/theory.md`

Cập nhật navigation, route hoặc liên kết nội bộ cần thiết để sáu bài xuất hiện đúng thứ tự. Audit các demo liên quan và chỉ sửa khi tên, mô tả, liên kết hoặc phạm vi minh họa không còn khớp với curriculum mới.

Không tạo thêm bài hoặc demo nếu nội dung hiện có có thể được sắp xếp và viết lại để đáp ứng mục tiêu.

## Navigation

Nhóm hiện tại `05. Giao dịch và kiểm soát đồng thời` đổi thành:

```text
05. Transaction và Concurrency Control
├── 01. Transaction
├── 02. ACID
├── 03. Transaction Isolation
├── 04. Locking, Blocking và Deadlock
├── 05. Concurrency Control Patterns
└── 06. MySQL InnoDB Concurrency Internals
```

Navigation phải đưa `ACID` và `Transaction Isolation` vào lộ trình chính. Demo giữ trong nhóm riêng và được đặt tên theo đúng cơ chế mà nó minh họa.

## Trình tự trình bày

Các bài áp dụng cách dẫn dắt đã tạo hiệu quả trong tài liệu RabbitMQ:

1. Nêu hành vi hoặc vấn đề cần giải thích.
2. Định nghĩa thuật ngữ bằng ngôn ngữ thông thường.
3. Mô tả thành phần và cơ chế thực thi.
4. Giới thiệu cú pháp hoặc API nhỏ nhất cần thiết.
5. Theo dõi một ví dụ nhỏ qua từng trạng thái.
6. Mở rộng ví dụ bằng một biến số mới mỗi lần.
7. Phân tích failure window và cách chẩn đoán.
8. Nêu giới hạn, ứng dụng và tóm tắt.

Tên các phần phải là thuật ngữ kỹ thuật chuẩn, ngắn và có thể tìm kiếm. Nội dung không dùng nhãn nội bộ để gọi tên phương pháp trình bày.

Không rút gọn lý thuyết thành định nghĩa một dòng hoặc checklist. Mỗi khái niệm cốt lõi phải trả lời đủ: nó là gì, giải quyết vấn đề nào, cơ chế vận hành ra sao, bảo đảm trong phạm vi nào, không bảo đảm điều gì và biểu hiện thế nào trong một ví dụ có thể theo dõi. Khi một section chứa nhiều cơ chế hoặc nhiều bước suy luận, tách thành các heading con có tên kỹ thuật thay vì đặt toàn bộ nội dung trong một đoạn dài.

## Phạm vi kiến thức của từng bài

### Transaction

Sở hữu các khái niệm transaction boundary, trạng thái tạm thời, `COMMIT`, `ROLLBACK`, auto-commit, explicit transaction, lifecycle, savepoint, connection/session ownership, ambiguous commit outcome và transaction dài.

Bài chỉ giới thiệu ACID ở mức liên kết sang bài kế tiếp, không giải thích lại bốn thuộc tính.

### ACID

Sở hữu định nghĩa Atomicity, Consistency, Isolation và Durability; giải thích mỗi thuộc tính bảo đảm gì, không bảo đảm gì và trade-off cơ bản.

Bài không lặp lại transaction lifecycle, không phân tích chi tiết isolation levels và không đi sâu vào implementation riêng của engine.

### Transaction Isolation

Sở hữu concurrent schedule, serial schedule, Dirty Read, Non-repeatable Read, Phantom Read, Lost Update, Write Skew, bốn isolation level chuẩn và sự khác nhau giữa MVCC với lock-based read ở mức database-neutral.

Anomaly được định nghĩa trước khi dùng isolation level để phân loại hành vi. Khác biệt của từng engine được tách thành ghi chú có nhãn rõ ràng.

### Locking, Blocking và Deadlock

Sở hữu lock resource, shared/exclusive lock, compatibility, lock footprint, blocking chain, timeout, wait-for graph, deadlock detection, victim selection, lock ordering, retry và dữ liệu chẩn đoán.

Bài dựa trên khái niệm transaction và isolation đã có, nhưng phải nhắc lại prerequisite bằng một đoạn ngắn và liên kết trực tiếp thay vì giả định người đọc tự biết.

### Concurrency Control Patterns

Sở hữu việc chuyển business invariant thành cơ chế bảo vệ: unique constraint, atomic conditional update, optimistic concurrency, pessimistic locking, idempotency, claim worker, tuần tự hóa theo hot key và Transactional Outbox/Inbox.

Mỗi pattern theo cùng cấu trúc: vấn đề, điểm phân xử, SQL hoặc contract nhỏ nhất, failure window, giới hạn và điều kiện lựa chọn. Case study chỉ tổng hợp các pattern đã được định nghĩa.

### MySQL InnoDB Concurrency Internals

Sở hữu hành vi riêng của MySQL/InnoDB: session isolation, consistent read, current read, read view, undo, record lock, gap lock, next-key lock, insert intention, purge và công cụ quan sát.

Bài không định nghĩa lại anomaly hoặc pattern. Mỗi cơ chế InnoDB phải liên kết về khái niệm database-neutral tương ứng và nêu rõ phạm vi version/configuration.

## Ví dụ xuyên suốt

Dùng một bộ dữ liệu tồn kho nhỏ làm ví dụ chung khi phù hợp vì nó thể hiện được boundary, invariant, lost update, locking và conditional update. Mỗi bài phải giới thiệu đủ dữ liệu cần dùng trong chính bài đó; người đọc không bị buộc phải nhớ một case study từ bài trước.

Các tình huống đặt hàng, booking, worker và Outbox chỉ được dùng sau khi khái niệm liên quan đã được định nghĩa. Không đổi domain chỉ để tạo thêm ví dụ tương đương.

Identifier trong SQL tuân theo quy ước `camelCase` của repository. Nội dung database-neutral không mặc định MySQL, PostgreSQL hoặc SQL Server là engine chuẩn.

## Demo

Demo được audit theo trách nhiệm sau:

- Transaction demo: transaction boundary, partial state và Lost Update nếu scenario này không trùng với Isolation demo.
- Isolation demo: anomalies và sự khác nhau giữa các isolation contract.
- Locking demo: blocking, wait-for graph, deadlock và lock ordering.
- Concurrency Control demo: giữ trọng tâm Transactional Outbox; không mở rộng thành catalogue của mọi pattern.

Không tạo demo riêng cho ACID hoặc InnoDB trừ khi audit chứng minh nội dung hiện tại không thể giải thích rõ bằng prose, SQL và diagram tĩnh. Mọi demo được sửa phải tiếp tục dùng shared components và interaction model hiện có.

Các bài lý thuyết không có section `Demo`, `Lab`, không nhắc route UI và không giải thích thao tác trên demo. Ví dụ trong bài được trình bày như case thực tế độc lập; navigation chịu trách nhiệm dẫn người dùng tới demo.

## Liên kết và dependency

Mỗi bài mở đầu bằng prerequisite boundary ngắn:

- Transaction: không yêu cầu bài nào trong cụm.
- ACID: yêu cầu khái niệm transaction cơ bản.
- Isolation: yêu cầu transaction và ý nghĩa Isolation trong ACID.
- Locking: yêu cầu transaction và isolation contract.
- Patterns: yêu cầu transaction, anomalies và locking cơ bản.
- InnoDB: yêu cầu toàn bộ khái niệm database-neutral đứng trước.

Cross-link chỉ dùng để nối prerequisite, nội dung chuyên sâu thuộc bài khác hoặc bước học tiếp theo. Không dùng cross-link thay cho định nghĩa cần thiết để hiểu đoạn hiện tại.

## Tiêu chí hoàn thành

- Sáu bài xuất hiện đúng thứ tự trong navigation và route hợp lệ.
- Không có thuật ngữ bắt buộc nào được dùng trước khi định nghĩa hoặc liên kết prerequisite rõ ràng.
- Định nghĩa không chỉ thay thuật ngữ bằng một từ đồng nghĩa; nó phải nêu phạm vi, hành vi quan sát được và điểm khác với khái niệm gần nhất.
- Nội dung giữ đủ chiều sâu để giải thích nguyên nhân và cơ chế, không rút thành ghi chú hoặc danh sách kết luận.
- Section dài được tách theo thành phần, giai đoạn thực thi, failure mode hoặc giới hạn; heading con phải cho biết phần đó sở hữu kiến thức gì.
- Mỗi khái niệm chính có một bài sở hữu; phần lặp lại ở bài khác được rút thành liên kết hoặc recap ngắn.
- Headings dùng thuật ngữ chuẩn và phản ánh dependency từ nền tảng đến chuyên sâu.
- Ví dụ có input, state transition và kết quả được giải thích; không có code block đứng riêng thay cho lý thuyết.
- Khác biệt engine được tách khỏi phần database-neutral.
- Demo và nhãn navigation khớp với phạm vi bài tương ứng.
- Sáu bài lý thuyết không chứa section hoặc liên kết giới thiệu demo.
- Tất cả liên kết nội bộ hợp lệ; production build thành công.
- Nội dung tiếng Việt giữ đúng UTF-8 và không sửa dựa trên mojibake của terminal.

## Ngoài phạm vi

- Không thêm dependency frontend.
- Không đổi thiết kế chung của shell hoặc markdown renderer.
- Không mở rộng sang distributed transaction, saga hoặc consensus ngoài phần liên hệ ngắn cần thiết cho Outbox.
- Không viết lại tài liệu RabbitMQ; bài đó chỉ là tham chiếu về trình tự giải thích.
