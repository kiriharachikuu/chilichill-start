import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverMail, setMailTransport, type MailMessage } from '../src/services/mail/mailer';

const { testEnv } = vi.hoisted(() => ({
  testEnv: {
    mailEnabled: true,
    mail: {
      apiKey: 're_test_only',
      from: 'no-reply@example.com',
      fromName: '厚嘴唇空间站',
      replyTo: 'help@example.com' as string | null,
      maxRetries: 2,
      retryDelayMs: 0,
    },
  },
}));

vi.mock('../src/env', () => ({ env: testEnv }));

const message: MailMessage = {
  to: 'user@example.com',
  subject: '注册验证码 123456',
  text: '你的验证码是：123456',
  html: '<p>你的验证码是：123456</p>',
  headers: { 'X-Test': 'verification' },
};

const fetchMock = vi.fn<typeof fetch>();
function apiResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

beforeEach(() => {
  setMailTransport(null);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  testEnv.mailEnabled = true;
  testEnv.mail.replyTo = 'help@example.com';
});

afterEach(() => {
  setMailTransport(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Resend 邮件传输', () => {
  it('发送完整模板和发件配置，保留 Resend 邮件 ID', async () => {
    fetchMock.mockResolvedValueOnce(apiResponse({ id: 'email-123' }));

    const result = await deliverMail(message);

    expect(result).toMatchObject({ ok: true, transport: 'resend', attempts: 1, messageId: 'email-123' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer re_test_only',
        'Content-Type': 'application/json',
        'Idempotency-Key': expect.any(String),
      },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(request!.body as string)).toEqual({
      from: '"厚嘴唇空间站" <no-reply@example.com>',
      to: [message.to],
      reply_to: 'help@example.com',
      subject: message.subject,
      text: message.text,
      html: message.html,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'X-Test': 'verification',
      },
    });
  });

  it('未配置回复地址时省略 reply_to', async () => {
    testEnv.mail.replyTo = null;
    fetchMock.mockResolvedValueOnce(apiResponse({ id: 'email-123' }));
    await deliverMail(message);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).not.toHaveProperty('reply_to');
  });

  it('网络错误与服务端故障重试时复用同一个幂等键，每封邮件使用新键', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(apiResponse({ id: 'email-123' }))
      .mockResolvedValueOnce(apiResponse({ id: 'email-456' }));

    expect(await deliverMail(message)).toMatchObject({ ok: true, attempts: 3 });
    expect(await deliverMail(message)).toMatchObject({ ok: true, attempts: 1 });
    const keys = fetchMock.mock.calls.map(([, request]) => new Headers(request!.headers).get('Idempotency-Key'));
    expect(keys[0]).toBeTruthy();
    expect(keys.slice(0, 3)).toEqual([keys[0], keys[0], keys[0]]);
    expect(keys[3]).not.toBe(keys[0]);
    expect(fetchMock.mock.calls[0][1]!.body).toBe(fetchMock.mock.calls[2][1]!.body);
  });

  it.each([
    [401, 'validation_error'],
    [403, 'validation_error'],
    [422, 'missing_required_field'],
    [409, 'invalid_idempotent_request'],
    [429, 'daily_quota_exceeded'],
    [429, 'monthly_quota_exceeded'],
  ])('HTTP %i %s 直接失败，不盲目重试', async (status, name) => {
    fetchMock.mockResolvedValue(apiResponse({ name, message: 'request rejected' }, status));

    expect(await deliverMail(message)).toMatchObject({
      ok: false,
      attempts: 1,
      error: expect.stringContaining(name),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('临时限流遵守 Retry-After 后重试', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(apiResponse({ name: 'rate_limit_exceeded' }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(apiResponse({ id: 'email-123' }));

    const delivery = deliverMail(message);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await delivery).toMatchObject({ ok: true, attempts: 2 });
  });

  it('同一幂等请求仍在处理时稍后重试', async () => {
    fetchMock
      .mockResolvedValueOnce(apiResponse({ name: 'concurrent_idempotent_requests' }, 409))
      .mockResolvedValueOnce(apiResponse({ id: 'email-123' }));
    expect(await deliverMail(message)).toMatchObject({ ok: true, attempts: 2 });
  });

  it('请求超时会终止连接并在重试耗尽后返回失败', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((delay) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
      return controller.signal;
    });
    fetchMock.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request!.signal!.addEventListener('abort', () => reject(request!.signal!.reason), { once: true });
    }));

    const delivery = deliverMail(message);
    await vi.advanceTimersByTimeAsync(30_010);
    expect(await delivery).toMatchObject({ ok: false, attempts: 3, error: 'Timed out' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('成功响应缺少邮件 ID 时不能误报成功', async () => {
    fetchMock.mockImplementation(async () => apiResponse({}));
    expect(await deliverMail(message)).toMatchObject({ ok: false, attempts: 3 });
  });

  it('本地未配置 Resend 时只输出日志，不访问网络', async () => {
    testEnv.mailEnabled = false;
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(await deliverMail(message)).toMatchObject({ ok: true, transport: 'console' });
    expect(log).toHaveBeenCalledWith(expect.stringContaining(message.text));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
