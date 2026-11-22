import type { FastifyInstance } from 'fastify';
import { oauthAppInputSchema } from '@spaceport/shared';
import { HttpError, isUniqueViolation } from '../../lib/errors';
import { recordAudit } from '../../lib/audit';
import { requireUser } from '../../plugins/auth';
import { prisma } from '../../prisma';
import { generateClientCredentials } from '../../services/oauth';

function toOAuthApp(app_: {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  clientId: string;
  redirectUris: string;
  status: string;
  createdAt: Date;
}) {
  let redirectUris: string[] = [];
  try {
    const parsed: unknown = JSON.parse(app_.redirectUris);
    if (Array.isArray(parsed)) {
      redirectUris = parsed.filter((uri): uri is string => typeof uri === 'string');
    }
  } catch {
    // 存量脏数据兜底：视为空白名单
  }
  return {
    id: app_.id,
    name: app_.name,
    description: app_.description,
    logoUrl: app_.logoUrl,
    homepageUrl: app_.homepageUrl,
    clientId: app_.clientId,
    redirectUris,
    status: app_.status,
    createdAt: app_.createdAt.toISOString(),
  };
}

export function adminOAuthAppsRoutes(app: FastifyInstance) {
  // 接入应用列表（含活跃令牌数统计）
  app.get('/api/admin/oauth-apps', { preHandler: [app.requireAdmin] }, async () => {
    const apps = await prisma.oAuthApp.findMany({
      include: {
        _count: { select: { tokens: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: apps.map((item) => ({
        ...toOAuthApp(item),
        activeTokenCount: item._count.tokens,
      })),
    };
  });

  // 创建应用：clientSecret 明文仅本次响应返回一次，之后只存摘要
  app.post('/api/admin/oauth-apps', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = oauthAppInputSchema.parse(request.body ?? {});
    const { clientId, clientSecret, clientSecretHash } = generateClientCredentials();
    const actor = requireUser(request);

    try {
      const app_ = await prisma.oAuthApp.create({
        data: {
          name: body.name,
          description: body.description,
          logoUrl: body.logoUrl,
          homepageUrl: body.homepageUrl,
          clientId,
          clientSecretHash,
          redirectUris: JSON.stringify(body.redirectUris),
          status: body.status,
          createdById: actor.sub,
        },
      });

      await recordAudit({
        actorId: actor.sub,
        actorNickname: actor.nickname,
        action: 'oauth_app.create',
        targetType: 'OAuthApp',
        targetId: app_.id,
        detail: { name: app_.name, clientId },
      });

      return reply.status(201).send({ item: toOAuthApp(app_), clientSecret });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'CLIENT_ID_CONFLICT', '凭证生成冲突，请重试');
      }
      throw error;
    }
  });

  // 更新应用（禁用立即生效：令牌与授权校验时实时读取 status）
  app.put<{ Params: { id: string } }>(
    '/api/admin/oauth-apps/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = oauthAppInputSchema.parse(request.body ?? {});
      const id = request.params.id;
      const actor = requireUser(request);

      const existing = await prisma.oAuthApp.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '接入应用不存在');
      }

      const app_ = await prisma.oAuthApp.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          logoUrl: body.logoUrl,
          homepageUrl: body.homepageUrl,
          redirectUris: JSON.stringify(body.redirectUris),
          status: body.status,
        },
      });

      await recordAudit({
        actorId: actor.sub,
        actorNickname: actor.nickname,
        action: 'oauth_app.update',
        targetType: 'OAuthApp',
        targetId: id,
        detail: { name: app_.name, status: app_.status, redirectUris: body.redirectUris },
      });

      return { item: toOAuthApp(app_) };
    },
  );

  // 重置密钥：新 secret 明文仅本次响应返回一次
  app.post<{ Params: { id: string } }>(
    '/api/admin/oauth-apps/:id/reset-secret',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const id = request.params.id;
      const actor = requireUser(request);
      const existing = await prisma.oAuthApp.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '接入应用不存在');
      }

      const { clientSecret, clientSecretHash } = generateClientCredentials();
      await prisma.oAuthApp.update({ where: { id }, data: { clientSecretHash } });

      await recordAudit({
        actorId: actor.sub,
        actorNickname: actor.nickname,
        action: 'oauth_app.reset_secret',
        targetType: 'OAuthApp',
        targetId: id,
        detail: { name: existing.name },
      });

      return { clientSecret };
    },
  );

  // 删除应用：授权码与令牌随外键级联清理
  app.delete<{ Params: { id: string } }>(
    '/api/admin/oauth-apps/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;
      const actor = requireUser(request);
      const existing = await prisma.oAuthApp.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '接入应用不存在');
      }

      await prisma.oAuthApp.delete({ where: { id } });

      await recordAudit({
        actorId: actor.sub,
        actorNickname: actor.nickname,
        action: 'oauth_app.delete',
        targetType: 'OAuthApp',
        targetId: id,
        detail: { name: existing.name, clientId: existing.clientId },
      });

      return reply.status(204).send();
    },
  );
}
