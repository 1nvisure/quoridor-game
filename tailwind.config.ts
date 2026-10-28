import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Chess.com-inspired dark palette
        app: {
          950: '#0e0e0e',
          900: '#121212',
          850: '#1a1a19',
          800: '#1e1e1c',
          750: '#262522',
          700: '#2b2a27',
          600: '#3a3936',
          500: '#4b4a46',
        },
        brand: {
          DEFAULT: '#81b64c',
          light: '#9bd15f',
          dark: '#6a9a3b',
          deep: '#4f7a2a',
        },
        danger: {
          DEFAULT: '#fa412d',
          light: '#ff6a58',
          dark: '#c93222',
        },
        warn: '#f7c631',
        info: '#4a9bea',
        pawn: {
          green: '#81b64c',
          red: '#fa412d',
        },
        board: {
          light: '#e9e2d0',
          dark: '#b3a58c',
          wall: '#b98a4e',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,.45)',
        glow: '0 0 0 3px rgba(129,182,76,.35)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(.85)', opacity: '.8' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.4s cubic-bezier(.2,.6,.4,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
