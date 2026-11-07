// A plain form POST, so it needs no state and works before any script runs: the route
// answers 303 to `/admin/login`, which the browser follows with a GET (Phase 7 plan,
// #28).
export default function LogoutButton() {
  return (
    <form method="post" action="/auth/logout">
      <button type="submit" className="rounded-md border border-zinc-300 px-3 py-2 text-sm">
        Logga ut
      </button>
    </form>
  );
}
