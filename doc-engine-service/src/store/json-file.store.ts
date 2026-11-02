import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { StoreData, defaultData, normalizeData } from './state';
import { Store } from './store';

/** Lưu vào một file JSON, mỗi người dùng một mục. Dùng khi chưa cấu hình DATABASE_URL. */
export class JsonFileStore extends Store {
  private readonly file = process.env.DATA_FILE ?? join(process.cwd(), 'data', 'store.json');
  private users: Record<string, StoreData> = this.load();

  async read(userId: string): Promise<StoreData> {
    return this.users[userId] ?? defaultData();
  }

  async update<T>(userId: string, mutate: (data: StoreData) => T): Promise<T> {
    // Không có await giữa lúc đọc và ghi nên các update không chen vào nhau.
    const draft = structuredClone(this.users[userId] ?? defaultData());
    const result = mutate(draft);
    this.users = { ...this.users, [userId]: draft };
    this.persist();
    return result;
  }

  private load(): Record<string, StoreData> {
    if (!existsSync(this.file)) {
      return {};
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      // Định dạng cũ (một người dùng, không có khoá users) bị bỏ qua vì không biết thuộc về ai.
      const users = (raw?.users ?? {}) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(users).map(([id, data]) => [id, normalizeData(data)]));
    } catch {
      return {};
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify({ users: this.users }, null, 2), 'utf8');
    renameSync(temp, this.file);
  }
}
