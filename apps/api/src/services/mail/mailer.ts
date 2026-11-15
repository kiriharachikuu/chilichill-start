import { randomUUID } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../../env';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export interface MailTransport {
  name: string;
  send(message: MailMessage, idempotencyKey?: string): Promise<{ messageId?: string }>;
}

export interface MailDeliveryResult {
  ok: boolean;
  attempts: number;
  transport: string;
  messageId?: string;
  error?: string;
  durationMs: number;
}

class ResendApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorName: string,
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(`Resend ${status} ${errorName}: ${message}`);
  }
}

function retryAfterMs(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function createResendTransport(): MailTransport {
  return {
    name: 'resend',
    async send(message, idempotencyKey = randomUUID()) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.mail.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          from: `${JSON.stringify(env.mail.fromName)} <${env.mail.from}>`,
          to: [message.to],
          reply_to: env.mail.replyTo ?? undefined,
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
            ...message.headers,
          },
        }),
      });

      // 网关错误可能返回非 JSON；仍按 HTTP 状态判定是否重试。
      const body: unknown = await response.json().catch(() => null);
      const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
      if (!response.ok) {
        throw new ResendApiError(
          response.status,
          typeof data.name === 'string' ? data.name : 'api_error',
          typeof data.message === 'string' ? data.message : response.statusText,
          retryAfterMs(response.headers.get('retry-after')),
        );
      }
      if (typeof data.id !== 'string' || !data.id) {
        throw new Error('Resend 响应缺少邮件 ID');
      }
      return { messageId: data.id };
    },
  };
}

// 未配置 Resend 时的本地开发兜底：完整纯文本内容打到后端日志，不对外暴露 HTML
const consoleTransport: MailTransport = {
  name: 'console',
  async send(message) {
    console.info(
      `[mail:console] 未配置 RESEND_API_KEY，邮件仅输出到日志\nto: ${message.to}\nsubject: ${message.subject}\n\n${message.text}\n`,
    );
    return {};
  },
};

let activeTransport: MailTransport | null = null;

function getTransport(): MailTransport {
  if (activeTransport) {
    return activeTransport;
  }
  activeTransport = env.mailEnabled ? createResendTransport() : consoleTransport;
  return activeTransport;
}

/**
 * 后台投递邮件：立即返回，投递结果仅写日志，避免 HTTP 超时与指数退避重试
 * 阻塞接口响应。仅在非 test 环境使用；测试环境需同步
 * 等待 deliverMail 的结果以便断言失败路径。
 */
export function deliverMailInBackground(
  message: MailMessage,
  log: FastifyBaseLogger,
  event: string,
): void {
  void deliverMail(message).then(
    (delivery) => {
      const payload = {
        event,
        to: delivery.transport === 'memory' ? message.to : undefined,
        transport: delivery.transport,
        attempts: delivery.attempts,
        durationMs: delivery.durationMs,
        messageId: delivery.messageId,
        error: delivery.error,
      };
      if (delivery.ok) {
        log.info(payload, '邮件后台投递成功');
      } else {
        log.error(payload, '邮件后台投递失败');
      }
    },
    (error: unknown) => {
      log.error({ event, error: String(error) }, '邮件后台投递异常');
    },
  );
}

/** 测试用：注入内存传输或恢复默认传输 */
export function setMailTransport(transport: MailTransport | null) {
  activeTransport = transport;
}

function isPermanentFailure(error: unknown): boolean {
  if (!(error instanceof ResendApiError)) {
    return false;
  }
  if (['daily_quota_exceeded', 'monthly_quota_exceeded'].includes(error.errorName)) {
    return true;
  }
  // HTTP 5xx、超时、限流与并发幂等请求可重试；密钥/域名/参数错误直接失败。
  if ([408, 429].includes(error.status) || error.errorName === 'concurrent_idempotent_requests') {
    return false;
  }
  return error.status >= 400 && error.status < 500;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return String(error).slice(0, 500);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 发送邮件并在失败时做指数退避重试。
 * 只返回结果不抛异常，调用方负责根据 ok 决定接口响应并记录状态日志。
 */
export async function deliverMail(message: MailMessage): Promise<MailDeliveryResult> {
  const startedAt = Date.now();
  const transport = getTransport();
  const maxAttempts = Math.max(1, env.mail.maxRetries + 1);
  // 同一封邮件的所有重试使用同一个键，避免请求已受理但响应丢失时重复发信。
  const idempotencyKey = randomUUID();
  let lastError = '未知错误';
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const { messageId } = await transport.send(message, idempotencyKey);
      return {
        ok: true,
        attempts,
        transport: transport.name,
        messageId,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = errorMessageOf(error);
      if (isPermanentFailure(error) || attempt === maxAttempts) {
        break;
      }
      // 第 1 次失败后等待 base，第 2 次等待 2*base，避免邮件服务抖动时立刻打爆
      const providerDelay = error instanceof ResendApiError ? error.retryAfterMs : 0;
      await sleep(Math.max(providerDelay, env.mail.retryDelayMs * 2 ** (attempt - 1)));
    }
  }

  return {
    ok: false,
    attempts,
    transport: transport.name,
    error: lastError,
    durationMs: Date.now() - startedAt,
  };
}
