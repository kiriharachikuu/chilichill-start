import {
  derivePenalty,
  PENALTY_TYPE_LABELS,
  type AppliedPenaltySummary,
  type Penalty as PenaltyDto,
  type PenaltyStatus,
  type PenaltyType,
} from '@spaceport/shared';
import type { Prisma } from '../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit } from '../lib/audit';
import { HttpError } from '../lib/errors';

export type DbClient = typeof prisma | Prisma.TransactionClient;

export function isStaffRole(role: string): boolean {
  return role === 'ADMIN' || role === 'MODERATOR';
}

const CN_DATETIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 通知与拦截文案使用的时间格式（东八区） */
export function formatDateTimeCN(date: Date): string {
  return CN_DATETIME_FORMATTER.format(date).replace(/\//g, '-');
}

const userBriefSelect = { select: { uid: true, nickname: true } } as const;

type PenaltyRow = Prisma.PenaltyGetPayload<{
  include: { user: typeof userBriefSelect; operator: typeof userBriefSelect; revokedBy: typeof userBriefSelect };
}>;

const PENALTY_INCLUDE = {
  user: userBriefSelect,
  operator: userBriefSelect,
  revokedBy: userBriefSelect,
} as const;

/** 当前生效中的禁言（未撤销且未到期），取最晚到期的一条 */
export function getActiveMute(userId: string, client: DbClient = prisma) {
  return client.penalty.findFirst({
    where: { userId, type: 'MUTE', revokedAt: null, endsAt: { gt: new Date() } },
    orderBy: { endsAt: 'desc' },
  });
}

/** 禁言用户发布内容 / 评论 / 发言的统一拦截：403 ACCOUNT_MUTED */
export async function assertNotMuted(userId: string): Promise<void> {
  const mute = await getActiveMute(userId);
  if (!mute?.endsAt) return;
  throw new HttpError(
    403,
    'ACCOUNT_MUTED',
    `您处于禁言处罚中，至 ${formatDateTimeCN(mute.endsAt)} 解除，期间禁止发布内容与评论`,
  );
}

export interface ApplyPenaltyContext {
  /** 被处罚人（举报对象） */
  userId: string;
  /** 违规事由（举报原因） */
  reason: string;
  /** 核实凭证：关联举报 id */
  evidenceReportIds: string[];
  /** 触发处罚的操作人（核实举报的审核员/管理员） */
  operatorId: string;
  operatorNickname: string;
}

export interface ApplyPenaltyOutcome {
  /** 是否实际触发处罚（用户不存在 / 审核组成员豁免 / 已封号时不触发） */
  applied: boolean;
  summary: AppliedPenaltySummary | null;
}

function buildPenaltyNotification(type: PenaltyType, options: {
  seq: number;
  reason: string;
  startedAt: Date;
  endsAt: Date | null;
  durationDays: number | null;
}): { title: string; content: string } {
  const { seq, reason, startedAt, endsAt, durationDays } = options;
  const cause = `违规事由：${reason}`;
  if (type === 'WARNING') {
    return {
      title: `处罚通知：警告（第 ${seq} 次）`,
      content: `您的发言被举报并经站方核实无误，记录第 ${seq} 次警告。警告无功能限制，累计警告满 3 次后再次违规将触发禁言。${cause}`,
    };
  }
  if (type === 'MUTE') {
    return {
      title: `处罚通知：禁言 ${durationDays} 天`,
      content: `您的发言被举报并经站方核实无误，处罚升级为禁言 ${durationDays} 天（${formatDateTimeCN(startedAt)} 至 ${endsAt ? formatDateTimeCN(endsAt) : ''}），禁言期间禁止发布内容与评论。${cause}`,
    };
  }
  return {
    title: '处罚通知：永久封号',
    content: `您的发言被举报并经站方核实无误，累计违规已达上限，账号已被永久封禁，禁止登录及一切操作。${cause}`,
  };
}

/**
 * 举报核实后的阶梯处罚触发（必须在举报核实的同一事务内调用，保证计数一致性）。
 * 依据用户当前有效处罚计数实时推导处罚等级：
 * - warningCount < 3 → 警告（第 1~3 次核实）
 * - 警告满 3 次 → 按已禁言次数取 3/7/15 天阶梯禁言
 * - 禁言满 3 次 → 永久封号
 */
export async function applyPenaltyForVerifiedReport(
  ctx: ApplyPenaltyContext,
  tx: Prisma.TransactionClient,
): Promise<ApplyPenaltyOutcome> {
  const user = await tx.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      uid: true,
      nickname: true,
      role: true,
      warningCount: true,
      muteCount: true,
      bannedAt: true,
    },
  });
  if (!user) return { applied: false, summary: null };
  // 审核组成员与站长豁免处罚；已永久封号用户不再叠加新处罚
  if (isStaffRole(user.role) || user.bannedAt) {
    return { applied: false, summary: null };
  }

  const now = new Date();
  const derived = derivePenalty(user.warningCount, user.muteCount);
  const endsAt =
    derived.type === 'MUTE' && derived.durationDays
      ? new Date(now.getTime() + derived.durationDays * 24 * 60 * 60 * 1000)
      : null;

  const penalty = await tx.penalty.create({
    data: {
      userId: user.id,
      type: derived.type,
      durationDays: derived.durationDays,
      startedAt: now,
      endsAt,
      reason: ctx.reason,
      evidenceReportIds: JSON.stringify(ctx.evidenceReportIds),
      operatorId: ctx.operatorId,
    },
  });

  // 用户处罚状态实时更新：警告/禁言累加计数，封号写入 bannedAt
  if (derived.type === 'WARNING') {
    await tx.user.update({ where: { id: user.id }, data: { warningCount: { increment: 1 } } });
  } else if (derived.type === 'MUTE') {
    await tx.user.update({ where: { id: user.id }, data: { muteCount: { increment: 1 } } });
  } else {
    await tx.user.update({ where: { id: user.id }, data: { bannedAt: now } });
  }

  const seq = derived.type === 'WARNING' ? user.warningCount + 1 : user.muteCount + 1;
  const { title, content } = buildPenaltyNotification(derived.type, {
    seq,
    reason: ctx.reason,
    startedAt: now,
    endsAt,
    durationDays: derived.durationDays,
  });
  await tx.notification.create({
    data: { userId: user.id, type: 'PENALTY', title, content },
  });

  // 不可篡改操作日志：操作人、操作时间、核实凭证、处罚详情
  await recordAudit(
    {
      actorId: ctx.operatorId,
      actorNickname: ctx.operatorNickname,
      action: 'penalty.apply',
      targetType: 'Penalty',
      targetId: penalty.id,
      detail: {
        penaltyUserId: user.id,
        penaltyUserUid: user.uid,
        type: derived.type,
        durationDays: derived.durationDays,
        reason: ctx.reason,
        evidenceReportIds: ctx.evidenceReportIds,
        startedAt: now.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
      },
    },
    tx,
  );

  return {
    applied: true,
    summary: {
      id: penalty.id,
      userId: user.id,
      userUid: user.uid,
      userNickname: user.nickname,
      type: derived.type,
      durationDays: derived.durationDays,
      startedAt: now.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      reason: ctx.reason,
    },
  };
}

export interface RevokePenaltyContext {
  operatorId: string;
  operatorNickname: string;
  reason: string;
}

/**
 * 从有效处罚记录重算用户处罚状态：
 * - 有效警告数 / 有效禁言数取计数
 * - 存在有效封号记录时保留 bannedAt，否则解封（撤销唯一有效封号即自动恢复权限）
 */
export async function recomputeUserPenaltyCounters(userId: string, client: DbClient): Promise<{
  warningCount: number;
  muteCount: number;
  bannedAt: Date | null;
}> {
  const [warningCount, muteCount, activeBan] = await Promise.all([
    client.penalty.count({ where: { userId, type: 'WARNING', revokedAt: null } }),
    client.penalty.count({ where: { userId, type: 'MUTE', revokedAt: null } }),
    client.penalty.findFirst({
      where: { userId, type: 'BAN', revokedAt: null },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    }),
  ]);
  const bannedAt = activeBan ? activeBan.startedAt : null;
  await client.user.update({
    where: { id: userId },
    data: { warningCount, muteCount, bannedAt },
  });
  return { warningCount, muteCount, bannedAt };
}

/** 管理员撤销误处罚（事务内）：置位撤销字段、回退计数恢复权限、通知用户、写审计日志 */
export async function revokePenaltyById(
  penaltyId: string,
  ctx: RevokePenaltyContext,
  tx: Prisma.TransactionClient,
): Promise<PenaltyDto> {
  const penalty = await tx.penalty.findUnique({ where: { id: penaltyId } });
  if (!penalty) throw new HttpError(404, 'NOT_FOUND', '处罚记录不存在');
  if (penalty.revokedAt) throw new HttpError(409, 'CONFLICT', '该处罚已被撤销，请刷新后查看');

  const now = new Date();
  const claimed = await tx.penalty.updateMany({
    where: { id: penalty.id, revokedAt: null },
    data: { revokedAt: now, revokedById: ctx.operatorId, revokeReason: ctx.reason },
  });
  if (claimed.count === 0) throw new HttpError(409, 'CONFLICT', '该处罚已被撤销，请刷新后查看');

  const counters = await recomputeUserPenaltyCounters(penalty.userId, tx);

  await tx.notification.create({
    data: {
      userId: penalty.userId,
      type: 'PENALTY_REVOKED',
      title: '处罚撤销通知',
      content: `您于 ${formatDateTimeCN(penalty.startedAt)} 生效的${PENALTY_TYPE_LABELS[penalty.type as PenaltyType] ?? penalty.type}处罚已被站方撤销（原因：${ctx.reason}），对应的限制已解除。`,
    },
  });

  await recordAudit(
    {
      actorId: ctx.operatorId,
      actorNickname: ctx.operatorNickname,
      action: 'penalty.revoke',
      targetType: 'Penalty',
      targetId: penalty.id,
      detail: {
        penaltyUserId: penalty.userId,
        penaltyType: penalty.type,
        revokeReason: ctx.reason,
        recomputed: {
          warningCount: counters.warningCount,
          muteCount: counters.muteCount,
          bannedAt: counters.bannedAt ? counters.bannedAt.toISOString() : null,
        },
      },
    },
    tx,
  );

  const updated = await tx.penalty.findUnique({ where: { id: penalty.id }, include: PENALTY_INCLUDE });
  return serializePenalty(updated!);
}

/** 用户处罚状态（实时）：累计有效计数 + 当前生效禁言与剩余时长 + 封号状态 */
export async function getPenaltyStatus(userId: string): Promise<PenaltyStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { warningCount: true, muteCount: true, bannedAt: true },
  });
  if (!user) throw new HttpError(404, 'NOT_FOUND', '用户不存在');
  const mute = await getActiveMute(userId);
  return {
    warningCount: user.warningCount,
    muteCount: user.muteCount,
    banned: Boolean(user.bannedAt),
    bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
    activeMute: mute?.endsAt
      ? {
          id: mute.id,
          startedAt: mute.startedAt.toISOString(),
          endsAt: mute.endsAt.toISOString(),
          remainingSeconds: Math.max(0, Math.floor((mute.endsAt.getTime() - Date.now()) / 1000)),
        }
      : null,
  };
}

export function serializePenalty(row: PenaltyRow): PenaltyDto {
  return {
    id: row.id,
    userId: row.userId,
    userUid: row.user?.uid ?? null,
    userNickname: row.user?.nickname ?? null,
    type: row.type as PenaltyType,
    durationDays: row.durationDays,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    reason: row.reason,
    evidenceReportIds: JSON.parse(row.evidenceReportIds) as string[],
    operatorId: row.operatorId,
    operatorNickname: row.operator?.nickname ?? null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedByNickname: row.revokedBy?.nickname ?? null,
    revokeReason: row.revokeReason ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 小黑屋公示条目：仅暴露 uid、类型、时长、起止时间与事由 */
export function serializePublicPenalty(row: {
  id: string;
  type: string;
  durationDays: number | null;
  startedAt: Date;
  endsAt: Date | null;
  reason: string;
  user: { uid: number | null } | null;
}) {
  return {
    id: row.id,
    userUid: row.user?.uid ?? null,
    type: row.type as PenaltyType,
    durationDays: row.durationDays,
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    reason: row.reason,
  };
}
