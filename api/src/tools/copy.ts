import { PgPool } from '../store/pg.pool';

export interface TableSpec {
  name: string;
  columns: string[];
  /** Cột khoá để nhận biết dòng đã có ở đích; dòng trùng khoá được cập nhật thay vì nhân đôi. */
  key: string[];
  /** Cột jsonb: giá trị đọc ra là đối tượng nên phải đổi lại thành chuỗi JSON khi ghi. */
  json?: string[];
}

/**
 * Thứ tự quan trọng: `users` và `lessons` phải có trước các bảng tham chiếu tới chúng
 * (`unit_lessons.lesson_id` có khoá ngoại tới `lessons`).
 */
export const TABLES: TableSpec[] = [
  { name: 'users', columns: ['id', 'username', 'password_hash', 'role', 'created_at'], key: ['id'] },
  {
    name: 'lessons',
    columns: ['id', 'skill', 'kind', 'title', 'body', 'created_at'],
    key: ['id'],
    json: ['body'],
  },
  { name: 'units', columns: ['skill', 'band', 'id', 'title', 'position'], key: ['skill', 'band', 'id'] },
  {
    name: 'unit_lessons',
    columns: ['skill', 'band', 'unit_id', 'lesson_id', 'position'],
    key: ['skill', 'band', 'unit_id', 'lesson_id'],
  },
  { name: 'app_state', columns: ['user_id', 'data', 'updated_at'], key: ['user_id'], json: ['data'] },
];

export interface CopyResult {
  table: string;
  rows: number;
  /** true khi bảng không tồn tại ở database nguồn nên bỏ qua. */
  skipped: boolean;
}

function upsertSql(spec: TableSpec): string {
  const placeholders = spec.columns.map((column, index) =>
    spec.json?.includes(column) ? `$${index + 1}::jsonb` : `$${index + 1}`,
  );
  const updatable = spec.columns.filter(column => !spec.key.includes(column));
  const onConflict = updatable.length
    ? `do update set ${updatable.map(column => `${column} = excluded.${column}`).join(', ')}`
    : 'do nothing';
  return `insert into ${spec.name} (${spec.columns.join(', ')}) values (${placeholders.join(', ')}) on conflict (${spec.key.join(', ')}) ${onConflict}`;
}

/**
 * Chép dữ liệu từ `source` sang `target` trong một giao dịch: lỗi ở bất kỳ bảng nào thì không có gì
 * được ghi. Chạy lại an toàn vì ghi theo kiểu "thêm hoặc cập nhật". Các bảng ở đích phải có sẵn.
 * `dryRun` chỉ đếm số dòng, không ghi gì.
 */
export async function copyDatabase(
  source: PgPool,
  target: PgPool,
  options: { dryRun?: boolean } = {},
): Promise<CopyResult[]> {
  const loaded: { spec: TableSpec; rows: Record<string, unknown>[] }[] = [];
  const results: CopyResult[] = [];

  for (const spec of TABLES) {
    const exists = await source.query('select to_regclass($1) as found', [spec.name]);
    if (!exists.rows[0]?.found) {
      results.push({ table: spec.name, rows: 0, skipped: true });
      continue;
    }
    const { rows } = await source.query(`select ${spec.columns.join(', ')} from ${spec.name}`);
    loaded.push({ spec, rows });
    results.push({ table: spec.name, rows: rows.length, skipped: false });
  }

  if (options.dryRun) {
    return results;
  }

  const client = await target.connect();
  try {
    await client.query('begin');
    for (const { spec, rows } of loaded) {
      const sql = upsertSql(spec);
      for (const row of rows) {
        const params = spec.columns.map(column =>
          spec.json?.includes(column) ? JSON.stringify(row[column]) : row[column],
        );
        await client.query(sql, params);
      }
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return results;
}

/** So sánh hai chuỗi kết nối theo máy chủ và tên database, để không chép một database vào chính nó. */
export function samePlace(a: string, b: string): boolean {
  const place = (value: string): string => {
    const url = new URL(value);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`.toLowerCase();
  };
  return place(a) === place(b);
}
