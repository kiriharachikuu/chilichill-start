import type { FastifyInstance, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { env } from '../env';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** 429 限流类错误的建议重试等待秒数，随错误响应返回给客户端 */
  readonly retryAfterSeconds?: number;

  constructor(statusCode: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 判断错误是否为 Prisma 唯一约束冲突（P2002） */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  retryAfterSeconds?: number,
) {
  const error: { code: string; message: string; retryAfterSeconds?: number } = { code, message };
  if (retryAfterSeconds !== undefined) {
    error.retryAfterSeconds = retryAfterSeconds;
  }
  return reply.status(statusCode).send({ error });
}

interface ErrorLike {
  validation?: unknown;
  statusCode?: number;
  code?: string;
  message?: string;
  stack?: string;
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues.map((issue) => issue.message).join('；') || '参数校验失败';
      return sendError(reply, 400, 'VALIDATION_ERROR', message);
    }

    if (error instanceof HttpError) {
      return sendError(reply, error.statusCode, error.code, error.message, error.retryAfterSeconds);
    }

    if (typeof error === 'object' && error !== null) {
      const err = error as ErrorLike;

      if (err.validation) {
        return sendError(reply, 400, 'VALIDATION_ERROR', err.message ?? '请求参数校验失败');
      }

      if (err.code === 'FST_REQ_FILE_TOO_LARGE') {
        return sendError(reply, 400, 'INVALID_FILE', '仅支持 png/jpg/jpeg/webp 且不超过 5MB');
      }

      if (typeof err.statusCode === 'number' && err.statusCode < 500) {
        return sendError(reply, err.statusCode, err.code ?? 'BAD_REQUEST', err.message ?? '请求失败');
      }

      request.log.error(error);
      if (env.isDev && err.stack) {
        console.error(err.stack);
      }
    } else {
      request.log.error(error);
    }

    return sendError(reply, 500, 'INTERNAL_ERROR', '服务器开小差了，请稍后再试');
  });
}
