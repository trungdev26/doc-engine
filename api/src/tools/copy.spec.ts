import { PgClient, PgPool } from '../store/pg.pool';
import { TABLES, copyDatabase, samePlace } from './copy';

type Row = Record<string, unknown>;

class FakeSource implements PgPool {
  constructor(
    private readonly data: Record<string, Row[]>,
    private readonly missing: string[] = [],
  ) {}
  async query(text: string, params: unknown[] = []) {
    if (text.startsWith('select to_regclass')) {
      const name = params[0] as string;
      return { rows: [{ found: this.missing.includes(name) ? null : name }] };
    }
    const table = /from (\w+)$/.exec(text.trim())![1];
    return { rows: this.data[table] ?? [] };
  }
  async connect(): Promise<PgClient> {
    throw new Error('nguồn không được ghi');
  }
  async end() {}
}

class FakeTarget implements PgPool {
  log: { sql: string; params?: unknown[] }[] = [];
  connected = false;
  failOn: string | null = null;
  async query() {
    return { rows: [] };
  }
  async connect(): Promise<PgClient> {
    this.connected = true;
    return {
      query: async (sql: string, params?: unknown[]) => {
        this.log.push({ sql: sql.trim().replace(/\s+/g, ' '), params });
        if (this.failOn && sql.includes(this.failOn)) {
          throw new Error('hỏng giữa chừng');
        }
        return { rows: [] };
      },
      release: () => this.log.push({ sql: 'release' }),
    };
  }
  async end() {}
}

const data: Record<string, Row[]> = {
  users: [{ id: 'u1', username: 'adminx', password_hash: 'h', role: 'admin', created_at: new Date('2026-01-01') }],
  lessons: [{ id: 'l1', skill: 'words', kind: 'vocab', title: 'T', body: { id: 'l1', words: [1] }, created_at: new Date('2026-01-01') }],
  units: [{ skill: 'words', band: '3.0', id: 'unit-1', title: 'U', position: 0 }],
  unit_lessons: [{ skill: 'words', band: '3.0', unit_id: 'unit-1', lesson_id: 'l1', position: 0 }],
  app_state: [{ user_id: 'u1', data: { savedWords: [{ word: 'hi' }] }, updated_at: new Date('2026-01-02') }],
};

describe('copyDatabase', () => {
  it('chép đủ các bảng theo thứ tự có khoá ngoại và báo số dòng', async () => {
    const target = new FakeTarget();
    const results = await copyDatabase(new FakeSource(data), target);

    expect(results.map(item => [item.table, item.rows])).toEqual([
      ['users', 1],
      ['lessons', 1],
      ['units', 1],
      ['unit_lessons', 1],
      ['app_state', 1],
    ]);
    const inserted = target.log.filter(item => item.sql.startsWith('insert')).map(item => /into (\w+)/.exec(item.sql)![1]);
    expect(inserted).toEqual(['users', 'lessons', 'units', 'unit_lessons', 'app_state']);
    expect(inserted.indexOf('lessons')).toBeLessThan(inserted.indexOf('unit_lessons'));
    expect(target.log[0].sql).toBe('begin');
    expect(target.log.map(item => item.sql)).toContain('commit');
  });

  it('đổi cột jsonb về chuỗi JSON và ghi theo kiểu thêm hoặc cập nhật', async () => {
    const target = new FakeTarget();
    await copyDatabase(new FakeSource(data), target);

    const lesson = target.log.find(item => item.sql.includes('into lessons'))!;
    expect(lesson.sql).toContain('$5::jsonb');
    expect(lesson.sql).toContain('on conflict (id) do update set');
    expect(lesson.params![4]).toBe(JSON.stringify({ id: 'l1', words: [1] }));

    const state = target.log.find(item => item.sql.includes('into app_state'))!;
    expect(state.params![1]).toBe(JSON.stringify({ savedWords: [{ word: 'hi' }] }));
    expect(state.params![0]).toBe('u1');
  });

  it('giữ nguyên id người dùng để dữ liệu học vẫn gắn đúng tài khoản', async () => {
    const target = new FakeTarget();
    await copyDatabase(new FakeSource(data), target);
    const user = target.log.find(item => item.sql.includes('into users'))!;
    expect(user.params![0]).toBe('u1');
  });

  it('bỏ qua bảng không có ở nguồn', async () => {
    const target = new FakeTarget();
    const results = await copyDatabase(new FakeSource(data, ['app_state']), target);
    expect(results.find(item => item.table === 'app_state')).toEqual({ table: 'app_state', rows: 0, skipped: true });
    expect(target.log.some(item => item.sql.includes('into app_state'))).toBe(false);
  });

  it('chạy thử chỉ đếm và không kết nối ghi vào đích', async () => {
    const target = new FakeTarget();
    const results = await copyDatabase(new FakeSource(data), target, { dryRun: true });
    expect(results.every(item => item.rows === 1)).toBe(true);
    expect(target.connected).toBe(false);
  });

  it('rollback và không commit khi một bảng ghi lỗi', async () => {
    const target = new FakeTarget();
    target.failOn = 'into units';
    await expect(copyDatabase(new FakeSource(data), target)).rejects.toThrow('hỏng giữa chừng');
    const statements = target.log.map(item => item.sql);
    expect(statements).toContain('rollback');
    expect(statements).not.toContain('commit');
    expect(statements.at(-1)).toBe('release');
  });

  it('mọi bảng đều có cột khoá nằm trong danh sách cột', () => {
    for (const spec of TABLES) {
      expect(spec.key.every(column => spec.columns.includes(column))).toBe(true);
      expect((spec.json ?? []).every(column => spec.columns.includes(column))).toBe(true);
    }
  });
});

describe('samePlace', () => {
  it('nhận ra cùng máy chủ và database dù khác mật khẩu hoặc tham số', () => {
    expect(
      samePlace('postgresql://a:1@host.example.com/neondb?sslmode=require', 'postgresql://b:2@HOST.example.com/neondb'),
    ).toBe(true);
  });

  it('phân biệt máy chủ hoặc database khác nhau', () => {
    expect(samePlace('postgresql://a@old.example.com/neondb', 'postgresql://a@new.example.com/neondb')).toBe(false);
    expect(samePlace('postgresql://a@host.example.com/one', 'postgresql://a@host.example.com/two')).toBe(false);
  });
});
