import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/build/",
    "**/coverage/",
    "**/playwright-report/",
    "**/test-results/",
  ]),
  js.configs.recommended,
  // Type-aware rules, e.g. no floating promises (see PITFALLS.md: type-aware lint)
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["apps/dashboard/**"],
    languageOptions: { globals: globals.browser },
  },
  // Last: turns off rules that clash with Prettier
  prettier,
);
