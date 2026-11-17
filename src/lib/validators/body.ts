// What the location and truck validators share: the result type, the body's shape check,
// the refusal, the length check, and the two texts about the body as a whole.

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
// call, IS #379; pinned in `truck.test.ts`). A limit: a letter typed as a base and a
// combining mark (an NFD "å") counts two. No text, null, is never over.
export function tooLong(text: string | null, max: number): boolean {
  return text !== null && Array.from(text).length > max;
}
