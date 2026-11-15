import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// LoginModal 单测。mock 策略：
// 1. ../lib/api 用 importOriginal 保留真实 ApiError（供 instanceof 分支判断），仅替换 api.post；
// 2. ../lib/auth 整体 mock：useAuth 返回的 login 复刻真实 AuthProvider.login 的请求路径
//    （POST /api/auth/login 并返回 user），由于 api.post 即 mocks.post，
//    登录提交会真正走到可断言的 mock 上，register 等未用方法以 vi.fn 占位；
// 3. DEMO_ACCOUNTS 在模块求值时读取 import.meta.env.DEV，因此 LoginModal 一律动态 import，
//    并在 beforeEach 里 vi.resetModules()，让每个用例都能在自己 stub 的 DEV 值下重新求值模块；
//    断言用的 ApiError 也必须从当前用例的模块图动态获取，保证跨模块 instanceof 成立。
// LoginModal 本身是私有组件，经导出的 LoginDialogProvider 挂载，setLoginOpen 即 onClose 的落点。

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  register: vi.fn(),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { ...actual.api, post: mocks.post } };
});

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth')>();
  return {
    ...actual,
    useAuth: () => ({
      user: null,
      loading: false,
      login: async (email: string, password: string) => {
        const data = (await mocks.post('/api/auth/login', { email, password })) as { user: unknown };
        return data.user;
      },
      register: mocks.register,
      logout: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

const postMock = mocks.post;

beforeEach(() => {
  // 清空模块缓存，配合动态 import 让 import.meta.env.DEV 在每个用例中重新生效
  vi.resetModules();
  postMock.mockReset();
  mocks.register.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function renderLoginModal(open: boolean) {
  // ToastProvider 也从当前模块图动态获取：resetModules 后 ToastContext 是全新对象，
  // 若混用首图的静态 ToastProvider，LoginModal 内的 useToast 会读不到上下文
  const [{ LoginDialogProvider }, { ToastProvider }] = await Promise.all([
    import('./LoginModal'),
    import('./Toast'),
  ]);
  const setLoginOpen = vi.fn();
  render(
    <ToastProvider>
      <LoginDialogProvider loginOpen={open} setLoginOpen={setLoginOpen}>
        <div>页面宿主</div>
      </LoginDialogProvider>
    </ToastProvider>,
  );
  return { setLoginOpen };
}

describe('LoginModal', () => {
  it('open=true 时渲染弹窗标题、登录/注册页签与登录表单', async () => {
    await renderLoginModal(true);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('登录空间站')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('输入密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '登舱' })).toBeInTheDocument();
  });

  it('open=false 时不渲染弹窗', async () => {
    await renderLoginModal(false);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('登录空间站')).not.toBeInTheDocument();
  });

  it('DEV 构建下展示演示账号入口', async () => {
    vi.stubEnv('DEV', true);
    await renderLoginModal(true);

    expect(screen.getByText('演示账号（点击填入）')).toBeInTheDocument();
    expect(screen.getByText(/admin@spaceport\.dev/)).toBeInTheDocument();
    expect(screen.getByText(/demo@spaceport\.dev/)).toBeInTheDocument();
  });

  it('生产构建（DEV=false）下移除演示账号入口', async () => {
    vi.stubEnv('DEV', false);
    await renderLoginModal(true);

    expect(screen.queryByText('演示账号（点击填入）')).not.toBeInTheDocument();
    expect(screen.queryByText(/admin@spaceport\.dev/)).not.toBeInTheDocument();
  });

  it('邮箱或密码不合法时展示表单校验错误，且不发起登录请求', async () => {
    await renderLoginModal(true);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'not-an-email');
    await user.type(screen.getByPlaceholderText('输入密码'), '123');
    // jsdom 会按原生约束校验拦截 type=email 的隐式提交，这里直接触发表单 onSubmit，
    // 只测组件自身的 validate 逻辑
    fireEvent.submit(document.querySelector('form')!);

    expect(screen.getByText('请输入有效的邮箱地址')).toBeInTheDocument();
    expect(screen.getByText('密码至少 8 位')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('提交登录：命中 /api/auth/login 端点且参数正确，成功后提示并关闭弹窗', async () => {
    postMock.mockResolvedValueOnce({ user: { id: 'u1', nickname: '体验用户' } });
    const { setLoginOpen } = await renderLoginModal(true);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.dev');
    await user.type(screen.getByPlaceholderText('输入密码'), 'Password123');
    await user.click(screen.getByRole('button', { name: '登舱' }));

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/api/auth/login', {
      email: 'user@test.dev',
      password: 'Password123',
    });
    expect(await screen.findByText('登舱成功，祝你探索愉快')).toBeInTheDocument();
    expect(setLoginOpen).toHaveBeenCalledWith(false);
  });

  it('登录失败（ApiError）时在表单内展示服务端错误信息，弹窗保持打开', async () => {
    // 与 LoginModal 同一模块图内取 ApiError，保证 instanceof 判断成立
    const { ApiError } = await import('../lib/api');
    postMock.mockRejectedValueOnce(new ApiError(401, '邮箱或密码错误', 'BAD_CREDENTIALS'));
    const { setLoginOpen } = await renderLoginModal(true);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'user@test.dev');
    await user.type(screen.getByPlaceholderText('输入密码'), 'wrong-pass-123');
    await user.click(screen.getByRole('button', { name: '登舱' }));

    expect(await screen.findByText('邮箱或密码错误')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(setLoginOpen).not.toHaveBeenCalled();
  });

  it('点击右上角关闭按钮触发 onClose', async () => {
    const { setLoginOpen } = await renderLoginModal(true);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '关闭' }));

    expect(setLoginOpen).toHaveBeenCalledWith(false);
  });
});
