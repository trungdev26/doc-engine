import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginLimiter } from './login-limiter';
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  extractToken,
  signSession,
  verifySession,
} from './session';

class LoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}

const isSecure = (): boolean => process.env.COOKIE_SECURE === 'true';

/** Cookie đăng nhập. HTTPS thì SameSite=None để trình duyệt gửi kèm khi web và API khác domain. */
const sessionCookie = () => ({
  httpOnly: true,
  sameSite: isSecure() ? ('none' as const) : ('lax' as const),
  secure: isSecure(),
  path: '/',
});

@Controller('auth')
export class AuthController {
  private readonly limiter = new LoginLimiter();

  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const key = `${request.ip}|${dto.username.toLowerCase()}`;
    const wait = this.limiter.retryAfterSeconds(key);
    if (wait > 0) {
      response.setHeader('Retry-After', String(wait));
      throw new HttpException(
        `Đăng nhập sai quá nhiều lần. Thử lại sau ${wait} giây.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.auth.verify(dto.username, dto.password);
    if (!user) {
      this.limiter.fail(key);
      // Cùng một thông báo cho cả sai tên và sai mật khẩu để không lộ tên nào có thật.
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu.');
    }
    this.limiter.reset(key);

    const token = signSession({ sub: user.id, username: user.username, role: user.role });
    response.cookie(SESSION_COOKIE, token, {
      ...sessionCookie(),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    return { username: user.username, role: user.role, token };
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.clearCookie(SESSION_COOKIE, sessionCookie());
  }

  /** Cho giao diện biết đã đăng nhập chưa; trả 401 nếu chưa. */
  @Get('me')
  async me(@Req() request: Request) {
    const session = verifySession(extractToken(request.headers));
    const user = session ? await this.auth.findById(session.sub) : null;
    if (!user) {
      throw new UnauthorizedException('Bạn cần đăng nhập.');
    }
    return { username: user.username, role: user.role };
  }
}
