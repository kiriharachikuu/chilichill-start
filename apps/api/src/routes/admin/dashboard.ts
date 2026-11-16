import type { FastifyInstance } from 'fastify';
import type { AdminAuditLogItem } from '@spaceport/shared';
import { serializeSubmission } from '../../lib/serialize';
import { prisma } from '../../prisma';

const RECENT_LIMIT = 6;

/**
 * 后台仪表盘：一次性聚合站点运营统计。
 * 审核组（MODERATOR）与管理员都可访问 —— 统计均为聚合计数与公开运营数据，
 * 便于审核组进入控制舱时先看待办概览。
 */
export function adminDashboardRoutes(app: FastifyInstance) {
  app.get('/api/admin/dashboard', { preHandler: [app.requireReviewer] }, async () => {
    // 今日 0 点（服务器本地时区），用于「今日新增投稿」
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const [
      pendingSubmissions,
      totalSubmissions,
      todaySubmissions,
      approvedSubmissions,
      rejectedSubmissions,
      groups,
      sites,
      activities,
      galleryImages,
      galleryLikes,
      galleryComments,
      users,
      pendingReports,
      pendingRows,
      auditRows,
    ] = await Promise.all([
      prisma.submission.count({ where: { status: 'PENDING' } }),
      prisma.submission.count(),
      prisma.submission.count({ where: { createdAt: { gte: dayStart } } }),
      prisma.submission.count({ where: { status: 'APPROVED' } }),
      prisma.submission.count({ where: { status: 'REJECTED' } }),
      prisma.group.count({ where: { published: true } }),
      prisma.site.count({ where: { published: true } }),
      prisma.activity.count({ where: { published: true } }),
      prisma.galleryImage.count({ where: { published: true } }),
      prisma.galleryLike.count(),
      prisma.galleryComment.count(),
      prisma.user.count(),
      prisma.commentReport.count({ where: { status: 'PENDING' } }),
      // 待审核队列最新的几条：desc 保证刚提交的修改/新投稿置顶，处理最及时
      prisma.submission.findMany({
        where: { status: 'PENDING' },
        include: { submitter: { select: { id: true, nickname: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
      }),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: RECENT_LIMIT }),
    ]);

    const recentAuditLogs: AdminAuditLogItem[] = auditRows.map((row) => ({
      id: row.id,
      actorNickname: row.actorNickname,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      stats: {
        pendingSubmissions,
        totalSubmissions,
        todaySubmissions,
        approvedSubmissions,
        rejectedSubmissions,
        groups,
        sites,
        activities,
        galleryImages,
        galleryLikes,
        galleryComments,
        users,
        pendingReports,
      },
      recentSubmissions: pendingRows.map((row) => serializeSubmission(row, null, row.submitter)),
      recentAuditLogs,
    };
  });
}
