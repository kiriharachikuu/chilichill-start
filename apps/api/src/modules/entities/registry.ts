import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { HttpError } from '../../lib/errors';

export interface EntityApplyContext {
  mode: string;
  targetId: string | null;
  // 投稿者 id：审核通过创建内容时写入 uploaderId，用于详情页展示上传者与个人空间聚合
  submitterId: string;
}

export interface EntityHandler {
  entityType: string;
  label: string;
  parsePayload(payload: unknown): unknown;
  loadTarget(client: PrismaClient | Prisma.TransactionClient, id: string): Promise<unknown | null>;
  /** 批量加载目标内容（列表页用，避免逐条 N+1）；键为实体 id */
  loadTargets(
    client: PrismaClient | Prisma.TransactionClient,
    ids: string[],
  ): Promise<Map<string, unknown>>;
  apply(tx: Prisma.TransactionClient, ctx: EntityApplyContext, payload: unknown): Promise<{ targetId: string }>;
  serializeTarget(target: unknown): unknown;
}

const registry = new Map<string, EntityHandler>();

export function registerEntity(handler: EntityHandler): void {
  registry.set(handler.entityType, handler);
}

export function getEntity(type: string): EntityHandler {
  const handler = registry.get(type);
  if (!handler) {
    throw new HttpError(400, 'UNSUPPORTED_ENTITY', '不支持的内容类型');
  }
  return handler;
}

export function listEntityTypes(): string[] {
  return [...registry.keys()];
}
