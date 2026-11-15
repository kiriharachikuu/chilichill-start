import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  ExternalLink,
  GraduationCap,
  MapPin,
  QrCode,
  Wifi,
} from 'lucide-react';
import { GROUP_TYPE_LABELS, formatLocation, spaceHref, type Group } from '@spaceport/shared';
import { api } from '../lib/api';
import { copyText, formatDate, gradientFor, initialOf } from '../lib/format';
import { externalRedirectHref } from '../lib/redirect';
import Badge, { type BadgeTone } from '../components/Badge';
import Button, { buttonClass } from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import TagChip from '../components/TagChip';
import { useToast } from '../components/Toast';

const TYPE_TONES: Record<Group['type'], BadgeTone> = {
  GENERAL: 'aurora',
  REGION: 'amber',
  COLLEGE: 'violet',
  OTHER: 'neutral',
};

function locationText(group: Group): string {
  if (group.type === 'GENERAL') return '线上';
  const place = formatLocation(group.province, group.city) || '未选城市';
  if (group.type === 'COLLEGE') {
    return [place, group.school].filter(Boolean).join(' · ');
  }
  return [group.regionName ?? '待定', place].filter(Boolean).join(' · ');
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    api
      .get<Group>(`/api/groups/${id}`)
      .then((result) => {
        if (alive) setGroup(result);
      })
      .catch(() => {
        if (alive) setGroup(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return <div className="h-72 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />;
  }

  if (!group) {
    return (
      <EmptyState
        title="没有找到这个群舱"
        description="信号可能已经迁出轨道，或者链接有误。"
        action={
          <Link to="/groups" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <ArrowLeft className="h-4 w-4" /> 返回群舱导航
          </Link>
        }
      />
    );
  }

  const handleCopy = async () => {
    const ok = await copyText(group.groupNumber);
    if (ok) toast.success(`群号 ${group.groupNumber} 已复制到剪贴板`);
    else toast.error('复制失败，请手动选择群号');
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link
        to="/groups"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-amber"
      >
        <ArrowLeft className="h-4 w-4" /> 返回群舱导航
      </Link>

      <Card hover={false} padded={false} className="overflow-hidden">
        <div className="relative border-b border-white/8 px-6 py-8" style={{ backgroundImage: gradientFor(group.name) }}>
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-space-950/40 text-2xl font-semibold text-ink backdrop-blur">
              {group.avatarUrl ? (
                <img src={group.avatarUrl} alt={`${group.name} 群头像`} className="h-full w-full object-cover" />
              ) : (
                initialOf(group.name)
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TYPE_TONES[group.type]}>{GROUP_TYPE_LABELS[group.type]}</Badge>
                {group.regionName ? <Badge tone="neutral">{group.regionName}大区</Badge> : null}
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">{group.name}</h1>
              <p className="mt-2 text-sm text-muted">{locationText(group)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">群简介</p>
              <p className="mt-2 text-sm leading-relaxed text-ink/85">{group.description}</p>
            </div>
            {group.purpose ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">用途说明</p>
                <p className="mt-2 text-sm leading-relaxed text-ink/85">{group.purpose}</p>
              </div>
            ) : null}
            {group.tags.length ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">标签</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {group.tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">群号</span>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-sm text-ink transition hover:border-amber/40 hover:text-amber"
              >
                {group.groupNumber} <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            {group.type === 'COLLEGE' && group.school ? (
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted">
                  <GraduationCap className="h-3.5 w-3.5" /> 学校
                </span>
                <span className="text-ink">{group.school}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                {group.type === 'GENERAL' ? <Wifi className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                归属
              </span>
              <span className="text-ink">{locationText(group)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <CalendarDays className="h-3.5 w-3.5" /> 收录
              </span>
              <span className="text-ink">{formatDate(group.createdAt)}</span>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {group.joinUrl ? (
                <a
                  href={externalRedirectHref(group.joinUrl)}
                  className={buttonClass({ variant: 'primary', size: 'md', fullWidth: true })}
                >
                  加入群舱 <ExternalLink className="h-4 w-4" />
                </a>
              ) : (
                <Button variant="secondary" fullWidth disabled>
                  暂无加入链接
                </Button>
              )}
              {group.qrcodeUrl ? (
                <Button
                  variant="secondary"
                  fullWidth
                  icon={<QrCode className="h-4 w-4" />}
                  onClick={() => setQrOpen(true)}
                >
                  查看入群二维码
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {group.uploader ? (
        <Link
          to={spaceHref(group.uploader.uid)}
          className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition hover:border-amber/40"
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/12 text-sm font-semibold text-ink"
            style={{ backgroundImage: gradientFor(group.uploader.nickname) }}
          >
            {group.uploader.avatarUrl ? (
              <img
                src={group.uploader.avatarUrl}
                alt={`${group.uploader.nickname} 的头像`}
                className="h-full w-full object-cover"
              />
            ) : (
              initialOf(group.uploader.nickname)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted">上传者</p>
            <p className="truncate text-sm font-semibold text-ink">
              {group.uploader.nickname}
              <span className="ml-2 font-mono text-[11px] font-normal text-muted">UID {group.uploader.uid}</span>
            </p>
          </div>
          <span className="text-xs text-muted transition group-hover:text-amber">进入空间 →</span>
        </Link>
      ) : null}

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={`${group.name} · 入群二维码`} size="sm">
        <div className="flex flex-col items-center gap-3">
          {group.qrcodeUrl ? (
            <div className="rounded-2xl border border-white/12 bg-space-950/60 p-3">
              <img src={group.qrcodeUrl} alt={`${group.name} 二维码`} className="h-56 w-56 object-contain" />
            </div>
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-muted">
              二维码暂未上传
            </div>
          )}
          <p className="text-xs text-muted">扫码或使用群号 {group.groupNumber} 加入</p>
        </div>
      </Modal>
    </div>
  );
}
