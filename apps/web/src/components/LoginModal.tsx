import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Mail, UserRound } from 'lucide-react';
import { api, formatApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { loadMeta } from '../lib/meta';
import Button from '../components/Button';
import EmailCodeField from '../components/EmailCodeField';
import Modal from '../components/Modal';
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

interface LoginDialogContextValue {
  openLogin: () => void;
}

const LoginDialogContext = createContext<LoginDialogContextValue | null>(null);

export function useLoginDialog(): LoginDialogContextValue {
  const context = useContext(LoginDialogContext);
  if (!context) {
    throw new Error('useLoginDialog 必须在 LoginDialogProvider 内使用');
  }
  return context;
}

export function LoginDialogProvider({
  children,
  loginOpen,
  setLoginOpen,
}: {
  children: ReactNode;
  loginOpen: boolean;
  setLoginOpen: (open: boolean) => void;
}) {
  return (
    <LoginDialogContext.Provider value={{ openLogin: () => setLoginOpen(true) }}>
      {children}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </LoginDialogContext.Provider>
  );
}

function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  // 合规要求：注册默认不勾选协议，未勾选时注册按钮置灰
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 注册是否需要邮箱验证码由后台「注册设置」控制，默认 true 与历史行为一致
  const [emailCodeRequired, setEmailCodeRequired] = useState(true);
  const { login, register } = useAuth();
  const toast = useToast();

  // 弹窗打开时拉取站点元数据中的注册开关（meta 缓存失败时保持默认开启）
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void loadMeta().then((meta) => {
      if (alive) setEmailCodeRequired(meta.registration.emailCodeRequired);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = '请输入有效的邮箱地址';
    if (password.length < 8) nextErrors.password = '密码至少 8 位';
    if (tab === 'register' && nickname.trim().length < 2) nextErrors.nickname = '昵称至少 2 个字';
    if (tab === 'register' && !agreed) nextErrors.agreed = '请先阅读并同意用户协议与隐私政策';
    if ((tab === 'reset' || (tab === 'register' && emailCodeRequired)) && !/^\d{6}$/.test(code)) {
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
        await register(email.trim(), password, nickname.trim(), emailCodeRequired ? code : null, true);
        toast.success('账号已创建，欢迎加入空间站');
      } else {
        await api.post<void>('/api/auth/reset-password', { email: email.trim(), code, password });
        toast.success('密码已重置，请用新密码登录');
        setTab('login');
        setPassword('');
        setCode('');
        return;
      }
      onClose();
    } catch (error) {
      // 网络/超时/限流错误均带友好中文提示；限流错误附加重试等待秒数
      setServerError(formatApiError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      eyebrow="Boarding Pass"
      title={tab === 'login' ? '登录空间站' : tab === 'register' ? '注册通行证' : '重置密码'}
    >
      <div className="mb-5 grid grid-cols-2 gap-1 border border-space-200 bg-space-50 p-1">
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
            className={`py-2 text-sm font-bold transition-colors ${
              tab === item ? 'bg-amber-50 text-amber-600' : 'bg-white text-muted hover:text-ink'
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

        {tab === 'reset' || (tab === 'register' && emailCodeRequired) ? (
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
          <div className="border border-coral/35 bg-coral/10 px-3.5 py-2.5 text-xs leading-relaxed text-coral">
            {serverError}
          </div>
        ) : null}

        {tab === 'register' ? (
          <label className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber"
            />
            <span>
              我已阅读并同意
              {/* 协议页是完整页面，弹窗不关会被 z-[80] 遮罩挡住；表单状态留在组件里，回来重开不丢 */}
              <Link to="/terms" onClick={onClose} className="text-amber underline underline-offset-2">
                《用户协议》
              </Link>
              与
              <Link to="/privacy" onClick={onClose} className="text-amber underline underline-offset-2">
                《隐私政策》
              </Link>
              {errors.agreed ? <span className="mt-1 block text-coral">{errors.agreed}</span> : null}
            </span>
          </label>
        ) : null}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={tab === 'register' && !agreed}
        >
          {tab === 'login' ? '登舱' : tab === 'register' ? '创建通行证' : '重置密码'}
        </Button>
      </form>

      <p className="mt-4 text-center text-xs text-muted">
        {tab === 'login' ? (
          <>
            还没有账号？{' '}
            <button type="button" onClick={() => setTab('register')} className="font-bold text-amber-600 hover:underline">
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
              className="font-bold text-amber-600 hover:underline"
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
              className="font-bold text-amber-600 hover:underline"
            >
              直接登录
            </button>
          </>
        ) : (
          <>
            已有账号？{' '}
            <button type="button" onClick={() => setTab('login')} className="font-bold text-amber-600 hover:underline">
              直接登录
            </button>
          </>
        )}
      </p>

      {DEMO_ACCOUNTS.length > 0 && (
        <div className="mt-4 space-y-2 border border-space-200 bg-space-50 p-3">
          <p className="text-[11px] font-bold text-amber-600">演示账号（点击填入）</p>
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
              className="block w-full text-left font-mono text-[11px] text-muted transition hover:text-ink"
            >
              {account.label}：{account.email} / {account.password}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
