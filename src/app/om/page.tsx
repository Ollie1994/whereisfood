import type { Metadata } from "next";
import ExternalLink from "@/components/ExternalLink";
import PublicShell from "@/components/PublicShell";
import { CONTACT } from "@/lib/contact";

// What the app is (Phase 10 plan, steps 3 and 5d): where everyone but the admin lands during the
// soft launch, and a page that stays after it. For three readers: people looking for food, truck
// owners, and developers and employers (IS #483). Static, Swedish (CLAUDE.md, UI Rules), inside
// `PublicShell`, in its column (`PublicShell`'s comment). The text is the owner's (IS #483: the issue's calls and
// their answers in its comments); a change to it goes back to them.
export const metadata: Metadata = {
  title: "Om",
};

const REPO_URL = "https://github.com/Ollie1994/whereisfood";

// The owner's own profiles, for "Bakom Väm" (IS #483, call 6); each link is shown as its word.
const PROFILES = [
  { label: "GitHub", href: "https://github.com/Ollie1994" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/oliwer-karlsson-242b38323/" },
  { label: "Portfölj", href: "https://ambitious-coast-0312a8e0f.7.azurestaticapps.net/" },
];

const ROADMAP = [
  { when: "Nu", what: "Vi lägger in platser och provar kartan.", now: true },
  { when: "När säsongen börjar", what: "Kartan öppnar för alla.", now: false },
  { when: "Senare", what: "Foodtruckarna kan själva lägga in var de står.", now: false },
];

export default function AboutPage() {
  return (
    <PublicShell>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-4 py-8 md:max-w-2xl md:px-8 md:py-12">
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
            Var står Göteborgs foodtruckar i dag?
          </h1>
          {/* SOFT-LAUNCH GATE (Phase 10 plan #5): "Snart kan du öppna kartan, … gå och äta"
              becomes "Öppna kartan, … gå och ät" at the full launch (the owner's call, round 1 on
              PR #484; the removal list in `src/app/karta/page.tsx`). */}
          <p className="text-lg text-muted md:text-xl">
            Väm är en karta som visar var Göteborgs foodtruckar står just i dag. Snart kan du
            öppna kartan, se vad som finns nära dig och gå och äta.
          </p>
        </header>

        {/* SOFT-LAUNCH GATE (Phase 10 plan #5): "Just nu", why the map isn't open, is deleted at
            the full launch (the removal list in `src/app/karta/page.tsx`). */}
        <section
          aria-labelledby="just-nu"
          className="flex flex-col gap-2 rounded-2xl border-l-4 border-saffron bg-card p-5 shadow-sm"
        >
          <h2 id="just-nu" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Just nu
          </h2>
          <p>
            Kartan är inte öppen än. Vi lägger in platser och provar kartan i det tysta. En karta
            med två foodtruckar hjälper ingen, så den öppnar när foodtruckarna är tillbaka för
            säsongen och kartan är värd att öppna.
          </p>
        </section>

        <section aria-labelledby="sa-funkar-det" className="flex flex-col gap-3">
          <h2 id="sa-funkar-det" className="text-xl font-semibold">
            Så funkar det
          </h2>
          <ul className="flex flex-col gap-2">
            {[
              "Varje plats läggs in för hand.",
              "Kartan visar bara de foodtruckar som har en plats inlagd för dagen.",
              "Vid varje foodtruck står när platsen senast uppdaterades.",
            ].map((point) => (
              <li key={point} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-saffron" />
                {point}
              </li>
            ))}
          </ul>
        </section>

        {/* SOFT-LAUNCH GATE (Phase 10 plan #5): "Vägen framåt", whose "Nu" is the soft launch, is
            rewritten at the full launch (the removal list in `src/app/karta/page.tsx`). */}
        <section aria-labelledby="vagen-framat" className="flex flex-col gap-4">
          <h2 id="vagen-framat" className="text-xl font-semibold">
            Vägen framåt
          </h2>
          <ol className="flex flex-col gap-5 border-l-2 border-line pl-6">
            {ROADMAP.map(({ when, what, now }) => (
              <li key={when} className="relative">
                {/* The dot centres on the `ol`'s line only for these sizes: `pl-6` (24 px) +
                    half of `border-l-2` (1 px) + half the dot's `w-4` (8 px) = `-left-[33px]`.
                    A change to any of them moves it. */}
                <span
                  aria-hidden="true"
                  className={`absolute top-1 -left-[33px] h-4 w-4 rounded-full border-2 border-saffron ${
                    now ? "bg-saffron" : "bg-paper"
                  }`}
                />
                <p className="font-semibold">{when}</p>
                <p className="text-muted">{what}</p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="har-du-en-foodtruck"
          className="flex flex-col gap-2 rounded-2xl bg-card p-5 shadow-sm"
        >
          <h2 id="har-du-en-foodtruck" className="text-xl font-semibold">
            Har du en foodtruck?
          </h2>
          <p>
            Det kostar ingenting att synas på kartan. Hör av dig om du vill vara med, vill rätta
            något eller vill bli borttagen:{" "}
            <a href={`mailto:${CONTACT}`} className="font-medium underline decoration-saffron decoration-2 underline-offset-4">
              {CONTACT}
            </a>
          </p>
        </section>

        <section
          aria-labelledby="bakom-vam"
          className="flex flex-col gap-3 border-t border-line pt-8"
        >
          <h2 id="bakom-vam" className="text-xl font-semibold">
            Bakom Väm
          </h2>
          <p>
            Väm byggs av Oliwer Karlsson, utvecklare i Göteborg, som ett eget projekt. Koden,
            besluten och misstagen på vägen finns öppet på{" "}
            <ExternalLink
              href={REPO_URL}
              className="underline decoration-saffron decoration-2 underline-offset-4"
            >
              GitHub
            </ExternalLink>
            .
          </p>
          {/* The owner's call on IS #483 (call 7): one line, deleted when it no longer holds. */}
          <p className="font-medium">Jag söker jobb som utvecklare. Hör gärna av dig!</p>
          <ul className="flex flex-wrap gap-3">
            {PROFILES.map(({ label, href }) => (
              <li key={label}>
                <ExternalLink
                  href={href}
                  className="inline-block rounded-full border-2 border-saffron px-4 py-1.5 text-sm font-medium"
                >
                  {label}
                </ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PublicShell>
  );
}
