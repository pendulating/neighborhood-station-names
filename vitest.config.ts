import { defineConfig } from 'vitest/config';
import { readFileSync } from 'fs';
import path from 'path';

// Mirror vite.config.ts: inject the manifest version so main.ts resolves it in tests.
const manifest = JSON.parse(readFileSync(path.resolve(__dirname, 'manifest.json'), 'utf-8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __MOD_VERSION__: JSON.stringify(manifest.version),
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/types/**',
        'src/**/*.test.ts',
        'vitest.setup.ts',
        'vite.config.ts',
        'vitest.config.ts',
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 95,
      },
    },
  },
});
