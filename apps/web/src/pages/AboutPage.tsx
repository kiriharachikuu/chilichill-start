import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  Globe,
  Heart,
  HeartHandshake,
  Images,
  PenSquare,
  Scale,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { loadMeta, readCachedMeta } from '../lib/meta';
import SectionHeading from '../components/SectionHeading';
import ChangelogSection from '../components/ChangelogSection';

function PolicySection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-space-200 bg-white px-5 py-5">
      <h2 className="flex items-center gap-2 text-base font-black text-ink">
        {icon}
        {title}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}

// 站内四大板块的固定说明
const boards = [
  {
    icon: <UsersRound className="h-4 w-4 text-amber" />,
    title: '群舱',
    desc: '各地粉丝群汇总，按地区与用途分类展示，附群号与入群说明。',
  },
  {
    icon: <Globe className="h-4 w-4 text-amber" />,
    title: '站点',
    desc: '粉丝自建的作品站、资料站收录与导航，持续校准链接有效性。',
  },
  {
    icon: <Images className="h-4 w-4 text-amber" />,
    title: '画廊',
    desc: '粉丝二创作品墙，集中展示同人绘画、摄影等创作。',
  },
  {
    icon: <CalendarDays className="h-4 w-4 text-amber" />,
    title: '活动',
    desc: '官方及粉丝自发活动的统一日历，附时间、地点与票务入口。',
  },
];

export default function AboutPage() {
  // 备案号/联系邮箱/赞助支持均在后台「站点信息」中配置，经 /api/meta 下发
  const cached = readCachedMeta();
  const [about, setAbout] = useState(cached?.about ?? null);
  // 当前放大查看的赞助图片地址（null 表示未打开大图弹层）
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMeta().then((meta) => {
      if (!cancelled) setAbout(meta.about);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sponsorImages = about?.sponsorImages ?? [];
  const hasSponsor = Boolean(about?.sponsorNote || sponsorImages.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="About"
        title="关于厚嘴唇空间站"
        description="非官方、非营利的 ChiliChill 粉丝信息导航，由歌迷自发搭建与维护。"
      />

      <div className="space-y-4">
        <PolicySection icon={<Heart className="h-4 w-4 text-amber" />} title="本站是什么">
          <p>
            厚嘴唇空间站是一个<strong className="text-ink">非官方、非营利</strong>
            的 ChiliChill 粉丝导航站，由歌迷自发搭建与维护，与 ChiliChill
            官方（包括但不限于官方微博、官方工作室及所属经纪公司）无任何隶属或合作关系。
          </p>
          <p>
            我们的目标很简单：把分散在各平台的粉丝群、作品站与活动信息集中整理、持续校准，让每一位歌迷都能快速找到想加入的群、想看的作品与想参加的活动。
          </p>
          <p>本站服务完全免费开放，无广告、无商业推广。</p>
        </PolicySection>

        <PolicySection icon={<Images className="h-4 w-4 text-amber" />} title="四大内容板块">
          <div className="grid gap-2 sm:grid-cols-2">
            {boards.map((board) => (
              <div key={board.title} className="border border-space-200 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-black text-ink">
                  {board.icon}
                  {board.title}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{board.desc}</p>
              </div>
            ))}
          </div>
        </PolicySection>

        <PolicySection icon={<PenSquare className="h-4 w-4 text-amber" />} title="内容如何流转">
          <p>
            <strong className="text-ink">1. 登录投稿：</strong>
            所有群舱、站点、画廊与活动信息均由粉丝登录后通过投稿功能提交，保证每条信息都有明确的贡献者。
          </p>
          <p>
            <strong className="text-ink">2. 人工审核：</strong>
            每条投稿在公开前都会经过运营团队的
            <strong className="text-ink">人工审核</strong>
            ，不实信息、过期内容或包含不当内容的投稿会被驳回。审核通常在 1-2 个工作日内完成。
          </p>
          <p>
            <strong className="text-ink">3. 公开展示：</strong>
            审核通过后，内容向所有访客公开展示，无需登录即可浏览。
          </p>
          <p>
            <strong className="text-ink">4. 持续校准：</strong>
            发现内容过期或错误时，可在「我的投稿」页面对已通过的内容发起修改申请，经审核通过后更新展示。
          </p>
        </PolicySection>

        <PolicySection icon={<ClipboardCheck className="h-4 w-4 text-amber" />} title="服务承诺">
          <p>
            <strong className="text-ink">侵权处理：</strong>
            如内容涉及侵权，请通过页脚联系方式反馈并提供权属证明，核实后将在 3 个工作日内下架处理。
          </p>
          <p>
            <strong className="text-ink">账号注销：</strong>
            提出申请后 7 个工作日内删除账号及全部关联数据。
          </p>
          <p>
            <strong className="text-ink">信息安全：</strong>
            不收集姓名、身份证号等实名信息，登录凭证加密存储；具体规则详见 
            <Link to="/privacy" className="text-amber underline underline-offset-2">《隐私政策》</Link>
            。
          </p>
        </PolicySection>

        <PolicySection icon={<Scale className="h-4 w-4 text-amber" />} title="权责与合规">
          <p>
            本站仅提供信息导航，跳转至第三方平台（QQ、微博、小红书、秀动、外部网站等）前会弹出确认页，站外内容由对应平台负责。
          </p>
          <p>
            本站不存储群成员的个人信息，不参与任何群的管理事务；加入任何粉丝群前请自行辨别，注意保护个人隐私与财产安全。
          </p>
          <p>本站不面向未满 14 周岁的未成年人提供服务。</p>
          <p>
            使用本站即表示同意 
            <Link to="/terms" className="text-amber underline underline-offset-2">《用户协议》</Link>
            ，相关权利义务以协议全文为准。
          </p>
        </PolicySection>

        <PolicySection icon={<UsersRound className="h-4 w-4 text-amber" />} title="加入维护">
          <p>
            欢迎通过投稿功能贡献内容。若你有意参与本站的长期维护（内容审核、资料整理、产品设计或开发），欢迎通过下方联系方式与运营团队联系，我们会认真评估每一份申请。
          </p>
          {about?.contactEmail ? (
            <p>
              联系邮箱：
              <a href={`mailto:${about.contactEmail}`} className="text-amber underline underline-offset-2">
                {about.contactEmail}
              </a>
            </p>
          ) : null}
        </PolicySection>

        <ChangelogSection />

        {hasSponsor ? (
          <PolicySection icon={<HeartHandshake className="h-4 w-4 text-amber" />} title="赞助支持">
            {about?.sponsorNote ? <p>{about.sponsorNote}</p> : null}
            {sponsorImages.length > 0 ? (
              <div className="pt-1">
                <div className="flex flex-wrap gap-3">
                  {sponsorImages.map((url, index) => (
                    <button
                      key={`${index}-${url}`}
                      type="button"
                      onClick={() => setZoomImage(url)}
                      className="group block cursor-zoom-in"
                      aria-label={`查看赞助图片 ${index + 1}`}
                    >
                      <img
                        src={url}
                        alt={`赞助图片 ${index + 1}`}
                        className="h-44 w-44 border border-space-200 bg-white object-contain transition group-hover:opacity-90"
                      />
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">点击图片可查看大图</p>
              </div>
            ) : null}
          </PolicySection>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted">
        本页面内容遵循站内统一说明，具体以最新公示版本为准。
        {about?.icpNumber ? (
          <span className="ml-2">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-amber"
            >
              {about.icpNumber}
            </a>
          </span>
        ) : null}
        <span className="ml-2">
          <Link to="/terms" className="underline underline-offset-2 hover:text-amber">
            用户协议
          </Link>
        </span>
        <span className="ml-2">
          <Link to="/privacy" className="underline underline-offset-2 hover:text-amber">
            隐私政策
          </Link>
        </span>
      </p>

      {zoomImage ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-6"
          onClick={() => setZoomImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="赞助图片大图"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/15 bg-space-900/80 p-2 text-ink transition hover:border-amber/50"
            aria-label="关闭"
            onClick={() => setZoomImage(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoomImage}
            alt="赞助图片"
            className="max-h-[80vh] max-w-full border border-space-200 bg-white object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
