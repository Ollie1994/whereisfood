import { describe, expect, it } from "vitest";
import { isSameOrigin, isWrite, redirectTo, requestOrigin } from "@/lib/http/origin";

// A request as `next dev` hands it over: `request.url` says `localhost` while the
// headers say what the browser used (Phase 7 plan, #16).
function request(headers: Record<string, string>, url = "http://localhost:3000/auth/logout") {
  return new Request(url, { method: "POST", headers });
}

describe("requestOrigin", () => {
  it("takes the host from Host, not from request.url", () => {
    expect(requestOrigin(request({ host: "127.0.0.1:3000" }))).toBe("http://127.0.0.1:3000");
  });

  it("prefers x-forwarded-host and x-forwarded-proto, as Vercel sends them", () => {
    const r = request({
      host: "internal:8080",
      "x-forwarded-host": "whereisfood-git-dev-where-is-food.vercel.app",
      "x-forwarded-proto": "https",
    });
    expect(requestOrigin(r)).toBe("https://whereisfood-git-dev-where-is-food.vercel.app");
  });

  it("takes the first entry of a list", () => {
    const r = request({ "x-forwarded-host": "a.example, b.example", "x-forwarded-proto": "https, http" });
    expect(requestOrigin(r)).toBe("https://a.example");
  });

  it("throws when there is no host at all", () => {
    expect(() => requestOrigin({ headers: new Headers() })).toThrow(/no Host header/);
  });
});

describe("isSameOrigin", () => {
  it("is true when Origin matches the host the request reached", () => {
    expect(isSameOrigin(request({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }))).toBe(true);
  });

  it("compares against the headers, so a localhost request.url doesn't refuse 127.0.0.1", () => {
    const r = request({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }, "http://localhost:3000/x");
    expect(isSameOrigin(r)).toBe(true);
  });

  it("is false for a foreign origin", () => {
    expect(isSameOrigin(request({ host: "127.0.0.1:3000", origin: "https://evil.example" }))).toBe(false);
  });

  it("is false for the same host on another scheme", () => {
    expect(isSameOrigin(request({ host: "127.0.0.1:3000", origin: "https://127.0.0.1:3000" }))).toBe(false);
  });

  it("is false with no Origin", () => {
    expect(isSameOrigin(request({ host: "127.0.0.1:3000" }))).toBe(false);
  });

  it("is false for Origin: null", () => {
    expect(isSameOrigin(request({ host: "127.0.0.1:3000", origin: "null" }))).toBe(false);
  });

  it("is false when the forwarded host differs from Origin", () => {
    const r = request({
      host: "127.0.0.1:3000",
      "x-forwarded-host": "whereisfood-git-dev-where-is-food.vercel.app",
      "x-forwarded-proto": "https",
      origin: "http://127.0.0.1:3000",
    });
    expect(isSameOrigin(r)).toBe(false);
  });
});

describe("redirectTo", () => {
  it("answers with the path as a relative Location and the status given", () => {
    const response = redirectTo("/admin/login?error=link", 303);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/login?error=link");
  });
});

describe("isWrite", () => {
  it.each([
    ["GET", false],
    ["HEAD", false],
    ["OPTIONS", false],
    ["POST", true],
    ["PATCH", true],
    ["PUT", true],
    ["DELETE", true],
  ])("%s → %s", (method, expected) => {
    expect(isWrite(method)).toBe(expected);
  });
});
