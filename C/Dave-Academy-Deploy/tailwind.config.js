/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B2430',
        paper: '#F5F6F8',
        // Blue brand palette (2026-08-16 rebrand, matches the new app icon
        // gradient). 50/100/400/500/600 are the five values from the brand
        // brief (background tint / border / focus / primary / hover); 700 is
        // derived by continuing the same darkening step, for the handful of
        // spots (PWA theme-color, gradient end-stops) that need a deeper
        // shade than "hover". `active` (below) is a separate, unrelated
        // semantic color (success/attendance-present) - not part of this
        // palette and deliberately untouched by the rebrand.
        brand: {
          50: '#EEF3FF',
          100: '#D6E3FF',
          400: '#7EA1FF',
          500: '#4F6EF7',
          600: '#3D5CE6',
          700: '#2948D2',
        },
        active: '#1F9D7C',
        inactive: '#E1584B',
        levelA: '#3E7CB1',
        levelA1: '#2C9E8F',
        levelB: '#F2A93B',
        levelC: '#7856A6',
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27, 36, 48, 0.06), 0 1px 3px rgba(27, 36, 48, 0.08)',
      },
    },
  },
  plugins: [],
};
