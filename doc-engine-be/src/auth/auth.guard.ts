import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SessionPayload, extractToken, verifySession } from './session';

export const LOGIN_KEY = 'loginRequired';
export const ADMIN_KEY = 'adminOnly';

/** Đòi đăng nhập: dùng cho thao tác lưu dữ liệu của người học (từ, tiến độ, hồ sơ). */
export const LoginRequired = () => SetMetadata(LOGIN_KEY, true);
/** Chỉ tài khoản có quyền admin (đã bao gồm đòi đăng nhập). */
export const AdminOnly = () => SetMetadata(ADMIN_KEY, true);

export interface AuthedRequest extends Request {
  /** Có giá trị khi request mang JWT hợp lệ, kể cả ở endpoint công khai. */
  user?: SessionPayload;
}

/**
 * Đọc JWT (header hoặc cookie) nếu có. Mặc định endpoint là công khai; endpoint đánh dấu
 * @LoginRequired() đòi đăng nhập (401) và @AdminOnly() đòi thêm quyền admin (403).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const session = verifySession(extractToken(request.headers));
    if (session) {
      request.user = session;
    }

    const targets = [context.getHandler(), context.getClass()];
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_KEY, targets);
    const loginRequired = adminOnly || this.reflector.getAllAndOverride<boolean>(LOGIN_KEY, targets);
    if (!loginRequired) {
      return true;
    }
    if (!session) {
      throw new UnauthorizedException('Bạn cần đăng nhập.');
    }
    if (adminOnly && session.role !== 'admin') {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }
    return true;
  }
}
