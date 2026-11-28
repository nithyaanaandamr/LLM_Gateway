import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint, type Linter } from "eslint";
import tseslint from "typescript-eslint";

type LintMessage = Linter.LintMessage;

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

/** Messages for `code` pretending to live at `file` (relative to the repo root). */
export async function lintMessages(file: string, code: string): Promise<LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath: join(REPO_ROOT, file) });
  return result?.messages ?? [];
}

/** Rule ids reported for `code` at `file`. */
export async function lintRuleIds(file: string, code: string): Promise<string[]> {
  const messages = await lintMessages(file, code);
  return messages.map((m) => m.ruleId ?? `parse error: ${m.message}`);
}

export interface RestrictedGroup {
  group: string[];
  message: string;
}

/** The `no-restricted-imports` groups the config applies to `file`. */
export async function restrictedGroups(file: string): Promise<RestrictedGroup[]> {
  const config = (await eslint.calculateConfigForFile(join(REPO_ROOT, file))) as {
    rules?: Record<string, [unknown, { patterns?: RestrictedGroup[] }?]>;
  };
  return config.rules?.["no-restricted-imports"]?.[1]?.patterns ?? [];
}
