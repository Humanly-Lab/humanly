import type { Config } from 'tailwindcss';

const config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    fontFamily: {
      sans: [
        'var(--font-humanly-sans)',
        'ui-sans-serif',
        'system-ui',
        'sans-serif',
      ],
      serif: [
        'var(--font-humanly-sans)',
        'ui-sans-serif',
        'system-ui',
        'sans-serif',
      ],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Humanly semantic palette (#900/#901); values live in globals.css :root/.dark.
        hly: {
          brand: 'var(--hly-brand)',
          'brand-hover': 'var(--hly-brand-hover)',
          'green-text': 'var(--hly-green-text)',
          'green-strong': 'var(--hly-green-strong)',
          'green-bg': 'var(--hly-green-bg)',
          'green-bg-soft': 'var(--hly-green-bg-soft)',
          'green-tint': 'var(--hly-green-tint)',
          'green-icon': 'var(--hly-green-icon)',
          'green-border': 'var(--hly-green-border)',
          'amber-text': 'var(--hly-amber-text)',
          'amber-bg': 'var(--hly-amber-bg)',
          'amber-badge': 'var(--hly-amber-badge)',
          'amber-icon': 'var(--hly-amber-icon)',
          'amber-border': 'var(--hly-amber-border)',
          'paste-text': 'var(--hly-paste-text)',
          'paste-bg': 'var(--hly-paste-bg)',
          'red-text': 'var(--hly-red-text)',
          'red-bg': 'var(--hly-red-bg)',
          'red-border': 'var(--hly-red-border)',
          'blue-text': 'var(--hly-blue-text)',
          'blue-bg': 'var(--hly-blue-bg)',
          'blue-border': 'var(--hly-blue-border)',
          'ai-text': 'var(--hly-ai-text)',
          'ai-bg': 'var(--hly-ai-bg)',
          info: 'var(--hly-info)',
          'purple-text': 'var(--hly-purple-text)',
          'purple-bg': 'var(--hly-purple-bg)',
          'purple-border': 'var(--hly-purple-border)',
          'stat-typed': 'var(--hly-stat-typed)',
          'stat-pasted': 'var(--hly-stat-pasted)',
          'stat-ai': 'var(--hly-stat-ai)',
          'neutral-text': 'var(--hly-neutral-text)',
          neutral: 'var(--hly-neutral)',
          surface: 'var(--hly-surface)',
          'surface-2': 'var(--hly-surface-2)',
          ink: 'var(--hly-ink)',
          'ink-muted': 'var(--hly-ink-muted)',
          hairline: 'var(--hly-hairline)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;

export default config;
