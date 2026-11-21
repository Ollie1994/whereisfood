import type { Metadata } from "next";

// The privacy note (Phase 10 plan, step 9, #8): what is stored, why and for how long, and the
// removal contact (open decision 4). Static, Swedish (CLAUDE.md, UI Rules), in `/about`'s column.
// The owner approved this text on IS #456 (2026-11-21). Where each fact comes from, so a change
// there is a change here:
// - the periods: `supabase/manual/retention.sql` (52 weeks after `ends_at`, 30 days of
//   `auth.audit_log_entries`), run weekly (`RUNBOOK.md`, "The weekly routine");
// - the backups: README, "Backups" (the newest 4 weekly dumps, `public` only);
// - the incident caps and the export: `RUNBOOK.md`, "The weekly routine", "Exporting evidence"
//   and "A restore" (the owner's calls on IS #457);
// - the takedown: `RUNBOOK.md`, "A takedown request" (gone from the map within about three
//   minutes; the reply gives the latest date the backups keep it);
// - the hosts: `src/lib/http/csp.ts` (R2's tiles, `protomaps.github.io`'s glyphs and sprites);
// - the logs' "at most a day": Vercel Hobby's runtime logs 1 hour (vercel.com/docs/logs/runtime,
//   "Limits") and Observability data 12 hours (vercel.com/docs/observability/
//   observability-plus, "Limitations"); Supabase Free's API and database logs 1 day
//   (supabase.com/docs/guides/telemetry/logs). All read 2026-11-21, on the plans in use until
//   Phase 11; neither names an IP field, hence "kan innehålla".
export const metadata: Metadata = {
  title: "Integritet | Var är maten?",
};

const CONTACT = "vararmaten@proton.me";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Integritet</h1>
      <p>
        Var är maten? visar var Göteborgs foodtruckar står i dag. Här står vilka uppgifter tjänsten
        sparar, varför och hur länge, och hur du får dem borttagna.
      </p>

      <h2 className="text-lg font-semibold">Foodtruckarna</h2>
      <p>
        För varje foodtruck sparas namn, Instagramkonto, typ av mat och en kort beskrivning. För
        varje plats sparas var den ligger (koordinater och ibland ett namn på platsen), när den
        börjar och slutar, om den har ställts in och när den senast ändrades. Uppgifterna kommer
        från foodtruckarnas egna inlägg på Instagram och läggs in för hand. Inget hämtas
        automatiskt.
      </p>
      <p>
        Syftet är att visa var foodtruckarna står i dag. Kartan visar bara dagens platser. Äldre
        platser sparas för att det ska gå snabbare att lägga in en foodtruck som kommer tillbaka
        till samma ställen.
      </p>
      <p>
        Många foodtruckar drivs av en enskild person, så uppgifterna kan vara personuppgifter. De
        behandlas med stöd av berättigat intresse: att visa allmänheten var foodtruckarna står,
        med uppgifter som foodtruckarna själva har publicerat.
      </p>

      <h2 className="text-lg font-semibold">Besökare</h2>
      <p>
        Du behöver inget konto, och tjänsten sätter inga egna kakor. Sidorna levereras av Vercel
        och uppgifterna hämtas från Supabase. Deras loggar över förfrågningar kan innehålla din
        IP-adress. De loggar tjänsten kan se hos dem sparas i högst ett dygn. Kartan hämtar
        kartbilder från Cloudflare och kartans text och symboler från GitHub, som då också ser din
        IP-adress. Vercel, Supabase, Cloudflare och GitHub kan dessutom spara uppgifter enligt
        sina egna villkor.
      </p>

      <h2 className="text-lg font-semibold">Administratören</h2>
      <p>
        Bara administratören loggar in. För kontot sparar inloggningstjänsten (Supabase Auth) en
        logg över inloggningar och andra händelser, med IP-adress och e-postadress, för att det ska
        gå att utreda om kontot har kapats.
      </p>

      <h2 className="text-lg font-semibold">Hur länge uppgifterna sparas</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>En plats raderas 52 veckor efter att den har slutat.</li>
        <li>Administratörens logg raderas efter 30 dagar.</li>
        <li>
          Raderingen körs en gång i veckan, så det som ska raderas kan finnas kvar upp till en vecka
          längre.
        </li>
        <li>
          Varje vecka sparas en säkerhetskopia av uppgifterna om foodtruckarna och deras platser på
          administratörens dator. De fyra senaste behålls, så det som raderas finns kvar i
          säkerhetskopiorna i ungefär fyra veckor till. Säkerhetskopiorna innehåller inte
          administratörens logg.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Vid en säkerhetsincident</h2>
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
          sparas tillsammans med dem och raderas samtidigt.
        </li>
        <li>
          Om databasen måste återställas i ett nytt projekt raderas det gamla senast 8 veckor efter
          återställningen.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Få uppgifter borttagna</h2>
      <p>
        Mejla{" "}
        <a className="underline" href={`mailto:${CONTACT}`}>
          {CONTACT}
        </a>
        . Varje begäran om borttagning följs, oavsett om foodtrucken drivs som företag eller av en
        enskild person. Foodtrucken och alla dess platser raderas då på en gång och försvinner från
        kartan inom några minuter. De finns kvar i säkerhetskopiorna i ungefär fyra veckor, eller
        längre vid en säkerhetsincident, och svaret du får säger till vilket datum. Om en
        säkerhetskopia någon gång återställs, raderas foodtrucken igen som en del av
        återställningen.
      </p>
      <p>
        Du kan också mejla för att få veta vilka uppgifter som finns om dig, eller för att få dem
        rättade. Du har rätt att klaga hos Integritetsskyddsmyndigheten (IMY).
      </p>
      <p>Personuppgiftsansvarig: Oliwer Karlsson, som nås på {CONTACT}.</p>
    </main>
  );
}
