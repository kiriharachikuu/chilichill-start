-- AlterTable
ALTER TABLE "Group" ADD COLUMN "school" TEXT;

-- 数据迁移：旧「线上功能群」并入「综合粉丝群」，并按新规则补齐大区字段
UPDATE "Group" SET "type" = 'GENERAL', "regionCode" = 'OTHER', "regionName" = '待定' WHERE "type" = 'ONLINE';

-- 存量投稿 payload 中的 ONLINE 同步改写，避免审核 apply 时校验失败
UPDATE "Submission" SET "payload" = json_set("payload", '$.type', 'GENERAL')
  WHERE "entityType" = 'GROUP' AND json_extract("payload", '$.type') = 'ONLINE';
