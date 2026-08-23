import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/** Every <option> must write its value out.
 *
 *  An option with no value attribute submits its own text. This app translates the text in
 *  the page, so in Myanmar such a select posts a Burmese word where the API expects an
 *  enum — which is how saving a supplier came to fail with "Invalid option: expected one
 *  of CUSTOMER|SUPPLIER|…". Nothing in TypeScript can see it: the markup is valid, the
 *  value is simply decided at runtime by whatever the label happens to say.
 *
 *  Scanning the source is crude, but it is the only place this is visible before a user
 *  hits it in the wrong language.
 */

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("select options", () => {
  it("always carry an explicit value", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(join(process.cwd(), "src"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        // Only opening tags, and not the ones inside a comment explaining this rule.
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
        for (const match of line.matchAll(/<option\b([^>]*)>/g)) {
          if (!/\bvalue=/.test(match[1])) {
            offenders.push(`${file.replace(process.cwd(), "")}:${index + 1}`);
          }
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
