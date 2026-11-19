// The error pages' text, the owner's wording (IS #310, #413), in one place for the root's
// and `/admin`'s `error.tsx`: a heading, the sentence and "Försök igen", which calls the
// boundary's `retry`. Classes only, since the `/admin` CSP admits no inline `style`. Rendered
// only under those error boundaries, which are Client Components, so it runs on the client
// without a directive of its own (as one, its function prop would be a client entry's,
// which Next's TS plugin flags).
import { SMALL_BUTTON } from "@/components/Admin/styles";

export default function ErrorNotice({ retry }: { retry: () => void }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Något gick fel</h1>
      <p role="alert" className="text-sm text-foreground/70">
        Sidan kunde inte visas just nu.
      </p>
      <button type="button" onClick={() => retry()} className={`self-start ${SMALL_BUTTON}`}>
        Försök igen
      </button>
    </>
  );
}
