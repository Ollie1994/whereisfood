import { redirect } from "next/navigation";
import { ABOUT_PATH } from "@/lib/paths";

// SOFT-LAUNCH GATE (Phase 10 plan #5): `/` sends everyone to `/om` until the full launch;
// the removal list in `src/app/karta/page.tsx` says what it becomes.
export default function Home() {
  redirect(ABOUT_PATH);
}
