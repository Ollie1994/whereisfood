// What the location and truck validators share: the result type, the body's shape check,
// the refusal, the length and character checks, and the two texts about the body as a whole.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const BODY_ERRORS = {
  body: "Begärans innehåll måste vara ett objekt",
  emptyPatch: "Ändringen innehåller inget att ändra",
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

// Whether a text is over `max` characters, counted as Unicode code points (the string's
// iterator), not `.length`'s UTF-16 units: "🍔" counts one (Phase 9 plan step 3, the owner's
// call, IS #379; pinned in `truck.test.ts` and `location.test.ts`). A limit: what a reader
// sees as one character can be several code points, each counted: an NFD "å" 2, "👍🏽" 2, a
// flag such as "🇸🇪" 2, a family emoji "👨‍👩‍👧" 5 (`Array.from` in Node, PR #399). No text,
// null, is never over. `.length` settles a text at most `max` units or over `2 × max`
// without counting; the tests at those edges failed when the first was widened or the
// second narrowed, and when the count's `>` became `>=` (PR #399's controls). The text
// is still parsed and trimmed whole before this: `readJson` sets no size cap of its own
// (`admin.ts`).
export function tooLong(text: string | null, max: number): boolean {
  if (text === null || text.length <= max) return false;
  if (text.length > 2 * max) return true;
  return Array.from(text).length > max;
}

// Whether a text holds a character the database refuses: a NUL (U+0000) or a lone UTF-16
// surrogate, which the db layer throws on (probed in PR #399 through `updateTruck` and
// `updateLocation`: `22P05` for `"a\u0000b"`, `PGRST102` for `"a\ud800b"` and
// `"a\udc00b"`; `"a\u0001b"` was stored). With the `u` flag a surrogate pair is one code
// point, so an emoji passes and only a lone half matches `\p{Surrogate}`. Not
// `isWellFormed`: it runs in the browser too (`admin-trucks.ts`), and Firefox has it from
// 119, below Next's target of 111 (`modern-browserslist-target.js`; PR #402). Other control
// characters pass (IS #400's non-goal).
const UNSTORABLE = /\u0000|\p{Surrogate}/u;

export function unstorable(text: string): boolean {
  return UNSTORABLE.test(text);
}
