import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  const t0 = 1_000_000;

  it('cho phép đến hết hạn mức rồi chặn và báo số giây phải chờ', () => {
    const limiter = new RateLimiter(3, 60_000);
    expect(limiter.hit('a', t0)).toEqual({ allowed: true, remaining: 2, resetSeconds: 60 });
    limiter.hit('a', t0);
    expect(limiter.hit('a', t0).allowed).toBe(true);
    const blocked = limiter.hit('a', t0 + 10_000);
    expect(blocked).toEqual({ allowed: false, remaining: 0, resetSeconds: 50 });
  });

  it('đặt lại khi hết cửa sổ', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.hit('a', t0);
    expect(limiter.hit('a', t0 + 1_000).allowed).toBe(false);
    expect(limiter.hit('a', t0 + 60_001).allowed).toBe(true);
  });

  it('đếm riêng từng khoá', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.hit('a', t0);
    expect(limiter.hit('a', t0).allowed).toBe(false);
    expect(limiter.hit('b', t0).allowed).toBe(true);
  });
});
