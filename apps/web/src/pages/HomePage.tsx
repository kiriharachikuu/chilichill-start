import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Globe2,
  Images,
  MapPin,
  Play,
  Plus,
  Send,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import {
  type ActivityListResponse,
  type Group,
  type GroupListResponse,
  type MetaResponse,
  type Site,
  type SiteListResponse,
} from '@spaceport/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { loadMeta, EMPTY_META } from '../lib/meta';
import { formatFromNow } from '../lib/format';
import { MODULES, moduleBlurb, moduleIcon, moduleTone } from '../config/modules';
import { buttonClass } from '../components/Button';
import { useLoginDialog } from '../components/LoginModal';
import ActivityCard from '../components/ActivityCard';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GroupCard from '../components/GroupCard';
import SectionHeading from '../components/SectionHeading';
import SiteCard from '../components/SiteCard';

export default function HomePage() {
  const { openLogin } = useLoginDialog();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  // 已登录用户点击「开启航行」直接进入群舱，不再弹出登录框。
  // 登录态还在加载时忽略点击，避免误弹出登录框。
  const handleStart = () => {
    if (user) navigate('/groups');
    else if (!authLoading) openLogin();
  };
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [activities, setActivities] = useState<ActivityListResponse['items']>([]);

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  useEffect(() => {
    api
      .get<GroupListResponse>('/api/groups', { page: 1, pageSize: 6 })
      .then((result) => setGroups(result.items ?? []))
      .catch(() => setGroups([]));
    api
      .get<SiteListResponse>('/api/sites', { page: 1, pageSize: 3 })
      .then((result) => setSites(result.items ?? []))
      .catch(() => setSites([]));
    api
      .get<ActivityListResponse>('/api/activities', { page: 1, pageSize: 3 })
      .then((result) => setActivities(result.items ?? []))
      .catch(() => setActivities([]));
  }, []);

  const disabledModules = (meta.modules.length ? meta.modules : MODULES)
    .filter((item) => !item.enabled)
    .map((item) => ({
      key: item.key,
      label: item.label,
      path: item.path,
      blurb: moduleBlurb(item.key),
      tone: moduleTone(item.key),
      Icon: moduleIcon(item.key),
    }));

  const stats = [
    {
      label: '已收录群舱',
      value: meta.stats.groups,
      icon: UsersRound,
      tone: 'text-amber',
      hint: '同频伙伴的聚集地',
    },
    {
      label: '已收录站点',
      value: meta.stats.sites,
      icon: Globe2,
      tone: 'text-amber',
      hint: '粉丝自制的小宇宙',
    },
    {
      label: '已收录作品',
      value: meta.stats.galleryImages,
      icon: Images,
      tone: 'text-amber',
      hint: '粉丝创作的绘画与摄影',
    },
    {
      label: '最近更新',
      value: formatFromNow(meta.stats.latestContentAt),
      icon: Sparkles,
      tone: 'text-amber',
      hint: '星轨持续接收新信号',
    },
  ];

  return (
    <>
      <section className="theme-static relative flex h-[calc(100svh-3.5rem)] min-h-[560px] items-center justify-center overflow-hidden border-b-2 border-ink bg-ink lg:h-screen">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/media/chilichill-2026-tour-teaser.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="absolute inset-0 bg-ink/55" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <p className="mb-5 inline-flex border border-white/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.28em] text-white">
            Signal Online · Welcome Aboard
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            把散落的粉丝信号
            <br className="hidden sm:block" />
            收进同一块站牌。
          </h1>
          <div className="mx-auto mt-6 h-1 w-24 bg-amber" />
          <div className="mt-9 flex justify-center">
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex h-12 items-center justify-center gap-2 border-2 border-white bg-white px-8 text-sm font-black text-ink transition-colors hover:border-amber hover:bg-amber hover:text-white"
            >
              <Play className="h-4 w-4" />
              开启航行
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-16 px-4 py-16 sm:space-y-20 sm:px-6 lg:px-8 lg:py-20">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="flex items-center gap-4">
                <span className={`flex h-11 w-11 items-center justify-center border border-ink bg-white ${stat.tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-black text-ink">{stat.value}</p>
                  <p className="text-xs font-bold text-muted">{stat.label}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{stat.hint}</p>
                </div>
              </Card>
            );
          })}
        </section>


        {activities.length ? (
          <section className="space-y-6">
            <SectionHeading
              eyebrow="Blackboard"
              title="历届活动"
              description="生日会、周年庆与纪念企划的存档，点开卡片重温当时的信号。"
              action={
                <Link to="/activities" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                  查看更多 <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activities.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Region Routes"
            title="按大区进入轨道"
            description="点击大区查看该区域的全部群舱；尚未开舱的区域欢迎投出第一个群。"
            action={
              <Link to="/groups" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                全部群舱 <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {meta.regions.map((region) =>
              region.groupCount > 0 ? (
                <Link
                  key={region.code}
                  to={`/groups?region=${region.code}`}
                  className="group flex flex-col border border-space-200 bg-white px-4 py-4 transition-colors hover:border-amber"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-ink">{region.name}</span>
                    <MapPin className="h-3.5 w-3.5 text-muted transition-colors group-hover:text-amber" />
                  </span>
                  <span className="mt-2 text-[11px] text-muted">{region.groupCount} 个群舱</span>
                </Link>
              ) : (
                <Link
                  key={region.code}
                  to={`/submit?tab=group&region=${region.code}`}
                  className="group flex flex-col border border-dashed border-space-200 bg-transparent px-4 py-4 transition-colors hover:border-amber"
                >
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-muted">{region.name}</span>
                    <Plus className="h-3.5 w-3.5 text-muted transition-colors group-hover:text-amber" />
                  </span>
                  <span className="mt-2 text-[11px] text-muted/70 transition-colors group-hover:text-amber">
                    待开舱 · 欢迎首投
                  </span>
                </Link>
              ),
            )}
          </div>
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Latest Docks"
            title="最新停靠的群舱"
            description="刚刚完成审核、亮起信号灯的新伙伴。"
            action={
              <Link to="/groups" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                查看全部 <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          {groups.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="星轨暂未传回群舱数据"
              description="可能是信号还在路上，或后端舱段尚未启动。稍后刷新看看，也欢迎先投递你的群。"
              action={
                <Link to="/submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  投递一个群舱
                </Link>
              }
            />
          )}
        </section>

        <section className="space-y-6">
          <SectionHeading
            eyebrow="Featured Sites"
            title="精选站点"
            description="粉丝自制的小游戏、工具与测试站，均经过运营团队试航。"
            action={
              <Link to="/sites" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                浏览站点 <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          {sites.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sites.map((site) => (
                <SiteCard key={site.id} site={site} />
              ))}
            </div>
          ) : (
            <EmptyState title="站点雷达暂时静默" description="还没有收到可展示的站点信号，稍后再来看看。" />
          )}
        </section>

        <section>
          <div className="relative overflow-hidden border border-ink bg-white p-6 sm:p-8">
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-xl">
                <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-amber">
                  <Sparkles className="h-3.5 w-3.5" /> Submit Your Signal
                </p>
                <h2 className="text-xl font-black text-ink sm:text-2xl">有想分享的群或站点？</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  提交后信号会进入审核队列，运营团队校准分类并确认内容健康后，就会出现在对应舱段。修改线上内容同样需要一次审核，原内容不会提前变动。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/submit" className={buttonClass({ variant: 'primary', size: 'lg' })}>
                  <Send className="h-4 w-4" /> 发送投稿信号
                </Link>
                <Link to="/me" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                  我的投稿
                </Link>
              </div>
            </div>
          </div>
        </section>

        {disabledModules.length ? (
          <section className="space-y-6">
            <SectionHeading
              eyebrow="Under Construction"
              title="即将开放的舱段"
              description="空间站预留了干净的扩展位，新的内容类型会沿用同一套投稿与审核流程。"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {disabledModules.map((item) => (
                <Card key={item.key} hover={false} className="flex items-start gap-4">
                  <span className={`flex h-12 w-12 items-center justify-center border border-ink bg-white ${item.tone}`}>
                    <item.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-extrabold text-ink">{item.label}</h3>
                      <span className="border border-dashed border-space-300 px-2 py-0.5 text-[10px] font-bold text-muted">
                        即将开放
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{item.blurb}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}
