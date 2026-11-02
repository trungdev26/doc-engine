import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password';
import { UserRecord, UsersRepository } from './users.repository';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly users: UsersRepository) {}

  /**
   * Tạo hoặc cập nhật tài khoản admin từ ADMIN_USERNAME và ADMIN_PASSWORD mỗi lần khởi động.
   * Đổi mật khẩu trong .env rồi khởi động lại là mật khẩu admin đổi theo.
   */
  async onModuleInit(): Promise<void> {
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
      this.logger.warn('Chưa đặt ADMIN_USERNAME và ADMIN_PASSWORD: chưa có tài khoản nào để đăng nhập.');
      return;
    }
    if (password.length < 8) {
      this.logger.warn('ADMIN_PASSWORD ngắn hơn 8 ký tự nên bị bỏ qua.');
      return;
    }
    await this.users.upsert({ username, passwordHash: await hashPassword(password), role: 'admin' });
    this.logger.log(`Đã đồng bộ tài khoản admin "${username}".`);
  }

  /** Trả về người dùng nếu đúng mật khẩu, ngược lại null. Thời gian xử lý như nhau cho cả hai trường hợp. */
  async verify(username: string, password: string): Promise<UserRecord | null> {
    const user = await this.users.findByUsername(username);
    if (!user) {
      await burnPasswordCheck(password);
      return null;
    }
    return (await verifyPassword(password, user.passwordHash)) ? user : null;
  }

  findById(id: string): Promise<UserRecord | null> {
    return this.users.findById(id);
  }
}
