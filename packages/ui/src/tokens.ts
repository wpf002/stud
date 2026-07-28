/**
 * Design tokens as plain values, for consumers that can't read Tailwind
 * (charts, canvas renderers, Expo, OG image generation, PDF export).
 *
 * These MUST stay in sync with packages/config/tailwind/preset.js.
 */

export const color = {
  bone: {
    50: '#FFFDFA',
    100: '#FAF7F2',
    200: '#F3EEE5',
    300: '#E9E2D5',
    400: '#DCD2C0',
    500: '#C7B9A1',
  },
  ink: {
    50: '#F5F5F7',
    100: '#E9E9ED',
    200: '#D3D3DA',
    300: '#AEAEB8',
    400: '#85858F',
    500: '#63636D',
    600: '#4B4B4D',
    700: '#35353D',
    800: '#21212B',
    900: '#0F0F1C',
    950: '#040416',
  },
  brand: {
    50: '#EFF5FF',
    100: '#DCE9FE',
    200: '#BCD8FD',
    300: '#8CBAFB',
    400: '#4E93F7',
    500: '#1A6FEC',
    600: '#0057DE',
    700: '#0046B4',
    800: '#06398C',
    900: '#0B3068',
    950: '#061D3F',
  },
  clay: {
    50: '#FDF5F3',
    100: '#FAE6E1',
    200: '#F4C9BF',
    300: '#EBA593',
    400: '#E28167',
    500: '#D85C44',
    600: '#BC4830',
    700: '#9A3A27',
    800: '#7C3021',
    900: '#642A1E',
  },
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
} as const;

/**
 * Categorical series palette for charts (growth curves, litter comparisons).
 * Ordered for maximum adjacent contrast; safe on the bone ground.
 */
export const seriesPalette = [
  '#0057DE', // brand blue
  '#D85C44', // clay red
  '#283E52', // slate
  '#B7791F', // amber
  '#8CBAFB', // light blue
  '#7C3021', // deep clay
  '#63636D', // ink
  '#4E93F7', // mid blue
  '#E28167', // light clay
  '#0B3068', // navy
] as const;

/** Sequential ramp for heat/density (verification coverage maps). */
export const sequentialRamp = [
  '#EFF5FF',
  '#DCE9FE',
  '#BCD8FD',
  '#8CBAFB',
  '#4E93F7',
  '#1A6FEC',
  '#0057DE',
  '#0046B4',
] as const;

export const radius = {
  xs: 4,
  sm: 6,
  base: 8,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
  pill: 9999,
} as const;

export const space = {
  tap: 44,
  tapLg: 56,
} as const;

export const font = {
  display: 'Fraunces, Georgia, serif',
  sans: 'Inter, system-ui, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, monospace',
} as const;
