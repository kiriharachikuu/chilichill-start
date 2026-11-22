import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { oauthAuthorizeConfirmSchema } from '@spaceport/shared';
import { HttpError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { requireUser } from '../plugins/auth';
import { prisma } from '../prisma';
import {
  consumeAuthorizationCode,
  issueAccessToken,
  issueAuthorizationCode,
  resolveAccessToken,
  toBasicUser,
  verifyClient,
} from '../services/oauth';

const authorizeQuerySchema = z.object({
  client_id: z.string().trim().min(1, '缺少 client_id'),
  redirect_uri: z.string().trim().min(1, '缺少 redirect_uri'),
  state: z.string().min(1, '缺少 state').max(200, 'state 过长'),
  scope: z.string().optional(),
});

// 向回调地址追加参数（回调可能自带 query，用 URL 处理避免破坏既有参数）
function appendQuery(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function oauthRoutes(app: FastifyInstance) {
  // OAuth2 规范要求 token 端点接受 application/x-www-form-urlencoded（第三方服务端默认编码），
  // Fastify 默认只解析 JSON，这里为本模块补一个解析器，统一转成对象后走同一套 zod 校验
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body, done) => {
      const params = new URLSearchParams(String(body));
      const payload: Record<string, string> = {};
      for (const [key, value] of params.entries()) {
        payload[key] = value;
      }
      done(null, payload);
    },
  );

  // 授权页信息：校验 client_id / redirect_uri / state，应用存在且启用、回调精确命中白名单才返回应用信息。
  // 非法参数直接 400 JSON，绝不 302 重定向（防止开放重定向）。
  app.get('/api/oauth/authorize', async (request) => {
    const query = authorizeQuerySchema.parse(request.query ?? {});

    const app_ = await prisma.oAuthApp.findUnique({ where: { clientId: query.client_id } });
    if (!app_ || app_.status !== 'ACTIVE') {
      throw new HttpError(400, 'INVALID_CLIENT', '接入应用不存在或已被禁用');
    }

    const whitelist: string[] = JSON.parse(app_.redirectUris);
    if (!whitelist.includes(query.redirect_uri)) {
      throw new HttpError(400, 'INVALID_REDIRECT_URI', '回调地址未在应用白名单中注册');
    }

    return {
      app: {
        clientId: app_.clientId,
        name: app_.name,
        description: app_.description,
        logoUrl: app_.logoUrl,
        homepageUrl: app_.homepageUrl,
      },
      redirectUri: query.redirect_uri,
      state: query.state,
      scope: query.scope ?? 'basic',
    };
  });

  // 授权确认（需登录）：同意则签发授权码，拒绝则回传 error=access_denied。
  // 返回 JSON { redirectUrl }，由前端执行跳转（fetch 无法跟随跨域 302）。
  app.post('/api/oauth/authorize/confirm', { preHandler: [app.authenticate] }, async (request) => {
    const body = oauthAuthorizeConfirmSchema.parse(request.body ?? {});
    const user = requireUser(request);

    enforceRateLimit({
      key: `oauth:confirm:user:${user.sub}`,
      limit: 30,
      windowMs: 60_000,
      code: 'OAUTH_CONFIRM_LIMIT',
      message: '授权请求过于频繁，请稍后再试',
    });

    const app_ = await prisma.oAuthApp.findUnique({ where: { clientId: body.clientId } });
    if (!app_ || app_.status !== 'ACTIVE') {
      throw new HttpError(400, 'INVALID_CLIENT', '接入应用不存在或已被禁用');
    }
    const whitelist: string[] = JSON.parse(app_.redirectUris);
    if (!whitelist.includes(body.redirectUri)) {
      throw new HttpError(400, 'INVALID_REDIRECT_URI', '回调地址未在应用白名单中注册');
    }

    if (!body.approve) {
      return { redirectUrl: appendQuery(body.redirectUri, { error: 'access_denied', state: body.state }) };
    }

    const code = await issueAuthorizationCode(app_.id, user.sub, body.redirectUri);
    return { redirectUrl: appendQuery(body.redirectUri, { code, state: body.state }) };
  });

  // 令牌交换（第三方服务端调用）：支持 form-urlencoded 与 JSON 两种编码
  app.post('/api/oauth/token', async (request) => {
    enforceRateLimit({
      key: `oauth:token:ip:${request.ip || 'unknown'}`,
      limit: 20,
      windowMs: 60_000,
      code: 'OAUTH_TOKEN_LIMIT',
      message: '令牌交换请求过于频繁，请稍后再试',
    });

    const tokenSchema = z.object({
      grant_type: z.literal('authorization_code', { message: '仅支持 grant_type=authorization_code' }),
      client_id: z.string().trim().min(1, '缺少 client_id'),
      client_secret: z.string().min(1, '缺少 client_secret'),
      code: z.string().min(1, '缺少 code'),
      redirect_uri: z.string().trim().min(1, '缺少 redirect_uri'),
    });
    const body = tokenSchema.parse(request.body ?? {});

    const app_ = await verifyClient(body.client_id, body.client_secret);
    const { userId } = await consumeAuthorizationCode(app_.id, body.code, body.redirect_uri);

    // 令牌签发前再校验用户状态：封号/注销用户不给站外颁发令牌
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, uid: true, nickname: true, avatarUrl: true, bannedAt: true },
    });
    if (!user || user.bannedAt) {
      throw new HttpError(400, 'INVALID_GRANT', '授权码无效或已过期');
    }

    const { accessToken, expiresIn } = await issueAccessToken(app_.id, user.id);
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: 'basic',
      user: toBasicUser(user),
    };
  });

  // 用户基础信息（第三方服务端持 Bearer 令牌调用）
  app.get('/api/oauth/userinfo', async (request) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new HttpError(401, 'INVALID_TOKEN', '缺少 Bearer 访问令牌');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const { user } = await resolveAccessToken(token);
    return { user };
  });
}
