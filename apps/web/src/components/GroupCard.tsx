import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, QrCode } from 'lucide-react';
import {
  GROUP_TYPE_LABELS,
  formatLocation,
  type Group,
} from '@spaceport/shared';
import { copyText, gradientFor, initialOf } from '../lib/format';
import { externalRedirectHref } from '../lib/redirect';
import Badge, { type BadgeTone } from './Badge';
import Button, { buttonClass } from './Button';
import Card from './Card';
import Modal from './Modal';
import TagChip from './TagChip';
import { useToast } from './Toast';

const TYPE_TONES: Record<Group['type'], BadgeTone> = {
  GENERAL: 'aurora',
  REGION: 'amber',
  COLLEGE: 'violet',
  OTHER: 'neutral',
};

export default function GroupCard({ group }: { group: Group }) {
  const [qrOpen, setQrOpen] = useState(false);
  const toast = useToast();

  const place = formatLocation(group.province, group.city);
  const location =
    group.type === 'GENERAL'
      ? '线上'
      : group.type === 'COLLEGE'
        ? [place || '未选城市', group.school].filter(Boolean).join(' · ')
        : [group.regionName ?? '待定', place || '未选城市'].filter(Boolean).join(' · ');

  const handleCopy = async () => {
    const ok = await copyText(group.groupNumber);
    if (ok) toast.success(`群号 ${group.groupNumber} 已复制到剪贴板`);
    else toast.error('复制失败，请手动选择群号');
  };

  return (
    <>
      <Card className="flex h-full flex-col">
        <div className="flex items-start gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/12 text-lg font-semibold text-ink"
            style={{ backgroundImage: gradientFor(group.name) }}
          >
            {group.avatarUrl ? (
              <img src={group.avatarUrl} alt={`${group.name} 群头像`} className="h-full w-full object-cover" />
            ) : (
              initialOf(group.name)
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={TYPE_TONES[group.type]}>{GROUP_TYPE_LABELS[group.type]}</Badge>
              {group.regionName ? (
                <span className="text-xs text-muted">{location}</span>
              ) : null}
            </div>
            <Link
              to={`/groups/${group.id}`}
              className="mt-1.5 block truncate text-base font-semibold text-ink transition hover:text-amber"
            >
              {group.name}
            </Link>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 min-h-[2.6rem] text-sm leading-relaxed text-muted">
          {group.description}
        </p>

        {group.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {group.tags.slice(0, 4).map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
            {group.tags.length > 4 ? (
              <span className="self-center text-xs text-muted">+{group.tags.length - 4}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/8 pt-4">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-xs text-ink/85 transition hover:border-amber/40 hover:text-amber"
          >
            <Copy className="h-3.5 w-3.5" /> {group.groupNumber}
          </button>
          <span className="ml-auto flex items-center gap-2">
            {group.qrcodeUrl ? (
              <Button variant="ghost" size="sm" icon={<QrCode className="h-4 w-4" />} onClick={() => setQrOpen(true)}>
                二维码
              </Button>
            ) : null}
            {group.joinUrl ? (
              <a
                href={externalRedirectHref(group.joinUrl)}
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                加入群舱 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-xs text-muted">暂无加入链接</span>
            )}
          </span>
        </div>
      </Card>

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
          <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => void handleCopy()}>
            复制群号
          </Button>
        </div>
      </Modal>
    </>
  );
}
