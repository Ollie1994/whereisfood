// Dev-only, one-off — NOT part of the app bundle and NOT on any runtime path.
//
// Queries Nominatim once per seed location and prints `DictionaryEntry` stubs for
// `src/lib/parser/dictionary.ts`. Plan decision #4: script output is the STARTING
// POINT for a human review, never the finished dictionary.
//
// WHY THIS IS A SCRIPT AND NOT A MIGRATION OR A RUNTIME LOOKUP
//
// The dictionary is the parser's primary source of coordinates — a dictionary hit
// resolves to lat/lng with no network call at all, and Nominatim is only the
// fallback for addresses the dictionary does not know (#3). So these coordinates
// are baked in at author time, and this script exists to make that authoring cheap
// rather than to make it automatic.
//
// THE REVIEW STEP IS THE POINT. A square's Nominatim centroid is frequently NOT
// where a truck parks — Nominatim returns the centre of an OSM way, or the node an
// administrative area is labelled from, which for a large open square can sit tens
// of metres from the kerb trucks actually stand on. Entries left as the script
// found them keep `source: "nominatim"`; anything moved by hand flips to
// `source: "manual"`. That field is provenance, so a later reconciliation pass can
// tell "nobody has checked this" from "a human placed this deliberately".
//
// USAGE (PowerShell or bash):
//   node scripts/seed-dictionary.mjs                 # all seeds
//   node scripts/seed-dictionary.mjs --only heden    # one, by id substring
//   node scripts/seed-dictionary.mjs --json          # raw hits, for debugging a bad pin
//
// POLITENESS. Nominatim's usage policy caps automated clients at 1 request per
// second and requires an identifying User-Agent carrying a contact address. Both
// are honoured below. This makes ~17 requests, once, from a developer machine —
// the kind of use the policy permits, but only while it stays throttled, so the
// delay is deliberately not exposed as a flag.

const CONTACT = "https://github.com/Ollie1994/whereisfood";
const USER_AGENT = "whereisfood-dictionary-seeder/1.0 (" + CONTACT + ")";
const THROTTLE_MS = 1100; // > 1s, with headroom for timer granularity.
const TIMEOUT_MS = 10_000;

// The Gothenburg viewbox as a QUERY HINT. Nominatim wants west,north,east,south,
// which is a different order from our own box. These numbers are a copy of
// `GOTHENBURG_BBOX` in `src/lib/geo.ts`, which is the authority.
//
// A copy is tolerable here in a way it would not be in app code, and the reason is
// worth stating rather than assumed: this is a `.mjs` script and `geo.ts` is
// TypeScript, so importing it means a loader this one-off does not justify. More
// importantly the copy CANNOT silently pass a bad pin — `dictionary.test.ts`
// validates every committed entry with the real `isInGothenburg`, so drift here
// costs a re-run, not a wrong coordinate in production. The test is the gate.
const VIEWBOX = "11.6,57.85,12.2,57.5";

// The seed set from plan decision #4: the central squares, plus the office and
// campus clusters that actually generate food-truck demand.
//
// DELIBERATELY NOT BROADER. We have zero real caption data until Phase 8, so past
// the obvious spots every entry is a guess about where trucks park, and an
// unverified hand-entered coordinate is the acknowledged weakness of the
// dictionary-carries-coordinates design. A 40-entry seed would mean ~25 pins
// nobody has checked, carried indefinitely, several for spots no truck will use.
// The geocode fallback (#3) covers novel locations; this covers the common ones.
//
// `query` is what Nominatim is asked. `match` is the STARTING alias list — the
// forms a caption might plausibly use, including the ones Swedes routinely write
// without the diacritic. Both get reviewed by hand; the script only fills in
// coordinates and the address string.
//
// SEVERAL QUERIES ARE DELIBERATELY NARROWER THAN THE PLACE NAME, and that is the
// review from the first run baked back in rather than left as a manual patch.
// Asking for a district returns the district's CENTROID, which for Lindholmen and
// Eriksberg is several hundred metres from the square people mean — so the query
// names the square. Fixing it here rather than editing coordinates in
// `dictionary.ts` keeps every committed pin reproducible by re-running this file,
// which is what lets those entries honestly stay `source: "nominatim"`.
const SEEDS = [
  // --- Central squares ---
  { id: "jarntorget", query: "Järntorget, Göteborg", match: ["Järntorget", "Jarntorget"] },
  { id: "masthuggstorget", query: "Masthuggstorget, Göteborg", match: ["Masthuggstorget", "Masthugget"] },
  { id: "kungsportsplatsen", query: "Kungsportsplatsen, Göteborg", match: ["Kungsportsplatsen", "Kopparmärra", "Kopparmarra"] },
  { id: "linneplatsen", query: "Linnéplatsen, Göteborg", match: ["Linnéplatsen", "Linneplatsen"] },
  { id: "brunnsparken", query: "Brunnsparken, Göteborg", match: ["Brunnsparken"] },
  { id: "gustaf-adolfs-torg", query: "Gustaf Adolfs torg, Göteborg", match: ["Gustaf Adolfs torg", "Gustav Adolfs torg"] },

  // --- Office and campus clusters ---
  // "Lindholmen" alone resolves to the Hisingen district centroid, ~300 m inland
  // from the pier the Science Park offices sit on. The pier is the destination.
  { id: "lindholmen", query: "Lindholmspiren, Göteborg", match: ["Lindholmen", "Lindholmspiren"] },
  // "Chalmers tekniska högskola" resolves to a node addressed on Andréegatan in
  // Masthugget — a confusing result to carry as an address. The tram stop is the
  // campus entrance and the reference point a caption means by "Chalmers".
  { id: "chalmers", query: "Chalmers, Johanneberg, Göteborg", match: ["Chalmers", "Johanneberg"] },
  { id: "garda", query: "Gårda, Göteborg", match: ["Gårda", "Garda"] },
  { id: "heden", query: "Heden, Göteborg", match: ["Heden"] },
  { id: "sahlgrenska", query: "Sahlgrenska universitetssjukhuset, Göteborg", match: ["Sahlgrenska"] },
  // "Mölndals centrum" returns Mölndalsvägen — a road in Gothenburg, not Mölndal.
  // Naming the county pins the town itself.
  { id: "molndal", query: "Mölndal, Västra Götalands län", match: ["Mölndal", "Molndal"] },

  // --- Further hubs, held to the same "obvious spot" bar ---
  { id: "korsvagen", query: "Korsvägen, Göteborg", match: ["Korsvägen", "Korsvagen"] },
  { id: "nordstan", query: "Nordstan, Göteborg", match: ["Nordstan"] },
  { id: "backaplan", query: "Backaplan, Göteborg", match: ["Backaplan"] },
  // As with Lindholmen: the district centroid is not the square.
  { id: "eriksberg", query: "Eriksbergstorget, Göteborg", match: ["Eriksberg", "Eriksbergstorget"] },
];

// NOT SEEDED, and the reason is worth keeping next to the list that excludes it.
//
// Volvo Torslanda is a real food-truck destination — thousands of shift workers —
// but there is no honest pin for it. "Torslanda" resolves to the residential
// district ~6 km from the plant, and "Volvo Cars Torslanda" resolves to the
// centroid of an industrial landuse polygon roughly a kilometre across, which is
// the middle of the factory rather than any gate a truck could park at. Both are
// exactly the unverified guess decision #4 declines to carry. The geocode fallback
// (#3) covers it if a real caption ever names it, and a real caption is also what
// would tell us WHICH gate — so this is deferred to evidence, not dropped.

function parseArgs(argv) {
  const args = { only: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") {
      // A trailing `--only` reads `undefined` off the end of argv. Left
      // unchecked that is falsy, so the filter below is skipped, the
      // "no seed matches" guard never fires, and asking for ONE lookup
      // quietly runs all sixteen against Nominatim — the opposite of what
      // the flag was reached for, and rude to a free service.
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--only needs a seed id (e.g. --only heden)");
      }
      args.only = value;
      i++;
    } else if (argv[i] === "--json") {
      args.json = true;
    }
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function lookup(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "se");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "sv" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("HTTP " + response.status);

  const hits = await response.json();
  return hits.length > 0 ? hits[0] : null;
}

// Nominatim returns lat/lon as STRINGS. Converting here rather than at the print
// site is the same trap `isInGothenburg`'s `Number.isFinite` guard exists for: a
// string coordinate compares plausibly and prints plausibly, and only misbehaves
// once it has reached the database.
function printEntry(seed, hit) {
  const matches = seed.match.map((m) => JSON.stringify(m)).join(", ");
  console.log("  {");
  console.log("    id: " + JSON.stringify(seed.id) + ",");
  console.log("    match: [" + matches + "],");
  console.log("    address: " + JSON.stringify(hit.display_name) + ",");
  console.log("    lat: " + Number(hit.lat) + ",");
  console.log("    lng: " + Number(hit.lon) + ",");
  console.log('    source: "nominatim",');
  console.log("    verified: false,");
  console.log("  },");
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    // A usage mistake deserves the one line that fixes it, not a stack trace
    // through node's ESM loader.
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const seeds = args.only
    ? SEEDS.filter((seed) => seed.id.includes(args.only.toLowerCase()))
    : SEEDS;

  if (seeds.length === 0) {
    console.error("No seed id matches --only " + args.only);
    process.exitCode = 1;
    return;
  }

  const failures = [];
  console.log("// Generated by scripts/seed-dictionary.mjs — REVIEW EVERY PIN BEFORE COMMITTING.");
  console.log("// A square's centroid is often not where trucks park; adjusted entries flip source to \"manual\".");

  for (const [index, seed] of seeds.entries()) {
    if (index > 0) await sleep(THROTTLE_MS);
    try {
      const hit = await lookup(seed.query);
      if (!hit) {
        failures.push(seed.id + ': no result for "' + seed.query + '"');
        continue;
      }
      if (args.json) {
        console.log("// " + seed.id);
        console.log(JSON.stringify(hit, null, 2));
      } else {
        printEntry(seed, hit);
      }
    } catch (error) {
      failures.push(seed.id + ": " + error.message);
    }
  }

  // stderr, so a partial run still pipes clean stubs to a file while the problems
  // stay visible in the terminal.
  if (failures.length > 0) {
    console.error("\n" + failures.length + " lookup(s) failed:");
    for (const failure of failures) console.error("  - " + failure);
    process.exitCode = 1;
  }
}

await main();
