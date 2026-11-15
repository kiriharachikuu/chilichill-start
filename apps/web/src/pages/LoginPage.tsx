import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, Orbit, Sparkles, UserRound } from 'lucide-react';
import { api, formatApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { parseExternalTarget, safeRedirectPath } from '../lib/redirect';
import Button from '../components/Button';
import Card from '../components/Card';
import EmailCodeField from '../components/EmailCodeField';
import { Field, Input } from '../components/Field';
import { useToast } from '../components/Toast';

type Tab = 'login' | 'register' | 'reset';

// 演示账号仅存在于开发构建，生产包中该数组为空且整段 UI 被移除
const DEMO_ACCOUNTS = import.meta.env.DEV
  ? [
      { label: '管理员', email: 'admin@spaceport.dev', password: 'Admin123!' },
      { label: '体验用户', email: 'demo@spaceport.dev', password: 'Demo1234!' },
    ]
  : [];

export default function LoginPage() {
  const [params] = useSearchParams();
  // next 为外链时：站内回退 /，登录成功后跳外链二次确认页
  const externalTarget = parseExternalTarget(params.get('next'));
  const next = externalTarget ? '/' : safeRedirectPath(params.get('next'));
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = '请输入有效的邮箱地址';
    if (password.length < 8) nextErrors.password = '密码至少 8 位';
    if (tab === 'register' && nickname.trim().length < 2) nextErrors.nickname = '昵称至少 2 个字';
    if ((tab === 'register' || tab === 'reset') && !/^\d{6}$/.test(code)) {
      nextErrors.code = '请输入 6 位数字验证码';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (tab === 'login') {
        await login(email.trim(), password);
        toast.success('登舱成功，祝你探索愉快');
      } else if (tab === 'register') {
        await register(email.trim(), password, nickname.trim(), code);
        toast.success('账号已创建，欢迎加入空间站');
      } else {
        await api.post<void>('/api/auth/reset-password', { email: email.trim(), code, password });
        toast.success('密码已重置，请用新密码登录');
        setTab('login');
        setPassword('');
        setCode('');
        return;
      }
      if (externalTarget) {
        navigate(`/redirect?target=${encodeURIComponent(externalTarget)}`, { replace: true });
      } else {
        navigate(next, { replace: true });
      }
    } catch (error) {
      // 网络/超时/限流错误均带友好中文提示；限流错误附加重试等待秒数
      setServerError(formatApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.9fr] lg:items-start lg:py-12">
      <div className="hidden lg:block">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber/30 bg-amber/10 text-amber shadow-glow">
          <Orbit className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-wide text-ink sm:text-3xl">
          登录你的空间站通行证
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          登舱后可以投递群与站点信号、追踪审核进度，并在内容通过后申请修改。你的投稿会记录在个人轨道上。
        </p>
        {DEMO_ACCOUNTS.length > 0 && (
          <div className="mt-6 space-y-3">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setTab('login');
                  setEmail(account.email);
                  setPassword(account.password);
                  setErrors({});
                }}
                className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-amber/40 hover:bg-white/[0.06]"
              >
                <span>
                  <span className="block text-xs text-muted">{account.label}演示账号</span>
                  <span className="mt-0.5 block font-mono text-xs text-ink">{account.email}</span>
                </span>
                <span className="rounded-lg border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] text-amber">
                  填入
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Card hover={false} className="p-6 sm:p-8">
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {(['login', 'register'] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTab(item);
                setCode('');
                setErrors({});
                setServerError('');
              }}
              className={`rounded-lg py-2 text-sm transition ${
                tab === item ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:text-ink'
              }`}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          {tab === 'register' ? (
            <Field label="昵称" required error={errors.nickname}>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
                <Input
                  value={nickname}
                  maxLength={20}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="空间站里怎么称呼你"
                  className="pl-10"
                />
              </div>
            </Field>
          ) : null}

          <Field label="邮箱" required error={errors.email}>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <Input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="pl-10"
              />
            </div>
          </Field>

          {tab === 'register' || tab === 'reset' ? (
            <EmailCodeField
              email={email}
              value={code}
              onChange={setCode}
              error={errors.code}
              disabled={submitting}
              sendEndpoint={tab === 'reset' ? '/api/auth/forgot-password' : '/api/auth/email-code'}
            />
          ) : null}

          <Field
            label={tab === 'reset' ? '新密码' : '密码'}
            required
            error={errors.password}
            hint={tab === 'login' ? undefined : '至少 8 位字符'}
          >
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted/60" />
              <Input
                type="password"
                value={password}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={tab === 'reset' ? '设置新密码' : '输入密码'}
                className="pl-10"
              />
            </div>
          </Field>

          {serverError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-3.5 py-2.5 text-xs leading-relaxed text-coral">
              {serverError}
            </div>
          ) : null}

          <Button type="submit" fullWidth size="lg" loading={submitting}>
            {tab === 'login' ? '登舱' : tab === 'register' ? '创建通行证' : '重置密码'}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-muted">
          {tab === 'login' ? (
            <>
              还没有账号？{' '}
              <button type="button" onClick={() => setTab('register')} className="text-amber hover:underline">
                注册一个
              </button>
              <span className="mx-2 text-muted/50">·</span>
              <button
                type="button"
                onClick={() => {
                  setTab('reset');
                  setCode('');
                  setErrors({});
                  setServerError('');
                }}
                className="text-amber hover:underline"
              >
                忘记密码？
              </button>
            </>
          ) : tab === 'reset' ? (
            <>
              想起密码了？{' '}
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setCode('');
                  setErrors({});
                  setServerError('');
                }}
                className="text-amber hover:underline"
              >
                直接登录
              </button>
            </>
          ) : (
            <>
              已有账号？{' '}
              <button type="button" onClick={() => setTab('login')} className="text-amber hover:underline">
                直接登录
              </button>
            </>
          )}
        </p>

        {DEMO_ACCOUNTS.length > 0 && (
          <div className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:hidden">
            <p className="flex items-center gap-1.5 text-[11px] text-amber">
              <Sparkles className="h-3.5 w-3.5" /> 演示账号（点击填入）
            </p>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setTab('login');
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className="block w-full text-left font-mono text-[11px] text-muted transition hover:text-ink"
              >
                {account.email} / {account.password}
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-muted/70">
          <Link to="/" className="transition hover:text-amber">
            先随便逛逛
          </Link>
        </p>
      </Card>
    </div>
  );
}
