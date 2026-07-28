/**
 * Stud design system — Tailwind preset.
 *
 * Locked in Phase 0. Do not re-litigate tokens; extend via component
 * conventions in @stud/ui instead.
 *
 * Two surfaces share this one system:
 *   - `web`    (buyer)   — warm ground, editorial serif, generous whitespace
 *   - `studio` (breeder) — same tokens, densified; charts as primary display
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // ---- Ground -------------------------------------------------------
        // Warm off-white. The buyer surface never sits on pure white.
        bone: {
          50: '#FFFDFA',
          100: '#FAF7F2', // canonical page ground
          200: '#F3EEE5',
          300: '#E9E2D5',
          400: '#DCD2C0',
          500: '#C7B9A1',
        },

        // ---- Ink ----------------------------------------------------------
        // Cool near-black, anchored on Good Dog's #040416. A warm ground with
        // a cool ink and a saturated blue is the exact combination that makes
        // their surface read as expensive rather than folksy.
        ink: {
          50: '#F5F5F7',
          100: '#E9E9ED',
          200: '#D3D3DA',
          300: '#AEAEB8',
          400: '#85858F',
          500: '#63636D',
          600: '#4B4B4D', // Good Dog secondary body text
          700: '#35353D',
          800: '#21212B',
          900: '#0F0F1C', // body text
          950: '#040416', // Good Dog ink
        },

        // ---- Brand (primary accent) ---------------------------------------
        // Good Dog's blue, taken from their live stylesheet: #0057DE.
        // One confident accent, used sparingly.
        brand: {
          50: '#EFF5FF',
          100: '#DCE9FE',
          200: '#BCD8FD', // Good Dog light blue
          300: '#8CBAFB',
          400: '#4E93F7',
          500: '#1A6FEC',
          600: '#0057DE', // primary — Good Dog exact
          700: '#0046B4',
          800: '#06398C',
          900: '#0B3068',
          950: '#061D3F',
        },

        // ---- Clay (secondary accent) --------------------------------------
        // Breedera's terracotta red, from their live stylesheet: #D85C44.
        // Highlights, pricing emphasis, editorial pull-quotes.
        clay: {
          50: '#FDF5F3',
          100: '#FAE6E1',
          200: '#F4C9BF',
          300: '#EBA593',
          400: '#E28167',
          500: '#D85C44', // secondary — Breedera exact
          600: '#BC4830',
          700: '#9A3A27',
          800: '#7C3021',
          900: '#642A1E',
        },

        // ---- Verification semantics ---------------------------------------
        // These map 1:1 to the VerificationState machine. Never reuse them
        // for anything else — the color IS the trust signal.
        //
        // Verified is the brand blue on purpose: verification IS the brand
        // promise, so the badge and the mark should be the same colour.
        verify: {
          verified: '#0057DE',
          verifiedBg: '#DCE9FE',
          reported: '#7C6F63',
          reportedBg: '#F1EDE7',
          unverified: '#AEAEB8',
          unverifiedBg: '#EEEEF1',
          pending: '#4E93F7',
          pendingBg: '#EFF5FF',
          stale: '#B7791F',
          staleBg: '#FBF0DC',
          conflicted: '#B3261E',
          conflictedBg: '#FBE7E5',
        },

        // ---- Status -------------------------------------------------------
        success: { DEFAULT: '#0057DE', bg: '#DCE9FE', fg: '#06398C' },
        warning: { DEFAULT: '#B7791F', bg: '#FBF0DC', fg: '#6E4711' },
        danger: { DEFAULT: '#B3261E', bg: '#FBE7E5', fg: '#7A1A15' },
        info: { DEFAULT: '#283E52', bg: '#EBF2F7', fg: '#1B2C3B' },
      },

      fontFamily: {
        // Editorial serif — buyer surface display type, pedigree names.
        display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        // Clean sans — everything else, both surfaces.
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        // Tabular data — weights, dates, registration numbers, COI values.
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.9375rem', { lineHeight: '1.5rem' }],
        md: ['1rem', { lineHeight: '1.625rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.015em' }],
        '3xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
        '4xl': ['3rem', { lineHeight: '3.125rem', letterSpacing: '-0.025em' }],
        '5xl': ['4rem', { lineHeight: '4rem', letterSpacing: '-0.03em' }],
        '6xl': ['5rem', { lineHeight: '4.875rem', letterSpacing: '-0.035em' }],
      },

      spacing: {
        // Breeder surface tap target floor. One-handed logging at 3am.
        tap: '2.75rem', // 44px
        'tap-lg': '3.5rem', // 56px
        gutter: '1.25rem',
        'gutter-lg': '2rem',
      },

      borderRadius: {
        xs: '0.25rem',
        sm: '0.375rem',
        DEFAULT: '0.5rem',
        md: '0.625rem',
        lg: '0.875rem',
        xl: '1.125rem',
        '2xl': '1.5rem',
        card: '0.875rem',
        pill: '9999px',
      },

      boxShadow: {
        // Tinted with the ink, not pure black — a neutral grey shadow on a
        // warm ground reads muddy.
        xs: '0 1px 2px 0 rgb(4 4 22 / 0.05)',
        sm: '0 1px 3px 0 rgb(4 4 22 / 0.07), 0 1px 2px -1px rgb(4 4 22 / 0.05)',
        DEFAULT: '0 2px 8px -2px rgb(4 4 22 / 0.09), 0 1px 3px -1px rgb(4 4 22 / 0.06)',
        md: '0 6px 16px -4px rgb(4 4 22 / 0.11), 0 2px 6px -2px rgb(4 4 22 / 0.07)',
        lg: '0 14px 32px -8px rgb(4 4 22 / 0.15), 0 4px 10px -4px rgb(4 4 22 / 0.08)',
        xl: '0 28px 56px -16px rgb(4 4 22 / 0.22)',
        card: '0 1px 2px 0 rgb(4 4 22 / 0.06), 0 4px 14px -6px rgb(4 4 22 / 0.10)',
        focus: '0 0 0 3px rgb(0 87 222 / 0.28)',
        none: 'none',
      },

      maxWidth: {
        prose: '68ch',
        content: '75rem',
        wide: '90rem',
      },

      transitionTimingFunction: {
        // Slow, calm, expensive-feeling.
        editorial: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(0 87 222 / 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgb(0 87 222 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(0 87 222 / 0)' },
        },
      },

      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.35s ease both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.22, 1, 0.36, 1) infinite',
      },
    },
  },
  plugins: [
    /**
     * Base + component layers ship with the preset rather than as an imported
     * stylesheet, so both Next.js surfaces get identical foundations without
     * a cross-package CSS import that bundlers resolve inconsistently.
     */
    function studBase({ addBase, addComponents, theme }) {
      addBase({
        ':root': {
          '--font-display': "'Fraunces', Georgia, serif",
          '--font-sans': "'Inter', system-ui, sans-serif",
          '--font-mono': 'ui-monospace, SFMono-Regular, monospace',
        },
        '*': { borderColor: theme('colors.bone.300') },
        html: { '-webkit-text-size-adjust': '100%', scrollBehavior: 'smooth' },
        body: {
          backgroundColor: theme('colors.bone.100'),
          color: theme('colors.ink.900'),
          fontFamily: 'var(--font-sans)',
          fontFeatureSettings: "'cv02', 'cv03', 'cv04', 'cv11'",
          '-webkit-font-smoothing': 'antialiased',
          '-moz-osx-font-smoothing': 'grayscale',
        },
        'h1, h2, h3': { fontFamily: 'var(--font-display)', fontOpticalSizing: 'auto' },
        '::selection': {
          backgroundColor: theme('colors.brand.200'),
          color: theme('colors.brand.900'),
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            transitionDuration: '0.01ms !important',
            scrollBehavior: 'auto !important',
          },
        },
      });

      addComponents({
        /* Numbers in a breeding record are read in columns. Always align them. */
        '.tabular, table td.num, table th.num': { fontVariantNumeric: 'tabular-nums' },
        /* Editorial full-bleed section used across the buyer surface. */
        '.bleed': { width: '100vw', marginLeft: '50%', transform: 'translateX(-50%)' },
        /* Hairline rule that reads as paper, not as a border. */
        '.rule': {
          height: '1px',
          background: `linear-gradient(to right, transparent, ${theme('colors.bone.400')} 12%, ${theme('colors.bone.400')} 88%, transparent)`,
        },
      });
    },
  ],
};
