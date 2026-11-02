import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { RateLimiter } from './rate-limiter';

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Giới hạn số request mỗi địa chỉ IP trong một phút trên toàn bộ API.
 * Chỉnh bằng RATE_LIMIT_MAX (mặc định 120) và RATE_LIMIT_WINDOW_SECONDS (mặc định 60).
 * Đăng ký trước AuthGuard để request chưa đăng nhập cũng bị đếm.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter = new RateLimiter(
    positiveInt(process.env.RATE_LIMIT_MAX, 120),
    positiveInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 60) * 1000,
  );

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const decision = this.limiter.hit(request.ip ?? 'unknown');
    response.setHeader('X-RateLimit-Limit', String(this.limiter.limit));
    response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.resetSeconds));
      throw new HttpException(
        `Bạn gửi quá nhiều yêu cầu. Thử lại sau ${decision.resetSeconds} giây.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
