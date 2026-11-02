import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/** Phần tối thiểu của `pg` mà code cần. Khai báo ở đây để test được bằng đối tượng giả. */
export interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
export interface PgPool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  connect(): Promise<PgClient>;
  end(): Promise<void>;
}

export function createPgPool(connectionString: string): PgPool {
  // Nạp `pg` khi thật sự dùng Postgres, để chạy bằng file JSON không cần cài gói này.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  // Giữ sẵn vài kết nối: mở kết nối TLS tới Neon ở xa mất cả giây, nên không đóng sớm.
  // Neon (pooler) có thể ngắt kết nối nhàn rỗi, nên pool tự bỏ và mở lại khi cần.
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 5 * 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // Một kết nối nhàn rỗi bị ngắt phát ra lỗi trên pool; không bắt thì cả tiến trình API sập.
  pool.on('error', (error: Error) => console.warn(`Kết nối Postgres nhàn rỗi bị ngắt: ${error.message}`));
  return pool as PgPool;
}

/** Giữ một pool dùng chung cho Store và Content, và đóng nó đúng một lần khi tắt ứng dụng. */
export class PgPoolService implements OnModuleInit, OnModuleDestroy {
  constructor(readonly pool: PgPool) {}

  /** Mở sẵn một kết nối ngay khi API khởi động để request đầu tiên không phải chờ bắt tay TLS. */
  async onModuleInit(): Promise<void> {
    await this.pool.query('select 1').catch(() => undefined);
  }

  onModuleDestroy(): Promise<void> {
    return this.pool.end();
  }
}
