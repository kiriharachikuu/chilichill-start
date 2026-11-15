import { HttpError } from './errors';

/**
 * 进程内固定窗口限流（与验证码限流同策略）。
 * 单实例部署够用；多实例部署需替换为 Redis 等共享存储实现。
 */
const hitsByKey = new Map<string, number[]>();
const MAX_KEYS = 20_000;

/** 清空限流计数，仅用于测试。 */
export function resetRateLimits() {
  hitsByKey.clear();
}

export function enforceRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
  code: string;
  message: string;
}): void {
  const { key, limit, windowMs, code, message } = options;
  const now = Date.now();
  const recent = (hitsByKey.get(key) ?? []).filter((time) => now - time < windowMs);

  if (recent.length >= limit) {
    hitsByKey.set(key, recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    throw new HttpError(429, code, message, retryAfterSeconds);
  }

  recent.push(now);
  hitsByKey.set(key, recent);

  if (hitsByKey.size > MAX_KEYS) {
    for (const [mapKey, times] of hitsByKey) {
      if (times.every((time) => now - time >= windowMs)) {
        hitsByKey.delete(mapKey);
      }
    }
  }
}
