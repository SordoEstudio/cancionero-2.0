'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ICON_CONTROL, ICON_STROKE } from '@/components/ui/icon-tokens';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored === 'dark' || (!stored && prefersDark);
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
    >
      {dark ? (
        <Sun size={ICON_CONTROL} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0" />
      ) : (
        <Moon size={ICON_CONTROL} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0" />
      )}
    </button>
  );
}
