export interface RateDecision {
  allowed: boolean;
  /** Số request còn lại trong cửa sổ hiện tại. */
  remaining: number;
  /** Số giây nữa cửa sổ được đặt lại. */
  resetSeconds: number;
}

/**
 * Giới hạn số request theo cửa sổ cố định, đếm trong bộ nhớ của một tiến trình.
 * Chạy nhiều bản API cùng lúc thì mỗi bản đếm riêng, cần chuyển sang kho dùng chung (Redis) khi đó.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string, now = Date.now()): RateDecision {
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, entry);
      if (this.windows.size > 10_000) {
        this.prune(now);
      }
    }
    entry.count += 1;
    return {
      allowed: entry.count <= this.max,
      remaining: Math.max(0, this.max - entry.count),
      resetSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  get limit(): number {
    return this.max;
  }

  private prune(now: number): void {
    for (const [key, entry] of this.windows) {
      if (entry.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
