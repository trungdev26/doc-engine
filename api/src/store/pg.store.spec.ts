import { PgClient, PgPool } from './pg.pool';
import { PgStore, SCHEMA_SQL } from './pg.store';
import { defaultData } from './state';

/** Postgres giả: giữ một dòng jsonb và ghi lại mọi câu lệnh để kiểm tra thứ tự giao dịch. */
class FakePool implements PgPool {
  log: string[] = [];
  row: string | null = null;

  private handle = async (text: string, params: unknown[] = []) => {
    const sql = text.trim().replace(/\s+/g, ' ');
    this.log.push(sql.split(' ').slice(0, 3).join(' '));
    if (sql.startsWith('insert into app_state')) {
      this.row ??= params[1] as string;
    } else if (sql.startsWith('select data')) {
      return { rows: this.row ? [{ data: JSON.parse(this.row) }] : [] };
    } else if (sql.startsWith('update app_state')) {
      this.row = params[1] as string;
    }
    return { rows: [] };
  };

  query = this.handle;
  connect = async (): Promise<PgClient> => ({ query: this.handle, release: () => this.log.push('release') });
  end = async () => undefined;
}

describe('PgStore', () => {
  let pool: FakePool;
  let store: PgStore;

  beforeEach(() => {
    pool = new FakePool();
    store = new PgStore(pool);
  });

  it('tạo bảng khi khởi động', async () => {
    const queries: string[] = [];
    pool.query = async text => {
      queries.push(text);
      return { rows: [] };
    };
    await store.onModuleInit();
    expect(queries).toEqual([SCHEMA_SQL]);
  });

  it('trả dữ liệu mặc định khi chưa có dòng nào', async () => {
    expect(await store.read('u1')).toEqual(defaultData());
  });

  it('update chạy trong giao dịch có khoá dòng rồi commit', async () => {
    const result = await store.update('u1', data => {
      data.profile.band = '3.5';
      return 'xong';
    });

    expect(result).toBe('xong');
    expect(pool.log).toEqual([
      'begin',
      'insert into app_state',
      'select data from',
      'update app_state set',
      'commit',
      'release',
    ]);
    expect((await store.read('u1')).profile.band).toBe('3.5');
  });

  it('rollback và không ghi gì khi mutate ném lỗi', async () => {
    await store.update('u1', data => {
      data.profile.band = '3.5';
    });
    pool.log = [];

    await expect(
      store.update('u1', data => {
        data.profile.band = '8.5-9.0';
        throw new Error('lỗi nghiệp vụ');
      }),
    ).rejects.toThrow('lỗi nghiệp vụ');

    expect(pool.log).toContain('rollback');
    expect(pool.log).not.toContain('commit');
    expect(pool.log.at(-1)).toBe('release');
    expect((await store.read('u1')).profile.band).toBe('3.5');
  });
});
