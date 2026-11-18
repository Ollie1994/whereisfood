import type { NextConfig } from "next";
import { CSP_HEADER, STATIC_HEADERS, buildStaticCsp, cspEnv } from "./src/lib/http/csp";

// Every path but `/admin` and `/admin/…`, whose CSP is the proxy's nonce one, so each
// answer there carries exactly one (`csp.ts`; `next.config.test.ts` reads which paths match).
// The proxy sets its CSP exactly where `csp.ts`'s `isAdminPagePath` holds on the path it reads,
// so the two must agree; `next.config.test.ts` checks them on the forms the proxy's matcher adds.
// Case variants (`/Admin/…`) differ by host: under `next start` this and the proxy's matcher
// match by exact case (`caseSensitiveRoutes` below), so the proxy doesn't run on them and this
// gives them the static CSP; on Vercel both ignore case, so this leaves them out and the proxy
// sends them to their lower-case path (a bodiless 308, before it reads `isAdminPagePath`;
// IS #414, PR #415). The forms a server turns into `/admin` before the proxy runs, `/admin.rsc`
// and `/_next/data/<id>/…`, get both CSPs; under `next start` they carried one, the proxy's
// (`isAdminPagePath`'s comment). A host that kept both would send the two, whose intersection
// is stricter than either.
const NOT_ADMIN = "/((?!admin$|admin/).*)";

const nextConfig: NextConfig = {
  // No `X-Powered-By: Next.js` on any answer.
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: [...STATIC_HEADERS] },
      { source: NOT_ADMIN, headers: [{ key: CSP_HEADER, value: buildStaticCsp(cspEnv()) }] },
    ];
  },
  // When `next dev` detects an AI coding agent, it writes a managed "agent rules" block
  // and re-adds it on every such run. 16.3 wrote it into AGENTS.md, or into CLAUDE.md
  // when AGENTS.md was missing (PR #135). 16.4.3's generator writes only AGENTS.md
  // (`next/dist/server/lib/generate-agent-files.js`). Every tracked doc here is
  // hand-written and changes only through a PR (CLAUDE.md, "Doc changes"), so the
  // generator stays off. Since 16.4.0, `false` also makes `next dev` remove an existing
  // managed block, deleting AGENTS.md if the block was all it held (`agentRules.md`,
  // "Version History"); this repo has no AGENTS.md. Owner's call, PR #135 (plan
  // decision #12).
  agentRules: false,
  // `next dev` starts on `localhost` and blocks its dev resources for any other host.
  // Opened at `127.0.0.1:3000` (Supabase's `site_url`, and the host plan #16's check
  // uses), it blocked `/_next/hmr` and the login form fell back to a plain GET
  // (`.next/dev/logs/next-development.log`, PR for IS #222). Dev only.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // 16.4's default, "security", makes `next build` and `next dev` run by an AI coding
    // agent throw `SecurityFatalError` (exit 1) when a published advisory covers the
    // installed Next, and query the advisory source on each run
    // (`next/dist/lib/upgrade/nudge.js`). Off, so a gate's result depends only on the
    // code; advisories reach the owner through Dependabot alerts and `npm audit`, and
    // Next upgrades stay deliberate, each with a browser check. Owner's call, PR #179.
    agentUpgrade: false,
    // Under `next start`, `headers()`' sources match by exact case, as the proxy's matcher does
    // (on Vercel neither does: below). Without it Next matched them ignoring case
    // (`filesystem.js`'s `buildCustomRoute`), so `NOT_ADMIN` also left out `/Admin/login` and
    // `/ADMIN`, which the proxy doesn't run on: their 404s went out with no CSP (`next start`,
    // PR #411, round 1). In 16.4.5 it sets how `headers()`,
    // `redirects()` and `rewrites()` match (`filesystem.js`), and this config has only
    // `headers()`; the build also writes it into the routes manifest (`caseSensitive`), whose
    // other readers weren't traced. A Vercel deploy doesn't honour it: there `headers()` left
    // `/Admin/login` out, and the proxy ran on it, so the proxy sends a case variant to its
    // lower-case path first (the preview, IS #414).
    caseSensitiveRoutes: true,
  },
};

export default nextConfig;
