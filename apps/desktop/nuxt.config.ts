import { defineNuxtConfig } from 'nuxt/config';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-30',
  future: {
    compatibilityVersion: 4,
  },
  ssr: false, // SPA mode for Tauri desktop app
  devtools: { enabled: false },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ['node'],
      },
    },
  },
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
  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  },
  vite: {
    clearScreen: false,
    server: {
      strictPort: true,
    },
  },
} as any);
