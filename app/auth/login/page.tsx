import { Suspense } from 'react';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-sm mx-auto px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          Cargando…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
