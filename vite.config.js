import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

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

// Admin sign-in without a server: the GitHub token is encrypted at build time with a key
// derived from ADMIN_USERNAME + ADMIN_PASSWORD (PBKDF2 → AES-GCM). Only the encrypted
// blob is published; the right username and password are needed to unlock it.
export const PBKDF2_ITERATIONS = 600000;
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function adminVault(env) {
  const { ADMIN_USERNAME: user, ADMIN_PASSWORD: pass, ADMIN_GITHUB_TOKEN: token } = env;
  // GitHub Actions sets GITHUB_REPOSITORY; Vercel sets VERCEL_GIT_REPO_OWNER / _SLUG
  const repo = env.GITHUB_REPOSITORY || (env.VERCEL_GIT_REPO_OWNER && `${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`) || env.ADMIN_REPO;
  if (!user || !pass || !token) return null;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${user.trim().toLowerCase()}\n${pass}`), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const payload = new TextEncoder().encode(JSON.stringify({ token, repo: repo || '' }));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
  return { v: 1, iterations: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export default defineConfig(async () => {
  const vault = await adminVault(process.env);
  if (process.env.ADMIN_USERNAME && !vault) console.warn('Admin sign-in: ADMIN_PASSWORD or ADMIN_GITHUB_TOKEN missing, using token sign-in.');
  return {
    // Relative paths so the site works from any URL (GitHub Pages subfolder, custom domain, local preview)
    base: './',
    plugins: [inlineCss()],
    define: { __ADMIN_VAULT__: JSON.stringify(vault) },
    build: {
      rollupOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          admin: resolve(import.meta.dirname, 'admin/index.html'),
        },
      },
    },
  };
});
