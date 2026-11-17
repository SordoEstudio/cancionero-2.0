'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  destructive = false,
  disabled = false,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => cancelAnimationFrame(t);
  }, [open]);

  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[200] bg-[var(--bg-overlay)] data-[state=open]:opacity-100 opacity-0 transition-opacity duration-150"
          style={{ pointerEvents: open ? 'auto' : 'none' }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-xl outline-none focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-describedby={description ? 'confirm-dialog-desc' : undefined}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--text-primary)] pr-6">
            {title}
          </Dialog.Title>
          {description && (
            <p id="confirm-dialog-desc" className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" size="md">
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <button
              ref={confirmRef}
              type="button"
              disabled={disabled}
              onClick={handleConfirm}
              className={[
                'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-40',
                destructive
                  ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500'
                  : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 focus-visible:ring-[var(--accent)]',
              ].join(' ')}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
