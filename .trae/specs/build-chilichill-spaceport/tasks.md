# Tasks

- [x] Task 1: 初始化工作区与前后端脚手架
  - [x] SubTask 1.1: 根目录 `package.json`（npm workspaces、`dev`/`build`/`db:seed` 脚本）、`.gitignore`、`.env.example`
  - [x] SubTask 1.2: `packages/shared` 建立共享类型与 Zod schema（实体、投稿、标签、规则）
  - [x] SubTask 1.3: `apps/api` 搭建 Fastify + TypeScript 服务，暴露 `GET /api/health`，注册 CORS 与 Cookie
  - [x] SubTask 1.4: `apps/web` 搭建 Vite + React + TS + Tailwind，配置 `/api` 开发代理与基础布局

- [x] Task 2: 数据模型与种子数据
  - [x] SubTask 2.1: Prisma schema 定义 User、Group（含 `type` 群类型 / 主城市 / 大区）、Site、Tag、GroupTag、SiteTag、Submission、CityRegionRule、AutoTagRule
  - [x] SubTask 2.2: 执行 migrate，编写 seed：31 省主要城市→大区映射、功能关键词规则、示例标签、管理员与演示用户、示例群与站点

- [x] Task 3: 认证与权限
  - [x] SubTask 3.1: 注册/登录/登出/`GET /api/auth/me`，bcrypt + JWT httpOnly Cookie
  - [x] SubTask 3.2: `authenticate` 与 `requireAdmin` 守卫，统一错误响应结构

- [x] Task 4: 存储适配器与上传接口
  - [x] SubTask 4.1: Storage 接口 + LocalStorageAdapter（`apps/api/public/uploads`，静态托管）
  - [x] SubTask 4.2: CosStorageAdapter（环境变量存在时启用，优先于本地）
  - [x] SubTask 4.3: `POST /api/uploads`：类型/大小校验、随机文件名、返回 `{ url, key }`

- [x] Task 5: 标签、规则与分类服务
  - [x] SubTask 5.1: 标签 CRUD 与公开标签列表（`scope` 过滤）
  - [x] SubTask 5.2: 城市大区映射与关键词自动打标规则的 CRUD
  - [x] SubTask 5.3: 分类服务：按群类型分流——`REGION` 用 `resolveRegion(city)` 得大区，`ONLINE` 用 `resolveAutoTags(text, scope)` 仅作标签推荐，`OTHER` 标记待定；供投稿接口与审核台复用

- [x] Task 6: 投稿与审核核心
  - [x] SubTask 6.1: 投稿创建（CREATE/UPDATE）+ 我的投稿列表 + 修改后重新提交
  - [x] SubTask 6.2: 实体注册表（校验器 + 落地器），群/网站两种实体实现；群校验按类型强制字段（REGION 必填城市、ONLINE 必填功能标签、OTHER 必填用途说明）
  - [x] SubTask 6.3: 审核接口：待审列表、详情、通过（事务写入线上内容）、驳回（原因必填）
  - [x] SubTask 6.4: 后台内容管理接口（列表、下线、删除）、用户列表

- [x] Task 7: 公开导航查询接口
  - [x] SubTask 7.1: `GET /api/groups`：群类型/大区/标签/关键词筛选 + 分页 + 大区聚合计数
  - [x] SubTask 7.2: `GET /api/sites`：标签/关键词筛选 + 分页 + 标签聚合计数
  - [x] SubTask 7.3: `GET /api/meta`：大区、标签、统计概览；前端导航模块配置化输出

- [x] Task 8: 前端公开页面
  - [x] SubTask 8.1: 深空星轨主题与基础组件（按钮、卡片、标签、输入、弹窗、空状态、Toast）
  - [x] SubTask 8.2: 首页（Hero、大区入口、精选站点、最新收录、投稿引导）
  - [x] SubTask 8.3: Q群导航页（群类型/大区/标签筛选、搜索、分页、复制群号、二维码预览）
  - [x] SubTask 8.4: 网站导航页（标签筛选、搜索、卡片外链跳转）
  - [x] SubTask 8.5: 登录/注册页与路由级登录态守卫

- [x] Task 9: 投稿与后台前端
  - [x] SubTask 9.1: 统一投稿页（群/网站 Tab；群先单选类型，地区群展开按大区分组的城市勾选面板并实时预览大区，线上功能群显示功能标签勾选，其他类型显示用途说明；封面上传、提交反馈）
  - [x] SubTask 9.2: 我的投稿页（状态筛选、驳回原因、编辑重提）
  - [x] SubTask 9.3: 后台审核台（待审列表、详情/差异展示、通过/驳回）
  - [x] SubTask 9.4: 后台标签、分类规则、内容管理页面

- [x] Task 10: 联调、验收与扩展说明
  - [x] SubTask 10.1: 全流程自测：注册→地区群投稿（选城市）→审核通过→前端按大区展示→线上功能群投稿→修改→二次审核→驳回→重提
  - [x] SubTask 10.2: 类型检查与生产构建通过，移动端 375px 布局检查
  - [x] SubTask 10.3: 编写 `README.md`（启动说明）与 `EXTENDING.md`（画廊/音乐厅接入指南）

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3、Task 4 依赖 Task 2，且可并行
- Task 5、Task 6 依赖 Task 3，Task 6 依赖 Task 5
- Task 7 依赖 Task 5
- Task 8 依赖 Task 7
- Task 9 依赖 Task 4、Task 6
- Task 10 依赖 Task 8、Task 9
