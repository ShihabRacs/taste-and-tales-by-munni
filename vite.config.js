import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Inline each page's CSS into its HTML: one less request, and styles can never fail to load
const inlineCss = () => ({
  name: 'inline-css',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler(html, { bundle }) {
      for (const file of Object.values(bundle || {})) {
        if (!file.fileName.endsWith('.css')) continue;
        const tag = new RegExp(`<link[^>]*href="[^"]*${file.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
        html = html.replace(tag, () => `<style>${file.source}</style>`);
      }
      return html;
    },
  },
});

export default defineConfig({
  // Relative paths so the site works from any URL (GitHub Pages subfolder, custom domain, local preview)
  base: './',
  plugins: [inlineCss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
