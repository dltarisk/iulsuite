/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Nord Polar Night - used for text/headers (replaces old "navy")
        navy: '#2e3440',
        // Nord Aurora Orange - used for secondary CTAs (replaces old "gold")
        gold: '#d08770',
        // Nord Aurora Green - override Tailwind emerald palette for primary CTAs
        emerald: {
          50: '#f3f6ee',
          100: '#e6eedd',
          200: '#cddcbb',
          300: '#b4ca99',
          400: '#a3be8c',
          500: '#a3be8c',
          600: '#8ca873',
          700: '#73905b',
          800: '#5b7447',
          900: '#445634',
        },
        // Nord Snow Storm - backgrounds/surfaces
        nord: {
          bg: '#eceff4',
          surface: '#e5e9f0',
          border: '#d8dee9',
          text: '#2e3440',
          subtext: '#4c566a',
          frost1: '#5e81ac',
          frost2: '#81a1c1',
          frost3: '#88c0d0',
          frost4: '#8fbcbb',
          orange: '#d08770',
          green: '#a3be8c',
          yellow: '#ebcb8b',
          red: '#bf616a',
          purple: '#b48ead',
        },
      },
    },
  },
  plugins: [],
};
