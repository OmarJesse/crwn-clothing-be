import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts}"], languageOptions: { globals: globals.browser } },
  tseslint.configs.recommended,
  {
    env: {
      node: true,
      es2020: true
    },
    extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module"
    },
    plugins: ["@typescript-eslint"],
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn",
      "semi": ["error", "always"],
      "quotes": ["error", "single"],
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
]);