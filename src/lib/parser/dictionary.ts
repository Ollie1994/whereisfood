import type { DictionaryEntry } from "@/lib/types";

// The Gothenburg location dictionary — the parser's primary matcher AND, by
// design decision (#3), its primary source of coordinates. A dictionary hit
// resolves to lat/lng with no network call at all; Nominatim is only the fallback
// for addresses this file does not know.
//
// Pure data module — no DB, no HTTP, no clock. Enforced by `purity.test.ts` in
// this directory, which globs the whole parser directory rather than trusting each
// file to guard itself.
//
// WHY ONLY SIXTEEN ENTRIES (plan decision #4)
//
// We have zero real caption data until trucks onboard in Phase 8. Past the obvious
// spots, every entry is a guess about where trucks park, and an unverified
// hand-entered coordinate is the acknowledged weakness of the
// dictionary-carries-coordinates design. A forty-entry dictionary would mean
// roughly twenty-five pins nobody has checked, carried indefinitely, several of
// them for places no truck will ever use. Seeding wide feels like progress and is
// actually just unreviewed data with a longer blast radius.
//
// The gap is covered from both sides: `extractAddressCandidate()` plus the geocode
// fallback pins novel spots at parse time, and `dictionary.test.ts` bounds-checks
// every entry here against the real `isInGothenburg`.
//
// HOW THESE COORDINATES WERE PRODUCED, AND WHAT `source` THEREFORE MEANS
//
// Every entry below came from `scripts/seed-dictionary.mjs`, which queries
// Nominatim once per location, throttled, with an identifying User-Agent. So every
// one is `source: "nominatim"` and re-running that script reproduces it.
//
// That is a deliberate reading of decision #4's "anything a human adjusts flips to
// `manual`". Four pins WERE adjusted during review — Lindholmen, Chalmers,
// Eriksberg and Mölndal all first resolved somewhere unhelpful — but the fix was
// to narrow the QUERY in the seeding script, not to retype the numbers here. The
// coordinate still comes from OSM and is still reproducible, which is exactly what
// `source` records. Flipping those to `manual` would tell a future reconciliation
// pass that a human placed the pin by eye, and that would be false.
//
// `manual` is therefore unused today, and that is the honest state rather than an
// oversight: no pin in this file has been checked against the kerb.
//
// KNOWN-COARSE ENTRIES. Four resolve to the centroid of a large area rather than a
// point a truck could park at — `heden` (a sports field several hundred metres
// across), `backaplan` and `molndal` (district and town centroids), and `garda`
// (a district). They are kept because the NAME is what captions will say and a
// coarse pin in the right neighbourhood beats no pin at all, but they are the
// first entries to revisit once real captions show where trucks actually stand.
// Recorded here rather than discovered later from a map that looks subtly wrong.
export const DICTIONARY: DictionaryEntry[] = [
  // --- Central squares ---
  {
    id: "jarntorget",
    match: ["Järntorget", "Jarntorget"],
    address: "Järntorget, Göteborg",
    lat: 57.6998935,
    lng: 11.952503,
    source: "nominatim",
    verified: false,
  },
  {
    id: "masthuggstorget",
    match: ["Masthuggstorget", "Masthugget"],
    address: "Masthuggstorget, Göteborg",
    lat: 57.6989475,
    lng: 11.9431712,
    source: "nominatim",
    verified: false,
  },
  {
    // "Kopparmärra" is the equestrian statue on the square and is what locals
    // arrange to meet at — a caption saying it means this place, not a monument.
    id: "kungsportsplatsen",
    match: ["Kungsportsplatsen", "Kopparmärra", "Kopparmarra"],
    address: "Kungsportsplatsen, Göteborg",
    lat: 57.7043702,
    lng: 11.9697598,
    source: "nominatim",
    verified: false,
  },
  {
    id: "linneplatsen",
    match: ["Linnéplatsen", "Linneplatsen"],
    address: "Linnéplatsen, Göteborg",
    lat: 57.6896696,
    lng: 11.9527459,
    source: "nominatim",
    verified: false,
  },
  {
    id: "brunnsparken",
    match: ["Brunnsparken"],
    address: "Brunnsparken, Göteborg",
    lat: 57.7068093,
    lng: 11.9691756,
    source: "nominatim",
    verified: false,
  },
  {
    // Both spellings are in everyday use; the square is named for Gustaf II Adolf
    // but "Gustav" is at least as common in casual writing.
    id: "gustaf-adolfs-torg",
    match: ["Gustaf Adolfs torg", "Gustav Adolfs torg"],
    address: "Gustaf Adolfs torg, Göteborg",
    lat: 57.7071709,
    lng: 11.9667895,
    source: "nominatim",
    verified: false,
  },

  // --- Office and campus clusters ---
  {
    // Pinned to Lindholmspiren, not the Hisingen district centroid — the offices
    // and the food-truck demand are on the pier, ~300 m from the centroid.
    id: "lindholmen",
    match: ["Lindholmen", "Lindholmspiren"],
    address: "Lindholmspiren, Göteborg",
    lat: 57.7066083,
    lng: 11.9409449,
    source: "nominatim",
    verified: false,
  },
  {
    // The Chalmers tram stop, which is the campus entrance. Querying the
    // university by name returns a node addressed in Masthugget instead.
    id: "chalmers",
    match: ["Chalmers", "Johanneberg"],
    address: "Chalmers, Johanneberg, Göteborg",
    lat: 57.6900225,
    lng: 11.9730927,
    source: "nominatim",
    verified: false,
  },
  {
    id: "garda",
    match: ["Gårda", "Garda"],
    address: "Gårda, Göteborg",
    lat: 57.7076306,
    lng: 11.9919384,
    source: "nominatim",
    verified: false,
  },
  {
    id: "heden",
    match: ["Heden"],
    address: "Heden, Göteborg",
    lat: 57.7024223,
    lng: 11.9789581,
    source: "nominatim",
    verified: false,
  },
  {
    id: "sahlgrenska",
    match: ["Sahlgrenska"],
    address: "Sahlgrenska universitetssjukhuset, Göteborg",
    lat: 57.6816542,
    lng: 11.9609871,
    source: "nominatim",
    verified: false,
  },
  {
    // The only entry outside Göteborgs Stad — Mölndal is its own municipality, but
    // it is contiguous with the city and inside the bounding box by design.
    id: "molndal",
    match: ["Mölndal", "Molndal"],
    address: "Mölndal",
    lat: 57.6564918,
    lng: 12.0153085,
    source: "nominatim",
    verified: false,
  },

  // --- Further hubs, held to the same "obvious spot" bar ---
  {
    id: "korsvagen",
    match: ["Korsvägen", "Korsvagen"],
    address: "Korsvägen, Göteborg",
    lat: 57.696839,
    lng: 11.9868284,
    source: "nominatim",
    verified: false,
  },
  {
    id: "nordstan",
    match: ["Nordstan"],
    address: "Nordstan, Göteborg",
    lat: 57.708627,
    lng: 11.9690951,
    source: "nominatim",
    verified: false,
  },
  {
    id: "backaplan",
    match: ["Backaplan"],
    address: "Backaplan, Göteborg",
    lat: 57.7234183,
    lng: 11.9524242,
    source: "nominatim",
    verified: false,
  },
  {
    // Pinned to Eriksbergstorget rather than the district centroid, same reason as
    // Lindholmen.
    id: "eriksberg",
    match: ["Eriksberg", "Eriksbergstorget"],
    address: "Eriksbergstorget, Göteborg",
    lat: 57.7002168,
    lng: 11.913744,
    source: "nominatim",
    verified: false,
  },
];
