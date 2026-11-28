// Finds `PITFALLS.md: <heading>` pointers whose heading is not in PITFALLS.md (guardrail G1).
// Only one line is read: a pointer wrapped across two lines is not checked.
const PREFIX = "PITFALLS.md: ";
const PLACEHOLDER = "<heading>"; // the only skipped pointer text
const SEPARATOR = /^(, |; | and )/;
const SPACED_END = /^\s+[|)]/; // table cell: "heading |"
const END_CHARS = ")|.:`*\"'!?]"; // a pointer may stop at these
const MAX_TYPO_WORDS = 5;

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

/**
 * After `, ` or `; `, text that is not a heading but is shaped like one (starts with a capital,
 * a few words, no further comma, not another pointer) is read as a typo in a second heading.
 * Prose such as ", Because it is cheap." is flagged too: limitation of this simple rule.
 * Lowercase typos and typos after " and " pass (too much prose starts that way).
 */
function looksLikeHeading(text: string): boolean {
  if (text.includes("PITFALLS.md")) return false;
  const phrase = text.split(/[)|]|\.(?:\s|$)/)[0] ?? "";
  if (/[,;]/.test(phrase) || !/^[A-Z]/.test(phrase)) return false;
  return phrase.trim().split(/\s+/).length <= MAX_TYPO_WORDS;
}

/** True if `text` starts with a heading and then ends the pointer or continues with another. */
function namesRealHeadings(text: string, headings: string[]): boolean {
  const heading = headings.find((h) => text.startsWith(h));
  if (heading === undefined) return false;
  const rest = text.slice(heading.length);
  if (rest.trim() === "" || SPACED_END.test(rest) || END_CHARS.includes(rest[0] ?? "")) return true;
  const separator = SEPARATOR.exec(rest);
  if (separator !== null) {
    const next = rest.slice(separator[0].length);
    if (headings.some((h) => next.startsWith(h))) return namesRealHeadings(next, headings);
    // Prose follows, except a heading-shaped phrase after a comma or semicolon
    return separator[0] === " and " || !looksLikeHeading(next);
  }
  return rest[0] === "," || rest[0] === ";"; // "heading," then a line break or no space
}

/** Pointers in one file's text that name no real heading. the literal `<heading>` placeholder is skipped. */
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
      if (!text.startsWith(PLACEHOLDER) && !namesRealHeadings(text, headings)) {
        broken.push({ file, line: index + 1, text: text.slice(0, 60) });
      }
      from = lineText.indexOf(PREFIX, from + PREFIX.length);
    }
  });
  return broken;
}
