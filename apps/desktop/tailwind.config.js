/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        boba: {
          950: '#0b0d13',
          900: '#11151f',
          850: '#161b27',
          800: '#1c2232',
          700: '#283147',
          600: '#394663',
          accent: '#3b82f6',
          'accent-hover': '#2563eb',
        }
      }
    },
  },
  plugins: [],
}
