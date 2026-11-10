// A copy of `source` with only the keys `keys` lists: the columns a write may send. Typed
// `T`: `keys` names every key of `T`, so each key `source` must have is copied. Why a
// write needs it, and why the list is a `Record`: `locations.ts`, above its `INSERT_KEYS`.
export function pick<T extends object>(source: T, keys: Record<keyof T, true>): T {
  const picked = {} as T;
  for (const key of Object.keys(keys) as (keyof T)[]) {
    if (key in source) picked[key] = source[key];
  }
  return picked;
}
