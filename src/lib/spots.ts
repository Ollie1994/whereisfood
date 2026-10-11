// Known Gothenburg places a food truck parks at, with coordinates. The admin picks
// one of these when entering a location, and its `name` becomes the location's label.
//
// WHERE THE COORDINATES COME FROM. Every pin below was produced by
// `scripts/seed-dictionary.mjs` from OpenStreetMap, so re-running that script and
// diffing reproduces it. No pin here has been moved by hand or checked against the
// kerb. If you move one by hand, say so in a comment next to it: a re-run will not
// reproduce it, and must not overwrite it.
//
// KNOWN-COARSE PINS. Four sit at the centre of a large area rather than at a point a
// truck could park: `Heden` (a sports field several hundred metres across),
// `Backaplan` and `Mölndal` (district and town centres) and `Gårda` (a district).
// They are kept because the name is what people say, and the admin can still place
// the exact pin by map tap.
//
// EVERY field is `readonly`, and so is `SPOTS`. This is a module-level constant in a
// long-lived server process, so a mutation is not scoped to one request: it lasts for
// that instance, and shows up as a spot moving depending on what the server handled
// earlier. A partial `readonly` would read as protection while leaving the rest open.
export interface Spot {
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
}

export const SPOTS: readonly Spot[] = [
  // --- Central squares ---
  { name: "Järntorget", latitude: 57.6998935, longitude: 11.952503 },
  { name: "Masthuggstorget", latitude: 57.6989475, longitude: 11.9431712 },
  { name: "Kungsportsplatsen", latitude: 57.7043702, longitude: 11.9697598 },
  { name: "Linnéplatsen", latitude: 57.6896696, longitude: 11.9527459 },
  { name: "Brunnsparken", latitude: 57.7068093, longitude: 11.9691756 },
  { name: "Gustaf Adolfs torg", latitude: 57.7071709, longitude: 11.9667895 },

  // --- Office and campus clusters ---
  // Pinned to Lindholmspiren, not the Hisingen district centre: the offices and the
  // food-truck demand are on the pier, ~300 m away.
  { name: "Lindholmen", latitude: 57.7066083, longitude: 11.9409449 },
  // The Chalmers tram stop, which is the campus entrance.
  { name: "Chalmers", latitude: 57.6900225, longitude: 11.9730927 },
  { name: "Gårda", latitude: 57.7076306, longitude: 11.9919384 },
  { name: "Heden", latitude: 57.7024223, longitude: 11.9789581 },
  { name: "Sahlgrenska", latitude: 57.6816542, longitude: 11.9609871 },
  // The only spot outside Göteborgs Stad. Mölndal is its own municipality, but it is
  // contiguous with the city and inside the bounding box by design.
  { name: "Mölndal", latitude: 57.6564918, longitude: 12.0153085 },

  // --- Further hubs, held to the same "obvious spot" bar ---
  { name: "Korsvägen", latitude: 57.696839, longitude: 11.9868284 },
  { name: "Nordstan", latitude: 57.708627, longitude: 11.9690951 },
  { name: "Backaplan", latitude: 57.7234183, longitude: 11.9524242 },
  // Pinned to Eriksbergstorget rather than the district centre, same reason as
  // Lindholmen.
  { name: "Eriksberg", latitude: 57.7002168, longitude: 11.913744 },
];
