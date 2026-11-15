import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { HttpError } from '../lib/errors';
import { prisma } from '../prisma';

export interface AuthUser {
  sub: string;
  role: string;
  nickname?: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser | null;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireReviewer: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
  }
  return request.user;
}

// 实时读取数据库中的角色：JWT 里的 role 只是签发快照，
// 站长在后台调整用户组后需即时生效，避免旧 token 权限残留。
export async function freshRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role ?? null;
}

/**
 * 读取角色并记录校验失败详情：数据库异常时返回 503 而不是笼统 500，
 * 且绝不把数据库异常当作“无权限”处理——避免合法权限用户被误拒。
 */
async function loadRoleWithAudit(request: FastifyRequest, userId: string): Promise<string | null> {
  try {
    return await freshRole(userId);
  } catch (error) {
    request.log.error(
      {
        err: error,
        userId,
        url: request.url,
        method: request.method,
        ip: request.ip,
      },
      '[权限校验] 读取用户角色失败（数据库异常），拒绝判定为服务暂时不可用',
    );
    throw new HttpError(503, 'SERVICE_UNAVAILABLE', '权限校验暂时不可用，请稍后再试');
  }
}

export function registerAuthPlugin(app: FastifyInstance) {
  const authenticate = async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    }

    if (!request.user) {
      throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    }
  };

  const optionalAuthenticate = async (request: FastifyRequest) => {
    request.user = null;
    const token = request.cookies?.spaceport_token;
    if (!token) {
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      request.user = null;
    }
  };

  const requireAdmin = async (request: FastifyRequest) => {
    await authenticate(request);
    const user = request.user;
    if (!user) {
      throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    }
    const role = await loadRoleWithAudit(request, user.sub);
    if (role !== 'ADMIN') {
      request.log.warn(
        { userId: user.sub, role: role ?? '用户不存在', url: request.url, method: request.method, ip: request.ip },
        '[权限校验] 非管理员访问管理接口被拒绝',
      );
      throw new HttpError(403, 'FORBIDDEN', '需要管理员权限');
    }
    // 让后续 handler 拿到实时角色
    request.user = { ...user, role };
  };

  // 审核组：ADMIN 或 MODERATOR，均可处理评论举报与投稿审核
  const requireReviewer = async (request: FastifyRequest) => {
    await authenticate(request);
    const user = request.user;
    if (!user) {
      throw new HttpError(401, 'UNAUTHORIZED', '请先登录');
    }
    const role = await loadRoleWithAudit(request, user.sub);
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      request.log.warn(
        { userId: user.sub, role: role ?? '用户不存在', url: request.url, method: request.method, ip: request.ip },
        '[权限校验] 非审核组成员访问审核接口被拒绝',
      );
      throw new HttpError(403, 'FORBIDDEN', '需要审核组权限');
    }
    request.user = { ...user, role };
  };

  app.decorate('authenticate', authenticate);
  app.decorate('optionalAuthenticate', optionalAuthenticate);
  app.decorate('requireAdmin', requireAdmin);
  app.decorate('requireReviewer', requireReviewer);
}
