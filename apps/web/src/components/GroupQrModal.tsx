import { useEffect, useState } from 'react';
import { Download, Info, QrCode, Smartphone } from 'lucide-react';
import type { Group } from '@spaceport/shared';
import { platformScanGuide } from '../lib/platform';
import { buttonClass } from './Button';
import Modal from './Modal';

interface GroupQrModalProps {
  group: Pick<Group, 'id' | 'name' | 'platform' | 'groupNumber' | 'qrcodeUrl'>;
  open: boolean;
  onClose: () => void;
}

// 入群二维码弹窗：卡片与详情页共用。
// 触屏设备优先「保存二维码」，同时保留长按引导（iOS Safari 对 <a download> 不保证生效）；
// 桌面端提示改用手机 App 扫码。
export default function GroupQrModal({ group, open, onClose }: GroupQrModalProps) {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia('(pointer: coarse)');
    setIsTouch(query.matches);
    const listener = (event: MediaQueryListEvent) => setIsTouch(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, [open]);

  const guide = platformScanGuide(group.platform);

  return (
    <Modal open={open} onClose={onClose} title={`${group.name} · 入群二维码`} size="sm">
      <div className="flex flex-col items-center gap-3">
        {group.qrcodeUrl ? (
          <div className="rounded-2xl border border-white/12 bg-space-950/60 p-3">
            <img src={group.qrcodeUrl} alt={`${group.name} 入群二维码`} className="h-60 w-60 object-contain" />
          </div>
        ) : (
          <div className="flex h-60 w-60 items-center justify-center rounded-2xl border border-dashed border-white/15 text-xs text-muted">
            二维码暂未上传
          </div>
        )}

        {group.qrcodeUrl ? (
          <a
            href={`/api/groups/${group.id}/qrcode`}
            download
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <Download className="h-4 w-4" /> 保存二维码
          </a>
        ) : null}

        {group.qrcodeUrl ? (
          isTouch ? (
            <p className="text-center text-xs leading-relaxed text-muted">
              {guide}
              <br />
              若未直接保存到相册，请长按上方图片选择「保存图片」。
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
              <QrCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              请在手机 App 内打开扫一扫识别上图加入。
            </p>
          )
        ) : null}

        {!group.qrcodeUrl ? (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
            可通过下方群号或加入链接入群。
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
