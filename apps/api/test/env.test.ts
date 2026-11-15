import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'test-only-secret-with-at-least-32-characters');
  vi.stubEnv('RESEND_API_KEY', 're_test_only');
  vi.stubEnv('MAIL_FROM', 'no-reply@example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Resend 环境配置', () => {
  it('生产环境配置齐全时启用 Resend', async () => {
    const { env } = await import('../src/env');
    expect(env.mailEnabled).toBe(true);
    expect(env.mail.from).toBe('no-reply@example.com');
  });

  it('生产环境缺少密钥时不再拒绝启动，邮件兜底开关关闭', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { env } = await import('../src/env');
    expect(env.mailEnabled).toBe(false);
  });

  it('生产环境缺少密钥时提示在管理后台配置邮件', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await import('../src/env');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('管理后台'));
  });

  it('已配置密钥但缺少发件地址时不再拒绝启动，仅输出提示', async () => {
    vi.stubEnv('MAIL_FROM', '');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { env } = await import('../src/env');
    expect(env.mailEnabled).toBe(true);
    expect(env.mail.from).toBe('no-reply@spaceport.local');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('MAIL_FROM'));
  });

  it('拒绝无效发件地址', async () => {
    vi.stubEnv('MAIL_FROM', 'invalid-address');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(import('../src/env')).rejects.toThrow('Invalid environment variables');
  });

  it('开发环境不配置密钥时保留控制台联调', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('MAIL_FROM', '');
    const { env } = await import('../src/env');
    expect(env.mailEnabled).toBe(false);
  });
});
