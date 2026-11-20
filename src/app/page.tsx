import { redirect } from "next/navigation";
import { ABOUT_PATH } from "@/lib/paths";

// SOFT-LAUNCH GATE (Phase 10 plan #5): `/` sends everyone to `/about` until the full launch;
// the removal list in `src/app/map/page.tsx` says what it goes back to.
export default function Home() {
  redirect(ABOUT_PATH);
}
