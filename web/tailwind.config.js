/** @type {import('tailwindcss').Config} */
// WFP charter palette + neutrals. Used as bg-brand, text-ok, border-line, etc.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#007DBC',
          d: '#085387',
          deep: '#03293D',
          tint: '#E2F0F9',
          50: '#EAF6FF',
          100: '#D5EDFB',
          600: '#007DBC',
          700: '#085387',
          800: '#03293D',
        },
        ok: { DEFAULT: '#5C8A13', dot: '#689E18', tint: '#EEF6E0' },
        warn: { DEFAULT: '#B07D05', dot: '#F7B825', tint: '#FCF3D9' },
        bad: { DEFAULT: '#C5192D', dot: '#C5192D', tint: '#FBE3E6' },
        ink: { DEFAULT: '#0F2231', soft: '#43596A', mute: '#6F8798' },
        line: { DEFAULT: '#D6E2EC', soft: '#E6EEF4' },
        ground: '#F4F7FA',
        surface: { DEFAULT: '#FFFFFF', 2: '#EAF1F7' },
        inset: '#F0F5F9',
      },
      fontFamily: {
        sans: ['"Open Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Open Sans"', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(3,41,61,.05)',
        pop: '0 1px 2px rgba(3,41,61,.06), 0 6px 20px -12px rgba(3,41,61,.22)',
        lift: '0 4px 12px -4px rgba(3,41,61,.18)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
}
