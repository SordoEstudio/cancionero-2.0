import type { Config } from 'tailwindcss';

const config: Config = {
  // Activar dark mode con clase .dark en <html>
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Courier New', 'Courier', 'monospace'],
      },
      colors: {
        // Colores que referencian los tokens CSS — se adaptan automáticamente al dark mode
        'app-bg':      'var(--bg-base)',
        'app-surface': 'var(--bg-surface)',
        'app-elevated':'var(--bg-elevated)',
        'app-border':  'var(--border)',
        'app-text':    'var(--text-primary)',
        'app-muted':   'var(--text-muted)',
        'app-accent':  'var(--accent)',
        'app-chord':   'var(--chord-color)',
      },
    },
  },
  plugins: [],
};

export default config;
