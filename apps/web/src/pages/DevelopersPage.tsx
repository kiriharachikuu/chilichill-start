import { useCallback, type MouseEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Download,
  FileCode2,
  KeyRound,
  Lock,
  MessageSquareWarning,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Terminal,
  UserCheck,
} from 'lucide-react';
import SectionHeading from '../components/SectionHeading';
import { buttonClass } from '../components/Button';

// SDK 下载产物路径（构建时由 public/ 原样拷贝，无需打包）
const SDK_URL = '/sdk/spaceport-open-sdk.js';
const SDK_VERSION = 'v1.0.0';
const OAUTH_CODE_TTL = '10 分钟';
const OAUTH_TOKEN_TTL = '7 天';

// ===== 文档目录（侧边导航与正文锚点共用） =====
const TOC = [
  { id: 'overview', label: '概述' },
  { id: 'quickstart', label: '快速开始' },
  { id: 'flow', label: '接入流程' },
  { id: 'api', label: '接口文档' },
  { id: 'errors', label: '错误码' },
  { id: 'sdk', label: 'SDK 参考' },
  { id: 'examples', label: '完整示例' },
  { id: 'security', label: '安全与规范' },
  { id: 'faq', label: '常见问题' },
];

// ===== 基础排版组件 =====

function DocSection({ id, icon, title, children }: { id: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border border-space-200 bg-white px-5 py-5">
      <h2 className="flex items-center gap-2 text-base font-black text-ink">
        {icon}
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function CodeBlock({ title, children }: { title?: string; children: string }) {
  return (
    <div>
      {title ? <p className="mb-1.5 text-xs font-bold text-ink">{title}</p> : null}
      <pre className="overflow-x-auto border border-space-200 bg-space-50 px-4 py-3 font-mono text-xs leading-relaxed text-ink">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return <code className="border border-space-200 bg-space-50 px-1 py-0.5 font-mono text-xs text-ink">{children}</code>;
}

interface ParamRow {
  name: string;
  type: string;
  required: string;
  desc: string;
}

function ParamTable({ rows }: { rows: ParamRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-space-200 text-left text-muted/80">
            <th className="py-2 pr-3 font-bold">参数</th>
            <th className="py-2 pr-3 font-bold">类型</th>
            <th className="py-2 pr-3 font-bold">必填</th>
            <th className="py-2 font-bold">说明</th>
          </tr>
        </thead>
        <tbody className="text-muted">
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-space-200/60 last:border-0">
              <td className="py-2 pr-3 font-mono text-ink">{row.name}</td>
              <td className="py-2 pr-3">{row.type}</td>
              <td className="py-2 pr-3">{row.required}</td>
              <td className="py-2 leading-relaxed">{row.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorTable({ rows }: { rows: { code: string; status: string; scene: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-space-200 text-left text-muted/80">
            <th className="py-2 pr-3 font-bold">错误码</th>
            <th className="py-2 pr-3 font-bold">HTTP 状态</th>
            <th className="py-2 font-bold">出现场景</th>
          </tr>
        </thead>
        <tbody className="text-muted">
          {rows.map((row) => (
            <tr key={row.code} className="border-b border-space-200/60 last:border-0">
              <td className="py-2 pr-3 font-mono text-ink">{row.code}</td>
              <td className="py-2 pr-3">{row.status}</td>
              <td className="py-2 leading-relaxed">{row.scene}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 接口条目：方法徽标 + 路径 + 说明 + 参数表 + 响应示例 */
function Endpoint({
  method,
  path,
  title,
  desc,
  params,
  response,
  children,
}: {
  method: 'GET' | 'POST';
  path: string;
  title: string;
  desc: ReactNode;
  params: ParamRow[];
  response: string;
  children?: ReactNode;
}) {
  const toneClass =
    method === 'GET'
      ? 'border-mint/50 bg-mint/10 text-mint'
      : 'border-amber-300 bg-amber-50 text-amber-700';
  return (
    <div className="space-y-3 border-t border-space-200 pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${toneClass}`}>
          {method}
        </span>
        <code className="font-mono text-sm font-bold text-ink">{path}</code>
        <span className="text-xs text-muted/70">{title}</span>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-muted">
        {desc}
        {children}
      </div>
      <ParamTable rows={params} />
      <CodeBlock title="响应示例">{response}</CodeBlock>
    </div>
  );
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <div className="border border-space-200 bg-space-50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
        <CircleHelp className="h-4 w-4 shrink-0 text-amber" />
        {question}
      </p>
      <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-muted">{children}</div>
    </div>
  );
}

// ===== 页面内容 =====

export default function DevelopersPage() {
  // 锚点平滑滚动（BrowserRouter 下避免依赖 hash 路由）
  const scrollTo = useCallback((event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="Open Platform"
        title="空间站开放平台"
        description="其他网站可接入空间站通行证，实现「使用空间站通行证登录」。基于标准 OAuth2 授权码模式，用户逐次确认授权，第三方仅获取基础信息。"
        action={
          <a href={SDK_URL} download className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <Download className="h-4 w-4" />
            下载 SDK {SDK_VERSION}
          </a>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[12rem_1fr] lg:items-start">
        {/* 侧边目录：桌面端固定跟随滚动 */}
        <nav className="hidden lg:sticky lg:top-24 lg:block">
          <div className="border border-space-200 bg-white px-4 py-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60">目录</p>
            <ul className="space-y-1">
              {TOC.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(event) => scrollTo(event, item.id)}
                    className="group flex items-center gap-1 py-1 text-xs text-muted transition-colors hover:text-amber"
                  >
                    <ChevronRight className="h-3 w-3 text-muted/40 transition group-hover:text-amber" />
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-space-200 pt-2 text-[10px] leading-relaxed text-muted/60">
              文档版本 {SDK_VERSION}
              <br />
              授权码有效期 {OAUTH_CODE_TTL}
              <br />
              访问令牌有效期 {OAUTH_TOKEN_TTL}
            </p>
          </div>
        </nav>

        {/* 正文 */}
        <div className="min-w-0 space-y-4">
          {/* ===== 概述 ===== */}
          <DocSection id="overview" icon={<BookOpen className="h-4 w-4 text-amber" />} title="概述">
            <p>
              空间站开放平台为粉丝自建站点提供统一的空间站通行证授权登录能力：用户在接入方网站点击「使用空间站通行证登录」，
              跳转到空间站授权页确认后，接入方即可凭授权码换取访问令牌、识别用户身份并建立自己的登录态。
            </p>
            <p>协议采用业界标准的 <strong className="text-ink">OAuth2 授权码模式</strong>（Authorization Code Flow），适合有服务端的网站接入。</p>
            <div className="space-y-1.5 pt-1">
              <p className="flex items-start gap-2 text-xs">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                <span><strong className="text-ink">最小化信息：</strong>授权范围固定为基础信息（用户 ID、uid、昵称、头像），不提供邮箱等隐私字段。</span>
              </p>
              <p className="flex items-start gap-2 text-xs">
                <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                <span><strong className="text-ink">用户逐次确认：</strong>每次授权都需用户在空间站授权页显式点击「同意授权」，无静默授权。</span>
              </p>
              <p className="flex items-start gap-2 text-xs">
                <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                <span><strong className="text-ink">实时失效：</strong>站长在后台禁用应用、用户的空间站通行证被封禁或注销后，已签发的令牌立即失效。</span>
              </p>
            </div>
          </DocSection>

          {/* ===== 快速开始 ===== */}
          <DocSection id="quickstart" icon={<Rocket className="h-4 w-4 text-amber" />} title="快速开始">
            <p>
              只需四步即可完成接入。已下载 SDK 的话，前端与服务端各约十行代码：
            </p>
            <CodeBlock title="1. 前端：登录按钮跳转授权页">{`<script src="https://<空间站域名>/sdk/spaceport-open-sdk.js"></script>
<button onclick="loginWithSpaceport()">使用空间站通行证登录</button>
<script>
  function loginWithSpaceport() {
    location.href = SpaceportOpen.buildAuthorizeUrl({
      apiBase: 'https://<空间站域名>',
      clientId: 'sp_xxxxxxxxxxxxxxxx',
      redirectUri: 'https://your-site.example.com/auth/callback',
    });
  }
</script>`}</CodeBlock>
            <CodeBlock title="2. 回调页：校验 state 并取出授权码">{`const callback = SpaceportOpen.handleCallback();
if (!callback.ok) {
  // 用户拒绝（error=access_denied）或 state 校验失败
  alert('授权未完成：' + callback.error);
} else {
  // 将 code 发给你自己的服务端完成登录
  fetch('/auth/spaceport', { method: 'POST', body: callback.code });
}`}</CodeBlock>
            <CodeBlock title="3. 服务端（Node.js）：授权码换令牌，读取用户信息">{`const SpaceportOpen = require('./spaceport-open-sdk.js');

const token = await SpaceportOpen.exchangeCode({
  apiBase: 'https://<空间站域名>',
  clientId: 'sp_xxxxxxxxxxxxxxxx',
  clientSecret: process.env.SPACEPORT_CLIENT_SECRET, // 只放服务端
  redirectUri: 'https://your-site.example.com/auth/callback',
  code: req.body.code,
});

const { user } = await SpaceportOpen.fetchUserInfo({
  apiBase: 'https://<空间站域名>',
  accessToken: token.access_token,
});
// user = { id, uid, nickname, avatarUrl } → 建立自己的会话
`}</CodeBlock>
            <p className="text-xs">
              完整可运行的示例见下方<a href="#examples" onClick={(e) => scrollTo(e, 'examples')} className="text-amber underline underline-offset-2">「完整示例」</a>。
            </p>
          </DocSection>

          {/* ===== 接入流程 ===== */}
          <DocSection id="flow" icon={<KeyRound className="h-4 w-4 text-amber" />} title="接入流程">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                {
                  title: '申请接入',
                  desc: '联系站长，由管理员在后台「接入应用」创建应用。创建后立即保存 client_id 与 client_secret（secret 仅展示这一次）。',
                },
                {
                  title: '配置回调白名单',
                  desc: '向站长提供回调地址（生产环境建议 https）。白名单为精确匹配——协议、域名、路径、query 都必须完全一致，不做前缀匹配。',
                },
                {
                  title: '引导用户授权',
                  desc: '在登录页放置跳转链接（SDK 的 buildAuthorizeUrl 会自动生成随机 state 并暂存）。用户在授权页确认后携带授权码回到回调地址。',
                },
                {
                  title: '换取令牌并登录',
                  desc: '服务端用 client_secret 换取访问令牌（响应已附带用户基础信息，可按需再调 userinfo），随后按你的方式建立登录态。',
                },
              ].map((step, index) => (
                <div key={step.title} className="border border-space-200 px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-black text-ink">
                    <span className="text-xs text-muted/70">{String(index + 1).padStart(2, '0')}</span>
                    {step.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">{step.desc}</p>
                </div>
              ))}
            </div>
          </DocSection>

          {/* ===== 接口文档 ===== */}
          <DocSection id="api" icon={<Terminal className="h-4 w-4 text-amber" />} title="接口文档">
            <p className="text-xs">
              下文 <InlineCode>&lt;空间站域名&gt;</InlineCode> 指空间站部署地址；所有响应均为 JSON；错误响应统一为{' '}
              <InlineCode>{'{"error": {"code": "...", "message": "..."}}'}</InlineCode> 结构。
            </p>

            <Endpoint
              method="GET"
              path="/oauth/authorize"
              title="授权页（浏览器跳转地址）"
              desc={
                <p>
                  这是<strong className="text-ink">页面地址</strong>而非 API，直接将用户重定向过去。空间站会校验应用状态与回调白名单：
                  非法请求返回 400 JSON，绝不重定向（防开放重定向）。用户在此页登录并确认授权。
                </p>
              }
              params={[
                { name: 'client_id', type: 'string', required: '是', desc: '后台分配的应用标识，格式 sp_ 前缀' },
                { name: 'redirect_uri', type: 'string', required: '是', desc: '回调地址，必须与白名单中某一项完全一致（建议 URL 编码）' },
                { name: 'state', type: 'string', required: '是', desc: '随机字符串（建议 ≥32 字符），防 CSRF；授权后原样回传，接入方必须校验' },
                { name: 'scope', type: 'string', required: '否', desc: '授权范围，默认 basic（当前唯一取值）' },
              ]}
              response={`用户确认授权后 302 跳回：
https://your-site.example.com/auth/callback?code=<授权码>&state=<原样回传>

用户拒绝授权时跳回：
https://your-site.example.com/auth/callback?error=access_denied&state=<原样回传>`}
            />

            <Endpoint
              method="POST"
              path="/api/oauth/token"
              title="授权码换取访问令牌（服务端调用）"
              desc={
                <p>
                  授权码 <InlineCode>{OAUTH_CODE_TTL}</InlineCode> 内一次性有效。请求体支持{' '}
                  <InlineCode>application/x-www-form-urlencoded</InlineCode>（推荐，OAuth2 规范编码）与 JSON 两种格式。
                  本接口有 IP 维度限流（20 次/分钟）。
                </p>
              }
              params={[
                { name: 'grant_type', type: 'string', required: '是', desc: '固定值 authorization_code' },
                { name: 'client_id', type: 'string', required: '是', desc: '应用标识' },
                { name: 'client_secret', type: 'string', required: '是', desc: '应用密钥（64 位 hex），只可在服务端使用' },
                { name: 'code', type: 'string', required: '是', desc: '回调携带的授权码' },
                { name: 'redirect_uri', type: 'string', required: '是', desc: '必须与发起授权时完全一致，否则交换失败' },
              ]}
              response={`{
  "access_token": "（64 位随机串）",
  "token_type": "Bearer",
  "expires_in": 604800,
  "scope": "basic",
  "user": {
    "id": "cuid",
    "uid": 100001,
    "nickname": "昵称",
    "avatarUrl": null
  }
}`}
            >
              <p className="text-xs">
                说明：<InlineCode>expires_in</InlineCode> 单位为秒（{OAUTH_TOKEN_TTL}）；
                <InlineCode>user</InlineCode> 已随令牌一次返回，接入方可直接使用，无需再调 userinfo。
              </p>
            </Endpoint>

            <Endpoint
              method="GET"
              path="/api/oauth/userinfo"
              title="读取用户基础信息（服务端调用）"
              desc={<p>使用访问令牌读取当前授权用户的基础信息。令牌过期、应用被禁用或通行证状态异常时返回 401。</p>}
              params={[
                {
                  name: 'Authorization',
                  type: 'header',
                  required: '是',
                  desc: '格式：Bearer <access_token>',
                },
              ]}
              response={`{
  "user": {
    "id": "cuid",
    "uid": 100001,
    "nickname": "昵称",
    "avatarUrl": "头像地址或 null"
  }
}`}
            />

            <p className="text-xs leading-relaxed">
              字段说明：<InlineCode>id</InlineCode> 为空间站内部唯一 ID（字符串，终身不变）；
              <InlineCode>uid</InlineCode> 为 6 位数字对外编号（个人空间地址 <InlineCode>/space/:uid</InlineCode>）；
              接入方应以 <InlineCode>id</InlineCode> 作为用户唯一键。
            </p>
          </DocSection>

          {/* ===== 错误码 ===== */}
          <DocSection id="errors" icon={<MessageSquareWarning className="h-4 w-4 text-amber" />} title="错误码">
            <ErrorTable
              rows={[
                { code: 'VALIDATION_ERROR', status: '400', scene: '参数缺失或格式不合法（如缺少 state、grant_type 取值错误）' },
                { code: 'INVALID_CLIENT', status: '400', scene: 'authorize 接口：client_id 不存在或应用已被禁用' },
                { code: 'INVALID_CLIENT', status: '401', scene: 'token 接口：client_id / client_secret 不正确（含密钥重置后用旧密钥）' },
                { code: 'INVALID_REDIRECT_URI', status: '400', scene: '回调地址未在应用白名单注册（或与白名单不完全一致）' },
                { code: 'INVALID_GRANT', status: '400', scene: '授权码无效：已使用 / 已过期 / 与 redirect_uri 不一致 / 用户状态异常' },
                { code: 'INVALID_TOKEN', status: '401', scene: '访问令牌无效：已过期 / 已吊销 / 应用被禁用 / 用户被封禁' },
                { code: 'OAUTH_TOKEN_LIMIT', status: '429', scene: 'token 接口触发 IP 限流（20 次/分钟），响应含 retryAfterSeconds' },
                { code: 'OAUTH_CONFIRM_LIMIT', status: '429', scene: '用户授权确认触发限流（30 次/分钟）' },
                { code: 'UNAUTHORIZED', status: '401', scene: 'confirm 接口未携带登录态（用户未登录空间站）' },
              ]}
            />
            <p className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              <span>
                出于安全考虑，<InlineCode>INVALID_GRANT</InlineCode> 不区分「已使用 / 已过期 / 不一致」等具体原因；
                <InlineCode>INVALID_CLIENT</InlineCode> 也不会区分「应用不存在」与「密钥错误」，请勿依赖错误码做业务分支之外的事情。
              </span>
            </p>
          </DocSection>

          {/* ===== SDK 参考 ===== */}
          <DocSection id="sdk" icon={<FileCode2 className="h-4 w-4 text-amber" />} title="SDK 参考">
            <p>
              官方 JavaScript SDK（{SDK_VERSION}）：零依赖、单文件 UMD 构建，浏览器与 Node.js 双端通用。
              浏览器端负责生成授权跳转与回调校验，服务端负责令牌交换与用户信息读取。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a href={SDK_URL} download className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                <Download className="h-4 w-4" />
                下载 SDK {SDK_VERSION}
              </a>
              <a href={SDK_URL} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                在线查看源码
              </a>
              <span className="text-xs text-muted/70">全局命名空间 SpaceportOpen / 模块导出 module.exports</span>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <p className="font-mono text-sm font-bold text-ink">buildAuthorizeUrl(options)</p>
                <p className="mt-1 text-xs">
                  生成授权页地址并自动生成随机 state 暂存到 sessionStorage。<strong className="text-ink">浏览器专用</strong>，返回完整 URL 字符串。
                </p>
                <div className="mt-2">
                  <ParamTable
                    rows={[
                      { name: 'options.apiBase', type: 'string', required: '是', desc: '空间站 API 根地址，如 https://spaceport.example.com' },
                      { name: 'options.clientId', type: 'string', required: '是', desc: '后台分配的应用标识' },
                      { name: 'options.redirectUri', type: 'string', required: '是', desc: '已在白名单注册的回调地址' },
                      { name: 'options.scope', type: 'string', required: '否', desc: '授权范围，默认 basic' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <p className="font-mono text-sm font-bold text-ink">handleCallback(options?)</p>
                <p className="mt-1 text-xs">
                  在回调地址页调用：校验 state 防 CSRF、取出授权码并清理暂存。<strong className="text-ink">浏览器专用</strong>，同步返回结果对象。
                </p>
                <CodeBlock>{`{ ok: true,  code: '...', state: '...' }              // 授权成功
{ ok: false, error: 'access_denied', ... }             // 用户拒绝授权
{ ok: false, error: 'invalid_state', ... }             // state 校验失败（CSRF 风险）
{ ok: false, error: 'invalid_request', ... }           // 回调缺少 code / state`}</CodeBlock>
                <div className="mt-2">
                  <ParamTable
                    rows={[
                      { name: 'options.search', type: 'string', required: '否', desc: '回调 URL 的 query 串；缺省时读取当前页面 location.search' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <p className="font-mono text-sm font-bold text-ink">exchangeCode(options)</p>
                <p className="mt-1 text-xs">
                  授权码换取访问令牌。<strong className="text-ink">服务端专用</strong>（client_secret 绝不能出现在前端），返回 Promise。
                </p>
                <div className="mt-2">
                  <ParamTable
                    rows={[
                      { name: 'options.apiBase', type: 'string', required: '是', desc: '空间站 API 根地址' },
                      { name: 'options.clientId', type: 'string', required: '是', desc: '应用标识' },
                      { name: 'options.clientSecret', type: 'string', required: '是', desc: '应用密钥，建议从环境变量读取' },
                      { name: 'options.redirectUri', type: 'string', required: '是', desc: '必须与授权时完全一致' },
                      { name: 'options.code', type: 'string', required: '是', desc: '回调拿到的授权码' },
                    ]}
                  />
                </div>
                <p className="mt-1.5 text-xs">失败时抛出 Error，message 已翻译为中文并附带错误码。</p>
              </div>

              <div>
                <p className="font-mono text-sm font-bold text-ink">fetchUserInfo(options)</p>
                <p className="mt-1 text-xs">
                  读取授权用户的基础信息。<strong className="text-ink">服务端专用</strong>，返回 Promise，resolve 值为{' '}
                  <InlineCode>{'{ user: { id, uid, nickname, avatarUrl } }'}</InlineCode>。
                </p>
                <div className="mt-2">
                  <ParamTable
                    rows={[
                      { name: 'options.apiBase', type: 'string', required: '是', desc: '空间站 API 根地址' },
                      { name: 'options.accessToken', type: 'string', required: '是', desc: 'exchangeCode 返回的访问令牌' },
                    ]}
                  />
                </div>
              </div>
            </div>
          </DocSection>

          {/* ===== 完整示例 ===== */}
          <DocSection id="examples" icon={<Terminal className="h-4 w-4 text-amber" />} title="完整示例">
            <p>
              以下是一个 Node.js + Express 接入方的最小可运行示例（前端两个页面 + 服务端两个接口），复制后替换域名与凭证即可联调。
            </p>
            <CodeBlock title="server.js（Express 服务端）">{`const express = require('express');
const cookie = require('cookie'); // 或使用你已有的会话方案
const SpaceportOpen = require('./spaceport-open-sdk.js');

const app = express();
app.use(express.json());

const API_BASE = 'https://<空间站域名>';
const CLIENT_ID = 'sp_xxxxxxxxxxxxxxxx';
const CLIENT_SECRET = process.env.SPACEPORT_CLIENT_SECRET;
const REDIRECT_URI = 'https://your-site.example.com/auth/callback';

// 授权回调：空间站携带 code 跳回这里
app.get('/auth/callback', async (req, res) => {
  try {
    const token = await SpaceportOpen.exchangeCode({
      apiBase: API_BASE,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      redirectUri: REDIRECT_URI,
      code: req.query.code,
    });
    // token.user = { id, uid, nickname, avatarUrl }
    // 演示：把用户信息写进 cookie（生产请使用服务端会话）
    res.setHeader('Set-Cookie', cookie.serialize('demo_user', JSON.stringify(token.user), { httpOnly: true }));
    res.redirect('/me');
  } catch (error) {
    res.status(400).send('登录失败：' + error.message);
  }
});

// 个人信息页
app.get('/me', (req, res) => {
  const raw = cookie.parse(req.headers.cookie || '').demo_user;
  if (!raw) return res.redirect('/');
  const user = JSON.parse(raw);
  res.send(\`欢迎，\${user.nickname}（uid:\${user.uid ?? '-'}）<a href="/">返回</a>\`);
});

app.listen(3000);`}</CodeBlock>
            <CodeBlock title="index.html（登录入口页）">{`<script src="https://<空间站域名>/sdk/spaceport-open-sdk.js"></script>
<a href="javascript:void 0" onclick="location.href = SpaceportOpen.buildAuthorizeUrl({
  apiBase: 'https://<空间站域名>',
  clientId: 'sp_xxxxxxxxxxxxxxxx',
  redirectUri: 'https://your-site.example.com/auth/callback',
})">使用空间站通行证登录</a>`}</CodeBlock>
            <p className="text-xs">
              回调页 <InlineCode>/auth/callback</InlineCode> 的前端无需额外脚本：示例直接在服务端读取 query 中的 code。
              若你的回调由前端处理，请改用 <InlineCode>SpaceportOpen.handleCallback()</InlineCode> 校验 state 后再把 code 提交到服务端。
            </p>
          </DocSection>

          {/* ===== 安全与规范 ===== */}
          <DocSection id="security" icon={<Lock className="h-4 w-4 text-amber" />} title="安全与规范">
            <p>
              <strong className="text-ink">client_secret 保管：</strong>
              secret 仅在创建/重置时展示一次，请保存在服务端环境变量，绝不可出现在前端代码、URL 或日志中。
              怀疑泄露时请立即联系站长在后台重置密钥——重置后旧 secret 即刻失效。
            </p>
            <p>
              <strong className="text-ink">state 校验：</strong>
              授权请求必须携带随机 state 并在回调时比对（SDK 已自动完成），防止攻击者伪造授权回调把受害者登录到攻击者的通行证。
            </p>
            <p>
              <strong className="text-ink">令牌时效与失效：</strong>
              授权码 {OAUTH_CODE_TTL} 内一次性有效；访问令牌 {OAUTH_TOKEN_TTL} 有效，到期请引导用户重新授权。
              站长禁用应用、用户被封禁或注销时令牌实时失效，接入方应将 401 <InlineCode>INVALID_TOKEN</InlineCode> 视为「需要重新登录」。
            </p>
            <p>
              <strong className="text-ink">回调白名单：</strong>
              精确匹配协议、域名、路径与 query；生产环境请使用 https。变更回调地址需联系站长更新白名单。
            </p>
            <p>
              <strong className="text-ink">合规使用：</strong>
              不得将授权获取的用户信息用于授权登录以外的用途，不得转售或共享给第三方，不得在用户退出后继续持有其空间站身份数据。
              违规接入将被禁用并收回凭证。
            </p>
          </DocSection>

          {/* ===== 常见问题 ===== */}
          <DocSection id="faq" icon={<CircleHelp className="h-4 w-4 text-amber" />} title="常见问题">
            <div className="space-y-2">
              <FaqItem question="换令牌报 INVALID_GRANT 是什么原因？">
                <p>常见原因按概率排序：① 授权码已被使用（code 一次性）；② 超过 {OAUTH_CODE_TTL} 未交换；③ 交换时的 redirect_uri 与发起授权时不一致；④ 授权用户通行证状态异常。请检查 ②③ 后引导用户重新发起授权。</p>
              </FaqItem>
              <FaqItem question="能否在浏览器前端直接换令牌？">
                <p>不能。交换令牌需要 client_secret，出现在前端即视为泄露。标准做法是前端把 code 提交到自己的服务端，由服务端完成交换。空间站的 CORS 策略也不会放行第三方域名的浏览器内调用。</p>
              </FaqItem>
              <FaqItem question="开发调试可以用 localhost 吗？">
                <p>可以，回调白名单允许 http 与 https，本地调试可注册 http://localhost:xxxx/callback。但线上环境必须使用 https。</p>
              </FaqItem>
              <FaqItem question="令牌过期或失效后怎么办？">
                <p>收到 401 INVALID_TOKEN 后，清除本地登录态并引导用户重新走一次授权流程即可。当前不提供刷新令牌，也无静默续期。</p>
              </FaqItem>
              <FaqItem question="如何更换回调地址或重置密钥？">
                <p>联系站长在后台「接入应用」中更新白名单；重置密钥会生成新 secret（仅展示一次），旧 secret 立即失效，请同步更新服务端配置。</p>
              </FaqItem>
              <FaqItem question="能获取用户邮箱或手机号吗？">
                <p>不能。授权范围当前仅基础信息（id、uid、昵称、头像），这是平台刻意设定的最小化披露原则。</p>
              </FaqItem>
            </div>
          </DocSection>
        </div>
      </div>
    </div>
  );
}
