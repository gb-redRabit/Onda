import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'generate-random-icon.js',
      'scripts/fetch-ffmpeg.mjs',
      // Bundled plugin examples run in the plugin sandbox (global `api`).
      'resources/plugins-examples/**'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  eslintConfigPrettier,
  {
    // Kod produkcyjny: jawne `any` wyłącza kontrolę typów w miejscu użycia, więc
    // traktujemy je jak błąd. Testy celowo używają `as any` w mockach, a setup
    // Vitest nadpisuje globalne `window.api` — te pliki zostają poza regułą.
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/**/__tests__/**', 'src/renderer/src/vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'vue/first-attribute-linebreak': 'error',
      // Każdy <button> musi mieć jawny type: bez niego przeglądarka traktuje go
      // jak `submit`, co w formularzach wysyła je przypadkiem.
      'vue/html-button-has-type': 'error',
      // Vue accepts camelCase props in templates; this project consistently uses that form.
      'vue/attribute-hyphenation': 'off',
      'prettier/prettier': 'off'
    }
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Test files intentionally declare several inline stub components and
      // mirror third-party components with the array props form; both rules
      // guard SFC authoring, not fixtures.
      'vue/one-component-per-file': 'off',
      'vue/require-prop-types': 'off'
    }
  },
  {
    // Plain Node tooling scripts: return types are not part of the style.
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    // Vite plugin hooks expose untyped `req`/`res`; this config is not app code.
    files: ['electron.vite.config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
