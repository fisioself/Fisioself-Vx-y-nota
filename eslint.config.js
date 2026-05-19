import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser,
        ...globals.es2024
      }
    },
    plugins: {
      react
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'react/jsx-uses-vars': 'error'
    }
  },
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024
      }
    }
  }
];
