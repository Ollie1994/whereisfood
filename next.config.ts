import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  },
};

export default nextConfig;
