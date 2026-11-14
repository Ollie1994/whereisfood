// `node scripts/audit-report.mjs <report.json>` — reads `npm audit --omit=dev --json`'s report
// for run 3 of ci.yml's `audit` job (Phase 8 plan #12, IS #291) and prints GitHub Actions
// workflow commands: one `::warning::` per advisory, and an `::error::` with exit 1 when it
// can't tell which advisories there are. Plain Node with no imports beyond `node:`, so the
// job still installs nothing.
//
// The report's shape, read from npm 11.21.0 (2026-11-14): `metadata.vulnerabilities.total`
// counts vulnerable packages; `vulnerabilities` maps each package to an entry whose `via` is
// an array; an object in `via` is an advisory (`source`, `name`, `title`, `url`, `severity`),
// a string names another package. Today's full tree: 7 packages, one advisory object,
// minimatch's GHSA-g3hv-75wg-m249; with --omit=dev, total 0. On an unreachable --registry the
// report held only `message` and `error`, no count, exit 1.
//
// It fails (exit 1) when the report isn't JSON, has no integer count, or counts some
// vulnerabilities but names no advisory: then the job can't say which advisories need an
// issue (CLAUDE.md, "Dependencies"; round 3 on PR #339, the owner's call). Past the
// warning limit it prints 9 and then "and N more": GitHub keeps 10 warning annotations a
// step and drops the rest with no notice (probe PR #341: 12 printed, the check run kept 10).
// An "advisories" log group lists them all. The tests are audit-report.test.mjs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const WARNING_LIMIT = 10;

const NOTE = 'it needs an issue before this PR merges, unless it has one (CLAUDE.md, "Dependencies")';

// A report field as text. Parsed JSON can hold an object whose `toString` key isn't a
// function, and a template literal throws on it ("Cannot convert object to primitive
// value", round 3); JSON.stringify can't throw on parsed JSON.
const text = (value) => (typeof value === "string" ? value : value === undefined ? "?" : JSON.stringify(value));

// Workflow-command data escaping (GitHub's docs, "Workflow commands"): `%`, CR and LF.
const escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

// Pure. The report's advisories, each once (by URL, else source id, else its JSON), in the
// order first seen; or `{ error }` when the report can't say which there are.
export function readAdvisories(json) {
  let report;
  try {
    report = JSON.parse(json);
  } catch {
    return { error: "npm audit gave no vulnerability count: it couldn't run, or its report isn't JSON" };
  }
  const total = report?.metadata?.vulnerabilities?.total;
  if (!Number.isInteger(total)) {
    return { error: "npm audit gave no vulnerability count: it couldn't run, or its report is in a form this step can't read" };
  }
  const vulnerabilities = report.vulnerabilities;
  const entries = vulnerabilities !== null && typeof vulnerabilities === "object" ? Object.values(vulnerabilities) : [];
  const seen = new Map();
  for (const entry of entries) {
    const via = entry !== null && typeof entry === "object" && Array.isArray(entry.via) ? entry.via : [];
    for (const item of via) {
      if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
      const key = text(item.url ?? item.source ?? item);
      if (!seen.has(key)) seen.set(key, item);
    }
  }
  if (total > 0 && seen.size === 0) {
    return {
      error: `npm audit counted ${total} vulnerabilities in production dependencies, and this step can't name an advisory in its report`,
    };
  }
  return {
    advisories: [...seen.values()].map(
      (a) => `${text(a.severity)} in ${text(a.name)}: ${text(a.title)} (${a.url === undefined ? "no URL" : text(a.url)})`,
    ),
  };
}

// Pure. The lines to print for a list of advisories: the log group, then the warnings.
// A log line starts with "- " and has no line break, so it can't be read as a command.
export function workflowLines(advisories) {
  const lines = [`::group::advisories (${advisories.length})`];
  for (const a of advisories) lines.push(`- ${a.replace(/[\r\n]+/g, " ")}`);
  lines.push("::endgroup::");
  const over = advisories.length > WARNING_LIMIT;
  for (const a of over ? advisories.slice(0, WARNING_LIMIT - 1) : advisories) {
    lines.push(`::warning title=npm audit::${escapeData(`${a}: ${NOTE}`)}`);
  }
  if (over) {
    lines.push(
      `::warning title=npm audit::and ${advisories.length - (WARNING_LIMIT - 1)} more advisories: GitHub shows ${WARNING_LIMIT} warnings a step, and the "advisories" log group lists them all`,
    );
  }
  return lines;
}

// Run only when executed, not when a test imports it (controls-trigger.mjs's form).
const isMain =
  import.meta.main ?? (process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url);
if (isMain) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: node scripts/audit-report.mjs <npm audit --json report>");
    process.exit(2);
  }
  let json;
  try {
    json = readFileSync(path, "utf8");
  } catch (err) {
    console.log(`::error::${escapeData(`audit-report: can't read ${path}: ${err.message}`)}`);
    process.exit(1);
  }
  const result = readAdvisories(json);
  if (result.error) {
    console.log(`::error::${escapeData(result.error)}`);
    process.exit(1);
  }
  for (const line of workflowLines(result.advisories)) console.log(line);
}
