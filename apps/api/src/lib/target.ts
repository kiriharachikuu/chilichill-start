import { getEntity } from '../modules/entities';
import { prisma } from '../prisma';

export async function loadTargetFor(entityType: string, targetId: string | null): Promise<unknown | null> {
  if (!targetId) {
    return null;
  }

  try {
    const handler = getEntity(entityType);
    const target = await handler.loadTarget(prisma, targetId);
    return target ? handler.serializeTarget(target) : null;
  } catch (error) {
    // 目标加载失败不应导致整个接口 5xx，记录后按“无目标”处理
    console.error(`[target] 加载 ${entityType}/${targetId} 失败:`, error);
    return null;
  }
}

/**
 * 批量加载投稿列表的目标内容（避免逐条 N+1）。
 * 键为 targetId；加载失败或目标缺失的条目不进 Map，调用方取不到按 null 处理。
 */
export async function loadTargetsFor(
  submissions: { entityType: string; targetId: string | null }[],
): Promise<Map<string, unknown>> {
  const idsByType = new Map<string, string[]>();
  for (const submission of submissions) {
    if (!submission.targetId) {
      continue;
    }
    const ids = idsByType.get(submission.entityType);
    if (ids) {
      if (!ids.includes(submission.targetId)) {
        ids.push(submission.targetId);
      }
    } else {
      idsByType.set(submission.entityType, [submission.targetId]);
    }
  }

  const targets = new Map<string, unknown>();
  await Promise.all(
    [...idsByType.entries()].map(async ([entityType, ids]) => {
      try {
        const handler = getEntity(entityType);
        const rows = await handler.loadTargets(prisma, ids);
        for (const [id, row] of rows) {
          if (row) {
            targets.set(id, handler.serializeTarget(row));
          }
        }
      } catch (error) {
        // 实体类型未注册等异常记录后忽略，列表页该条目表现为无目标
        console.error(`[target] 批量加载 ${entityType} 目标失败:`, error);
      }
    }),
  );
  return targets;
}
