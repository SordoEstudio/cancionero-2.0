'use client';

import type { TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', id, ...props }: TextareaProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        {...props}
        className={[
          'w-full min-h-[12rem] rounded-lg border bg-[var(--bg-surface)] px-3 py-2 text-sm',
          'text-[var(--text-primary)] placeholder-[var(--text-muted)]',
          'border-[var(--border)] focus:border-[var(--accent)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--accent)]',
          'transition-colors duration-150 font-mono leading-relaxed',
          error ? 'border-[var(--danger)]' : '',
          className,
        ].join(' ')}
      />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
