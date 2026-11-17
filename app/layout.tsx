import type { Metadata } from 'next';
import './globals.css';
import { LayoutChrome } from '@/components/layout/LayoutChrome';

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
        <LayoutChrome>{children}</LayoutChrome>
      </body>
    </html>
  );
}
