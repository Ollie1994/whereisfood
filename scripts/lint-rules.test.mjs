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

// The config (eslint-config-next, its parsers and plugins) loads on the first lint, which
// took about 2.3 s on its own here (round 1 on PR #320), so it loads in this hook, under
// its own limit, rather than inside the first test's 5 s.
let eslint;
beforeAll(async () => {
  eslint = new ESLint({ cwd: ROOT });
  await eslint.lintText("", { filePath: "src/lib/db/probe.ts" });
}, 60_000);

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
  "declare const q: { or(f: string): unknown; rpc(n: string, a?: object): unknown; from(t: string): { or(f: string): unknown } }; declare const id: number; declare const rows: number[];\n";

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

  it("a sink in a .cjs file draws its message", async () => {
    const messages = await lint("el.innerHTML = s;\n", "src/components/probe.cjs");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^no-restricted-properties: .*innerHTML parses HTML/);
  });

  it.each([
    ["on a DOM element", "<div dangerouslySetInnerHTML={{ __html: s }} />"],
    ["on a component", "<Foo dangerouslySetInnerHTML={{ __html: s }} />"],
  ])("dangerouslySetInnerHTML %s draws react/no-danger", async (_name, jsx) => {
    const code = `${DECLARE}declare const Foo: (p: object) => null;\nexport function P() { return ${jsx}; }\n`;
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
  const OR = "A string built into .or()";
  const RPC = "A string built into .rpc()";
  const FILTER = "No .filter in src/lib/db/";
  it.each([
    ["a template into .or()", "q.or(`id.eq.${id}`);", OR],
    ["a + into .or()", 'q.or("id.eq." + id);', OR],
    ["a template inside .or()'s argument, under .trim()", "q.or(`id.eq.${id}`.trim());", OR],
    ["a template inside .or()'s argument, in a ternary", 'q.or(id ? `id.eq.${id}` : "x");', OR],
    ["a template inside .or()'s argument, in an array joined", 'q.or(["a", `b${id}`].join(","));', OR],
    ["a template into .rpc()", "q.rpc(`fn_${id}`);", RPC],
    ["a + into .rpc()", 'q.rpc("fn_" + id);', RPC],
    ["a template inside .rpc()'s first argument", "q.rpc(`fn_${id}`.trim());", RPC],
    ["any .filter", "rows.filter(Boolean);", FILTER],
    ["a computed .filter", 'rows["filter"](Boolean);', FILTER],
    ["a destructured .filter", "const { filter } = rows; void filter;", FILTER],
  ])("%s draws its message", async (_name, code, expected) => {
    const messages = await lint(`${DB_DECLARE}${code}\n`, "src/lib/db/probe.ts");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain(`no-restricted-syntax: ${expected}`);
  });

  it.each([
    ["a literal .or()", 'q.or("id.eq.1");'],
    ["a template with no expression into .or()", "q.or(`id.eq.1`);"],
    ["a literal .or() on a callee built from a template", 'q.from(`t_${id}`).or("id.eq.1");'],
    ["a literal .rpc() with an argument object", 'q.rpc("fn", { id });'],
    ["a literal .rpc() whose argument object holds a template", 'q.rpc("fn", { name: `n_${id}` });'],
  ])("%s draws none", async (_name, code) => {
    expect(await lint(`${DB_DECLARE}${code}\n`, "src/lib/db/probe.ts")).toEqual([]);
  });

  it("an array's .filter outside src/lib/db/ draws none", async () => {
    expect(await lint(`${DB_DECLARE}rows.filter(Boolean);\n`, "src/components/Probe.ts")).toEqual([]);
  });
});
