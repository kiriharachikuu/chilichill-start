#!/usr/bin/env bash
# ============================================================
# ChiliChill Spaceport 服务器一键部署脚本（首次安装）
#
# 用法（Linux 服务器上执行，建议 root）：
#   chmod +x scripts/deploy-init.sh      # 仅首次需要
#   ./scripts/deploy-init.sh             # 交互式引导（有默认值，一路回车即可）
#   ./scripts/deploy-init.sh --dir /www/wwwroot/chilichill --port 3001 \
#                           --data-dir /www/chilichill-data   # 预填参数，跳过对应提问
#
# 自动完成：环境检查 → 拉代码 → 装依赖 → 构建 → 生成 .env（自动生成 JWT_SECRET）
#           → 数据库迁移 → 基础数据 bootstrap → PM2 启动 → 健康检查
# 完成后打印收尾清单（Nginx 建站、管理员提权、日常更新入口）。
#
# 日常更新请使用 scripts/deploy-update.sh
# ============================================================
set -euo pipefail

# ── 按实际情况可改的默认值 ─────────────────────────────
REPO_URL="https://github.com/kiriharachikuu/chilichill-start.git"
DEFAULT_DIR="/www/wwwroot/chilichill"
DEFAULT_PORT="3001"
DEFAULT_DATA_DIR="/www/chilichill-data"
DEFAULT_MAIL_FROM_NAME="厚嘴唇空间站"
PROCESS_NAME="spaceport-api"
# ─────────────────────────────────────────────────────

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[1;32m✔\033[0m %s\n' "$1"; }
warn() { printf '    \033[1;33m⚠\033[0m %s\n' "$1"; }
fail() { printf '\n\033[1;31m✘ %s\033[0m\n' "$1"; exit 1; }

usage() { sed -n '2,15p' "$0" | cut -c3-; }

CURRENT_STEP="初始化"
trap 'printf "\n\033[1;31m✘ 部署在「%s」一步失败，请根据上方日志排查后重新执行本脚本（已完成步骤会自动跳过）。\033[0m\n" "$CURRENT_STEP"' ERR

ask() {  # ask <变量名> <提示语> <默认值>；直接回车取默认值
  local __reply=""
  read -rp "$(printf '\033[1;36m? %s [%s]: \033[0m' "$2" "$3")" __reply || __reply=""
  printf -v "$1" '%s' "${__reply:-$3}"
}

# ── 解析命令行参数 ─────────────────────────────────────
INSTALL_DIR="" API_PORT="" DATA_DIR=""
NEXT=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dir) NEXT=dir ;;
    --port) NEXT=port ;;
    --data-dir) NEXT=data ;;
    --dir=*) INSTALL_DIR="${1#*=}" ;;
    --port=*) API_PORT="${1#*=}" ;;
    --data-dir=*) DATA_DIR="${1#*=}" ;;
    *)
      case "$NEXT" in
        dir) INSTALL_DIR="$1" ;;
        port) API_PORT="$1" ;;
        data) DATA_DIR="$1" ;;
        *) warn "忽略未知参数: $1" ;;
      esac
      NEXT=""
      ;;
  esac
  shift
done

# ── 1. 环境检查 ────────────────────────────────────────
step "1. 环境检查"
command -v git >/dev/null 2>&1 || fail "未找到 git，请先安装（终端执行 apt install -y git）"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  fail "未找到 Node.js 22（当前: $(node -v 2>/dev/null || echo '无'))。宝塔软件商店安装「Node.js 版本管理器」→ 装 Node 22 并切换命令行版本"
fi
ok "Node.js $(node -v) / npm $(npm -v) / git $(git --version | awk '{print $3}')"
if ! command -v pm2 >/dev/null 2>&1; then
  warn "未找到 pm2（进程守护），稍后可先执行:  npm install -g pm2"
fi

# ── 2. 收集部署参数 ────────────────────────────────────
step "2. 收集部署参数"
if [ -z "$INSTALL_DIR" ]; then ask INSTALL_DIR "项目安装目录" "$DEFAULT_DIR"; fi
if [ -z "$API_PORT" ]; then ask API_PORT "API 端口（Nginx 反代到该端口，不对外）" "$DEFAULT_PORT"; fi
if [ -z "$DATA_DIR" ]; then ask DATA_DIR "数据目录（SQLite 数据库，放站点目录外便于备份）" "$DEFAULT_DATA_DIR"; fi
printf '%s' "$API_PORT" | grep -Eq '^[0-9]+$' || fail "API 端口需为纯数字，收到: $API_PORT"

printf '    安装目录: %s\n    API 端口: %s\n    数据目录: %s\n' "$INSTALL_DIR" "$API_PORT" "$DATA_DIR"

# ── 3. 获取代码 ────────────────────────────────────────
step "3. 获取代码"
if [ -d "$INSTALL_DIR/.git" ]; then
  cd "$INSTALL_DIR"
  git fetch origin main
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
    warn "本地代码落后于远端，尝试快进更新"
    git pull --ff-only origin main || warn "快进失败（本地有改动？），继续使用现有代码"
  fi
  ok "复用已有 git 仓库: $INSTALL_DIR（HEAD $(git rev-parse --short HEAD)）"
elif [ -e "$INSTALL_DIR" ]; then
  fail "$INSTALL_DIR 已存在但不是 git 仓库。请换一个目录，或参考 scripts/deploy-update.sh 头部说明把它改造为 git 仓库后重跑"
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "已 clone 到 $INSTALL_DIR（HEAD $(git rev-parse --short HEAD)）"
fi

# ── 4. 安装依赖并构建 ──────────────────────────────────
step "4. 安装依赖并构建（shared → api → web）"
npm ci
# npm/cli#4828：lock 在其他平台生成时缺当前平台 optional 原生依赖（rollup/esbuild）
if [ "$(uname -s)" = "Linux" ]; then
  MISSING_PKGS=""
  [ -d node_modules/@rollup/rollup-linux-x64-gnu ] || MISSING_PKGS="$MISSING_PKGS @rollup/rollup-linux-x64-gnu@$(node -p "require('./node_modules/rollup/package.json').version")"
  [ -d node_modules/@esbuild/linux-x64 ] || MISSING_PKGS="$MISSING_PKGS @esbuild/linux-x64@$(node -p "require('./node_modules/esbuild/package.json').version")"
  if [ -n "$MISSING_PKGS" ]; then
    warn "检测到缺失的 Linux 原生模块，补装:$MISSING_PKGS"
    npm install --no-save $MISSING_PKGS
  fi
fi
npm run build
ok "构建完成，前端产物: apps/web/dist"

# ── 5. 生成后端 .env ───────────────────────────────────
step "5. 生成后端环境变量（apps/api/.env）"
ENV_FILE="$INSTALL_DIR/apps/api/.env"
mkdir -p "$DATA_DIR"
RESEND_API_KEY=""
MAIL_FROM=""
MAIL_FROM_NAME="$DEFAULT_MAIL_FROM_NAME"
if [ -f "$ENV_FILE" ]; then
  warn ".env 已存在，不覆盖。请自行确认其中 NODE_ENV / JWT_SECRET / DATABASE_URL / 邮件配置正确"
else
  ask RESEND_API_KEY "Resend API 密钥（生产必填；可先留空，之后补进 .env）" ""
  ask MAIL_FROM "发件邮箱（须已在 Resend 完成域名验证，如 no-reply@example.com）" ""
  ask MAIL_FROM_NAME "发件显示名" "$DEFAULT_MAIL_FROM_NAME"
  if [ -n "$MAIL_FROM" ] && ! printf '%s' "$MAIL_FROM" | grep -q '@'; then
    warn "MAIL_FROM 不含 @，请确认是否填错"
  fi
  JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=$API_PORT
JWT_SECRET=$JWT_SECRET
DATABASE_URL=file:$DATA_DIR/prod.db
TRUST_PROXY=true
# 对外可访问地址：确定正式域名后改为 https://your-domain.com
PUBLIC_BASE_URL=http://localhost:$API_PORT
# 跨域白名单：同域部署（Nginx / EdgeOne 回源）无需配置
# CORS_ORIGINS=

# ── 邮件（Resend）：生产必填，缺失时后端拒绝启动 ──
RESEND_API_KEY=$RESEND_API_KEY
MAIL_FROM=$MAIL_FROM
MAIL_FROM_NAME=$MAIL_FROM_NAME

# ── 可选：腾讯云 COS 对象存储（推荐，四项齐全自动启用）──
# COS_SECRET_ID=
# COS_SECRET_KEY=
# COS_BUCKET=
# COS_REGION=
# COS_BASE_URL=
# COS_KEY_PREFIX=spaceport
EOF
  chmod 600 "$ENV_FILE"
  ok ".env 已生成（JWT_SECRET 已随机生成；文件权限 600）"
fi

# ── 6. 数据库迁移 + 基础数据 ───────────────────────────
step "6. 数据库迁移 + 基础数据 bootstrap"
cd "$INSTALL_DIR/apps/api"
npx prisma migrate deploy
npm run db:bootstrap
ok "表结构就绪；标签 / 城市大区映射 / 自动打标规则已写入（幂等，可重复执行）"
cd "$INSTALL_DIR"

# ── 7. 启动服务（PM2）─────────────────────────────────
ENV_COMPLETE=false
if grep -Eq '^RESEND_API_KEY=.+' "$ENV_FILE" && grep -Eq '^MAIL_FROM=.+' "$ENV_FILE"; then
  ENV_COMPLETE=true
fi

step "7. 启动服务"
if [ "$ENV_COMPLETE" != true ]; then
  warn "RESEND_API_KEY 或 MAIL_FROM 为空，生产环境会拒绝启动——请先编辑 $ENV_FILE 补齐邮件配置"
  warn "补齐后在 $INSTALL_DIR/apps/api 目录执行："
  printf '      \033[1;36mpm2 start npx --name %s -- tsx src/server.ts && pm2 save\033[0m\n' "$PROCESS_NAME"
else
  if command -v pm2 >/dev/null 2>&1; then
    if pm2 describe "$PROCESS_NAME" >/dev/null 2>&1; then
      pm2 reload "$PROCESS_NAME"
      ok "PM2 进程 $PROCESS_NAME 已重载"
    else
      (cd "$INSTALL_DIR/apps/api" && pm2 start npx --name "$PROCESS_NAME" -- tsx src/server.ts)
      pm2 save
      ok "PM2 进程 $PROCESS_NAME 已启动并保存列表（pm2 save）"
      warn "开机自启：执行 pm2 startup，按输出提示再执行打印的命令"
    fi
    CURRENT_STEP="健康检查"
    sleep 2
    HEALTH_OK=false
    for _ in $(seq 1 10); do
      if curl -fs "http://localhost:$API_PORT/api/activities?limit=1" >/dev/null 2>&1; then HEALTH_OK=true; break; fi
      sleep 2
    done
    if [ "$HEALTH_OK" = true ]; then
      ok "API 探活成功（http://localhost:$API_PORT）"
    else
      warn "API 探活失败，查看日志:  pm2 logs $PROCESS_NAME"
      exit 1
    fi
  else
    warn "未安装 pm2。先执行:  npm install -g pm2"
    warn "然后在 $INSTALL_DIR/apps/api 目录执行:"
    printf '      \033[1;36mpm2 start npx --name %s -- tsx src/server.ts && pm2 save\033[0m\n' "$PROCESS_NAME"
  fi
fi

# ── 8. 收尾清单 ────────────────────────────────────────
printf '\n\033[1;36m==> 部署完成，收尾清单\033[0m\n'
cat <<EOF

  1. Nginx 建站：按 README「方案 A」第 5 节配置（静态根目录指向
     $INSTALL_DIR/apps/web/dist，/api、/uploads 反代 127.0.0.1:$API_PORT）
     安全组只放行 80/443，$API_PORT 不对外。
  2. 创建管理员：打开网站 → 登录弹窗注册账号（真实邮箱收验证码），然后执行：
       cd $INSTALL_DIR && npm run admin:promote --workspace=@spaceport/api -- 你@example.com
     退出重新登录，侧边栏出现「管理后台」入口。
  3. 邮件配置若刚才留空：编辑 $ENV_FILE 填入 RESEND_API_KEY 与 MAIL_FROM，
     再执行:  pm2 reload $PROCESS_NAME
  4. 定时备份 SQLite（宝塔计划任务示例见 README「7. 备份」）。
  5. 日常更新一条命令:  $INSTALL_DIR/scripts/deploy-update.sh
EOF
