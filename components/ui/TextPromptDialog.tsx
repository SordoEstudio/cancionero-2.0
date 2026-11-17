'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

export interface TextPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  defaultValue: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
}

/**
 * Diálogo accesible para texto (reemplazo de window.prompt).
 */
export function TextPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  defaultValue,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  onConfirm,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const t = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(t);
  }, [open, defaultValue]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
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
          className="fixed left-1/2 top-1/2 z-[201] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-xl outline-none focus:outline-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
          aria-describedby={description ? 'text-prompt-desc' : undefined}
        >
          <Dialog.Title className="text-lg font-semibold text-[var(--text-primary)] pr-8">
            {title}
          </Dialog.Title>
          {description ? (
            <p id="text-prompt-desc" className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            className="mt-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            autoComplete="off"
            aria-label={title}
          />

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="secondary" size="md">
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button type="button" size="md" onClick={submit} disabled={!value.trim()}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
