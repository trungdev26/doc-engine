# Dev Internals

Ứng dụng học gồm hai hướng: **Dev** (tài liệu kỹ thuật kèm demo tương tác) và **Học tiếng Anh**
(lộ trình theo Band, bài học, ôn tập lặp lại ngắt quãng).

Hai thư mục, mỗi thư mục là một dự án riêng:

- `doc-engine-web/`: frontend Angular 17.
- `doc-engine-service/`: backend NestJS. Lưu trạng thái học vào Postgres (Neon) hoặc file JSON, có đăng nhập JWT.

## Chạy khi phát triển

Cần Node 20. Mở hai terminal:

```bash
# Terminal 1: API ở http://localhost:3000/api
cd doc-engine-service
npm install
npm run start:dev

# Terminal 2: frontend ở http://localhost:4200
cd doc-engine-web
npm install
npm start
```

Frontend gọi `/api/...` và `proxy.conf.json` chuyển các request đó sang cổng 3000, nên không cần cấu hình CORS khi dev.

## Cơ sở dữ liệu

API chọn nơi lưu theo biến môi trường `DATABASE_URL`:

- **Không đặt:** lưu vào file `doc-engine-service/data/store.json` (đã nằm trong `.gitignore`). Đổi vị trí bằng `DATA_FILE`.
- **Có đặt:** lưu vào Postgres. API tự tạo bảng `app_state` khi khởi động, không cần chạy migration.

Dùng với [Neon](https://neon.tech):

1. Tạo project trên Neon, vào **Connection Details** và bật **Pooled connection**.
2. Sao chép `doc-engine-service/.env.example` thành `doc-engine-service/.env` rồi dán chuỗi kết nối vào `DATABASE_URL`. File `.env` đã nằm trong `.gitignore`, đừng commit chuỗi này vì nó chứa mật khẩu.
3. Chạy lại API. Đổi cổng bằng `PORT`.

Nên dùng một branch riêng của Neon để thử, tránh ghi vào dữ liệu thật.

## Kiểm thử

```bash
cd api && npm test     # test đơn vị (lịch ôn tập) và test HTTP
npm test               # test frontend (Karma)
```

## Soạn bài học

Mở `/admin/content` để nhập bài bằng form, không cần sửa code. Form có 5 loại bài (từ vựng, ngữ pháp, đọc hiểu, luyện nghe, luyện nói), tự tạo mã từ tên, liệt kê lỗi bằng tiếng Việt trước khi lưu, và giữ lại band và unit để nhập tiếp bài kế.

Việc lưu cần mã quản trị vì chưa có đăng nhập:

1. Đặt `ADMIN_TOKEN` trong `doc-engine-service/.env` (một chuỗi dài, khó đoán). Không đặt thì các endpoint ghi bị tắt hẳn.
2. Mở `/admin/content`, nhập đúng mã đó vào ô **Mã quản trị**.

Bài được lưu vào Postgres nếu có `DATABASE_URL`, không thì vào file `doc-engine-service/data/content.json`. Lưu lại cùng mã bài sẽ cập nhật bài cũ. Có thể nạp hàng loạt bằng `npm run content:import -- file.json` trong `doc-engine-service/`.

## Cấu trúc phần học tiếng Anh

- Hợp đồng dữ liệu nằm ở `doc-engine-service/src/contracts.ts`; frontend giữ bản sao ở `doc-engine-web/src/app/core/api.models.ts`. Sửa một bên thì sửa bên kia.
- Bài học nằm ở `doc-engine-service/src/content/lessons.ts`. Thêm bài mới rồi gắn vào `UNITS` là bài tự xuất hiện trong lộ trình.
- Lịch ôn tập dùng hộp Leitner, xem `doc-engine-service/src/review/srs.ts`.
- Nơi lưu trạng thái nằm sau lớp trừu tượng `Store` (`doc-engine-service/src/store/`), có hai bản là `JsonFileStore` và `PgStore`. `PgStore` đang khoá theo một người dùng cục bộ. Khi thêm đăng nhập, truyền `userId` thật vào, bảng đã có sẵn cột `user_id`.
