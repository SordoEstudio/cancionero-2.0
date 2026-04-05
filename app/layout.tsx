import type { Metadata } from 'next';
import './globals.css';
import { UserMenu } from '@/components/auth/UserMenu';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const metadata: Metadata = {
  title: 'Cancionero Pro',
  description: 'Importá, transponé y tocá tus canciones favoritas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Evitar flash de tema incorrecto al cargar */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const stored = localStorage.getItem('theme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (stored === 'dark' || (!stored && prefersDark)) {
                  document.documentElement.classList.add('dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body className="bg-[var(--bg-base)] text-[var(--text-primary)] antialiased">
        {/* Barra de navegación global */}
        <nav className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 py-2 bg-[var(--bg-base)] border-b border-[var(--border)]">
          <a href="/" className="font-bold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate min-w-0">
            🎸 Cancionero Pro
          </a>
          <div className="flex shrink-0 items-center gap-1">
            <UserMenu />
            <ThemeToggle />
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
