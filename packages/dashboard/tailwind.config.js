/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#f4efe4',
        ink: '#172126',
        tide: '#0d6d62',
        shell: '#fffaf0',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', '"Avenir Next"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 14px 32px rgba(7, 50, 53, 0.08)',
      },
    },
  },
  plugins: [],
};
