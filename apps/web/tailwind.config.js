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
        // 核心中性色引用 CSS 变量（rgb 三元组），夜间模式通过 html.theme-dark 覆盖变量整体换肤
        space: {
          50: 'rgb(var(--c-page) / <alpha-value>)',
          100: 'rgb(var(--c-surface-alt) / <alpha-value>)',
          200: 'rgb(var(--c-border) / <alpha-value>)',
          300: 'rgb(var(--c-faint) / <alpha-value>)',
          400: '#8f8f8d',
          500: '#6f6f6f',
          600: 'rgb(var(--c-text-soft) / <alpha-value>)',
          700: 'rgb(var(--c-text-soft-2) / <alpha-value>)',
          800: '#262626',
          900: '#181818',
          950: '#111111',
        },
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        // 白色即表面色：夜间模式下翻转为深色面板
        white: 'rgb(var(--c-surface) / <alpha-value>)',
        amber: {
          DEFAULT: '#609ee9',
          50: 'rgb(var(--c-tint) / <alpha-value>)',
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
          // 结束帧必须是 none 而不是 translateY(0)：fill-mode both 会保留结束帧的 transform，
          // 非 none 的 transform 会让 <main> 成为 fixed 后代的定位基准，破坏弹层/悬浮按钮的视口定位
          '100%': { opacity: '1', transform: 'none' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        // 不能用 fill-mode both/forwards：Chrome 对填充中的结束帧 transform: none
        // 仍按恒等矩阵处理，<main> 会持续成为 fixed 后代的定位基准。
        // 动画结束后让属性回归无动画状态（transform 为 none），弹层/悬浮按钮定位才正确
        'fade-up': 'fade-up 0.36s ease-out',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
