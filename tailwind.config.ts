import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F8FC',
        ink: '#17233B',
        muted: '#526078',
        line: '#DEE3ED',
        control: '#8490A5',
        indigo: {
          50: '#F2EFFF', 100: '#E7E0FF', 200: '#D0C4FF', 300: '#B4A0FA',
          400: '#8B6CEB', 500: '#704DDE', 600: '#5B3AC9', 700: '#4B2FA9',
          800: '#3F2989', 900: '#34256C', 950: '#21163F',
        },
        slate: { 400: '#66758B' },
      },
      boxShadow: {
        panel: '0 4px 24px -12px rgb(23 35 59 / 0.12)',
        float: '0 24px 64px -28px rgb(23 35 59 / 0.22)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
