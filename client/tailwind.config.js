export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Cormorant Garamond"', '"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        oasis: {
          bg: {
            950: '#0a0a0a',
            900: '#111111',
            850: '#1a1a1a',
          },
          gold: '#C9A96E',
          cream: '#F5F0E8',
          muted: '#A89880',
        },
      },
    },
  },
};
