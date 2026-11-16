import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Globe2, Images, MapPin, Send, UsersRound } from 'lucide-react';
import type { MetaResponse, Submission } from '@spaceport/shared';
import { REGIONS } from '@spaceport/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EMPTY_META, loadMeta } from '../lib/meta';
import {
  emptyGalleryForm,
  emptyGroupForm,
  emptySiteForm,
  validateGalleryForm,
  validateGroupForm,
  validateSiteForm,
  type FieldErrors,
  type GalleryFormState,
  type GroupFormState,
  type SiteFormState,
} from '../lib/submissionForms';
import Button, { buttonClass } from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GalleryFields from '../components/forms/GalleryFields';
import GroupFields from '../components/forms/GroupFields';
import SiteFields from '../components/forms/SiteFields';
import SectionHeading from '../components/SectionHeading';
import { useToast } from '../components/Toast';

type Tab = 'GROUP' | 'SITE' | 'GALLERY';

// 首页空大区卡片跳转 /submit?region=CODE 时，预选「地区粉丝群」类型并展示提示。
function resolveRegionHint(code: string | null): string | null {
  if (!code) return null;
  return REGIONS.find((region) => region.code === code)?.name ?? null;
}

export default function SubmitPage() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'gallery' ? 'GALLERY' : 'GROUP');
  const regionHint = resolveRegionHint(searchParams.get('region'));
  const [groupForm, setGroupForm] = useState<GroupFormState>(() => ({
    ...emptyGroupForm(),
    type: regionHint ? 'REGION' : '',
  }));
  const [siteForm, setSiteForm] = useState<SiteFormState>(emptySiteForm);
  const [galleryForm, setGalleryForm] = useState<GalleryFormState>(emptyGalleryForm);
  const [groupErrors, setGroupErrors] = useState<FieldErrors>({});
  const [siteErrors, setSiteErrors] = useState<FieldErrors>({});
  const [galleryErrors, setGalleryErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent('/submit')}`} replace />;
  }

  const reset = (nextTab?: Tab) => {
    setSuccess(false);
    setServerError('');
    setGroupErrors({});
    setSiteErrors({});
    setGalleryErrors({});
    setGroupForm(emptyGroupForm());
    setSiteForm(emptySiteForm());
    setGalleryForm(emptyGalleryForm());
    if (nextTab) setTab(nextTab);
  };

  const submit = async () => {
    setServerError('');
    if (tab === 'GROUP') {
      const result = validateGroupForm(groupForm);
      setGroupErrors(result.errors);
      if (!result.payload) return;
      setSubmitting(true);
      try {
        await api.post<{ item: Submission }>('/api/submissions', {
          entityType: 'GROUP',
          mode: 'CREATE',
          payload: result.payload,
        });
        setSuccess(true);
        toast.success('群信号已发送，等待站长审核');
      } catch (error) {
        setServerError(error instanceof ApiError ? error.message : '提交失败，请稍后再试');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (tab === 'GALLERY') {
      const result = validateGalleryForm(galleryForm);
      setGalleryErrors(result.errors);
      if (!result.payload) return;
      setSubmitting(true);
      try {
        await api.post<{ item: Submission }>('/api/submissions', {
          entityType: 'GALLERY',
          mode: 'CREATE',
          payload: result.payload,
        });
        setSuccess(true);
        toast.success('作品已提交，等待审核组审核');
      } catch (error) {
        setServerError(error instanceof ApiError ? error.message : '提交失败，请稍后再试');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const result = validateSiteForm(siteForm);
    setSiteErrors(result.errors);
    if (!result.payload) return;
    setSubmitting(true);
    try {
      await api.post<{ item: Submission }>('/api/submissions', {
        entityType: 'SITE',
        mode: 'CREATE',
        payload: result.payload,
      });
      setSuccess(true);
      toast.success('站点信号已发送，等待站长审核');
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '提交失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
        <Card hover={false} className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-mint/35 bg-mint/10 text-mint">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-mint/80">Signal Received</p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            {tab === 'GALLERY' ? '作品已进入审核队列' : '信号已发送，等待站长审核'}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
            {tab === 'GALLERY'
              ? '作品已经进入审核队列。审核组会检查作品类型、画质与标签，通过后就会出现在粉丝画廊。你可以在「我的投稿」查看进度。'
              : '投稿已经进入审核队列。站长会校准分类与内容，通常 1-2 日内完成。你可以在「我的投稿」查看进度和驳回原因。'}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {tab === 'GALLERY' ? (
              <>
                <Link to="/gallery" className={buttonClass({ variant: 'primary', size: 'md' })}>
                  去画廊看看
                </Link>
                <Link to="/me" className={buttonClass({ variant: 'secondary', size: 'md' })}>
                  我的投稿
                </Link>
              </>
            ) : (
              <Link to="/me" className={buttonClass({ variant: 'primary', size: 'md' })}>
                去我的投稿
              </Link>
            )}
            <Button variant="secondary" onClick={() => reset(tab)}>
              继续投稿
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="Submit Signal"
        title="投递你的信号"
        description="所有投稿都会先进入审核队列，通过后才会出现在公开舱段。修改线上内容同样需要一次审核，原内容不会提前变动。"
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
        {([
          { key: 'GROUP', label: 'Q群投稿', icon: UsersRound },
          { key: 'SITE', label: '网站投稿', icon: Globe2 },
          { key: 'GALLERY', label: '画廊投稿', icon: Images },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setTab(item.key);
                setServerError('');
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition ${
                tab === item.key
                  ? 'bg-amber/15 font-medium text-amber'
                  : 'text-muted hover:bg-white/[0.04] hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_0.9fr]">
        <Card hover={false}>
          {tab === 'GROUP' && regionHint ? (
            <p className="mb-4 flex items-center gap-2 border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              本次为「{regionHint}」大区投稿：类型已选「地区粉丝群」，请在下方选择对应省份城市。
            </p>
          ) : null}
          {tab === 'GROUP' ? (
            <GroupFields value={groupForm} onChange={setGroupForm} meta={meta} errors={groupErrors} />
          ) : tab === 'GALLERY' ? (
            <GalleryFields
              value={galleryForm}
              onChange={(patch) => setGalleryForm((current) => ({ ...current, ...patch }))}
              errors={galleryErrors}
            />
          ) : (
            <SiteFields value={siteForm} onChange={setSiteForm} meta={meta} errors={siteErrors} />
          )}

          {serverError ? (
            <div className="mt-5 rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs leading-relaxed text-coral">
              {serverError}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/8 pt-5">
            <Button loading={submitting} size="lg" icon={<Send className="h-4 w-4" />} onClick={() => void submit()}>
              发送投稿信号
            </Button>
            <Button variant="ghost" onClick={() => reset()} disabled={submitting}>
              清空重填
            </Button>
            <Link to="/me" className="ml-auto text-xs text-muted transition hover:text-amber">
              查看我的投稿 →
            </Link>
          </div>
        </Card>

        <div className="space-y-4">
          <Card hover={false}>
            <p className="text-[11px] uppercase tracking-[0.26em] text-amber/80">Checklist</p>
            <h3 className="mt-2 text-sm font-semibold text-ink">投稿前小检查</h3>
            <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-muted">
              {tab === 'GALLERY' ? (
                <>
                  <li>· 图片支持 png / jpg / jpeg / webp，单张不超过 5MB。</li>
                  <li>· 绘画与摄影请选择对应的作品类型，便于审核组归类。</li>
                  <li>· 标题最多 40 字，描述最多 200 字，标签最多 8 个。</li>
                  <li>· 请上传本人原创或已获授权的作品。</li>
                </>
              ) : tab === 'GROUP' ? (
                <>
                  <li>· 先选群类型：同城群、高校群要填城市，高校群还需填学校。</li>
                  <li>· 功能群和其他群至少选 1 个标签，全部类型最多 8 个。</li>
                  <li>· QQ 群填群号（5-12 位数字），微博 / 秀动 / 小红书粉丝群无需群号。</li>
                  <li>· 群名 2-40 字，群简介 5-200 字，写清群的氛围和日常。</li>
                  <li>· 头像与二维码选填，png / jpg / webp 均可，不超过 5MB。</li>
                </>
              ) : (
                <>
                  <li>· 站点标题 1-40 字，简介 5-200 字，说清站点能做什么。</li>
                  <li>· 链接必须是完整 URL（含 https://），并确认能正常打开。</li>
                  <li>· 至少选择 1 个站点标签，最多 8 个。</li>
                  <li>· 封面选填，建议 16:9 比例，不超过 5MB，缺省用渐变首字。</li>
                </>
              )}
              <li>· 修改已上线内容会生成一条更新投稿，审核通过后才生效。</li>
            </ul>
          </Card>

          {meta.tags.group.length === 0 && meta.tags.sites.length === 0 ? (
            <EmptyState
              compact
              title="标签星图暂未加载"
              description="若后端还未启动，标签与城市选择会暂时为空，稍后刷新即可。"
            />
          ) : null}

          <Card hover={false} className="bg-gradient-to-br from-aurora/[0.08] to-transparent">
            <p className="text-xs leading-relaxed text-muted">
              贴心的站长会在审核时帮你修正分类、标签与格式，不用担心一次填不完美。若被驳回，你会看到具体原因，并可修改后重新提交。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
