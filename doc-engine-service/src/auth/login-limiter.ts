/** Giới hạn đăng nhập sai liên tiếp theo từng khoá (địa chỉ + tên đăng nhập), giữ trong bộ nhớ. */
export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; blockedUntil: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly blockMs = 60_000,
  ) {}

  /** Số giây còn phải chờ, hoặc 0 nếu được phép thử. */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const entry = this.failures.get(key);
    if (!entry || entry.blockedUntil <= now) {
      return 0;
    }
    return Math.ceil((entry.blockedUntil - now) / 1000);
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.failures.get(key);
    // Hết thời gian khoá thì đếm lại từ đầu, không cộng dồn với lần trước.
    const count = entry && entry.blockedUntil <= now && entry.count >= this.maxFailures ? 1 : (entry?.count ?? 0) + 1;
    this.failures.set(key, {
      count,
      blockedUntil: count >= this.maxFailures ? now + this.blockMs : 0,
    });
    if (this.failures.size > 5000) {
      this.prune(now);
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private prune(now: number): void {
    for (const [key, entry] of this.failures) {
      if (entry.blockedUntil <= now) {
        this.failures.delete(key);
      }
    }
  }
}
