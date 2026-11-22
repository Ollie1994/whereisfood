// A Postgres error's code, which the db layer lets through unchanged (`CLAUDE.md`, "db
// layer"), for the services that turn one into a reason.
export function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}

// A constraint's name in the error's message: `23514` is every CHECK's code and `23505`
// every unique index's, so the name tells which one refused.
export function namesConstraint(error: unknown, name: string): boolean {
  return String((error as { message?: unknown } | null)?.message).includes(name);
}
