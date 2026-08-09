// Dev-only helper — NOT part of the app bundle.
//
// Computes a valid Mailgun inbound signature (HMAC-SHA256 over timestamp+token)
// and prints a ready-to-run curl.exe command for POST /api/email. A valid
// signature can't be hand-typed, so this is the only practical way to exercise
// the email lane's happy path by hand.
//
// node does NOT auto-load .env.local, so the signing key must be supplied
// explicitly — via --key or the MAILGUN_WEBHOOK_SIGNING_KEY env var.
//
// Usage (PowerShell):
//   $env:MAILGUN_WEBHOOK_SIGNING_KEY = "dev-mailgun-signing-key-local"
//   node scripts/sign-mailgun.mjs --recipient 11111111-1111-1111-1111-111111111111@in.yourapp.se --body "Vi star vid Jarntorget 11-14"
//   # then paste & run the printed curl.exe command
//
// Flags:
//   --recipient <addr>   full To address, {uuid}@in.yourapp.se   (required)
//   --body <text>        body-plain contents                     (default "")
//   --key <key>          signing key      (default $MAILGUN_WEBHOOK_SIGNING_KEY)
//   --timestamp <unix>   Unix seconds                            (default now)
//                        Pass an old value (e.g. now - 1200) to exercise the
//                        ±15 min replay guard. A correctly signed but stale
//                        payload still returns 200 — it is stored with
//                        parsing_status 'skipped' rather than rejected (#53).
//                        Check the posts row, not the status code. Note
//                        now - 600 is inside the window and stays 'pending':
//                        that is Mailgun's first retry interval.
//   --token <token>      random token                (default 16 random bytes)
//   --url <url>          endpoint     (default http://localhost:3000/api/email)

import { createHmac, randomBytes } from "node:crypto";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
    i++;
  }
  return args;
}

// PowerShell single-quote quoting: wrap in '...', escaping an embedded quote by
// doubling it. Single quotes are literal in PowerShell (and in bash), so the
// printed command is safe to paste — no $ / backtick / < / @ interpretation.
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const args = parseArgs(process.argv.slice(2));

const signingKey = args.key ?? process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
if (!signingKey) {
  console.error(
    "Error: no signing key. Pass --key <key> or set MAILGUN_WEBHOOK_SIGNING_KEY.",
  );
  process.exit(1);
}
if (!args.recipient) {
  console.error(
    "Error: --recipient <uuid>@in.yourapp.se is required.",
  );
  process.exit(1);
}

const recipient = args.recipient;
const bodyPlain = args.body ?? "";
const timestamp = args.timestamp ?? String(Math.floor(Date.now() / 1000));
const token = args.token ?? randomBytes(16).toString("hex");
const url = args.url ?? "http://localhost:3000/api/email";

const signature = createHmac("sha256", signingKey)
  .update(timestamp + token)
  .digest("hex");

// --data-urlencode sends application/x-www-form-urlencoded, which the route's
// request.formData() parses just like Mailgun's multipart/form-data. It encodes
// each value literally, avoiding curl -F's "@"/"<" file-read interpretation.
const fields = {
  recipient,
  "body-plain": bodyPlain,
  timestamp,
  token,
  signature,
};

const command =
  `curl.exe -X POST ${psQuote(url)} ` +
  Object.entries(fields)
    .map(([k, v]) => `--data-urlencode ${psQuote(`${k}=${v}`)}`)
    .join(" ");

console.log(command);
