import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['release/app/dist', 'out'],
    // The full suite renders real antd/React trees, parses real chart
    // fixtures, and spins up per-file jsdom environments across many
    // parallel workers — under real (especially CI or a loaded dev
    // machine) contention, individual tests legitimately take well past
    // Vitest's 5s default before completing, not because anything hangs
    // (every one of these files passes quickly run alone) but because
    // they're waiting on their share of CPU. 20s matches what a busy full
    // run actually needs to finish rather than being aborted mid-flight.
    testTimeout: 20000,
    hookTimeout: 20000,
    moduleNameMapper: {
      '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
        '<rootDir>/src/__mocks__/fileMock.js',
      '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/**/*.stories.tsx',
        'src/**/*.d.ts',
        'src/__tests__/**',
        'src/__mocks__/**',
        'src/**/test-support.{ts,tsx}',
        'src/**/drumMidiFixture.ts',
        'src/main/index.ts',
        'src/main/AppUpdater.ts',
        'src/main/menu.ts',
        'src/main/ipc/midi.ts',
        'src/preload/**',
        'src/renderer/index.tsx',
      ],
    },
  },
  resolve: {
    alias: {
      src: path.resolve(__dirname, 'src'),
    },
  },
});
