# 厚嘴唇空间站

ChiliChill 粉丝向导航站。把散落在聊天记录和私域分享里的 Q 群、粉丝自制站点（小游戏、工具、小测试）、二创作品与历届活动集中收录，并提供投稿、审核与分类能力。

## 功能

- **Q群导航**：按大区、群类型、标签、关键词筛选，展示群名、群号、城市、大区、标签、简介、加入链接/二维码，群号一键复制。
- **网站导航**：展示粉丝自制站点，支持标签筛选、关键词搜索，外链安全跳转。
- **二创画廊**：作品瀑布流、点赞、评论、评论举报，未登录可浏览。
- **历届活动**：活动看板与活动详情页，后台可维护。
- **统一投稿**：群 / 网站 / 画廊作品共用 `Submission` 草稿与审核链路；新建与修改都不直接改动线上内容。
- **账号体系**：邮箱验证码注册、登录、密码找回（JWT httpOnly Cookie 会话）。
- **后台管理**：审核台（通过 / 驳回 / 审核时修正字段 / 自审排除）、已发布内容管理、标签管理、城市大区映射与关键词自动打标规则、评论举报处理、用户与角色管理、存储设置、操作审计日志。
- **安全防护**：登录双维度限流、验证码冷却与配额、CORS 白名单、helmet 安全响应头、投稿越权防护。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 运行时 | Node.js 22，npm workspaces Monorepo |
| 前端 `apps/web` | React 18 + Vite 6 + TypeScript + Tailwind CSS + react-router-dom 7 + lucide-react，开发端口 5173 |
| 后端 `apps/api` | Fastify 5 + Prisma 7 + SQLite + Zod 4 + JWT（httpOnly Cookie）+ bcryptjs，端口 3001 |
| 共享层 `packages/shared` | 共享类型、枚举与 Zod schema（前后端共用同一份校验口径） |
| 测试 | Vitest：API 集成测试（fastify.inject）+ Web 组件测试（jsdom + Testing Library） |

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `apps/web` | 前端公开站与后台页面，Vite 开发服务器把 `/api`、`/uploads` 代理到 3001 |
| `apps/api` | Fastify REST API、Prisma schema/迁移、实体注册表、存储适配器 |
| `apps/api/prisma` | `schema.prisma`、`migrations/`、`seed.ts`（开发演示数据）、`base-data.ts`（基础数据）、`bootstrap.ts`（生产初始化）、`promote-admin.ts`（管理员提权） |
| `apps/api/src/modules/entities` | 实体注册表与 `group.ts`、`site.ts`、`gallery.ts` 落地器 |
| `apps/api/src/services/storage` | 本地 / 腾讯云 COS 存储适配器 |
| `apps/api/test` | API 集成测试（vitest，独立 SQLite 测试库） |
| `apps/web/src/**/*.test.*` | Web 组件测试 |
| `packages/shared` | `src/index.ts` 中的枚举、接口与 payload schema |

## 快速开始（本地开发）

要求 Node.js 22。

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run dev
```

- 前端：http://localhost:5173
- 健康检查：http://localhost:3001/api/health
- 首次启动会自动执行 `db:setup`（`prisma migrate dev` 建表 + `seed` 写入演示数据），随后并发启动前后端。

`apps/api/.env` 是后端唯一实际读取的环境变量文件；根目录 `.env.example` 与 `apps/api/.env.example` 仅作说明和模板。

### 演示账号（仅开发环境）

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 管理员 | `admin@spaceport.dev` | `Admin123!` |
| 普通用户 | `demo@spaceport.dev` | `Demo1234!` |

后台入口：http://localhost:5173/admin ，需以管理员账号登录。普通用户访问后台页面或 `/api/admin/*` 会被拒绝（403）。前端「演示账号快捷登录」入口仅在开发构建（`import.meta.env.DEV`）中显示，生产构建不出现。

## 测试

```powershell
npm test --workspace=@spaceport/api   # API 测试（94 用例）
npm test --workspace=@spaceport/web   # Web 组件测试（26 用例）
```

- API 测试使用独立 SQLite 测试库（临时目录，`global-setup` 自动 `db push` 重建），不触碰 `dev.db`；鉴权用 `app.jwt.sign` 直接签发 cookie，覆盖点赞/评论/投稿/审核/登录限流/密码重置等核心链路。
- API 测试串行执行（`fileParallelism: false`），避免 SQLite 文件库多进程写锁冲突。
- Resend 传输测试模拟 HTTP 响应，覆盖请求内容、重试幂等、限流等待、超时和永久错误；配置测试覆盖生产环境必填项，不调用真实发信服务。
- Web 测试覆盖 `apiFetch` 封装（错误结构、401 广播）、`EmailCodeField`（倒计时/结构化限流）、`ProtectedAdminRoute`（路由守卫）、`LoginModal`（登录/注册/找回密码流程）。

## 常用脚本

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | 先 `db:setup`，再并发启动 api 与 web |
| `npm run dev:api` / `npm run dev:web` | 仅启动后端 / 前端 |
| `npm run build` | 依次构建 shared、api、web；api 的 build 仅为 `tsc --noEmit` 类型检查，运行时用 `tsx` 启动 |
| `npm run typecheck` | 依次对 shared、api、web 执行 `tsc --noEmit` |
| `npm run db:migrate` | 开发环境 `prisma migrate dev --name init` |
| `npm run db:seed` | 写入演示数据（含演示账号，**生产禁用**，执行即退出） |
| `npm run db:bootstrap --workspace=@spaceport/api` | 写入站点运行必需的基础数据（标签 / 城市大区映射 / 自动打标规则），无任何账号与演示内容，幂等，**生产首次安装用** |
| `npm run admin:promote --workspace=@spaceport/api -- <邮箱>` | 把已注册用户提升为 ADMIN（首次安装建管理员用） |
| `npm test --workspace=@spaceport/api` / `--workspace=@spaceport/web` | 运行测试 |
| `npm run db:reset --workspace=@spaceport/api` | 重置开发数据库并重新执行迁移与种子 |
| `scripts/deploy-init.sh` | 服务器一键**首次部署**（交互式引导：拉代码 / 装依赖 / 构建 / 生成 `.env` / 迁移 / bootstrap / PM2 启动 / 探活），详见[生产部署](#生产部署) |
| `scripts/deploy-update.sh` | 服务器一键**增量更新**（依赖 / 迁移按需执行 + 自动备份 + 健康检查），详见[方案 A · 日常更新](#8-日常更新) |

## 环境变量

读取位置：`apps/api/.env`（`dotenv` 从后端进程的工作目录读取，部署时确保在 `apps/api` 目录启动）。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` 时：强制校验 `JWT_SECRET` 强度、Cookie 开启 `secure`、禁用 `db:seed` |
| `DATABASE_URL` | `file:./dev.db` | SQLite 连接串，相对 `apps/api/prisma` 目录；生产建议用绝对路径 |
| `JWT_SECRET` | `spaceport-dev-secret-change-me` | JWT 签名密钥；生产必须为 ≥32 位随机值，否则拒绝启动 |
| `API_PORT` | `3001` | 后端监听端口 |
| `TRUST_PROXY` | `false` | 部署在 Nginx / EdgeOne 等反向代理之后必须设为 `true`，否则登录限流按代理 IP 计数 |
| `CORS_ORIGINS` | 空 | 跨域白名单（逗号分隔）。同域部署无需配置；生产未配置时拒绝所有跨域 |
| `PUBLIC_BASE_URL` | `http://localhost:3001` | 对外可访问地址；本地存储返回相对路径 `/uploads/...` |
| `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` | 空 | 腾讯云 COS 密钥，四项齐全自动启用对象存储上传 |
| `COS_KEY_PREFIX` | `spaceport` | 上传对象的目录前缀。**与其他项目共用存储桶时必配**：对象统一落在 `<前缀>/uploads/...`，与其他项目的文件隔离；删除清理按此前缀识别归属 |
| `COS_BASE_URL` | 空 | 可选自定义访问域名；留空按 `https://<bucket>.cos.<region>.myqcloud.com/<key>` 拼接 |
| `RESEND_API_KEY` | 空 | Resend API 密钥，仅后端读取；生产必填，开发/测试留空时仅打印邮件并返回 `devCode` |
| `MAIL_FROM` | 空（控制台模式显示本地占位地址） | 启用 Resend 时必填，填写已验证域名的纯邮箱地址，如 `no-reply@example.com` |
| `MAIL_FROM_NAME` / `MAIL_REPLY_TO` | `厚嘴唇空间站` / 空 | 发件显示名 / 可选回复地址 |
| `MAIL_MAX_RETRIES` / `MAIL_RETRY_DELAY_MS` | `2` / `800` | 发送失败重试次数与退避基数 |
| `EMAIL_CODE_TTL_MINUTES` | `10` | 验证码有效期 |
| `EMAIL_CODE_COOLDOWN_SECONDS` | `60` | 同邮箱重发冷却 |
| `EMAIL_CODE_MAX_ATTEMPTS` | `5` | 单验证码最大错误次数 |
| `EMAIL_CODE_HOURLY_LIMIT` | `5` | 同邮箱每小时发送上限 |
| `EMAIL_CODE_IP_HOURLY_LIMIT` | `20` | 同 IP 每小时发送上限 |

验证码只以 SHA-256 摘要落库。邮件通过 [Resend Email API](https://resend.com/docs/api-reference/emails/send-email) 发送，注册和找回密码共用发信服务。

接入步骤：在 [Resend Domains](https://resend.com/domains) 添加发信域名，按控制台要求配置 DNS 并完成验证；在 [API Keys](https://resend.com/api-keys) 创建拥有该域名发送权限的密钥，将 `RESEND_API_KEY` 和 `MAIL_FROM` 写入 `apps/api/.env` 后重启后端。`MAIL_FROM` 的域名必须已验证，`MAIL_FROM_NAME` 单独配置显示名。旧 `SMTP_*` 配置已不再使用。

发信请求有 10 秒超时，同一封邮件重试时复用幂等键；网络错误、HTTP 5xx 和临时限流按退避策略重试，并遵守 `Retry-After`。密钥、域名或参数错误直接失败。生产环境缺少 Resend 密钥或发件地址会拒绝启动。开发/生产仍采用后台投递：验证码接口成功表示已触发发送，实际 API 结果查看后端 `email_code` / `password_reset` 日志；最终送达情况查看 Resend 控制台。

## 群分类规则

投稿表单先单选群类型，再按类型渲染字段：

| 群类型 | 必填与归类方式 |
| --- | --- |
| `REGION` 地区粉丝群 | 必须勾选城市；城市经 `CityRegionRule` 映射到大区（如 广州 → 华南） |
| `COLLEGE` 院校粉丝群 | 必须勾选城市 + 填写学校名称 |
| `GENERAL` 线上功能群 | 必须至少选择一个功能标签；不显示城市 |
| `OTHER` 其他类型 | 必须填写用途说明，至少一个标签，大区记为「待定」 |

关键词 `AutoTagRule` 仅作标签推荐（`GET /api/groups/tag-suggestions`），不决定归类。后台可维护标签与城市映射（`/admin/tags`、`/admin/rules`）。审核时可修正群类型、城市与标签，修正后按新类型重新计算大区。

## 投稿审核流程

1. 新建（`CREATE`）与修改（`UPDATE`）都只生成 `PENDING` 投稿，不直接写线上数据。
2. 修改已发布内容时，线上内容在审核通过前保持不变；通过后才覆盖字段。
3. **自审排除**：审核人不能处理自己提交的投稿（403 `SELF_REVIEW_FORBIDDEN`）。
4. 通过时在事务内用条件更新抢占 `PENDING` 状态并落库；重复审核返回 409 `CONFLICT`；操作写入审计日志。
5. 驳回原因必填（2–200 字）；`CREATE` 投稿被驳回时其上传文件会被清理（best-effort）。
6. 投稿人在「我的投稿」查看驳回原因，修改后重新提交（resubmit），状态回到 `PENDING`。

# 生产部署

后端含 SQLite 文件数据库与本地文件上传，**需要持久磁盘**——不能用 EdgeOne Pages Functions / Vercel Functions 等无盘边缘运行时，需一台云服务器。前端是纯静态 SPA，托管方式灵活。以下提供两套方案。

## 方案 A（推荐）：独立服务器一体化部署（Debian + 宝塔）

Nginx 托管前端静态文件并反代 `/api`、`/uploads` 到本机 Node 进程，同域部署零代码改动。

### 一键脚本（推荐）

装好环境（第 1 节：Node 22 + PM2）后，首次部署与日常更新各只需一条命令：

```bash
# 首次部署：clone 后进入项目目录执行
git clone <你的仓库地址> chilichill && cd chilichill
chmod +x scripts/*.sh
./scripts/deploy-init.sh
```

`deploy-init.sh` 交互式引导（有默认值，一路回车即可），依次完成：环境检查 → 拉代码 → 装依赖 → 构建 → 生成 `apps/api/.env`（**自动生成 32 位随机 `JWT_SECRET`**，提问 Resend 密钥与发件邮箱）→ 迁移 → 基础数据 bootstrap → PM2 启动 → 健康检查，最后打印收尾清单（Nginx 建站、管理员提权命令）。安装目录 / 端口 / 数据目录可用 `--dir`、`--port`、`--data-dir` 预填跳过提问。

```bash
# 日常更新：一条命令，增量执行
./scripts/deploy-update.sh
```

`deploy-update.sh` 自动判断增量：依赖锁未变跳过 `npm ci`、迁移未变跳过 `migrate deploy`、schema 未变跳过 `prisma generate`；无新提交且上次发布成功时只做探活直接返回；迁移前自动备份 SQLite（保留最近 10 份）；发布状态记录在 `.deploy-state`，**中途失败直接重跑即可续上**。可选参数：`--skip-backup` 跳过备份、`--force` 强制完整流程。两个脚本头部的配置块可改分支名 / 端口 / PM2 进程名。

以下为手动部署的等价步骤（想了解脚本每一步做了什么、或需要脱离脚本操作时参考）。

### 1. 安装环境

宝塔软件商店安装：

- **Node.js 版本管理器** → 安装 Node 22，命令行版本切到 22
- **PM2 管理器**（进程守护 + 开机自启）

```bash
node -v   # v22.x
```

### 2. 拉取代码并构建

```bash
mkdir -p /www/wwwroot && cd /www/wwwroot
git clone <你的仓库地址> chilichill
cd chilichill
npm ci
npm run build -w @spaceport/web   # 产物在 apps/web/dist
```

### 3. 配置后端环境变量

```bash
mkdir -p /www/chilichill-data   # SQLite 与上传文件放站点目录外
nano /www/wwwroot/chilichill/apps/api/.env
```

```bash
NODE_ENV=production
API_PORT=3001
JWT_SECRET=<openssl rand -hex 32 生成>
DATABASE_URL=file:/www/chilichill-data/prod.db
TRUST_PROXY=true
RESEND_API_KEY=<Resend API 密钥>
# 发件域名必须已在 Resend 完成验证
MAIL_FROM=no-reply@xxx.com
MAIL_FROM_NAME=厚嘴唇空间站
# 可选：上传走 COS（推荐，不依赖单机磁盘）
# COS_SECRET_ID= COS_SECRET_KEY= COS_BUCKET= COS_REGION= COS_BASE_URL=
```

> 两个关键点：① `NODE_ENV=production` 时登录 Cookie 为 `secure`，必须先配好 HTTPS 再测登录，否则「登录成功但刷新掉线」；② `TRUST_PROXY=true` 必须开，否则限流把所有访客算成 Nginx 的 IP。

### 4. 首次安装（无演示数据）

```bash
cd /www/wwwroot/chilichill/apps/api
npx prisma migrate deploy        # 建表
npm run db:bootstrap             # 基础数据：12 标签 + 193 城市大区映射 + 11 自动打标规则
pm2 start npx --name spaceport-api -- tsx src/server.ts
pm2 save && pm2 startup          # 按提示执行打印的命令实现开机自启
```

然后：

1. 打开网站，在登录弹窗**注册你的账号**（真实邮箱收验证码）
2. 回服务器提权：

```bash
npm run admin:promote -- 你@example.com
```

3. 退出重新登录，侧边栏出现「管理后台」入口

> 不要执行 `npm run db:seed`——它含公开演示账号，生产环境会直接拒绝执行。基础数据（标签/城市）不是演示内容，投稿表单的选项依赖它们，必须执行 `db:bootstrap`。

### 5. 宝塔建站与 Nginx 配置

添加站点（纯静态，根目录 `/www/wwwroot/chilichill/apps/web/dist`），申请 Let's Encrypt SSL 并强制 HTTPS，然后用以下配置替换站点配置文件（域名与证书路径按实际替换）：

```nginx
# ─── HTTP 全部跳转 HTTPS ───────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

# ─── HTTPS 主站 ────────────────────────────────────────
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name your-domain.com;

    # 宝塔 Let's Encrypt 证书路径（站点 SSL 页面申请后照抄）
    ssl_certificate     /www/server/panel/vhost/cert/your-domain.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # 前端单图限 5MB，这里放宽（Nginx 默认 1m 会挡掉上传）
    client_max_body_size 10m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 5;
    gzip_types text/css application/javascript application/json image/svg+xml;

    root /www/wwwroot/chilichill/apps/web/dist;
    index index.html;

    # 带 hash 的构建产物：内容不变，永久缓存
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # 入口 HTML 不缓存，保证发版后立即生效
    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # ── 后端 API 反代 ──────────────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # 后端 TRUST_PROXY 依赖它识别 HTTPS
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        proxy_buffering off;
    }

    # ── 上传文件反代（本地磁盘模式；配了 COS 可删除此块）──
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=2592000";
    }

    # ── SPA fallback：刷新 /groups/xxx 不 404 ────────────
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\.(?!well-known) {
        deny all;
    }

    access_log /www/wwwlogs/your-domain.com.log;
    error_log /www/wwwlogs/your-domain.com.error.log;
}
```

保存后 `nginx -t` 校验并重载。**防火墙/安全组只放行 80/443 与面板端口，3001 不对外。**

### 6. 验证清单

| 检查项 | 方法 |
| --- | --- |
| 首页/列表页正常 | 浏览器访问域名 |
| SPA 刷新不 404 | 打开 `/groups` 后按 F5 |
| API 通 | DevTools 里 `/api/meta` 返回 200 |
| 登录态保持 | 登录后刷新不掉线（HTTPS + cookie 生效） |
| 限流按真实 IP | 同一 IP 连续登录失败 11 次返回 429 |
| 邮件验证码 | 注册流程能收到邮件 |
| 图片上传 | 投稿页上传 ≤5MB 图片成功，`/uploads/...` 可访问 |

### 7. 备份（SQLite 单文件，必做）

宝塔 → 计划任务 → Shell 脚本，每天执行：

```bash
sqlite3 /www/chilichill-data/prod.db ".backup /www/backup/db-$(date +\%F).db" && find /www/backup -name 'db-*.db' -mtime +14 -delete
```

未配 COS 时，把 `apps/api/public/uploads/` 也纳入备份（运行时直接拷贝有截断风险，推荐 `sqlite3 .backup` + 低峰期备份上传目录）。

### 8. 日常更新

推荐直接用更新脚本（增量执行 + 自动备份 + 失败可重跑续上）：

```bash
cd /www/wwwroot/chilichill
./scripts/deploy-update.sh
```

手动执行等价命令：

```bash
cd /www/wwwroot/chilichill
git pull
npm ci
npm run build
cd apps/api && npx prisma migrate deploy   # 有新迁移时
pm2 restart spaceport-api
```

## 方案 B：EdgeOne 静态托管 + 按路径回源

```
用户 ──> EdgeOne（your-domain.com）
          ├── /api/*      ──回源──> 云服务器 :3001
          ├── /uploads/*  ──回源──> 云服务器
          └── 其余路径     ──────> EdgeOne Pages（apps/web/dist，SPA fallback 到 index.html）
```

- EdgeOne Pages 构建配置：安装 `npm ci`，构建 `npm run build -w @spaceport/web`，输出目录 `apps/web/dist`；重写规则配置非静态路径 fallback 到 `/index.html`
- 规则引擎添加 `/api/*`、`/uploads/*` 按路径回源到服务器
- 后端侧与方案 A 完全相同（`.env`、bootstrap、promote-admin、PM2），首次安装与日常更新同样可用 `deploy-init.sh` / `deploy-update.sh`
- 同域架构下 Cookie / CORS / 限流按现状工作，**无需改任何代码**
- 注意：国内 EdgeOne 节点要求备案域名
- 不推荐前后端分域部署：需额外改 API base URL、Cookie `sameSite:'none'` 与 CORS 三处代码，当前规模没有收益

## 安全要点

- `JWT_SECRET` 生产必须 ≥32 位随机值（源码内置默认值会被拒绝启动），泄露后所有会话可被伪造
- 反向代理后必须 `TRUST_PROXY=true`，同时确保代理正确覆盖 `X-Forwarded-For`（不可信任客户端自带的该头直连后端）
- 生产 HTTPS 必须开启（Cookie `secure` + `sameSite: 'lax'` 依赖同域 HTTPS 架构）
- 登录限流：IP 维度 10 次/分钟、邮箱维度 20 次/15 分钟；验证码有冷却、配额与错误次数上限
- 管理操作（审核、角色变更等）均写审计日志，后台可查
- SQLite 适合单机小规模；多实例或高并发应迁移 PostgreSQL（Prisma 侧调整 datasource 与 driver adapter）

## 延伸阅读

- [EXTENDING.md](./EXTENDING.md)：新增画廊、音乐厅等实体模块的接入指南。
- [.trae/specs/build-chilichill-spaceport/spec.md](./.trae/specs/build-chilichill-spaceport/spec.md)：第一版需求口径与验收场景。
