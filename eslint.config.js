import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'dist-public/**', 'artifacts/**'] },
  {
    files: ['src/**/*.{js,jsx,ts,tsx}', 'vite.config.ts', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Legacy code is migrated in phases; TS files below enforce these checks.
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['src/**/*.test.{js,ts}', 'vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/exhaustive-deps': 'error',
      'prefer-arrow-callback': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'FunctionDeclaration', message: 'Use a named const with an arrow function.' },
        { selector: 'FunctionExpression', message: 'Use an arrow function.' },
      ],
    },
  },
  prettier,
);
