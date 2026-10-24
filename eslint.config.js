import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/ml/**', 'ml/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // packages/guard must stay pure: no network, DB, PayPal, or LLM imports.
  {
    files: ['packages/guard/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'node:http*', 'node:net', 'node:dns', 'undici', 'axios', 'pg', 'drizzle-orm*',
            '@rm/paypal*', '@rm/agent*', '@rm/channel3*', '@rm/ledger*', 'ai', '@paypal/*',
          ],
        },
      ],
    },
  },
  // Spend-capable PayPal code is vendor-side only.
  {
    files: [
      'packages/agent/**/*.ts', 'apps/api/**/*.ts',
      'apps/workflows/**/*.ts', 'apps/web/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@rm/paypal/vendor'] },
      ],
    },
  },
);
