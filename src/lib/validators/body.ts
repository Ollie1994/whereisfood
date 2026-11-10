// What the location and truck validators share: the result type, the body's shape check,
// the refusal, and the two texts about the body as a whole.

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export const BODY_ERRORS = {
  body: "Begärans innehåll måste vara ett objekt",
  emptyPatch: "Ändringen innehåller inget att ändra",
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });
