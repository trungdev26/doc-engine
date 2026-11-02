import { Role } from './session';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
}

/** Nơi lưu tài khoản. Có hai bản: file JSON và Postgres (Neon). */
export abstract class UsersRepository {
  abstract findByUsername(username: string): Promise<UserRecord | null>;
  abstract findById(id: string): Promise<UserRecord | null>;
  /** Tạo mới nếu chưa có, ngược lại cập nhật mật khẩu và quyền. Trả về bản ghi sau cùng. */
  abstract upsert(user: Omit<UserRecord, 'id'>): Promise<UserRecord>;
}
