import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

export type Role = 'admin' | 'user';

/** Nội dung JWT. `sub` là id người dùng; `iat` và `exp` tính bằng giây từ epoch. */
export interface SessionPayload {
  sub: string;
  username: string;
  role: Role;
  iat: number;
  exp: number;
}

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

let generatedSecret: string | null = null;

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) {
    return configured;
  }
  // Không có khoá hợp lệ thì dùng khoá tạm: chạy được nhưng mọi token mất hiệu lực khi khởi động lại.
  if (!generatedSecret) {
    generatedSecret = randomBytes(32).toString('hex');
    console.warn(
      'SESSION_SECRET chưa đặt hoặc ngắn hơn 32 ký tự: dùng khoá tạm, đăng nhập sẽ mất khi khởi động lại API.',
    );
  }
  return generatedSecret;
}

const sign = (signingInput: string): string =>
  createHmac('sha256', secret()).update(signingInput).digest('base64url');

/** Tạo JWT HS256. */
export function signSession(
  payload: Pick<SessionPayload, 'sub' | 'username' | 'role'>,
  now = Date.now(),
): string {
  const iat = Math.floor(now / 1000);
  const body = Buffer.from(
    JSON.stringify({ ...payload, iat, exp: iat + SESSION_TTL_SECONDS }),
  ).toString('base64url');
  const signingInput = `${HEADER}.${body}`;
  return `${signingInput}.${sign(signingInput)}`;
}

/** Trả về nội dung nếu JWT đúng chữ ký, đúng thuật toán và chưa hết hạn, ngược lại null. */
export function verifySession(token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, body, signature] = parts;

  try {
    // Chỉ chấp nhận đúng HS256: chặn token tự khai alg là "none" hoặc đổi thuật toán.
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
    if (decodedHeader?.alg !== 'HS256') {
      return null;
    }

    const expected = Buffer.from(sign(`${header}.${body}`));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    const valid =
      typeof payload.sub === 'string' &&
      typeof payload.username === 'string' &&
      (payload.role === 'admin' || payload.role === 'user') &&
      typeof payload.exp === 'number' &&
      payload.exp > Math.floor(now / 1000);
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

/** Lấy JWT từ header Authorization (Bearer) trước, không có thì lấy từ cookie. */
export function extractToken(headers: { authorization?: string; cookie?: string }): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(headers.authorization ?? '');
  return match ? match[1] : readCookie(headers.cookie, SESSION_COOKIE);
}
