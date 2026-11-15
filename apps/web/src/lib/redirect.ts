/** 跳转安全工具：登录 next 参数校验 + 外链二次确认页的 target 解析 */

/** 校验站内相对路径：非法值回退 /，防止开放重定向 */
export function safeRedirectPath(value: string | null | undefined): string {
  const path = (value ?? '').trim();
  // 必须以 / 开头；拒绝 //、/\（浏览器会把 \ 归一化为 /，变成协议相对外链）与绝对 URL
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
  // 登录后不允许再回到登录页本身
  if (path === '/login' || path.startsWith('/login?') || path.startsWith('/login/')) return '/';
  return path;
}

/**
 * 解析外链 target：仅接受 http(s) 绝对地址（含 // 开头的协议相对写法）。
 * 站内路径、javascript: 等其他协议、非法字符串一律返回 null。
 */
export function parseExternalTarget(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw || raw.includes('\\')) return null;
  const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** 构造外链二次确认页地址：站内所有站外跳转统一先经过 /redirect 确认 */
export function externalRedirectHref(url: string): string {
  return `/redirect?target=${encodeURIComponent(url.trim())}`;
}
