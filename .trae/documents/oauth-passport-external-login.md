# 通行证站外授权登录（OAuth2 接入）实施计划

## Summary

为本站（厚嘴唇空间站通行证）新增标准 **OAuth2 授权码模式** 的站外授权登录能力：其他网站可作为「接入应用」通过本站 API 完成登录授权。包含三部分：

1. **数据层**：Prisma 新增 `OAuthApp` / `OAuthAuthorizationCode` / `OAuthAccessToken` 三张表
2. **API 层**：公开 OAuth2 端点（authorize / confirm / token / userinfo）+ 管理后台接入应用 CRUD
3. **前端层**：用户授权确认页 + 管理后台「接入应用」管理页

已确认决策：标准 OAuth2 授权码模式；应用由管理员在后台创建管理；第三方仅获取基础信息（id/uid/昵称/头像）。

## Current State Analysis

- 单体 monorepo：`apps/api`（Fastify + Prisma 7 + SQLite，纯 TS ESM）+ `apps/web`（React + Vite）+ `packages/shared`（zod schema/常量）
- 现有认证：JWT Cookie（`spaceport_token`），插件在 [apps/api/src/plugins/auth.ts](file:///e:/code/chilichill-start/apps/api/src/plugins/auth.ts)（`authenticate` / `optionalAuthenticate` / `requireAdmin`），登录/注册在 [apps/api/src/routes/auth.ts](file:///e:/code/chilichill-start/apps/api/src/routes/auth.ts)（`issueToken`、封号拦截、限流模式可复用）
- 路由注册集中在 [apps/api/src/app.ts](file:///e:/code/chilichill-start/apps/api/src/app.ts)；Prisma schema 在 [apps/api/prisma/schema.prisma](file:///e:/code/chilichill-start/apps/api/prisma/schema.prisma)（SQLite 无 enum，字符串 + shared 常量约束）
- 后台页面模式：`AdminXxxPage.tsx` + [App.tsx](file:///e:/code/chilichill-start/apps/web/src/App.tsx) lazy 路由 + [AdminLayout.tsx](file:///e:/code/chilichill-start/apps/web/src/pages/admin/AdminLayout.tsx) 导航（权限项用 `PERMISSIONS`）
- 限流：[apps/api/src/lib/rate-limit.ts](file:///e:/code/chilichill-start/apps/api/src/lib/rate-limit.ts) 的 `enforceRateLimit`
- CORS：生产默认拒绝跨域；token 交换是服务端对服务端，无需为第三方开 CORS；userinfo 同样由第三方服务端调用

## Proposed Changes

### 1. 数据层 — [apps/api/prisma/schema.prisma](file:///e:/code/chilichill-start/apps/api/prisma/schema.prisma)

新增三个模型（沿用 SQLite 字符串枚举约定，注释说明取值）：

```prisma
// 站外接入应用：由管理员在后台创建，第三方网站凭 client_id/secret 走 OAuth2 授权码登录
model OAuthApp {
  id              String    @id @default(cuid())
  name            String
  description     String?
  logoUrl         String?
  homepageUrl     String?
  clientId        String    @unique
  // 只存 SHA-256 摘要，明文仅在创建/重置时返回一次
  clientSecretHash String
  // 回调地址白名单：JSON 字符串数组，精确匹配（含 https 前缀）
  redirectUris    String    @default("[]")
  status          String    @default("ACTIVE")   // ACTIVE / DISABLED
  createdBy       User?     @relation("OAuthAppCreator", fields: [createdById], references: [id])
  createdById     String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  codes           OAuthAuthorizationCode[]
  tokens          OAuthAccessToken[]
}

// 授权码：一次性、10 分钟有效，只存摘要
model OAuthAuthorizationCode {
  id          String    @id @default(cuid())
  app         OAuthApp  @relation(fields: [appId], references: [id], onDelete: Cascade)
  appId       String
  user        User      @relation("OAuthCodeUser", fields: [userId], references: [id], onDelete: Cascade)
  userId      String
  codeHash    String    @unique
  redirectUri String
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())

  @@index([appId, userId])
}

// 站外访问令牌：不透明随机 token，只存摘要，可主动吊销；7 天有效
model OAuthAccessToken {
  id        String    @id @default(cuid())
  app       OAuthApp  @relation(fields: [appId], references: [id], onDelete: Cascade)
  appId     String
  user      User      @relation("OAuthTokenUser", fields: [userId], references: [id], onDelete: Cascade)
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([appId, userId])
}
```

同时在 `User` 模型加反向关系字段：`oauthCodes OAuthAuthorizationCode[] @relation("OAuthCodeUser")`、`oauthTokens OAuthAccessToken[] @relation("OAuthTokenUser")`、`oauthAppsCreated OAuthApp[] @relation("OAuthAppCreator")`。

执行 `prisma migrate dev --name oauth_passport`。

### 2. 共享常量 — [packages/shared/src/index.ts](file:///e:/code/chilichill-start/packages/shared/src/index.ts)

新增：`OAUTH_APP_STATUSES`（ACTIVE/DISABLED）及中文标签、zod schema `oauthAppInputSchema`（name/description/logoUrl/homepageUrl/redirectUris 数组，redirectUri 校验必须是 `http(s)://` URL 且不含 fragment）、`OAuthAppStatus` 类型、OAUTH 常量（CODE_TTL 10 分钟、TOKEN_TTL 7 天）。前端与后端共用。

### 3. OAuth 服务层 — 新建 `apps/api/src/services/oauth.ts`

- `generateClientCredentials()` → clientId（`sp_` + 16 字节 hex）、clientSecret（32 字节 hex）；secret 存 `sha256(secret + appId?)` 摘要（用现有 `node:crypto`，参考 email-verification 的 codeHash 做法）
- `verifyClient(clientId, clientSecret)` → 校验存在 + status=ACTIVE + secret 摘要比对
- `issueAuthorizationCode(appId, userId, redirectUri)` → 随机 code，落库摘要 + 过期
- `consumeAuthorizationCode(appId, code, redirectUri)` → 校验未过期/未消费/redirectUri 一致，原子置 consumedAt（防重放：`updateMany({ where: { id, consumedAt: null, expiresAt: { gt: now } } })` 后判断 count）
- `issueAccessToken(appId, userId)` → 随机 token，落库摘要 + 7 天过期
- `resolveAccessToken(token)` → 校验未过期/未吊销，返回 app + user
- 使用前实时校验：user 未删除、未封号（`bannedAt`）、app 仍 ACTIVE（封号后站外 token 同步失效，复用 auth 插件现有策略）

### 4. 公开 OAuth 路由 — 新建 `apps/api/src/routes/oauth.ts`，在 [app.ts](file:///e:/code/chilichill-start/apps/api/src/app.ts) 注册

- **`GET /api/oauth/authorize`**：query 校验 `client_id`、`redirect_uri`（必须精确命中白名单）、`state`（必填，原样回传）。应用存在且 ACTIVE → 302 到前端授权页 `/oauth/authorize?...`（未登录时该前端页引导跳 `/login?redirect=...`）。非法 client_id/redirect_uri 直接返回 400 JSON，绝不重定向。
- **`POST /api/oauth/authorize/confirm`**（需登录，preHandler `authenticate`）：body 为 `clientId + redirectUri + state + approve`。approve=false → 302 回 `redirect_uri?error=access_denied&state=...`；approve=true → 签发授权码并 302 回 `redirect_uri?code=...&state=...`。封号用户拦截（authenticate 已含）。
- **`POST /api/oauth/token`**：`application/x-www-form-urlencoded` 或 JSON，校验 `grant_type=authorization_code`、`client_id`、`client_secret`、`code`、`redirect_uri`。成功返回 `{ access_token, token_type: "Bearer", expires_in, user: { id, uid, nickname, avatarUrl } }`（基础信息随 token 一次返回，第三方无需再调 userinfo，简化接入；userinfo 端点仍提供以备后续）。限流：`enforceRateLimit({ key: 'oauth:token:ip:...', limit: 20, windowMs: 60_000 })`；secret 错误统一返回 401 `INVALID_CLIENT`，code 无效返回 400 `INVALID_GRANT`，不泄露具体原因细节。
- **`GET /api/oauth/userinfo`**：`Authorization: Bearer <token>`，返回基础信息 `{ id, uid, nickname, avatarUrl }`。

安全要点：
- 授权码/访问令牌均为不透明随机串，DB 只存 SHA-256 摘要（与现有验证码做法一致）
- redirect_uri 精确匹配（不做前缀匹配）
- code 单次消费 + 10 分钟过期；同用户对同 app 重复授权时签发新 code
- state 必填且回传，防 CSRF
- 不需要新增 CORS 配置（整个流程是浏览器重定向 + 第三方服务端调用）

### 5. 管理后台 API — 新建 `apps/api/src/routes/admin/oauth-apps.ts`，app.ts 注册

全部 `preHandler: [app.requireAdmin]`：

- `GET /api/admin/oauth-apps` — 列表（含活跃 token 数统计）
- `POST /api/admin/oauth-apps` — 创建，返回 `{ item, clientSecret }`（明文仅此一次）
- `PUT /api/admin/oauth-apps/:id` — 更新名称/描述/logo/首页/回调白名单/状态（DISABLED 立即生效：token 校验时实时读 app status）
- `POST /api/admin/oauth-apps/:id/reset-secret` — 重新签发 secret，返回新明文一次
- `DELETE /api/admin/oauth-apps/:id` — 删除（cascade 清理 codes/tokens）

敏感操作写 `AdminAuditLog`（复用 [apps/api/src/lib/audit.ts](file:///e:/code/chilichill-start/apps/api/src/lib/audit.ts)）。

### 6. 用户授权确认页 — 新建 `apps/web/src/pages/OAuthAuthorizePage.tsx`

- 路由 `/oauth/authorize`（App.tsx 注册，AppShell 下）
- 逻辑：读取 query → 调 `GET /api/oauth/authorize` 校验合法性（后端 302 跳转方案下，此页直接用 query 参数渲染，提交时再由 confirm 接口校验）→ 展示应用名称/图标 + 「将获得以下信息：昵称、头像、用户 ID」+ 确认/拒绝按钮
- 未登录：提示并展示「去登录」按钮跳 `/login?redirect=/oauth/authorize?...`（ LoginPage 已支持 redirect 参数，需确认；若无则该页登录后返回授权页）
- 确认后由前端直接 `window.location.href = redirect_uri?code&state`（调用 confirm 接口拿到 302 Location 或直接前端拼 URL——实现时取 confirm 接口返回的 `{ redirectUrl }` JSON 而非服务端 302，避免前端 fetch 无法跟随跨域重定向）

> 实现细节修正：`POST /api/oauth/authorize/confirm` 返回 JSON `{ redirectUrl }`，由前端执行跳转；`GET /api/oauth/authorize` 仅做参数校验返回应用信息（`{ app: { name, logoUrl, homepageUrl } }`），不做 302。

### 7. 管理后台页面 — 新建 `apps/web/src/pages/admin/AdminOAuthAppsPage.tsx`

- App.tsx 增加 lazy 路由 `admin/oauth-apps`；AdminLayout 导航「系统」分组下新增 `{ to: '/admin/oauth-apps', label: '接入应用', icon: KeyRound, permission: PERMISSIONS.SYSTEM_MANAGE }`
- 功能：应用列表（名称/状态/clientId/回调数/创建时间）、新建弹窗（创建后弹窗展示 clientSecret 明文 + 「仅此一次」提示 + 复制按钮）、编辑（回调白名单多行编辑）、重置密钥（同样明文仅展示一次）、启用/禁用切换、删除确认
- 风格复用现有 Admin 页面模式（useAdminList hook、Toast 等）

### 8. 测试 — 新建 `apps/api/test/oauth.test.ts`

覆盖（参考 [apps/api/test/auth-login.test.ts](file:///e:/code/chilichill-start/apps/api/test/auth-login.test.ts) 的 buildApp + inject 模式）：

- 完整流程：管理员创建应用 → 用户登录 → confirm 授权 → token 交换 → userinfo 返回基础信息
- redirect_uri 不在白名单 → 400，不签发 code
- code 重放消费 → INVALID_GRANT
- code 过期 → INVALID_GRANT
- client_secret 错误 → 401 INVALID_CLIENT
- 应用 DISABLED 后 token/userinfo 失效
- 用户封号后 userinfo 失效
- state 回传一致性
- approve=false → redirectUrl 带 `error=access_denied`

## Assumptions & Decisions

| 决策点 | 选择 | 理由 |
|---|---|---|
| 协议 | OAuth2 授权码（无 PKCE） | 用户已确认；接入方为网站（服务端可保管 secret），属机密客户端，PKCE 非必需 |
| 应用管理 | 管理后台创建 | 用户已确认 |
| 返回信息 | id/uid/nickname/avatarUrl | 用户已确认；不含 email |
| 令牌形态 | 不透明随机串 + DB 摘要存储 | 可吊销、可审计，比 JWT 更适合站外颁发 |
| access_token 有效期 | 7 天 | 简化接入；到期后第三方引导用户重新授权登录 |
| confirm 跳转方式 | 前端 JSON 取 redirectUrl 后自行跳转 | 前端 fetch 无法跟随跨域 302，且需处理未登录场景 |
| CORS | 不改动 | 流程为浏览器重定向 + 服务端调用，无浏览器内跨域 API 调用 |

## Verification

1. `cd apps/api && npx prisma migrate dev --name oauth_passport` 成功
2. `npm run test -w apps/api`（vitest）全部通过，含新增 oauth.test.ts
3. `npm run build -w apps/api && npm run build -w apps/web` 编译通过
4. 手动冒烟（可选）：
   - 后台创建接入应用，保存 clientId/secret
   - 浏览器访问 `http://localhost:3001/api/oauth/authorize?client_id=...&redirect_uri=...&state=test123` → 跳授权页 → 确认 → 落回第三方回调带 code 与 state
   - curl 交换 token（x-www-form-urlencoded）→ 拿到 access_token 与用户信息
   - 后台禁用应用后再调 userinfo → 401
