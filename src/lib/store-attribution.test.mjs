import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyStoreAttribution,
  CAMPAIGN_STORAGE_KEY,
  campaignFromSearch,
  campaignFromStorage,
  withStoreCampaign,
} from "./store-attribution.ts";

const APP_STORE = "https://apps.apple.com/app/fluxo-learn-remember/id6825772359";
const PLAY = "https://play.google.com/store/apps/details?id=today.fluxo.app";
const CAMPAIGN = { source: "x", medium: "social", campaign: "x-1117-intro" };

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    values,
  };
};

const page = (hrefs) => {
  const anchors = hrefs.map((href) => ({ href }));
  return {
    anchors,
    querySelectorAll: () =>
      anchors.filter((anchor) => /apps\.apple\.com|play\.google\.com/.test(anchor.href)),
  };
};

describe("campaignFromSearch", () => {
  it("reads the campaign a /go link puts on the landing", () => {
    assert.deepEqual(
      campaignFromSearch("?utm_source=x&utm_medium=social&utm_campaign=x-1117-intro"),
      CAMPAIGN,
    );
  });

  it("needs both a source and a campaign, and refuses values a store would cut or reject", () => {
    assert.equal(campaignFromSearch("?utm_source=x"), null);
    assert.equal(campaignFromSearch("?utm_campaign=x-1"), null);
    assert.equal(campaignFromSearch(`?utm_source=x&utm_campaign=${"a".repeat(41)}`), null);
    assert.equal(campaignFromSearch("?utm_source=x&utm_campaign=has%20space"), null);
    assert.equal(campaignFromSearch(""), null);
  });
});

describe("campaignFromStorage", () => {
  it("reads back what was stored and ignores anything else", () => {
    assert.deepEqual(campaignFromStorage(JSON.stringify(CAMPAIGN)), CAMPAIGN);
    assert.equal(campaignFromStorage("not json"), null);
    assert.equal(campaignFromStorage(JSON.stringify({ source: "x" })), null);
    assert.equal(campaignFromStorage(null), null);
  });
});

describe("withStoreCampaign", () => {
  it("puts the campaign where each store reads it", () => {
    assert.equal(
      withStoreCampaign(`${APP_STORE}?pt=128157357`, CAMPAIGN),
      `${APP_STORE}?pt=128157357&ct=x-1117-intro&mt=8`,
    );
    const play = new URL(withStoreCampaign(PLAY, CAMPAIGN));
    assert.equal(play.searchParams.get("id"), "today.fluxo.app");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(play.searchParams.get("referrer") ?? "")), {
      utm_source: "x",
      utm_medium: "social",
      utm_campaign: "x-1117-intro",
    });
  });

  it("leaves every other link alone and replaces an older campaign", () => {
    assert.equal(withStoreCampaign("https://fluxo.today/blog/", CAMPAIGN), "https://fluxo.today/blog/");
    assert.equal(withStoreCampaign("not a url", CAMPAIGN), "not a url");
    assert.equal(
      new URL(withStoreCampaign(`${APP_STORE}?ct=old`, CAMPAIGN)).searchParams.get("ct"),
      "x-1117-intro",
    );
  });
});

describe("applyStoreAttribution", () => {
  it("rewrites the store buttons and remembers the campaign for the visit", () => {
    const storage = memoryStorage();
    const doc = page([APP_STORE, PLAY, "https://fluxo.today/"]);

    const applied = applyStoreAttribution(
      { location: { search: "?utm_source=x&utm_medium=social&utm_campaign=x-1117-intro" }, sessionStorage: storage },
      doc,
    );

    assert.deepEqual(applied, CAMPAIGN);
    assert.match(doc.anchors[0].href, /ct=x-1117-intro/);
    assert.match(doc.anchors[1].href, /referrer=/);
    assert.equal(doc.anchors[2].href, "https://fluxo.today/");
    assert.equal(storage.values.get(CAMPAIGN_STORAGE_KEY), JSON.stringify(CAMPAIGN));
  });

  it("uses the campaign of the visit on a later page without one in the URL", () => {
    const storage = memoryStorage({ [CAMPAIGN_STORAGE_KEY]: JSON.stringify(CAMPAIGN) });
    const doc = page([APP_STORE]);

    applyStoreAttribution({ location: { search: "" }, sessionStorage: storage }, doc);

    assert.match(doc.anchors[0].href, /ct=x-1117-intro/);
  });

  it("changes nothing for a visitor who did not come from a tracked link", () => {
    const doc = page([APP_STORE]);
    assert.equal(applyStoreAttribution({ location: { search: "" }, sessionStorage: memoryStorage() }, doc), null);
    assert.equal(doc.anchors[0].href, APP_STORE);
  });

  it("still rewrites the page when storage is switched off", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const doc = page([APP_STORE]);
    applyStoreAttribution({ location: { search: "?utm_source=x&utm_campaign=c1" }, sessionStorage: broken }, doc);
    assert.match(doc.anchors[0].href, /ct=c1/);
  });
});
