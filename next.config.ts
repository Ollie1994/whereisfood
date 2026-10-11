import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Since 16.3, `next dev` appends a managed "agent rules" block to CLAUDE.md when it
  // detects an AI coding agent, and re-adds it on every such run. CLAUDE.md is
  // hand-written and changes only through a PR (CLAUDE.md, "Doc changes"), so the
  // generator stays off. Owner's call, PR #135.
  agentRules: false,
};

export default nextConfig;
