import type { Config } from 'tailwindcss';

// Token source of truth: docs/design/03-design-system.md
// Every value here must trace back to that document — no ad hoc colors/fonts.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#0B3B2E',
          'primary-hover': '#0F4C3A',
          'primary-active': '#082E24',
          accent: '#B8763E',
          'accent-hover': '#A5672F',
          'accent-active': '#8F5726',
          'accent-subtle': '#F3E4D3',
        },
        neutral: {
          0: '#FFFFFF',
          50: '#F7F6F3',
          100: '#EFEDE7',
          200: '#E0DDD3',
          300: '#C7C2B3',
          400: '#A29C89',
          500: '#7C7666',
          600: '#5C5749',
          700: '#413D33',
          800: '#2B2822',
          900: '#181613',
        },
        status: {
          'neutral-fg': '#5C5749',
          'neutral-bg': '#EFEDE7',
          'pending-fg': '#8A5A12',
          'pending-bg': '#FBEED8',
          'success-fg': '#1E5B3A',
          'success-bg': '#DFF0E6',
          'danger-fg': '#8C2F23',
          'danger-bg': '#F8E1DD',
          'warning-fg': '#8A5A12',
          'warning-bg': '#FCEFD9',
          'inactive-fg': '#5C5749',
          'inactive-bg': '#E0DDD3',
        },
        surface: {
          page: '#F7F6F3',
          card: '#FFFFFF',
          sunken: '#EFEDE7',
          overlay: 'rgba(24,22,19,0.55)',
        },
        border: {
          DEFAULT: '#E0DDD3',
          strong: '#C7C2B3',
        },
        focus: {
          ring: '#B8763E',
        },
        info: {
          fg: '#2A5A73',
          bg: '#E1EEF3',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        body: ['Public Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['3.815rem', { lineHeight: '1.05' }],
        'display-lg': ['3.052rem', { lineHeight: '1.1' }],
        'display-md': ['2.441rem', { lineHeight: '1.15' }],
        'heading-lg': ['1.953rem', { lineHeight: '1.2' }],
        'heading-md': ['1.563rem', { lineHeight: '1.25' }],
        'heading-sm': ['1.25rem', { lineHeight: '1.3' }],
        'body-lg': ['1.125rem', { lineHeight: '1.5' }],
        'body-md': ['1rem', { lineHeight: '1.5' }],
        'body-sm': ['0.875rem', { lineHeight: '1.45' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
        'mono-sm': ['0.8125rem', { lineHeight: '1.4' }],
      },
      spacing: {
        0.5: '2px',
      },
      borderRadius: {
        none: '0px',
        sm: '4px',
        md: '6px',
        lg: '10px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgba(24,22,19,0.06)',
        sm: '0 2px 6px -1px rgba(24,22,19,0.08), 0 1px 2px -1px rgba(24,22,19,0.06)',
        md: '0 8px 16px -4px rgba(24,22,19,0.12), 0 2px 4px -2px rgba(24,22,19,0.08)',
        lg: '0 20px 32px -8px rgba(24,22,19,0.18), 0 4px 8px -4px rgba(24,22,19,0.10)',
      },
      screens: {
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [],
} satisfies Config;
