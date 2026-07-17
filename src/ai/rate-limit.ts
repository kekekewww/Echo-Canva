export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export type SlidingWindowLimiter = {
  check(key: string, now: number): RateLimitResult;
};

const DEFAULT_MAX_TRACKED_KEYS = 1_000;

function oldestKey(requestsByKey: ReadonlyMap<string, readonly number[]>): string | undefined {
  let oldest: { key: string; requestAt: number } | undefined;

  for (const [key, requests] of requestsByKey) {
    const requestAt = requests[0];
    if (requestAt !== undefined && (!oldest || requestAt < oldest.requestAt)) {
      oldest = { key, requestAt };
    }
  }

  return oldest?.key;
}

export function createSlidingWindowLimiter(
  limit: number,
  windowMs: number,
  maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS,
): SlidingWindowLimiter {
  const requestsByKey = new Map<string, number[]>();
  const boundedMaxKeys = Math.max(1, Math.floor(maxTrackedKeys));

  return {
    check(key: string, now: number): RateLimitResult {
      const windowStart = now - windowMs;
      for (const [trackedKey, requests] of requestsByKey) {
        const recentRequests = requests.filter((time) => time > windowStart);
        if (recentRequests.length === 0) {
          requestsByKey.delete(trackedKey);
        } else {
          requestsByKey.set(trackedKey, recentRequests);
        }
      }

      while (!requestsByKey.has(key) && requestsByKey.size >= boundedMaxKeys) {
        const keyToEvict = oldestKey(requestsByKey);
        if (!keyToEvict) {
          break;
        }
        requestsByKey.delete(keyToEvict);
      }

      const recentRequests = requestsByKey.get(key) ?? [];

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
