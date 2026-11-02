# HTTP trong Angular

Tài liệu này trình bày cách Angular giao tiếp với backend qua `HttpClient`, từ cấu trúc request/response cơ bản đến các kỹ thuật thường gặp trong dự án production: interceptor, authentication, refresh token, retry, upload/download, caching và tổ chức code theo resource. Trọng tâm là hiểu bản chất luồng xử lý — vì sao request chỉ chạy khi có subscriber, vì sao `HttpRequest`/`HttpParams` là immutable, khi nào nên retry — thay vì chỉ học thuộc cú pháp API.

Các ví dụ interceptor dùng dạng class (`HttpInterceptor`) trong dự án `NgModule`; nguyên tắc về `request`, `next()` và `clone()` áp dụng tương tự cho functional interceptor.

---

## 1. Bức tranh tổng quan

Ứng dụng Angular thường cần giao tiếp với backend để:

- Lấy danh sách dữ liệu.
- Lấy chi tiết một bản ghi.
- Tạo mới dữ liệu.
- Cập nhật dữ liệu.
- Xóa dữ liệu.
- Upload hoặc download file.
- Gửi token xác thực.

Luồng cơ bản:

```text
Angular application
        ↓
     HttpClient
        ↓
Browser HTTP engine
        ↓
    Backend API
        ↓
HTTP response
        ↓
     HttpClient
        ↓
   Observable
        ↓
Component hoặc service nhận kết quả
```

Ở giai đoạn đầu, chỉ cần ghi nhớ ba thành phần:

1. `HttpClient` tạo request.
2. Backend xử lý request và trả response.
3. Angular đưa response vào một `Observable` để code phía client xử lý.

Interceptor, refresh token, retry và cache là các lớp xử lý bổ sung. Chúng sẽ được giải thích sau khi đã hiểu luồng cơ bản.

---

## 2. HTTP là gì?

HTTP là giao thức giao tiếp giữa client và server.

Trong ứng dụng web:

- Angular chạy ở phía client.
- Backend API chạy ở server.
- Angular gửi HTTP request.
- Backend trả HTTP response.

### 2.1. HTTP request

Ví dụ:

```http
POST /api/products?publish=true HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "name": "Mechanical Keyboard",
  "price": 1500000
}
```

Request trên có các phần:

```text
Method       POST
URL          /api/products
Query param  publish=true
Headers      Authorization, Content-Type
Body         Dữ liệu sản phẩm
```

### 2.2. HTTP response

Ví dụ backend trả về:

```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "id": 101,
  "name": "Mechanical Keyboard",
  "price": 1500000
}
```

Response có:

- Status code: `201`.
- Headers: `Content-Type`.
- Body: dữ liệu sản phẩm vừa được tạo.

### 2.3. HTTP method

#### 2.3.1. GET

Dùng để lấy dữ liệu.

```http
GET /api/products
```

#### 2.3.2. POST

Thường dùng để tạo mới hoặc thực hiện một hành động.

```http
POST /api/products
```

#### 2.3.3. PUT

Thường biểu diễn việc thay thế toàn bộ trạng thái của một resource.

```http
PUT /api/products/101
```

#### 2.3.4. PATCH

Thường dùng để cập nhật một phần dữ liệu.

```http
PATCH /api/products/101
```

#### 2.3.5. DELETE

Dùng để xóa resource.

```http
DELETE /api/products/101
```

Tên method thể hiện ý nghĩa giao tiếp. Hành vi thực tế vẫn do contract của backend quyết định.

### 2.4. Status code

#### 2.4.1. Nhóm 2xx: thành công

| Status | Ý nghĩa |
|---:|---|
| `200 OK` | Request thành công và thường có response body |
| `201 Created` | Tạo resource thành công |
| `204 No Content` | Thành công nhưng không trả body |

#### 2.4.2. Nhóm 4xx: request phía client có vấn đề

| Status | Ý nghĩa thường gặp |
|---:|---|
| `400 Bad Request` | Request sai định dạng hoặc dữ liệu không hợp lệ |
| `401 Unauthorized` | Chưa xác thực hoặc thông tin xác thực không hợp lệ |
| `403 Forbidden` | Đã xác thực nhưng không có quyền |
| `404 Not Found` | Không tìm thấy endpoint hoặc resource |
| `409 Conflict` | Xung đột trạng thái dữ liệu |
| `422 Unprocessable Content` | Request đúng cú pháp nhưng không thỏa validation hoặc rule nghiệp vụ |
| `429 Too Many Requests` | Client gửi quá nhiều request |

#### 2.4.3. Nhóm 5xx: server xử lý lỗi

| Status | Ý nghĩa thường gặp |
|---:|---|
| `500 Internal Server Error` | Lỗi không mong muốn ở server |
| `502 Bad Gateway` | Gateway nhận response không hợp lệ từ upstream |
| `503 Service Unavailable` | Service tạm thời không sẵn sàng |
| `504 Gateway Timeout` | Gateway chờ upstream quá lâu |

---

## 3. HttpClient là gì?

`HttpClient` là service do Angular cung cấp để gửi HTTP request.

Nó nằm trong package:

```ts
import { HttpClient } from '@angular/common/http';
```

`HttpClient` cung cấp các method tương ứng với HTTP method:

```ts
http.get(...)
http.post(...)
http.put(...)
http.patch(...)
http.delete(...)
```

Ví dụ:

```ts
@Injectable({ providedIn: 'root' })
export class ProductApi {
  constructor(private readonly http: HttpClient) {}

  getProducts(): Observable<ProductDto[]> {
    return this.http.get<ProductDto[]>('/api/products');
  }
}
```


### 3.1. Khi nào request thực sự được gửi?

Đoạn code này mới chỉ tạo Observable:

```ts
const products$ = this.http.get<ProductDto[]>('/api/products');
```

Request thường chỉ thực sự được gửi khi Observable có subscriber:

```ts
products$.subscribe();
```

Đây là đặc điểm quan trọng và sẽ được giải thích kỹ ở phần Observable.

---

## 4. Cấu hình HttpClient trong dự án

Trước khi sử dụng `HttpClient`, ứng dụng cần đăng ký HTTP provider với Angular.

Trong dự án sử dụng `AppModule`, import `HttpClientModule` vào `imports`:

```ts
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

Sau khi `HttpClientModule` được import, Angular có thể cung cấp `HttpClient` cho service thông qua constructor:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ProductApi {
  constructor(private readonly http: HttpClient) {}
}
```

Nếu chưa import `HttpClientModule`, ứng dụng thường gặp lỗi:

```text
NullInjectorError: No provider for HttpClient
```

> Chỉ cần đăng ký `HttpClientModule` một lần ở module gốc hoặc module HTTP dùng chung. Không import lặp lại tùy tiện ở nhiều lazy module nếu dự án có interceptor, vì có thể tạo HTTP configuration khác với mong đợi.

---

## 5. Gửi request bằng HttpClient

### 5.1. GET danh sách

```ts
getProducts(): Observable<ProductDto[]> {
  return this.http.get<ProductDto[]>('/api/products');
}
```

Giải thích:

- `get()` tạo GET request.
- `ProductDto[]` là kiểu dữ liệu TypeScript mà code mong đợi từ response body.
- Kết quả là `Observable<ProductDto[]>`.

### 5.2. GET chi tiết

```ts
getProductById(id: number): Observable<ProductDto> {
  return this.http.get<ProductDto>(`/api/products/${id}`);
}
```

Với URL path lấy từ chuỗi tự do, nên encode:

```ts
getProductByCode(code: string): Observable<ProductDto> {
  const encodedCode = encodeURIComponent(code);

  return this.http.get<ProductDto>(
    `/api/products/by-code/${encodedCode}`,
  );
}
```

### 5.3. POST

```ts
interface CreateProductRequest {
  name: string;
  price: number;
}

createProduct(
  request: CreateProductRequest,
): Observable<ProductDto> {
  return this.http.post<ProductDto>(
    '/api/products',
    request,
  );
}
```

Tham số thứ hai của `post()` là request body.

### 5.4. PUT

```ts
interface UpdateProductRequest {
  name: string;
  price: number;
  status: ProductStatus;
}

updateProduct(
  id: number,
  request: UpdateProductRequest,
): Observable<ProductDto> {
  return this.http.put<ProductDto>(
    `/api/products/${id}`,
    request,
  );
}
```

### 5.5. PATCH

```ts
updateProductStatus(
  id: number,
  status: ProductStatus,
): Observable<void> {
  return this.http.patch<void>(
    `/api/products/${id}/status`,
    { status },
  );
}
```

`void` được dùng khi code không cần response body hoặc backend trả `204 No Content`.

### 5.6. DELETE

```ts
deleteProduct(id: number): Observable<void> {
  return this.http.delete<void>(`/api/products/${id}`);
}
```

### 5.7. `request()` tổng quát

Ngoài các helper như `get()` và `post()`, `HttpClient` còn có method tổng quát:

```ts
return this.http.request<ProductDto>('GET', '/api/products/101');
```

Trong code nghiệp vụ thông thường, nên ưu tiên method cụ thể vì dễ đọc hơn:

```ts
return this.http.get<ProductDto>('/api/products/101');
```

---

## 6. Cấu tạo của một request

Một HTTP request thường có bốn phần đáng chú ý:

```text
URL
Query params
Headers
Body
```

### 6.1. URL

```ts
return this.http.get<ProductDto[]>('/api/products');
```

Có thể dùng base URL từ environment:

```ts
export const environment = {
  apiUrl: 'https://api.example.com',
};
```

```ts
return this.http.get<ProductDto[]>(
  `${environment.apiUrl}/api/products`,
);
```

Không nên rải base URL ở nhiều service. Có thể gom thành configuration token hoặc một helper ở phần tổ chức code.

### 6.2. Query params

Query params là dữ liệu nằm sau dấu `?` trên URL.

```text
/api/products?page=1&pageSize=20&keyword=keyboard
```

Cách khai báo đơn giản:

```ts
getProducts(filter: ProductFilter): Observable<ProductDto[]> {
  return this.http.get<ProductDto[]>('/api/products', {
    params: {
      page: filter.page,
      pageSize: filter.pageSize,
      keyword: filter.keyword,
    },
  });
}
```

Angular sẽ serialize params thành query string.

#### 6.2.1. Không gửi `undefined` một cách thiếu kiểm soát

Nên chủ động tạo params khi filter có nhiều trường tùy chọn:

```ts
import { HttpParams } from '@angular/common/http';

getProducts(filter: ProductFilter): Observable<ProductDto[]> {
  let params = new HttpParams()
    .set('page', filter.page)
    .set('pageSize', filter.pageSize);

  if (filter.keyword?.trim()) {
    params = params.set('keyword', filter.keyword.trim());
  }

  if (filter.status) {
    params = params.set('status', filter.status);
  }

  return this.http.get<ProductDto[]>('/api/products', { params });
}
```

#### 6.2.2. Vì sao phải gán lại `params`?

`HttpParams` là immutable.

Lệnh này không sửa object cũ:

```ts
params.set('page', 1);
```

Nó trả về object mới. Vì vậy phải viết:

```ts
params = params.set('page', 1);
```

### 6.3. Headers

Header chứa metadata của request.

Ví dụ:

```ts
import { HttpHeaders } from '@angular/common/http';

const headers = new HttpHeaders({
  'X-Correlation-Id': crypto.randomUUID(),
});

return this.http.get<ProductDto[]>('/api/products', {
  headers,
});
```

Một số header thường gặp:

| Header | Mục đích |
|---|---|
| `Authorization` | Gửi thông tin xác thực |
| `Content-Type` | Mô tả định dạng request body |
| `Accept` | Mô tả định dạng response client muốn nhận |
| `X-Correlation-Id` | Theo dõi request xuyên qua nhiều service |
| `Idempotency-Key` | Nhận diện một thao tác mutation duy nhất |

#### 6.3.1. Không cần tự set `Content-Type: application/json` trong mọi request

Khi body là object JSON thông thường, Angular có thể tự serialize và thiết lập header phù hợp.

Không nên set thủ công cho `FormData`, vì browser cần tự tạo boundary:

```ts
const formData = new FormData();
formData.append('file', file);

return this.http.post('/api/files', formData);
```

### 6.4. Body

Body là dữ liệu gửi lên server, thường dùng với `POST`, `PUT` và `PATCH`.

```ts
const request: CreateProductRequest = {
  name: formValue.name.trim(),
  price: Number(formValue.price),
};

return this.http.post<ProductDto>('/api/products', request);
```

Không nên gửi thẳng toàn bộ form value nếu form có trường chỉ dùng cho UI:

```ts
// Không nên khi form chứa confirmPrice, displayName hoặc UI flags.
return this.http.post('/api/products', this.form.getRawValue());
```

Nên map form model sang API request model rõ ràng.

---

## 7. Đọc response

### 7.1. Mặc định chỉ lấy body

```ts
return this.http.get<ProductDto[]>('/api/products');
```

Subscriber nhận trực tiếp response body:

```ts
this.productApi.getProducts().subscribe(products => {
  console.log(products);
});
```

### 7.2. Lấy toàn bộ response

Khi cần đọc status hoặc headers:

```ts
return this.http.get<ProductDto[]>('/api/products', {
  observe: 'response',
});
```

Kết quả có kiểu gần như:

```ts
Observable<HttpResponse<ProductDto[]>>
```

Sử dụng:

```ts
this.productApi.getProductsResponse().subscribe(response => {
  console.log(response.status);
  console.log(response.headers.get('X-Total-Count'));
  console.log(response.body);
});
```

### 7.3. Theo dõi HTTP events

Khi upload file hoặc cần progress:

```ts
return this.http.post('/api/files', formData, {
  observe: 'events',
  reportProgress: true,
});
```

Observable lúc này không chỉ emit response cuối cùng. Nó có thể emit nhiều event:

```text
Request sent
Upload progress
Response headers
Download progress
Final response
```

Vì vậy phải kiểm tra loại event trước khi sử dụng.

### 7.4. `responseType`

Mặc định Angular giả định response là JSON.

#### 7.4.1. Text

```ts
return this.http.get('/api/health', {
  responseType: 'text',
});
```

#### 7.4.2. Blob

```ts
return this.http.get('/api/reports/101', {
  responseType: 'blob',
});
```

#### 7.4.3. ArrayBuffer

```ts
return this.http.get('/api/files/101/raw', {
  responseType: 'arraybuffer',
});
```

### 7.5. Generic type không phải runtime validation

```ts
this.http.get<ProductDto>('/api/products/101');
```

`ProductDto` chỉ giúp TypeScript kiểm tra code tại compile time.

Angular không tự xác nhận response thật sự có đúng cấu trúc `ProductDto` hay không.

Nếu backend trả:

```json
{
  "product_name": "Keyboard"
}
```

TypeScript vẫn tin rằng dữ liệu là `ProductDto` nếu ta đã khai báo generic như vậy.

Với dữ liệu không đáng tin cậy hoặc API ngoài hệ thống, có thể cần runtime validation bằng schema validator.

---

## 8. HttpClient và Observable

### 8.1. Observable trong HTTP dùng để làm gì?

Observable là object biểu diễn một luồng dữ liệu có thể được theo dõi bằng `subscribe()`.

```ts
const products$ = this.http.get<ProductDto[]>('/api/products');
```

Quy ước `$` thường dùng để cho biết biến chứa Observable.

Subscriber có thể nhận ba loại notification:

```ts
products$.subscribe({
  next: products => console.log(products),
  error: error => console.error(error),
  complete: () => console.log('completed'),
});
```

Với HTTP request thông thường:

1. Observable emit response một lần.
2. Sau đó complete.
3. Hoặc emit error rồi kết thúc.

### 8.2. Cold Observable

Observable từ `HttpClient` là cold Observable.

Điều đó có nghĩa mỗi subscription thường tạo một request riêng:

```ts
const products$ = this.http.get<ProductDto[]>('/api/products');

products$.subscribe(); // Request 1
products$.subscribe(); // Request 2
```

Đây là lỗi phổ biến khi một Observable được dùng ở nhiều nơi nhưng developer nghĩ rằng request chỉ chạy một lần.

### 8.3. Service nên trả Observable

```ts
getProducts(): Observable<ProductDto[]> {
  return this.http.get<ProductDto[]>('/api/products');
}
```

Không nên subscribe trong API service chỉ để trả dữ liệu ra ngoài:

```ts
// Không nên
getProducts(): ProductDto[] {
  let result: ProductDto[] = [];

  this.http.get<ProductDto[]>('/api/products')
    .subscribe(data => {
      result = data;
    });

  return result;
}
```

Hàm trên trả `result` trước khi request hoàn thành.

Ngoài ra, subscribe bên trong làm caller khó:

- Compose thêm operator.
- Hủy request.
- Xử lý lỗi theo ngữ cảnh.
- Kiểm soát loading.

### 8.4. Subscribe trong component

```ts
export class ProductListComponent {
  constructor(private readonly productApi: ProductApi) {}

  products: ProductDto[] = [];

  loadProducts(): void {
    this.productApi.getProducts().subscribe({
      next: products => {
        this.products = products;
      },
      error: error => {
        console.error(error);
      },
    });
  }
}
```

### 8.5. Dùng async pipe

```ts
products$ = this.productApi.getProducts();
```

```html
@for (product of products$ | async; track product.id) {
  <div>{{ product.name }}</div>
}
```

`async` pipe tự subscribe và unsubscribe theo lifecycle của view.

### 8.6. Unsubscribe có thể hủy request

Khi unsubscribe trước lúc request hoàn thành, Angular có thể abort request đang chạy:

```ts
const subscription = this.productApi.getProducts().subscribe();

subscription.unsubscribe();
```

Trong thực tế thường dùng operator thay vì quản lý subscription thủ công.

---

## 9. Xử lý lỗi HTTP

### 9.1. `HttpErrorResponse`

Khi request lỗi, Angular thường đưa lỗi vào `HttpErrorResponse`.

```ts
import { HttpErrorResponse } from '@angular/common/http';
```

Một số property quan trọng:

```ts
error.status
error.statusText
error.message
error.url
error.error
```

Trong đó:

- `status`: HTTP status code.
- `error`: response body lỗi hoặc đối tượng lỗi phía client.
- `message`: thông tin tổng hợp do Angular tạo.

### 9.2. `catchError()`

```ts
return this.http.get<ProductDto[]>('/api/products').pipe(
  catchError((error: HttpErrorResponse) => {
    console.error(error);
    return throwError(() => error);
  }),
);
```

`catchError()` bắt error notification của Observable.

Nếu muốn caller tiếp tục nhận lỗi, phải trả lại error Observable:

```ts
return throwError(() => error);
```

Nếu muốn dùng fallback:

```ts
return this.http.get<ProductDto[]>('/api/products').pipe(
  catchError(() => of([])),
);
```

Cần thận trọng vì `[]` có thể làm UI hiểu sai rằng hệ thống thật sự không có dữ liệu, trong khi request đã lỗi.

### 9.3. Phân loại lỗi

#### 9.3.1. `status === 0`

Có thể xảy ra khi:

- Mất mạng.
- Browser chặn do CORS.
- DNS lỗi.
- TLS lỗi.
- Request bị abort.
- Server không thể kết nối.

Không nên kết luận chắc chắn rằng backend chưa xử lý request.

#### 9.3.2. `400` hoặc `422`

Thường là validation hoặc rule nghiệp vụ.

Nên để màn hình hoặc form xử lý chi tiết theo ngữ cảnh.

#### 9.3.3. `401`

Thông tin xác thực không hợp lệ hoặc hết hạn.

Có thể cần refresh token hoặc đưa người dùng về login.

#### 9.3.4. `403`

Người dùng đã xác thực nhưng không có quyền.

Không nên tự refresh token cho mọi `403`.

#### 9.3.5. `5xx`

Lỗi phía server hoặc hệ thống upstream.

Có thể:

- Hiển thị thông báo chung.
- Ghi log hoặc telemetry.
- Retry có kiểm soát nếu operation phù hợp.

### 9.4. Lỗi nên xử lý ở đâu?

#### 9.4.1. Xử lý cục bộ

Dùng khi lỗi phụ thuộc ngữ cảnh màn hình:

- Validation field.
- Tên sản phẩm bị trùng.
- Không thể xóa vì đang được sử dụng.
- Hiển thị empty state riêng.

#### 9.4.2. Xử lý tập trung

Dùng cho concern dùng chung:

- Ghi log lỗi.
- Chuẩn hóa cấu trúc lỗi.
- Xử lý session hết hạn.
- Theo dõi correlation ID.

Không nên để interceptor tự hiển thị một toast giống nhau cho mọi lỗi.

---

## 10. Interceptor từ bản chất đến cách hoạt động

### 10.1. Interceptor là gì?

Interceptor là một middleware nằm trong pipeline của `HttpClient`.

Nó có thể quan sát hoặc thay đổi:

- Request trước khi gửi tới backend.
- Response sau khi backend trả về.
- Error xảy ra trong pipeline.

Ví dụ mục đích sử dụng:

- Gắn access token.
- Gắn correlation ID.
- Bật và tắt global loading.
- Ghi log thời gian request.
- Xử lý lỗi xác thực.

Luồng không có interceptor:

```text
Application → HttpClient → Backend
```

Luồng có interceptor:

```text
Application
    ↓
Auth interceptor
    ↓
Logging interceptor
    ↓
Backend
```

Response đi theo chiều ngược lại:

```text
Backend
    ↓
Logging interceptor
    ↓
Auth interceptor
    ↓
Application
```

### 10.2. Interceptor dạng class trong dự án NgModule

Trong dự án sử dụng `NgModule`, interceptor thường được viết dưới dạng class triển khai `HttpInterceptor`.

```ts
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    console.log(request.method, request.url);

    return next.handle(request);
  }
}
```

Trước khi thêm logic, cần hiểu rõ từng thành phần.

### 10.3. Hàm `intercept()` làm gì?

Mọi request được tạo bởi `HttpClient` sẽ đi qua hàm `intercept()` trước khi tới backend.

Hàm có hai tham số:

- `request`: request hiện tại.
- `next`: đối tượng chuyển request sang bước tiếp theo.

### 10.4. `request` là gì?

`request` là object `HttpRequest` chứa toàn bộ thông tin của request:

```ts
request.method
request.url
request.headers
request.params
request.body
request.context
```

Ví dụ, với lời gọi:

```ts
this.http.get('/api/products');
```

Interceptor có thể đọc:

```text
request.method = GET
request.url    = /api/products
```

### 10.5. `next.handle(request)` làm gì?

```ts
return next.handle(request);
```

Dòng này chuyển request sang:

- Interceptor tiếp theo, nếu còn.
- HTTP backend, nếu đây là interceptor cuối cùng.

Nếu không gọi `next.handle(...)`, request sẽ không tiếp tục tới backend.

### 10.6. Vì sao phải dùng `clone()`?

`HttpRequest` là immutable, nghĩa là không sửa trực tiếp request hiện tại.

Muốn thêm header, cần tạo request mới:

```ts
const clonedRequest = request.clone({
  setHeaders: {
    'X-Correlation-Id': crypto.randomUUID(),
  },
});

return next.handle(clonedRequest);
```

Luồng chạy:

```text
HttpClient tạo request
→ interceptor nhận request
→ clone request và thêm header
→ next.handle() chuyển request mới đi tiếp
→ backend nhận request
```

### 10.7. Đăng ký interceptor trong AppModule

```ts
import { HTTP_INTERCEPTORS } from '@angular/common/http';

@NgModule({
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoggingInterceptor,
      multi: true,
    },
  ],
})
export class AppModule {}
```

Ý nghĩa:

- `provide: HTTP_INTERCEPTORS`: đăng ký vào HTTP interceptor pipeline.
- `useClass`: class Angular sẽ sử dụng.
- `multi: true`: cho phép đăng ký nhiều interceptor.

Nếu thiếu `multi: true`, interceptor mới có thể ghi đè danh sách interceptor đã đăng ký trước đó.

### 10.8. Thứ tự interceptor

Thứ tự trong `providers` là thứ tự request đi qua interceptor.

```ts
providers: [
  {
    provide: HTTP_INTERCEPTORS,
    useClass: AuthInterceptor,
    multi: true,
  },
  {
    provide: HTTP_INTERCEPTORS,
    useClass: LoggingInterceptor,
    multi: true,
  },
]
```

Request:

```text
AuthInterceptor → LoggingInterceptor → Backend
```

Response đi ngược lại:

```text
Backend → LoggingInterceptor → AuthInterceptor
```

### 10.9. Xử lý response trong interceptor

`next.handle(request)` trả về `Observable<HttpEvent<unknown>>`, nên interceptor có thể xử lý response hoặc error trên chính luồng này.

```ts
return next.handle(request).pipe(
  finalize(() => {
    console.log('Request đã kết thúc');
  }),
);
```

`finalize()` chạy khi request:

- Thành công.
- Thất bại.
- Hoặc bị hủy.

### 10.10. `HttpContextToken`

Đôi khi một request cần truyền metadata chỉ dùng trong Angular, không gửi lên network.

Ví dụ bỏ qua auth interceptor cho endpoint login.

Tạo token:

```ts
import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
```

Ý nghĩa:

- Tên token: `SKIP_AUTH`.
- Kiểu dữ liệu: `boolean`.
- Giá trị mặc định: `false`.

Gắn context khi gửi request:

```ts
import { HttpContext } from '@angular/common/http';

login(request: LoginRequest): Observable<LoginResponse> {
  return this.http.post<LoginResponse>(
    '/api/auth/login',
    request,
    {
      context: new HttpContext().set(SKIP_AUTH, true),
    },
  );
}
```

Đọc context trong interceptor:

```ts
if (request.context.get(SKIP_AUTH)) {
  return next(request);
}
```

`HttpContext` không trở thành HTTP header và không được gửi tới backend. Nó chỉ là metadata nội bộ trong Angular HTTP pipeline.

---

## 11. Authentication interceptor

Sau khi đã hiểu `request`, `next`, `clone()` và `HttpContextToken`, có thể implement auth interceptor.

### 11.1. Token storage

Tách một service nhỏ chỉ chịu trách nhiệm đọc và ghi token:

```ts
@Injectable({ providedIn: 'root' })
export class TokenStorage {
  private readonly accessTokenKey = 'access_token';

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  setAccessToken(token: string): void {
    localStorage.setItem(this.accessTokenKey, token);
  }

  clear(): void {
    localStorage.removeItem(this.accessTokenKey);
  }
}
```

Việc dùng `localStorage`, session storage hay cookie phụ thuộc mô hình bảo mật của hệ thống. Ví dụ trên chỉ nhằm minh họa dependency cho interceptor.

### 11.2. Implement auth interceptor

```ts
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private readonly tokenStorage: TokenStorage) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    if (request.context.get(SKIP_AUTH)) {
      return next.handle(request);
    }

    const accessToken = this.tokenStorage.getAccessToken();

    if (!accessToken) {
      return next.handle(request);
    }

    const authenticatedRequest = request.clone({
      setHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return next.handle(authenticatedRequest);
  }
}
```

Luồng xử lý:

```text
1. Kiểm tra request có yêu cầu bỏ qua xác thực hay không.
2. Đọc access token.
3. Không có token: giữ nguyên request.
4. Có token: clone request và thêm Authorization header.
5. Chuyển request sang bước tiếp theo.
```

### 11.3. Chỉ gắn token vào API tin cậy

Không nên gắn access token vào mọi URL tuyệt đối.

```ts
function isTrustedApiUrl(url: string): boolean {
  return url.startsWith('/api/') ||
    url.startsWith(environment.apiUrl);
}
```

```ts
if (!isTrustedApiUrl(request.url)) {
  return next(request);
}
```

Điều này tránh gửi token tới:

- CDN.
- Analytics endpoint.
- Third-party API.
- URL do người dùng kiểm soát.

---

## 12. Refresh token

### 12.1. Bài toán

Access token thường có thời hạn ngắn.

Khi hết hạn:

```text
Request API
→ backend trả 401
→ client dùng refresh token lấy access token mới
→ gửi lại request ban đầu
```

### 12.2. Vấn đề request storm

Giả sử màn hình gửi năm request gần như đồng thời và token đã hết hạn:

```text
Request A → 401
Request B → 401
Request C → 401
Request D → 401
Request E → 401
```

Nếu mỗi request tự refresh:

```text
5 request refresh token chạy đồng thời
```

Hậu quả có thể là:

- Refresh token rotation bị xung đột.
- Request refresh sau làm token trước mất hiệu lực.
- Session bị logout sai.
- Backend chịu tải không cần thiết.

Cần single-flight refresh:

```text
Request đầu tiên bắt đầu refresh
Các request còn lại cùng chờ một Observable refresh dùng chung
```

### 12.3. Tránh vòng lặp

Request refresh phải bỏ qua auth/refresh handling phù hợp.

Nếu không:

```text
refresh request → 401
→ interceptor lại refresh
→ refresh request mới → 401
→ lặp vô hạn
```

Ngoài `SKIP_AUTH`, thường cần metadata đánh dấu request đã retry một lần.

```ts
export const RETRIED_AFTER_REFRESH =
  new HttpContextToken<boolean>(() => false);
```

Khi gửi lại request:

```ts
const retriedRequest = request.clone({
  context: request.context.set(RETRIED_AFTER_REFRESH, true),
  setHeaders: {
    Authorization: `Bearer ${newAccessToken}`,
  },
});
```

Nếu request đã retry mà vẫn `401`, nên kết thúc session thay vì refresh tiếp.

### 12.4. Không retry mutation một cách mù quáng

Nếu client gửi `POST` và bị mất response, chưa chắc server chưa xử lý.

```text
Client gửi POST tạo đơn
Server tạo đơn thành công
Response bị mất do network
Client nghĩ request lỗi và gửi lại
Server tạo thêm đơn thứ hai
```

Vì vậy retry mutation cần contract idempotency từ backend, ví dụ `Idempotency-Key`.

---

## 13. Retry, timeout và idempotency

### 13.1. Retry

Retry là gửi lại request sau khi request trước thất bại.

Không phải lỗi nào cũng nên retry.

Thường có thể cân nhắc retry:

- `502`.
- `503`.
- `504`.
- Một số network error tạm thời.

Thường không nên retry tự động:

- `400`.
- `401` nếu chưa có refresh flow.
- `403`.
- `404` do resource không tồn tại.
- Validation error.

Ví dụ đơn giản:

```ts
return this.http.get<ProductDto[]>('/api/products').pipe(
  retry({
    count: 2,
    delay: 500,
  }),
);
```

Đoạn trên retry mọi error nên chưa đủ an toàn cho production. Nên kiểm tra loại lỗi trước khi retry.

### 13.2. Backoff

Không nên retry liên tục ngay lập tức:

```text
Request lỗi
→ retry sau 500 ms
→ retry sau 1000 ms
→ retry sau 2000 ms
```

Backoff giúp tránh tạo thêm áp lực khi server đang quá tải.

### 13.3. Timeout

```ts
return this.http.get<ProductDto[]>('/api/products').pipe(
  timeout(10_000),
);
```

Sau 10 giây không nhận được event phù hợp, Observable phát timeout error.

Timeout phía client không đảm bảo server dừng xử lý.

Server có thể đã:

- Nhận request.
- Ghi database.
- Tiếp tục xử lý dù client đã ngừng chờ.

### 13.4. Idempotency

Một operation là idempotent khi thực hiện nhiều lần vẫn có tác động cuối cùng tương đương thực hiện một lần.

`GET` thường được thiết kế idempotent.

`POST` tạo đơn thường không idempotent nếu backend không có cơ chế chống trùng.

Ví dụ dùng idempotency key:

```ts
const idempotencyKey = crypto.randomUUID();

return this.http.post<OrderDto>('/api/orders', request, {
  headers: {
    'Idempotency-Key': idempotencyKey,
  },
});
```

Backend phải lưu và kiểm tra key. Chỉ thêm header ở Angular không tự tạo ra idempotency.

---

## 14. Upload và download file

### 14.1. Upload bằng `FormData`

```ts
upload(file: File): Observable<UploadResult> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  return this.http.post<UploadResult>(
    '/api/files',
    formData,
  );
}
```

Không tự set `Content-Type` cho `FormData`.

### 14.2. Theo dõi upload progress

```ts
upload(file: File): Observable<HttpEvent<UploadResult>> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  return this.http.post<UploadResult>(
    '/api/files',
    formData,
    {
      observe: 'events',
      reportProgress: true,
    },
  );
}
```

Xử lý event:

```ts
this.fileApi.upload(file).subscribe(event => {
  if (event.type === HttpEventType.UploadProgress) {
    const total = event.total ?? event.loaded;
    const percent = Math.round(event.loaded / total * 100);
    console.log(percent);
  }

  if (event.type === HttpEventType.Response) {
    console.log(event.body);
  }
});
```

### 14.3. Download blob

```ts
downloadReport(id: number): Observable<Blob> {
  return this.http.get(`/api/reports/${id}`, {
    responseType: 'blob',
  });
}
```

Tạo object URL:

```ts
this.reportApi.downloadReport(id).subscribe(blob => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `report-${id}.pdf`;
  anchor.click();

  URL.revokeObjectURL(url);
});
```

---

## 15. Caching

### 15.1. Vì sao cần cache?

Nếu cùng một dữ liệu được gọi nhiều lần trong thời gian ngắn, cache có thể:

- Giảm số request.
- Giảm latency.
- Giảm tải backend.

Nhưng cache tạo thêm bài toán:

- Dữ liệu bao lâu thì hết hạn?
- Khi mutation thành công thì invalidate gì?
- Có cache theo user hoặc tenant không?
- Dữ liệu cũ có chấp nhận được không?

### 15.2. `shareReplay()` không tự động là cache hoàn chỉnh

```ts
private products$?: Observable<ProductDto[]>;

getProducts(): Observable<ProductDto[]> {
  this.products$ ??= this.http
    .get<ProductDto[]>('/api/products')
    .pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
    );

  return this.products$;
}
```

Các subscriber dùng chung response gần nhất.

Nhưng phải có chiến lược invalidation:

```ts
invalidateProducts(): void {
  this.products$ = undefined;
}
```

Sau create/update/delete thành công:

```ts
return this.http.post<ProductDto>('/api/products', request).pipe(
  tap(() => this.invalidateProducts()),
);
```

### 15.3. HTTP browser cache

Browser và server cũng có cache dựa trên header:

- `Cache-Control`.
- `ETag`.
- `Last-Modified`.

Đây là cache ở tầng giao tiếp HTTP, cần phân biệt với dữ liệu đang được giữ tạm trong bộ nhớ ứng dụng.

---

## 16. Testing HttpClient

### 16.1. Mục tiêu

Unit test HTTP service không nên gọi backend thật.

Test cần:

1. Gọi method của service.
2. Bắt request được tạo.
3. Kiểm tra method, URL, params, headers và body.
4. Trả mock response.
5. Kiểm tra kết quả subscriber nhận được.

### 16.2. Cấu hình test

```ts
beforeEach(() => {
  TestBed.configureTestingModule({
    imports: [HttpClientTestingModule],
    providers: [ProductApi],
  });
});
```

Lấy testing controller:

```ts
const httpTesting = TestBed.inject(HttpTestingController);
```

### 16.3. Test GET

```ts
it('should load products', () => {
  const api = TestBed.inject(ProductApi);
  const httpTesting = TestBed.inject(HttpTestingController);

  const expected: ProductDto[] = [
    { id: 1, name: 'Keyboard', price: 1000 },
  ];

  api.getProducts().subscribe(products => {
    expect(products).toEqual(expected);
  });

  const request = httpTesting.expectOne('/api/products');

  expect(request.request.method).toBe('GET');

  request.flush(expected);

  httpTesting.verify();
});
```

`expectOne()` bắt request phù hợp.

`flush()` giả lập backend trả response.

`verify()` bảo đảm không còn request chưa được xử lý.

### 16.4. Test lỗi

```ts
it('should propagate server error', () => {
  const api = TestBed.inject(ProductApi);
  const httpTesting = TestBed.inject(HttpTestingController);

  api.getProducts().subscribe({
    next: () => fail('expected an error'),
    error: error => {
      expect(error.status).toBe(500);
    },
  });

  const request = httpTesting.expectOne('/api/products');

  request.flush(
    { message: 'Server error' },
    {
      status: 500,
      statusText: 'Internal Server Error',
    },
  );
});
```

---

## 17. Tổ chức code HTTP trong dự án

Phần này chỉ bàn về cách tổ chức sau khi đã hiểu `HttpClient`.

### 17.1. Không gọi API trực tiếp rải rác trong component

Có thể gọi `HttpClient` trực tiếp trong component, nhưng khi dự án lớn sẽ khó quản lý:

- URL bị lặp.
- DTO bị lặp.
- Mapping bị phân tán.
- Test khó hơn.
- Khó thay đổi API contract.

Nên gom API theo resource hoặc feature:

```text
products/
├── product-api.service.ts
├── product.models.ts
├── product-list.component.ts
└── product-detail.component.ts
```

### 17.2. API service

```ts
@Injectable({ providedIn: 'root' })
export class ProductApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/products';

  getList(filter: ProductFilter): Observable<ProductDto[]> {
    return this.http.get<ProductDto[]>(this.baseUrl, {
      params: buildProductParams(filter),
    });
  }

  getById(id: number): Observable<ProductDto> {
    return this.http.get<ProductDto>(`${this.baseUrl}/${id}`);
  }

  create(request: CreateProductRequest): Observable<ProductDto> {
    return this.http.post<ProductDto>(this.baseUrl, request);
  }
}
```

API service nên tập trung vào:

- Endpoint.
- HTTP method.
- Params, headers và body.
- Kiểu request/response.
- Mapping gần API nếu cần.



### 17.3. DTO và domain model

DTO phản ánh contract của API:

```ts
interface ProductDto {
  id: number;
  name: string;
  price: number;
  createdAt: string;
}
```

Domain hoặc view model phản ánh nhu cầu bên trong application:

```ts
interface Product {
  id: number;
  name: string;
  formattedPrice: string;
  createdAt: Date;
}
```

Mapping:

```ts
function mapProduct(dto: ProductDto): Product {
  return {
    id: dto.id,
    name: dto.name,
    formattedPrice: dto.price.toLocaleString('vi-VN'),
    createdAt: new Date(dto.createdAt),
  };
}
```

Không phải API nào cũng cần layer mapping riêng. Chỉ tách khi DTO và model phía UI thực sự khác nhau.

---

## 18. Các lỗi thường gặp

### 18.1. Quên import `HttpClientModule`

Dẫn tới lỗi Angular không tìm thấy provider cho `HttpClient`.

### 18.2. Subscribe nhiều lần vào cold Observable

```ts
const data$ = this.api.getProducts();

data$.subscribe();
data$.subscribe();
```

Kết quả là hai request.

### 18.3. Subscribe lồng nhau

```ts
this.route.params.subscribe(params => {
  this.api.getProduct(params['id']).subscribe(product => {
    // ...
  });
});
```

Nên compose bằng `switchMap()`.

### 18.4. Dùng `map()` khi cần `switchMap()`

```ts
// Kết quả thành Observable<Observable<ProductDto>>
route.params.pipe(
  map(params => this.api.getProduct(params['id'])),
);
```

Cần flatten Observable:

```ts
route.params.pipe(
  switchMap(params => this.api.getProduct(params['id'])),
);
```

### 18.5. Quên gán lại `HttpParams`

```ts
let params = new HttpParams();
params.set('page', 1);
```

`params` vẫn chưa có giá trị do immutable.

Đúng:

```ts
params = params.set('page', 1);
```

### 18.6. Set `Content-Type` thủ công cho `FormData`

Có thể làm mất multipart boundary và upload lỗi.

### 18.7. Gắn token vào mọi domain

Có nguy cơ làm rò token sang third-party endpoint.

### 18.8. Interceptor không gọi `next()`

Request bị dừng tại interceptor.

### 18.9. Retry mọi request

Có thể tạo trùng order, payment hoặc mutation khác.

### 18.10. Tin rằng generic đã validate response

```ts
http.get<ProductDto>(url)
```

Chỉ cung cấp type checking khi compile, không kiểm tra response runtime.

---

## 19. Checklist

### 19.1. Cấu hình

- [ ] Đã import `HttpClientModule` trong module phù hợp.
- [ ] Interceptor được đăng ký bằng `HTTP_INTERCEPTORS` và có `multi: true`.

### 19.2. Request

- [ ] HTTP method phù hợp với API contract.
- [ ] Query params được build rõ ràng.
- [ ] Không gửi field UI thừa trong request body.
- [ ] Không tự set `Content-Type` cho `FormData`.

### 19.3. Response

- [ ] Chọn đúng `responseType`.
- [ ] Chỉ dùng `observe: 'response'` khi cần status hoặc header.
- [ ] Không nhầm TypeScript generic với runtime validation.

### 19.4. Observable

- [ ] Biết mỗi subscription có thể tạo một request mới.
- [ ] Không subscribe lồng nhau khi có thể compose operator.
- [ ] Chọn đúng `switchMap`, `concatMap`, `mergeMap` hoặc `exhaustMap`.
- [ ] Quản lý lifecycle của luồng dài.

### 19.5. Error

- [ ] Phân biệt lỗi network, validation, authentication, authorization và server.
- [ ] Không nuốt lỗi bằng fallback gây hiểu sai dữ liệu.
- [ ] Lỗi nghiệp vụ được xử lý gần ngữ cảnh UI.

### 19.6. Interceptor

- [ ] Hiểu `request`, `next()` và `clone()` trước khi implement.
- [ ] Interceptor luôn chuyển request đi tiếp nếu không chủ động short-circuit.
- [ ] Token chỉ được gắn vào trusted API.
- [ ] Dùng `HttpContextToken` cho metadata nội bộ pipeline.
- [ ] Thứ tự interceptor được xác định rõ.

### 19.7. Retry và mutation

- [ ] Không retry mutation nếu backend không hỗ trợ idempotency.
- [ ] Timeout phía client không được hiểu là server đã dừng xử lý.
- [ ] Refresh token được điều phối để tránh nhiều request refresh đồng thời.

### 19.8. Testing

- [ ] Không gọi backend thật trong unit test.
- [ ] Kiểm tra method, URL, params, headers và body.
- [ ] Gọi `verify()` sau test.
