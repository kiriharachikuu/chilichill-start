# 扩展指南

本文面向后续接入画廊、音乐厅等模块的开发者，说明如何在不改动通用投稿与审核内核的前提下新增一种内容实体。所有路径与 API 名均与当前代码一致。

## 1. 总体原则

- **实体注册表**：`apps/api/src/modules/entities/registry.ts` 定义 `EntityHandler` 契约，`registerEntity` 按 `entityType` 字符串注册校验器与落地器，`getEntity` 在运行时按类型取用。
- **共享 schema**：内容字段的类型、枚举与 Zod 校验集中在 `packages/shared/src/index.ts`，前后端共用。
- **通用 Submission 审核**：新建与修改都写入 `Submission`，审核通过后才由 `apply` 写线上表；不为新模块单独造审核流程。
- **存储适配器**：`apps/api/src/services/storage/index.ts` 的 `getStorage()` 按环境变量在本地与 COS 之间切换，新模块只保存返回的 URL。
- **模块开关**：后端 `apps/api/src/routes/meta.ts` 的 `MODULES` 与前端 `apps/web/src/config/modules.tsx` 共同决定导航是否展示。

## 2. 新实体接入步骤

按以下顺序执行：

1. **共享层**：在 `packages/shared/src/index.ts` 的 `ENTITY_TYPES` 增加类型，并同步 `ENTITY_TYPE_LABELS`；新增 payload Zod schema 与对应 TS 接口；为新增的枚举补充 `*_LABELS` 映射（现有 `ENTITY_TYPE_LABELS`、`GROUP_TYPE_LABELS`、`SUBMISSION_STATUS_LABELS`），标签展示沿用 `Tag` 接口与后台标签配置。
2. **数据模型**：在 `apps/api/prisma/schema.prisma` 新增实体模型、标签连接表与索引，执行迁移（`npm run db:migrate`）。SQLite 不支持 enum，枚举字段用 `String` 存储，取值仍由 shared 约束。
3. **实体处理器**：新建 `apps/api/src/modules/entities/<entity>.ts`，按 `EntityHandler` 契约实现 `parsePayload`、`loadTarget`、`apply(tx, ctx, payload)`、`serializeTarget`，文件末尾调用 `registerEntity({ entityType, label, ... })`；并在 `apps/api/src/modules/entities/index.ts` 增加 `import './<entity>'`。**注册依赖 import 副作用**，只导出 handler 而不 import 不会生效，运行时 `getEntity` 会抛 `UNSUPPORTED_ENTITY`。
4. **接口**：参照 `apps/api/src/routes/groups.ts`、`apps/api/src/routes/sites.ts` 新增公开查询路由（如 `GET /api/gallery`、`GET /api/gallery/:id`），并在 `apps/api/src/app.ts` 中调用注册函数。新建/修改投稿直接复用现有 `POST /api/submissions`（在 `apps/api/src/routes/submissions.ts` 中，提交时只做 `parsePayload` 与目标预览，不写线上表）；审核直接复用 `POST /api/admin/submissions/:id/approve` 与 `.../reject`（`apps/api/src/routes/admin/review.ts`），不要新建审核逻辑。
5. **模块开关（后端）**：在 `apps/api/src/routes/meta.ts` 的 `MODULES` 中把对应模块 `enabled` 置为 `true`（`gallery`、`music` 已有占位项）。如需在 `/api/meta` 返回统计数，同时扩展 `packages/shared` 的 `MetaResponse.stats` 与查询。
6. **模块开关（前端）**：在 `apps/web/src/config/modules.tsx` 将对应模块 `enabled` 置为 `true`，在 `apps/web/src/App.tsx` 增加路由与页面，并在 `apps/web/src/pages/SubmitPage.tsx` 及 `apps/web/src/lib/submissionForms.ts` 中补充新实体的表单分支与 payload 组装。

## 3. EntityHandler 契约

定义于 `apps/api/src/modules/entities/registry.ts`：

| 成员 | 签名 | 说明 |
| --- | --- | --- |
| `entityType` | `string` | 实体类型标识，必须与 `ENTITY_TYPES` 中的值一致，作为注册表键 |
| `label` | `string` | 展示用中文名，如「画廊作品」 |
| `parsePayload` | `(payload: unknown) => unknown` | 用 shared 的 Zod schema 校验并返回规范化 payload；校验失败必须抛 `HttpError(400, 'VALIDATION_ERROR', message)` |
| `loadTarget` | `(client: PrismaClient \| Prisma.TransactionClient, id: string) => Promise<unknown \| null>` | 按 id 读取线上目标（含标签等关联），不存在返回 `null`；用于 UPDATE 投稿预览与投稿详情回显 |
| `apply` | `(tx: Prisma.TransactionClient, ctx: { mode: string; targetId: string \| null }, payload: unknown) => Promise<{ targetId: string }>` | 在审核事务内落库。必须使用传入的 `tx`，不能在事务外直接调用 `prisma`；UPDATE 模式必须校验 `ctx.targetId` 对应记录存在（不存在抛 404），返回 `{ targetId }` |
| `serializeTarget` | `(target: unknown) => unknown` | 把 Prisma 查询结果转成 shared 接口形状，供投稿列表/详情展示 `target` |

`ctx.mode` 取值为 `CREATE` / `UPDATE`，由 `Submission.mode` 传入。注册表未命中时 `getEntity` 抛 `HttpError(400, 'UNSUPPORTED_ENTITY', '不支持的内容类型')`。

## 4. 通用审核机制与注意点

### 4.1 审核通过流程

`apps/api/src/routes/admin/review.ts` 的 `/api/admin/submissions/:id/approve`：

1. 在 `prisma.$transaction` 内读取投稿，再用 `tx.submission.updateMany({ where: { id, status: 'PENDING' }, ... })` 条件更新抢占 `PENDING`；`count === 0` 时抛 `HttpError(409, 'CONFLICT', '该投稿已被处理')`，因此重复审核返回 409。
2. 取 `payloadOverride`（审核时修正后的 payload）或解析 `submission.payload`，调用 `handler.parsePayload`。
3. 调用 `handler.apply(tx, { mode, targetId }, normalized)` 写线上表。
4. 事务内再更新投稿：`targetId` 统一写入 `applied.targetId`；**当前实现只会为 `GROUP` / `SITE` 写 `groupTargetId` / `siteTargetId` 关系字段**（`review.ts` 中 `groupTargetId: submission.entityType === 'GROUP' ? applied.targetId : null`、`siteTargetId: ... === 'SITE' ? ... : null`）。

创建投稿时，`apps/api/src/routes/submissions.ts` 的 `POST /api/submissions` 同样只对 `GROUP` / `SITE` 写这两个关系字段，其余实体为 `null`。

### 4.2 新实体的目标回读

历史与目标回读走 `apps/api/src/lib/target.ts` 的 `loadTargetFor(entityType, targetId)`：它通过 `getEntity` 动态取 handler，调用 `loadTarget` 后再 `serializeTarget`；任何异常都吞掉并返回 `null`。因此新实体只要正确注册 handler，就能在「我的投稿」、审核列表与详情中回显目标，无需修改 `target.ts`。

### 4.3 需要独立外键关系时

如果新实体希望在 `Submission` 上保留独立关系字段（例如便于按作品统计或级联删除），需要同步修改：

- `apps/api/prisma/schema.prisma`：给 `Submission` 增加 `galleryTargetId String?` 及 `gallery GalleryArtwork? @relation(...)`，并给实体模型加反向 `submissions Submission[]`。
- `apps/api/src/routes/submissions.ts`：创建投稿时补该字段映射。
- `apps/api/src/routes/admin/review.ts`：approve 的最终 `tx.submission.update` 中补该字段映射。
- 如后台需要按实体管理内容，`apps/api/src/routes/admin/content.ts` 目前只有 `groups` / `sites` 的列表、上下线与删除接口，新实体需自行新增对应接口与级联删除逻辑。

若不改上述映射，新实体也能完整工作，只是关系字段为空，依靠通用 `targetId` 解析。

### 4.4 驳回与重提

- 驳回 `/api/admin/submissions/:id/reject` 要求 `reviewNote` 为 2–200 字，同样用条件 `updateMany` 抢占 `PENDING`，重复处理返回 409；线上内容保持不变。
- 重新提交 `/api/submissions/:id/resubmit` 仅允许投稿人本人操作、且仅限 `REJECTED` 状态；会重新 `parsePayload`，把状态改回 `PENDING` 并清空审核人、审核时间与驳回原因。新实体无需额外代码。

## 5. 标签体系复用

`Tag.scope` 在 SQLite 中是字符串，取值由 `packages/shared` 的 `TAG_SCOPES`（当前 `GROUP` / `SITE` / `BOTH`）约束。

- **推荐做法**：新模块直接复用 `BOTH` 标签，或给每类内容建一组 `scope` 为某值的标签。`BOTH` 标签会被现有的群、站点查询同时接受。
- **需要独立 scope 时**（如新增 `GALLERY`），需同步：
  - `packages/shared/src/index.ts` 的 `TAG_SCOPES`：`apps/api/src/routes/admin/tags.ts` 的 Zod 校验会直接接受新值；`apps/web/src/pages/admin/AdminTagsPage.tsx` 的筛选项由 `TAG_SCOPES` 驱动，但其 `SCOPE_LABELS` 是 `Record<TagScope, string>`，需补新值的中文标签（否则 `typecheck` 报错）；
  - `apps/api/src/routes/meta.ts` 的标签查询（当前写死 `scope: { in: ['GROUP', 'BOTH'] }` 与 `['SITE', 'BOTH']`），为新模块补查询与 `MetaResponse.tags` 字段；
  - `apps/api/src/routes/tags.ts` 的 `scope` 过滤分支；
  - `apps/api/src/services/classification.ts` 的 `assertTagsValid` / `suggestTags`，其 `scope` 参数当前类型为 `'GROUP' | 'SITE'`，需扩展联合类型；
  - `apps/api/src/routes/admin/tags.ts` 的 `_count`（当前只统计 `groups` / `sites`），补新连接表的计数。
- 复用 `BOTH` 且不扩展 scope 时，可在新 handler 中调用 `assertTagsValid(data.tags, 'SITE')`（`BOTH` 标签会通过校验）；语义更清晰的做法仍是扩展其类型。

`GroupTag` / `SiteTag` 是显式连接表（复合主键 + `onDelete: Cascade`）。新实体必须自建连接表，示例：

```prisma
model GalleryArtwork {
  id          String       @id @default(cuid())
  title       String
  imageUrl    String
  description String
  author      String?
  published   Boolean      @default(true)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  tags        GalleryTag[]

  @@index([published])
}

model GalleryTag {
  artworkId String
  tagId     String
  artwork   GalleryArtwork @relation(fields: [artworkId], references: [id], onDelete: Cascade)
  tag       Tag            @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([artworkId, tagId])
}
```

`Tag` 模型还需补反向关系 `galleryWorks GalleryTag[]`。

## 6. 上传复用

`POST /api/uploads`（`apps/api/src/routes/uploads.ts`）：

- 需要登录（`preHandler: [app.authenticate]`）。
- `multipart/form-data`，字段名必须为 `file`。
- 仅允许 png / jpg / jpeg / webp，且不超过 5MB（multipart 限制 + 缓冲区二次校验）。
- 返回 `{ url, key }`。
- 存储由 `getStorage()` 自动选择：四项 COS 配置齐全时走 `apps/api/src/services/storage/cos.ts`，否则走 `apps/api/src/services/storage/local.ts`（写入 `apps/api/public/uploads`，URL 为 `/uploads/<key>`）。

新模块只需把返回的 `url` 存入自己的字段（如画廊 `imageUrl`、音乐厅 `coverUrl` / `audioUrl` 对应的图片封面），**无需修改上传接口或存储层**。前端可直接复用 `apps/web/src/components/ImageUploader.tsx`。

## 7. 示例：画廊（GALLERY）

### 7.1 共享类型

`packages/shared/src/index.ts`：

```ts
export const ENTITY_TYPES = ['GROUP', 'SITE', 'GALLERY', 'MUSIC_TRACK'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  GROUP: 'Q群',
  SITE: '网站',
  GALLERY: '画廊作品',
  MUSIC_TRACK: '音乐作品',
};

export const galleryPayloadSchema = z.object({
  title: z.string().trim().min(1).max(40),
  imageUrl: z.string().trim().min(1).max(300),
  description: z.string().trim().min(5).max(200),
  author: z.string().trim().max(30).optional().nullable(),
  tags: tagIds,
});
export type GalleryPayload = z.infer<typeof galleryPayloadSchema>;
```

模型字段建议：`title`、`imageUrl`（必填，上传返回值）、`description`、`author`、标签连接表、`published`、时间戳。`imageUrl` 若允许外链需在 schema 中限制协议。

### 7.2 Prisma 模型

`apps/api/prisma/schema.prisma` 增加 5 节中的 `GalleryArtwork` / `GalleryTag`，然后执行 `npm run db:migrate`。

### 7.3 实体处理器

新建 `apps/api/src/modules/entities/gallery.ts`，要点：

```ts
import type { Prisma, PrismaClient } from '@prisma/client';
import { galleryPayloadSchema, type GalleryPayload } from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import { assertTagsValid } from '../../services/classification';
import { registerEntity, type EntityApplyContext } from './registry';

const galleryInclude = { tags: { include: { tag: true } } } satisfies Prisma.GalleryArtworkInclude;

function parsePayload(payload: unknown): GalleryPayload {
  const result = galleryPayloadSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('；') || '参数校验失败';
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

async function loadTarget(client: PrismaClient | Prisma.TransactionClient, id: string) {
  return client.galleryArtwork.findUnique({ where: { id }, include: galleryInclude });
}

async function apply(tx: Prisma.TransactionClient, ctx: EntityApplyContext, payload: unknown) {
  const data = payload as GalleryPayload;
  // 复用 BOTH 标签时可按 SITE 校验；若扩展了 TAG_SCOPES，改为对应的 scope 值
  await assertTagsValid(data.tags, 'SITE', tx);

  const fields = {
    title: data.title,
    imageUrl: data.imageUrl,
    description: data.description,
    author: data.author ?? null,
  };
  const tagLinks = [...new Set(data.tags)].map((tagId) => ({ tagId }));

  if (ctx.mode === 'UPDATE') {
    if (!ctx.targetId) {
      throw new HttpError(400, 'VALIDATION_ERROR', '修改投稿缺少目标内容');
    }
    const target = await tx.galleryArtwork.findUnique({ where: { id: ctx.targetId } });
    if (!target) {
      throw new HttpError(404, 'NOT_FOUND', '目标作品不存在');
    }
    await tx.galleryArtwork.update({ where: { id: ctx.targetId }, data: fields });
    await tx.galleryTag.deleteMany({ where: { artworkId: ctx.targetId } });
    await tx.galleryTag.createMany({
      data: tagLinks.map((link) => ({ artworkId: ctx.targetId as string, ...link })),
    });
    return { targetId: ctx.targetId };
  }

  const created = await tx.galleryArtwork.create({ data: fields });
  await tx.galleryTag.createMany({ data: tagLinks.map((link) => ({ artworkId: created.id, ...link })) });
  return { targetId: created.id };
}

function serializeTarget(target: unknown): unknown {
  return serializeGallery(target as GalleryWithTags); // 在 lib/serialize.ts 新增与 serializeGroup 同风格的映射
}

registerEntity({
  entityType: 'GALLERY',
  label: '画廊作品',
  parsePayload,
  loadTarget,
  apply,
  serializeTarget,
});
```

随后在 `apps/api/src/modules/entities/index.ts` 增加 `import './gallery';`。`serializeTarget` 的 Prisma 返回类型与映射函数建议加到 `apps/api/src/lib/serialize.ts`（参考 `GroupWithTags` / `serializeGroup`）。

### 7.4 查询路由

新建 `apps/api/src/routes/gallery.ts`（参考 `apps/api/src/routes/sites.ts` 的分页、标签 facet 与 `published: true` 过滤），提供 `GET /api/gallery`、`GET /api/gallery/:id`，并在 `apps/api/src/app.ts` 中调用注册函数。

投稿与审核完全复用：

- 新建：`POST /api/submissions`，body 为 `{ entityType: 'GALLERY', mode: 'CREATE', payload }`。
- 修改：`POST /api/submissions`，body 为 `{ entityType: 'GALLERY', mode: 'UPDATE', targetId, payload }`。
- 审核：`POST /api/admin/submissions/:id/approve` / `.../reject`。

### 7.5 模块开关

- 后端：`apps/api/src/routes/meta.ts` 中 `gallery` 项 `enabled: true`。
- 前端：`apps/web/src/config/modules.tsx` 中 `gallery` 项 `enabled: true`；`apps/web/src/App.tsx` 增加 `/gallery` 路由与页面组件（新建 `apps/web/src/pages/GalleryPage.tsx`）；`apps/web/src/pages/SubmitPage.tsx` 增加 `GALLERY` 分支，表单状态可参考 `apps/web/src/lib/submissionForms.ts` 的 `SiteFormState` 写法新增 `GalleryFormState`。

## 8. 示例：音乐厅（MUSIC_TRACK）

与画廊同构，差异在字段与命名：

- 共享层：`packages/shared/src/index.ts` 增加 `musicTrackPayloadSchema`：

```ts
export const musicTrackPayloadSchema = z.object({
  title: z.string().trim().min(1).max(40),
  artist: z.string().trim().max(40).optional().nullable(),
  audioUrl: z.string().trim().min(1).max(300),
  coverUrl: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().min(5).max(200),
  tags: tagIds,
});
```

- Prisma：`apps/api/prisma/schema.prisma` 增加 `MusicTrack`（`title`、`artist`、`audioUrl`、`coverUrl`、`description`、`published`、时间戳）与 `MusicTrackTag` 连接表，并按需加 `@@index([published])`。
- 处理器：新建 `apps/api/src/modules/entities/music-track.ts`，`entityType: 'MUSIC_TRACK'`，`label: '音乐作品'`，`apply` 写 `musicTrack` 与 `musicTrackTag`，UPDATE 模式校验 `ctx.targetId`；在 `apps/api/src/modules/entities/index.ts` 增加 `import './music-track';`。
- 路由：新建 `apps/api/src/routes/music.ts`，提供 `GET /api/music`、`GET /api/music/:id`，在 `apps/api/src/app.ts` 注册。
- 审核：同样走 `POST /api/submissions` 与 `/api/admin/submissions/:id/approve|reject`。
- 模块开关：后端 `meta.ts` 的 `music` 项 `enabled: true`；前端 `apps/web/src/config/modules.tsx` 的 `music` 项 `enabled: true`，在 `App.tsx` 增加 `/music` 路由与 `apps/web/src/pages/MusicPage.tsx`，投稿表单增加 `MUSIC_TRACK` 分支。

注意实体类型 `MUSIC_TRACK` 与前端模块 key `music` 是两套标识：前者用于投稿与注册表，后者用于导航配置与 `/api/meta`。

## 9. 扩展自查清单

- [ ] 已在 `packages/shared/src/index.ts` 增加 `ENTITY_TYPES`、`ENTITY_TYPE_LABELS`、payload schema 与 TS 接口。
- [ ] 已在 `apps/api/prisma/schema.prisma` 增加实体模型、标签连接表与索引，并完成迁移。
- [ ] 已新建 handler 并在 `apps/api/src/modules/entities/index.ts` 中 import（确认注册副作用生效）。
- [ ] 已新增公开查询路由并在 `apps/api/src/app.ts` 注册；投稿/审核复用现有接口。
- [ ] 已在 `apps/api/src/routes/meta.ts` 的 `MODULES` 启用模块，必要时扩展 `MetaResponse.stats`。
- [ ] 已在 `apps/web/src/config/modules.tsx` 启用模块，并在 `App.tsx`、提交页与表单状态中补齐页面和分支。
- [ ] 标签 scope 已确认：复用 `BOTH`，或已同步 `TAG_SCOPES`、meta 过滤、`/api/tags`、`assertTagsValid` 与后台标签计数。
- [ ] 上传直接复用 `POST /api/uploads`，新模型只保存返回的 `url`。
- [ ] 审核回归通过：CREATE、UPDATE（审核前线上不变）、重复审核 409、驳回原因必填、驳回后重提。
- [ ] `npm run typecheck` 与 `npm run build` 均通过。

## 10. 兼容性约定

- 不要改动 `packages/shared` 中已发布字段的含义或类型；新增字段应保持向后兼容。
- 新增枚举值（`ENTITY_TYPES`、`TAG_SCOPES`、群类型等）必须同步前后端。`ENTITY_TYPES` 会被 `submissionCreateSchema` 与 `apps/api/src/routes/admin/review.ts` 的查询校验直接使用，前端表单与后台筛选也要同步。
- SQLite 中枚举以字符串存储，数据库不校验取值；新增值必须同时在 shared 与迁移/种子中保持一致。
- 实体注册靠 `apps/api/src/modules/entities/index.ts` 的 import 触发，遗漏会导致运行期 `UNSUPPORTED_ENTITY`，类型检查不会报错。
