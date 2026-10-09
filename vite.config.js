import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/taste-and-tales-by-munni/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
