import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import pluginQuery from '@tanstack/eslint-plugin-query';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  js.configs.recommended,
  ...pluginQuery.configs['flat/recommended'],
  jsxA11y.flatConfigs.recommended,
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
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'react/jsx-uses-vars': 'error'
    }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}']
  })),
  {
    files: ['**/*.{ts,tsx}'],
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
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      'react/jsx-uses-vars': 'error',
      // DateField es un control de fecha propio (envuelve un <input>); la regla
      // a11y no lo detecta como control nativo, así que se lo declaramos.
      'jsx-a11y/label-has-associated-control': ['error', { controlComponents: ['DateField'] }]
    }
  },
  {
    files: ['**/*.test.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024
      }
    }
  },
  // Límites de arquitectura: la dependencia va UI → services → lib. Las capas de
  // abajo no pueden importar de features (eso invierte la dependencia). Lo
  // compartido entre service y feature va a shared/ o types/.
  {
    files: ['src/services/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*', '**/features/**'],
              message:
                'services no debe importar de features (invierte la dependencia). Mueve lo común a shared/ o types/.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/lib/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/*', '**/features/**', '**/services/*', '**/services/**'],
              message: 'lib es la capa más baja: no debe importar de services ni de features.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.es2024
      }
    }
  },
  {
    // Scripts de build/CI y archivos de configuración que corren en Node.
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024
      }
    }
  }
];
