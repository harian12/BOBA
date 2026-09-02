// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-30',
  future: {
    compatibilityVersion: 4,
  },
  ssr: false, // SPA mode for Tauri desktop app
  devtools: { enabled: false },
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
  ],
  css: ['@/assets/main.css'],
  devServer: {
    port: 1420,
    host: '127.0.0.1',
  },
  nitro: {
    prerender: {
      routes: ['/'],
    },
  },
  vite: {
    clearScreen: false,
    server: {
      strictPort: true,
    },
  },
});
