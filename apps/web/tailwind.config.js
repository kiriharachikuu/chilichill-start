/** @type {import('tailwindcss/tailwind-config').TailwindConfig} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'Arial', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"SFMono-Regular"', 'Consolas', 'monospace'],
      },
      colors: {
        space: {
          50: '#f4f4f1',
          100: '#e9e9e5',
          200: '#d8d8d3',
          300: '#b8b8b3',
          400: '#8f8f8d',
          500: '#6f6f6f',
          600: '#555555',
          700: '#3f3f3f',
          800: '#262626',
          900: '#181818',
          950: '#111111',
        },
        ink: '#111111',
        muted: '#666666',
        amber: {
          DEFAULT: '#609ee9',
          50: '#edf5ff',
          100: '#dceaff',
          200: '#b7d2f6',
          300: '#8dbaf1',
          400: '#609ee9',
          500: '#3f83d4',
          600: '#2f6db3',
          700: '#275991',
          800: '#244b75',
          900: '#224061',
        },
        coral: '#111111',
        aurora: '#609ee9',
        mint: '#2f6db3',
        violet: '#609ee9',
      },
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px',
      },
      boxShadow: {
        card: 'none',
        glow: 'none',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.36s ease-out both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
