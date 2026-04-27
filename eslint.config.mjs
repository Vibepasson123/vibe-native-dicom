import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import { defineConfig } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default defineConfig([
  {
    extends: fixupConfigRules(compat.extends('@react-native', 'prettier')),
    plugins: { prettier },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'prettier/prettier': 'error',
    },
  },
  {
    // .build/ holds CMake/native artifacts; .ts files inside it are CMake's
    // dependency-tracking files (compiler_depend.ts), not TypeScript.
    ignores: [
      'node_modules/',
      'lib/',
      '.build/',
      'android/build/',
      'example/android/build/',
      'example/android/app/build/',
      'example/ios/build/',
      'third_party/',
    ],
  },
]);
