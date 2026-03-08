/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#1e1e2e',
          secondary: '#313244',
          tertiary: '#45475a',
        },
        accent: {
          DEFAULT: '#89b4fa',
          hover: '#74c7ec',
          muted: '#585b70',
        },
        status: {
          connected: '#a6e3a1',
          connecting: '#f9e2af',
          disconnected: '#f38ba8',
          error: '#f38ba8',
        },
      },
    },
  },
  plugins: [],
};
