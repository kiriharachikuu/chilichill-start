import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import { HttpError } from '../lib/errors';
import { prisma } from '../prisma';
import {
  OAUTH_APP_STATUSES,
  OAUTH_CODE_TTL_SECONDS,
  OAUTH_TOKEN_TTL_SECONDS,
  type OAuthAppStatus,
  type OAuthBasicUser,
} from '@spaceport/shared';

// ===== 摘要与随机串生成 =====

function sha256(value: string): string {
  return createHash('sha256').update(`${value}:${env.jwtSecret}`).digest('hex');
}

function hashEquals(input: string, stored: string): boolean {
  const left = Buffer.from(sha256(input));
  const right = Buffer.from(stored);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseRedirectUris(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((uri): uri is string => typeof uri === 'string') : [];
  } catch {
    return [];
  }
}

export function isOAuthAppStatus(value: string): value is OAuthAppStatus {
  return (OAUTH_APP_STATUSES as readonly string[]).includes(value);
}

// ===== 接入应用凭证 =====

/** 生成 client_id（sp_ 前缀 + 16 字节 hex）与 client_secret（32 字节 hex） */
export function generateClientCredentials(): { clientId: string; clientSecret: string; clientSecretHash: string } {
  const clientId = `sp_${randomBytes(12).toString('hex')}`;
  const clientSecret = randomBytes(32).toString('hex');
  return { clientId, clientSecret, clientSecretHash: sha256(clientSecret) };
}

/** 校验 client_id/secret：应用存在、未禁用、secret 摘要比对；失败统一报 INVALID_CLIENT，不泄露细节 */
export async function verifyClient(clientId: string, clientSecret: string) {
  const app = await prisma.oAuthApp.findUnique({ where: { clientId } });
  if (!app || app.status !== 'ACTIVE' || !hashEquals(clientSecret, app.clientSecretHash)) {
    throw new HttpError(401, 'INVALID_CLIENT', 'client_id 或 client_secret 不正确');
  }
  return app;
}

// ===== 授权码 =====

/** 签发授权码：随机串落库摘要，10 分钟有效；明文返回给调用方用于拼接回调 */
export async function issueAuthorizationCode(appId: string, userId: string, redirectUri: string): Promise<string> {
  const code = randomBytes(32).toString('hex');
  await prisma.oAuthAuthorizationCode.create({
    data: {
      appId,
      userId,
      codeHash: sha256(code),
      redirectUri,
      expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_SECONDS * 1000),
    },
  });
  return code;
}

/**
 * 消费授权码：校验有效性（存在/未消费/未过期/redirectUri 一致）后原子置 consumedAt 防并发重放。
 * 任何失败统一报 INVALID_GRANT，不区分具体原因（避免向持有 code 的攻击方泄露细节）。
 */
export async function consumeAuthorizationCode(
  appId: string,
  code: string,
  redirectUri: string,
): Promise<{ userId: string }> {
  const codeHash = sha256(code);
  const record = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash } });

  const valid =
    record &&
    record.appId === appId &&
    record.redirectUri === redirectUri &&
    !record.consumedAt &&
    record.expiresAt.getTime() > Date.now();

  if (!record || !valid) {
    throw new HttpError(400, 'INVALID_GRANT', '授权码无效或已过期');
  }

  const consumed = await prisma.oAuthAuthorizationCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw new HttpError(400, 'INVALID_GRANT', '授权码无效或已过期');
  }

  return { userId: record.userId };
}

// ===== 访问令牌 =====

/** 签发站外访问令牌：不透明随机串，7 天有效，可吊销 */
export async function issueAccessToken(appId: string, userId: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const accessToken = randomBytes(32).toString('hex');
  await prisma.oAuthAccessToken.create({
    data: {
      appId,
      userId,
      tokenHash: sha256(accessToken),
      expiresAt: new Date(Date.now() + OAUTH_TOKEN_TTL_SECONDS * 1000),
    },
  });
  return { accessToken, expiresIn: OAUTH_TOKEN_TTL_SECONDS };
}

/** 站外令牌可获取的用户基础信息（id/uid/昵称/头像） */
export function toBasicUser(user: {
  id: string;
  uid: number | null;
  nickname: string;
  avatarUrl: string | null;
}): OAuthBasicUser {
  return {
    id: user.id,
    uid: user.uid,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

/**
 * 解析访问令牌：校验存在/未吊销/未过期，并实时校验应用未禁用、用户未封号未注销
 * （后台禁用应用或封禁用户后，站外令牌立即失效，与站内鉴权策略一致）。
 */
export async function resolveAccessToken(token: string): Promise<{
  app: { id: string; name: string; clientId: string };
  user: OAuthBasicUser;
}> {
  const record = await prisma.oAuthAccessToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      app: { select: { id: true, name: true, clientId: true, status: true } },
      user: { select: { id: true, uid: true, nickname: true, avatarUrl: true, bannedAt: true } },
    },
  });

  if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'INVALID_TOKEN', '访问令牌无效或已过期');
  }
  if (record.app.status !== 'ACTIVE') {
    throw new HttpError(401, 'INVALID_TOKEN', '该接入应用已被禁用');
  }
  if (!record.user || record.user.bannedAt) {
    throw new HttpError(401, 'INVALID_TOKEN', '该账号状态异常');
  }

  return {
    app: { id: record.app.id, name: record.app.name, clientId: record.app.clientId },
    user: toBasicUser(record.user),
  };
}
