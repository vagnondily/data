/** @type {import('tailwindcss').Config} */
// Charte WFP. Les tokens neutres + teintes sont pilotés par variables CSS
// (voir src/index.css) pour permettre le thème clair / sombre.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: v('--brand'),
          d: v('--brand-d'),
          deep: '#03293D',
          tint: v('--brand-tint'),
          50: '#EAF6FF', 100: '#D5EDFB', 600: '#007DBC', 700: '#085387', 800: '#03293D',
        },
        ok: { DEFAULT: v('--ok'), dot: '#689E18', tint: v('--ok-tint') },
        warn: { DEFAULT: v('--warn'), dot: '#F7B825', tint: v('--warn-tint') },
        bad: { DEFAULT: v('--bad'), dot: '#C5192D', tint: v('--bad-tint') },
        ink: { DEFAULT: v('--ink'), soft: v('--ink-soft'), mute: v('--ink-mute') },
        line: { DEFAULT: v('--line'), soft: v('--line-soft') },
        ground: v('--ground'),
        surface: { DEFAULT: v('--surface'), 2: v('--surface-2') },
        inset: v('--inset'),
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
