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

interface WaitingSlot {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface QueueState {
  active: number;
  waiting: WaitingSlot[];
}

const queues = new Map<string, QueueState>();

/**
 * 并发排队闸门：超过 concurrency 的任务进入等待队列，队列满或等待超时抛 429。
 * 用于保护 CPU 密集型操作（如注册的 bcrypt 哈希）在突发流量下不被打爆——
 * 请求先进队排队而不是全部并发执行导致超时。
 */
export async function withQueue<T>(
  options: {
    key: string;
    concurrency: number;
    maxWaiting: number;
    waitTimeoutMs: number;
    code: string;
    busyMessage: string;
  },
  task: () => Promise<T>,
): Promise<T> {
  const { key, concurrency, maxWaiting, waitTimeoutMs, code, busyMessage } = options;
  const queue = (() => {
    const existing = queues.get(key);
    if (existing) return existing;
    const created: QueueState = { active: 0, waiting: [] };
    queues.set(key, created);
    return created;
  })();

  if (queue.active >= concurrency) {
    if (queue.waiting.length >= maxWaiting) {
      throw new HttpError(429, code, busyMessage);
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = queue.waiting.indexOf(slot);
        if (index >= 0) queue.waiting.splice(index, 1);
        reject(new HttpError(429, code, busyMessage, Math.ceil(waitTimeoutMs / 1000)));
      }, waitTimeoutMs);
      const slot: WaitingSlot = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        timer,
      };
      queue.waiting.push(slot);
    });
  }

  queue.active += 1;
  try {
    return await task();
  } finally {
    queue.active -= 1;
    // 释放许可给队首等待者
    const next = queue.waiting.shift();
    next?.resolve();
  }
}
