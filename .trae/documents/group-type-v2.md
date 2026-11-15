# 群舱 Q 群分类改造：综合 / 地区 / 院校 / 其他

## Context

用户要求把 Q 群（群舱）分类从现有 `REGION(地区粉丝群) / ONLINE(线上功能群) / OTHER(其他类型)` 三类改为四类：

- **GENERAL 综合**：不选地区，必勾 tag（≥1）
- **REGION 地区**：必选城市（沿用城市选择组件交互）
- **COLLEGE 院校**：必选城市 + 填写学校名称（`school` 为新增字段，自由文本）
- **OTHER 其他**：不选地区，必勾 tag（≥1）；用途说明 purpose 改为**选填**

已确认决策：旧 ONLINE 并入 GENERAL（存量数据迁移，保留其原 tags 天然满足 ≥1）。
城市数据源维持后端 `CityRegionRule` 表（/api/meta 下发），不引入第三方城市库；把 GroupFields 内联的城市选择器抽成独立 `CitySelect` 组件，REGION 与 COLLEGE 共用。

## 规则矩阵（shared zod / API 落库 / 前端校验 三层一致）

| type | city | school | tags(≤8) | purpose | regionCode 落库 |
|---|---|---|---|---|---|
| GENERAL 综合 | 禁 | 禁 | **≥1 必** | 选填 | `OTHER`/待定 |
| REGION 地区 | **必** | 禁 | 选填 | 选填 | `resolveRegion(city)` |
| COLLEGE 院校 | **必** | **必**（trim，1-40 字） | 选填 | 选填 | `resolveRegion(city)` |
| OTHER 其他 | 禁 | 禁 | **≥1 必** | 选填 | `OTHER`/待定 |

## 实施步骤

### 1. packages/shared/src/index.ts
- L3-9：`GROUP_TYPES = ['GENERAL','REGION','COLLEGE','OTHER']`；LABELS：综合粉丝群 / 地区粉丝群 / 院校粉丝群 / 其他类型。
- `Group` 接口（L53-70）加 `school: string | null`。
- `groupPayloadSchema`（L151-184）：加 `school: z.string().trim().min(1,'请填写学校名称').max(40).optional().nullable()`；重写 superRefine：
  - REGION/COLLEGE 且无 city → city 错误；GENERAL/OTHER 却带 city → city 错误
  - COLLEGE 无 school → school 错误；GENERAL/OTHER tags<1 → tags 错误（文案"该类型群需至少选择一个标签"）
  - 删除 OTHER purpose 必填分支（purpose 全类型选填）

### 2. Prisma（apps/api）
- `prisma/schema.prisma` Group 模型加 `school String?`。
- 迁移：migrations 目录已存在（有 init），用
  `npx prisma migrate dev --name group_general_college --create-only`，在生成的 SQL 手工追加数据迁移后重放：
  ```sql
  UPDATE "Group" SET "type"='GENERAL',"regionCode"='OTHER',"regionName"='待定' WHERE "type"='ONLINE';
  UPDATE "Submission" SET "payload"=json_set("payload",'$.type','GENERAL')
    WHERE "entityType"='GROUP' AND json_extract("payload",'$.type')='ONLINE';
  ```
  （注意：`db:migrate` 脚本硬编码 `--name init`，不要用；`json_set/json_extract` SQLite JSON1 默认可用。）
- `prisma/seed.ts`：L341-440 群组种子 ONLINE→GENERAL（保留功能 tags、补 regionCode OTHER/待定）；新增 1-2 个 COLLEGE 示例群（city+regionCode+school）；L606-617 投稿 payload 示例同步更新。seed 为幂等 upsert，跑 `npm run db:seed`。

### 3. apps/api
- `src/modules/entities/group.ts` L39-49 apply 分支改：REGION/COLLEGE → `resolveRegion(city)`（COLLEGE 另落 school）；GENERAL/OTHER → tags≥1 服务端断言（HttpError 400）+ regionCode OTHER/待定；字段清洗 `city = REGION||COLLEGE ? city : null`、`school = COLLEGE ? school : null`。
- `src/routes/groups.ts`：确认 L12-19 type 查询枚举、L135-139 facets 均引用共享 GROUP_TYPES 自动跟随；无需其他改动（tag-suggestions 已核实与 type 无关）。

### 4. apps/web 表单层
- **新建 `src/components/forms/CitySelect.tsx`**：从 GroupFields L70-90（过滤分组逻辑）+ L176-234（搜索框 + 大区分组 chip 单选 UI）抽出。props：`cities / value / onChange / error`；分组标签用共享 `REGIONS`。
- **GroupFields.tsx**：
  - TYPE_OPTIONS 四项（icon/tone 建议：GENERAL `Users`/aurora、REGION `MapPin`/amber、COLLEGE `GraduationCap`/violet、OTHER `MoreHorizontal`/neutral）
  - 显隐：城市选择 → REGION/COLLEGE；学校名称单行输入 → COLLEGE；标签区合并原功能区（L236-260）与自定义区（L361-380）为单一 ≤8 标签池，GENERAL/OTHER 显示"必选"角标且 <1 时红框；purpose 区 → 仅 OTHER 显示、标注选填
  - tag 推荐防抖逻辑（L279-301）不动
- **submissionForms.ts**：`GroupFormState` 加 `school: string`；L65 类型白名单改用 `GROUP_TYPES`；`groupFormFromGroup/FromPayload` 映射 school；`groupPayloadFromForm`：city 仅 REGION/COLLEGE 提交、school 仅 COLLEGE 提交（否则清空）；`validateGroupForm` 按矩阵实现。

### 5. apps/web 展示层
- `GroupCard.tsx`：TYPE_TONES 加 GENERAL/COLLEGE；位置文案 L24-27：COLLEGE → `${city} · ${school}`，GENERAL → '线上'，REGION 维持 regionName·city。
- `GroupDetailPage.tsx`：L25-29 TYPE_TONES、L99-100 Badge、L104/L159 位置文案同规则。
- `GroupsPage.tsx` L23-27 筛选 chips 改 map `GROUP_TYPES`；URL 参数 `?type=ONLINE` 旧链接解析时兜底映射为 GENERAL。

### 6. 一致性自检
对照规则矩阵逐项核对三层（shared superRefine / API apply / validateGroupForm）文案与错误 path 一致；确认 AdminReviewPage 投稿详情展示处补充 school 行。

## 验证

1. `npm run build`（web/shared/api 三包 typecheck 通过）
2. Playwright（headless，127.0.0.1:5173 + 3001）：
   - 四类投稿表单流程：REGION/COLLEGE 缺城市、COLLEGE 缺学校、GENERAL/OTHER 零 tag 均被拦截；合法四类均可提交
   - CitySelect 搜索/分组单选在 REGION 与 COLLEGE 下均工作
   - 列表页：四类 facet 计数与种子一致；COLLEGE 卡片显示 `城市 · 学校`；GENERAL 显示"线上"；旧 `?type=ONLINE` 链接落在综合筛选
   - 管理端审核通过一条 COLLEGE 投稿，确认 school 落库并展示

## 风险

- 存量 PENDING 投稿 payload 内 `type:'ONLINE'`：迁移 SQL 已同步改写，否则审核 apply 时会 400
- dev SQLite 库靠幂等 seed 重置；如 migrate 出现 drift，用 `npm run db:reset` 后重新 seed 兜底
