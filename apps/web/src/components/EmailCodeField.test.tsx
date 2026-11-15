import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailCodeField from './EmailCodeField';
import { ToastProvider } from './Toast';
import { ApiError, api } from '../lib/api';

// EmailCodeField 单测：只 mock api.post（保留真实 ApiError 供 instanceof 分支判断），
// Toast 用真实 ToastProvider 包一层满足 useToast 依赖。
// 说明：该组件不渲染邮箱输入框，邮箱由父组件通过 email prop 传入（发码前会 trim + 转小写）。

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { ...actual.api, post: vi.fn() } };
});

const postMock = vi.mocked(api.post);

function renderField(props: Partial<React.ComponentProps<typeof EmailCodeField>> = {}) {
  const onChange = vi.fn();
  const view = render(
    <ToastProvider>
      <EmailCodeField email="user@test.dev" value="" onChange={onChange} {...props} />
    </ToastProvider>,
  );
  return { onChange, ...view };
}

beforeEach(() => {
  postMock.mockReset();
});

describe('EmailCodeField', () => {
  it('渲染验证码输入框与发送按钮', () => {
    renderField();

    expect(screen.getByPlaceholderText('输入 6 位验证码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '获取验证码' })).toBeInTheDocument();
  });

  it('点击发送按钮调用 api 的发码函数（邮箱 trim 后转小写），成功后进入冷却倒计时', async () => {
    postMock.mockResolvedValueOnce({ expiresInSeconds: 600, retryAfterSeconds: 60 });
    renderField({ email: '  User@Test.dev ' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/api/auth/email-code', { email: 'user@test.dev' });
    expect(screen.getByText('验证码已发送，请查收邮箱')).toBeInTheDocument();
    expect(await screen.findByText('60s 后重发')).toBeInTheDocument();
  });

  it('支持自定义发码接口（密码重置场景）', async () => {
    postMock.mockResolvedValueOnce({ expiresInSeconds: 600, retryAfterSeconds: 60 });
    renderField({ sendEndpoint: '/api/auth/forgot-password' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(postMock).toHaveBeenCalledWith('/api/auth/forgot-password', { email: 'user@test.dev' });
  });

  it('发码返回 CODE_COOLDOWN 且带 retryAfterSeconds 时，按结构化秒数进入倒计时并禁用按钮', async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(429, '操作过于频繁，请 30 秒后再试', 'CODE_COOLDOWN', 30),
    );
    renderField();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    // 错误 toast 展示服务端 message
    expect(screen.getByText('操作过于频繁，请 30 秒后再试')).toBeInTheDocument();
    // 按钮进入冷却态：显示剩余秒数并禁用
    const cooldownButton = await screen.findByRole('button', { name: '30s 后重发' });
    expect(cooldownButton).toBeDisabled();
    // Field 的 hint 同步显示剩余秒数
    expect(screen.getByText('30 秒后可重新发送，请留意收件箱与垃圾邮件')).toBeInTheDocument();
  });

  it('旧响应无结构化 retryAfterSeconds 时，从 message 文案中的秒数兜底倒计时', async () => {
    postMock.mockRejectedValueOnce(new ApiError(429, '操作过于频繁，请 45 秒后再试', 'CODE_COOLDOWN'));
    renderField();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(await screen.findByRole('button', { name: '45s 后重发' })).toBeInTheDocument();
  });

  it('邮箱格式非法时提示错误且不调用发码接口', async () => {
    renderField({ email: 'not-an-email' });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(screen.getByText('请先填写有效的邮箱地址')).toBeInTheDocument();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('输入内容只保留数字并截断 6 位，最终值回传给 onChange', () => {
    const { onChange } = renderField();
    // 受控输入的 value 由父组件持有（本用例固定为 ''），user.type 逐键输入时
    // React 会在每键后把 DOM 重置回 value，故用 fireEvent.change 模拟一次粘贴原始串
    fireEvent.change(screen.getByPlaceholderText('输入 6 位验证码'), {
      target: { value: '1a2b345678' },
    });

    expect(onChange).toHaveBeenLastCalledWith('123456');
  });
});
