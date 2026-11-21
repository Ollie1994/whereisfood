import { describe, expect, it } from "vitest";
import { ADMIN_TITLE, SITE_TITLE, adminTitle, pageTitle } from "./titles";

// The owner's wording (IS #452, PR #477): a change here is a change the owner approves.
describe("titles", () => {
  it("puts the page's name first, then the app", () => {
    expect(SITE_TITLE).toBe("Väm | Var är maten i Göteborg");
    expect(pageTitle("Karta")).toBe("Karta | Väm | Var är maten i Göteborg");
    // The root layout's `title.template`: `%s` must come through as it is.
    expect(pageTitle("%s")).toBe("%s | Väm | Var är maten i Göteborg");
  });

  it("gives the admin its own, shorter suffix", () => {
    expect(ADMIN_TITLE).toBe("Admin | Väm");
    expect(adminTitle("Sidan finns inte")).toBe("Sidan finns inte | Admin | Väm");
  });
});
