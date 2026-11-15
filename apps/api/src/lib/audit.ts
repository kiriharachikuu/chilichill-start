import type { Prisma, PrismaClient } from '../generated/prisma/client';
import { prisma } from '../prisma';

export interface AuditEvent {
  actorId: string;
  /** 操作者昵称快照（审计列表展示用），与 users.ts 角色变更日志保持一致 */
  actorNickname?: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail?: Record<string, unknown>;
}

type AuditClient = PrismaClient | Prisma.TransactionClient;

/**
 * 写管理操作审计日志（AdminAuditLog，站长后台“操作日志”面板可查）。
 * 失败只记日志不抛错：
 * - 审计存储故障不应阻断业务主流程；
 * - 在交互事务内调用时异常被吞掉，不会导致主事务回滚。
 */
export async function recordAudit(event: AuditEvent, client: AuditClient = prisma): Promise<void> {
  try {
    await client.adminAuditLog.create({
      data: {
        actorId: event.actorId,
        actorNickname: event.actorNickname ?? '',
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId,
        detail: JSON.stringify(event.detail ?? {}),
      },
    });
  } catch (error) {
    console.error(
      `[audit] 写入审计日志失败 action=${event.action} target=${event.targetType}:${event.targetId ?? ''}:`,
      error,
    );
  }
}
