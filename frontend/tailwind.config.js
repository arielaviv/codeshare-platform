/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#171717',
          hover: '#333333',
          light: '#F5F5F5',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#FAFAFA',
          tertiary: '#F5F5F5',
        },
        edge: {
          DEFAULT: '#E5E5E5',
          light: '#F0F0F0',
        },
        ink: {
          DEFAULT: '#171717',
          secondary: '#525252',
          tertiary: '#A3A3A3',
          muted: '#D4D4D4',
        },
        status: {
          live: '#22C55E',
          error: '#EF4444',
        },
        dark: {
          bg: '#0A0A0A',
          surface: '#141414',
          border: '#222222',
          text: '#E5E5E5',
          'text-secondary': '#999999',
          'text-tertiary': '#666666',
        },
      },
    },
  },
  plugins: [],
};
