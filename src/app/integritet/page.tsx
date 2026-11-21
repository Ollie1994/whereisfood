import type { Metadata } from "next";
import Link from "next/link";
import { ABOUT_PATH } from "@/lib/paths";

// The privacy note (Phase 10 plan, step 9, #8): what is stored, why and for how long, and the
// removal contact (open decision 4). Static, Swedish (CLAUDE.md, UI Rules), in `/om`'s column
// on a phone, widened from `md` up to a reading width (`max-w-2xl`), each part a `<section>`. The
// owner approved its text (IS #456, PR #476); "senast inom en månad" is GDPR's one month to
// answer a request (art. 12(3)). Where each fact comes from, so a change there is a change here:
// - the periods: `supabase/manual/retention.sql` (52 weeks after `ends_at`, 30 days of
//   `auth.audit_log_entries`, nothing from `trucks`, whose row only `takedown.sql` deletes),
//   run weekly (`RUNBOOK.md`, "The weekly routine");
// - the purpose of old places: plan #10 (the checklist's look-back and the recent places);
// - the backups: README, "Backups" (the newest 4 weekly dumps of `public`: `trucks`,
//   `locations`, `users`, the admin's id);
// - the incident caps and the export (`auth` rows and `public.trucks`): `RUNBOOK.md`, "The
//   weekly routine" and "Exporting evidence"; the old project's 8 weeks after any restore: "A
//   restore" (the owner's calls on IS #457);
// - the admin's account, sessions and MFA challenges (`ip_address`): `retention.sql` trims none of
//   `auth.users`, `auth.sessions` and `auth.mfa_challenges`, so the account's life bounds them;
// - the takedown: `RUNBOOK.md`, "A takedown request" (the reply gives the latest date the
//   copies keep it; the request mail kept until no copy from before the takedown is left, so a
//   later date can be told); other requests' mail: "Other requests";
// - the right to object stated on its own: GDPR art. 21(4), for "berättigat intresse";
// - the hosts: `src/lib/http/csp.ts` (R2's tiles, `protomaps.github.io`'s glyphs and sprites;
//   no public page calls Supabase from the browser, only the admin's login);
// - the transfers: vercel.com/legal/privacy-policy, cloudflare.com/cloudflare-customer-dpa (6.4)
//   and GitHub's General Privacy Statement each say it complies with the EU-U.S. Data Privacy
//   Framework; supabase.com/legal/dpa names the EU SCCs (2021/914), not the DPF;
// - the logs: no period, the providers' terms as the criterion (art. 13(2)(a)). Vercel Hobby
//   states 1 hour of runtime logs and 12 hours of Observability, none for its Firewall's traffic
//   view, which shows client IPs; Supabase Free states 1 day for its API and database logs, and
//   "Auth Audit Logs: 24 hours" on its pricing page without saying which logs. None of these pages
//   names an IP field, hence "kan innehålla". All read 2026-11-21, on the plans in use until Phase
//   11.
export const metadata: Metadata = {
  title: "Integritet",
};

const CONTACT = "vararmaten@proton.me";

export default function PrivacyPage() {
  return (
    <main
      className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 py-6 md:max-w-2xl md:px-8 md:py-12"
    >
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">Integritet</h1>
        <p className="md:text-lg">
          Väm visar var Göteborgs foodtruckar står i dag. Här står vilka uppgifter
          tjänsten sparar, varför och hur länge, och hur du får dem borttagna.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Foodtruckarna</h2>
        <p>
          För varje foodtruck sparas namn, Instagramkonto, typ av mat och en kort beskrivning. För
          varje plats sparas var den ligger (koordinater och ibland ett namn på platsen), när den
          börjar och slutar, om den har ställts in, när den lades in och när den senast ändrades,
          och vem som lade in den. Uppgifterna kommer från foodtruckarnas egna inlägg på Instagram
          och läggs in för hand. Inget hämtas automatiskt. Databasen ligger hos Supabase, som anger
          EU-kommissionens standardavtalsklausuler för överföringar utanför EU.
        </p>
        <p>
          Syftet är att visa var foodtruckarna står i dag. Kartan visar bara dagens platser. Äldre
          platser sparas för att administratören ska se vilka foodtruckar som brukar stå ute samma
          veckodag, och för att det ska gå snabbare att lägga in en foodtruck som kommer tillbaka
          till samma ställen.
        </p>
        <p>
          Många foodtruckar drivs av en enskild person, så uppgifterna kan vara personuppgifter. De
          behandlas med stöd av berättigat intresse: att visa allmänheten var foodtruckarna står,
          med uppgifter som foodtruckarna själva har publicerat.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Besökare</h2>
        <p>
          Du behöver inget konto, och tjänsten sätter inga egna kakor. Sidorna levereras av Vercel,
          och kartan hämtar kartbilder från Cloudflare och kartans text och symboler från GitHub. De
          ser din IP-adress, och deras loggar kan innehålla den. Hur länge styrs av deras egna
          villkor. Alla tre är amerikanska företag, så din IP-adress kan föras över till USA. Alla
          tre anger att de följer EU–USA-ramverket för dataskydd (Data Privacy Framework).
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Administratören</h2>
        <p>
          Bara administratören loggar in. För kontot sparar inloggningstjänsten (Supabase Auth) en
          logg över inloggningar och andra händelser, med IP-adress och e-postadress, för att det
          ska gå att utreda om kontot har kapats. Supabases loggar över inloggningen kan också
          innehålla administratörens IP-adress.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Hur länge uppgifterna sparas</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Foodtruckens namn, Instagramkonto, typ av mat och beskrivning sparas tills foodtrucken
            ber om att bli borttagen.
          </li>
          <li>En plats raderas 52 veckor efter att den har slutat.</li>
          <li>
            Inloggningsloggen raderas efter 30 dagar. Administratörens konto, med e-postadress,
            sparas så länge kontot finns. Uppgifter om pågående inloggningar och försök att
            verifiera inloggningen, med IP-adress, sparas som längst lika länge.
          </li>
          <li>
            Raderingen körs en gång i veckan, så det som ska raderas kan finnas kvar upp till en
            vecka längre.
          </li>
          <li>
            Varje vecka sparas en säkerhetskopia av tjänstens databas (foodtruckarna, deras platser
            och administratörens användar-id) på administratörens dator. De fyra senaste behålls, så
            det som raderas finns kvar i säkerhetskopiorna i ungefär fyra veckor till.
            Säkerhetskopiorna innehåller inte administratörens logg.
          </li>
          <li>
            Om databasen någon gång måste återställas i ett nytt projekt, av vilken anledning som
            helst, raderas det gamla senast 8 veckor efter återställningen.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Vid en säkerhetsincident</h2>
        <p>
          Om administratörens konto har kapats eller en nyckel har läckt kan några av tiderna bli
          längre:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Den veckovisa raderingen väntar tills administratörens logg har sparats för utredningen,
            som mest 8 veckor.
          </li>
          <li>
            Säkerhetskopiorna från före incidenten sparas undan. De raderas när incidenten är
            avslutad, och senast 8 veckor efter att de sparades undan.
          </li>
          <li>
            En kopia av administratörens logg och inloggningar, med IP-adresser och e-postadresser,
            och av uppgifterna om foodtruckarna sparas tillsammans med dem och raderas samtidigt.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold md:text-xl">Få uppgifter borttagna</h2>
        <p>
          Mejla{" "}
          <a className="underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . Varje begäran om borttagning följs, så snart som möjligt och senast inom en månad,
          oavsett om foodtrucken drivs som företag eller av en enskild person. Foodtrucken och alla
          dess platser raderas då på en gång. De finns kvar i säkerhetskopiorna i ungefär fyra
          veckor. Vid en säkerhetsincident eller en återställning kan kopior av databasen finnas
          kvar längre, se ovan. Svaret du får säger till vilket datum. Mejlet sparas tills
          uppgifterna har försvunnit även ur kopiorna, så att du kan få veta om det skulle dröja
          längre, och raderas sedan. Om en säkerhetskopia någon gång återställs, raderas foodtrucken
          igen som en del av återställningen.
        </p>
        <p>
          Du har rätt att invända mot att uppgifterna behandlas. En invändning mot att en foodtrucks
          uppgifter behandlas hanteras som en begäran om borttagning.
        </p>
        <p>
          Du kan också mejla för att få veta vilka uppgifter som finns om dig, få dem rättade eller
          få behandlingen begränsad. Andra mejl raderas när ärendet är avslutat. Du har rätt att
          klaga hos Integritetsskyddsmyndigheten (IMY).
        </p>
        <p>Personuppgiftsansvarig: Oliwer Karlsson, som nås på {CONTACT}.</p>
      </section>

      {/* SOFT-LAUNCH GATE (Phase 10 plan #5): to `/om` while `/karta` is gated, as "Till
          startsidan", the 404 page's wording (PR #469); to "Till kartan" and `/karta` at the full
          launch (the removal list in `src/app/karta/page.tsx`). */}
      <Link href={ABOUT_PATH} className="text-sm underline">
        Till startsidan
      </Link>
    </main>
  );
}
