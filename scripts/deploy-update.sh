#!/usr/bin/env bash
# ============================================================
# ChiliChill Spaceport 服务器一键拉取更新脚本
#
# 用法（Linux 服务器上，项目根目录执行）：
#   chmod +x scripts/deploy-update.sh     # 仅首次需要
#   ./scripts/deploy-update.sh            # 完整更新流程
#   ./scripts/deploy-update.sh --skip-backup   # 跳过数据库备份
#
# 流程：拉代码 → 装依赖 → 备份 SQLite → 迁移 → 构建 → 重启 → 健康检查
# ============================================================
set -euo pipefail

# ── 按你的服务器实际情况修改以下配置 ──────────────────
BRANCH="main"
API_PORT="3001"
DB_FILE="apps/api/prisma/dev.db"          # SQLite 数据库文件路径
PROCESS_NAME="spaceport-api"             # pm2 进程名 或 systemd 服务名
HEALTH_URL="http://localhost:3001/api/activities?limit=1"  # 用于发布后探活
# ─────────────────────────────────────────────────────

SKIP_BACKUP=false
for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=true ;;
    *) APP_DIR="$arg" ;;   # 可传入项目路径，脚本放在别处也能用
  esac
done

if [ -z "${APP_DIR:-}" ]; then
  # 以脚本自身位置推断项目根目录（脚本位于 <root>/scripts/ 下）
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
cd "$APP_DIR"

# 必须是 git 仓库：git pull 依赖 .git 元数据，手动 FTP 上传的目录不含这些信息
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

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[1;32m✔\033[0m %s\n' "$1"; }
warn() { printf '    \033[1;33m⚠\033[0m %s\n' "$1"; }

step "1/6 拉取最新代码（分支: $BRANCH）"
git fetch origin "$BRANCH"
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse "origin/$BRANCH")"
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "    本地已是最新（$LOCAL_SHA），仍继续执行构建与重启。"
else
  echo "    更新: $LOCAL_SHA → $REMOTE_SHA"
fi
git pull origin "$BRANCH"
ok "代码已更新到 $(git rev-parse --short HEAD)"

step "2/6 安装依赖"
npm install
# npm install 可能更新 lock 文件，恢复为仓库版本，避免影响后续 git pull
git checkout -- package-lock.json 2>/dev/null || true
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
ok "依赖就绪（postinstall 已自动执行 prisma generate）"

step "3/6 备份数据库"
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

step "4/6 应用数据库迁移"
# Prisma 7 的连接配置在 apps/api/prisma.config.ts（自动加载 apps/api/.env），
# CLI 只在当前目录查找 config，因此必须进入 apps/api 执行，不能从根目录指定 --schema
cd apps/api
npx prisma migrate deploy
ok "迁移完成"
cd "$APP_DIR"

step "5/6 构建（shared → api → web）"
npm run build
ok "构建完成，前端产物: apps/web/dist"

step "6/6 重启服务"
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
  warn "未在 pm2 / systemd 中找到名为 $PROCESS_NAME 的服务，请手动重启 API 进程"
fi

printf '\n\033[1;36m==> 健康检查\033[0m\n'
sleep 3
if curl -fs "$HEALTH_URL" >/dev/null 2>&1; then
  printf '    \033[1;32m✔\033[0m API 探活成功，发布完成（版本 %s）\n' "$(git rev-parse --short HEAD)"
else
  warn "API 探活失败，请检查:  pm2 logs $PROCESS_NAME  或  journalctl -u $PROCESS_NAME -n 50"
  exit 1
fi
