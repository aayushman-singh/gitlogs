import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHtmlPlugin } from 'vite-plugin-html';

export default defineConfig({
  plugins: [
    react(),
    createHtmlPlugin({
      minify: false // Don't minify to preserve meta tags
    })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Copy _redirects from public folder for SPA routing on static hosts
    copyPublicDir: true
  }
});
