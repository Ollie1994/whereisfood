// The error pages' text, the owner's wording (IS #310, #413), in one place for the root's
// and `/admin`'s `error.tsx`: a heading, the sentence and "Försök igen", which calls the
// boundary's `retry`. Classes only, since the `/admin` CSP admits no inline `style`. Rendered
// only under those error boundaries, which are Client Components, so it runs on the client
// without a directive of its own (as one, its function prop would be a client entry's,
// which Next's TS plugin flags).
//
// The heading takes focus on mount (`useFocusOnMount`), so a screen reader reads it, and
// `title` names the page (the owner's choices and wording, IS #438). React's `<title>`: an
// error page is a Client Component, and `metadata` exports are only supported in Server
// Components (Next 16.4's `error.md` and `generate-metadata.md`; `error.md` names `<title>`
// as the alternative for `global-error`).
//
// Probed on `/` only (headless Chrome on `npm start`, IS #438's PR; `/admin`'s not retried):
// a "Försök igen" that threw again mounted this page again, so the heading took focus again;
// a limit, one that succeeded left focus on `<body>`.
import { SMALL_BUTTON } from "@/components/Admin/styles";
import { useFocusOnMount } from "@/hooks/useFocusOnMount";

export default function ErrorNotice({ title, retry }: { title: string; retry: () => void }) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <>
      <title>{title}</title>
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
        Något gick fel
      </h1>
      <p className="text-sm text-foreground/70">Sidan kunde inte visas just nu.</p>
      <button type="button" onClick={() => retry()} className={`self-start ${SMALL_BUTTON}`}>
        Försök igen
      </button>
    </>
  );
}
