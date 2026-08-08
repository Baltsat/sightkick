import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webRoot,
  publicDir: path.join(webRoot, 'public'),
  plugins: [tailwindcss(), react()],
  build: {
    outDir: path.join(webRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [path.resolve(webRoot, '..')],
    },
  },
});
