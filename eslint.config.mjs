import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'demo-site/**', 'mockups/**', '.worktrees/**'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // consistent-type-imports is unsafe for NestJS DI: converting a class
      // used only as a constructor param type to `import type` strips the
      // runtime symbol and breaks reflection metadata. Disabled entirely.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      // '@typescript-eslint/no-floating-promises': 'error', // re-enable in Task 3 when tsconfig covers source files
    },
    // languageOptions with projectService removed — requires a tsconfig.json covering all linted files.
    // Re-enable in Task 3 once apps/api/tsconfig.json exists:
    // languageOptions: {
    //   parserOptions: {
    //     projectService: true,
    //   },
    // },
  },
);
