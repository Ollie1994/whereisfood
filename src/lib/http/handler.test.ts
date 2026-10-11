import { afterEach, describe, expect, it, vi } from "vitest";
import { withErrorHandling } from "@/lib/http/handler";

describe("withErrorHandling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a returned response through untouched, including an expected error", async () => {
    const returned = Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

    const response = await withErrorHandling(async () => returned);

    expect(response).toBe(returned);
  });

  it.each([
    ["a rejected promise", () => Promise.reject(new Error("db exploded: secret detail"))],
    [
      "a synchronous throw",
      () => {
        throw new Error("db exploded: secret detail");
      },
    ],
  ])("maps %s to a 500 { error } without leaking the message", async (_label, handler) => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await withErrorHandling(handler as () => Promise<Response>);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });
});
