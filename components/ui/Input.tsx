'use client';

import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
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
      <input
        id={inputId}
        {...props}
        className={[
          'w-full rounded-lg border bg-[var(--bg-surface)] px-3 py-2 text-sm',
          'text-[var(--text-primary)] placeholder-[var(--text-muted)]',
          'border-[var(--border)] focus:border-[var(--accent)]',
          'focus:outline-none focus:ring-1 focus:ring-[var(--accent)]',
          'transition-colors duration-150',
          error ? 'border-[var(--danger)]' : '',
          className,
        ].join(' ')}
      />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
