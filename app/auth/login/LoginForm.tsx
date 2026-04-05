'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const callbackError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(
    callbackError ? 'Error en el inicio de sesión. Intentá de nuevo.' : null
  );
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);
  const [magicMessage, setMagicMessage] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  const supabase = createClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setMagicError(null);
    setMagicMessage(null);

    if (!email.trim()) {
      setPasswordError('Ingresá tu email');
      return;
    }
    if (!password) {
      setPasswordError('Ingresá tu contraseña');
      return;
    }

    setPasswordLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setPasswordLoading(false);

    if (authError) {
      const msg = authError.message?.toLowerCase() ?? '';
      if (msg.includes('invalid') || msg.includes('credentials')) {
        setPasswordError('Email o contraseña incorrectos');
      } else {
        setPasswordError(authError.message);
      }
      return;
    }

    router.refresh();
    router.push(next.startsWith('/') ? next : '/');
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMagicError(null);
    setMagicMessage(null);
    setPasswordError(null);

    if (!email.trim()) {
      setMagicError('Ingresá tu email');
      return;
    }

    setMagicLoading(true);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setMagicLoading(false);

    if (authError) {
      setMagicError(authError.message);
    } else {
      setMagicMessage('Revisá tu email — te enviamos un link para ingresar.');
    }
  }

  async function handleGoogleLogin() {
    setOauthLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  const demoBanner = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === 'true';

  return (
    <main className="max-w-sm mx-auto px-4 py-16">
      {demoBanner && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-[var(--text-secondary)]">
          <strong className="text-amber-700 dark:text-amber-400">Modo demo</strong>
          : si tenés <code className="font-mono">AUTH_DEMO_MODE=true</code> en{' '}
          <code className="font-mono">.env.local</code>, podés usar la app sin iniciar sesión (inicio, importar,
          editor). Para guardar versiones en la base, configurá{' '}
          <code className="font-mono">DEMO_USER_ID</code> tras{' '}
          <code className="font-mono">pnpm demo:create-user</code>.
        </div>
      )}

      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Iniciar sesión</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Para guardar versiones y tu historial de canciones
        </p>
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="w-full mb-6"
        onClick={handleGoogleLogin}
        loading={oauthLoading}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continuar con Google
      </Button>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative text-center">
          <span className="px-3 text-xs text-[var(--text-muted)] bg-[var(--bg-base)]">
            email y contraseña
          </span>
        </div>
      </div>

      <form onSubmit={handlePasswordLogin} className="space-y-3">
        <Input
          id="login-email"
          label="Email"
          type="email"
          placeholder="vos@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={passwordLoading}
        />
        <Input
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError ?? undefined}
          autoComplete="current-password"
          disabled={passwordLoading}
        />
        <Button type="submit" loading={passwordLoading} size="lg" className="w-full">
          Ingresar
        </Button>
      </form>

      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border)]" />
        </div>
        <div className="relative text-center">
          <span className="px-3 text-xs text-[var(--text-muted)] bg-[var(--bg-base)]">
            o sin contraseña
          </span>
        </div>
      </div>

      <form onSubmit={handleMagicLink} className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Te enviamos un enlace al email que cargaste arriba (sin usar contraseña).
        </p>
        {magicError && (
          <p className="text-xs text-[var(--danger)]">{magicError}</p>
        )}
        <Button type="submit" variant="secondary" loading={magicLoading} size="lg" className="w-full">
          Enviar link de acceso
        </Button>
      </form>

      {magicMessage && (
        <p className="mt-4 text-center text-sm text-[var(--success)]">{magicMessage}</p>
      )}

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        También podés explorar canciones sin iniciar sesión.{' '}
        <a href="/" className="text-[var(--accent)] hover:underline">
          Ir al inicio
        </a>
      </p>
    </main>
  );
}
