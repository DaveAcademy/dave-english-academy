/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B2430',
        paper: '#F5F6F8',
        brand: {
          50: '#EAF3F3',
          100: '#CFE4E3',
          400: '#3E8E8C',
          500: '#1F5E6B',
          600: '#164A54',
          700: '#0F373F',
        },
        active: '#1F9D7C',
        inactive: '#E1584B',
        levelA: '#3E7CB1',
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
