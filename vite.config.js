import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900, rollupOptions: { input: { main: resolve(__dirname, 'index.html'), body: resolve(__dirname, 'body.html'), hand: resolve(__dirname, 'hand.html'), shoulder: resolve(__dirname, 'shoulder.html'), spine: resolve(__dirname, 'spine.html'), head: resolve(__dirname, 'head.html'), pain: resolve(__dirname, 'pain.html') } } },
});
