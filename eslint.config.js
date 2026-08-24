import nextPlugin from '@next/eslint-plugin-next';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One flat config for the whole workspace.
 *
 * Per-package eslintrc files do not survive pnpm's isolated node_modules —
 * plugin resolution breaks the moment a consumer package doesn't hold the
 * plugin itself. A single root config sidesteps that entirely.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-dev/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/next-env.d.ts',
      'packages/db/prisma/**',
      'packages/config/tailwind/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // ── Node scripts (.mjs) ──────────────────────────────────────────────────
  // Plain ESM run directly by node, so they need Node globals; the block below
  // only covers .ts/.tsx.
  {
    files: ['scripts/**/*.mjs', '**/*.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
  },

  // ── Everything TypeScript ────────────────────────────────────────────────
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
    },
  },

  // ── React surfaces ───────────────────────────────────────────────────────
  {
    files: ['apps/web/**/*.{ts,tsx}', 'apps/studio/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // The new JSX transform makes both of these obsolete.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Curly quotes in editorial copy are deliberate; we escape them by hand
      // where it matters and don't want the rule fighting every apostrophe.
      'react/no-unescaped-entities': 'off',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },

  // Seeds and scripts legitimately log.
  {
    files: ['packages/db/src/seed.ts', 'scripts/**/*.{ts,js}', 'services/**/*.ts'],
    rules: { 'no-console': 'off' },
  },

  prettier,
);
