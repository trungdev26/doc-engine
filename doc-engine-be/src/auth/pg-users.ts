import { randomUUID } from 'crypto';
import { PgPool } from '../store/pg.pool';
import { UserRecord, UsersRepository } from './users.repository';

export const USERS_SCHEMA_SQL = `
create table if not exists users (
  id text primary key,
  username text not null,
  password_hash text not null,
  role text not null default 'user',
  created_at timestamptz not null default now()
)`;

export const USERS_INDEX_SQL =
  'create unique index if not exists users_username_lower on users (lower(username))';

const toRecord = (row: any): UserRecord => ({
  id: row.id,
  username: row.username,
  passwordHash: row.password_hash,
  role: row.role,
});

/** Tài khoản trong Postgres (Neon). Tên đăng nhập không phân biệt hoa thường. */
export class PgUsers extends UsersRepository {
  constructor(private readonly pool: PgPool) {
    super();
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(USERS_SCHEMA_SQL);
    await this.pool.query(USERS_INDEX_SQL);
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query('select * from users where lower(username) = lower($1)', [
      username,
    ]);
    return rows.length ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await this.pool.query('select * from users where id = $1', [id]);
    return rows.length ? toRecord(rows[0]) : null;
  }

  async upsert(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    const { rows } = await this.pool.query(
      `insert into users (id, username, password_hash, role)
       values ($1, $2, $3, $4)
       on conflict (lower(username)) do update
         set password_hash = excluded.password_hash, role = excluded.role
       returning *`,
      [randomUUID(), user.username, user.passwordHash, user.role],
    );
    return toRecord(rows[0]);
  }
}
