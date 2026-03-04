/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        indigo: {
          950: '#0f1626',
          900: '#151e35',
          800: '#1a2136',
          700: '#1e2840',
          600: '#212842',
          500: '#2d3a5e',
          400: '#3d4f7c',
          300: '#4e6199',
          200: '#7b8fc4',
          100: '#a8b8d8',
          50:  '#dce4f0',
        },
        cream: {
          50:  '#fdfaf6',
          100: '#f8f2e8',
          200: '#f0e7d5',
          300: '#e6d7bc',
          400: '#d9c39e',
          500: '#c9ab80',
          600: '#b08f5e',
          700: '#8a6e44',
          800: '#65502f',
          900: '#42321c',
        },
        accent: {
          gold:  '#c9a84c',
          coral: '#d4604a',
          sage:  '#5a8a6e',
          sky:   '#4a7fb5',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23F0E7D5' fill-opacity='0.03'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'glow-cream': '0 0 30px rgba(240, 231, 213, 0.08)',
        'glow-gold':  '0 0 20px rgba(201, 168, 76, 0.15)',
        'card':       '0 4px 24px rgba(0, 0, 0, 0.25)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.35)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
