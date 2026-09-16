/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0D0D12',
        'obsidian-surface': '#16161D',
        'obsidian-elevated': '#1C1C26',
        'obsidian-border': '#2A2A36',
        'flash-primary': '#FF5B4B',
        'flash-secondary': '#FF8D7F',
        'flash-tertiary': '#00C592',
        ink: '#F4EDE8',
        'ink-muted': '#B8AFA8',
        'ink-soft': '#8A837C',
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
