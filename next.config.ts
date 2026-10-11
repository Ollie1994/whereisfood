import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Since 16.3, `next dev` writes a managed "agent rules" block when it detects an AI
  // coding agent, and re-adds it on every such run: into AGENTS.md if that exists,
  // otherwise into CLAUDE.md, and it creates both files if neither exists. Every
  // tracked doc here is hand-written and changes only through a PR (CLAUDE.md, "Doc
  // changes"), so the generator stays off. Owner's call, PR #135 (plan decision #12).
  agentRules: false,
};

export default nextConfig;
