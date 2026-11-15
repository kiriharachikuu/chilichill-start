import nodemailer from 'nodemailer';
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
  send(message: MailMessage): Promise<{ messageId?: string }>;
}

export interface MailDeliveryResult {
  ok: boolean;
  attempts: number;
  transport: string;
  messageId?: string;
  error?: string;
  durationMs: number;
}

function createSmtpTransport(): MailTransport {
  const transporter = nodemailer.createTransport({
    host: env.mail.host ?? undefined,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass ?? '' } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return {
    name: 'smtp',
    async send(message) {
      const info = await transporter.sendMail({
        from: { name: env.mail.fromName, address: env.mail.from },
        to: message.to,
        replyTo: env.mail.replyTo ?? undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          // 声明为系统自动生成的事务邮件，降低被判为营销/垃圾邮件的概率
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          ...message.headers,
        },
      });
      return { messageId: info.messageId };
    },
  };
}

// 未配置 SMTP 时的本地开发兜底：完整纯文本内容打到后端日志，不对外暴露 HTML
const consoleTransport: MailTransport = {
  name: 'console',
  async send(message) {
    console.info(
      `[mail:console] 未配置 SMTP，邮件仅输出到日志\nto: ${message.to}\nsubject: ${message.subject}\n\n${message.text}\n`,
    );
    return {};
  },
};

let activeTransport: MailTransport | null = null;

function getTransport(): MailTransport {
  if (activeTransport) {
    return activeTransport;
  }
  activeTransport = env.mailEnabled ? createSmtpTransport() : consoleTransport;
  return activeTransport;
}

/**
 * 后台投递邮件：立即返回，投递结果仅写日志，避免 SMTP 连接超时与指数退避重试
 * （最长可达约 1 分钟）阻塞接口响应。仅在非 test 环境使用；测试环境需同步
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
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = (error as { responseCode?: number }).responseCode;
  // 5xx 通常是收件人不存在、被拒等不可恢复错误，重试没有意义
  return typeof code === 'number' && code >= 500 && code < 600;
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
  let lastError = '未知错误';
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    try {
      const { messageId } = await transport.send(message);
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
      await sleep(env.mail.retryDelayMs * 2 ** (attempt - 1));
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
