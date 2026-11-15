import { env } from '../../env';
import {
  BRAND_NAME,
  BRAND_SUBTITLE,
  COLOR,
  FONT_MONO,
  FONT_SANS,
  escapeHtml,
  type RenderedEmail,
} from './verification-template';

export interface PasswordResetEmailInput {
  to: string;
  code: string;
  expiresMinutes: number;
}

/**
 * 密码重置验证码邮件：与注册验证邮件同一套品牌设计 token（白底黑粗边方角卡片、天蓝点缀）。
 * 文案明确「仅用于重置密码」并提示不要转发，防止钓鱼与社工。
 */
export function renderPasswordResetEmail({ to, code, expiresMinutes }: PasswordResetEmailInput): RenderedEmail {
  const safeCode = escapeHtml(code);
  const safeEmail = escapeHtml(to);
  const year = new Date().getFullYear();
  const subject = `【${BRAND_NAME}】密码重置验证码 ${code}`;

  const text = [
    `${BRAND_NAME} · 密码重置`,
    '',
    `你的密码重置验证码是：${code}`,
    '',
    `验证码 ${expiresMinutes} 分钟内有效，请勿转发给他人。`,
    '本验证码仅用于重置账号密码。空间站工作人员不会向你索要验证码，请勿向任何人透露。',
    `如非你本人使用 ${to} 重置密码，请忽略本邮件，你的密码不会被修改。`,
    '',
    '本邮件由系统自动发送，请勿直接回复。',
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
    你的密码重置验证码是 ${safeCode}，${expiresMinutes} 分钟内有效。请勿转发。
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
              <h1 style="margin:0;font-size:24px;line-height:34px;font-weight:900;color:${COLOR.ink};letter-spacing:-0.3px;">重置你的密码</h1>
              <p style="margin:12px 0 0 0;font-size:14px;line-height:24px;color:${COLOR.body};">
                你正在重置${BRAND_NAME}账号的密码，请在页面中输入下方验证码完成验证，并设置新密码。
              </p>
              <p style="margin:8px 0 0 0;font-size:12px;line-height:20px;color:${COLOR.muted};">账号邮箱：${safeEmail}</p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background-color:#ffffff;border-radius:0;border:1px solid ${COLOR.inputBorder};">
                <tr>
                  <td align="center" style="padding:16px 16px 0 16px;font-family:${FONT_MONO};font-size:10px;font-weight:bold;color:${COLOR.accent};letter-spacing:3px;">RESET CODE</td>
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
                      · 请勿将验证码转发或告知他人，验证码仅用于本次密码重置。<br />
                      · 如非你本人操作，请直接忽略本邮件，你的密码不会被修改。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:24px 40px 0 40px;">
              <p style="margin:0;font-size:12px;line-height:20px;color:${COLOR.muted};">
                本邮件由系统自动发送，请勿直接回复。若你没有申请重置密码，可忽略本邮件并删除。
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
