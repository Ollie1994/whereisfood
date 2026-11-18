import type { NextConfig } from "next";
import { CSP_HEADER, STATIC_HEADERS, buildStaticCsp, cspEnv } from "./src/lib/http/csp";

// Every path but `/admin` and `/admin/…`, whose CSP is the proxy's nonce one, so each
// answer there carries exactly one (`csp.ts`; `next.config.test.ts` reads which paths match).
// Matched by exact case (`caseSensitiveRoutes` below), as the proxy's matcher is.
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
    // `headers()`' sources match by exact case, as the proxy's matcher does. Without it Next
    // matched them ignoring case (`filesystem.js`'s `buildCustomRoute`), so `NOT_ADMIN` also
    // left out `/Admin/login` and `/ADMIN`, which the proxy doesn't run on: their 404s went
    // out with no CSP (`next start`, PR #411, round 1). In 16.4.5 it sets how `headers()`,
    // `redirects()` and `rewrites()` match (`filesystem.js`), and this config has only
    // `headers()`; the build also writes it into the routes manifest (`caseSensitive`), whose
    // other readers weren't traced. Whether a Vercel deploy honours it is read on the preview.
    caseSensitiveRoutes: true,
  },
};

export default nextConfig;
