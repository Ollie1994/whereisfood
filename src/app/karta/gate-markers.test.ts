import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// SOFT-LAUNCH GATE (Phase 10 plan #5): the marker test, deleted at the full launch. Every
// tracked file outside `.claude/` that holds the marker must be on the removal list in
// `page.tsx`'s header, and every listed file must hold it, so a gate site added or dropped
// without the list fails here. `.claude/` is left out: the plans and the log quote the marker
// as history.
//
// What it can't see: a gate site that holds no marker and isn't listed (it sees only marked
// files), a file not yet tracked (`git grep` reads tracked files; a new one counts once
// `git add`ed), and whether a listed site's "goes back to" text is right.

const MARKER = "SOFT-LAUNCH GATE (Phase 10 plan #5)";
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PAGE = "src/app/karta/page.tsx";

// The removal list's paths: each `// - <path>: …` line of `page.tsx` after its "THE REMOVAL
// LIST" heading, up to the first line that isn't a comment, so a bullet elsewhere in the
// header (its limits) isn't read as a site.
function listedPaths(source: string): string[] {
  const start = source.indexOf("// THE REMOVAL LIST");
  if (start < 0) throw new Error("listedPaths: no THE REMOVAL LIST heading in page.tsx");
  const lines = source.slice(start).split(/\r?\n/);
  const end = lines.findIndex((line) => !line.startsWith("//"));
  const list = lines.slice(0, end < 0 ? lines.length : end).join("\n");
  return [...list.matchAll(/^\/\/ - ([^\s:]+):/gm)].map((match) => match[1]);
}

// The tracked files outside `.claude/` holding the marker. `git grep` exits 1 when nothing
// matches, which is an empty list here, not an error.
function markedFiles(): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-F", MARKER, "--", ".", ":(exclude).claude"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    return out.split("\n").filter(Boolean);
  } catch (err) {
    if ((err as { status?: number }).status === 1) return [];
    throw err;
  }
}

// Files marked but not listed, and listed but not marked.
function mismatches(listed: readonly string[], marked: readonly string[]) {
  return {
    unlisted: marked.filter((path) => !listed.includes(path)).sort(),
    unmarked: listed.filter((path) => !marked.includes(path)).sort(),
  };
}

describe("the soft-launch gate's markers", () => {
  const listed = listedPaths(readFileSync(`${ROOT}${PAGE}`, "utf8"));

  it("reads a removal list that names page.tsx itself", () => {
    expect(listed).toContain(PAGE);
  });

  it("finds every marked file on the removal list, and the marker in every listed file", () => {
    expect(mismatches(listed, markedFiles())).toEqual({ unlisted: [], unmarked: [] });
  });

  it("reports a marked file that isn't listed, and a listed file without the marker", () => {
    expect(mismatches(["a.ts", "b.ts"], ["b.ts", "c.ts"])).toEqual({ unlisted: ["c.ts"], unmarked: ["a.ts"] });
  });
});
