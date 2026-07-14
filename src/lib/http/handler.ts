import { NextResponse } from "next/server";

// Wraps a route handler so any UNEXPECTED throw is mapped to a 500 { error }
// response instead of escaping to Next's default error handler — keeping every
// route compliant with the API error format ({ "error": message }, no stack
// traces). Expected failures are still RETURNED by the handler (400/401 via
// errorResponse) and pass through untouched: this catch only intercepts genuine
// exceptions (e.g. a DB error thrown by the db layer), never a returned response.
//
// Every API route should wrap its body in this — see CLAUDE.md "API responses".
export async function withErrorHandling(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    console.error("[api] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
