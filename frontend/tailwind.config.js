/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Flash CRM — Jet Black / Pure White / Flash Orange
        obsidian: '#0A0A0A',
        'obsidian-surface': '#111111',
        'obsidian-elevated': '#141414',
        'obsidian-border': '#222222',
        'flash-primary': '#F25E26',
        'flash-secondary': '#F25E26',
        'flash-tertiary': '#F25E26',
        ink: '#FFFFFF',
        'ink-muted': '#A3A3A3',
        'ink-soft': '#A3A3A3',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',
      },
    },
  },
  plugins: [],
};
