import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import bcrypt from 'bcryptjs';
import {
  ROLES,
  profileUpdateSchema,
  type AdminAuditLog,
  type AdminAuditLogListResponse,
} from '@spaceport/shared';
import { z } from 'zod';
import { HttpError, isUniqueViolation } from '../../lib/errors';
import { optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { requireUser } from '../../plugins/auth';
import { POLICY_VERSION, createUserWithUid } from '../auth';
import { prisma } from '../../prisma';

const usersQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const auditLogQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
  action: optionalQueryString,
  actorId: optionalQueryString,
});

const roleChangeSchema = z.object({
  role: z.enum(ROLES, { error: '用户组不合法' }),
});

// 站长代注册新用户：邮箱/密码/昵称为必填，UID 可指定（6 位纯数字）或留空自动分配
const adminCreateUserSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120, '邮箱过长'),
  password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字'),
  uid: z
    .number({ error: 'UID 需为 6 位纯数字' })
    .int('UID 需为 6 位纯数字')
    .min(100000, 'UID 需为 6 位纯数字（100000-999999）')
    .max(999999, 'UID 需为 6 位纯数字（100000-999999）')
    .optional(),
  role: z.enum(ROLES, { error: '用户组不合法' }).optional(),
});

type AuditLogRow = Prisma.AdminAuditLogGetPayload<Record<string, never>>;

function serializeAuditLog(log: AuditLogRow): AdminAuditLog {
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(log.detail);
    if (typeof parsed === 'object' && parsed !== null) detail = parsed as Record<string, unknown>;
  } catch {
    detail = {};
  }
  const result: AdminAuditLog = {
    id: log.id,
    actorId: log.actorId,
    actorNickname: log.actorNickname,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    detail,
    createdAt: log.createdAt.toISOString(),
  };
  return result;
}

export function adminUsersRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = usersQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        include: { _count: { select: { submissions: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const items = users.map((user) => ({
      id: user.id,
      uid: user.uid,
      email: user.email,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      bio: user.bio,
      province: user.province,
      city: user.city,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      submissionCount: user._count.submissions,
    }));

    return { items, total, page, pageSize };
  });

  // 调整单个用户的所属用户组：仅站长可操作，即时生效并记录审计日志
  app.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id/role',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const actor = requireUser(request);
      const body = roleChangeSchema.parse(request.body ?? {});
      const targetId = request.params.id;

      if (targetId === actor.sub) {
        throw new HttpError(400, 'BAD_REQUEST', '不能修改自己的用户组');
      }

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, nickname: true, role: true },
      });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', '用户不存在');
      }
      if (target.role === body.role) {
        throw new HttpError(400, 'BAD_REQUEST', '该用户已在目标用户组中');
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetId },
          data: { role: body.role },
          select: { id: true, nickname: true, role: true },
        });
        await tx.adminAuditLog.create({
          data: {
            actorId: actor.sub,
            actorNickname: actor.nickname ?? '',
            action: 'USER_ROLE_CHANGE',
            targetType: 'USER',
            targetId,
            detail: JSON.stringify({
              from: target.role,
              to: body.role,
              userNickname: target.nickname,
            }),
          },
        });
        return user;
      });

      return { item: updated };
    },
  );

  // 修改用户基本资料（昵称/头像/空间头图/自我介绍/地区）：仅站长可操作，记录审计日志
  app.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id/profile',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const actor = requireUser(request);
      const body = profileUpdateSchema.parse(request.body ?? {});
      const targetId = request.params.id;

      const providedKeys = (Object.keys(body) as Array<keyof typeof body>).filter(
        (key) => body[key] !== undefined,
      );
      if (providedKeys.length === 0) {
        throw new HttpError(400, 'BAD_REQUEST', '未提供任何要修改的资料字段');
      }

      const target = await prisma.user.findUnique({ where: { id: targetId } });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', '用户不存在');
      }

      // 语义与 /api/users/me 一致：字符串字段空串归一为 null；仅记录发生变化的字段
      const normalized = {
        nickname: body.nickname !== undefined ? body.nickname : undefined,
        avatarUrl: body.avatarUrl !== undefined ? body.avatarUrl || null : undefined,
        bannerUrl: body.bannerUrl !== undefined ? body.bannerUrl || null : undefined,
        bio: body.bio !== undefined ? body.bio || null : undefined,
        province: body.province !== undefined ? body.province || null : undefined,
        city: body.city !== undefined ? body.city || null : undefined,
      };

      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const current = {
        nickname: target.nickname,
        avatarUrl: target.avatarUrl,
        bannerUrl: target.bannerUrl,
        bio: target.bio,
        province: target.province,
        city: target.city,
      };
      for (const [key, value] of Object.entries(normalized)) {
        if (value === undefined) continue;
        if (current[key as keyof typeof current] !== value) {
          changes[key] = { from: current[key as keyof typeof current], to: value };
        }
      }
      if (Object.keys(changes).length === 0) {
        return { item: { id: target.id, nickname: target.nickname } };
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetId },
          data: {
            ...(normalized.nickname !== undefined ? { nickname: normalized.nickname } : {}),
            ...(normalized.avatarUrl !== undefined ? { avatarUrl: normalized.avatarUrl } : {}),
            ...(normalized.bannerUrl !== undefined ? { bannerUrl: normalized.bannerUrl } : {}),
            ...(normalized.bio !== undefined ? { bio: normalized.bio } : {}),
            ...(normalized.province !== undefined ? { province: normalized.province } : {}),
            ...(normalized.city !== undefined ? { city: normalized.city } : {}),
          },
          select: { id: true, nickname: true },
        });
        await tx.adminAuditLog.create({
          data: {
            actorId: actor.sub,
            actorNickname: actor.nickname ?? '',
            action: 'USER_PROFILE_UPDATE',
            targetType: 'USER',
            targetId,
            detail: JSON.stringify({
              userNickname: target.nickname,
              changes,
            }),
          },
        });
        return user;
      });

      return { item: updated };
    },
  );

  // 站长代注册新用户：可指定 6 位 UID（留空则自动分配），记录审计日志
  app.post('/api/admin/users', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const actor = requireUser(request);
    const body = adminCreateUserSchema.parse(request.body ?? {});
    const email = body.email.toLowerCase();

    const passwordHash = await bcrypt.hash(body.password, 10);
    const consent = { policyConsentAt: new Date(), policyConsentVersion: POLICY_VERSION };

    let user;
    if (body.uid != null) {
      // 指定 UID：先做明确的冲突校验，再创建（并发竞态仍由唯一约束兜底）
      const [emailTaken, uidTaken] = await Promise.all([
        prisma.user.findUnique({ where: { email }, select: { id: true } }),
        prisma.user.findUnique({ where: { uid: body.uid }, select: { id: true } }),
      ]);
      if (emailTaken) {
        throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册');
      }
      if (uidTaken) {
        throw new HttpError(409, 'UID_TAKEN', '该 UID 已被其他用户使用');
      }
      try {
        user = await prisma.user.create({
          data: {
            email,
            nickname: body.nickname,
            passwordHash,
            uid: body.uid,
            role: body.role ?? 'USER',
            ...consent,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const emailConflict = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (emailConflict) {
            throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册');
          }
          throw new HttpError(409, 'UID_TAKEN', '该 UID 已被其他用户使用');
        }
        throw error;
      }
    } else {
      // 未指定 UID：复用注册流程的自动分配逻辑（取最大 uid + 1）
      user = await createUserWithUid({
        email,
        nickname: body.nickname,
        passwordHash,
        role: body.role ?? 'USER',
        ...consent,
      });
    }

    await prisma.adminAuditLog.create({
      data: {
        actorId: actor.sub,
        actorNickname: actor.nickname ?? '',
        action: 'USER_CREATE',
        targetType: 'USER',
        targetId: user.id,
        detail: JSON.stringify({
          email: user.email,
          uid: user.uid,
          nickname: user.nickname,
          role: user.role,
        }),
      },
    });

    return reply.status(201).send({
      item: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  // 审计日志：用户组调整、投稿审核、举报处理等敏感操作记录
  app.get('/api/admin/audit-logs', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = auditLogQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const response: AdminAuditLogListResponse = {
      items: logs.map(serializeAuditLog),
      total,
      page,
      pageSize,
    };
    return response;
  });
}
