import { getStoredQQBotSettings, invalidateQQBotSettingsCache, type StoredQQBotSettings } from './settings';

// QQ 开放平台 API v2 统一地址（https://bot.q.qq.com/wiki/develop/api-v2/）
const API_BASE = 'https://api.bot.qq.com';
const TOKEN_URL = `${API_BASE}/app/getAppAccessToken`;
// access_token 临近过期 60 秒内平台会下发新 token，这里提前 60s 主动刷新
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface QQBotSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
// 进行中的取 token 请求：群/频道并行发送时共享同一次请求，避免并发重复取 token
let pendingTokenRequest: Promise<string> | null = null;

export function invalidateQQBotTokenCache(): void {
  cachedToken = null;
}

/** 测试用：一次性清空设置与 token 缓存，避免用例间串扰 */
export function resetQQBotStateForTests(): void {
  cachedToken = null;
  pendingTokenRequest = null;
  invalidateQQBotSettingsCache();
}

function isConfigured(settings: StoredQQBotSettings): boolean {
  return Boolean(settings.appId && settings.appSecret);
}

async function fetchAccessToken(settings: StoredQQBotSettings): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS > Date.now()) {
    return cachedToken.token;
  }
  if (pendingTokenRequest) {
    return pendingTokenRequest;
  }

  pendingTokenRequest = (async () => {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: settings.appId, clientSecret: settings.appSecret }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 网关错误可能返回非 JSON；token 响应形如 { access_token, expires_in }（expires_in 可能是字符串）
    const body: unknown = await response.json().catch(() => null);
    const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new Error(
        `获取 access_token 失败（HTTP ${response.status}）${typeof data.message === 'string' ? `：${data.message}` : ''}`,
      );
    }
    if (typeof data.access_token !== 'string' || !data.access_token) {
      throw new Error('QQ 平台响应缺少 access_token');
    }
    const expiresIn = Number(data.expires_in);
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 7200_000),
    };
    return cachedToken.token;
  })();

  // 结束后清除进行中标记：成功走缓存，失败允许下一次重试
  void pendingTokenRequest.finally(() => {
    pendingTokenRequest = null;
  });
  return pendingTokenRequest;
}

function errorOf(response: Response, body: Record<string, unknown> | null): string {
  const code = typeof body?.code === 'number' || typeof body?.code === 'string' ? body.code : response.status;
  const message = typeof body?.message === 'string' ? body.message : response.statusText;
  return `QQ ${code}: ${message}`;
}

/** 调用开放平台 POST 接口；非 2xx 抛错（含平台返回的 code/message） */
async function postOpenApi(path: string, payload: Record<string, unknown>, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `QQBot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new Error(errorOf(response, data));
  }
  return data;
}

function toResult(error: unknown): QQBotSendResult {
  const message = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
  return { ok: false, error: message };
}

/** 主动发送群文本消息（msg_type 0）；群主动消息受平台频控，失败仅返回错误不重试 */
export async function sendQQBotGroupMessage(groupOpenId: string, content: string): Promise<QQBotSendResult> {
  try {
    const settings = await getStoredQQBotSettings();
    if (!isConfigured(settings)) {
      return { ok: false, error: 'QQ 机器人未配置 AppID/AppSecret' };
    }
    const token = await fetchAccessToken(settings);
    const data = await postOpenApi(
      `/v2/groups/${encodeURIComponent(groupOpenId)}/messages`,
      { content, msg_type: 0, msg_seq: 1 },
      token,
    );
    return { ok: true, messageId: typeof data.id === 'string' ? data.id : undefined };
  } catch (error) {
    return toResult(error);
  }
}

/** 主动发送频道文字子频道文本消息；要求机器人 WebSocket 在线且子频道有主动消息权限 */
export async function sendQQBotChannelMessage(channelId: string, content: string): Promise<QQBotSendResult> {
  try {
    const settings = await getStoredQQBotSettings();
    if (!isConfigured(settings)) {
      return { ok: false, error: 'QQ 机器人未配置 AppID/AppSecret' };
    }
    const token = await fetchAccessToken(settings);
    const data = await postOpenApi(
      `/channels/${encodeURIComponent(channelId)}/messages`,
      { content },
      token,
    );
    return { ok: true, messageId: typeof data.id === 'string' ? data.id : undefined };
  } catch (error) {
    return toResult(error);
  }
}

export interface QQBotBroadcastResult {
  ok: boolean;
  sent: string[];
  error?: string;
}

/** 向设置里配置的所有推送目标（群/频道子频道）发送同一条文本，任一成功即视为 ok */
export async function broadcastQQBotMessage(content: string): Promise<QQBotBroadcastResult> {
  const settings = await getStoredQQBotSettings();
  if (!isConfigured(settings)) {
    return { ok: false, sent: [], error: '请先填写 QQ 机器人 AppID 与 AppSecret' };
  }

  const targets: Array<{ label: string; run: () => Promise<QQBotSendResult> }> = [];
  if (settings.groupOpenId) {
    targets.push({ label: `群 ${settings.groupOpenId}`, run: () => sendQQBotGroupMessage(settings.groupOpenId!, content) });
  }
  if (settings.channelId) {
    targets.push({ label: `子频道 ${settings.channelId}`, run: () => sendQQBotChannelMessage(settings.channelId!, content) });
  }
  if (targets.length === 0) {
    return { ok: false, sent: [], error: '请先填写群 OpenID 或频道子频道 ID 作为推送目标' };
  }

  const results = await Promise.all(targets.map((target) => target.run()));
  const sent = results.map((result, index) => (result.ok ? targets[index]!.label : '')).filter(Boolean);
  const firstError = results.find((result) => !result.ok)?.error;
  return { ok: sent.length > 0, sent, error: firstError };
}
