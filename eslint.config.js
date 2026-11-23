import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'dist-public/**', 'artifacts/**'] },
  {
    files: ['eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vite.config.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'prefer-arrow-callback': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'FunctionDeclaration', message: 'Use a named const with an arrow function.' },
        { selector: 'FunctionExpression', message: 'Use an arrow function.' },
      ],
    },
  },
  {
    files: ['src/**/*.test.{ts,tsx}', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Program', message: 'Use TypeScript (.ts/.tsx) for files in src.' },
      ],
    },
  },
  prettier,
);
