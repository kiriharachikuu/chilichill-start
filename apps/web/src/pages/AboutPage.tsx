import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Heart, HeartHandshake, PenSquare, ShieldCheck, UsersRound, X } from 'lucide-react';
import { loadMeta, readCachedMeta } from '../lib/meta';
import SectionHeading from '../components/SectionHeading';

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

export default function AboutPage() {
  // 备案号/联系邮箱/赞助支持均在后台「站点信息」中配置，经 /api/meta 下发
  const cached = readCachedMeta();
  const [about, setAbout] = useState(cached?.about ?? null);
  const [zoomQrcode, setZoomQrcode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadMeta().then((meta) => {
      if (!cancelled) setAbout(meta.about);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasSponsor = Boolean(about?.sponsorNote || about?.sponsorQrcodeUrl);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="About"
        title="关于厚嘴唇空间站"
        description="一个由歌迷共同维护的 ChiliChill 粉丝信息导航。"
      />

      <div className="space-y-4">
        <PolicySection icon={<Heart className="h-4 w-4 text-amber" />} title="本站是什么">
          <p>
            厚嘴唇空间站是一个非官方的 ChiliChill 粉丝导航站，由歌迷自发搭建与维护，与 ChiliChill
            官方（包括但不限于官方微博、官方工作室及所属经纪公司）无任何隶属或合作关系。
          </p>
          <p>
            站内内容分为四个板块：群舱（各地粉丝群汇总）、站点（粉丝作品站收录）、画廊（粉丝二创作品墙）与活动（官方及粉丝自发活动日历）。
          </p>
        </PolicySection>

        <PolicySection icon={<PenSquare className="h-4 w-4 text-amber" />} title="内容来自投稿">
          <p>
            所有群舱、站点、画廊与活动信息均由粉丝登录后投稿产生。每条投稿在公开前都会经过站长的
            <strong className="text-ink">人工审核</strong>
            ，不实信息、过期内容或包含不当内容的投稿会被驳回。
          </p>
          <p>发现内容过期或错误时，可在「我的投稿」页面对已通过的内容发起修改申请，经审核通过后更新。</p>
        </PolicySection>

        <PolicySection icon={<ShieldCheck className="h-4 w-4 text-amber" />} title="免责声明">
          <p>
            本站仅提供信息导航，跳转至第三方平台（QQ、微博、小红书、秀动、外部网站等）前会弹出确认页，站外内容由对应平台负责。
          </p>
          <p>
            本站不存储群成员的个人信息，不参与任何群的管理事务；加入任何粉丝群前请自行辨别，注意保护个人隐私与财产安全。
          </p>
          <p>如内容涉及侵权，请通过页脚联系方式反馈，核实后将在 3 个工作日内处理。</p>
        </PolicySection>

        <PolicySection icon={<UsersRound className="h-4 w-4 text-amber" />} title="加入维护">
          <p>
            欢迎通过投稿功能贡献内容。若你有意参与本站的长期维护（审核、内容整理、开发），可通过下方联系方式与站长取得联系。
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

        {hasSponsor ? (
          <PolicySection icon={<HeartHandshake className="h-4 w-4 text-amber" />} title="赞助支持">
            {about?.sponsorNote ? <p>{about.sponsorNote}</p> : null}
            {about?.sponsorQrcodeUrl ? (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setZoomQrcode(true)}
                  className="group block cursor-zoom-in"
                  aria-label="查看赞赏码大图"
                >
                  <img
                    src={about.sponsorQrcodeUrl}
                    alt="赞赏码"
                    className="h-44 w-44 border border-space-200 bg-white object-contain transition group-hover:opacity-90"
                  />
                </button>
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
          <Link to="/privacy" className="underline underline-offset-2 hover:text-amber">
            隐私政策
          </Link>
        </span>
      </p>

      {zoomQrcode && about?.sponsorQrcodeUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-space-950/80 p-6"
          onClick={() => setZoomQrcode(false)}
          role="dialog"
          aria-modal="true"
          aria-label="赞赏码大图"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full border border-white/15 bg-space-900/80 p-2 text-ink transition hover:border-amber/50"
            aria-label="关闭"
            onClick={() => setZoomQrcode(false)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={about.sponsorQrcodeUrl}
            alt="赞赏码"
            className="max-h-[80vh] max-w-full border border-space-200 bg-white object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
