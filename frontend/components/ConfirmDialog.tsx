'use client';

import { useEffect } from 'react';

import { useLanguage } from '@/lib/i18n';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  detail?: string | null;
  confirmLabel: string;
  busy?: boolean;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  detail,
  confirmLabel,
  busy = false,
  tone = 'danger',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useLanguage();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={busy ? undefined : onClose} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="dialog-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-eyebrow">Research Git</div>
        <h2 id="confirm-dialog-title" className="dialog-title">
          {title ?? confirmLabel}
        </h2>
        <p className="dialog-copy">{message}</p>
        {detail && <div className="dialog-detail">{detail}</div>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
