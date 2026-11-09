import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_TITLE_LENGTH, withBrandSuffix } from "./page-title.ts";

describe("withBrandSuffix", () => {
  it("appends the brand when the result fits", () => {
    assert.equal(withBrandSuffix("What is Safe to Spend?", "Dzing"), "What is Safe to Spend? — Dzing");
  });

  it("drops the brand when it would push the title past the limit", () => {
    const title = "Best Anki Add-ons for Beginners: 5 Essential Tools to Learn";
    const result = withBrandSuffix(title, "Fluxo");
    assert.equal(result, title);
  });

  it("keeps a branded title exactly at the limit", () => {
    const base = "a".repeat(MAX_TITLE_LENGTH - " — Dzing".length);
    assert.equal(withBrandSuffix(base, "Dzing").length, MAX_TITLE_LENGTH);
  });

  it("strips suffixes already present before deciding", () => {
    assert.equal(withBrandSuffix("Sinking funds — Dzing | Dzing", "Dzing"), "Sinking funds — Dzing");
  });
});
