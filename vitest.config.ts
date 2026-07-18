import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // Next.js resolves `server-only` to its no-op export via the
      // "react-server" build condition; Vitest doesn't set that condition,
      // so without this alias the marker package throws in every test that
      // imports server-only modules (e.g. config/env.server.ts).
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    css: true,
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
      '.claude/worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        'theme/**/*.{ts,tsx}',
        'auth/**/*.ts',
        'config/**/*.ts',
        'modules/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        // Route-level composition is covered end-to-end by Playwright, not unit tests.
        'app/**/layout.tsx',
        'app/**/loading.tsx',
        'app/**/not-found.tsx',
        'app/icon.tsx',
        'app/**/page.tsx',
        // Trivial re-exports with no branching logic of their own.
        'theme/index.ts',
        'theme/theme.types.ts',
        'components/navigation/next-link.tsx',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
