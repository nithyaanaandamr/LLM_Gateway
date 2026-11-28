// Finds `PITFALLS.md: <heading>` pointers whose heading is not in PITFALLS.md (guardrail G1).
const PREFIX = "PITFALLS.md: ";
const SEPARATOR = /^(, |; | and )/;
const SPACED_END = /^\s+[|)]/; // table cell: "heading |"
const END_CHARS = ")|.,;:`*\"']";

export interface BrokenPointer {
  file: string;
  line: number;
  text: string;
}

/** Headings (`## Name`) of a PITFALLS.md text, longest first so prefixes never win. */
export function readHeadings(pitfalls: string): string[] {
  const headings = pitfalls
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trimEnd());
  return headings.sort((a, b) => b.length - a.length);
}

/** True if `text` is one or more headings joined by `, ` / `; ` / ` and `, then an end. */
function namesRealHeadings(text: string, headings: string[]): boolean {
  const heading = headings.find((h) => text.startsWith(h));
  if (heading === undefined) return false;
  const rest = text.slice(heading.length);
  if (rest === "" || END_CHARS.includes(rest[0] ?? "") || SPACED_END.test(rest)) return true;
  const separator = SEPARATOR.exec(rest);
  if (separator === null) return false;
  // Not another heading after the separator (e.g. "A, then ..."): the pointer ended at the comma.
  return (
    namesRealHeadings(rest.slice(separator[0].length), headings) ||
    END_CHARS.includes(rest[0] ?? "")
  );
}

/** Pointers in one file's text that name no real heading. `<...>` placeholders are skipped. */
export function findBrokenPointers(
  file: string,
  content: string,
  headings: string[],
): BrokenPointer[] {
  const broken: BrokenPointer[] = [];
  content.split("\n").forEach((lineText, index) => {
    let from = lineText.indexOf(PREFIX);
    while (from !== -1) {
      const text = lineText.slice(from + PREFIX.length);
      if (!text.startsWith("<") && !namesRealHeadings(text, headings)) {
        broken.push({ file, line: index + 1, text: text.slice(0, 60) });
      }
      from = lineText.indexOf(PREFIX, from + PREFIX.length);
    }
  });
  return broken;
}
