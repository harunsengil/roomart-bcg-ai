/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      xs:  '480px',   // küçük telefon (varsayılan <640px için ekstra kırılma noktası)
      sm:  '640px',
      md:  '768px',
      lg:  '1024px',
      xl:  '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        navy: {
          950: '#060a16',
          900: '#080c1a',
          800: '#0d1528',
          700: '#111d35',
          600: '#162244',
        },
        gold: {
          300: '#f5d060',
          400: '#f0c040',
          500: '#d4a017',
          600: '#b8860b',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        sans:    ['"DM Sans"', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
      },
    },
  },
  plugins: [],
}
