import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Keeps root index.html untouched while serving kongoru-v2.html at / in dev
 * and emitting both dist/kongoru-v2.html and dist/index.html on build.
 */
function kongoruV2EntryPlugin() {
  return {
    name: 'kongoru-v2-entry',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          req.url = '/kongoru-v2.html';
        }
        next();
      });
    },
    closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      const v2Html = resolve(distDir, 'kongoru-v2.html');
      const distIndexHtml = resolve(distDir, 'index.html');
      if (existsSync(v2Html)) {
        copyFileSync(v2Html, distIndexHtml);
      }
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [kongoruV2EntryPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        kongoruV2: resolve(__dirname, 'kongoru-v2.html')
      }
    }
  }
});
