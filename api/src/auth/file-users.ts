import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { UserRecord, UsersRepository } from './users.repository';

/** Tài khoản lưu vào file JSON. Dùng khi chưa có DATABASE_URL. */
export class FileUsers extends UsersRepository {
  private readonly file = process.env.USERS_FILE ?? join(process.cwd(), 'data', 'users.json');
  private users: UserRecord[] = this.load();

  async findByUsername(username: string): Promise<UserRecord | null> {
    const key = username.toLowerCase();
    return this.users.find(user => user.username.toLowerCase() === key) ?? null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.find(user => user.id === id) ?? null;
  }

  async upsert(user: Omit<UserRecord, 'id'>): Promise<UserRecord> {
    const existing = await this.findByUsername(user.username);
    const saved: UserRecord = { ...user, id: existing?.id ?? randomUUID() };
    this.users = [...this.users.filter(item => item.id !== saved.id), saved];
    this.persist();
    return saved;
  }

  private load(): UserRecord[] {
    if (!existsSync(this.file)) {
      return [];
    }
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.users, null, 2), 'utf8');
    renameSync(temp, this.file);
  }
}
