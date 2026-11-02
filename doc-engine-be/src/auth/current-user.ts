import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { AuthedRequest } from './auth.guard';

const requestUser = (context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthedRequest>().user;

/** Id người dùng đang đăng nhập. Chỉ dùng ở endpoint đã đánh dấu @LoginRequired(). */
export const UserId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const user = requestUser(context);
  if (!user) {
    // Không xảy ra nếu endpoint đã đánh dấu đúng; chặn lại để không bao giờ ghi dữ liệu cho "không ai".
    throw new UnauthorizedException('Bạn cần đăng nhập.');
  }
  return user.sub;
});

/** Id người dùng nếu có đăng nhập, ngược lại undefined. Dùng ở endpoint công khai có cá nhân hoá. */
export const OptionalUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => requestUser(context)?.sub,
);
