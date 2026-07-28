/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('@stud/config/tailwind')],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};
