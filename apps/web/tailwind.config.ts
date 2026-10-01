import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { navy:'#10243E', gold:'#E39B2D', teal:'#1E7F86' }, fontFamily: { sans:['Inter','system-ui','sans-serif'], serif:['"Source Serif 4"','Georgia','serif'] } } },
  plugins: [],
} satisfies Config;
