// The lint rules' fixtures (Phase 8 plan #9, IS #289): a mistyped `no-restricted-syntax`
// selector or `no-restricted-properties` name matches nothing and lints clean, so each term
// in eslint.config.mjs's HTML_SINKS and DB_FILTERS, and `react/no-danger`, has a fixture here
// that must draw its own message. Each is a string linted through ESLint's API with a virtual
// `filePath` inside the rule's scope, so no fixture file sits in `src/` for `npm run lint` to
// fail on.

import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RULES = new Set(["react/no-danger", "no-restricted-properties", "no-restricted-syntax"]);

let eslint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

// The messages of the three rules for `code` at `filePath`. A parse error fails the test
// instead of reading as "no message".
async function lint(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  const fatal = result.messages.filter((m) => m.fatal);
  expect(fatal).toEqual([]);
  return result.messages.filter((m) => RULES.has(m.ruleId)).map((m) => `${m.ruleId}: ${m.message}`);
}

const DECLARE = "declare const el: HTMLElement; declare const s: string; declare const popup: { setHTML(h: string): void };\n";
const DB_DECLARE =
  "declare const q: { or(f: string): unknown; rpc(n: string, a?: object): unknown }; declare const id: number; declare const rows: number[];\n";

describe("the HTML sinks, anywhere", () => {
  it.each([
    ["innerHTML", "el.innerHTML = s;", "innerHTML parses HTML"],
    ["outerHTML", "el.outerHTML = s;", "outerHTML parses HTML"],
    ["insertAdjacentHTML", 'el.insertAdjacentHTML("beforeend", s);', "insertAdjacentHTML parses HTML"],
    ["setHTML", "popup.setHTML(s);", "setHTML renders HTML"],
  ])("%s draws its message", async (_name, code, expected) => {
    const messages = await lint(`${DECLARE}${code}\n`, "src/components/Probe.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^no-restricted-properties: /);
    expect(messages[0]).toContain(expected);
  });

  it("dangerouslySetInnerHTML draws react/no-danger", async () => {
    const code = `${DECLARE}export function P() { return <div dangerouslySetInnerHTML={{ __html: s }} />; }\n`;
    const messages = await lint(code, "src/components/Probe.tsx");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^react\/no-danger: /);
  });

  // The db entry sets its own rule, and the sinks stay on theirs there too.
  it("a sink under src/lib/db/ still draws its message", async () => {
    const messages = await lint(`${DECLARE}el.innerHTML = s;\n`, "src/lib/db/probe.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^no-restricted-properties: .*innerHTML parses HTML/);
  });
});

describe("the supabase-js filters, in src/lib/db/", () => {
  it.each([
    ["a template into .or()", "q.or(`id.eq.${id}`);", "A string built into .or()"],
    ["a + into .or()", 'q.or("id.eq." + id);', "A string built into .or()"],
    ["a template into .rpc()", "q.rpc(`fn_${id}`);", "A string built into .rpc()"],
    ["a + into .rpc()", 'q.rpc("fn_" + id);', "A string built into .rpc()"],
    ["any .filter", "rows.filter(Boolean);", "No .filter in src/lib/db/"],
  ])("%s draws its message", async (_name, code, expected) => {
    const messages = await lint(`${DB_DECLARE}${code}\n`, "src/lib/db/probe.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`no-restricted-syntax: ${expected}`);
  });

  it.each([
    ["a literal .or()", 'q.or("id.eq.1");'],
    ["a literal .rpc() with an argument object", 'q.rpc("fn", { id });'],
  ])("%s draws none", async (_name, code) => {
    expect(await lint(`${DB_DECLARE}${code}\n`, "src/lib/db/probe.ts")).toEqual([]);
  });

  it("an array's .filter outside src/lib/db/ draws none", async () => {
    expect(await lint(`${DB_DECLARE}rows.filter(Boolean);\n`, "src/components/Probe.ts")).toEqual([]);
  });
});
