export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type SlidingWindowLimiter = {
  check(key: string, now: number): RateLimitResult;
};

export function createSlidingWindowLimiter(limit: number, windowMs: number): SlidingWindowLimiter {
  const requestsByKey = new Map<string, number[]>();

  return {
    check(key: string, now: number): RateLimitResult {
      const windowStart = now - windowMs;
      const recentRequests = (requestsByKey.get(key) ?? []).filter((time) => time > windowStart);

      if (recentRequests.length >= limit) {
        requestsByKey.set(key, recentRequests);
        return { allowed: false, retryAfterMs: recentRequests[0] + windowMs - now };
      }

      recentRequests.push(now);
      requestsByKey.set(key, recentRequests);
      return { allowed: true };
    },
  };
}
