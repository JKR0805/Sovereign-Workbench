import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './styles/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          panel: 'var(--bg-panel)',
          elevated: 'var(--bg-elevated)',
        },
        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: '#66B2FF',
          muted: 'rgba(77, 163, 255, 0.15)',
        },
        ok: {
          DEFAULT: 'var(--ok)',
          muted: 'rgba(53, 192, 138, 0.15)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          muted: 'rgba(224, 163, 46, 0.15)',
        },
        error: {
          DEFAULT: 'var(--error)',
          muted: 'rgba(229, 72, 77, 0.15)',
        },
        modality: {
          vision: 'var(--vision)',
          coding: 'var(--coding)',
          reasoning: 'var(--reasoning)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'SFMono-Regular',
          'Consolas',
          'Liberation Mono',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      boxShadow: {
        highlight: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        'glow-accent': '0 0 20px -3px rgba(77, 163, 255, 0.25)',
        'glow-red': '0 0 20px -3px rgba(229, 72, 77, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
