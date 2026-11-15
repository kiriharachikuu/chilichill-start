import { env } from '../../env';

export interface VerificationEmailInput {
  to: string;
  code: string;
  expiresMinutes: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const BRAND_NAME = '厚嘴唇空间站';
export const BRAND_SUBTITLE = 'CHILICHILL SPACEPORT';

// 与站点（apps/web tailwind.config.js + styles/index.css）保持一致的设计 token：
// 黑白灰极简、天蓝 #609ee9 点缀、全方角（border-radius: 0）、无阴影、mono 宽字距小标签
export const COLOR = {
  page: '#f4f4f1', // space-50 页面底色
  cardBorder: '#111111', // ink 卡片黑粗边
  inputBorder: '#d8d8d3', // space-200 输入框细边
  footerBorder: '#e9e9e5', // space-100 页脚分隔线
  ink: '#111111',
  body: '#3f3f3f', // space-700 正文
  muted: '#8f8f8d', // space-400 次要文字
  accent: '#609ee9', // amber-400（站点强调蓝）
  accentSoftBg: '#edf5ff', // amber-50 提示底色
  accentText: '#2f6db3', // amber-600 提示文字
} as const;

export const FONT_SANS = "'Noto Sans SC','PingFang SC','Microsoft YaHei',Arial,sans-serif";
export const FONT_MONO = "'IBM Plex Mono','SFMono-Regular',Consolas,Menlo,monospace";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 注册邮箱验证码邮件：HTML + 纯文本双版本。
 * 视觉与站点设计语言对齐：白底黑粗边方角卡片、天蓝点缀、mono 宽字距小标签、扁平无阴影。
 * 采用表格式布局与内联样式，兼容 Outlook / Gmail / Apple Mail / 网易邮箱等客户端，
 * 并针对 480px 以下屏幕做响应式收敛；不含图片与外链，降低被判为垃圾邮件的风险。
 */
export function renderVerificationEmail({ to, code, expiresMinutes }: VerificationEmailInput): RenderedEmail {
  const safeCode = escapeHtml(code);
  const safeEmail = escapeHtml(to);
  const year = new Date().getFullYear();
  const subject = `【${BRAND_NAME}】邮箱验证码 ${code}`;

  const text = [
    `${BRAND_NAME} · 邮箱验证`,
    '',
    `你的邮箱验证码是：${code}`,
    '',
    `验证码 ${expiresMinutes} 分钟内有效，请勿转发给他人。`,
    '本验证码仅用于注册账号。空间站工作人员不会向你索要验证码，请勿向任何人透露。',
    `如非你本人使用 ${to} 注册，请忽略本邮件，你的邮箱不会被加入任何营销列表。`,
    '',
    `本邮件由系统自动发送，请勿直接回复。`,
    `© ${year} ${BRAND_NAME}`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
<!--[if mso]>
<xml>
  <o:OfficeDocumentSettings>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml>
<![endif]-->
<style type="text/css">
  /* 客户端重置：避免 Gmail / 网易邮箱把正文撑满屏幕或改写字号 */
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  @media only screen and (max-width: 480px) {
    .container { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .code-text { font-size: 26px !important; letter-spacing: 6px !important; }
    .brand-subtitle { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};">
  <div style="display:none;font-size:1px;color:${COLOR.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    你的验证码是 ${safeCode}，${expiresMinutes} 分钟内有效。请勿转发。
  </div>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${COLOR.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:0;border:2px solid ${COLOR.cardBorder};">
          <tr>
            <td class="px" style="padding:28px 40px 0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background-color:${COLOR.ink};border-radius:0;color:#ffffff;font-family:${FONT_SANS};font-size:20px;font-weight:900;line-height:40px;">厚</td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <span style="display:block;font-family:${FONT_SANS};font-size:16px;font-weight:900;color:${COLOR.ink};letter-spacing:-0.4px;">${BRAND_NAME}</span>
                    <span class="brand-subtitle" style="display:block;margin-top:3px;font-family:${FONT_MONO};font-size:10px;font-weight:bold;color:${COLOR.accent};letter-spacing:2.5px;">${BRAND_SUBTITLE}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:28px 40px 0 40px;font-family:${FONT_SANS};">
              <h1 style="margin:0;font-size:24px;line-height:34px;font-weight:900;color:${COLOR.ink};letter-spacing:-0.3px;">验证你的邮箱</h1>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:24px;color:${COLOR.body};">
                你好，欢迎登上${BRAND_NAME}。你正在注册账号，请在页面中输入下方验证码完成邮箱验证。
              </p>
              <p style="margin:8px 0 0 0;font-size:12px;line-height:20px;color:${COLOR.muted};">收件邮箱：${safeEmail}</p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background-color:#ffffff;border-radius:0;border:1px solid ${COLOR.inputBorder};">
                <tr>
                  <td align="center" style="padding:16px 16px 0 16px;font-family:${FONT_MONO};font-size:10px;font-weight:bold;color:${COLOR.accent};letter-spacing:3px;">VERIFICATION CODE</td>
                </tr>
                <tr>
                  <td align="center" style="padding:10px 16px 8px 16px;font-family:${FONT_MONO};font-size:32px;line-height:40px;font-weight:600;color:${COLOR.ink};letter-spacing:10px;text-indent:10px;" class="code-text">
                    ${safeCode}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 16px 18px 16px;font-family:${FONT_SANS};font-size:12px;line-height:20px;color:${COLOR.accentText};">
                    ${expiresMinutes} 分钟内有效 · 仅限本人使用
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:20px 40px 0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background-color:${COLOR.accentSoftBg};border-left:4px solid ${COLOR.accent};border-radius:0;">
                <tr>
                  <td style="padding:14px 16px;font-family:${FONT_SANS};">
                    <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;font-weight:900;color:${COLOR.ink};">安全提示</p>
                    <p style="margin:0;font-size:12px;line-height:20px;color:${COLOR.accentText};">
                      · 空间站工作人员不会以任何理由向你索要验证码。<br />
                      · 请勿将验证码转发或告知他人，验证码仅用于本次注册。<br />
                      · 如非你本人操作，请直接忽略本邮件，无需做任何处理。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <p style="margin:0;font-size:12px;line-height:20px;color:${COLOR.muted};">
                本邮件由系统自动发送，请勿直接回复。若你没有注册${BRAND_NAME}，可忽略本邮件并删除，你的邮箱不会被加入任何营销列表。
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-top:1px solid ${COLOR.footerBorder};">
                <tr>
                  <td style="padding:16px 0 28px 0;font-family:${FONT_MONO};font-size:11px;line-height:18px;color:${COLOR.muted};">
                    ${BRAND_SUBTITLE}<br />© ${year} ${BRAND_NAME} · ChiliChill 粉丝导航站
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0 0;font-family:${FONT_MONO};font-size:11px;line-height:18px;color:${COLOR.muted};">
          SENT BY ${escapeHtml(env.mail.from)}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
