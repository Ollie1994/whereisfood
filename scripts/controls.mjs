// `node scripts/controls.mjs [<file>...]` — re-runs the schema's negative controls (#170).
//
// A control is a file in `tests/controls/`: a header, then SQL that removes or narrows
// one term of a guard in the schema. For each control the runner applies the SQL to
// the local database, runs the integration tests the header names, checks the result
// against the header, and restores the database with `npx supabase db reset`. With no
// arguments it runs every `tests/controls/*.sql`, in name order.
//
// THE RULE the list follows (also in `.claude/commands/create-issues.md`, Failure modes):
// for a guard written as a condition or a list (a constraint, CHECK, `WHEN`, enum, grant
// set, policy or filter), one control per term, that term removed or narrowed. A term
// whose control turns nothing red is a guard no test holds: add the case, or, when
// another guard makes the change unobservable, mark the control `green:` with that guard.
//
// The header, one `-- key: value` per line, before the first line that isn't one:
//   -- run: <vitest filter>     required, once: the integration file(s), e.g. `schema`
//   -- red: <test name>         one per test that must FAIL, as `vitest list` prints it
//                               (`describe > test`)
//   -- green: <reason>          instead of `red:`: every test in the run must pass
//   -- setup-fails: <text>      instead of `red:`: a file's setup must fail with an
//                               error containing <text>, so its tests are skipped. For
//                               a term the fixtures themselves need (a `service_role`
//                               privilege): the suite fails loudly, but no test does
//
// Exit codes: 0 when every control behaved as its header says; 1 when one didn't (a
// `red:` test passed or matched no test, a `green:` control turned a test red, a run
// collected no test, a `setup-fails:` text matched no setup error, its SQL failed, or a reset failed: the run stops there, since the
// database is then in an unknown state); 2 for a bad argument, an unreadable or
// malformed control file, or no local database container.
//
// What it can't see: a term left off the list (the list is written by hand from the
// rule); guards in code, such as the db layer's `max_rows` checks; bypass inputs rather
// than removed terms; the hosted project (Phase 6). About 45 s a control: one
// `db reset` (41 s, measured 2026-10-23) and one integration file.
//
// Not a gate (CLAUDE.md, "Testing"): run it after a change to `supabase/migrations/` or
// to a test a control names.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTROLS_DIR = join(ROOT, "tests", "controls");

const sh = (command, options = {}) =>
  spawnSync(command, { shell: true, cwd: ROOT, encoding: "utf8", ...options });

function usage(message) {
  console.error(`✖ controls: ${message}\n  usage: node scripts/controls.mjs [<control file>...]`);
  process.exit(2);
}

// --- the control files ---------------------------------------------------------------

function parseControl(path) {
  let text;
  try {
    text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  } catch (error) {
    usage(`can't read ${path} (${error.message})`);
  }
  const lines = text.split("\n");
  const header = { run: [], red: [], green: [], "setup-fails": [] };
  let i = 0;
  for (; i < lines.length; i += 1) {
    const match = /^--\s*(run|red|green|setup-fails):\s*(.*\S)\s*$/.exec(lines[i]);
    if (match === null) break;
    header[match[1]].push(match[2]);
  }
  const sql = lines.slice(i).join("\n").trim();
  const name = path.split(/[\\/]/).pop();

  if (header.run.length !== 1) usage(`${name}: needs exactly one \`-- run:\` line`);
  const kinds = ["red", "green", "setup-fails"].filter((kind) => header[kind].length > 0);
  if (kinds.length !== 1) {
    usage(`${name}: needs \`-- red:\` lines, or one \`-- green:\` or \`-- setup-fails:\` line, and only one kind`);
  }
  if (header.green.length > 1) usage(`${name}: one \`-- green:\` reason, not ${header.green.length}`);
  if (header["setup-fails"].length > 1) usage(`${name}: one \`-- setup-fails:\` text, not ${header["setup-fails"].length}`);
  if (sql === "") usage(`${name}: no SQL after the header`);
  return {
    name,
    run: header.run[0],
    red: header.red,
    green: header.green[0] ?? null,
    setupFails: header["setup-fails"][0] ?? null,
    sql,
  };
}

const args = process.argv.slice(2);
if (args.some((arg) => arg.startsWith("-"))) usage(`unknown option ${args.find((a) => a.startsWith("-"))}`);
let files;
if (args.length > 0) {
  files = args;
} else {
  try {
    files = readdirSync(CONTROLS_DIR).filter((f) => f.endsWith(".sql")).sort().map((f) => join(CONTROLS_DIR, f));
  } catch (error) {
    usage(`can't list ${CONTROLS_DIR} (${error.message})`);
  }
  if (files.length === 0) usage(`no controls in ${CONTROLS_DIR}`);
}
// Parsed before anything runs, so a malformed file stops the run before the first reset.
const controls = files.map(parseControl);

// --- the database ----------------------------------------------------------------------

const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))?.[1];
if (!projectId) usage("no project_id in supabase/config.toml");
const CONTAINER = `supabase_db_${projectId}`;
const running = sh(`docker inspect -f "{{.State.Running}}" ${CONTAINER}`);
if (running.status !== 0 || running.stdout.trim() !== "true") {
  usage(`the local database container ${CONTAINER} isn't running (npx supabase start)`);
}

function applySql(sql) {
  // ON_ERROR_STOP: a statement that fails makes psql exit non-zero, so a broken control
  // is reported as broken instead of passing as "red".
  const result = sh(`docker exec -i ${CONTAINER} psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q`, {
    input: sql,
  });
  return result.status === 0 ? null : (result.stderr || result.stdout || `exit ${result.status}`).trim();
}

// The API through Kong, as the tests reach it.
const API_PORT = /^\[api\][^[]*?^port\s*=\s*(\d+)/ms.exec(readFileSync(join(ROOT, "supabase", "config.toml"), "utf8"))?.[1];
if (!API_PORT) usage("no [api] port in supabase/config.toml");
const API = `http://127.0.0.1:${API_PORT}`;

async function status(path) {
  try {
    return (await fetch(`${API}${path}`, { signal: AbortSignal.timeout(5_000) })).status;
  } catch {
    return 0;
  }
}

async function apiUp(seconds) {
  for (let waited = 0; waited < seconds; waited += 2) {
    if ((await status("/auth/v1/health")) === 200 && (await status("/rest/v1/")) === 200) return true;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return false;
}

// ⚠ A RESET CAN LEAVE AUTH UNREACHABLE. `db reset` restarts the Auth container, which
// can come back on a new address while Kong keeps routing to the old one: Kong's log
// showed "connect() failed (111: Connection refused) … upstream: http://172.19.0.11"
// with Auth at 172.19.0.10, and /auth/v1/health answered 502 for over a minute while
// Auth itself was healthy (2026-10-23). Every test then fails in its fixtures, which a
// control would read as red. So after each reset the API must answer, restarting Kong
// once if it doesn't (that brought /auth/v1/health to 200 within 3 s).
async function reset() {
  const result = sh("npx supabase db reset");
  if (result.status !== 0) return `exit ${result.status}: ${(result.stderr || "").trim().split("\n").pop()}`;
  if (await apiUp(20)) return null;
  console.log("  (the API didn't answer after the reset: restarting Kong)");
  sh(`docker restart supabase_kong_${projectId}`);
  return (await apiUp(30)) ? null : `the API didn't answer after the reset (${API}/auth/v1/health, /rest/v1/)`;
}

// --- the tests ---------------------------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), "controls-"));

// Every test in the run, by its `vitest list` name, with its status.
function runTests(filter, index) {
  const out = join(scratch, `run-${index}.json`);
  sh(`npx vitest run --project integration ${filter} --reporter=json --outputFile="${out}"`);
  let report;
  try {
    report = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    return null;
  }
  const tests = new Map();
  tests.setupErrors = [];
  for (const file of report.testResults ?? []) {
    if (file.status === "failed" && file.message) tests.setupErrors.push(file.message);
    for (const test of file.assertionResults ?? []) {
      tests.set([...(test.ancestorTitles ?? []), test.title].join(" > "), test.status);
    }
  }
  return tests;
}

// Tests that went red without being listed: a control that breaks a file's setup turns
// every test red, the listed ones included, so the count is shown, not judged.
function othersRed(control, tests) {
  if (tests === null || control.red.length === 0) return 0;
  return [...tests].filter(([name, status]) => status === "failed" && !control.red.includes(name)).length;
}

function judge(control, tests) {
  if (tests === null) return "the test run wrote no report";
  if (tests.size === 0) return `\`${control.run}\` collected no test`;
  if (control.setupFails !== null) {
    if (tests.setupErrors.some((message) => message.includes(control.setupFails))) return null;
    return tests.setupErrors.length === 0
      ? `no setup failed (expected "${control.setupFails}")`
      : `setup failed, but not with "${control.setupFails}": ${tests.setupErrors.map((m) => m.split("\n")[0]).join("; ")}`;
  }
  // ⚠ ONLY "passed" IS GREEN AND ONLY "failed" IS RED. When a file's setup throws, its
  // tests come back "skipped", and a first version read that as green (2026-10-23, with
  // Auth unreachable after a reset).
  if (control.green !== null) {
    const notPassed = [...tests].filter(([, status]) => status !== "passed");
    return notPassed.length === 0
      ? null
      : `green control: ${notPassed.length} not passed: ${notPassed.map(([name, s]) => `${name} (${s})`).join("; ")}`;
  }
  const problems = [];
  for (const name of control.red) {
    const testStatus = tests.get(name);
    if (testStatus === undefined) problems.push(`no such test: ${name}`);
    else if (testStatus === "passed") problems.push(`stayed green: ${name}`);
    else if (testStatus !== "failed") problems.push(`didn't run (${testStatus}): ${name}`);
  }
  return problems.length === 0 ? null : problems.join("; ");
}

// --- the run -----------------------------------------------------------------------------

console.log(`▶ controls: ${controls.length} control(s); a db reset first, then one after each.\n`);
let failures = 0;
let ran = 0;
let stopped = false;
const initial = await reset();
if (initial !== null) {
  console.error(`✖ the first db reset failed (${initial}); nothing ran`);
  rmSync(scratch, { recursive: true, force: true });
  process.exit(1);
}

for (const [index, control] of controls.entries()) {
  let verdict;
  let extra = 0;
  try {
    const sqlError = applySql(control.sql);
    if (sqlError !== null) {
      verdict = `SQL failed: ${sqlError.split("\n")[0]}`;
    } else {
      const tests = runTests(control.run, index);
      verdict = judge(control, tests);
      extra = othersRed(control, tests);
    }
  } finally {
    const resetError = await reset();
    if (resetError !== null) {
      verdict = `${verdict ? `${verdict}; ` : ""}db reset failed (${resetError})`;
      stopped = true;
    }
  }
  ran += 1;
  const expected =
    control.green !== null ? "green" : control.setupFails !== null ? "setup failure" : `${control.red.length} red`;
  if (verdict === null) {
    console.log(`✔ ${control.name}: ${expected}, as listed${extra > 0 ? ` (and ${extra} other(s) red)` : ""}`);
  } else {
    failures += 1;
    console.log(`✖ ${control.name}: ${verdict}`);
  }
  if (stopped) {
    console.error("\n✖ stopping: the database may not match the migrations");
    break;
  }
}

rmSync(scratch, { recursive: true, force: true });
const notRun = controls.length - ran;
console.log(`\n${failures === 0 ? "✔" : "✖"} controls: ${ran - failures} of ${ran} as listed${notRun > 0 ? `, ${notRun} not run` : ""}`);
process.exit(failures === 0 ? 0 : 1);
