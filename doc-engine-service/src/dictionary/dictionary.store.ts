import { PgPool } from '../store/pg.pool';
import { DictionaryEntry } from './dictionary';

/**
 * Kết quả tra phần tiếng Anh (phiên âm, từ loại, định nghĩa):
 * - found: có dữ liệu, tin 90 ngày.
 * - none: các từ điển trả lời rõ là không có từ này, chỉ tin 3 ngày để còn thử lại khi họ bổ sung.
 * Nguồn bị lỗi hoặc bị giới hạn tốc độ thì không phải kết quả: không được lưu, vì lưu sẽ biến một lỗi
 * tạm thời thành "từ này không có từ loại" kéo dài nhiều ngày.
 */
export type EnglishStatus = 'found' | 'none';

const TTL_DAYS: Record<EnglishStatus, number> = { found: 90, none: 3 };

/**
 * Mốc đồng bộ của worker. `cursor` là từ cuối cùng đã xử lý (theo thứ tự chữ cái); null nghĩa là chưa bắt
 * đầu hoặc đã đi hết một vòng. Lưu bền để API khởi động lại thì worker đi tiếp từ chỗ cũ.
 */
export interface SyncState {
  cursor: string | null;
  /** Tổng số từ worker đã xử lý từ trước tới nay. */
  processed: number;
  updatedAt: string | null;
}

export const EMPTY_SYNC_STATE: SyncState = { cursor: null, processed: 0, updatedAt: null };

/** Nơi lưu bền kết quả tra từ, để lần sau không phải gọi ra các nguồn bên ngoài. */
export abstract class DictionaryStore {
  /** Bản đã lưu còn mới, hoặc null. */
  abstract get(word: string): Promise<DictionaryEntry | null>;
  abstract set(entry: DictionaryEntry, status: EnglishStatus): Promise<void>;
  /** Trong các từ cho trước, những từ đã có bản lưu còn mới (worker bỏ qua chúng). */
  abstract fresh(words: string[]): Promise<Set<string>>;
  /** Mốc đồng bộ của một nguồn từ (ví dụ 'lessons'). */
  abstract getSync(source: string): Promise<SyncState>;
  abstract setSync(source: string, state: Pick<SyncState, 'cursor' | 'processed'>): Promise<void>;
}

export class MemoryDictionaryStore extends DictionaryStore {
  private readonly rows = new Map<
    string,
    { at: number; entry: DictionaryEntry; status: EnglishStatus }
  >();
  private readonly syncs = new Map<string, SyncState>();

  private isFresh(row: { at: number; status: EnglishStatus }): boolean {
    return Date.now() - row.at < TTL_DAYS[row.status] * 86_400_000;
  }

  async get(word: string): Promise<DictionaryEntry | null> {
    const row = this.rows.get(word);
    return row && this.isFresh(row) ? row.entry : null;
  }

  async set(entry: DictionaryEntry, status: EnglishStatus): Promise<void> {
    this.rows.set(entry.word, { at: Date.now(), entry, status });
  }

  async fresh(words: string[]): Promise<Set<string>> {
    return new Set(
      words.filter(word => {
        const row = this.rows.get(word);
        return row && this.isFresh(row);
      }),
    );
  }

  async getSync(source: string): Promise<SyncState> {
    return this.syncs.get(source) ?? EMPTY_SYNC_STATE;
  }

  async setSync(source: string, state: Pick<SyncState, 'cursor' | 'processed'>): Promise<void> {
    this.syncs.set(source, { ...state, updatedAt: new Date().toISOString() });
  }
}

export const DICTIONARY_SCHEMA_SQL = [
  `create table if not exists dictionary_entries (
    word text primary key,
    entry jsonb not null,
    found boolean not null,
    fetched_at timestamptz not null default now()
  )`,
  // Cột trạng thái thêm sau. Dòng cũ để null nên không bao giờ "còn mới": worker và lần tra kế tiếp sẽ
  // tra lại, nhờ vậy các từ từng bị lưu thiếu dữ liệu vì nguồn bị giới hạn tốc độ tự được sửa.
  `alter table dictionary_entries add column if not exists english_status text`,
  `create table if not exists dictionary_sync (
    source text primary key,
    last_word text,
    processed int not null default 0,
    updated_at timestamptz not null default now()
  )`,
];

const FRESH_SQL = `english_status is not null and fetched_at > now() - (case english_status when 'found' then $2::int when 'none' then $3::int else -1 end) * interval '1 day'`;

/** Bản lưu trong Postgres (Neon): sống qua các lần khởi động lại và dùng chung cho mọi tiến trình API. */
export class PgDictionaryStore extends DictionaryStore {
  constructor(private readonly pool: PgPool) {
    super();
  }

  async ensureSchema(): Promise<void> {
    for (const statement of DICTIONARY_SCHEMA_SQL) {
      await this.pool.query(statement);
    }
  }

  async get(word: string): Promise<DictionaryEntry | null> {
    const { rows } = await this.pool.query(
      `select entry from dictionary_entries where word = $1 and ${FRESH_SQL}`,
      [word, TTL_DAYS.found, TTL_DAYS.none],
    );
    return rows.length ? (rows[0].entry as DictionaryEntry) : null;
  }

  async set(entry: DictionaryEntry, status: EnglishStatus): Promise<void> {
    await this.pool.query(
      `insert into dictionary_entries (word, entry, found, english_status, fetched_at)
       values ($1, $2::jsonb, $3, $4, now())
       on conflict (word) do update
         set entry = excluded.entry, found = excluded.found,
             english_status = excluded.english_status, fetched_at = now()`,
      [entry.word, JSON.stringify(entry), status === 'found', status],
    );
  }

  async fresh(words: string[]): Promise<Set<string>> {
    if (!words.length) return new Set();
    const { rows } = await this.pool.query(
      `select word from dictionary_entries where word = any($1::text[]) and ${FRESH_SQL}`,
      [words, TTL_DAYS.found, TTL_DAYS.none],
    );
    return new Set(rows.map(row => row.word as string));
  }

  async getSync(source: string): Promise<SyncState> {
    const { rows } = await this.pool.query(
      'select last_word, processed, updated_at from dictionary_sync where source = $1',
      [source],
    );
    if (!rows.length) return EMPTY_SYNC_STATE;
    return {
      cursor: (rows[0].last_word as string | null) ?? null,
      processed: Number(rows[0].processed) || 0,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at).toISOString() : null,
    };
  }

  async setSync(source: string, state: Pick<SyncState, 'cursor' | 'processed'>): Promise<void> {
    await this.pool.query(
      `insert into dictionary_sync (source, last_word, processed, updated_at)
       values ($1, $2, $3, now())
       on conflict (source) do update
         set last_word = excluded.last_word, processed = excluded.processed, updated_at = now()`,
      [source, state.cursor, state.processed],
    );
  }
}
