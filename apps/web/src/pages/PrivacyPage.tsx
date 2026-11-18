import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SectionHeading from '../components/SectionHeading';

// 政策版本号：内容有实质变更时更新此处，并同步更新「更新提示」与「生效日期」
const POLICY_VERSION = 'v2.0';
const UPDATED_DATE = '2026-11-18';
const EFFECTIVE_DATE = '2026-11-18';

function Clause({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

function Em({ children }: { children: ReactNode }) {
  return <strong className="font-black text-ink">{children}</strong>;
}

function Chapter({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border border-space-200 bg-white px-5 py-5">
      <h2 className="text-base font-black text-ink">{title}</h2>
      <div className="mt-3 space-y-2.5">{children}</div>
    </section>
  );
}

const chapters = [
  { id: 'collect', label: '1. 我们收集和使用的个人信息' },
  { id: 'share', label: '2. 个人信息共享、转让和公开披露' },
  { id: 'storage', label: '3. 个人信息的存储' },
  { id: 'security', label: '4. 信息安全' },
  { id: 'rights', label: '5. 你的权利' },
  { id: 'minors', label: '6. 未成年人保护' },
  { id: 'change', label: '7. 政策的变更' },
  { id: 'contact', label: '8. 联系我们' },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="Privacy"
        title="隐私政策"
        description={`版本 ${POLICY_VERSION} · 更新于 ${UPDATED_DATE} · 生效于 ${EFFECTIVE_DATE}`}
      />

      <div className="space-y-4">
        <section className="border border-amber/40 bg-amber-50 px-5 py-4">
          <h2 className="text-sm font-black text-ink">更新提示</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            为更充分地保障您的个人信息权益，我们参照行业通行的个人信息保护规范，对本政策的结构和个人信息处理规则进行了系统化调整。若您有任何问题或建议，请通过本政策第
            8 条所述方式联系我们。
          </p>
        </section>

        <section className="border border-space-200 bg-white px-5 py-5">
          <h2 className="text-base font-black text-ink">概要</h2>
          <div className="mt-3 space-y-2.5">
            <Clause>
              欢迎您访问厚嘴唇空间站！我们通过《
              <Link to="/terms" className="text-amber underline underline-offset-2">用户协议</Link>
              》和本《隐私政策》（“<Em>本政策</Em>”）向您说明，您在使用本站时我们如何收集、使用、存储和共享您的个人信息，以及您所享有的相关权利。本政策是《用户协议》的组成部分。
            </Clause>
            <Clause>
              本政策中的“我们”，指厚嘴唇空间站的运营团队——一个由歌迷自发搭建并维护的非官方、非营利粉丝信息导航项目。
            </Clause>
            <Clause>
              <Em>其中要点如下：</Em>
            </Clause>
            <Clause>
              <Em>• 为了向您提供账号登录、投稿与内容展示等服务，我们需要收集您的邮箱地址、昵称、头像以及您主动提交的投稿内容。</Em>
            </Clause>
            <Clause>
              <Em>• 我们不会将您的个人信息用于商业营销，不会向广告机构提供或出售您的个人信息。</Em>
            </Clause>
            <Clause>
              <Em>• 您主动投稿并经审核通过的内容将在站内公开展示，公开展示后的信息任何访问者均可见。</Em>
            </Clause>
            <Clause>
              <Em>• 您可以随时查看、更正自己的账号资料，撤回投稿，或申请彻底删除账号及全部关联数据。</Em>
            </Clause>
            <Clause>
              <Em>• 我们采用多种安全技术与管理措施，尽力使您的个人信息保护处于合理安全水平。</Em>
            </Clause>
            <Clause>您可以通过阅读完整版《隐私政策》，了解更加详尽的个人信息处理规则：</Clause>
            <div className="grid gap-1 pt-1 sm:grid-cols-2">
              {chapters.map((chapter) => (
                <a
                  key={chapter.id}
                  href={`#${chapter.id}`}
                  className="text-sm text-muted underline-offset-2 transition-colors hover:text-amber hover:underline"
                >
                  {chapter.label}
                </a>
              ))}
            </div>
          </div>
        </section>

        <Chapter id="collect" title="1. 我们收集和使用的个人信息">
          <Clause>
            在您使用本站服务的过程中，我们会按照如下方式收集您在使用服务时主动提供的或因为使用服务而产生的信息，用以向您提供、优化本站服务以及保障账号安全：
          </Clause>
          <Clause>
            <Em>1.1 账号注册与登录：</Em>
            当您注册本站账号时，我们会收集您的<Em>邮箱地址</Em>（用于发送验证码完成注册验证与密码重置）以及您自行设置的<Em>昵称、头像</Em>。本站不收集您的姓名、身份证号等实名身份信息，不接触您邮箱账号的密码。
          </Clause>
          <Clause>
            <Em>1.2 投稿内容：</Em>
            当您使用投稿功能时，我们会收集您主动提交的信息，包括群舱信息（群名称、群号、说明、二维码图片）、站点信息（名称、链接、介绍）、画廊作品（图片、说明、来源）与活动信息（名称、时间、地点、票务链接等）。<Em>
              经人工审核通过后，上述内容将在站内公开展示，即属于您主动公开的信息；未通过审核的投稿仅管理员可见。
            </Em>
          </Clause>
          <Clause>
            <Em>1.3 登录凭证：</Em>
            您登录后，我们通过 JWT Cookie（HttpOnly）维持您的登录状态。登录凭证不写入浏览器本地存储，且仅与您的本站账号关联。
          </Clause>
          <Clause>
            <Em>1.4 访问日志：</Em>
            为保障服务安全、排查故障与防范滥用，服务器会记录基础访问日志，包括<Em>请求时间、IP 地址、User-Agent</Em>。该等日志仅用于安全与运维目的，<Em>不作用户行为画像、个性化推荐或广告用途。</Em>
          </Clause>
          <Clause>
            <Em>1.5 站内通知：</Em>
            为向您同步投稿审核结果等内容，我们会通过站内消息向您发送通知。我们不向您的邮箱发送营销类邮件。
          </Clause>
          <Clause>
            <Em>1.6 免征得同意的情形：</Em>
            根据相关法律法规及国家标准，以下情形中，我们收集、使用您的个人信息无需另行征得您的授权同意：
          </Clause>
          <Clause>1) 为履行法定职责或法定义务所必需；</Clause>
          <Clause>2) 为应对突发公共卫生事件，或者紧急情况下为保护您的生命健康和财产安全所必需；</Clause>
          <Clause>3) 为公共利益实施新闻报道、舆论监督等行为，在合理的范围内处理个人信息；</Clause>
          <Clause>4) 根据法律法规在合理的范围内处理您自行公开或其他已经合法公开的个人信息；</Clause>
          <Clause>5) 法律法规规定的其他情形。</Clause>
          <Clause>
            <Em>1.7 主动获取：</Em>
            目前，我们不会主动从任何第三方获取您的个人信息。未来如因业务发展需要间接获取的，我们会要求来源方确保已征得您的同意并保证信息来源合法。
          </Clause>
        </Chapter>

        <Chapter id="share" title="2. 个人信息共享、转让和公开披露">
          <Clause>
            <Em>2.1 共享：</Em>
            我们遵循合法、正当、必要、最小化的原则与第三方共享您的个人信息。目前仅涉及以下情形：
          </Clause>
          <Clause>
            （1）<Em>邮件服务：</Em>验证码与密码重置邮件由第三方邮件服务商（Resend）代为发送，服务商仅接收收件邮箱地址及邮件内容，并受与我们之间的保密义务约束；
          </Clause>
          <Clause>
            （2）<Em>对象存储：</Em>您投稿上传的图片文件存储于腾讯云对象存储服务（COS），仅限站内引用展示。
          </Clause>
          <Clause>
            <Em>2.2 公开披露：</Em>
            我们仅公开展示您主动投稿并经审核通过的内容。除此之外，我们不会对外公开披露您的个人信息，法律法规另有规定的除外。用户严重违反《用户协议》受到处理的，我们可能公示处理结果及必要的账号标识信息。
          </Clause>
          <Clause>
            <Em>2.3 转让：</Em>
            <Em>我们不会将您的个人信息转让给任何第三方。</Em>
            如本站发生合并、站点迁移、运营团队变更等情形，我们将通过站内公告等方式告知您，并要求新的持有方继续按照不低于本政策的标准保护您的个人信息。
          </Clause>
          <Clause>
            <Em>2.4 不出售：</Em>
            我们承诺不出售您的个人信息，不向任何商业机构提供您的个人信息用于营销。
          </Clause>
        </Chapter>

        <Chapter id="storage" title="3. 个人信息的存储">
          <Clause>
            <Em>3.1 存储方式与期限：</Em>
            我们仅在为您提供服务所必需的期限内或法律法规规定的期限内存储您的个人信息。您申请删除账号后，我们将删除您的账号及关联数据或进行匿名化处理，法律法规要求留存的记录除外。
          </Clause>
          <Clause>
            <Em>3.2 存储地域：</Em>
            您的个人信息存储于运营团队自购的中国境内云服务器，我们不会将您的个人信息传输至境外。
          </Clause>
          <Clause>
            <Em>3.3 停止运营：</Em>
            本站如停止运营，我们将提前在站内公告，并对您的个人信息进行删除或匿名化处理，依法保障您的合法权益。
          </Clause>
        </Chapter>

        <Chapter id="security" title="4. 信息安全">
          <Clause>
            <Em>4.1 安全措施：</Em>
            我们采用多项技术与管理措施保护您的个人信息，包括：登录凭证仅存于 HttpOnly Cookie、不上传服务器端明文口令、图片经对象存储服务隔离存放、访问日志最小化收集、投稿内容须经人工审核后方可公开等。
          </Clause>
          <Clause>
            <Em>4.2 安全事件处置：</Em>
            如不幸发生个人信息泄露等安全事件，我们将按照法律法规要求及时启动应急预案、采取补救措施，并以站内公告、邮件等方式告知您，依法向有关部门报告。
          </Clause>
          <Clause>
            <Em>4.3 共同守护：</Em>
            任何安全措施都不能做到绝对安全。请您妥善保管邮箱账号与验证码信息，不在他人设备上保持登录状态。如发现安全隐患，欢迎随时通过页脚公示的联系方式向我们反馈。
          </Clause>
        </Chapter>

        <Chapter id="rights" title="5. 你的权利">
          <Clause>
            按照相关法律法规，您对自己的个人信息享有查阅、复制、更正、删除、撤回同意等权利。您可以随时在站内：
          </Clause>
          <Clause>
            <Em>5.1 查阅与更正：</Em>在个人资料页修改您的昵称与头像；在「我的投稿」页面查看您发起的全部投稿及其审核状态。
          </Clause>
          <Clause>
            <Em>5.2 撤回与删除：</Em>撤回尚未通过审核的投稿；对已通过审核的内容发起修改或删除申请，经审核后生效。
          </Clause>
          <Clause>
            <Em>5.3 账号注销：</Em>如需彻底删除账号及全部关联数据，请通过页脚公示的联系方式向我们提出申请，我们将在 7
            个工作日内完成删除并向您确认。
          </Clause>
          <Clause>
            <Em>5.4 撤回同意与退出：</Em>您可以随时退出登录。您撤回同意不影响撤回前基于您的同意已进行的个人信息处理活动的效力。
          </Clause>
          <Clause>
            <Em>5.5 投诉与反馈：</Em>如您认为我们的个人信息处理行为损害了您的合法权益，可通过页脚公示的联系方式投诉，我们将在法律法规规定的期限内回复您的请求。
          </Clause>
        </Chapter>

        <Chapter id="minors" title="6. 未成年人保护">
          <Clause>
            <Em>6.1 本站不面向未满 14 周岁的未成年人提供服务。</Em>
            未满 14 周岁的未成年人不得注册、登录或使用本站服务。
          </Clause>
          <Clause>
            6.2 年满 14 周岁但未满 18 周岁的未成年人，应在监护人同意与指导下使用本站服务。
          </Clause>
          <Clause>
            6.3 若监护人发现未成年人未经其同意注册使用本站或向本站提供了个人信息，可通过页脚公示的联系方式联系我们，我们将依法删除相关未成年人的个人信息。
          </Clause>
        </Chapter>

        <Chapter id="change" title="7. 政策的变更">
          <Clause>
            7.1 本政策如有实质性变更，我们会更新页面顶部的政策版本号与生效日期，并在站内公告。
            <Em>重大变更将以站内通知或邮件方式告知注册用户。</Em>
          </Clause>
          <Clause>
            7.2 如您在政策变更生效后继续使用本站服务，视为您已接受变更后的政策；如您不同意变更内容，可停止使用本站服务并申请注销账号。
          </Clause>
        </Chapter>

        <Chapter id="contact" title="8. 联系我们">
          <Clause>
            如果您对本政策或个人信息保护有任何疑问、意见或建议，可通过页脚公示的联系邮箱联系我们。我们会尽快跟进处理，并在法律法规规定的期限内回复您的请求。
          </Clause>
          <Clause>
            您还可以查阅
            <Link to="/terms" className="text-amber underline underline-offset-2">《用户协议》</Link>
            了解本站服务的其他约定。
          </Clause>
        </Chapter>
      </div>

      <p className="text-center text-xs text-muted">本政策（{POLICY_VERSION}）自 {EFFECTIVE_DATE} 起生效。</p>
    </div>
  );
}
