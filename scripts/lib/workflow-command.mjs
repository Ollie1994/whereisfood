// GitHub Actions workflow commands (`::error::…`, `::warning::…`), shared by the scripts CI
// runs: audit-report.mjs and closing-keywords.mjs.

// Workflow-command data escaping (GitHub's docs, "Workflow commands"): `%`, CR and LF.
export const escapeData = (s) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
