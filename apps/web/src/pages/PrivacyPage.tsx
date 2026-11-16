import type { ReactNode } from 'react';
import SectionHeading from '../components/SectionHeading';

// 政策版本号：内容有实质变更时更新此处，并同步说明「生效日期」
const POLICY_VERSION = 'v1.0';
const EFFECTIVE_DATE = '2026-11-16';

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-space-200 bg-white px-5 py-5">
      <h2 className="text-base font-black text-ink">{title}</h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="Privacy"
        title="隐私政策"
        description={`版本 ${POLICY_VERSION} · 生效于 ${EFFECTIVE_DATE}`}
      />

      <div className="space-y-4">
        <PolicySection title="一、我们收集哪些信息">
          <p>
            <strong className="text-ink">1. 账号信息：</strong>
            注册时收集邮箱地址（仅用于验证与找回密码）与你自行填写的昵称、头像。密码重置通过邮箱验证码完成，本站不接触邮箱密码。
          </p>
          <p>
            <strong className="text-ink">2. 投稿内容：</strong>
            你主动提交的群舱、站点、画廊与活动信息（含二维码图片），经审核通过后公开展示。
          </p>
          <p>
            <strong className="text-ink">3. 自动记录：</strong>
            为保障服务安全，服务器会记录基础访问日志（请求时间、IP、User-Agent），仅用于故障排查与滥用防护，不作行为画像或广告用途。
          </p>
        </PolicySection>

        <PolicySection title="二、信息如何使用">
          <p>收集的信息仅用于：账号识别与登录态维持、邮箱验证码与密码重置邮件发送、投稿审核与内容展示、站内消息通知。</p>
          <p>本站不会将你的个人信息出售、共享或提供给任何第三方商业机构。</p>
        </PolicySection>

        <PolicySection title="三、存储与安全">
          <p>
            数据存储于站长自购的国内云服务器。登录凭证使用 JWT Cookie（HttpOnly），不落地浏览器本地存储。
            图片文件存储于对象存储服务（腾讯云 COS），仅限站内引用展示。
          </p>
        </PolicySection>

        <PolicySection title="四、第三方服务说明">
          <p>本站跳转的第三方平台（QQ、微博、小红书、秀动及外部网站）在你离开本站后适用其各自的隐私政策，请自行查阅。</p>
          <p>邮箱服务由第三方邮件服务商（Resend）代为发送验证码与重置邮件，服务商仅接收收件邮箱地址与邮件内容。</p>
        </PolicySection>

        <PolicySection title="五、你的权利">
          <p>你可以随时在站内：修改昵称与头像（个人资料页）、查看并撤回自己发起的投稿、退出登录。</p>
          <p>如需彻底删除账号及全部关联数据，请通过页脚联系方式向站长提出申请，我们将在 7 个工作日内完成删除并向你确认。</p>
        </PolicySection>

        <PolicySection title="六、未成年人保护">
          <p>本站不面向未满 14 周岁的未成年人提供服务。若发现未成年人在未经监护人同意的情况下注册使用本站，请联系站长删除相关信息。</p>
        </PolicySection>

        <PolicySection title="七、政策更新">
          <p>本政策如有实质性变更，会更新页面顶部的版本号与生效日期，并在站内公告。重大变更将以站内通知或邮件方式告知注册用户。</p>
        </PolicySection>
      </div>

      <p className="text-center text-xs text-muted">本政策自 {EFFECTIVE_DATE} 起生效。</p>
    </div>
  );
}
