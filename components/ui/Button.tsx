'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<Variant, string> = {
  primary:   'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border-transparent',
  secondary: 'bg-[var(--bg-elevated)] hover:bg-[var(--border)] text-[var(--text-primary)] border-[var(--border)]',
  ghost:     'bg-transparent hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-transparent',
  danger:    'bg-[var(--danger)] hover:opacity-90 text-white border-transparent',
};

const sizeStyles: Record<Size, string> = {
  sm:  'px-3 py-1.5 text-sm',
  md:  'px-4 py-2 text-sm',
  lg:  'px-5 py-2.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center gap-2 rounded-lg border font-medium',
        'transition-colors duration-150 focus:outline-none focus:ring-2',
        'focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--bg-base)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {loading && (
        <Loader2
          size={ICON_INLINE}
          strokeWidth={ICON_STROKE}
          className="shrink-0 animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
