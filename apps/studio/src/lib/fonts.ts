import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';

/** Editorial serif. Optical sizing on — this is display type, it needs it. */
export const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

export const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const fontVars = `${display.variable} ${sans.variable} ${mono.variable}`;
