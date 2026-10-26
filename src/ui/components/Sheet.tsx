import React, { useEffect } from 'react';

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
}

/** Bottom sheet on phones, centered dialog on desktop. */
export function Sheet({ title, onClose, children, footer, onBack }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          {onBack && (
            <button className="btn ghost sm" onClick={onBack} aria-label="Back">
              ‹ Back
            </button>
          )}
          <h2>{title}</h2>
          <button className="btn ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = React.useState<string | null>(null);
  const show = React.useCallback((m: string, ms = 1800) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), ms);
  }, []);
  const el = msg ? <div className="toast">{msg}</div> : null;
  return { show, el };
}

export function Confirm({ title, text, onYes, onNo, yesLabel = 'Yes', danger = false }: { title: string; text: string; onYes: () => void; onNo: () => void; yesLabel?: string; danger?: boolean }) {
  return (
    <Sheet
      title={title}
      onClose={onNo}
      footer={
        <>
          <button className="btn" onClick={onNo}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onYes}>
            {yesLabel}
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Sheet>
  );
}
