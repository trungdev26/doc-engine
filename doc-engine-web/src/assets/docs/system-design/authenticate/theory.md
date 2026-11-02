# Authentication trong System Design

> Tài liệu này tập trung vào tư duy và lịch sử tiến hóa của cơ chế xác thực trên web: vì sao session/cookie ra đời, nỗi đau nào đẩy hệ thống chuyển sang stateless/JWT, và OAuth2/OpenID Connect giải quyết vấn đề gì mà JWT thuần không làm được. Đây là tài liệu về **tư duy chọn kiến trúc authen cho hệ thống**, không đi sâu vào cách cấu hình từng công nghệ — phần cấu hình chi tiết (JWT Bearer, OAuth2 client, session store...) sẽ có ở tài liệu riêng.

---

## Mục tiêu tài liệu

Sau khi đọc xong, người đọc cần trả lời được các câu hỏi sau:

```text
1. Vì sao HTTP cần một cơ chế riêng để "nhớ" người dùng qua nhiều request?
2. Session + Cookie hoạt động thế nào, và "stateful" nghĩa là gì trong ngữ cảnh này?
3. Khi nào session/cookie bắt đầu gây đau, và điều gì thúc đẩy JWT ra đời?
4. JWT giải quyết được vấn đề gì, và "stateless" có thật sự tuyệt đối không?
5. JWT chưa giải quyết được vấn đề gì, và hệ thống thực tế vá lại bằng cách nào?
6. OAuth2 và OpenID Connect ra đời để giải quyết vấn đề gì mà JWT tự chế không làm được?
7. Với một hệ thống cụ thể (web nội bộ, SPA, mobile, multi-app doanh nghiệp, public API),
   nên chọn cơ chế nào và vì sao?
```

---

## 1. Vấn đề gốc: HTTP không có trí nhớ

### 1.1. HTTP là stateless

Mỗi request HTTP là một giao dịch độc lập — server xử lý xong, trả response, và không giữ lại bất kỳ ngữ cảnh nào về request đó.

```text
Request 1: GET /profile     → server không biết ai đang hỏi
Request 2: POST /orders     → server coi đây là một client hoàn toàn mới, không liên quan gì request 1
```

Đây là thiết kế có chủ đích của HTTP (đơn giản, dễ scale, server không cần nhớ gì), nhưng lại tạo ra một vấn đề rất thực tế: sau khi người dùng đăng nhập thành công ở request đầu, làm sao server biết được **ở request thứ hai, thứ ba... đây vẫn là cùng một người đã đăng nhập**?

### 1.2. Bài toán cần giải

```text
User gửi username/password → server xác nhận đúng → server trả lời "OK, đúng rồi".

Nhưng request tiếp theo (xem đơn hàng, cập nhật hồ sơ...) lại là một kết nối
HTTP hoàn toàn mới, không tự động mang theo thông tin "tôi đã đăng nhập rồi".

Cần một cơ chế để request sau "chứng minh" mình là chính người đã đăng nhập
ở request trước, mà không phải nhập lại username/password mỗi lần.
```

Toàn bộ lịch sử tiến hóa của authentication trên web — session, cookie, token, JWT, OAuth2 — đều xoay quanh việc giải bài toán này theo những cách khác nhau, với đánh đổi khác nhau.

---

## 2. Giai đoạn 1: Session + Cookie (Stateful Authentication)

### 2.1. Ý tưởng cốt lõi

```text
Sau khi xác thực đúng, SERVER tự tạo ra một "session" — một vùng nhớ nhỏ
đại diện cho phiên làm việc của user đó, có một ID duy nhất (session ID).

Server trả session ID này về cho trình duyệt.
Trình duyệt lưu session ID và tự động gửi kèm lại ở MỌI request tiếp theo.
Server chỉ cần tra session ID để biết request này thuộc về ai.
```

Luồng cơ bản:

```text
1. Client gửi username/password.
2. Server xác thực đúng → tạo session, lưu trong bộ nhớ/DB/Redis phía server:
     session["a1b2c3"] = { userId: 42, role: "Admin", loginAt: ... }
3. Server trả về response kèm: Set-Cookie: sessionId=a1b2c3
4. Trình duyệt lưu cookie này.
5. Mọi request sau đó, trình duyệt TỰ ĐỘNG đính kèm: Cookie: sessionId=a1b2c3
6. Server nhận request, tra session["a1b2c3"] → biết ngay đây là userId 42, role Admin.
```

### 2.2. Cookie là gì và vì sao nó "tự động"

Cookie là một mẩu dữ liệu nhỏ mà server yêu cầu trình duyệt lưu lại, và trình duyệt có trách nhiệm **tự động gửi lại** cookie đó cho đúng domain đã cấp ra nó, ở mọi request sau đó — đây là hành vi có sẵn của trình duyệt, không cần code JavaScript nào can thiệp.

```text
Server: Set-Cookie: sessionId=a1b2c3; HttpOnly; Secure; SameSite=Lax

Từ đây, mọi request trình duyệt gửi tới đúng domain đó đều tự mang theo:
Cookie: sessionId=a1b2c3
```

Đây chính là lý do session + cookie trở thành lựa chọn mặc định trong nhiều năm: nó tận dụng đúng một cơ chế trình duyệt đã hỗ trợ sẵn, lập trình viên gần như không phải làm gì thêm ở phía client.

### 2.3. Vì sao gọi là "Stateful"

```text
Stateful nghĩa là SERVER phải tự nhớ trạng thái (state) của từng user đang đăng nhập.

Không có session lưu ở đâu đó (memory, DB, Redis), server không thể biết
sessionId=a1b2c3 tương ứng với ai — bản thân sessionId chỉ là một chuỗi vô nghĩa,
mọi ý nghĩa nằm ở dữ liệu server lưu lại phía sau nó.
```

Đây là điểm mấu chốt để phân biệt với JWT sau này: với session, **thông tin thật sự nằm ở server**, token chỉ là một "chìa khóa" để tra cứu.

### 2.4. Nỗi đau bắt đầu xuất hiện

Session + cookie hoạt động rất tốt với một mô hình: một server, một database, một website. Nỗi đau xuất hiện khi hệ thống lớn dần:

```text
Đau #1 — Scale ngang (nhiều instance server)

Nếu chạy 3 instance API phía sau load balancer, session được tạo ở instance A
nhưng request tiếp theo bị load balancer chuyển sang instance B — instance B
không có session đó trong bộ nhớ của nó → user bị coi như chưa đăng nhập.

Giải pháp tạm: "sticky session" (luôn route đúng user về đúng instance) —
nhưng làm giảm khả năng cân bằng tải thật sự, và nếu instance đó chết,
mọi session trên đó biến mất.

Giải pháp bền hơn: đưa session ra một nơi lưu trữ dùng chung (Redis, SQL Server)
thay vì lưu trong memory từng instance — nhưng lại thêm một thành phần hạ tầng
phải vận hành, và mỗi request giờ tốn thêm một lượt tra cứu mạng tới session store.
```

```text
Đau #2 — Cookie không tự nhiên với mobile app và nhiều domain khác nhau

Native mobile app (iOS/Android) không có khái niệm "trình duyệt tự gửi cookie"
như website — ứng dụng phải tự quản lý việc lưu và đính kèm session ID thủ công,
làm mất đi lợi thế "tự động" vốn là điểm mạnh của cookie.

Khi frontend (SPA) và backend nằm ở domain khác nhau (phổ biến với kiến trúc
microservices, nhiều subdomain, hoặc third-party tích hợp), cookie cross-domain
gặp nhiều giới hạn về chính sách trình duyệt (SameSite, third-party cookie),
ngày càng bị các trình duyệt hiện đại siết chặt hơn vì lý do privacy.
```

```text
Đau #3 — Nhiều service backend cùng cần xác thực độc lập

Trong kiến trúc microservices, nếu mọi service đều phải gọi về một session
store trung tâm để xác thực mỗi request, session store đó trở thành điểm
nghẽn (bottleneck) và điểm phụ thuộc chung (single point of failure) cho
toàn bộ hệ thống — trái với mục tiêu microservices là các service độc lập.
```

Ba nỗi đau này — đặc biệt là nhu cầu **scale ngang** và **nhiều service độc lập** — chính là động lực trực tiếp dẫn tới ý tưởng: "giá mà server không cần tra cứu ở đâu cả mà vẫn biết được request này của ai".

---

## 3. Giai đoạn 2: Stateless Authentication (Token tự chứa — JWT)

### 3.1. Ý tưởng cốt lõi: đảo ngược nơi lưu thông tin

```text
Với session: server lưu thông tin, token chỉ là chìa khóa để tra cứu.

Với token tự chứa (self-contained token): TOKEN chính là nơi lưu thông tin.
Server không cần lưu gì cả — chỉ cần một cách để XÁC MINH token đó
là thật (không bị giả mạo/chỉnh sửa), không cần tra cứu ở đâu khác.
```

Đây là bước chuyển quan trọng nhất: từ "server phải nhớ" (stateful) sang "server chỉ cần xác minh" (stateless).

Một cách hình dung dễ nhớ: session giống như **thẻ giữ xe** — tấm thẻ chỉ có một con số, giữ xe thật sự nằm ở sổ của bác bảo vệ, mất sổ là mất luôn thông tin xe của ai. JWT giống như **vé xem phim có tem chống giả in sẵn** — bản thân tấm vé đã ghi rõ suất chiếu, ghế ngồi, hạng vé; soát vé chỉ cần soi tem chống giả xem thật hay giả, không cần gọi điện về quầy vé hỏi lại.

### 3.2. JWT là gì

JWT (JSON Web Token) là chuẩn phổ biến nhất cho token tự chứa, gồm ba phần nối bằng dấu chấm và được encode Base64Url (không phải mã hóa):

```text
header.payload.signature

header    → loại token và thuật toán ký được dùng
payload   → dữ liệu thật (claims): userId, role, thời điểm hết hạn...
signature → chữ ký, dùng để XÁC MINH header + payload không bị chỉnh sửa
```

Ví dụ payload ở dạng dễ đọc:

```json
{
  "sub": "42",
  "role": "Admin",
  "exp": 1730000000
}
```

Một token thật sự trông như sau (đã rút gọn cho dễ nhìn):

```text
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI0MiIsInJvbGUiOiJBZG1pbiJ9.TJVA95OrM7E2cBab30RMH...
└───────── header ─────────┘└──────────── payload ────────────┘└──── signature ────┘
```

Tự tay giải mã (Base64Url decode) từng phần sẽ ra đúng:

```text
header  decode →  { "typ": "JWT", "alg": "..." }
payload decode →  { "sub": "42", "role": "Admin" }
signature      →  chuỗi byte không đọc được thành chữ, chỉ dùng để so khớp toán học
```

Điểm cực kỳ quan trọng hay bị hiểu nhầm: **encode không phải mã hóa (encrypt)**. Header và payload chỉ được biến đổi định dạng để truyền qua URL/header an toàn, không hề bị giấu đi — bất kỳ ai lấy được token đều có thể tự giải mã và đọc nguyên văn nội dung bên trong (dán vào jwt.io là thấy ngay). Vì vậy **không bao giờ được đặt dữ liệu nhạy cảm** (mật khẩu, số thẻ, thông tin cá nhân nhạy cảm) vào payload — thứ duy nhất JWT bảo vệ là **tính toàn vẹn** (không ai sửa được mà không bị phát hiện), không bảo vệ **tính bí mật** của nội dung.

Điểm mấu chốt thứ hai: server tạo ra chữ ký dựa trên toàn bộ header + payload cộng với một khóa ký. Ở lần sau nhận lại token, server chỉ cần tính lại chữ ký từ đúng nội dung đó và so sánh — nếu payload bị ai đó chỉnh sửa dù chỉ một ký tự (ví dụ đổi `role` từ `User` thành `Admin`), chữ ký tính lại sẽ khác hoàn toàn với chữ ký đính kèm, server phát hiện ngay mà **không cần tra cứu bất kỳ database/session store nào**.

### 3.3. Luồng cơ bản với JWT

```text
1. Client gửi username/password.
2. Server xác thực đúng → tạo JWT chứa userId, role, thời hạn, rồi KÝ nó
   bằng một khóa mà chỉ server (hoặc hệ thống xác thực trung tâm) nắm giữ.
3. Server trả JWT về cho client (không lưu lại gì ở phía mình).
4. Client tự lưu JWT (localStorage, bộ nhớ ứng dụng, hoặc cookie tùy thiết kế).
5. Mọi request sau, client tự đính kèm: Authorization: Bearer <jwt>
6. Server (hoặc bất kỳ microservice nào được cấp khóa xác minh tương ứng)
   chỉ cần XÁC MINH chữ ký + kiểm tra hạn dùng → biết ngay userId/role
   mà KHÔNG cần tra cứu ở đâu cả.
```

Minh họa bước xác minh khi có kẻ giả mạo can thiệp:

```text
Token gốc:    { "role": "User" }  → ký ra chữ ký S1
Kẻ tấn công sửa: { "role": "Admin" } nhưng giữ nguyên chữ ký S1 (không có khóa ký để tạo lại chữ ký đúng)
Server verify: tính lại chữ ký từ { "role": "Admin" } → ra chữ ký S2
So sánh: S1 ≠ S2 → server từ chối token ngay, không cần biết "Admin" có hợp lệ hay không.
```

### 3.4. Claims thường gặp trong JWT

Ngoài các claim nghiệp vụ tự định nghĩa (role, tenantId...), JWT có một số claim chuẩn nên biết để đọc hiểu token của bất kỳ hệ thống nào:

```text
sub (subject)     → định danh chủ thể token, thường là userId.
iat (issued at)   → thời điểm token được phát hành.
exp (expiration)  → thời điểm token hết hạn — bắt buộc phải luôn kiểm tra.
nbf (not before)  → token chưa có hiệu lực trước thời điểm này.
iss (issuer)      → ai phát hành token (quan trọng khi có nhiều Authorization Server).
aud (audience)    → token này dành cho service/ứng dụng nào, tránh việc
                     token cấp cho service A bị đem dùng ở service B.
jti (JWT ID)      → định danh duy nhất của chính token đó, hữu ích khi cần
                     đánh dấu một token cụ thể đã bị thu hồi (mục 4.1).
```

### 3.5. Vì sao điều này giải quyết đúng 3 nỗi đau ở trên

```text
Giải quyết đau #1 (scale ngang)
→ Bất kỳ instance nào trong 10 instance cũng verify được token độc lập,
  không cần session store dùng chung, không cần sticky session.

Giải quyết đau #2 (mobile, cross-domain)
→ Token gửi qua header Authorization, không phụ thuộc cơ chế cookie
  của trình duyệt, hoạt động như nhau trên web, mobile, hay giữa các domain.

Giải quyết đau #3 (nhiều service độc lập)
→ Mỗi microservice tự verify token bằng khóa xác minh đã biết trước,
  không cần gọi mạng tới bất kỳ service trung tâm nào để xác thực.
```

### 3.6. "Stateless" có thật sự tuyệt đối không?

Đây là điểm hay bị hiểu lầm. JWT giảm đáng kể sự phụ thuộc vào state phía server, nhưng không xóa bỏ hoàn toàn khái niệm state:

```text
- Token vẫn cần một cơ chế hết hạn (exp) — nghĩa là hệ thống vẫn đang
  quản lý "thời gian sống", chỉ là không cần tra cứu mỗi request.
- Muốn thu hồi (revoke) một token trước khi nó hết hạn theo ý muốn
  (user đổi mật khẩu, tài khoản bị khóa, thiết bị bị mất) — bắt buộc
  phải thêm lại một hình thức "state" nào đó (blacklist, versioning),
  phá vỡ một phần lời hứa "hoàn toàn không cần tra cứu".
```

Nói chính xác hơn: JWT chuyển phần lớn gánh nặng "nhớ trạng thái" từ bắt buộc sang tùy chọn, chứ không loại bỏ hoàn toàn.

---

## 4. Nỗi đau JWT chưa giải quyết được, và cách hệ thống thực tế vá lại

### 4.1. Không revoke được token đã phát hành

```text
Vấn đề: JWT đã ký thì có hiệu lực cho tới khi hết hạn (exp), bất kể chuyện gì
xảy ra sau đó. Nếu user bị khóa tài khoản, đổi mật khẩu, hoặc token bị đánh cắp,
server không có cách nào "hủy" token đó giữa chừng — vì server không lưu gì cả.
```

Cách hệ thống thực tế vá lại:

```text
- Access token thời gian sống RẤT NGẮN (5-15 phút) → giảm thiệt hại nếu bị lộ,
  chấp nhận độ trễ vài phút giữa lúc "khóa tài khoản" và lúc token thật sự vô hiệu.
- Refresh token thời gian sống dài hơn, NHƯNG được lưu và kiểm tra ở server
  (quay lại có một phần "state" — đây là điểm JWT phải nhượng bộ).
- Một số hệ thống dùng thêm "token version"/"security stamp" lưu trong DB,
  gắn vào payload; khi cần revoke hàng loạt (đổi mật khẩu), chỉ cần tăng version
  lên, mọi token cũ (mang version thấp hơn) tự động bị coi là không hợp lệ.
```

Ở tầng dữ liệu: bảng `Users` chỉ cần thêm một cột `TokenVersion` (số nguyên). Lúc phát hành JWT, nhét `TokenVersion` hiện tại của user vào payload. Mỗi request, server lấy `TokenVersion` trong token so với `TokenVersion` hiện tại trong bảng `Users` (thường đã có sẵn trong bộ nhớ cache user, không cần round-trip riêng) — khác nhau là coi như token cũ, từ chối ngay. Đổi mật khẩu chỉ cần `UPDATE Users SET TokenVersion = TokenVersion + 1`.

### 4.2. Access token + Refresh token — mô hình lai (hybrid) ra đời

```text
Access token: ngắn hạn, thuần stateless, dùng cho hầu hết request — nhanh,
              không tốn tra cứu.

Refresh token: dài hạn hơn, CÓ lưu trạng thái ở server (hoặc ít nhất một
               danh sách đã revoke), chỉ dùng khi access token hết hạn
               để xin cấp lại — tần suất dùng thấp hơn nhiều so với access token,
               nên chi phí tra cứu không đáng kể.
```

Đây thực chất là một dạng thỏa hiệp: **phần lớn traffic được hưởng lợi ích stateless (access token)**, còn phần cần kiểm soát chặt (revoke, phát hiện lạm dụng) mới quay lại có state (refresh token) — không hy sinh hoàn toàn một phía để lấy phía kia.

Ở tầng dữ liệu: access token KHÔNG có dòng nào trong DB — verify xong là xong. Refresh token thì ngược lại, mỗi cái sinh ra là một dòng trong bảng `RefreshTokens`, đại khái gồm: id token, thuộc userId nào, trạng thái (`Active`/`Used`/`Revoked`), hết hạn lúc nào. Khi client gọi xin access token mới, server chỉ cần lấy đúng một dòng theo id token gửi lên, kiểm tra trạng thái còn `Active` không rồi mới cấp access token mới.

### 4.3. Token bị đánh cắp khó phát hiện hơn session

```text
Với session, server có thể chủ động "kick" một session cụ thể (xóa khỏi session
store) ngay lập tức. Với JWT thuần, một token bị đánh cắp vẫn dùng được bình
thường cho tới khi hết hạn — vì với server, một request dùng token hợp lệ
trông "giống hệt" request của chủ nhân thật sự.
```

Cách hệ thống thực tế giảm thiệt hại của vấn đề này là **refresh token rotation** kết hợp **phát hiện tái sử dụng**:

```text
Mỗi lần client dùng refresh token để xin access token mới:
  → refresh token CŨ lập tức bị vô hiệu hóa.
  → một refresh token MỚI được cấp để dùng cho lần sau.

Nếu một refresh token ĐÃ BỊ VÔ HIỆU HÓA lại được gửi lên lần nữa
  → đây là dấu hiệu gần như chắc chắn: có ai đó khác (không phải chủ tài khoản)
    đang giữ một bản sao cũ của refresh token này.
  → hệ thống chủ động thu hồi toàn bộ chuỗi token liên quan, bắt đăng nhập lại.
```

Ở tầng dữ liệu: mỗi dòng trong bảng `RefreshTokens` (mục 4.2) có thêm một cột trỏ tới token thay thế nó, kiểu `ReplacedByTokenId`, tạo thành một chuỗi nối tiếp nhau. Khi một request đến với một token đã có `ReplacedByTokenId` khác null (nghĩa là nó đã bị thay bằng token khác trước đó) — nghĩa là token này đáng lẽ không nên được dùng nữa, server lập tức đánh dấu `Revoked` cho toàn bộ chuỗi bắt đầu từ userId đó, thay vì chỉ mỗi token đang được gửi lên.

Cơ chế này không ngăn được việc token bị đánh cắp ngay từ đầu, nhưng thu hẹp đáng kể khoảng thời gian kẻ tấn công có thể lợi dụng token, và giúp hệ thống phát hiện sớm thay vì không bao giờ biết.

---

## 5. Giai đoạn 3: Nhiều ứng dụng, nhiều bên — OAuth2 và OpenID Connect

### 5.1. Vấn đề mới: authen không còn là chuyện một app tự lo cho chính nó

JWT tự chế (tự ký, tự phát hành) giải quyết tốt bài toán "một hệ thống, nhiều service nội bộ". Nhưng một lớp vấn đề mới xuất hiện khi:

```text
- Một công ty có 5-10 ứng dụng nội bộ khác nhau (HRM, kế toán, kho, CRM...),
  muốn nhân viên đăng nhập MỘT LẦN rồi dùng được tất cả (Single Sign-On).
- Một ứng dụng muốn cho phép người dùng đăng nhập bằng tài khoản Google/Microsoft
  thay vì tạo thêm một mật khẩu mới phải nhớ.
- Một đối tác bên thứ ba cần được cấp quyền truy cập MỘT PHẦN dữ liệu của user
  (ví dụ: đọc danh sách đơn hàng) mà KHÔNG được biết mật khẩu của user đó.
```

Những bài toán này không phải "làm sao xác thực nhanh hơn" nữa, mà là "làm sao nhiều bên khác nhau (nhiều app, nhiều công ty) cùng tin tưởng một nguồn xác thực chung, và cấp quyền có giới hạn cho nhau" — đây là lúc JWT tự chế giữa hai bên không còn đủ, cần một giao thức chuẩn hóa nhiều bên cùng hiểu.

### 5.2. OAuth2: framework cho ỦY QUYỀN (authorization), không phải xác thực

Đây là điểm bị hiểu sai phổ biến nhất: **OAuth2 sinh ra để giải quyết bài toán ủy quyền** (cho phép bên thứ ba truy cập giới hạn), không phải để xác thực danh tính.

```text
Ví dụ đúng bản chất OAuth2:

Ứng dụng lịch hẹn "CalendarApp" muốn đọc danh bạ Google của bạn.
Bạn không đưa mật khẩu Google cho CalendarApp.
Thay vào đó, bạn đăng nhập trực tiếp trên trang của Google,
đồng ý cấp quyền "đọc danh bạ" cho CalendarApp,
Google cấp cho CalendarApp một access token CHỈ có quyền đọc danh bạ,
không có quyền gì khác (không đọc được email, không đổi được mật khẩu).
```

Vai trò trong OAuth2:

```text
Resource Owner       → người dùng, chủ sở hữu dữ liệu.
Client               → ứng dụng muốn truy cập dữ liệu (CalendarApp).
Authorization Server → nơi cấp quyền (Google).
Resource Server      → nơi chứa dữ liệu thật (Google Contacts API).
```

### 5.3. OpenID Connect: lớp xác thực xây trên nền OAuth2

Vì OAuth2 vốn chỉ thiết kế cho ủy quyền, ban đầu nhiều hệ thống "mượn tạm" OAuth2 để làm luôn việc xác thực (nếu xin được access token nghĩa là user đã đăng nhập) — cách làm này không chuẩn và thiếu thông tin danh tính rõ ràng. **OpenID Connect (OIDC)** ra đời để giải quyết đúng khoảng trống đó: thêm một token riêng cho danh tính bên cạnh access token.

```text
OAuth2 trả về:  Access Token   → dùng để GỌI API thay mặt user (ủy quyền).
OIDC bổ sung:   ID Token       → chứa thông tin DANH TÍNH user đã xác thực
                                  (giống JWT ở mục 3, nhưng theo chuẩn chung
                                  để nhiều bên cùng hiểu và tin tưởng).
```

Nhờ vậy, "Đăng nhập bằng Google/Microsoft" mà các ứng dụng hay tích hợp chính là OpenID Connect, còn "Cho phép ứng dụng truy cập Google Drive của bạn" là OAuth2 thuần túy.

### 5.4. Single Sign-On (SSO) trong bối cảnh doanh nghiệp

```text
Với nhiều ứng dụng nội bộ, một Identity Provider (IdP) trung tâm
(ví dụ Keycloak, Azure AD, Auth0, hoặc tự xây) đóng vai trò Authorization Server.

Nhân viên đăng nhập MỘT LẦN với IdP.
Mỗi ứng dụng nội bộ (HRM, kế toán, kho...) không tự xác thực mật khẩu nữa,
mà tin tưởng token do IdP cấp — tương tự mô hình OAuth2/OIDC ở trên,
chỉ khác "bên thứ ba" giờ là chính các ứng dụng nội bộ của công ty.
```

Đây là lý do OAuth2/OIDC không chỉ dành cho "đăng nhập bằng Google" mà còn là nền tảng chuẩn cho SSO nội bộ ở quy mô doanh nghiệp.

---

## 6. Bảng so sánh tổng hợp

| Tiêu chí | Session + Cookie | JWT (tự chế) | OAuth2 / OIDC |
|---|---|---|---|
| Nơi lưu thông tin thật | Server (session store) | Trong chính token | Authorization Server trung tâm |
| Stateful hay Stateless | Stateful | Gần như stateless (trừ refresh token) | Có thành phần stateful ở IdP |
| Scale ngang nhiều instance | Cần session store dùng chung | Dễ, verify độc lập | Dễ, verify qua khóa công khai của IdP |
| Revoke ngay lập tức | Dễ (xóa session) | Khó, cần cơ chế vá thêm | Tùy IdP, thường có endpoint revoke |
| Phù hợp mobile/cross-domain | Kém hơn | Tốt | Tốt |
| Phù hợp nhiều app/nhiều bên tin tưởng nhau | Không thiết kế cho việc này | Không thiết kế cho việc này | Đúng mục đích thiết kế |
| Độ phức tạp triển khai | Thấp | Trung bình | Cao hơn (cần IdP, nhiều vai trò) |

---

## 7. Case Studies theo từng bối cảnh

### 7.1. Case 1 — Web app truyền thống, một domain, traffic vừa phải

```text
Bối cảnh: hệ thống quản lý nội bộ (ví dụ phần mềm quản lý phòng khám),
chạy trên 1-2 server, frontend và backend cùng domain, không có mobile app.

Lựa chọn hợp lý: Session + Cookie.

Vì sao: đơn giản, dễ revoke ngay khi cần (khóa tài khoản, đăng xuất tất cả
thiết bị), không cần giải quyết bài toán stateless vì chưa có nhu cầu scale
ngang thật sự phức tạp. Thêm JWT/OAuth2 ở quy mô này là phức tạp hóa không
cần thiết.
```

### 7.2. Case 2 — SPA (Angular/React) gọi nhiều microservice, cần scale ngang

```text
Bối cảnh: frontend SPA, backend tách thành nhiều service độc lập
(order service, inventory service, notification service...), chạy nhiều
instance sau load balancer.

Lựa chọn hợp lý: JWT (access token ngắn hạn) + refresh token.

Vì sao: mỗi service tự verify access token độc lập, không cần gọi về một
session store trung tâm cho mỗi request — đúng nỗi đau #1 và #3 đã nêu ở
mục 2.4. Refresh token xử lý phần revoke/gia hạn mà không phá vỡ lợi ích
stateless của access token.
```

### 7.3. Case 3 — Mobile app (native iOS/Android)

```text
Bối cảnh: ứng dụng mobile gọi thẳng API, không chạy trong trình duyệt.

Lựa chọn hợp lý: JWT hoặc OAuth2 (nếu cần đăng nhập qua bên thứ ba như
Google/Apple).

Vì sao: mobile không có cơ chế "trình duyệt tự động gửi cookie" như web,
nên cookie mất đi lợi thế lớn nhất của nó. Token gửi qua header hoạt động
nhất quán bất kể nền tảng.
```

### 7.4. Case 4 — Doanh nghiệp có nhiều ứng dụng nội bộ, cần đăng nhập một lần

```text
Bối cảnh: công ty có HRM, kế toán, quản lý kho, CRM — mỗi hệ thống được
xây ở thời điểm khác nhau, muốn nhân viên chỉ cần đăng nhập một lần.

Lựa chọn hợp lý: OAuth2/OpenID Connect với một Identity Provider trung tâm.

Vì sao: đây chính xác là bài toán SSO mà OAuth2/OIDC được thiết kế để giải
quyết — JWT tự chế giữa nhiều app độc lập sẽ phải tự xây lại toàn bộ phần
"tin tưởng lẫn nhau" mà OAuth2/OIDC đã chuẩn hóa sẵn.
```

### 7.5. Case 5 — Mở API cho đối tác bên thứ ba tích hợp

```text
Bối cảnh: hệ thống cho phép đối tác bên ngoài gọi API để đọc một phần dữ
liệu (ví dụ tra cứu tồn kho), nhưng không được toàn quyền như nhân viên nội bộ.

Lựa chọn hợp lý: OAuth2 (client credentials hoặc authorization code flow
tùy việc có người dùng cuối đứng sau hay không), phân quyền theo scope.

Vì sao: đây đúng là bài toán ủy quyền có giới hạn cho bên thứ ba mà OAuth2
sinh ra để giải quyết — JWT tự ký thông thường không có khái niệm scope,
consent, hay revoke theo từng đối tác một cách chuẩn hóa.
```

---

## 8. Checklist khi chọn cơ chế authentication cho hệ thống mới

```text
1. Frontend và backend có cùng domain không? Có mobile app không?
2. Hệ thống có cần scale ngang nhiều instance/microservices không?
3. Có cần revoke quyền truy cập ngay lập tức (khóa tài khoản, đăng xuất
   toàn bộ thiết bị) hay chấp nhận độ trễ vài phút là đủ?
4. Có nhiều ứng dụng độc lập trong cùng tổ chức cần dùng chung một danh
   tính đăng nhập (SSO) không?
5. Có cần cho phép bên thứ ba truy cập giới hạn vào dữ liệu của user
   (ủy quyền), hay chỉ là chính ứng dụng của mình xác thực chính user của mình?
6. Nếu chọn JWT: đã có kế hoạch cho access/refresh token, TTL, và cách
   revoke khi cần chưa?
7. Nếu chọn OAuth2/OIDC: đã xác định rõ ai đóng vai trò Authorization
   Server (tự xây hay dùng dịch vụ có sẵn) chưa?
8. Có đang chọn công nghệ theo xu hướng ("ai cũng dùng JWT") thay vì theo
   đúng nỗi đau thật sự hệ thống đang gặp phải không?
```

---

## 9. Tóm tắt và lộ trình học tiếp

### 9.1. Tóm tắt nhanh

```text
HTTP vốn không nhớ gì giữa các request — mọi cơ chế authentication đều
xoay quanh việc giải quyết vấn đề này theo cách khác nhau.

Session + Cookie (stateful) → server nhớ, token chỉ là chìa khóa tra cứu.
Đơn giản, dễ revoke, nhưng khó scale ngang và không tự nhiên với mobile/cross-domain.

JWT (gần như stateless) → token tự chứa thông tin, server chỉ verify chữ ký,
không cần tra cứu. Giải quyết tốt bài toán scale ngang và nhiều service độc
lập, nhưng đánh đổi bằng việc khó revoke ngay lập tức — phải vá bằng access
token ngắn hạn + refresh token.

OAuth2 giải quyết bài toán ỦY QUYỀN cho bên thứ ba, OpenID Connect thêm lớp
XÁC THỰC danh tính chuẩn hóa trên nền OAuth2 — đây là nền tảng cho SSO và
tích hợp đăng nhập bằng bên thứ ba (Google, Microsoft...) hoặc mở API có
kiểm soát cho đối tác.

Không có lựa chọn nào "luôn đúng" — mỗi cơ chế ra đời để giải quyết một
nỗi đau cụ thể ở một quy mô cụ thể, chọn sai quy mô (dùng OAuth2 cho một
app nội bộ nhỏ, hoặc dùng session cho hệ thống cần scale ngang mạnh) đều
tạo ra phức tạp hoặc rủi ro không cần thiết.
```

### 9.2. Lộ trình học tiếp

```text
1. Cấu hình chi tiết Session (ASP.NET Core Session, Redis session store).
2. Cấu hình chi tiết JWT Bearer, access/refresh token rotation trong .NET Core.
3. Cấu hình chi tiết OAuth2/OpenID Connect (Authorization Code Flow, PKCE,
   tích hợp Identity Provider) — các tài liệu cấu hình cụ thể sẽ tách riêng.
4. Bảo mật khi lưu trữ token (đã có nền tảng ở tài liệu Security).
5. Multi-factor authentication (MFA) và các lớp phòng thủ bổ sung sau khi
   đã xác thực đúng mật khẩu.
```
