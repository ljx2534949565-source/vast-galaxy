import { defineConfig } from 'vite';
import uniImport from '@dcloudio/vite-plugin-uni';
import { fileURLToPath, URL } from 'node:url';

const uni = (typeof uniImport === 'function' ? uniImport : (uniImport as any).default) as typeof uniImport;

export default defineConfig({
  plugins: [uni()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    target: 'es2018',
    cssTarget: 'chrome61'
  }
});
