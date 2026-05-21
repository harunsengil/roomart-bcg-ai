/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#080c1a', 800: '#0d1528', 700: '#111d35', 600: '#162244' },
        gold: { 400: '#f0c040', 500: '#d4a017', 300: '#f5d060' },
        accent: { cyan: '#00d4ff', green: '#00ff88', red: '#ff4444', orange: '#ff8800' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
