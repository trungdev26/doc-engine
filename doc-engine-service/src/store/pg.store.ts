import { OnModuleInit } from '@nestjs/common';
import { PgPool } from './pg.pool';
import { StoreData, defaultData, normalizeData } from './state';
import { Store } from './store';

export { PgClient, PgPool } from './pg.pool';

export const SCHEMA_SQL = `
create table if not exists app_state (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
)`;

/** Lưu toàn bộ trạng thái học của mỗi người dùng thành một dòng jsonb trong Postgres (Neon). */
export class PgStore extends Store implements OnModuleInit {
  constructor(private readonly pool: PgPool) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query(SCHEMA_SQL);
  }

  async read(userId: string): Promise<StoreData> {
    const { rows } = await this.pool.query('select data from app_state where user_id = $1', [userId]);
    return rows.length ? normalizeData(rows[0].data) : defaultData();
  }

  async update<T>(userId: string, mutate: (data: StoreData) => T): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        'insert into app_state (user_id, data) values ($1, $2::jsonb) on conflict (user_id) do nothing',
        [userId, JSON.stringify(defaultData())],
      );
      // Khoá dòng để hai request cùng sửa không ghi đè nhau.
      const { rows } = await client.query(
        'select data from app_state where user_id = $1 for update',
        [userId],
      );
      const data = normalizeData(rows[0].data);
      const result = mutate(data);
      await client.query(
        'update app_state set data = $2::jsonb, updated_at = now() where user_id = $1',
        [userId, JSON.stringify(data)],
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
