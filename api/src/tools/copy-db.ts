import 'reflect-metadata';
import { PgUsers } from '../auth/pg-users';
import { PgContent } from '../content/pg.content';
import { createPgPool } from '../store/pg.pool';
import { SCHEMA_SQL } from '../store/pg.store';
import { copyDatabase, samePlace } from './copy';

/**
 * Chép toàn bộ dữ liệu từ database cũ sang database mới (ví dụ khi đổi vùng Neon).
 *   Trong api/.env: SOURCE_DATABASE_URL = database cũ, DATABASE_URL = database mới.
 *   npm run db:copy -- --dry-run    chỉ đếm số dòng, không ghi
 *   npm run db:copy                 chép thật
 * Chạy lại an toàn: dòng trùng khoá được cập nhật, không nhân đôi.
 */
async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const from = process.env.SOURCE_DATABASE_URL;
  const to = process.env.DATABASE_URL;
  if (!from || !to) {
    throw new Error('Cần đặt cả SOURCE_DATABASE_URL (cũ) và DATABASE_URL (mới) trong api/.env.');
  }
  if (samePlace(from, to)) {
    throw new Error('SOURCE_DATABASE_URL và DATABASE_URL đang trỏ tới cùng một database.');
  }
  const dryRun = process.argv.includes('--dry-run');

  const source = createPgPool(from);
  const target = createPgPool(to);
  try {
    if (!dryRun) {
      // Tạo bảng ở đích trước, giống cách API tự làm khi khởi động.
      await new PgContent(target).ensureSchema();
      await new PgUsers(target).ensureSchema();
      await target.query(SCHEMA_SQL);
    }
    const results = await copyDatabase(source, target, { dryRun });
    console.log(dryRun ? 'Chạy thử, chưa ghi gì:' : 'Đã chép xong:');
    for (const result of results) {
      console.log(
        `  ${result.table.padEnd(14)} ${result.skipped ? 'không có ở nguồn, bỏ qua' : `${result.rows} dòng`}`,
      );
    }
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch(error => {
  console.error(`Lỗi: ${(error as Error).message}`);
  process.exit(1);
});
