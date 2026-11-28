import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Type-aware rules are off: made-up paths are in no tsconfig, and boundary rules don't need types.
export const eslint = new ESLint({
  cwd: REPO_ROOT,
  ignore: false,
  overrideConfig: [
    tseslint.configs.disableTypeChecked,
    { languageOptions: { parserOptions: { projectService: false } } },
  ],
});

/** Rule ids reported for `code` pretending to live at `file` (relative to the repo root). */
export async function lintRuleIds(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `parse error: ${m.message}`);
}
