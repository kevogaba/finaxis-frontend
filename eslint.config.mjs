import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettierConfig from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Stricter, type-aware rule sets on top of eslint-config-next's non-type-aware
  // `typescript-eslint` recommended config — official presets, not hand-rolled rules.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // eslint-config-next already registers the jsx-a11y plugin — layer only the
  // stricter rule set on top rather than re-declaring the plugin.
  //
  // eslint-plugin-jsx-a11y ships no TypeScript declarations, so its export is
  // untyped (`any`) under strict type-checking — that's an upstream gap in the
  // plugin, not a real unsafe-access in this file.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  { rules: jsxA11y.flatConfigs.strict.rules },
  prettierConfig,
  {
    rules: {
      // Numbers in template literals (`${count} items`) are safe and idiomatic;
      // keep the rule for objects/booleans/etc. rather than disabling it outright.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Test files commonly assert against loosely typed mock/DOM values; the
    // type-aware strictness earns its keep in application code, not assertions.
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts', 'test/**/*.ts', 'test/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated / tooling output:
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'node_modules/**',
    // Git worktrees (local development only):
    '.claude/worktrees/**',
  ]),
]);

export default eslintConfig;
