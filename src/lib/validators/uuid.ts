// 8-4-4-4-12 hex — accepts any UUID version. NOT a strict v4 regex: the seed
// trucks use all-'1' UUIDs (version nibble 1), which a v4-only pattern would
// reject. Used to validate an id's shape before it reaches the DB layer, where a
// malformed value would otherwise surface as a Postgres 22P02 invalid-uuid error.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
