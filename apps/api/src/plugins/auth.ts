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
    const role = await freshRole(user.sub);
    if (role !== 'ADMIN') {
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
    const role = await freshRole(user.sub);
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      throw new HttpError(403, 'FORBIDDEN', '需要审核组权限');
    }
    request.user = { ...user, role };
  };

  app.decorate('authenticate', authenticate);
  app.decorate('optionalAuthenticate', optionalAuthenticate);
  app.decorate('requireAdmin', requireAdmin);
  app.decorate('requireReviewer', requireReviewer);
}
