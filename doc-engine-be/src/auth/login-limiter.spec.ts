import { LoginLimiter } from './login-limiter';

describe('LoginLimiter', () => {
  const t0 = 1_000_000;

  it('chỉ khoá sau đủ số lần sai liên tiếp', () => {
    const limiter = new LoginLimiter(3, 60_000);
    limiter.fail('a', t0);
    limiter.fail('a', t0);
    expect(limiter.retryAfterSeconds('a', t0)).toBe(0);
    limiter.fail('a', t0);
    expect(limiter.retryAfterSeconds('a', t0)).toBe(60);
    expect(limiter.retryAfterSeconds('a', t0 + 30_000)).toBe(30);
  });

  it('mở khoá khi hết thời gian và đếm lại từ đầu', () => {
    const limiter = new LoginLimiter(2, 60_000);
    limiter.fail('a', t0);
    limiter.fail('a', t0);
    expect(limiter.retryAfterSeconds('a', t0 + 61_000)).toBe(0);
    limiter.fail('a', t0 + 61_000);
    expect(limiter.retryAfterSeconds('a', t0 + 61_000)).toBe(0);
  });

  it('khoá riêng từng khoá và reset khi đăng nhập đúng', () => {
    const limiter = new LoginLimiter(1, 60_000);
    limiter.fail('a', t0);
    expect(limiter.retryAfterSeconds('b', t0)).toBe(0);
    limiter.reset('a');
    expect(limiter.retryAfterSeconds('a', t0)).toBe(0);
  });
});
