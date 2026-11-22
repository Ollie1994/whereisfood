import { LOGOUT_LABEL, LOGOUT_PATH } from "@/lib/login";

// A plain form POST, so it needs no state and works before any script runs: the route
// answers 303 to `/admin/login`, which the browser follows with a GET (Phase 7 plan,
// #28). The proxy's 503 page posts the same form (`LOGOUT_PATH`, `LOGOUT_LABEL`).
export default function LogoutButton() {
  return (
    <form method="post" action={LOGOUT_PATH}>
      <button type="submit" className="rounded-md border border-foreground/30 px-3 py-2 text-sm">
        {LOGOUT_LABEL}
      </button>
    </form>
  );
}
