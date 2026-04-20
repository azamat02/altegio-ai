import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'demo-site/**', 'mockups/**'],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
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
