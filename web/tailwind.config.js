/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Semantic aliases (mirror colors_and_type.css) ──────────────
        brand: 'var(--color-primary)',
        'brand-hover': 'var(--color-primary-hover)',
        'brand-pressed': 'var(--color-primary-pressed)',
        accent: 'var(--color-accent)',
        surface: 'var(--color-surface)',
        'surface-sunken': 'var(--color-surface-sunken)',
        'surface-muted': 'var(--color-surface-muted)',
        'page-bg': 'var(--color-bg)',
        ink: 'var(--color-text)',
        'ink-strong': 'var(--color-text-strong)',
        'ink-muted': 'var(--color-text-muted)',
        'ink-subtle': 'var(--color-text-subtle)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        divider: 'var(--color-divider)',
        success: 'var(--color-success)',
        'success-bg': 'var(--success-bg)',
        'success-strong': 'var(--success-dark)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--warning-bg)',
        'warning-strong': 'var(--warning-dark)',
        danger: 'var(--color-error)',
        'danger-bg': 'var(--error-bg)',
        'danger-strong': 'var(--error-dark)',
        // ─── Medical primary ramp (matches design tokens) ───────────────
        // We override `cyan` so historical class names continue to resolve
        // to the medical-blue ramp without a global rewrite.
        cyan: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
          700: '#1E3A8A',
          accent: '#2563EB',
        },
        // Slate-based "navy" alias (cool ink, not the legacy navy).
        navy: {
          950: '#020617',
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
          600: '#475569',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        ui: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Montserrat Alternates', 'Montserrat', 'sans-serif'],
        data: ['Inter', 'sans-serif'],
      },
      fontSize: {
        micro: ['10px', { lineHeight: '1.4' }],
        caption: ['12px', { lineHeight: '1.4' }],
        body: ['14px', { lineHeight: '1.43' }],
        'body-lg': ['16px', { lineHeight: '1.4' }],
        'h3-ui': ['18px', { lineHeight: '1' }],
        'h2-ui': ['20px', { lineHeight: '1.2' }],
        'h1-ui': ['24px', { lineHeight: '1.2' }],
      },
      borderRadius: {
        md: '12px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--shadow-focus)',
      },
      letterSpacing: {
        ui: 'var(--tracking-ui)',
        caps: 'var(--tracking-caps)',
        tight: 'var(--tracking-tight)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        standard: 'var(--ease-standard)',
      },
    },
  },
  plugins: [],
}
