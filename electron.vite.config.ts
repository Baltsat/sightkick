import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import packageJson from './package.json';

export default defineConfig({
  main: {
    build: { externalizeDeps: true, watch: {} },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    plugins: [tailwindcss(), react()],
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    server: {
      watch: {
        ignored: ['**/*.test.*', '**/*.stories.*'],
      },
    },
  },
});
