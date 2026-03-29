import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";

export default [
  ...ts.configs.recommended,
  ...svelte.configs["flat/recommended"],
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },
  {
    ignores: ["build/", ".svelte-kit/", "src-tauri/"],
  },
];
