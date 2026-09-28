/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Warm neutral surfaces (replaces Tailwind's cool default gray)
        gray: {
          50: '#F8F6F0',
          100: '#F1EEE5',
          200: '#E6E1D3',
          300: '#D3CDBC',
          400: '#A9A290',
          500: '#84806F',
          600: '#655F52',
          700: '#4A4638',
          800: '#332F26',
          900: '#211E18',
          950: '#16140F',
        },
        // Brand/accent scale — sage green, doubling as dark-mode chrome
        sage: {
          50: '#F3F5EC',
          100: '#E6EBD9',
          200: '#CBDAB6',
          300: '#A8C3A0',
          400: '#8BAE81',
          500: '#729965',
          600: '#5C8250',
          700: '#496640',
          800: '#33422C',
          900: '#232D1F',
          950: '#171D14',
        },
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
