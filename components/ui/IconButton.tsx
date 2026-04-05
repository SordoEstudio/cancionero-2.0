'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ICON_TOOLBAR, lucideDecorative } from '@/components/ui/icon-tokens';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** Texto nativo al hover (y lectores de pantalla si no pasás aria-label). */
  label: string;
}

/**
 * Botón cuadrado para una sola acción con icono.
 * Los hijos Lucide deben ser decorativos (sin título propio); pasá `label` aquí.
 */
export function IconButton({
  children,
  label,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={[
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-transparent',
        'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]',
        'disabled:pointer-events-none disabled:opacity-40',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Props Lucide recomendadas para iconos dentro de IconButton. */
export const lucideInIconButton = lucideDecorative(ICON_TOOLBAR);
