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
      // A leading underscore is an explicit, opt-in marker for "intentionally
      // unused" (e.g. a mock parameter kept only to match a real function's
      // signature, or a value read purely to force a lazy getter's side
      // effect) — narrower than disabling the rule, and avoids fighting
      // @typescript-eslint/no-meaningless-void-operator and
      // no-unused-expressions over how to discard a non-call value.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // MUI v9 silently drops a dotted palette path in the `color` prop of Typography, Box, Stack,
    // Grid and DialogContentText (no colour rule is emitted, so the text inherits its parent's;
    // Box, Stack and Grid also leak it onto the DOM as a `color` attribute), while
    // `sx={{ color: 'text.secondary' }}` works everywhere. TruncatedText forwards `color` to a
    // Typography, so it is covered too (it takes `textSecondary`/`textPrimary`). MuiLink still
    // honours a dotted `color`, so it is deliberately not listed, and a literal palette path
    // anywhere else (an `sx` colour, a theme slot) is the supported spelling.
    files: ['**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name=/^(Typography|TruncatedText|Box|Stack|Grid|DialogContentText)$/] > JSXAttribute[name.name='color'] Literal[value=/^[a-z]+\\./]",
          message:
            'MUI v9 drops a dotted palette path in the color prop of Typography, Box, Stack, Grid and DialogContentText: use sx={{ color: ... }} (TruncatedText: color="textSecondary" or "textPrimary").',
        },
      ],
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
    '.remember/**',
    '.agents/**',
  ]),
]);

export default eslintConfig;
