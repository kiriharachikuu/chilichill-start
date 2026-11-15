import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** 确认正文，通常为目标条目的摘要卡片 */
  children?: ReactNode;
  confirmText?: string;
  /** 危险操作（删除/移除）时主按钮显示为红色 */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

// 项目统一的二次确认弹窗：替代 window.confirm，避免各页自造确认 UI
export default function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmText = '确认',
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="sm"
      eyebrow="Confirm"
      title={title}
      description={description}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmText}
          </Button>
        </div>
      }
    >
      {children}
    </Modal>
  );
}
