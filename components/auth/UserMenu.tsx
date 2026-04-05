'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { LogIn, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ICON_INLINE, ICON_STROKE } from '@/components/ui/icon-tokens';

function avatarUrlFromUser(user: User): string | null {
  const m = user.user_metadata;
  if (!m || typeof m !== 'object') return null;
  const url = m.avatar_url ?? m.picture;
  return typeof url === 'string' && url.length > 0 ? url : null;
}

function initialFromUser(user: User): string {
  const name = user.user_metadata?.full_name;
  if (typeof name === 'string' && name.trim()) return name.trim().charAt(0).toUpperCase();
  const email = user.email ?? '?';
  return email.charAt(0).toUpperCase();
}

export function UserMenu() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleSignOut = useCallback(async () => {
    setOpen(false);
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
    router.push('/');
  }, [router, supabase]);

  if (user === undefined) {
    return (
      <div
        className="h-8 w-8 shrink-0 rounded-full bg-[var(--bg-elevated)] animate-pulse"
        aria-hidden
      />
    );
  }

  if (!user) {
    return (
      <Link
        href="/auth/login"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
        aria-label="Iniciar sesión"
        title="Iniciar sesión"
      >
        <LogIn size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0" />
      </Link>
    );
  }

  const avatarSrc = avatarUrlFromUser(user);
  const initial = initialFromUser(user);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg-surface)] ring-offset-2 hover:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menú de cuenta"
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="text-xs font-semibold text-[var(--chord-color)]">{initial}</span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] py-1 shadow-lg"
          role="menu"
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="truncate text-xs font-medium text-[var(--text-primary)]">
              {user.user_metadata?.full_name ?? 'Tu cuenta'}
            </p>
            <p className="truncate text-[10px] text-[var(--text-muted)]">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            <LogOut size={ICON_INLINE} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0 opacity-80" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
