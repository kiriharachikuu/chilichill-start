#!/usr/bin/env bash
# ============================================================
# ChiliChill Spaceport 服务器一键更新脚本（增量、可重复执行）
#
# 用法（Linux 服务器上执行，脚本可放在项目外调用）：
#   chmod +x scripts/deploy-update.sh          # 仅首次需要
#   ./scripts/deploy-update.sh                 # 标准更新
#   ./scripts/deploy-update.sh --skip-backup   # 跳过数据库备份（不推荐）
#   ./scripts/deploy-update.sh --force         # 无视增量判断，强制走完整流程
#   ./scripts/deploy-update.sh /path/to/app    # 指定项目目录
#
# 相比逐条手敲（git pull / npm ci / migrate / build / restart）的优势：
#   1. 增量执行：依赖锁没变跳过 npm ci、迁移没变跳过 migrate、schema 没变跳过 generate
#   2. 幂等重跑：.deploy-state 记录上次成功发布的提交，中途失败后直接重跑即可续上
#   3. 发布前自动备份 SQLite（保留最近 10 份），失败时提示排查命令
#
# 首次安装请使用 scripts/deploy-init.sh
# ============================================================
set -euo pipefail

# ── 按你的服务器实际情况修改以下配置 ──────────────────
BRANCH="main"
API_PORT="3001"
DB_FILE="apps/api/prisma/dev.db"          # SQLite 数据库文件路径
PROCESS_NAME="spaceport-api"              # pm2 进程名 或 systemd 服务名
HEALTH_URL="http://localhost:${API_PORT}/api/activities?limit=1"  # 发布后探活（连带数据库）
# ─────────────────────────────────────────────────────

SKIP_BACKUP=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=true ;;
    --force) FORCE=true ;;
    *) APP_DIR="$arg" ;;   # 可传入项目路径
  esac
done

if [ -z "${APP_DIR:-}" ]; then
  # 以脚本自身位置推断项目根目录（脚本位于 <root>/scripts/ 下）
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$APP_DIR"
STATE_FILE="$APP_DIR/.deploy-state"

# 必须是 git 仓库：增量更新依赖 .git 元数据，手动 FTP 上传的目录不含这些信息
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf '\n\033[1;31m✘ %s 不是 git 仓库，无法执行拉取更新。\033[0m\n' "$APP_DIR"
  printf '  若为首次部署，请在该目录（或其父目录）执行一次：\n\n'
  printf '    \033[1;36m# 方式 A：直接 clone（推荐）\033[0m\n'
  printf '    git clone https://github.com/kiriharachikuu/chilichill-start.git\n'
  printf '    cd chilichill-start\n\n'
  printf '    \033[1;36m# 方式 B：已手动上传的目录改造为 git 仓库（保留现有文件）\033[0m\n'
  printf '    git init\n'
  printf '    git remote add origin https://github.com/kiriharachikuu/chilichill-start.git\n'
  printf '    git fetch origin main\n'
  printf '    git checkout -f main      # 以远端代码覆盖工作区（.env 等未跟踪文件不受影响）\n\n'
  exit 1
fi

STEP_NO=0
CURRENT_STEP="初始化"
trap 'printf "\n\033[1;31m✘ 更新在「%s」一步失败，请根据上方日志排查后重新执行本脚本（已完成的步骤会自动跳过）。\033[0m\n" "$CURRENT_STEP"' ERR

step() { STEP_NO=$((STEP_NO + 1)); CURRENT_STEP="$1"; printf '\n\033[1;36m==> %d. %s\033[0m\n' "$STEP_NO" "$1"; }
ok()   { printf '    \033[1;32m✔\033[0m %s\n' "$1"; }
warn() { printf '    \033[1;33m⚠\033[0m %s\n' "$1"; }

# ── 0. 读取版本状态，判断哪些内容真的变了 ──────────────
step "读取版本状态"
git fetch origin "$BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"
LAST_OK="$(cat "$STATE_FILE" 2>/dev/null || true)"

# 上次发布成功且远端无新提交 → 只需确认服务存活
if [ "$FORCE" = false ] && [ -n "$LAST_OK" ] && [ "$LAST_OK" = "$LOCAL_SHA" ] && [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "    代码无变化（HEAD $LOCAL_SHA，上次发布成功），跳过安装/迁移/构建/重启。"
  echo "    如需强制走完整流程： ./scripts/deploy-update.sh --force"
  if curl -fs "$HEALTH_URL" >/dev/null 2>&1; then
    ok "服务运行正常（$HEALTH_URL 探活通过），无需任何操作"
    exit 0
  fi
  warn "服务未响应探活地址，请用 --force 重跑完整流程或在服务器上检查:  pm2 logs $PROCESS_NAME"
  exit 1
fi

# 增量判断：自上次成功发布以来，哪些环节的输入真的变了
# （首次部署或状态丢失时 DIFF_BASE 为空 → 全量执行）
DIFF_BASE="$LAST_OK"
if [ -n "$LAST_OK" ] && ! git cat-file -e "$LAST_OK" 2>/dev/null; then
  warn "状态文件里的提交 $LAST_OK 已不存在（重 clone 过？），本次按全量流程执行"
  DIFF_BASE=""
fi

NEED_DEPS=false
NEED_MIGRATE=false
NEED_GENERATE=false
if [ "$FORCE" = true ] || [ -z "$DIFF_BASE" ]; then
  NEED_DEPS=true
  NEED_MIGRATE=true
  NEED_GENERATE=true
else
  if git diff --quiet "$DIFF_BASE" "$REMOTE_SHA" -- package-lock.json; then :; else NEED_DEPS=true; fi
  if [ ! -d node_modules ]; then NEED_DEPS=true; fi
  if git diff --quiet "$DIFF_BASE" "$REMOTE_SHA" -- apps/api/prisma/migrations; then :; else NEED_MIGRATE=true; fi
  if [ ! -f "$DB_FILE" ]; then NEED_MIGRATE=true; fi
  if git diff --quiet "$DIFF_BASE" "$REMOTE_SHA" -- apps/api/prisma/schema.prisma; then :; else NEED_GENERATE=true; fi
fi
echo "    增量判断 → 依赖: $NEED_DEPS / 迁移: $NEED_MIGRATE / prisma generate: $NEED_GENERATE"

# ── 1. 拉取最新代码 ────────────────────────────────────
step "拉取最新代码（分支: $BRANCH）"
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "    本地已是最新（$LOCAL_SHA，上次流程可能中途失败，继续执行剩余步骤）。"
else
  echo "    更新: $LOCAL_SHA → $REMOTE_SHA"
  if ! git pull --ff-only origin "$BRANCH"; then
    warn "git pull 快进失败，通常是本地有未提交修改或分叉提交。"
    warn "处理建议：  git stash && ./scripts/deploy-update.sh   或   git checkout -f $BRANCH"
    exit 1
  fi
  ok "代码已更新到 $(git rev-parse --short HEAD)"
fi

# ── 2. 安装依赖（增量）────────────────────────────────
step "安装依赖"
if [ "$NEED_DEPS" = true ]; then
  npm ci
  ok "依赖已按 package-lock 精确安装（postinstall 已自动执行 prisma generate）"
else
  echo "    package-lock.json 无变化，跳过安装。"
fi
# npm/cli#4828：lock 在其他平台生成时缺当前平台 optional 原生依赖（rollup/esbuild），
# 导致 vite build / tsx 运行报 Cannot find module @rollup/rollup-linux-x64-gnu 等
if [ "$(uname -s)" = "Linux" ]; then
  MISSING_PKGS=""
  [ -d node_modules/@rollup/rollup-linux-x64-gnu ] || MISSING_PKGS="$MISSING_PKGS @rollup/rollup-linux-x64-gnu@$(node -p "require('./node_modules/rollup/package.json').version")"
  [ -d node_modules/@esbuild/linux-x64 ] || MISSING_PKGS="$MISSING_PKGS @esbuild/linux-x64@$(node -p "require('./node_modules/esbuild/package.json').version")"
  if [ -n "$MISSING_PKGS" ]; then
    warn "检测到缺失的 Linux 原生模块，补装:$MISSING_PKGS"
    npm install --no-save $MISSING_PKGS
    ok "Linux 原生模块已补齐"
  fi
fi

# ── 3. 数据库备份 + 迁移（增量）───────────────────────
step "数据库备份与迁移"
if [ "$NEED_GENERATE" = true ]; then
  (cd apps/api && npx prisma generate)
  ok "Prisma 客户端已按最新 schema 重新生成"
else
  echo "    schema.prisma 无变化，跳过 prisma generate。"
fi

if [ "$NEED_MIGRATE" = true ]; then
  if [ "$SKIP_BACKUP" = true ]; then
    warn "已按参数跳过备份"
  elif [ -f "$DB_FILE" ]; then
    BACKUP_PATH="${DB_FILE}.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$DB_FILE" "$BACKUP_PATH"
    ok "已备份: $BACKUP_PATH"
    # 只保留最近 10 份备份
    ls -1t "${DB_FILE}.bak-"* 2>/dev/null | tail -n +11 | xargs -r rm -f
  else
    warn "未找到 $DB_FILE（首次部署？），跳过备份"
  fi
  # Prisma 7 的连接配置在 apps/api/prisma.config.ts（自动加载 apps/api/.env），
  # CLI 只在当前目录查找 config，因此必须进入 apps/api 执行，不能从根目录指定 --schema
  (cd apps/api && npx prisma migrate deploy)
  ok "迁移完成"
else
  echo "    migrations 无变化，跳过备份与迁移。"
fi

# ── 4. 构建（shared → api → web）──────────────────────
step "构建"
npm run build
ok "构建完成，前端产物: apps/web/dist"

# ── 5. 重启服务 ────────────────────────────────────────
step "重启服务"
RESTARTED=false
if command -v pm2 >/dev/null 2>&1 && pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
  pm2 reload "$PROCESS_NAME"
  RESTARTED=true
elif command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${PROCESS_NAME}\.service"; then
  systemctl restart "$PROCESS_NAME"
  RESTARTED=true
fi
if [ "$RESTARTED" = true ]; then
  ok "服务已重启（$PROCESS_NAME）"
else
  warn "未在 pm2 / systemd 中找到名为 $PROCESS_NAME 的服务，请手动重启 API 进程后重跑健康检查"
fi

# ── 6. 健康检查（重试 10 次，容忍 Node 冷启动）────────
step "健康检查"
sleep 2
HEALTH_OK=false
for _ in $(seq 1 10); do
  if curl -fs "$HEALTH_URL" >/dev/null 2>&1; then HEALTH_OK=true; break; fi
  sleep 2
done
if [ "$HEALTH_OK" = true ]; then
  printf '%s\n' "$(git rev-parse HEAD)" > "$STATE_FILE"
  printf '    \033[1;32m✔\033[0m API 探活成功，发布完成（版本 %s，已记录发布状态）\n' "$(git rev-parse --short HEAD)"
else
  # 不清除状态文件：它代表「上次成功的发布」，保留它重跑时才能走增量续上
  warn "API 探活失败（重试 20 秒），请检查:  pm2 logs $PROCESS_NAME  或  journalctl -u $PROCESS_NAME -n 50"
  warn "修复后重新执行 ./scripts/deploy-update.sh 即可续上"
  exit 1
fi
